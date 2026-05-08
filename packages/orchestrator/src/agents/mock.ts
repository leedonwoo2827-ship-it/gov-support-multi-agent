// Mock 에이전트 — ANTHROPIC_API_KEY 없을 때 시연용 결정론적 응답 생성

import type { AgentId, CompanyProfile, Program } from "@gov/shared";
import { AGENT_PAYLOAD_SCHEMAS } from "@gov/shared";
import { getAnthropicKey, getGeminiKey } from "../board/settings.js";

/**
 * Mock 모드 진입 조건: MOCK_AGENTS=1 강제, OR Anthropic/Gemini 키 둘 다 없을 때.
 * provider 별 분기는 runAgent 에서 함.
 */
export function isMockMode(): boolean {
  if (process.env.MOCK_AGENTS === "1") return true;
  return !getAnthropicKey() && !getGeminiKey();
}

export function mockPayload(agentId: AgentId, profile: CompanyProfile, program: Program): unknown {
  switch (agentId) {
    case "eligibility":
      return mockEligibility(profile, program);
    case "plan-draft":
      return mockPlanDraft(profile, program);
    case "doc-checklist":
      return mockChecklist(profile, program);
    case "milestone":
      return mockMilestone(profile, program);
  }
}

function mockEligibility(p: CompanyProfile, prog: Program) {
  const matched: string[] = [];
  const unmet: string[] = [];
  const uncertain: string[] = [];
  const text = prog.rawText.toLowerCase();

  // 단순 키워드 매칭으로 시연용 판정
  if (text.includes("중소")) matched.push(`중소기업 자격 (직원 ${p.employeeCount}명, 매출 ${(p.annualRevenueKrw / 1e8).toFixed(0)}억)`);
  if (text.includes("창업") && new Date().getFullYear() - p.foundedYear <= 7) matched.push(`창업 ${new Date().getFullYear() - p.foundedYear}년차 — 창업 7년 이내 충족`);
  if (text.includes("창업") && new Date().getFullYear() - p.foundedYear > 7) unmet.push(`창업 7년 초과 (${new Date().getFullYear() - p.foundedYear}년차)`);
  if (text.includes("벤처") && p.certifications.includes("벤처기업확인서")) matched.push("벤처기업확인서 보유");
  if (text.includes("여성") && !p.certifications.some(c => c.includes("여성"))) uncertain.push("여성기업 확인 필요");
  if (text.includes("수출") && !p.keywords.some(k => k.includes("수출") || k.includes("글로벌"))) uncertain.push("수출 실적 정보 부족");

  // 기본 보강
  if (matched.length === 0) matched.push("일반 자격 요건 충족 가능성");
  if (unmet.length === 0) unmet.push("(특이사항 없음)");
  if (uncertain.length === 0) uncertain.push("정확한 매출·인증 데이터 추가 검증 권장");

  const score = Math.min(100, 50 + matched.length * 12 - unmet.length * 8);
  const verdict: "적합" | "부분적합" | "부적합" =
    score >= 75 ? "적합" : score >= 55 ? "부분적합" : "부적합";

  return {
    verdict,
    score,
    matchedCriteria: matched,
    unmetCriteria: unmet,
    uncertain,
    axes: [
      { name: "문제인식", score: 16, max: 20, comment: `${prog.field ?? "정책 영역"}의 시장 문제 인식 적절` },
      { name: "실현가능성", score: 14, max: 20, comment: `보유 인증·인력 기준 ${p.certifications.length}건 활용 가능` },
      { name: "성장전략", score: 13, max: 20, comment: `${p.stage} 단계, ${p.region} 거점` },
      { name: "팀구성", score: 14, max: 20, comment: `직원 ${p.employeeCount}명` },
      { name: "정량지표", score: 12, max: 20, comment: `매출 ${(p.annualRevenueKrw / 1e8).toFixed(1)}억 기준` },
    ],
    riskFlags: text.includes("자부담") ? ["자부담 비율 확인 필요"] : [],
    recommendation: verdict === "적합"
      ? "신청 권장. 핵심 강점은 충족 요건에 강조하여 기술하세요."
      : verdict === "부분적합"
      ? "보완 후 신청. 미충족 조건을 사전 정비하거나 가능한 트랙으로 우회하세요."
      : "이번 공고는 부적합. 유사 공고 또는 별도 트랙을 탐색하세요.",
    reasoning: `${prog.title} 공고에 대해 ${p.companyName}의 자격을 검토한 결과, 충족 ${matched.length}건 / 미충족 ${unmet.length}건 / 보류 ${uncertain.length}건으로 분류되었다. (Mock 응답 — ANTHROPIC_API_KEY 미설정으로 결정론적 시연 데이터를 사용함)`,
  };
}

