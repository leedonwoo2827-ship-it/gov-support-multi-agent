# Gov-Support 멀티에이전트 대시보드 PoC — 재구축 플랜

## Context

이전 PoC는 TypeScript MCP 서버(14개 정부지원 API 도구) 위에 단일 챗플로우를 얹은 구조였다.
14개 도구 결과가 한 채팅창에 섞여 나와서 시연 임팩트가 약했고("구려서"), 비동기/병렬/구조화된 출력이 없었다.

이번 재구축의 목표:
- 정부24/K-Startup 풍 **대시보드**에서 공고를 **검색 → 체크박스로 선택**
- 선택한 공고 각각에 대해 **4개 전문가 에이전트**가 병렬 실행되어 결과를 **게시판처럼 쌓음**
- 모든 데이터(공고 목록 + 에이전트 게시글)를 **SQLite에 영구 저장**, **.db 파일과 JSON/CSV 다운로드** 가능
- 한국어 UI, 한국어 출력, 시연 1.5~2일 내 완성

4개 전문가 에이전트:
1. **자격평가** (Eligibility Assessment) — 회사 프로파일 × 공고 → 적합/부분/부적합 + 5축 점수
2. **사업계획서 초안** (Business Plan Draft) — PSST 4섹션 한국어 초안
3. **서류 체크리스트** (Document Checklist) — 필수/선택/권장 서류 + 보유 상태
4. **단계별 마일스톤 일정표** (Milestone Schedule) — 마감 역산 D-30/D-14/D-7/D-1 일정

