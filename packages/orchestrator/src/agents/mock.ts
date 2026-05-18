// Mock 에이전트 — ANTHROPIC_API_KEY 없을 때 시연용 결정론적 응답 생성

import type { AgentId, CompanyProfile, Program, DocItem } from "@gov/shared";
import { AGENT_PAYLOAD_SCHEMAS } from "@gov/shared";
import { getAnthropicKey, getGeminiKey } from "../board/settings.js";
import { getAwardStatsByAgency, type AwardStats } from "../board/awards.js";
import {
  getKoicaContractStats,
  getKoicaContractGlobalStats,
  type KoicaContractStats,
} from "../board/koicaContracts.js";

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

// ── 공고 raw 텍스트 정규식 추출 헬퍼 ──────────────────────────────────
interface BidRequirements {
  hasPq: boolean;
  isInternationalCompetition: boolean;
  requiresConsortium: boolean;
  minCapitalKrw?: number;           // 자본금 N억 이상
  minRevenueKrw?: number;            // 매출 N억 이상
  minPerformanceCount?: number;      // 실적 N건 이상
  estimatedPriceKrw?: number;        // 추정가격
  pqDeadline?: string;
  techScore?: number;                // 기술 평가 비중
  priceScore?: number;               // 가격 평가 비중
}

function parseBidRequirements(rawText: string): BidRequirements {
  const t = rawText;
  const r: BidRequirements = {
    hasPq: /PQ\s*여부\s*[:：]?\s*Y|PQ\s*적용|사전심사/i.test(t),
    isInternationalCompetition: /국제경쟁/.test(t),
    requiresConsortium: /컨소시엄\s*(필수|구성|협약)/.test(t),
  };
  // "자본금 N억" 패턴 (한글 "억" 단위)
  const cap = t.match(/자본금\s*([\d,]+)\s*억/);
  if (cap) r.minCapitalKrw = parseInt(cap[1].replace(/,/g, "")) * 100_000_000;
  // "매출 N억 이상" / "직전 매출 N억 이상"
  const rev = t.match(/(?:직전\s*)?매출\s*([\d,]+)\s*억/);
  if (rev) r.minRevenueKrw = parseInt(rev[1].replace(/,/g, "")) * 100_000_000;
  // "실적 N건 이상"
  const perf = t.match(/실적\s*(\d+)\s*건\s*이상/);
  if (perf) r.minPerformanceCount = parseInt(perf[1]);
  // "추정가격: NNN,NNN,NNN원"
  const est = t.match(/추정가격\s*[:：]?\s*([\d,]+)\s*원/);
  if (est) r.estimatedPriceKrw = parseInt(est[1].replace(/,/g, ""));
  // "PQ 마감: YYYY-MM-DD"
  const pqd = t.match(/PQ\s*마감\s*[:：]?\s*(\d{4}[-.]\d{2}[-.]\d{2})/);
  if (pqd) r.pqDeadline = pqd[1].replace(/\./g, "-");
  // "기술 N / 가격 M"
  const score = t.match(/기술\s*(\d+)\s*\/\s*가격\s*(\d+)/);
  if (score) { r.techScore = parseInt(score[1]); r.priceScore = parseInt(score[2]); }
  return r;
}

