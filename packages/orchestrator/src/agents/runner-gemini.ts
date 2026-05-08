// Gemini 에이전트 실행기 — @google/generative-ai SDK + function calling + emit_result
//
// runner.ts 의 Anthropic 구현과 같은 인터페이스. provider:'gemini' 인 에이전트만 사용.

import { GoogleGenerativeAI, SchemaType, FunctionCallingMode } from "@google/generative-ai";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  AGENT_PAYLOAD_SCHEMAS, type AgentId, type AgentDefinition,
  type CompanyProfile, type Program,
} from "@gov/shared";
import { buildAnthropicTools, invokeTool } from "./toolBridge.js";
import { createRun, completeRun, failRun, type AgentRunRow } from "../board/runs.js";
import { createPost } from "../board/posts.js";
import { appendEvent } from "../board/events.js";
import { estimateCostKrw } from "../lib/cost.js";
import { getGeminiKey } from "../board/settings.js";

const MAX_TURNS = 8;

/**
 * JSON Schema (Anthropic 호환) → Gemini Schema 변환.
 * Gemini SDK 의 Schema 는 OpenAPI 3.0 의 subset. 대부분 그대로 작동하지만
 * type 을 SchemaType enum 으로 변환해야 함.
 */
function toGeminiSchema(jsonSchema: any): any {
  if (!jsonSchema || typeof jsonSchema !== "object") return jsonSchema;

  const result: any = {};
  if (jsonSchema.type) {
    const t = jsonSchema.type;
    result.type = (
      {
        string: SchemaType.STRING,
        number: SchemaType.NUMBER,
        integer: SchemaType.INTEGER,
        boolean: SchemaType.BOOLEAN,
        array: SchemaType.ARRAY,
        object: SchemaType.OBJECT,
      } as Record<string, any>
    )[t] ?? SchemaType.STRING;
  } else {
    result.type = SchemaType.OBJECT;
  }

  if (jsonSchema.description) result.description = jsonSchema.description;
  if (jsonSchema.enum) result.enum = jsonSchema.enum;
  if (jsonSchema.format) result.format = jsonSchema.format;
  if (jsonSchema.nullable) result.nullable = jsonSchema.nullable;

  if (jsonSchema.properties) {
    result.properties = {} as Record<string, any>;
    for (const [k, v] of Object.entries(jsonSchema.properties)) {
      result.properties[k] = toGeminiSchema(v);
    }
  }
  if (jsonSchema.required) result.required = jsonSchema.required;
  if (jsonSchema.items) result.items = toGeminiSchema(jsonSchema.items);

  return result;
}

function buildEmitDeclaration(agentId: AgentId) {
  const schema = AGENT_PAYLOAD_SCHEMAS[agentId];
  const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" });
  return {
    name: "emit_result",
    description: "최종 결과를 구조화된 JSON 으로 반환한다. 정확히 1회 호출 후 종료.",
    parameters: toGeminiSchema(jsonSchema),
  };
}

export interface RunGeminiInput {
  caseId: string;
  agentId: AgentId;
  def: AgentDefinition;
  systemPrompt: string;
  profile: CompanyProfile;
  program: Program;
  userMessage: string;
  buildBody: (agentId: AgentId, payload: any) => string;
}

export interface RunGeminiResult {
  run: AgentRunRow;
  postId: string | null;
  payload: unknown;
  ok: boolean;
  error?: string;
}

export async function runGeminiAgent(input: RunGeminiInput): Promise<RunGeminiResult> {
  const { caseId, agentId, def, systemPrompt, program, userMessage, buildBody } = input;

  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY 미설정 — 설정 페이지에서 입력하세요.");

  const run = createRun(caseId, agentId, `gemini:${def.model}`);
  appendEvent({ caseId, runId: run.id, agentId, kind: "progress", payload: { stage: "started", model: def.model, provider: "gemini" } });

  // Anthropic-호환 tools 변환 → Gemini functionDeclarations
  const anthropicTools = buildAnthropicTools(def.tool_names);
  const mcpDecls = anthropicTools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: toGeminiSchema(t.input_schema),
  }));
  const emitDecl = buildEmitDeclaration(agentId);
  const allDecls = [...mcpDecls, emitDecl];

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: def.model,
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations: allDecls } as any],
    toolConfig: {
      functionCallingConfig: { mode: FunctionCallingMode.ANY },
    },
    generationConfig: {
      temperature: def.temperature,
      maxOutputTokens: def.max_tokens,
    },
  });

  const chat = model.startChat();

  let totalIn = 0;
  let totalOut = 0;
  let payload: unknown = null;

  try {
    let response = await chat.sendMessage(userMessage);

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const usage = response.response.usageMetadata;
      if (usage) {
        totalIn += usage.promptTokenCount ?? 0;
        totalOut += usage.candidatesTokenCount ?? 0;
      }

      const fnCalls = response.response.functionCalls() ?? [];

      if (fnCalls.length === 0) {
        const text = response.response.text();
        throw new Error(`emit_result 호출 없이 종료. 응답: ${text.slice(0, 200)}`);
      }

      const emitCall = fnCalls.find((c: any) => c.name === "emit_result");
      if (emitCall) {
        payload = emitCall.args;
        break;
      }

      // 일반 도구 호출 — 모두 실행 후 functionResponse 들로 다음 턴
      const fnResponses = await Promise.all(
        fnCalls.map(async (call: any) => {
          appendEvent({
            caseId, runId: run.id, agentId, kind: "tool_call",
            payload: { toolName: call.name, input: call.args },
          });
          const result = await invokeTool(call.name, call.args);
          appendEvent({
            caseId, runId: run.id, agentId, kind: "tool_result",
            payload: { toolName: call.name, summary: JSON.stringify(result).slice(0, 200) },
          });
          return {
            functionResponse: {
              name: call.name,
              response: result as any,
            },
          };
        }),
      );
      response = await chat.sendMessage(fnResponses);
    }

    if (payload === null) throw new Error(`max_turns(${MAX_TURNS}) 초과 — emit_result 미호출`);

    // Zod 검증
    const schema = AGENT_PAYLOAD_SCHEMAS[agentId];
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`emit_result 페이로드 스키마 불일치: ${JSON.stringify(parsed.error.flatten())}`);
    }
    payload = parsed.data;

    const cost = estimateCostKrw(def.model, totalIn, totalOut);
    completeRun(run.id, totalIn, totalOut, cost);

    const title = def.post_title_template.replace("{programTitle}", program.title);
    const bodyMd = buildBody(agentId, payload);
    const post = createPost({ caseId, runId: run.id, agentId, title, bodyMd, payload });

    appendEvent({
      caseId, runId: run.id, agentId, kind: "completion",
      payload: { postId: post.id, costKrw: cost, tokensIn: totalIn, tokensOut: totalOut, provider: "gemini" },
    });

    return { run, postId: post.id, payload, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failRun(run.id, msg);
    appendEvent({ caseId, runId: run.id, agentId, kind: "error", payload: { error: msg, provider: "gemini" } });
    return { run, postId: null, payload: null, ok: false, error: msg };
  }
}
