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
  AGENT_PAYLOAD_SCHEMAS, type AgentId, type CompanyProfile, type Program, type Department,
} from "@gov/shared";
import { getAgent } from "./loader.js";
import { buildAnthropicTools, invokeTool } from "./toolBridge.js";
import { createRun, completeRun, failRun, type AgentRunRow } from "../board/runs.js";
import { createPost } from "../board/posts.js";
import { appendEvent } from "../board/events.js";
import { estimateCostKrw } from "../lib/cost.js";
import { isMockMode, mockPayload } from "./mock.js";
import { getAnthropicKey } from "../board/settings.js";
import { getAwardStatsByAgency } from "../board/awards.js";
import { getKoicaContractStats, getKoicaContractGlobalStats } from "../board/koicaContracts.js";

const MAX_TURNS = 8;

function getClient(): Anthropic {
  const apiKey = getAnthropicKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정 — 설정 페이지에서 입력하세요.");
  return new Anthropic({ apiKey });
}

export interface RunAgentInput {
  caseId: string;
  agentId: AgentId;
  profile: CompanyProfile;
  program: Program;
  department?: Department;
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

/**
 * 가격경쟁력 축 입력용 시장 컨텍스트 — eligibility / plan-draft 에이전트에 주입.
 *
 * - edu: 발주처별 G2B 낙찰 통계 (낙찰률·낙찰업체).
 * - oda: KOICA 수의계약 통계 (분야 매칭 키워드별 평균 계약금액·주요 파트너).
 *
 * 데이터 미수집 시에도 그 사실을 명시적으로 알려 LLM 이 "데이터 미상 — 보류" 로 처리하게 함.
 */
function renderMarketContext(agentId: AgentId, profile: CompanyProfile, program: Program, dept?: Department): string | null {
  if (agentId !== "eligibility" && agentId !== "plan-draft") return null;
  if (dept === "edu" && program.agency) {
    try {
      const agencyKey = program.agency.slice(0, Math.min(program.agency.length, 4));
      const s = getAwardStatsByAgency(agencyKey, "edu");
      if (!s || s.avgRate === null) {
        return `## 시장 컨텍스트 — 가격경쟁력 축\n- 발주처 "${program.agency}" 의 G2B 낙찰 통계 미수집 (실데이터 적재 전).\n- 점수는 보류 또는 시장 평균 가정으로 산출하고, 그 사실을 reasoning 에 명시할 것.`;
      }
      const winners = s.topWinners.slice(0, 3).map(w => `${w.name}(${w.count}건)`).join(", ") || "—";
      return `## 시장 컨텍스트 — 가격경쟁력 축
발주처 "${program.agency}" 최근 G2B 낙찰 통계 (LIKE "${agencyKey}", category=edu):
- 표본: ${s.count}건
- 평균 낙찰률: ${s.avgRate.toFixed(1)}% (min ${s.minRate?.toFixed(1) ?? "?"} / max ${s.maxRate?.toFixed(1) ?? "?"})
- 평균 참가업체수: ${s.avgParticipants?.toFixed(1) ?? "?"} 개사
- 평균 낙찰금액: ${s.avgAmt ? `${(s.avgAmt / 1e8).toFixed(2)}억` : "?"}
- 주요 낙찰업체: ${winners}

해석 지침: 낙찰률 90%↑ = 가격 경쟁 약함(가점 가능), 80%↓ = 가격 경쟁 치열(감점). 주요 낙찰업체에 회사명이 있으면 가점.`;
    } catch {
      return null;
    }
  }
  if (dept === "oda") {
    // 분야/사업명 키워드로 KOICA 수의계약 통계 매칭
    const candidates: string[] = [];
    if (program.field) candidates.push(program.field);
    if (program.title) {
      const firstWords = program.title.split(/\s+/).filter(w => w.length >= 2).slice(0, 2);
      candidates.push(...firstWords);
    }
    let matched: ReturnType<typeof getKoicaContractStats> = null;
    for (const kw of candidates) {
      try {
        const s = getKoicaContractStats(kw);
        if (s && s.count > 0) { matched = s; break; }
      } catch { /* ignore */ }
    }
    if (!matched) {
      try {
        const g = getKoicaContractGlobalStats();
        if (g.count === 0) {
          return `## 시장 컨텍스트 — ODA 가격경쟁력 축\n- KOICA 수의계약 데이터 미수집 (실데이터 적재 전).\n- 점수는 보류 또는 시장 평균 가정으로 산출하고, 그 사실을 reasoning 에 명시할 것.`;
        }
        const winners = g.topContractors.slice(0, 3).map(w => `${w.name}(${w.count}건)`).join(", ") || "—";
        return `## 시장 컨텍스트 — ODA 가격경쟁력 축
- 분야 "${program.field ?? program.title}" 와 매칭되는 KOICA 수의계약 사례 부재.
- 일반/제한경쟁 트랙 검토 권고.
- KOICA 전체 수의 ${g.count}건 평균 ${g.avgAmt ? `${(g.avgAmt / 1e8).toFixed(2)}억` : "?"} / 주요 파트너: ${winners}`;
      } catch {
        return null;
      }
    }
    const winners = matched.topContractors.slice(0, 5).map(w => `${w.name}(${w.count}건)`).join(", ") || "—";
    const samples = matched.recentSamples.slice(0, 3)
      .map(r => `  - ${r.date ?? "-"} · ${r.name ?? "?"} · ${r.amount ? `${(r.amount / 1e8).toFixed(2)}억` : "?"} · ${r.nm ?? ""}`)
      .join("\n");
    const topShare = matched.topContractors.length > 0 ? matched.topContractors[0].count / matched.count : 0;
    return `## 시장 컨텍스트 — ODA 가격경쟁력 축
KOICA 수의계약 통계 (매칭 키워드 "${matched.keyword}"):
- 표본: ${matched.count}건
- 평균 계약금액: ${matched.avgAmt ? `${(matched.avgAmt / 1e8).toFixed(2)}억` : "?"} (min ${matched.minAmt ? `${(matched.minAmt / 1e8).toFixed(2)}억` : "?"} / max ${matched.maxAmt ? `${(matched.maxAmt / 1e8).toFixed(2)}억` : "?"})
- 주요 수의 파트너 (Top 5): ${winners}
- 상위 파트너 집중도: ${(topShare * 100).toFixed(0)}%
- 최근 사례:
${samples}

해석 지침: 분야 매칭 표본이 많고 파트너가 다양(집중도 < 50%) → 진입 가능성 ↑. 표본이 적거나(<2) 1개 파트너 독점 → 일반/제한경쟁 트랙으로 우회 권고. 주요 파트너에 회사명("${profile.companyName}")이 있으면 기존 수의 이력 가점.`;
  }
  return null;
}

function renderUserMessage(profile: CompanyProfile, program: Program, agentId: AgentId, dept?: Department): string {
  const market = renderMarketContext(agentId, profile, program, dept);
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
${market ? `\n${market}\n` : ""}
위 정보를 기반으로 작업을 수행하고, 마지막에 emit_result 도구로 최종 결과를 반환하세요.`;
}

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const { caseId, agentId, profile, program, department } = input;
  const dept = department ?? profile.department;
  const { def, systemPrompt } = getAgent(agentId, dept);

  // ── Provider 분기 ─────────────────────────────────────────────────
  // mock 우선 (둘 다 키 없으면), 그 다음 def.provider 에 따라 분기
  if (isMockMode()) {
    return runMockAgent(input, def, systemPrompt);
  }

  if (def.provider === "gemini") {
    const { runGeminiAgent } = await import("./runner-gemini.js");
    return runGeminiAgent({
      caseId, agentId, def, systemPrompt, profile, program,
      userMessage: renderUserMessage(profile, program, agentId, dept),
      buildBody,
    });
  }

  // 기본: Anthropic
  return runAnthropicAgent(input, def, systemPrompt, dept);
}

async function runMockAgent(input: RunAgentInput, def: any, _systemPrompt: string): Promise<RunAgentResult> {
  const { caseId, agentId, profile, program } = input;
  const run = createRun(caseId, agentId, "mock");
  appendEvent({ caseId, runId: run.id, agentId, kind: "progress", payload: { stage: "started", model: "mock" } });
  try {
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

async function runAnthropicAgent(input: RunAgentInput, def: any, systemPrompt: string, dept?: Department): Promise<RunAgentResult> {
  const { caseId, agentId, profile, program } = input;
  const run = createRun(caseId, agentId, def.model);
  appendEvent({ caseId, runId: run.id, agentId, kind: "progress", payload: { stage: "started", model: def.model, provider: "anthropic" } });

  const client = getClient();
  const mcpTools = buildAnthropicTools(def.tool_names);
  const emitTool = buildEmitTool(agentId);
  const allTools = [...mcpTools, emitTool];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: renderUserMessage(profile, program, agentId, dept) },
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