function mockEligibility(p: CompanyProfile, prog: Program) {
  const matched: string[] = [];
  const unmet: string[] = [];
  const uncertain: string[] = [];
  const text = prog.rawText.toLowerCase();
  const req = parseBidRequirements(prog.rawText);
  const dept = p.department ?? "planning";

  // A1: 발주처별 낙찰률 통계 조회 (edu 가격경쟁력 axis 입력)
  let awardStats: AwardStats | null = null;
  if (dept === "edu" && prog.agency) {
    // 발주처명 첫 4글자 정도로 LIKE 검색 (예: "한국금융연수원" → "한국금융")
    const agencyKey = prog.agency.slice(0, Math.min(prog.agency.length, 4));
    try {
      awardStats = getAwardStatsByAgency(agencyKey, dept);
    } catch {
      awardStats = null;
    }
  }

  // A2: KOICA 수의계약 통계 (oda 가격경쟁력 axis 입력)
  // 분야/사업명 키워드로 매칭 — 공고 분야 우선, 부족하면 제목 첫 단어 시도.
  let koicaStats: KoicaContractStats | null = null;
  if (dept === "oda") {
    const candidates: string[] = [];
    if (prog.field) candidates.push(prog.field);
    if (prog.title) {
      // 제목에서 의미있는 키워드 후보 추출 — 한자/영문 단어, 또는 첫 2어절
      const firstWords = prog.title.split(/\s+/).filter(w => w.length >= 2).slice(0, 2);
      candidates.push(...firstWords);
    }
    for (const kw of candidates) {
      try {
        const s = getKoicaContractStats(kw);
        if (s && s.count > 0) { koicaStats = s; break; }
      } catch {
        // ignore
      }
    }
  }

  // ── PQ 정량 요건 비교 (입찰형 부서 공통) ─────────────────────────────
  if (req.minRevenueKrw) {
    if (p.annualRevenueKrw >= req.minRevenueKrw) {
      matched.push(`매출 요건 충족 — 보유 ${(p.annualRevenueKrw / 1e8).toFixed(0)}억 ≥ 요구 ${(req.minRevenueKrw / 1e8).toFixed(0)}억`);
    } else {
      unmet.push(`매출 요건 미달 — 보유 ${(p.annualRevenueKrw / 1e8).toFixed(0)}억 < 요구 ${(req.minRevenueKrw / 1e8).toFixed(0)}억`);
    }
  }
  if (req.minPerformanceCount !== undefined) {
    const relevantPerf = dept === "oda"
      ? p.pastPerformance.filter(pp => pp.clientType.includes("KOICA") || pp.clientType.includes("ODA"))
      : p.pastPerformance;
    if (relevantPerf.length >= req.minPerformanceCount) {
      matched.push(`실적 요건 충족 — 보유 ${relevantPerf.length}건 ≥ 요구 ${req.minPerformanceCount}건`);
    } else {
      unmet.push(`실적 요건 미달 — 보유 ${relevantPerf.length}건 < 요구 ${req.minPerformanceCount}건`);
    }
  }
  if (req.requiresConsortium || req.isInternationalCompetition) {
    if (p.consortiumPartners.length > 0) {
      matched.push(`컨소시엄 구성 가능 — 보유 파트너 ${p.consortiumPartners.length}곳`);
    } else {
      unmet.push("컨소시엄/국제경쟁 입찰 — 현지 파트너 발굴 필요");
    }
  }

  // 부서별 충족·미충족 분류
  if (dept === "edu") {
    if (p.pastPerformance.length > 0) matched.push(`교육과정 수행 실적 ${p.pastPerformance.length}건 보유`);
    else uncertain.push("최근 3년 유사 교육과정 실적 미확인");
    if (p.instructorPool && p.instructorPool.count >= 10) matched.push(`강사 풀 ${p.instructorPool.count}명 (${p.instructorPool.specialties.join("·")})`);
    else uncertain.push("강사진 규모 정보 부족");
    if (p.contentIp.length > 0) matched.push(`자체 콘텐츠 IP: ${p.contentIp.join(", ")}`);
    if (text.includes("ai") || text.includes("디지털")) matched.push("AI/DX 분야 — 회사 핵심 키워드와 일치");
    if (!p.contentIp.length) unmet.push("입찰 가점 항목: 자체 콘텐츠 표준안 미확인");
  } else if (dept === "oda") {
    const odaExperiences = p.pastPerformance.filter(pp => pp.clientType.includes("KOICA") || pp.clientType.includes("ODA"));
    if (odaExperiences.length > 0 && req.minPerformanceCount === undefined) matched.push(`ODA 사업 수행 ${odaExperiences.length}건`);
    else if (odaExperiences.length === 0) unmet.push("KOICA/EDCF 등 ODA 사업 직접 수행 이력 부족");
    if (p.languages.length >= 2) matched.push(`다국어 운영: ${p.languages.join(", ")}`);
    else uncertain.push("다국어 인력 풀 미상");
  } else {
    // planning — 기존 로직 유지
    if (text.includes("중소")) matched.push(`중소기업 자격 (직원 ${p.employeeCount}명, 매출 ${(p.annualRevenueKrw / 1e8).toFixed(0)}억)`);
    if (text.includes("창업") && new Date().getFullYear() - p.foundedYear <= 7) matched.push(`창업 ${new Date().getFullYear() - p.foundedYear}년차 — 창업 7년 이내 충족`);
    if (text.includes("창업") && new Date().getFullYear() - p.foundedYear > 7) unmet.push(`창업 7년 초과 (${new Date().getFullYear() - p.foundedYear}년차)`);
    if (text.includes("벤처") && p.certifications.includes("벤처기업확인서")) matched.push("벤처기업확인서 보유");
    if (text.includes("여성") && !p.certifications.some(c => c.includes("여성"))) uncertain.push("여성기업 확인 필요");
    if (text.includes("수출") && !p.keywords.some(k => k.includes("수출") || k.includes("글로벌"))) uncertain.push("수출 실적 정보 부족");
    if (p.rdInvestmentKrw && p.rdInvestmentKrw > 0) matched.push(`R&D 투자 ${(p.rdInvestmentKrw / 1e8).toFixed(1)}억`);
  }

  // 기본 보강
  if (matched.length === 0) matched.push("기본 사업자 자격 충족 가능성");
  if (unmet.length === 0) unmet.push("(특이사항 없음)");
  if (uncertain.length === 0) uncertain.push("추가 데이터 검증 권장");

  const score = Math.min(100, 50 + matched.length * 12 - unmet.length * 8);
  const verdict: "적합" | "부분적합" | "부적합" =
    score >= 75 ? "적합" : score >= 55 ? "부분적합" : "부적합";

  // 가격경쟁력 axis (edu) — G2B 낙찰 통계 기반
  function priceAxis(maxScore: number): { name: string; score: number; max: number; comment: string } {
    if (!awardStats || awardStats.avgRate === null) {
      return { name: "가격경쟁력", score: 14, max: maxScore, comment: "발주처 낙찰 통계 데이터 미수집 — [📥 실데이터 적재] 후 객관 분석 가능" };
    }
    const rate = awardStats.avgRate;
    // 낙찰률 해석: 높을수록(=90%↑) 가격 경쟁 약함(가점), 낮을수록(=80%↓) 가격 경쟁 치열(감점)
    const score = rate >= 90 ? Math.round(maxScore * 0.9)
                : rate >= 85 ? Math.round(maxScore * 0.75)
                : rate >= 80 ? Math.round(maxScore * 0.6)
                : Math.round(maxScore * 0.45);
    const winners = awardStats.topWinners.slice(0, 3).map(w => `${w.name}(${w.count}건)`).join(", ") || "—";
    const comment = `${prog.agency} 최근 6개월 평균 낙찰률 ${rate.toFixed(1)}% (${awardStats.count}건, 평균 참가 ${awardStats.avgParticipants?.toFixed(1) ?? "?"}개사). 주요 낙찰업체: ${winners}`;
    return { name: "가격경쟁력", score, max: maxScore, comment };
  }

  // ODA 가격경쟁력 axis (oda) — KOICA 수의계약 통계 기반
  // 신호 해석:
  //  - count 多 + topContractors 집중도 高: 시장 좁고 기존 파트너 강함 → 신규 진입 어려움(감점)
  //  - count 中 + 다양한 파트너: 진입 가능성 있음(중점)
  //  - count 少: KOICA 가 해당 분야 수의계약을 거의 안 함 → 일반/제한경쟁 트랙으로 가야 함(중점)
  //  - 데이터 없음: [📥 실데이터 적재] 후 분석 가능(기본점)
  function odaPriceAxis(maxScore: number): { name: string; score: number; max: number; comment: string } {
    if (!koicaStats || koicaStats.count === 0) {
      const global = (() => { try { return getKoicaContractGlobalStats(); } catch { return { count: 0, avgAmt: null, topContractors: [] as { name: string; count: number }[] }; } })();
      if (global.count === 0) {
        return { name: "ODA 가격경쟁력", score: 12, max: maxScore, comment: "KOICA 수의계약 데이터 미수집 — [📥 실데이터 적재] 후 객관 분석 가능" };
      }
      const winners = global.topContractors.slice(0, 3).map(w => `${w.name}(${w.count}건)`).join(", ") || "—";
      return { name: "ODA 가격경쟁력", score: 12, max: maxScore, comment: `해당 분야 KOICA 수의계약 사례 부재 — 일반/제한경쟁 트랙 검토 필요. KOICA 전체 수의 ${global.count}건 평균 ${global.avgAmt ? `${(global.avgAmt / 1e8).toFixed(2)}억` : "?"} / 주요 파트너: ${winners}` };
    }
    const { count, avgAmt, topContractors } = koicaStats;
    const topShare = topContractors.length > 0 ? topContractors[0].count / count : 0;
    // 점수 로직: 분야 적합성(count) + 진입 가능성(파트너 다양성)
    let score: number;
    if (count >= 5 && topShare < 0.5) score = Math.round(maxScore * 0.75);        // 시장 형성·다양성 ↑
    else if (count >= 5 && topShare >= 0.5) score = Math.round(maxScore * 0.50);   // 시장은 있으나 강자 집중
    else if (count >= 2) score = Math.round(maxScore * 0.60);                       // 형성 초기
    else score = Math.round(maxScore * 0.45);                                       // 1건뿐 — 사례 부족
    // 우리 회사가 topContractors 에 있으면 가점
    const ours = topContractors.find(w => w.name.includes(p.companyName) || p.companyName.includes(w.name));
    if (ours) { score = Math.min(maxScore, score + Math.round(maxScore * 0.15)); }
    const winners = topContractors.slice(0, 3).map(w => `${w.name}(${w.count}건)`).join(", ") || "—";
    const avgStr = avgAmt ? `${(avgAmt / 1e8).toFixed(2)}억` : "?";
    const comment = `KOICA 수의계약 ${count}건 (분야 매칭 키워드: "${koicaStats.keyword}"). 평균 ${avgStr} / 주요 파트너: ${winners}${ours ? ` · ${p.companyName} 기존 수의 이력 보유(+가점)` : ""}`;
    return { name: "ODA 가격경쟁력", score, max: maxScore, comment };
  }

  // 부서별 5축
  const axes = dept === "edu"
    ? [
        { name: "유사 교육과정 실적", score: Math.min(25, 12 + p.pastPerformance.length * 3), max: 25, comment: `최근 3년 ${p.pastPerformance.length}건 수행` },
        { name: "강사 풀 적합도", score: p.instructorPool ? Math.min(20, 10 + Math.floor(p.instructorPool.count / 3)) : 8, max: 20, comment: p.instructorPool ? `${p.instructorPool.count}명 (${p.instructorPool.specialties.join("·")})` : "강사 풀 정보 부족" },
        { name: "콘텐츠 IP·표준안", score: Math.min(20, 8 + p.contentIp.length * 4), max: 20, comment: p.contentIp.length ? p.contentIp.join(", ") : "자체 콘텐츠 미상" },
        { name: "LMS 운영 인프라", score: p.contentIp.some(c => c.includes("LXP") || c.includes("LMS")) ? 14 : 9, max: 15, comment: "코스모스 LXP 등 자체 인프라" },
        priceAxis(20),
      ]
    : dept === "oda"
    ? (() => {
        const odaCount = p.pastPerformance.filter(pp => pp.clientType.includes("KOICA") || pp.clientType.includes("ODA")).length;
        return [
          { name: "국제개발 실적", score: Math.min(25, 8 + odaCount * 5), max: 25, comment: `ODA 직접 수행 이력 ${odaCount}건` },
          { name: "컨소시엄·현지 파트너", score: Math.min(20, 8 + p.consortiumPartners.length * 4), max: 20, comment: p.consortiumPartners.length ? `${p.consortiumPartners.join(", ")}` : "현지 파트너 확보 필요" },
          { name: "다국어 운영 역량", score: Math.min(15, 5 + p.languages.length * 3), max: 15, comment: p.languages.join(", ") || "언어 풀 미상" },
          { name: "ODA 분야 전문성", score: 15, max: 20, comment: `${prog.field ?? "공고 분야"} 분야 전문성` },
          odaPriceAxis(20),
        ];
      })()
    : [
        { name: "기업규모·매출", score: 16, max: 20, comment: `직원 ${p.employeeCount}명, 매출 ${(p.annualRevenueKrw / 1e8).toFixed(1)}억` },
        { name: "연구개발 역량", score: p.rdInvestmentKrw ? 16 : 11, max: 20, comment: p.rdInvestmentKrw ? `R&D ${(p.rdInvestmentKrw / 1e8).toFixed(1)}억` : "R&D 투자 정보 부족" },
        { name: "기술·인증", score: Math.min(20, 8 + p.certifications.length * 3), max: 20, comment: `보유 인증 ${p.certifications.length}건` },
        { name: "재무 건전성", score: 13, max: 20, comment: `${p.stage} 단계, ${p.region}` },
        { name: "사업영역 적합성", score: 14, max: 20, comment: `${prog.field ?? "정책 영역"}` },
      ];

  // 구체 행동 항목 — unmet 기반
  const actions: string[] = [];
  if (unmet.some(u => u.includes("실적 요건 미달"))) actions.push("컨소시엄 구성으로 실적 합산");
  if (unmet.some(u => u.includes("매출 요건 미달"))) actions.push("결산 매출 증빙 보강 또는 차기 공고 대기");
  if (unmet.some(u => u.includes("컨소시엄"))) actions.push(dept === "oda" ? "현지 파트너 발굴 (KCOC, 현지 NGO)" : "기존 협력사·강사 풀에서 컨소시엄 후보 선정");
  if (dept === "edu" && !p.contentIp.length) actions.push("자체 콘텐츠 표준안 IP 등록 (가점 확보)");
  if (req.hasPq) actions.push(`PQ 마감(${req.pqDeadline ?? "공고 확인"}) 별도 일정 관리 필요`);

  const baseRec = verdict === "적합"
    ? "신청 권장. 핵심 강점은 충족 요건에 강조하여 기술하세요."
    : verdict === "부분적합"
    ? "보완 후 신청. 미충족 조건을 사전 정비하거나 가능한 트랙으로 우회하세요."
    : "이번 공고는 부적합. 유사 공고 또는 별도 트랙을 탐색하세요.";
  const recommendation = actions.length > 0
    ? `${baseRec}\n\n**우선 행동 항목**:\n${actions.map(a => `- ${a}`).join("\n")}`
    : baseRec;

  const riskFlags: string[] = [];
  if (text.includes("자부담")) riskFlags.push("자부담 비율 확인 필요");
  if (dept === "oda" && p.consortiumPartners.length === 0) riskFlags.push("현지 파트너 부재");
  if (dept === "edu" && !p.contentIp.length) riskFlags.push("콘텐츠 IP 미확인 — 입찰 가점 손실 가능");
  if (req.hasPq && !req.pqDeadline) riskFlags.push("PQ 적용 — 마감 일정 사전 확인 필요");
  if (req.estimatedPriceKrw && req.estimatedPriceKrw > 1_000_000_000) riskFlags.push(`대형 사업 (추정가 ${(req.estimatedPriceKrw / 1e8).toFixed(0)}억) — 컨소시엄 검토 필수`);

  return {
    verdict,
    score,
    matchedCriteria: matched,
    unmetCriteria: unmet,
    uncertain,
    axes,
    riskFlags,
    recommendation,
    reasoning: `${prog.title} 공고에 대해 ${p.companyName} (${dept === "edu" ? "교육사업부" : dept === "oda" ? "해외사업부" : "경영기획팀"})의 자격을 검토한 결과, 충족 ${matched.length}건 / 미충족 ${unmet.length}건 / 보류 ${uncertain.length}건으로 분류되었다. (Mock 응답)`,
  };
}

