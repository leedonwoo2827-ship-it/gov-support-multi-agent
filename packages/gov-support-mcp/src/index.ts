// 14개 도구 + 검색 + 클라이언트 일괄 export
// 오케스트레이터에서 직접 import 해서 HTTP hop 없이 호출.

// ── 자격평가 ──────────────────────────────────────────────────────────
export {
  CheckEligibilitySchema,
  type CheckEligibilityInput,
  handleCheckEligibility,
} from "./govSupport/tools/eligibility.js";

export {
  EvaluateStartupSchema,
  type EvaluateStartupInput,
  handleEvaluateStartup,
} from "./govSupport/tools/evaluateStartup.js";

// ── 사업계획서 ────────────────────────────────────────────────────────
export {
  DraftBusinessPlanSchema,
  type DraftBusinessPlanInput,
  handleDraftBusinessPlan,
  DraftSettlementReportSchema,
  type DraftSettlementReportInput,
  handleDraftSettlementReport,
} from "./govSupport/tools/draftTools.js";

export {
  AssessQualitySchema,
  type AssessQualityInput,
  handleAssessQuality,
} from "./govSupport/tools/assessQuality.js";

// ── 서류 체크리스트 ───────────────────────────────────────────────────
export {
  GenerateDocumentChecklistSchema,
  type GenerateDocumentChecklistInput,
  handleGenerateDocumentChecklist,
} from "./govSupport/tools/documentChecklist.js";

// ── 일정/타임라인 ─────────────────────────────────────────────────────
export {
  BuildApplicationTimelineSchema,
  type BuildApplicationTimelineInput,
  handleBuildApplicationTimeline,
} from "./govSupport/tools/timeline.js";

// ── 통합 검색 ─────────────────────────────────────────────────────────
export {
  SearchGovSupportSchema,
  type SearchGovSupportInput,
  type ApiKeys,
  type UnifiedSearchResult,
  searchGovernmentSupport,
} from "./govSupport/tools/unifiedSearch.js";

export {
  CompareByRegionSchema,
  type CompareByRegionInput,
  handleCompareByRegion,
} from "./govSupport/tools/compareByRegion.js";

// ── 알림/수혜 관리 ────────────────────────────────────────────────────
export {
  ManageAlertProfileSchema,
  type ManageAlertProfileInput,
  handleManageAlertProfile,
} from "./govSupport/tools/alertProfile.js";

export {
  ManageBenefitHistorySchema,
  type ManageBenefitHistoryInput,
  handleManageBenefitHistory,
} from "./govSupport/tools/benefitHistory.js";

// ── 클라이언트 (raw API 직접 호출용) ──────────────────────────────────
export { fetchBizinfoList } from "./govSupport/clients/bizinfoSupport.js";
export { fetchKstartupList } from "./govSupport/clients/kstartupSupport.js";
export { fetchExtPblancInfo } from "./govSupport/clients/smes24PublicNotice.js";
export { fetchG2bBidList } from "./govSupport/clients/g2bBids.js";
export { fetchKoicaOdaList, fetchKoicaVltrnCntrctList } from "./govSupport/clients/koicaOda.js";
export { fetchG2bScsbidList } from "./govSupport/clients/g2bScsbid.js";

// ── 신규 데이터 타입 ─────────────────────────────────────────────────
export type { G2bBidItem, G2bFetchParams, G2bFetchResult } from "./govSupport/types/g2b.js";
export type {
  KoicaOdaItem, KoicaFetchParams, KoicaFetchResult,
  KoicaVltrnCntrctItem, KoicaVltrnFetchParams, KoicaVltrnFetchResult,
} from "./govSupport/types/koica.js";
export type { G2bScsbidItem, G2bScsbidFetchParams, G2bScsbidFetchResult } from "./govSupport/types/g2bScsbid.js";

// ── 정규화/디듑 ──────────────────────────────────────────────────────
export {
  deduplicate,
  normalizeBizinfo,
  normalizeKstartup,
  normalizeSmes24,
  type NormalizedAnnouncement,
} from "./govSupport/core/dedup.js";

// ── 도구 메타 (오케스트레이터에서 Anthropic tool 정의 변환용) ─────────
export const TOOL_META: Record<string, { description: string }> = {
  checkEligibility: {
    description: "공고 텍스트와 회사 프로파일을 분석해 자격 충족 여부, 미충족 조건, 보류 항목을 분류한다.",
  },
  evaluateStartupApplication: {
    description: "창업지원사업 5축 평가(문제인식·실현가능성·성장전략·팀구성·정량지표) 점수를 산출한다.",
  },
  draftBusinessPlan: {
    description: "PSST(문제·해결·성장·팀) 4섹션 사업계획서 한국어 초안을 생성한다.",
  },
  generateDocumentChecklist: {
    description: "공고에서 요구하는 필수/선택/권장 서류 목록을 추출한다.",
  },
  buildApplicationTimeline: {
    description: "마감일 역산으로 D-30, D-14, D-7, D-1, 제출일 마일스톤 일정을 생성한다.",
  },
  searchGovernmentSupport: {
    description: "bizinfo + K-Startup + smes24 3개 소스를 병렬 검색하고 중복 제거한다.",
  },
  compareByRegion: {
    description: "지역별 공고를 비교한다.",
  },
  assessBusinessPlanQuality: {
    description: "작성된 사업계획서의 품질을 공식 평가 기준 대비 점수화한다.",
  },
};
