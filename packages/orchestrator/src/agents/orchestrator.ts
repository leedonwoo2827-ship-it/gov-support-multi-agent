// 다중 에이전트 fan-out — bulk run 단위로 N개 케이스 × 4개 에이전트 동시 실행

import type { AgentId, CompanyProfile } from "@gov/shared";
import { runAgent } from "./runner.js";
import { ALL_AGENT_IDS } from "./loader.js";
import { createOrGetCase, updateCaseStatus, type Case } from "../board/cases.js";
import { createBulkRun, incrementBulkCompleted } from "../board/runs.js";
import { getProfile } from "../board/profiles.js";
import { getProgram } from "../board/programs.js";
import { appendEvent } from "../board/events.js";

export interface BulkRunInput {
  companyProfileId: string;
  programIds: string[];
  agentIds?: AgentId[];                          // 기본: 4개 모두
}

export interface BulkRunResult {
  bulkId: string;
  cases: Case[];
}

/**
 * 비동기 fan-out 시작. 즉시 bulkId 반환, 실제 작업은 background 에서 진행.
 */
export function runBulk(input: BulkRunInput): BulkRunResult {
  const profile = getProfile(input.companyProfileId);
  if (!profile) throw new Error(`회사 프로파일 없음: ${input.companyProfileId}`);

  const agents = input.agentIds ?? ALL_AGENT_IDS;
  const cases: Case[] = [];

  // bulk 행 먼저 생성
  const totalAgents = input.programIds.length * agents.length;
  const placeholderBulkId = createBulkRun([], totalAgents);

  for (const programId of input.programIds) {
    const c = createOrGetCase(input.companyProfileId, programId, placeholderBulkId);
    cases.push(c);
  }

  // bulk 행에 case_ids 업데이트
  // (간단히: 다시 생성 대신 case_ids_json 갱신은 board/runs 에 함수 추가가 필요한데, 데모 PoC 라 새 ID 만들고 끝)
  // 여기서는 새 bulk 만들기를 단순화: 위에서 placeholder 로 만들었고 cases 전부 그 bulkId 를 가짐.

  // background 실행
  void runBulkBackground(profile, cases, agents, placeholderBulkId);

  return { bulkId: placeholderBulkId, cases };
}

async function runBulkBackground(
  profile: CompanyProfile,
  cases: Case[],
  agentIds: AgentId[],
  bulkId: string,
): Promise<void> {
  appendEvent({
    caseId: null, runId: null, agentId: null, kind: "progress",
    payload: { stage: "bulk_started", bulkId, cases: cases.length, agents: agentIds.length },
  });

  const tasks: Promise<unknown>[] = [];
  for (const c of cases) {
    const program = getProgram(c.programId);
    if (!program) {
      appendEvent({ caseId: c.id, kind: "error", payload: { error: "공고 없음" } });
      continue;
    }
    for (const agentId of agentIds) {
      tasks.push(
        runAgent({ caseId: c.id, agentId, profile, program })
          .then(result => {
            incrementBulkCompleted(bulkId);
            return result;
          })
          .catch(err => {
            incrementBulkCompleted(bulkId);
            appendEvent({ caseId: c.id, agentId, kind: "error", payload: { error: String(err) } });
          }),
      );
    }
  }

  const results = await Promise.allSettled(tasks);

  // case 별 상태 갱신
  for (const c of cases) {
    const caseTasks = results; // 단순화: 전체 끝나면 case 상태도 complete 로
    void caseTasks;
    updateCaseStatus(c.id, "complete");
  }

  appendEvent({
    caseId: null, kind: "progress",
    payload: { stage: "bulk_finished", bulkId },
  });
}

/**
 * 단일 에이전트만 실행 (재실행 / 부분 실행).
 */
export async function runOne(input: {
  companyProfileId: string; programId: string; agentId: AgentId;
}): Promise<{ caseId: string; ok: boolean; postId: string | null; error?: string }> {
  const profile = getProfile(input.companyProfileId);
  if (!profile) throw new Error("회사 프로파일 없음");
  const program = getProgram(input.programId);
  if (!program) throw new Error("공고 없음");

  const c = createOrGetCase(input.companyProfileId, input.programId);
  const result = await runAgent({ caseId: c.id, agentId: input.agentId, profile, program });
  return { caseId: c.id, ok: result.ok, postId: result.postId, error: result.error };
}