function mockPlanDraft(p: CompanyProfile, prog: Program) {
  const dept = p.department ?? "planning";
  const req = parseBidRequirements(prog.rawText);

  let problem: string, solution: string, scaleUp: string, team: string, summary3line: string;

  if (dept === "edu") {
    // RFP 응답형 — 교수설계/운영/평가/강사진
    problem = `### 발주처 요구 분석\n${prog.agency ?? "발주처"}는 ${prog.title}을 통해 ${prog.field ?? "교육"} 분야 학습자의 실무 역량 강화를 목표로 한다. 현장에서는 "이론 학습은 충분하나 실제 적용 시 어려움" 페인포인트가 누적되어 있으며, 기존 교육 대비 **실습 비중·평가 객관성·콘텐츠 최신성** 세 축의 개선이 RFP 핵심 요구사항이다.`;
    solution = `### 교수설계(ISD) · 운영계획\n${p.companyName}은 ${p.contentIp.join("·") || "자체 콘텐츠"} 기반 ISD 방법론을 적용한다.\n- **이론 30% + 실습 50% + 평가/피드백 20%** 비율의 모듈식 커리큘럼\n- 자체 ${p.contentIp.find(c => c.includes("LXP") || c.includes("LMS")) ?? "코스모스 LXP"} 운영으로 학습자 진도·평가 실시간 관리\n- 강사진 풀 ${p.instructorPool?.count ?? 0}명 (전문분야: ${p.instructorPool?.specialties.join("·") ?? "미상"})\n- 차수별 사후 만족도 조사 + 1개월 후 현업 적용도 추적`;
    scaleUp = `### 평가체계 · 사후관리\n사전·중간·사후 3단계 평가 (CBT + 실습 과제 + 동료 평가). 평가 결과를 발주처 HRD 시스템에 자동 연동.\n과정 종료 후 6개월 KPI 추적: (1) 학습자 만족도 4.5/5 이상, (2) 직무 적용도 70% 이상, (3) 발주처 ROI 보고서 분기 1회 제공.\n${req.estimatedPriceKrw ? `\n**가격경쟁력**: 추정가격 ${(req.estimatedPriceKrw / 1e8).toFixed(1)}억 대비 시장 표준 단가 분석 결과 ±10% 범위 내 제안 가능.` : ""}`;
    team = `### 강사진 · 운영팀\n| 역할 | 인원 | 비고 |\n|---|---|---|\n| 총괄 PM | 1명 | 위탁교육 운영 경력 N년 |\n| 주강사 | ${Math.max(2, Math.floor((p.instructorPool?.count ?? 10) / 5))}명 | ${p.instructorPool?.specialties.join("·") ?? "분야 전문"} |\n| 보조강사 | ${Math.max(3, p.instructorPool?.count ? Math.floor(p.instructorPool.count * 0.6) : 5)}명 | 실습 지도 |\n| 운영지원 | 2명 | LMS 운영·교재 배포 |\n\n**유사 실적**: 최근 3년 ${p.pastPerformance.length}건 (대표 발주처: ${p.pastPerformance.slice(0, 3).map(pp => pp.clientType).join(", ") || "—"})`;
    summary3line = `1) ${prog.agency ?? "발주처"}의 RFP가 요구하는 실습·평가·콘텐츠 3축 모두 충족.\n2) 자체 LMS(${p.contentIp[0] ?? "코스모스"}) + 강사 풀 ${p.instructorPool?.count ?? 0}명 + 유사 실적 ${p.pastPerformance.length}건 기반의 즉시 실행 가능.\n3) 사후 6개월 KPI 추적 + 분기 ROI 보고서로 발주처 사후 가치 명시.`;
  } else if (dept === "oda") {
    // ODA 기술제안서 — 효과성·지속가능성·컨소시엄·국제팀
    const targetCountry = prog.region ?? "수원국";
    const odaPerf = p.pastPerformance.filter(pp => pp.clientType.includes("KOICA") || pp.clientType.includes("ODA"));
    problem = `### 개발협력 수요 분석\n${targetCountry}은 ${prog.field ?? "해당"} 분야에서 **인적 역량 부족 · 인프라 격차 · 지속가능성 결여** 3대 도전과제를 안고 있다. ${prog.agency ?? "발주처"}는 본 사업을 통해 수원국의 자립적 운영 역량 구축을 목표로 한다. ${p.companyName}은 ${odaPerf.length > 0 ? `유사 ${odaPerf[0].title} 사업 경험을 통해 ${targetCountry} 권역의 정책 환경·문화적 맥락을 이해` : `해외사업 추진 역량을 확보`}하고 있다.`;
    solution = `### 사업 접근법 · 개발협력 효과성\n**OECD DAC 5원칙** 기반 설계:\n- **적절성**: 수원국 정부 우선과제와 정합 (${targetCountry} 국가개발전략 매핑)\n- **효과성**: 정량 산출물 — 교육 수료자 N명, 인증기관 N개, e-러닝 콘텐츠 N편\n- **효율성**: 한국 본사 + 현지 파트너 분업 (본사 콘텐츠 IP / 현지 운영) 으로 단위 비용 30% 절감\n- **영향**: 사업 종료 후 자체 운영 가능한 마스터 트레이너 풀 양성\n- **지속가능성**: 수원국 정부 이양 계획 + 2년 사후 모니터링`;
    scaleUp = `### 지속가능성 · 이양 전략\n사업 종료 시점에 (1) 현지 마스터 트레이너 ${Math.max(15, p.employeeCount)}명 양성 완료, (2) 현지어 콘텐츠 N편 인계, (3) 운영 매뉴얼·재정 자립 계획서 ${targetCountry} 정부 부처 정식 인계.\n**컨소시엄**: ${p.consortiumPartners.length > 0 ? p.consortiumPartners.join(", ") : "현지 파트너 확보 필요"}.\n사후 2년간 분기별 화상 모니터링 + 연 1회 현장 점검 (자비 부담).`;
    team = `### 컨소시엄 · 국제팀 구성\n| 역할 | 본사/현지 | 인원 | 비고 |\n|---|---|---|---|\n| 사업총괄 PM | 본사 | 1명 | PMP 보유, ${odaPerf.length}건 ODA 경력 |\n| 분야 전문가 | 본사 | ${Math.max(2, Math.floor(p.employeeCount * 0.2))}명 | ${prog.field ?? "분야"} 박사·석사 |\n| 현지 PM | 현지 | 1명 | ${targetCountry} 거점 |\n| 현지 코디네이터 | 현지 | 2~3명 | 다국어 가능 |\n| 컨소시엄 파트너 | 현지 | 협력기관 N곳 | ${p.consortiumPartners[0] ?? "—"} 등 |\n\n**다국어 운영**: ${p.languages.join(", ") || "확보 필요"}`;
    summary3line = `1) ${targetCountry} ${prog.field ?? "분야"}의 자립적 역량 강화를 위한 ${odaPerf.length}건 유사 경험 기반 접근.\n2) DAC 5원칙 (적절성·효과성·효율성·영향·지속가능성) 충족 + 현지 컨소시엄 ${p.consortiumPartners.length}곳 확보.\n3) 사업 종료 후 마스터 트레이너 인계 + 2년 사후 모니터링으로 지속가능성 보장.`;
  } else {
    // planning — 기존 PSST
    problem = `### 문제 인식\n${prog.field ?? "해당"} 분야에서 ${prog.industry ?? "산업"} 영역의 비효율과 규제 격차가 시장의 핵심 페인포인트로 누적되고 있다. ${p.companyName}은 ${p.industry} 영역에서 ${p.keywords.join("·") || "독자 기술"}을 보유하고, 본 공고가 다루는 정책 문제를 시장 관점에서 정의·해결할 수 있는 위치에 있다.`;
    solution = `### 실현 가능성\n${p.companyName}은 ${p.foundedYear}년 설립, 직원 ${p.employeeCount}명, ${p.certifications.join("·") || "기본 사업자 등록"} 기반의 실행 역량을 갖췄다. 본 사업의 50% 매칭/자부담 구조에 부합하는 자체 자금 여력을 확보했고, ${prog.region ?? "전국"} 거점 인프라가 이미 가동 중이다.`;
    scaleUp = `### 성장 전략\n3년 내 매출 ${(p.annualRevenueKrw * 1.8 / 1e8).toFixed(0)}억 규모로 확장하기 위해 (1) ${p.keywords[0] ?? "핵심"} 영역 시장 침투 → (2) 인접 ${p.keywords[1] ?? "확장"} 영역 진출 → (3) ${prog.region === "전국" ? "글로벌" : "수도권 외 권역"} 진출의 3단계 로드맵을 추진한다. 단, 본 추정치는 시나리오 기반이며 실데이터로 추가 검증이 필요하다.`;
    team = `### 팀 구성\n| 역할 | 인력 | 비고 |\n|---|---|---|\n| 대표 | 1명 | ${p.representativeAge ?? "정보없음"}세 |\n| 핵심 인력 | ${Math.max(2, Math.floor(p.employeeCount * 0.3))}명 | ${p.industry} 경력 |\n| 일반 인력 | ${Math.max(0, p.employeeCount - 1 - Math.max(2, Math.floor(p.employeeCount * 0.3)))}명 | 운영·관리 |\n\n보유 인증: ${p.certifications.join(", ") || "없음 — 본 사업 통해 추가 인증 추진"}`;
    summary3line = `1) ${p.companyName}은 ${prog.title} 공고에 부합하는 ${p.industry} 분야 ${p.stage} 기업이다.\n2) 보유 ${p.certifications.length}건 인증 + 직원 ${p.employeeCount}명 + 매출 ${(p.annualRevenueKrw / 1e8).toFixed(0)}억 기반으로 사업 실행이 가능하다.\n3) 3년 후 매출 1.8배 성장 + ${prog.region ?? "전국"} 권역 확장을 목표로 단계적 로드맵을 제시한다.`;
  }

  const wordCount = problem.length + solution.length + scaleUp.length + team.length;

  const warnings = dept === "planning"
    ? ["매출 성장 추정치는 시나리오 가정으로 실데이터 검증 필요", "Mock 응답 — LLM 키 미설정"]
    : dept === "edu"
    ? ["강사진 구체 명단·이력은 보유 풀에서 발주처 요구에 맞게 별도 선정 필요", "Mock 응답 — LLM 키 미설정"]
    : ["현지 컨소시엄 파트너 구체 명단·MOU 발효일은 별도 확보 필요", "Mock 응답 — LLM 키 미설정"];

  return { problem, solution, scaleUp, team, summary3line, wordCount, warnings };
}

