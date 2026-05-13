// 4개 에이전트 JSON 정의 + 한국어 프롬프트 파일 로드
// system_prompt_path 는 string (레거시) 또는 Record<dept, string> (부서별 분기).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentDefinitionSchema, type AgentDefinition, type AgentId, type Department,
} from "@gov/shared";

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

function resolvePromptPath(
  spec: AgentDefinition["system_prompt_path"],
  department: Department | undefined,
): string {
  if (typeof spec === "string") return spec;
  const dept = department ?? "default";
  return spec[dept] ?? spec["default"] ?? Object.values(spec)[0];
}

const _cache = new Map<string, { def: AgentDefinition; systemPrompt: string }>();

const FILE_MAP: Record<AgentId, string> = {
  eligibility: "eligibility.json",
  "plan-draft": "plan-draft.json",
  "doc-checklist": "doc-checklist.json",
  milestone: "milestone.json",
};

export function getAgent(
  id: AgentId,
  department?: Department,
): { def: AgentDefinition; systemPrompt: string } {
  const key = `${id}:${department ?? "default"}`;
  const cached = _cache.get(key);
  if (cached) return cached;

  const def = loadDef(FILE_MAP[id]);
  const promptPath = resolvePromptPath(def.system_prompt_path, department);
  const systemPrompt = loadPrompt(promptPath);
  const entry = { def, systemPrompt };
  _cache.set(key, entry);
  return entry;
}

export const ALL_AGENT_IDS: AgentId[] = ["eligibility", "plan-draft", "doc-checklist", "milestone"];