참고 아키텍처: [sonol-multi-agent](https://github.com/volition79/sonol-multi-agent) — 선언형 JSON 에이전트 정의 + SQLite events 테이블을 게시판으로 사용하는 패턴을 차용.

## 아키텍처

세 개 프로세스, 단일 monorepo (pnpm workspaces):

```
[브라우저]  ─SSE/REST─►  [orchestrator :8787]  ─함수 호출─►  [@gov/mcp-tools (라이브러리)]
   │                          │                                       │
   │                          ▼                                       ▼
   └─Next.js 3000      [SQLite gov.db]                       [정부 API: bizinfo, K-Startup, data.go.kr]
```

핵심 결정:
- 기존 TS MCP 서버는 **HTTP 서버가 아니라 라이브러리(`@gov/mcp-tools`)** 로 변환해 직접 import → 8765 포트 hop 제거, ~80ms 절약
- DB는 `better-sqlite3` 단일 파일 (`data/gov.db`) → `.db` 그대로 다운로드 가능
- 에이전트 정의는 `agents/*.json` (sonol 스타일) + 한국어 프롬프트는 `prompts/*.ko.md` 로 분리
- 검색 결과 캐싱은 **request-key 기반**: 동일 쿼리는 SQLite에서 즉답, TTL 24h 후 재요청

## 파일 트리

```
260508-multi-agent/
├── pnpm-workspace.yaml
├── package.json                           # scripts: dev, build, test
├── tsconfig.base.json
├── .env.example                           # ANTHROPIC_API_KEY, BIZINFO_KEY, KSTARTUP_KEY
├── data/
│   └── gov.db                             # SQLite 파일 (다운로드 대상)
├── packages/
│   ├── gov-support-mcp/                   # 기존 gov_support_mcp/ 복사 + 배럴 추가
│   │   ├── src/
│   │   │   ├── index.ts                   # NEW: 14개 tool fn + Zod 스키마 re-export
│   │   │   ├── govSupport/
│   │   │   │   ├── tools/                 # eligibility, draftTools, documentChecklist, timeline, evaluateStartup …
│   │   │   │   ├── clients/               # bizinfoSupport, kstartupSupport, smes24
│   │   │   │   └── core/                  # store, dedup, cache
│   │   │   └── utils/logger.ts
│   │   ├── tests/                         # 기존 13개 테스트 그대로 통과
│   │   └── package.json                   # name: "@gov/mcp-tools"
│   ├── shared/
│   │   └── src/
│   │       ├── schemas.ts                 # Case, Post, 4개 Payload Zod 스키마
│   │       └── agentDef.ts                # AgentDefinition Zod
│   └── orchestrator/
│       ├── agents/                        # 선언형 정의
│       │   ├── eligibility.json
│       │   ├── plan-draft.json
│       │   ├── doc-checklist.json
│       │   └── milestone.json
│       ├── prompts/                       # 한국어 system prompt
│       │   ├── eligibility.ko.md
│       │   ├── plan-draft.ko.md
│       │   ├── doc-checklist.ko.md
│       │   └── milestone.ko.md
│       ├── src/
│       │   ├── server.ts                  # Hono :8787, CORS, SSE
│       │   ├── db/
│       │   │   ├── schema.sql             # DDL
│       │   │   └── client.ts              # better-sqlite3 + prepared stmts
│       │   ├── routes/
│       │   │   ├── search.ts              # /api/search (캐시 우선)
│       │   │   ├── cases.ts               # /api/cases
│       │   │   ├── posts.ts               # /api/posts, /api/cases/:id/posts
│       │   │   ├── runs.ts                # /api/runs, /api/runs/bulk
│       │   │   ├── events.ts              # /api/events SSE
│       │   │   └── export.ts              # /api/export/db, /export/csv, /export/json
│       │   ├── board/{posts,events,runs,searchCache}.ts
│       │   ├── agents/
│       │   │   ├── loader.ts              # JSON + Zod 검증
│       │   │   ├── runner.ts              # Anthropic 스트리밍 + tool loop
│       │   │   ├── toolBridge.ts          # @gov/mcp-tools 직접 호출
│       │   │   └── orchestrator.ts        # bulk fan-out (체크된 공고 × 4 에이전트)
│       │   └── lib/{ulid,cost,sse}.ts
│       ├── tests/
│       └── package.json
└── apps/
    └── web/                               # Next.js 15 app router
        ├── app/
        │   ├── layout.tsx                 # Pretendard, ko-KR
        │   ├── page.tsx                   # 대시보드 (검색 + 체크 + 게시판)
        │   ├── cases/[id]/page.tsx        # 케이스 상세 (4개 게시글)
        │   └── api/proxy/[...path]/route.ts
        ├── components/
        │   ├── SearchBar.tsx              # 좌측 필터 + 키워드
        │   ├── ProgramTable.tsx           # 체크박스 + 페이지네이션
        │   ├── ActionBar.tsx              # [전략 분석] [DB 다운로드] [CSV]
        │   ├── BoardGrid.tsx              # 하단 4분할 게시판 (에이전트별 컬럼)
        │   ├── PostCard.tsx               # 게시글 카드 (상태 뱃지 + 펼치기)
        │   ├── views/{Eligibility,PlanDraft,Checklist,Schedule}View.tsx
        │   └── useEventStream.ts          # SSE 훅
        └── lib/api.ts
```

## SQLite DDL (`packages/orchestrator/src/db/schema.sql`)

```sql
-- 공고 검색 결과 캐시 (다운로드 대상 1)
CREATE TABLE programs (
  id TEXT PRIMARY KEY,                    -- {source}:{program_id}
  source TEXT NOT NULL,                   -- bizinfo|kstartup|datagokr
  program_id TEXT NOT NULL,
  title TEXT NOT NULL,
  agency TEXT,
  region TEXT,
  industry TEXT,
  deadline TEXT,                          -- ISO date
  url TEXT,
  raw_json TEXT NOT NULL,                 -- 원본 응답
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_programs_deadline ON programs(deadline);
CREATE INDEX idx_programs_source ON programs(source);

-- 검색 쿼리 → 결과 매핑
CREATE TABLE search_queries (
  id TEXT PRIMARY KEY,                    -- ULID
  query_key TEXT UNIQUE NOT NULL,         -- normalized JSON of filters
  filters_json TEXT NOT NULL,
  program_ids_json TEXT NOT NULL,         -- [program.id, ...]
  total INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 회사 프로파일 (단일 사용자 PoC라 1행 가정)
CREATE TABLE company_profiles (
  id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 케이스 = (회사 × 공고) 한 쌍에 대한 분석 단위
CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  company_profile_id TEXT NOT NULL REFERENCES company_profiles(id),
  program_id TEXT NOT NULL REFERENCES programs(id),
  bulk_run_id TEXT,                       -- 일괄 실행 묶음
  status TEXT NOT NULL DEFAULT 'open',    -- open|complete|partial
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_cases_bulk ON cases(bulk_run_id);

-- 에이전트 실행 단위
CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,                 -- eligibility|plan-draft|doc-checklist|milestone
  status TEXT NOT NULL,                   -- queued|running|completed|failed
  model TEXT NOT NULL,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_krw REAL DEFAULT 0,
  started_at TEXT, finished_at TEXT,
  error_text TEXT,
  UNIQUE(case_id, agent_id)
);

-- 게시판 글 (다운로드 대상 2)
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES agent_runs(id),
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,                    -- "[자격평가] 2026 스마트팩토리 …"
  body_md TEXT NOT NULL,                  -- 한국어 마크다운 본문
  payload_json TEXT NOT NULL,             -- Zod 검증된 구조화 출력
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_posts_case ON posts(case_id, created_at DESC);
CREATE INDEX idx_posts_agent ON posts(agent_id, created_at DESC);

-- sonol-style 이벤트 로그 (SSE 소스)
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT,
  run_id TEXT,
  agent_id TEXT,
  kind TEXT NOT NULL,                     -- progress|tool_call|tool_result|artifact|completion|error
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_case ON events(case_id, id);

-- bulk run 묶음 (체크박스로 N개 공고 선택해 [전략 분석] 누른 단위)
CREATE TABLE bulk_runs (
  id TEXT PRIMARY KEY,
  case_ids_json TEXT NOT NULL,
  total_agents INTEGER NOT NULL,          -- N공고 × 4
  completed INTEGER DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
```

## Zod 페이로드 스키마 (`packages/shared/src/schemas.ts`)

```ts
// 입력
export const CompanyProfileSchema = z.object({
  companyName: z.string(),
  bizRegNo: z.string().optional(),
  industry: z.string(),
  industryCode: z.string().optional(),
  employeeCount: z.number(),
  annualRevenueKrw: z.number(),
  foundedYear: z.number(),
  region: z.string(),
  stage: z.enum(['예비', '초기', '도약', '중기']),
  keywords: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
});

// 1. 자격평가
export const EligibilityPostSchema = z.object({
  verdict: z.enum(['적합', '부분적합', '부적합']),
  score: z.number().min(0).max(100),
  matchedCriteria: z.array(z.string()),     // 충족 요건
  unmetCriteria: z.array(z.string()),       // 미충족
  uncertain: z.array(z.string()),           // 보류 (추측 금지)
  axes: z.array(z.object({                  // 5축 점수 (창업지원사업일 때)
    name: z.string(), score: z.number(), max: z.number(), comment: z.string(),
  })).default([]),
  riskFlags: z.array(z.string()),
  recommendation: z.string(),               // 권고
  reasoning: z.string(),                    // 근거 (markdown)
});

// 2. 사업계획서 초안 (PSST)
export const PlanDraftPostSchema = z.object({
  problem: z.string(),    // P 문제 인식
  solution: z.string(),   // S 실현 가능성
  scaleUp: z.string(),    // S 성장 전략
  team: z.string(),       // T 팀 구성
  summary3line: z.string(),
  wordCount: z.number(),
  warnings: z.array(z.string()),            // 추측 데이터 사용 경고
});

// 3. 서류 체크리스트
export const DocItemSchema = z.object({
  code: z.string(), nameKo: z.string(),
  issuer: z.string(),                       // 발급기관
  validityDays: z.number().optional(),
  status: z.enum(['ready', 'todo', 'unknown']),
  note: z.string().optional(),
});
export const ChecklistPostSchema = z.object({
  required: z.array(DocItemSchema),
  optional: z.array(DocItemSchema),
  recommended: z.array(DocItemSchema),
  blockers: z.array(z.string()),
  submissionMethod: z.string(),
  portalUrl: z.string().optional(),
});

// 4. 마일스톤 일정표
export const MilestoneSchema = z.object({
  date: z.string(),                         // ISO date
  daysBeforeDeadline: z.number(),
  titleKo: z.string(),
  owner: z.enum(['신청자', '대표', '외부']),
  deliverables: z.array(z.string()),
  dependsOnDocs: z.array(z.string()).default([]),
});
export const SchedulePostSchema = z.object({
  deadline: z.string(),
  totalDays: z.number(),
  milestones: z.array(MilestoneSchema),     // 역시계열
  criticalPathNotes: z.string(),
  holidayAdjustments: z.array(z.string()),
});
```

## 에이전트 선언 정의 (예: `agents/eligibility.json`)

```json
{
  "agent_id": "eligibility",
  "name": "자격평가",
  "role": "정부지원 공고와 회사 프로파일을 대조해 자격 충족 여부와 심사 점수를 판정한다.",
  "model": "claude-opus-4-7",
  "max_tokens": 4096,
  "temperature": 0.2,
  "system_prompt_path": "prompts/eligibility.ko.md",
  "tool_names": ["checkEligibility", "evaluateStartupApplication", "searchGovernmentSupport"],
  "depends_on": [],
  "output_schema": "EligibilityPost",
  "post_title_template": "[자격평가] {{program.title}}"
}
```

나머지 셋도 같은 shape:
- `plan-draft.json`: model `claude-opus-4-7`, tools `["draftBusinessPlan", "search_gov_support_bizinfo"]`
- `doc-checklist.json`: model `claude-sonnet-4-6`, tools `["generateDocumentChecklist"]`
- `milestone.json`: model `claude-sonnet-4-6`, tools `["buildApplicationTimeline"]`

자격평가/사업계획서는 추론 깊이가 필요하므로 Opus 4.7, 체크리스트/일정은 구조화 추출이라 Sonnet 4.6 (비용 절감).

## 한국어 시스템 프롬프트 골격

`prompts/eligibility.ko.md`:
```
당신은 한국 정부지원사업 자격평가 전문가입니다.

## 임무
회사 프로파일과 대상 공고를 대조해 자격 충족 여부, 심사 점수, 보완 권고를 산출합니다.

## 작업 절차
1. checkEligibility 도구로 충족/미충족/보류 조건을 분류하라.
2. 창업지원사업이면 evaluateStartupApplication 도구로 5축 점수를 산출하라.
3. 필요 시 searchGovernmentSupport 도구로 유사 공고 정보를 보강하라.
4. 모든 분석을 끝낸 뒤 emit_result 도구로 EligibilityPost 스키마에 맞춰 결과를 반환하라.

## 출력 규칙
- 모든 텍스트는 한국어, "결론 → 근거 → 권고" 순서.
- 추측 금지: 도구 결과에 없는 항목은 uncertain 배열에 명시.
- 임의 매출/규모 수치 생성 금지.
```

(나머지 셋은 동일한 5섹션 구조 — 임무/절차/출력 규칙 — 으로 작성, 도구 이름과 출력 스키마만 교체)

## 게시판 운영 흐름 (사용자 답변 반영)

> 검색 후 N개 공고 체크 → [전략 분석] 클릭 → 공고 N개 × 에이전트 4개 = 4N개 게시글이 게시판에 쌓임

`POST /api/runs/bulk` 가 받는 입력: `{ companyProfileId, programIds: [...] }`
1. 각 `programId` 마다 `cases` 행 생성 (없으면) → `case_ids` 배열
2. `bulk_runs` 1행 생성 (`total_agents = N × 4`)
3. 각 case 마다 4개 에이전트 `Promise.all` fan-out
4. 에이전트 `runner.ts` 가 Anthropic streaming + tool loop 실행, 진행률을 `events` 테이블에 append + EventEmitter 로 SSE 전송
5. `emit_result` synthetic tool 로 강제된 JSON 검증 통과 시 `posts` 행 insert + `events: artifact` + `events: completion`
6. 모든 4N 게시글 완료 시 `bulk_runs.finished_at` 업데이트

`emit_result` synthetic tool 트릭: 각 에이전트 마지막에 `tool_choice: {type:'tool', name:'emit_<agent>'}` 로 forced tool-use를 걸고 `input_schema = zodToJsonSchema(payloadSchema)` 를 넘긴다 → "모델이 산문 둘러쌌네" 실패 모드 제거.

## REST API 표면 (Hono)

```ts
// search.ts — 검색 (SQLite 캐시 우선, miss 시 정부 API)
app.post('/api/search', zValidator('json', SearchFiltersSchema), c => searchPrograms(c))
// → { queryId, total, programs: [...] }

// cases.ts
app.post('/api/cases',                c => createCase(c))                       // {programId, profileId} → caseId
app.get ('/api/cases/:id',            c => getCaseDetail(c))                    // 케이스 + 4개 게시글
app.get ('/api/cases',                c => listCases(c))                        // 페이지네이션

// runs.ts
app.post('/api/runs/bulk',            c => orchestrator.runBulk(c))             // {profileId, programIds:[]}
app.post('/api/cases/:id/run',        c => orchestrator.runAllForCase(c))       // 단일 케이스 4개 fan-out
app.post('/api/cases/:id/agents/:name/run', c => orchestrator.runOne(c))        // 단일 에이전트 재실행
app.get ('/api/runs/:id',             c => getBulkRun(c))                       // 진행률 폴링

// posts.ts
app.get ('/api/posts',                c => listPosts(c))                        // 전체 게시판 (필터: agentId, caseId)
app.get ('/api/posts/:id',            c => getPost(c))

// events.ts
app.get ('/api/events',               c => streamSSE(c))                        // 모든 이벤트 SSE
app.get ('/api/cases/:id/events',     c => streamSSE(c, { caseId }))            // 케이스별 SSE

// export.ts ★사용자 요청 핵심
app.get ('/api/export/db',            c => downloadDbFile(c))                   // gov.db 바이너리
app.get ('/api/export/programs.csv',  c => exportProgramsCsv(c))                // 검색 결과 CSV
app.get ('/api/export/posts.csv',     c => exportPostsCsv(c))                   // 게시판 CSV
app.get ('/api/export/cases/:id.json',c => exportCaseJson(c))                   // 케이스 통합 JSON
app.get ('/api/export/cases/:id.md',  c => exportCaseMarkdown(c))               // 케이스 통합 마크다운
```

## 대시보드 UI (정부24 풍, 단일 페이지)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 정부지원사업 멀티에이전트 분석 대시보드                       회사: ㈜오비온  │
├──────────────┬─────────────────────────────────────────────────────────────┤
│ ◀ 검색       │ □ 공고명               기관     마감     지역  업종   상태  │
│ 키워드 [___] │ ☑ 2026 스마트팩토리…   중기부   D-22    전국  제조   적합  │
│ 지역  ▼      │ ☑ AI바우처 2026        정통부   D-15    전국  AI    부분  │
│ 업종  ▼      │ □ 청년창업사관학교     중진공   D-30    수도권 IT    -    │
│ 마감  ▼      │ … (페이지네이션)                                            │
│ 단계  ▼      │                                                             │
│              │ [전략 분석 (선택 2건 × 4에이전트 = 8글)]  [DB ↓] [CSV ↓]    │
├──────────────┴─────────────────────────────────────────────────────────────┤
│ 게시판  ▼ 최신순       필터: [자격평가] [사업계획서] [체크리스트] [일정]    │
│ ┌─[자격평가]─────┐ ┌─[사업계획서]──┐ ┌─[체크리스트]──┐ ┌─[일정표]────────┐ │
│ │ 스마트팩토리   │ │ 스마트팩토리  │ │ 스마트팩토리  │ │ 스마트팩토리    │ │
│ │ 적합 78점 ✅   │ │ PSST 4섹션 ✅ │ │ 필수 7건 ✅   │ │ 9단계 일정 ✅   │ │
│ │ 충족 5/미충족2 │ │ 1,840자       │ │ 보유 4/미보유3│ │ D-22 ~ 제출일   │ │
│ │ [상세보기]     │ │ [상세보기]    │ │ [상세보기]    │ │ [상세보기]      │ │
│ ├────────────────┤ ├───────────────┤ ├───────────────┤ ├─────────────────┤ │
│ │ AI바우처       │ │ AI바우처      │ │ AI바우처      │ │ AI바우처        │ │
│ │ 부분적합 62 ⚠ │ │ 실행 중 ⏳    │ │ 실행 중 ⏳    │ │ 대기 …          │ │
│ └────────────────┘ └───────────────┘ └───────────────┘ └─────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

핵심 컴포넌트:
- `SearchBar` (좌) — 키워드 + 지역/업종/마감/단계 드롭다운, `POST /api/search` 호출
- `ProgramTable` (우상) — TanStack Table, 행 체크박스, 헤더 [전략 분석] 버튼
- `BoardGrid` (하단) — 4열 그리드, 에이전트별 컬럼, `PostCard` 카드, SSE 로 실시간 상태 갱신
- `PostCard` — 상태 뱃지 (대기/실행 중/완료/실패) + 한 줄 요약 + 펼치기 (`EligibilityView` 등)
- 우상단 액션 — `[DB ↓]` `/api/export/db`, `[CSV ↓]` `/api/export/posts.csv`

## 빌드 순서 (1.5~2일 시연)

**Day 1 오전 (3h) — 데이터 플레인**
1. `pnpm init -w`, workspace yaml, `tsconfig.base.json`. 기존 `gov_support_mcp/` 를 `packages/gov-support-mcp/` 로 복사, `src/index.ts` 배럴 추가, 13개 테스트 그대로 통과 확인.
2. `packages/shared` Zod 스키마 (Case/Post/4 Payload).
3. `packages/orchestrator` 스켈레톤 — Hono :8787, `better-sqlite3`, `schema.sql` 실행.
4. `routes/search.ts` + `board/searchCache.ts` — `POST /api/search` 캐시→정부API 폴백, 1건 수동 테스트.

**Day 1 오후 (4h) — 에이전트**
5. `agents/loader.ts` + 4개 JSON + 4개 한국어 prompt.
6. `agents/runner.ts` — Anthropic 스트리밍 + tool loop + `emit_result` forced tool-use 로 자격평가 1개 end-to-end. 실제 공고 1건으로 수동 검증.
7. 나머지 3개 에이전트는 prompt + tool 구성만 교체 (코드 복붙). `orchestrator.runBulk` `Promise.all` fan-out.
8. `events.ts` SSE + `EventEmitter` per `case_id`.

**Day 2 오전 (3h) — 대시보드**
9. Next.js 15 scaffold + Pretendard + Tailwind. `app/page.tsx` 단일 페이지 레이아웃.
10. `SearchBar` + `ProgramTable` (TanStack Table, 행 체크박스).
11. `BoardGrid` 4열 + `PostCard` + `useEventStream` SSE 훅. 실시간 상태 갱신 동작 확인.

**Day 2 오후 (3h) — 다운로드 + 마무리**
12. `routes/export.ts` — `gov.db` 스트림, programs/posts CSV (PapaParse), case 통합 Markdown 보고서.
13. `views/{Eligibility,PlanDraft,Checklist,Schedule}View.tsx` — 각 페이로드 전용 렌더러 (자격평가는 점수 게이지, 일정표는 간단 간트).
14. `README.md` — 14-tool → 4 에이전트 매핑 표, `pnpm dev`, 시연 시나리오 1개 (스마트팩토리 + AI바우처 두 건 체크 → 분석 → DB 다운로드).

## 14개 도구 → 4개 에이전트 매핑

| 기존 도구 | 새 owner 에이전트 |
|---|---|
| checkEligibility, evaluateStartupApplication | 자격평가 |
| draftBusinessPlan, search_gov_support_bizinfo | 사업계획서 초안 |
| generateDocumentChecklist | 서류 체크리스트 |
| buildApplicationTimeline | 단계별 마일스톤 일정표 |
| searchGovernmentSupport, search_gov_support_kstartup, search_gov_support_smes24, compareByRegion | 검색 라우트 (`/api/search`) — 에이전트 외부 |
| manageAlertProfile, manageBenefitHistory, draftSettlementReport, assessBusinessPlanQuality | PoC 범위 외 (V2) |

## 재사용 파일 경로 (기존 repo)

직접 복사 (수정 없음):
- `gov_support_mcp/src/govSupport/tools/eligibility.ts` — `CheckEligibilitySchema`, `handleCheckEligibility`
- `gov_support_mcp/src/govSupport/tools/evaluateStartup.ts` — `evaluateStartupApplication`
- `gov_support_mcp/src/govSupport/tools/draftTools.ts` — `draftBusinessPlan`
- `gov_support_mcp/src/govSupport/tools/documentChecklist.ts` — `generateDocumentChecklist`
- `gov_support_mcp/src/govSupport/tools/timeline.ts` — `buildApplicationTimeline`
- `gov_support_mcp/src/govSupport/clients/{bizinfoSupport,kstartupSupport,smes24PublicNotice}.ts`
- `gov_support_mcp/src/govSupport/core/{cache,dedup,store}.ts`
- `gov_support_mcp/tests/*.spec.ts` (13개 모두)
- `gov_support_mcp/vitest.config.ts`, `tsconfig.json`

폐기:
- 기존 챗플로우 DSL 디렉토리
- 컨테이너 compose 설정
- `gov_support_mcp/src/server.ts` (HTTP 서버 — 라이브러리 import로 대체)
- 기존 OpenAPI / 챗플로우 등록 가이드 문서

## 핵심 수정 파일

- [packages/orchestrator/src/db/schema.sql](packages/orchestrator/src/db/schema.sql) — SQLite 스키마
- [packages/orchestrator/src/agents/runner.ts](packages/orchestrator/src/agents/runner.ts) — Anthropic 스트리밍 + tool loop + emit_result
- [packages/orchestrator/src/agents/orchestrator.ts](packages/orchestrator/src/agents/orchestrator.ts) — bulk fan-out (N공고 × 4에이전트)
- [packages/orchestrator/src/agents/toolBridge.ts](packages/orchestrator/src/agents/toolBridge.ts) — @gov/mcp-tools 직접 호출
- [packages/orchestrator/src/routes/export.ts](packages/orchestrator/src/routes/export.ts) — DB/CSV/JSON/MD 다운로드
- [packages/orchestrator/agents/*.json](packages/orchestrator/agents/) — 4개 에이전트 선언 정의
- [packages/orchestrator/prompts/*.ko.md](packages/orchestrator/prompts/) — 4개 한국어 시스템 프롬프트
- [packages/shared/src/schemas.ts](packages/shared/src/schemas.ts) — Zod 페이로드 4종
- [apps/web/app/page.tsx](apps/web/app/page.tsx) — 대시보드 단일 페이지
- [apps/web/components/BoardGrid.tsx](apps/web/components/BoardGrid.tsx) — 4열 게시판

## 검증 (end-to-end)

```bash
# 1) 의존성
pnpm install
cp .env.example .env  # ANTHROPIC_API_KEY, BIZINFO_KEY, KSTARTUP_KEY 입력

# 2) 기존 MCP 도구 테스트 (13/13 통과 확인)
pnpm --filter @gov/mcp-tools test

# 3) 오케스트레이터 + 웹 동시 실행
pnpm dev   # orchestrator :8787, web :3000

# 4) 시연 시나리오
#  a) http://localhost:3000 접속
#  b) 좌측 검색: 키워드 "스마트팩토리", 업종 "제조" → 결과 10건
#  c) 상위 2건 체크 → [전략 분석] 클릭
#  d) 하단 게시판에 8개 카드(2공고×4에이전트) 가 "실행 중" → "완료" 로 SSE 실시간 갱신
#  e) 카드 클릭 시 한국어 마크다운 + 구조화 뷰 (자격평가 점수, PSST 4섹션, 서류 표, 간트)
#  f) 우상단 [DB ↓] 클릭 → gov.db 다운로드, sqlite3 로 열어 programs/posts 테이블 확인
#  g) [CSV ↓] 클릭 → 게시판 글 CSV 다운로드

# 5) 통합 테스트
pnpm --filter orchestrator test  # runner 모킹 + 라우트 테스트
```

성공 기준:
- 2건 체크 후 [전략 분석] 30~60초 내 8개 게시글 모두 완료
- `gov.db` 다운로드 후 `sqlite3 gov.db ".tables"` 에 9개 테이블 확인
- 모든 게시글 한국어 출력, JSON 페이로드가 Zod 스키마 통과
- 기존 13개 MCP 테스트 그대로 통과