function mockChecklist(p: CompanyProfile, prog: Program) {
  const dept = p.department ?? "planning";
  const text = prog.rawText.toLowerCase();

  // 공통 베이스 서류 (모든 부서)
  const required: DocItem[] = [
    { code: "BIZ_REG", nameKo: "사업자등록증 사본", issuer: "관할 세무서", status: p.bizRegNo ? "ready" : "todo", validityDays: 90 },
    { code: "TAX_NO_DEBT", nameKo: "국세 완납 증명원", issuer: "국세청", status: "todo", validityDays: 30 },
    { code: "LOCAL_TAX_NO_DEBT", nameKo: "지방세 완납 증명원", issuer: "관할 지방자치단체", status: "todo", validityDays: 30 },
    { code: "EMPLOYEE_PROOF", nameKo: "건강보험 가입자명부 (4대보험)", issuer: "국민건강보험공단", status: "todo", validityDays: 30 },
    { code: "REVENUE_PROOF", nameKo: "최근 3년 재무제표", issuer: "회사 자체", status: "ready", note: `매출 ${(p.annualRevenueKrw / 1e8).toFixed(0)}억 기준` },
  ];

  let optional: DocItem[] = [];
  let recommended: DocItem[] = [];
  const blockers: string[] = [];

  if (dept === "edu") {
    required.push(
      { code: "G2B_REG", nameKo: "나라장터 입찰참가자격 등록증", issuer: "조달청", status: "unknown", note: "사전 등록 필요" },
      { code: "PERF_EDU", nameKo: "유사 교육과정 수행실적 증명서", issuer: "각 발주처", status: p.pastPerformance.length >= 3 ? "ready" : "todo", note: `보유 실적 ${p.pastPerformance.length}건` },
      { code: "INSTRUCTOR_CV", nameKo: "강사진 이력서 (주강사·보조강사)", issuer: "회사 자체", status: p.instructorPool && p.instructorPool.count >= 10 ? "ready" : "todo", note: p.instructorPool ? `${p.instructorPool.count}명 풀` : "강사 풀 미상" },
      { code: "CURRICULUM", nameKo: "교수설계(ISD) + 커리큘럼 + 평가체계", issuer: "회사 자체", status: "todo", note: "RFP 기반 신규 작성" },
      { code: "PRICE_PROPOSAL", nameKo: "가격제안서 + 산출내역서", issuer: "회사 자체", status: "todo" },
      { code: "CREDIT_RATING", nameKo: "신용평가서 (B 이상)", issuer: "기술보증기금/NICE", status: "unknown", validityDays: 90 },
    );
    optional = [
      { code: "LMS_LICENSE", nameKo: "자체 LMS/LXP 라이선스 증빙", issuer: "회사 자체", status: p.contentIp.some(c => c.includes("LXP") || c.includes("LMS")) ? "ready" : "unknown", note: "가점 항목" },
      { code: "INSTRUCTOR_MOU", nameKo: "외부 강사 MOU·계약서", issuer: "회사 자체", status: "unknown", note: "강사 풀 검증" },
    ];
    recommended = [
      { code: "ISO_21001", nameKo: "ISO 21001 (교육조직경영시스템)", issuer: "인증기관", status: p.certifications.some(c => c.includes("ISO")) ? "ready" : "unknown", note: "가점 5점" },
      { code: "EDU_QUALITY", nameKo: "교육서비스품질인증", issuer: "한국능률협회", status: p.certifications.includes("교육서비스품질인증") ? "ready" : "unknown", note: "가점 항목" },
    ];
    if (text.includes("pq") || text.includes("사전심사")) {
      blockers.push("PQ(사전심사) 단계 — 실적증명서·재무서류 사전 발급 필요 (D-14)");
    }
    if (p.pastPerformance.length < 3) {
      blockers.push("유사 실적 부족 — 컨소시엄/협력 검토 필요");
    }
  } else if (dept === "oda") {
    const odaPerfCount = p.pastPerformance.filter(pp => pp.clientType.includes("KOICA") || pp.clientType.includes("ODA")).length;
    required.push(
      { code: "KOICA_REG", nameKo: "KOICA 입찰참가자격 등록증", issuer: "KOICA", status: "unknown", note: "사전 등록 필요" },
      { code: "PERF_ODA", nameKo: "유사 ODA 사업 수행실적 증명서", issuer: "발주처(KOICA/EDCF)", status: odaPerfCount >= 1 ? "ready" : "todo", note: "PQ 핵심 평가" },
      { code: "CONSORTIUM", nameKo: "컨소시엄 협약서 (대표사·구성사 역할분담)", issuer: "회사 자체", status: "todo", note: p.consortiumPartners.length > 0 ? `보유 파트너: ${p.consortiumPartners.slice(0, 2).join(", ")}` : "현지 파트너 발굴 필요" },
      { code: "LOCAL_MOU", nameKo: "현지 파트너 MOU", issuer: "수원국 협력기관", status: "todo", note: "수원국 NGO·정부기관" },
      { code: "TECH_PROPOSAL", nameKo: "기술제안서 (효과성·지속가능성·이양)", issuer: "회사 자체", status: "todo" },
      { code: "PRICE_BOQ", nameKo: "가격제안서 + Bill of Quantities", issuer: "회사 자체", status: "todo" },
      { code: "EN_CV", nameKo: "핵심인력 영문 CV", issuer: "회사 자체", status: "todo", note: "박사·석사 학위증 + 영문 경력" },
      { code: "LANGUAGE_PROOF", nameKo: "영어·현지어 능력 증빙", issuer: "공인 시험기관", status: p.languages.length >= 2 ? "ready" : "unknown", note: `보유 언어: ${p.languages.join(", ") || "미상"}` },
    );
    optional = [
      { code: "PMP", nameKo: "PMP/PRINCE2 자격증", issuer: "PMI 등", status: "unknown", note: "사업관리 가점" },
      { code: "ISO_9001", nameKo: "ISO 9001", issuer: "인증기관", status: p.certifications.some(c => c.includes("ISO")) ? "ready" : "unknown" },
    ];
    recommended = [
      { code: "KCOC", nameKo: "KCOC(한국 NGO 협의회) 회원사 가입증", issuer: "KCOC", status: "unknown", note: "ODA 분야 가점" },
      { code: "LOCAL_REF", nameKo: "수원국 NGO·정부기관 추천서", issuer: "현지 기관", status: "unknown" },
    ];
    blockers.push("PQ 마감 ≠ 본입찰 마감 — 2-단계 일정 별도 관리 필요");
    if (p.consortiumPartners.length === 0) {
      blockers.push("현지 컨소시엄 파트너 부재 — PQ 통과 어려움");
    }
    if (p.languages.length < 2) {
      blockers.push("다국어 인력 풀 미상 — 영어 + 수원국 현지어 확보 필요");
    }
  } else {
    required.push(
      { code: "BIZ_PLAN", nameKo: "사업계획서 (PSST 양식)", issuer: "회사 자체", status: "todo", note: "사업계획서 초안 에이전트 결과 활용" },
    );
    optional = p.certifications.length > 0
      ? p.certifications.map((cert, i) => ({
          code: `CERT_${i}`, nameKo: cert, issuer: "발급기관", status: "ready" as const, note: "보유 인증 활용",
        }))
      : [];
    recommended = [
      { code: "REC_INNOBIZ", nameKo: "이노비즈/메인비즈 인증서", issuer: "중소벤처기업부", status: p.certifications.includes("이노비즈") ? "ready" : "unknown", note: "가점 항목 (5점)" },
      { code: "REC_FINANCIAL", nameKo: "신용평가서 (B 이상)", issuer: "기술보증기금/신용보증기금", status: "unknown", note: "가점 항목" },
      { code: "REC_LAB", nameKo: "부설연구소 인정서", issuer: "한국산업기술진흥협회", status: p.certifications.some(c => c.includes("연구소")) ? "ready" : "unknown", note: "R&D 공고 가점" },
    ];
  }

  if (required.filter(r => r.status === "todo").length > 4) {
    blockers.push(`준비 필요 서류 ${required.filter(r => r.status === "todo").length}건 — 일정 여유 필요`);
  }

  return {
    required, optional, recommended, blockers,
    submissionMethod:
      prog.source === "kstartup" ? "K-Startup 포털 온라인 접수"
      : prog.source === "bizinfo" ? "기업마당 온라인 접수"
      : prog.source === "g2b-edu" || prog.source === "g2b-oda" ? "나라장터(G2B) 전자입찰"
      : prog.source === "koica" ? "KOICA 조달정보시스템 e-procurement"
      : "지정 포털 온라인 접수",
    portalUrl: prog.url ?? undefined,
  };
}