function mockPlanDraft(p: CompanyProfile, prog: Program) {
  const problem = `### 문제 인식\n${prog.field ?? "해당"} 분야에서 ${prog.industry ?? "산업"} 영역의 비효율과 규제 격차가 시장의 핵심 페인포인트로 누적되고 있다. ${p.companyName}은 ${p.industry} 영역에서 ${p.keywords.join("·") || "독자 기술"}을 보유하고, 본 공고가 다루는 정책 문제를 시장 관점에서 정의·해결할 수 있는 위치에 있다.`;
  const solution = `### 실현 가능성\n${p.companyName}은 ${p.foundedYear}년 설립, 직원 ${p.employeeCount}명, ${p.certifications.join("·") || "기본 사업자 등록"} 기반의 실행 역량을 갖췄다. 본 사업의 50% 매칭/자부담 구조에 부합하는 자체 자금 여력을 확보했고, ${prog.region ?? "전국"} 거점 인프라가 이미 가동 중이다.`;
  const scaleUp = `### 성장 전략\n3년 내 매출 ${(p.annualRevenueKrw * 1.8 / 1e8).toFixed(0)}억 규모로 확장하기 위해 (1) ${p.keywords[0] ?? "핵심"} 영역 시장 침투 → (2) 인접 ${p.keywords[1] ?? "확장"} 영역 진출 → (3) ${prog.region === "전국" ? "글로벌" : "수도권 외 권역"} 진출의 3단계 로드맵을 추진한다. 단, 본 추정치는 시나리오 기반이며 실데이터로 추가 검증이 필요하다.`;
  const team = `### 팀 구성\n| 역할 | 인력 | 비고 |\n|---|---|---|\n| 대표 | 1명 | ${p.representativeAge ?? "정보없음"}세 |\n| 핵심 인력 | ${Math.max(2, Math.floor(p.employeeCount * 0.3))}명 | ${p.industry} 경력 |\n| 일반 인력 | ${p.employeeCount - 1 - Math.max(2, Math.floor(p.employeeCount * 0.3))}명 | 운영·관리 |\n\n보유 인증: ${p.certifications.join(", ") || "없음 — 본 사업 통해 추가 인증 추진"}`;

  const summary3line = `1) ${p.companyName}은 ${prog.title} 공고에 부합하는 ${p.industry} 분야 ${p.stage} 기업이다.\n2) 보유 ${p.certifications.length}건 인증 + 직원 ${p.employeeCount}명 + 매출 ${(p.annualRevenueKrw / 1e8).toFixed(0)}억 기반으로 사업 실행이 가능하다.\n3) 3년 후 매출 1.8배 성장 + ${prog.region ?? "전국"} 권역 확장을 목표로 단계적 로드맵을 제시한다.`;

  const wordCount = problem.length + solution.length + scaleUp.length + team.length;

  return {
    problem, solution, scaleUp, team, summary3line, wordCount,
    warnings: ["매출 성장 추정치는 시나리오 가정으로 실데이터 검증 필요", "Mock 응답 — ANTHROPIC_API_KEY 미설정"],
  };
}

