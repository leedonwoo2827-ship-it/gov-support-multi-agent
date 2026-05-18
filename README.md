# gov-support-multi-agent

**3개 부서별 맞춤 + 4개 전문가 에이전트 병렬 분석** 정부지원사업·입찰 대시보드.

| 부서 | 주력 채널 | 비즈니스 모델 |
|---|---|---|
| 📊 **경영기획팀** | BIZINFO · K-Startup · SMES24 | R&D · 창업 · 중소기업 지원금 신청 |
| 📚 **교육사업부** | 나라장터 G2B 교육·훈련용역 | 금융·공공기관 위탁 교육 입찰 수주 |
| 🌏 **해외사업부** | KOICA ODA · EDCF · KOTRA | 개도국 국제개발 사업 입찰 수주 |

부서마다 데이터 소스 · 회사 프로파일 · 4개 에이전트의 시스템 프롬프트 · mock 응답이 **자동 분기**됩니다. 출력 스키마와 UI 4-카드 그리드는 공통이라 PM이 부서를 바꿔도 학습 비용 0.

참고 아키텍처: [sonol-multi-agent](https://github.com/volition79/sonol-multi-agent).

## 4개 에이전트

각 에이전트 출력은 Zod 검증. 부서별로 시스템 프롬프트가 갈라져 결과의 톤·5축 라벨이 다릅니다.

| 에이전트 | 경영기획팀 | 교육사업부 | 해외사업부 | 기본 모델 |
|---|---|---|---|---|
| ✅ **자격평가** | 기업규모 · R&D · 인증 · 재무 · 영역 | 실적 · 강사풀 · 콘텐츠IP · LMS · **가격경쟁력**¹ | 국제실적 · 컨소시엄 · 다국어 · 전문성 · **ODA 가격경쟁력**² | Gemini 2.5 Flash-Lite |
| 📝 **사업계획서 초안** | PSST 4섹션 (지원금 양식) | RFP 응답 (교수설계·평가) | 기술제안서 (DAC 5원칙) | Gemini 2.5 Flash-Lite |
| 📂 **서류 체크리스트** | 사업자등록·완납·재무 | G2B 입찰자격·실적·강사CV | KOICA 등록·컨소시엄·영문CV | Gemini 2.5 Flash-Lite |
| 📅 **마일스톤 일정표** | D-30~D-0 단일 단계 | RFP→제안서→평가→계약 | **PQ→본입찰 2단계** | Gemini 2.5 Flash-Lite |

¹ 교육사업부 가격경쟁력 axis는 [나라장터 낙찰정보](https://www.data.go.kr/data/15129397/openapi.do) 통계 기반 — 발주처별 평균 낙찰률·낙찰업체·평균 참가업체수를 자격평가 코멘트에 자동 주입.

² 해외사업부 ODA 가격경쟁력 axis는 [KOICA 수의계약 목록조회](https://www.data.go.kr/data/15158380/openapi.do) (`/getVltrnCntrctList`) 통계 기반 — 분야 매칭 표본 수·평균 계약금액·주요 수의 파트너 집중도를 axis 코멘트에 주입. 기존 "PQ 통과 가능성" axis 는 axis 에서 빠지고 PQ 정량요건(자본금·매출·실적·컨소시엄)은 `matchedCriteria`/`unmetCriteria`/`riskFlags` 로 평가됩니다.

> 💡 **모델 업그레이드 기준**: 4개 에이전트 모두 비용 최소화를 위해 `gemini-2.5-flash-lite`로 통일했어요. 운영 중 **서류 체크리스트에 "미상"이 자주 나오거나, 발급기관 라벨이 누락**되면 `packages/orchestrator/agents/doc-checklist.json`의 `model` 값을 **`gemini-2.5-flash`** 로 한 단계 올리면 정확도 개선됩니다. 자격평가/사업계획서의 추론 품질이 부족하면 `gemini-3-flash-preview` 까지 올릴 수 있어요.

## 빠른 시작

기동 후 http://localhost:3000 접속.

### 옵션 A — 터미널 1개 (PowerShell · bash · macOS · Linux 권장)

```bash
pnpm dev
```

오케스트레이터(`:8787`)와 웹(`:3000`)을 `pnpm -r --parallel`로 한 번에 띄웁니다. 로그가 한 화면에 섞여 나오므로 패키지 prefix(`@gov/orchestrator:` / `@gov/web:`)를 보고 구분하세요. 중단은 `Ctrl+C` 한 번이면 둘 다 종료.

> ⚠️ **Windows `cmd.exe` 에서는 비권장** — `--filter="!@gov/mcp-tools"` 의 `!` 와 따옴표 처리 이슈로 스크립트가 실패할 수 있습니다. cmd 사용자는 옵션 B로.

### 옵션 B — 터미널 2개 (cmd 포함 모든 셸에서 안정)

```bash
# 터미널 1
pnpm dev:orchestrator
# 터미널 2
pnpm dev:web
```

로그가 셸마다 분리되므로 디버깅 시 더 편리합니다.

## 빠른 설치 (한 번만)

```bash
# 1) 의존성 설치
pnpm install

# 2) 부서별 회사 프로파일 시드 (3개 부서: planning/edu/oda)
pnpm --filter @gov/orchestrator run seed
```

> 공고 데이터는 시드하지 않습니다. PoC는 **실데이터 100%**로 운영. 부서 탭이 일시적으로 비는 상황(예: 키 활성화 대기)은 감수.

### API 키 발급 (필요한 것만, 모두 같은 1개 키로 가능)

| 키 | 발급처 | 커버 |
|---|---|---|
| `PUBLIC_DATA_SERVICE_KEY` ⭐ | [data.go.kr](https://www.data.go.kr) 마이페이지 → 활용신청 | K-Startup · KOICA ODA · G2B 입찰공고 · G2B 낙찰정보 (모두 1개 키) |
| `BIZINFO_API_KEY` | [bizinfo.go.kr](https://www.bizinfo.go.kr) (별도 발급) | 기업마당 BIZINFO |
| `SMES24_API_KEY` | [smes.go.kr](https://www.smes.go.kr) (선택) | 중소벤처24 |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | 4개 에이전트 실 호출 (무료 티어 가능) |
| `ANTHROPIC_API_KEY` | (대안) | Gemini 대신 Claude 사용 시 |

활용신청 권장 데이터셋 (data.go.kr):
- [15125364](https://www.data.go.kr/data/15125364/openapi.do) 창업진흥원_K-Startup
- [15158380](https://www.data.go.kr/data/15158380/openapi.do) 한국국제협력단_KOICA ODA 조달 정보조회 (신규 GW. 입찰공고 `/getBidPblancInfoList` + **수의계약 `/getVltrnCntrctList`** 동시 사용 — 후자는 해외사업부 ODA 가격경쟁력 axis 입력. 구 ID 3039908은 2026-05 폐기)
- [15129394](https://www.data.go.kr/data/15129394/openapi.do) 조달청_나라장터 입찰공고정보서비스
- [15129397](https://www.data.go.kr/data/15129397/openapi.do) 조달청_나라장터 낙찰정보서비스 (교육사업부 가격경쟁력 axis 입력)

신청 후 활성화에 1~24시간 소요될 수 있습니다 (`SERVICE KEY IS NOT REGISTERED` 응답 시 시간 대기).

### 키 입력 → 데이터 적재

1. http://localhost:3000 → 우상단 **[⚙️ 설정]** 클릭
2. 위 키들 입력 후 [💾 저장] (SQLite `settings` 테이블 평문 저장, 환경변수보다 우선)
3. **[📥 실데이터 적재]** 섹션의 [🔄 실데이터 가져오기 (정부 API)] 클릭
4. ☑️ "기존 데이터 초기화" 체크박스는 **OFF 권장** (누적 모드). 실수 클릭 방지를 위해 켜면 빨간 확인 팝업이 뜸.
5. 진단 박스에서 소스별 받은 건수 + HTTP + 응답 본문 200자 확인 가능
6. 하단 [📜 데이터 적재 이력] 에서 부서·날짜별 운영 점검 가능

## 시연 시나리오

부서 탭 클릭 → 공고 선택 → [🚀 전략 분석] → 4-카드 결과 → [▼ 상세보기].

**시나리오 1 — 경영기획팀** (3분)
> "이번 주 BIZINFO에 새로 올라온 R&D 지원사업 중 우리가 신청할 만한 거 있나?"
1. 경영기획팀 탭 → 마감 임박순 공고 1건 체크 → [🚀 전략 분석]
2. 자격평가 5축(기업규모·R&D·인증·재무·영역) + 사업계획서 PSST 4섹션 + 마일스톤 D-30~D-0

**시나리오 2 — 교육사업부** (5분) ⭐ A1 통합 가치 입증
> "지금 나라장터에 올라온 교육 위탁용역 + 가격을 얼마로 써야 할지"
1. 교육사업부 탭 → 키워드 "AI" / "금융" 검색 → 실 G2B 공고
2. [🚀 전략 분석] → 자격평가의 **가격경쟁력 axis** 에 "OOO기관 최근 6개월 평균 낙찰률 87.3% (12건, 평균 참가 4.2개사). 주요 낙찰업체: …" 같은 객관 통계 자동 노출
3. 사업계획서는 RFP 응답형, 마일스톤은 RFP→제안서→평가→계약 8단계

**시나리오 3 — 해외사업부** (5분) ⭐ KOICA 수의계약 통합 가치 입증
> "KOICA가 이 분야 사업을 누구한테, 얼마에 발주해왔는지 + 우리 컨소시엄으로 PQ 통과 가능한가?"
1. 해외사업부 탭 → KOICA 입찰공고 1건 선택
2. 자격평가 axes: 국제개발 실적 · 컨소시엄 · 다국어 · ODA 전문성 · **ODA 가격경쟁력**
3. **ODA 가격경쟁력 axis** 에 "KOICA 수의계약 N건 (분야 매칭 키워드 "교육"). 평균 X.XX억 / 주요 파트너: A(N건), B(M건)" 같은 객관 통계 자동 노출. 표본 부족 시 "일반/제한경쟁 트랙 검토 권고" riskFlag.
4. PQ 정량요건은 `matchedCriteria`/`unmetCriteria` 로 별도 표시
5. 마일스톤이 **PQ 마감 → 본입찰 마감 2단계 (10단계, 약 41일)**
6. 서류 체크리스트에 컨소시엄 협약서 · 현지 MOU · 영문 CV 항목

## 데이터 내보내기

- 우상단 [📦 DB 다운로드] — `gov.db` SQLite 파일 그대로 다운로드
- [📊 공고 CSV] · [📝 게시글 CSV] — 표 데이터
- 케이스별 통합 Markdown 보고서: `/api/export/cases/:id/md`

## (구) 단축 스크립트

`install.bat` · `dev.bat` · `seed.bat` 등 윈도우 배치 파일이 남아있지만, 위 빠른 시작(옵션 A 또는 B) 방식이 더 안정적입니다.

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
│           ├── board/{posts,events,cases,programs,profiles,runs,awards,koicaContracts}.ts
│           ├── routes/{search,cases,posts,runs,events,export,programs,profiles,admin}.ts
│           ├── agents/{loader,runner,runner-gemini,toolBridge,orchestrator,mock}.ts
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
