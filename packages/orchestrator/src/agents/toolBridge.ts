// Anthropic tool-use → @gov/mcp-tools 함수 직접 호출 브리지

import {
  CheckEligibilitySchema, handleCheckEligibility,
  EvaluateStartupSchema, handleEvaluateStartup,
  DraftBusinessPlanSchema, handleDraftBusinessPlan,
  GenerateDocumentChecklistSchema, handleGenerateDocumentChecklist,
  BuildApplicationTimelineSchema, handleBuildApplicationTimeline,
  SearchGovSupportSchema, searchGovernmentSupport,
  TOOL_META,
} from "@gov/mcp-tools";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodSchema } from "zod";

interface ToolDef {
  schema: ZodSchema<any>;
  handler: (input: any) => Promise<unknown>;
  description: string;
}

function getApiKeys() {
  return {
    bizinfoApiKey: process.env["BIZINFO_API_KEY"]?.trim() || undefined,
    smes24Token: process.env["SMES24_API_KEY"]?.trim() || undefined,
    publicDataServiceKey: process.env["PUBLIC_DATA_SERVICE_KEY"]?.trim() || undefined,
  };
}

const TOOLS: Record<string, ToolDef> = {
  checkEligibility: {
    schema: CheckEligibilitySchema,
    handler: input => handleCheckEligibility(input),
    description: TOOL_META.checkEligibility.description,
  },
  evaluateStartupApplication: {
    schema: EvaluateStartupSchema,
    handler: input => handleEvaluateStartup(input),
    description: TOOL_META.evaluateStartupApplication.description,
  },
  draftBusinessPlan: {
    schema: DraftBusinessPlanSchema,
    handler: input => handleDraftBusinessPlan(input),
    description: TOOL_META.draftBusinessPlan.description,
  },
  generateDocumentChecklist: {
    schema: GenerateDocumentChecklistSchema,
    handler: input => handleGenerateDocumentChecklist(input),
    description: TOOL_META.generateDocumentChecklist.description,
  },
  buildApplicationTimeline: {
    schema: BuildApplicationTimelineSchema,
    handler: input => handleBuildApplicationTimeline(input),
    description: TOOL_META.buildApplicationTimeline.description,
  },
  searchGovernmentSupport: {
    schema: SearchGovSupportSchema,
    handler: input => searchGovernmentSupport(input, getApiKeys()),
    description: TOOL_META.searchGovernmentSupport.description,
  },
};

export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: any;
}

/**
 * 에이전트가 사용할 tool 이름들을 받아 Anthropic Messages API 의 tools[] 배열로 변환.
 */
export function buildAnthropicTools(toolNames: string[]): AnthropicToolDef[] {
  return toolNames.map(name => {
    const t = TOOLS[name];
    if (!t) throw new Error(`Unknown tool: ${name}`);
    const schema = zodToJsonSchema(t.schema, { target: "openApi3" });
    // Anthropic 은 input_schema 의 최상위 type 이 "object" 여야 함
    const cleaned = sanitizeForAnthropic(schema);
    return {
      name,
      description: t.description,
      input_schema: cleaned,
    };
  });
}

function sanitizeForAnthropic(schema: any): any {
  // zod-to-json-schema 가 $schema, $ref, definitions 등 추가하는 것을 정리
  if (!schema || typeof schema !== "object") return schema;
  const clone = JSON.parse(JSON.stringify(schema));
  delete clone.$schema;
  delete clone.$ref;
  // 최상위가 object 가 아니면 강제로 wrap
  if (clone.type !== "object") {
    return { type: "object", properties: {}, additionalProperties: true };
  }
  return clone;
}

/**
 * 도구 이름과 입력으로 실제 핸들러 호출. 입력 검증 포함.
 */
export async function invokeTool(name: string, input: unknown): Promise<unknown> {
  const t = TOOLS[name];
  if (!t) throw new Error(`Unknown tool: ${name}`);
  const parsed = t.schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "입력 검증 실패", details: parsed.error.flatten() };
  }
  try {
    return await t.handler(parsed.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
