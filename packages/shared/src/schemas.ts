import { z } from "zod";

// ── 공통 ─────────────────────────────────────────────────────────────
export const SourceEnum = z.enum(["bizinfo", "kstartup", "smes24", "datagokr", "fixture"]);
export type Source = z.infer<typeof SourceEnum>;

export const StageEnum = z.enum(["예비", "초기", "도약", "중기"]);
export const VerdictEnum = z.enum(["적합", "부분적합", "부적합"]);
export const PostStatusEnum = z.enum(["queued", "running", "completed", "failed"]);
export const AgentIdEnum = z.enum(["eligibility", "plan-draft", "doc-checklist", "milestone"]);

// ── 공고 ─────────────────────────────────────────────────────────────
export const ProgramSchema = z.object({
  id: z.string(),                              // {source}:{programId}
  source: SourceEnum,
  programId: z.string(),
  title: z.string(),
  agency: z.string().nullable(),
  region: z.string().nullable(),
  industry: z.string().nullable(),
  field: z.string().nullable(),
  deadline: z.string().nullable(),             // ISO date
  url: z.string().nullable(),
  summary: z.string().nullable(),
  rawText: z.string(),
});
export type Program = z.infer<typeof ProgramSchema>;

// ── 회사 프로파일 ───────────────────────────────────────────────────
export const CompanyProfileSchema = z.object({
  companyName: z.string(),
  bizRegNo: z.string().optional(),
  industry: z.string(),
  industryCode: z.string().optional(),
  employeeCount: z.number(),
  annualRevenueKrw: z.number(),
  foundedYear: z.number(),
  region: z.string(),
  stage: StageEnum,
  keywords: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  representativeAge: z.number().optional(),
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

// ── 검색 입력 ───────────────────────────────────────────────────────
export const SearchFiltersSchema = z.object({
  keyword: z.string().optional(),
  region: z.string().optional(),
  industry: z.string().optional(),
  field: z.enum(["창업", "금융", "기술", "인력", "수출", "내수", "경영", "기타"]).optional(),
  deadlineBefore: z.string().optional(),       // ISO date
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

// ── 에이전트 1: 자격평가 ────────────────────────────────────────────
export const EligibilityPostSchema = z.object({
  verdict: VerdictEnum,
  score: z.number().min(0).max(100),
  matchedCriteria: z.array(z.string()),
  unmetCriteria: z.array(z.string()),
  uncertain: z.array(z.string()),
  axes: z.array(z.object({
    name: z.string(),
    score: z.number(),
    max: z.number(),
    comment: z.string(),
  })).default([]),
  riskFlags: z.array(z.string()),
  recommendation: z.string(),
  reasoning: z.string(),
});
export type EligibilityPost = z.infer<typeof EligibilityPostSchema>;

// ── 에이전트 2: 사업계획서 초안 ─────────────────────────────────────
export const PlanDraftPostSchema = z.object({
  problem: z.string(),
  solution: z.string(),
  scaleUp: z.string(),
  team: z.string(),
  summary3line: z.string(),
  wordCount: z.number(),
  warnings: z.array(z.string()).default([]),
});
export type PlanDraftPost = z.infer<typeof PlanDraftPostSchema>;

// ── 에이전트 3: 서류 체크리스트 ─────────────────────────────────────
export const DocItemSchema = z.object({
  code: z.string(),
  nameKo: z.string(),
  issuer: z.string(),
  validityDays: z.number().optional(),
  status: z.enum(["ready", "todo", "unknown"]),
  note: z.string().optional(),
});
export type DocItem = z.infer<typeof DocItemSchema>;

export const ChecklistPostSchema = z.object({
  required: z.array(DocItemSchema),
  optional: z.array(DocItemSchema),
  recommended: z.array(DocItemSchema),
  blockers: z.array(z.string()),
  submissionMethod: z.string(),
  portalUrl: z.string().optional(),
});
export type ChecklistPost = z.infer<typeof ChecklistPostSchema>;

// ── 에이전트 4: 마일스톤 일정표 ─────────────────────────────────────
export const MilestoneSchema = z.object({
  date: z.string(),                            // YYYY-MM-DD 또는 자유 형식 (검증 시 강제 안 함)
  daysBeforeDeadline: z.number().int(),        // 정수
  titleKo: z.string().min(1),
  owner: z.string().min(1),                    // 신청자/대표/외부 권장하지만 자유 입력 허용
  deliverables: z.array(z.string()).default([]),
  dependsOnDocs: z.array(z.string()).default([]),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const SchedulePostSchema = z.object({
  deadline: z.string(),
  totalDays: z.number(),
  milestones: z.array(MilestoneSchema).min(1),
  criticalPathNotes: z.string().default(""),
  holidayAdjustments: z.array(z.string()).default([]),
});
export type SchedulePost = z.infer<typeof SchedulePostSchema>;

// ── 페이로드 union ──────────────────────────────────────────────────
export const AGENT_PAYLOAD_SCHEMAS = {
  eligibility: EligibilityPostSchema,
  "plan-draft": PlanDraftPostSchema,
  "doc-checklist": ChecklistPostSchema,
  milestone: SchedulePostSchema,
} as const;

export type AgentId = keyof typeof AGENT_PAYLOAD_SCHEMAS;

// ── DB 행 (orchestrator API 응답 모양) ──────────────────────────────
export const PostRowSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  runId: z.string(),
  agentId: AgentIdEnum,
  title: z.string(),
  bodyMd: z.string(),
  payload: z.unknown(),
  createdAt: z.string(),
});
export type PostRow = z.infer<typeof PostRowSchema>;

export const CaseSchema = z.object({
  id: z.string(),
  companyProfileId: z.string(),
  programId: z.string(),
  bulkRunId: z.string().nullable(),
  status: z.enum(["open", "complete", "partial"]),
  createdAt: z.string(),
});
export type Case = z.infer<typeof CaseSchema>;

// ── 에이전트 정의 (sonol-style) ─────────────────────────────────────
export const ProviderEnum = z.enum(["anthropic", "gemini"]);
export type Provider = z.infer<typeof ProviderEnum>;

export const AgentDefinitionSchema = z.object({
  agent_id: AgentIdEnum,
  name: z.string(),
  role: z.string(),
  provider: ProviderEnum.default("anthropic"),
  model: z.string(),
  max_tokens: z.number().int().default(4096),
  temperature: z.number().min(0).max(1).default(0.2),
  system_prompt_path: z.string(),
  tool_names: z.array(z.string()),
  depends_on: z.array(AgentIdEnum).default([]),
  output_schema: z.string(),                   // 스키마 이름 (e.g. "EligibilityPost")
  post_title_template: z.string(),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
