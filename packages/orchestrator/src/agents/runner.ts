// 단일 에이전트 실행기 — Anthropic Messages API + tool loop + emit_result
//
// 흐름:
//   1) agent_runs INSERT (status=running) + events: progress
//   2) Anthropic messages.create with tools=[...mcpTools, emit_<agent>]
//   3) tool_use 응답을 받으면 invokeTool() 로 실행, tool_result 로 다시 messages.create
//   4) emit_<agent> tool_use 발생 시 → input 을 payload 로 채택, posts INSERT, events: completion
//   5) max_turns 초과 / API 에러 → failRun + events: error

import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  AGENT_PAYLOAD_SCHEMAS, type AgentId, type CompanyProfile, type Program,
} from "@gov/shared";
import { getAgent } from "./loader.js";
import { buildAnthropicTools, invokeTool } from "./toolBridge.js";
import { createRun, completeRun, failRun, type AgentRunRow } from "../board/runs.js";
import { createPost } from "../board/posts.js";
import { appendEvent } from "../board/events.js";
import { estimateCostKrw } from "../lib/cost.js";
import { isMockMode, mockPayload } from "./mock.js";

const MAX_TURNS = 8;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정");
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface RunAgentInput {
  caseId: string;
  agentId: AgentId;
  profile: CompanyProfile;
  program: Program;
}

export interface RunAgentResult {
  run: AgentRunRow;
  postId: string | null;
  payload: unknown;
  ok: boolean;
  error?: string;
}

function buildEmitTool(agentId: AgentId): { name: string; description: string; input_schema: any } {
  const schema = AGENT_PAYLOAD_SCHEMAS[agentId];
  const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" });
  // strip $schema/$ref
  const clone = JSON.parse(JSON.stringify(jsonSchema));
  delete clone.$schema;
  delete clone.$ref;
  if (clone.type !== "object") {
    throw new Error(`Agent ${agentId} payload schema is not an object`);
  }
  return {
    name: `emit_result`,
    description: "최종 결과를 구조화된 JSON 으로 반환한다. 이 도구는 정확히 1회 호출하고, 호출 후에는 더 이상 텍스트를 출력하지 않는다.",
    input_schema: clone,
  };
}

function renderUserMessage(profile: CompanyProfile, program: Program): string {
  return `## 회사 프로파일
- 회사명: ${profile.companyName}
- 업종: ${profile.industry} (${profile.industryCode ?? "코드 미상"})
- 직원수: ${profile.employeeCount}명
- 매출: ${profile.annualRevenueKrw.toLocaleString("ko-KR")} 원
- 설립연도: ${profile.foundedYear}
- 지역: ${profile.region}
- 단계: ${profile.stage}
- 키워드: ${profile.keywords.join(", ") || "(없음)"}
- 보유 인증: ${profile.certifications.join(", ") || "(없음)"}
${profile.bizRegNo ? `- 사업자번호: ${profile.bizRegNo}` : ""}

## 대상 공고
- 제목: ${program.title}
- 주관: ${program.agency ?? "정보 없음"}
- 지역: ${program.region ?? "전국"}
- 마감: ${program.deadline ?? "상시"}
- 분야: ${program.field ?? "기타"}
- URL: ${program.url ?? "(없음)"}

### 공고 본문
${program.rawText}

위 정보를 기반으로 작업을 수행하고, 마지막에 emit_result 도구로 최종 결과를 반환하세요.`;
}

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const { caseId, agentId, profile, program } = input;
  const { def, systemPrompt } = getAgent(agentId);
  const modelLabel = isMockMode() ? "mock" : def.model;
  const run = createRun(caseId, agentId, modelLabel);

  appendEvent({ caseId, runId: run.id, agentId, kind: "progress", payload: { stage: "started", model: modelLabel } });

  // ── Mock 모드: ANTHROPIC_API_KEY 없을 때 결정론적 더미 응답 ────────
  if (isMockMode()) {
    try {
      // 시연용 1.5~3초 인공 지연
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
      const payload = mockPayload(agentId, profile, program);
      const schema = AGENT_PAYLOAD_SCHEMAS[agentId];
      const parsed = schema.parse(payload);
      completeRun(run.id, 0, 0, 0);
      const title = def.post_title_template.replace("{programTitle}", program.title);
      const bodyMd = buildBody(agentId, parsed);
      const post = createPost({ caseId, runId: run.id, agentId, title, bodyMd, payload: parsed });
      appendEvent({ caseId, runId: run.id, agentId, kind: "completion", payload: { postId: post.id, mock: true } });
      return { run, postId: post.id, payload: parsed, ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failRun(run.id, msg);
      appendEvent({ caseId, runId: run.id, agentId, kind: "error", payload: { error: msg } });
      return { run, postId: null, payload: null, ok: false, error: msg };
    }
  }

  const client = getClient();
  const mcpTools = buildAnthropicTools(def.tool_names);
  const emitTool = buildEmitTool(agentId);
  const allTools = [...mcpTools, emitTool];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: renderUserMessage(profile, program) },
  ];

  let totalIn = 0;
  let totalOut = 0;
  let payload: unknown = null;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const resp = await client.messages.create({
        model: def.model,
        max_tokens: def.max_tokens,
        temperature: def.temperature,
        system: systemPrompt,
        tools: allTools,
        messages,
      });

      totalIn += resp.usage.input_tokens;
      totalOut += resp.usage.output_tokens;

      // assistant turn 을 messages 에 보존
      messages.push({ role: "assistant", content: resp.content });

      const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

      if (toolUses.length === 0) {
        // 텍스트로만 끝남 → emit_result 누락. 강제 종료.
        throw new Error("emit_result 호출 없이 모델이 종료함");
      }

      // emit_result 가 포함되면 거기서 payload 추출하고 종료
      const emitCall = toolUses.find(t => t.name === "emit_result");
      if (emitCall) {
        payload = emitCall.input;
        break;
      }

      // 나머지 도구 호출 → 모두 실행하고 tool_result 메시지 push
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        appendEvent({
          caseId, runId: run.id, agentId, kind: "tool_call",
          payload: { toolName: tu.name, input: tu.input },
        });
        const result = await invokeTool(tu.name, tu.input);
        appendEvent({
          caseId, runId: run.id, agentId, kind: "tool_result",
          payload: { toolName: tu.name, ok: !(result as any)?.ok || true, summary: summarizeResult(result) },
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result).slice(0, 30_000),
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    if (payload === null) throw new Error(`max_turns(${MAX_TURNS}) 초과 — emit_result 미호출`);

    // payload Zod 검증
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
    const post = createPost({
      caseId, runId: run.id, agentId, title, bodyMd, payload,
    });

    appendEvent({
      caseId, runId: run.id, agentId, kind: "completion",
      payload: { postId: post.id, costKrw: cost, tokensIn: totalIn, tokensOut: totalOut },
    });

    return { run, postId: post.id, payload, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failRun(run.id, msg);
    appendEvent({ caseId, runId: run.id, agentId, kind: "error", payload: { error: msg } });
    return { run, postId: null, payload: null, ok: false, error: msg };
  }
}

