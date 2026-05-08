# gov-support-multi-agent

정부지원사업 **검색 → 다중 선택 → 4개 전문가 에이전트 병렬 분석** 대시보드 PoC.

기존 [dify-gov-support-poc](https://github.com/leedonwoo2827-ship-it/dify-gov-support-poc) 의
단일 Dify chatflow 구조를 4-에이전트 게시판 형태로 재구축했습니다.
참고 아키텍처: [sonol-multi-agent](https://github.com/volition79/sonol-multi-agent).

## 4개 에이전트

| 에이전트 | 입력 | 출력 (Zod 검증) | 기본 모델 |
|---|---|---|---|
| ✅ **자격평가** | 회사 프로파일 + 공고 | 적합/부분/부적합 + 5축 점수 + 충족/미충족 요건 | Sonnet 4.6 |
| 📝 **사업계획서 초안** | 동일 | PSST 4섹션 한국어 초안 + 3줄 요약 | Sonnet 4.6 |
| 📂 **서류 체크리스트** | 동일 | 필수/선택/권장 서류 + 보유 상태 | Haiku 4.5 |
| 📅 **마일스톤 일정표** | 동일 | 마감 역산 D-30 ~ D-1 단계별 일정 | Haiku 4.5 |

## 빠른 시작 (Windows — .bat 한 번씩)

```cmd
REM 1) 설치 + 시드 (한 번만)
install.bat

REM 2) 두 서버 실행 (별도 창에서) + 브라우저 자동 오픈
dev.bat

REM (필요 시) DB 재시드 — 합성 fixture 20건
seed.bat

REM (필요 시) 실데이터 시드 — K-Startup 100건 (PUBLIC_DATA_SERVICE_KEY 필요)
seed-real.bat

REM (필요 시) 서버 종료
stop.bat

REM (필요 시) 전체 클린
clean.bat
```

## 빠른 시작 (Mac / Linux — .sh 한 번씩)

```bash
# 1) 설치 + 시드 (한 번만)
./install.sh

# 2) 두 서버 실행 + 브라우저 자동 오픈
./dev.sh

# (선택) 실데이터로 교체 — K-Startup 100건 (PUBLIC_DATA_SERVICE_KEY 필요)
./seed-real.sh

# (필요 시) DB 재시드(fixture) / 종료 / 클린
./seed.sh
./stop.sh
./clean.sh
```

## 빠른 시작 (수동)

```bash
pnpm install
pnpm --filter @gov/orchestrator run seed
pnpm dev   # orchestrator + web 병렬
open http://localhost:3000   # macOS
xdg-open http://localhost:3000   # Linux
```

API 키 없이도 mock 모드로 시연됩니다. 실제 LLM/공고 데이터를 쓰려면:

```bash
# .env 편집
notepad .env   # Windows
nano .env      # Mac/Linux

# 다음 키 중 필요한 것만 입력
ANTHROPIC_API_KEY=sk-ant-...        # 에이전트 실 호출
PUBLIC_DATA_SERVICE_KEY=...         # data.go.kr K-Startup 등 실데이터 (인증키 Encoding)
BIZINFO_API_KEY=...                 # bizinfo.go.kr (별도 발급)
SMES24_API_KEY=...                  # smes.go.kr (별도 발급)
```

### 실데이터 적용 — 대시보드에서 (권장)

1. http://localhost:3000 → 우상단 **[⚙️ 설정]** 클릭
2. 4개 키 입력 + [💾 저장]
3. 상단 [📥 실데이터 적재] 섹션에서 받을 건수 선택 → [🔄 실데이터 가져오기]
4. 하단 [📜 데이터 적재 이력] 에서 누가/언제/몇 건 가져왔는지 추적

키는 SQLite 의 `settings` 테이블에 저장되며, 환경변수보다 우선합니다.

부서별 운영·키 발급 가이드는 [`_docs/USER_MANUAL.md`](_docs/USER_MANUAL.md) 참고.

### 실데이터 적용 — CLI (대안)

`.env` 에 `PUBLIC_DATA_SERVICE_KEY=...` 추가 후 `seed-real.bat` (Windows) 또는 `./seed-real.sh` (Mac/Linux) 실행.

## 시연 시나리오

1. http://localhost:3000 접속 → 좌측 검색에 "스마트팩토리" 입력 → 결과 1건
2. 검색을 비워서 다시 검색 → 결과 20건
3. 상위 2건 체크박스 선택 → [🚀 전략 분석] 클릭
4. 하단 게시판에 8개 카드(2공고 × 4에이전트) 가 "실행 중" → "완료" 로 채워짐
5. 카드 [▼ 상세보기] 클릭하면 한국어 마크다운 본문 (자격평가 점수표, PSST 4섹션, 서류 표, 일정 표)
6. 우상단 [📦 DB 다운로드] 로 `gov.db` SQLite 파일을 받아서 sqlite3 로 직접 열기 가능
7. [📊 공고 CSV] / [📝 게시글 CSV] 로 표 데이터 다운로드

## 아키텍처

```
[브라우저 :3000]  ─REST/SSE─►  [orchestrator :8787]  ─함수호출─►  [@gov/mcp-tools]
   Next.js 15         Hono + node:sqlite                    14개 정부 API tool
                          │
                          ▼
                     [data/gov.db]
                  (programs · cases · posts · events)
```

- **언어**: TypeScript 전 구간, pnpm workspaces 단일 monorepo
- **에이전트 정의**: 선언형 JSON ([`packages/orchestrator/agents/*.json`](packages/orchestrator/agents/)) + 한국어 프롬프트 (`prompts/*.ko.md`)
- **상태 저장**: Node 24 내장 `node:sqlite` (네이티브 빌드 불필요)
- **이벤트**: SSE (`GET /api/events/case/:id`) — sonol 패턴의 events 테이블 + EventEmitter 허브
- **forced JSON 출력**: 각 에이전트 마지막에 `emit_result` synthetic tool 호출 → Zod 페이로드 검증 강제

## 폴더 구조

```
.
├── _docs/
│   ├── PLAN.md                # 설계 문서 (Plan mode 결과)
│   ├── HOW_WE_BUILT_THIS.md   # subagent / 슬래시 스킬 활용 기록
│   ├── MODEL_AND_COST.md      # 모델별 비용 + Gemini/OpenAI 전환 가이드
│   └── fixtures/programs.sample.json  # 시드용 공고 20건
├── packages/
│   ├── gov-support-mcp/       # 기존 14개 정부 API 도구 (그대로 재사용)
│   ├── shared/                # Zod 스키마 + 타입 (FE/BE 공유)
│   └── orchestrator/          # Hono REST + 4 에이전트 + SQLite 게시판
│       ├── agents/*.json      # 선언형 에이전트 정의
│       ├── prompts/*.ko.md    # 한국어 시스템 프롬프트
│       └── src/
│           ├── server.ts
│           ├── db/{schema.sql,client.ts}
│           ├── board/{posts,events,cases,programs,profiles,runs}.ts
│           ├── routes/{search,cases,posts,runs,events,export,programs,profiles}.ts
│           ├── agents/{loader,runner,toolBridge,orchestrator,mock}.ts
│           └── lib/{ulid,sse,cost}.ts
└── apps/
    └── web/                   # Next.js 15 대시보드 (정부24 풍)
        ├── app/{layout,page,globals.css}.tsx
        └── components/{SearchBar,ProgramTable,ActionBar,BoardGrid,PostCard}.tsx
```

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/search` | 공고 검색 (SQLite 캐시 → 정부 API 폴백) |
| GET | `/api/programs` | 캐시된 공고 전체 |
| GET/POST | `/api/profiles[/demo]` | 회사 프로파일 |
| POST | `/api/runs/bulk` | N개 공고 × 4 에이전트 일괄 실행 (배경, 즉시 응답) |
| GET | `/api/cases/:id` | 케이스 상세 + 게시글 + run 상태 |
| GET | `/api/posts[/:id]` | 게시판 글 목록·상세 |
| GET | `/api/events/case/:id` | SSE 실시간 이벤트 |
| GET | `/api/export/db` | gov.db 파일 다운로드 |
| GET | `/api/export/programs/csv` | 공고 CSV |
| GET | `/api/export/posts/csv` | 게시판 CSV |
| GET | `/api/export/cases/:id/json` | 케이스 통합 JSON |
| GET | `/api/export/cases/:id/md` | 케이스 통합 Markdown 보고서 |

## 환경변수

```bash
ANTHROPIC_API_KEY=...           # 없으면 mock 모드 자동 진입
BIZINFO_API_KEY=...             # 선택 — 없으면 검색 시 캐시만 사용
SMES24_API_KEY=...              # 선택
PUBLIC_DATA_SERVICE_KEY=...     # 선택

ORCHESTRATOR_PORT=8787
WEB_PORT=3000
DB_PATH=./data/gov.db
MOCK_AGENTS=1                   # 키가 있어도 mock 모드 강제
```

## 사용자 매뉴얼 (부서별 시나리오 포함)

[`_docs/USER_MANUAL.md`](_docs/USER_MANUAL.md) — 부서별 권장 키 구성, 발급 가이드, FAQ, 보안 체크리스트.

## 모델 변경 / 비용

자세한 비용표·Gemini/OpenAI 전환 가이드는 [`_docs/MODEL_AND_COST.md`](_docs/MODEL_AND_COST.md) 참고.

요약: 케이스 1건(4에이전트) 평균 비용
- Claude Opus 4.7: ~2,500원
- Claude Sonnet 4.6: ~500원
- Claude Haiku 4.5: ~140원
- Gemini 2.5 Pro: ~250~400원
- Gemini 2.5 Flash: ~60~250원
- Gemini 2.5 Flash-Lite: **~15~25원**
- GPT-4o mini: ~22원
- Mock 모드: **0원**

## 기존 PoC 와의 차이

| 항목 | 기존 (Dify chatflow) | 새 PoC |
|---|---|---|
| 에이전트 수 | 1 (단일 LLM 라우터) | 4 (전문가 분리) |
| 출력 구조 | 자유 텍스트 한 채팅창 | Zod 검증된 JSON × 4 + 마크다운 본문 |
| 동시성 | 순차 turn-by-turn | 4N 병렬 (asyncio.gather 패턴) |
| 데이터 저장 | JSON 파일 | SQLite (.db 다운로드 가능) |
| UI | Dify 채팅 | 정부24 풍 대시보드 |
| 검색 캐싱 | 없음 (매번 API) | SQLite 24h TTL |
| 시연 시 | API 키 필수 | mock 모드로 키 없이도 시연 |
| 다운로드 | 없음 | DB / CSV / JSON / Markdown |

## 개발

```bash
# 백엔드만 실행
pnpm dev:orchestrator

# 웹만 실행
pnpm dev:web

# 시드 재실행
pnpm seed

# 테스트 (gov-support-mcp 기존 13개)
pnpm --filter @gov/mcp-tools test
```

## 라이선스

내부 PoC. 정부 API 호출은 각 포털의 이용약관을 준수해야 합니다.
