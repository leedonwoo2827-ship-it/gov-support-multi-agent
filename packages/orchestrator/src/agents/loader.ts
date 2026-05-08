// 4개 에이전트 JSON 정의 + 한국어 프롬프트 파일 로드

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentDefinitionSchema, type AgentDefinition, type AgentId } from "@gov/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
// orchestrator/src/agents → orchestrator/agents (선언) / orchestrator/prompts (프롬프트)
const ROOT = join(__dirname, "..", "..");

function loadDef(file: string): AgentDefinition {
  const raw = JSON.parse(readFileSync(join(ROOT, "agents", file), "utf8"));
  return AgentDefinitionSchema.parse(raw);
}

function loadPrompt(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

const _cache: Partial<Record<AgentId, { def: AgentDefinition; systemPrompt: string }>> = {};

export function getAgent(id: AgentId): { def: AgentDefinition; systemPrompt: string } {
  if (_cache[id]) return _cache[id]!;
  const fileMap: Record<AgentId, string> = {
    eligibility: "eligibility.json",
    "plan-draft": "plan-draft.json",
    "doc-checklist": "doc-checklist.json",
    milestone: "milestone.json",
  };
  const def = loadDef(fileMap[id]);
  const systemPrompt = loadPrompt(def.system_prompt_path);
  const entry = { def, systemPrompt };
  _cache[id] = entry;
  return entry;
}

export const ALL_AGENT_IDS: AgentId[] = ["eligibility", "plan-draft", "doc-checklist", "milestone"];