function mockChecklist(p: CompanyProfile, prog: Program) {
  const required = [
    { code: "BIZ_REG", nameKo: "사업자등록증 사본", issuer: "관할 세무서", status: p.bizRegNo ? "ready" as const : "todo" as const, validityDays: 90 },
    { code: "TAX_NO_DEBT", nameKo: "국세 완납 증명원", issuer: "국세청", status: "todo" as const, validityDays: 30 },
    { code: "LOCAL_TAX_NO_DEBT", nameKo: "지방세 완납 증명원", issuer: "관할 지방자치단체", status: "todo" as const, validityDays: 30 },
    { code: "REVENUE_PROOF", nameKo: "최근 3년 재무제표", issuer: "회사 자체", status: "ready" as const, note: `매출 ${(p.annualRevenueKrw / 1e8).toFixed(0)}억 기준` },
    { code: "EMPLOYEE_PROOF", nameKo: "건강보험 가입자명부", issuer: "국민건강보험공단", status: "todo" as const, validityDays: 30 },
    { code: "BIZ_PLAN", nameKo: "사업계획서 (PSST 양식)", issuer: "회사 자체", status: "todo" as const, note: "사업계획서 초안 에이전트 결과 활용" },
  ];
  const optional = p.certifications.length > 0
    ? p.certifications.map((cert, i) => ({
        code: `CERT_${i}`, nameKo: cert, issuer: "발급기관", status: "ready" as const, note: "보유 인증 활용",
      }))
    : [];
  const recommended = [
    { code: "REC_INNOBIZ", nameKo: "이노비즈/메인비즈 인증서", issuer: "중소벤처기업부", status: p.certifications.includes("이노비즈") ? "ready" as const : "unknown" as const, note: "가점 항목 (5점)" },
    { code: "REC_FINANCIAL", nameKo: "신용평가서 (B 이상)", issuer: "기술보증기금/신용보증기금", status: "unknown" as const, note: "가점 항목" },
  ];

  return {
    required, optional, recommended,
    blockers: required.filter(r => r.status === "todo").length > 3 ? [`준비 필요 서류 ${required.filter(r => r.status === "todo").length}건 — 일정 여유 필요`] : [],
    submissionMethod: prog.source === "kstartup" ? "K-Startup 포털 온라인 접수" : prog.source === "bizinfo" ? "기업마당 온라인 접수" : "지정 포털 온라인 접수",
    portalUrl: prog.url ?? undefined,
  };
}

function mockMilestone(_p: CompanyProfile, prog: Program) {
  // deadline 이 잘못된 형식이거나 null 이면 30일 후 기본값
  let dl = prog.deadline ? new Date(prog.deadline) : new Date(Date.now() + 30 * 86400_000);
  if (Number.isNaN(dl.getTime())) {
    dl = new Date(Date.now() + 30 * 86400_000);
  }
  const deadline = dl.toISOString().slice(0, 10);
  const mk = (days: number, title: string, owner: "신청자" | "대표" | "외부", deliverables: string[]) => ({
    date: new Date(dl.getTime() - days * 86400_000).toISOString().slice(0, 10),
    daysBeforeDeadline: days,
    titleKo: title,
    owner,
    deliverables,
    dependsOnDocs: [],
  });
  const milestones = [
    mk(30, "공고 분석 및 자격 확인", "신청자", ["자격평가 보고서"]),
    mk(21, "사업계획서 초안 작성", "신청자", ["PSST 4섹션 초안"]),
    mk(14, "필수 서류 발급 시작", "신청자", ["국세·지방세 완납 증명원", "건강보험 가입자명부"]),
    mk(7,  "사업계획서 검토 및 보완", "대표", ["최종 사업계획서"]),
    mk(3,  "외부 검토 및 자문", "외부", ["검토 의견서"]),
    mk(1,  "최종 점검 및 업로드 준비", "신청자", ["체크리스트 완료"]),
    mk(0,  "공고 마감 — 제출 완료", "신청자", ["접수증"]),
  ];

  return {
    deadline,
    totalDays: 30,
    milestones,
    criticalPathNotes: `사업계획서 초안 작성(D-21~D-7)이 critical path. 서류 발급(D-14~D-7)이 병렬로 진행되어야 마감일 위험을 최소화할 수 있다.`,
    holidayAdjustments: [],
  };
}

/**
 * mock 모드에서 페이로드 검증을 위한 안전 통과기.
 */
export function validateMockPayload(agentId: AgentId, payload: unknown): unknown {
  const schema = AGENT_PAYLOAD_SCHEMAS[agentId];
  return schema.parse(payload);
}