function summarizeResult(r: unknown): string {
  if (!r) return "(빈 결과)";
  const json = JSON.stringify(r);
  return json.length > 200 ? json.slice(0, 200) + "..." : json;
}

function buildBody(agentId: AgentId, p: any): string {
  switch (agentId) {
    case "eligibility":
      return [
        `## 결론: ${p.verdict} (${p.score}점)`,
        ``,
        `### 충족 요건`,
        ...p.matchedCriteria.map((s: string) => `- ${s}`),
        ``,
        `### 미충족 요건`,
        ...p.unmetCriteria.map((s: string) => `- ${s}`),
        ``,
        p.uncertain.length ? `### 보류\n${p.uncertain.map((s: string) => `- ${s}`).join("\n")}\n` : "",
        `### 권고`,
        p.recommendation,
        ``,
        `### 근거`,
        p.reasoning,
      ].filter(Boolean).join("\n");
    case "plan-draft":
      return [
        `### 요약 (3줄)`,
        p.summary3line,
        ``,
        `## P. 문제 인식`, p.problem,
        ``, `## S. 실현 가능성`, p.solution,
        ``, `## S. 성장 전략`, p.scaleUp,
        ``, `## T. 팀 구성`, p.team,
        p.warnings?.length ? `\n> ⚠ 경고\n${p.warnings.map((w: string) => `- ${w}`).join("\n")}` : "",
      ].join("\n");
    case "doc-checklist":
      const fmtItem = (d: any) => `| ${d.nameKo} | ${d.issuer} | ${d.status === "ready" ? "✅" : d.status === "todo" ? "📝" : "❓"} | ${d.note ?? ""} |`;
      return [
        `### 필수 서류`,
        `| 서류명 | 발급기관 | 상태 | 비고 |`,
        `|---|---|---|---|`,
        ...p.required.map(fmtItem),
        ``,
        p.optional.length ? `### 선택 서류\n| 서류명 | 발급기관 | 상태 | 비고 |\n|---|---|---|---|\n${p.optional.map(fmtItem).join("\n")}` : "",
        ``,
        p.recommended.length ? `### 권장 서류\n| 서류명 | 발급기관 | 상태 | 비고 |\n|---|---|---|---|\n${p.recommended.map(fmtItem).join("\n")}` : "",
        ``,
        `**제출 방법**: ${p.submissionMethod}`,
      ].filter(Boolean).join("\n");
    case "milestone":
      return [
        `**마감일**: ${p.deadline} (총 ${p.totalDays}일)`,
        ``,
        `| 시점 | 단계 | 담당 | 산출물 |`,
        `|---|---|---|---|`,
        ...p.milestones.map((m: any) =>
          `| D-${m.daysBeforeDeadline} (${m.date}) | ${m.titleKo} | ${m.owner} | ${m.deliverables.join(", ")} |`,
        ),
        ``,
        `### 핵심 경로`,
        p.criticalPathNotes,
      ].join("\n");
  }
}