function mockMilestone(p: CompanyProfile, prog: Program) {
  const dept = p.department ?? "planning";
  const req = parseBidRequirements(prog.rawText);

  // deadline 이 잘못된 형식이거나 null 이면 30일 후 기본값
  let dl = prog.deadline ? new Date(prog.deadline) : new Date(Date.now() + 30 * 86400_000);
  if (Number.isNaN(dl.getTime())) {
    dl = new Date(Date.now() + 30 * 86400_000);
  }
  const deadline = dl.toISOString().slice(0, 10);
  const mk = (days: number, title: string, owner: "신청자" | "대표" | "외부", deliverables: string[], dependsOnDocs: string[] = []) => ({
    date: new Date(dl.getTime() - days * 86400_000).toISOString().slice(0, 10),
    daysBeforeDeadline: days,
    titleKo: title,
    owner,
    deliverables,
    dependsOnDocs,
  });

  let milestones: ReturnType<typeof mk>[];
  let totalDays = 30;
  let criticalPathNotes = "";

  if (dept === "edu") {
    // G2B 교육 위탁용역 — RFP 응답형
    milestones = [
      mk(21, "공고 분석 · RFP 정독 · 참가의향 결정", "대표", ["참가 결정서"]),
      mk(14, "강사진 섭외 · MOU · 견적 수집", "신청자", ["강사 MOU 초안", "외부 견적서"], ["강사 풀 리스트"]),
      mk(10, "교수설계(ISD) · 커리큘럼 초안", "신청자", ["커리큘럼 매트릭스", "주차별 교안"]),
      mk(7,  "기술제안서 · 가격제안서 초안", "신청자", ["기술제안서 v0.5", "산출내역서"]),
      mk(5,  "제안설명회 자료 · 시연 영상", "신청자", ["설명회 PPT", "시연 영상 5분"]),
      mk(3,  "내부 검토 · 견적 확정", "대표", ["최종 기술제안서", "최종 가격제안서"]),
      mk(1,  "제안서 최종본 · 전자입찰 파일 패키징", "신청자", ["입찰 파일 ZIP"]),
      mk(0,  "나라장터 전자입찰 마감 — 제출 완료", "신청자", ["입찰접수증"]),
    ];
    totalDays = 21;
    criticalPathNotes = "교수설계(D-10~D-7)와 강사진 MOU(D-14~D-10)가 critical path. **본입찰 후** 평가(약 D+7~14) → 우선협상 → 계약 단계가 별도 진행됨. 자체 LMS 인프라(코스모스 LXP) 시연 영상이 가산점 포인트.";
  } else if (dept === "oda") {
    // KOICA/EDCF — PQ + 본입찰 2단계
    // PQ 마감이 추출되면 본입찰 마감 - 21일 추정, 아니면 - 30일 추정
    const pqGap = req.pqDeadline
      ? Math.max(1, Math.ceil((dl.getTime() - new Date(req.pqDeadline).getTime()) / 86400_000))
      : 30;
    milestones = [
      mk(pqGap + 21, "[PQ-21] 공고 분석 · 컨소시엄 의향타진", "대표", ["컨소시엄 협의록"]),
      mk(pqGap + 14, "[PQ-14] 컨소시엄 협약 · 현지 파트너 MOU", "신청자", ["컨소시엄 협약서", "현지 MOU"], ["대표사·구성사 정관"]),
      mk(pqGap + 7,  "[PQ-7] PQ 신청서 · 실적증명 · 재무서류", "신청자", ["PQ 신청서", "ODA 실적증명서", "재무제표"]),
      mk(pqGap + 1,  "[PQ-1] PQ 최종 점검 · 발송 준비", "신청자", ["PQ 최종본"]),
      mk(pqGap,      "[PQ-0] PQ 마감 (사전심사 신청)", "신청자", ["PQ 접수증"]),
      mk(21, "PQ 통과 후 RFP 정독 · 기술팀 구성", "대표", ["역할분담표"]),
      mk(14, "기술제안서 초안 · 현지조사", "신청자", ["기술제안서 v0.5", "현지조사 보고서"]),
      mk(7,  "가격제안서 · BoQ · 내부 검토", "신청자", ["가격제안서", "Bill of Quantities"]),
      mk(1,  "제안서 최종 패키징 (영문 CV 포함)", "신청자", ["최종 제안서 PDF", "영문 CV 패키지"]),
      mk(0,  "본입찰 마감 — KOICA e-procurement 제출", "신청자", ["입찰 접수증"]),
    ];
    totalDays = pqGap + 21;
    criticalPathNotes = `**2-단계 입찰**: PQ 마감(D-${pqGap}) → 본입찰 마감(D-0). 컨소시엄 협약·현지 MOU 발급(D-PQ-14~D-PQ-7)이 PQ critical path. 본입찰 후 우선협상(약 1~2개월) → 계약 → 사업 착수 단계가 별도. ${req.isInternationalCompetition ? "**국제경쟁** 입찰이므로 영어 + 현지어 모든 제안서 동시 제출 권장." : ""}`;
  } else {
    // planning — 기존 지원금 로직 유지
    milestones = [
      mk(30, "공고 분석 및 자격 확인", "신청자", ["자격평가 보고서"]),
      mk(21, "사업계획서 초안 작성", "신청자", ["PSST 4섹션 초안"]),
      mk(14, "필수 서류 발급 시작", "신청자", ["국세·지방세 완납 증명원", "건강보험 가입자명부"]),
      mk(7,  "사업계획서 검토 및 보완", "대표", ["최종 사업계획서"]),
      mk(3,  "외부 검토 및 자문", "외부", ["검토 의견서"]),
      mk(1,  "최종 점검 및 업로드 준비", "신청자", ["체크리스트 완료"]),
      mk(0,  "공고 마감 — 제출 완료", "신청자", ["접수증"]),
    ];
    totalDays = 30;
    criticalPathNotes = `사업계획서 초안 작성(D-21~D-7)이 critical path. 서류 발급(D-14~D-7)이 병렬로 진행되어야 마감일 위험을 최소화할 수 있다.`;
  }

  return {
    deadline,
    totalDays,
    milestones,
    criticalPathNotes,
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
