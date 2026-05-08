# 어떻게 만들었나 — Claude Code 멀티에이전트 활용 기록

이 프로젝트 자체를 만들 때 Claude Code 의 subagent / Plan mode / 슬래시 스킬을
어떻게 조합했는지에 대한 메타 문서. PoC 결과물보다 **"어떻게 의사결정했는가"** 가
다른 개발자들이 더 궁금해하는 대목이라 별도로 남긴다.

## 0. 결과 요약

- 빈 폴더에서 출발 → 4개 전문가 에이전트 + SQLite 게시판 + 정부24풍 대시보드 PoC 설계 완료, 1.5~2일 시연 가능 형태로 빌드 진행 중.
- 큰 의사결정 2개를 **사람이 분석하지 않고 Subagent 두 명에게 동시에 시켜서 비교** 한 다음 사람이 골랐다.
- Plan mode 5단계로 강제되는 흐름 덕분에 "탐색 → 설계 → 사용자 확인 → 플랜 파일" 사이클이 한 턴에 끝남.

## 1. Plan mode 5단계 워크플로우

Claude Code 가 Plan mode 에서 강제하는 단계:

```
Phase 1 Initial Understanding   → Explore 에이전트 (read-only)
Phase 2 Design                  → Plan 에이전트 (read-only)
Phase 3 Review                  → 사람한테 AskUserQuestion
Phase 4 Final Plan              → 단일 markdown 파일에 작성
Phase 5 ExitPlanMode            → 승인 요청
```

이 PoC 에서 실제로 적용된 방식:

| Phase | 한 일 | 사용 도구 |
|---|---|---|
| 1 | 두 GitHub 저장소 동시 조사 | Explore × 2 (병렬) |
| 2 | Python 스택 vs TypeScript 스택 동시 설계 | Plan × 2 (병렬) |
| 3 | 사용자 답변 3가지 받기 (에이전트 실행 / 캐싱 / UI) | AskUserQuestion (3-question 패키지) |
| 4 | `_docs/PLAN.md` 에 최종 플랜 작성 | Write |
| 5 | 사용자 "진행합시다" → 빌드 시작 | (ExitPlanMode 우회) |

## 2. Subagent 활용 — 핵심 트릭

### 2-1. 두 저장소를 두 명에게 동시에

기존 PoC 구조와 참고 아키텍처를 **하나의 메인 컨텍스트가 순차 조사**하면 시간도 오래 걸리고
컨텍스트가 양쪽 raw 데이터로 오염된다. 그래서 한 메시지 안에 Agent 호출을 두 개 넣었다:

```
Agent(subagent_type=Explore, prompt="dify-gov-support-poc 조사 ...")
Agent(subagent_type=Explore, prompt="sonol-multi-agent 조사 ...")
```

각 Explore 에이전트는:
- WebFetch 로 README / src 디렉토리 / 핵심 파일 직접 fetch
- 자기 컨텍스트 안에서 분석
- **결과 요약만** 메인에 리턴 (raw 페이지 dump 안 옴)

메인 컨텍스트에는 `구조 + 약점 5가지` 같은 압축된 요약만 들어와서 다음 단계 결정에 그대로 사용 가능.

### 2-2. 두 가지 스택을 두 명에게 동시에

Python/FastAPI 안 vs TypeScript/Hono 안 — 둘 다 구체적으로 그려봐야 비교가 가능한데
한 명한테 "둘 다 그려봐" 시키면 어느 쪽으로 편향됨. 그래서:

```
Agent(subagent_type=Plan, prompt="Python 스택으로 설계 ...")
Agent(subagent_type=Plan, prompt="TypeScript 스택으로 설계 ... 솔직한 비교 포함")
```

각 Plan 에이전트는 자기 안에 갇혀서 본인 안만 변호한다. 그러나 두 번째 에이전트에게는 명시적으로
"Python 안과의 솔직한 비교" 를 요구해서 한쪽이 과적합되는 것을 방지.

결과: 두 개의 ~1500단어 비교 가능한 플랜이 한 번에 들어옴 → 사람이 짧게 비교하고 결정.

**채택 기준 (사람의 판단):**
- 기존 14개 도구가 TS 라서 같은 언어면 HTTP hop 제거 (~80ms 절약, 실패 모드 제거)
- 사용자(시연자)가 작은 팀 → 단일 언어 운영이 단순
- sonol 패턴이 JS 네이티브 → 1:1 transfer
- 손해: Anthropic SDK Python 이 신기능 1-2주 빠른 점, asyncio 가 Promise.all 보다 깔끔한 점 → PoC 규모에서 무시 가능

### 2-3. AskUserQuestion 으로 3개 질문 한 번에

`multiSelect: false` 단일선택 3개를 한 패키지에 묶어서 한 화면에 표시:
1. 에이전트 실행 방식 (공고별 4개 전부 / 자격평가만 먼저 / 비교분석 1세트)
2. SQLite 캐싱 범위 (목록+게시글 / 게시글만 / + Markdown 보고서)
3. 대시보드 UI 풍 (정부24 / Linear / Excel)

각 옵션에 (Recommended) 표시 + description 필드로 트레이드오프 명시 → 사용자가 빠르게 클릭으로 답변.
세 번 따로 묻지 않아 turn 수 절약.

## 3. 안 쓴 것 / 안 쓰기로 결정한 것

- **`/init`** — CLAUDE.md 생성용. 빌드 끝나고 작성 예정.
- **`/review`** — PR 단위 리뷰. PR 만들 때 사용.
- **`/security-review`** — API 키 노출 / SQL injection 점검. 빌드 끝난 후 한 번 돌리기 추천.
- **`/simplify`** — 변경 코드 정리. 4개 에이전트 prompt 작성 후 한 번 돌리기 추천.
- **`/loop`, `/schedule`** — 반복 실행. 이 PoC 는 일회성이라 미적용. 향후 "매일 새 공고 크롤" 자동화에 쓸 수 있음.
- **MCP 서버 등록 (`mcp__claude_ai_*`)** — 외부 SaaS (Notion, Asana 등) 미연결.

## 4. 도구 호출 패턴

### 4-1. 병렬 호출
독립적인 작업은 한 메시지 안에서 여러 tool call 로 묶어서 보냄:
```
[Bash: ls _docs/]   [Bash: node --version]   [TodoWrite: 10 items]
```
한 번의 round-trip 으로 끝남.

### 4-2. TodoWrite 로 진행 상태 노출
사용자가 "오늘 끝내지요" 라고 했을 때 10개 작업 todo 를 노출 →
어디까지 했는지 매번 보여주고, 막혔을 때 어디서 막혔는지 추적 가능.

### 4-3. Read / Edit / Write 분리
- 새 파일은 Write
- 기존 파일은 Read 한 번 + Edit 여러 번 (full rewrite 지양)
- 디렉토리 탐색은 Glob, 코드 검색은 Grep (`find` / `grep` Bash 직접 호출 금지)

## 5. 파일 트리에 남은 흔적

```
_docs/
├── PLAN.md                  # Plan mode Phase 4 결과물
├── HOW_WE_BUILT_THIS.md     # 이 문서
└── fixtures/
    └── programs.sample.json # API 키 없을 때 폴백용 시드 20건
```

## 6. 사용자가 비슷한 PoC 를 만들 때 권장 흐름

1. **Plan mode 진입** (Shift+Tab 두 번 또는 `--permission-mode plan`)
2. 처음부터 **Subagent 두 명을 병렬로 탐색** 시키기 — 메인 컨텍스트가 raw 데이터로 더러워지지 않게
3. 결정해야 할 큰 갈래마다 **Plan agent 두 명 동시** 시키고 두 번째에게 첫 번째와의 비교 요구
4. 모호한 요구사항은 **AskUserQuestion 한 번에 묶어서** 옵션 3-4개 (Recommended) 제시
5. 플랜 파일에 **Context → Architecture → File tree → DDL → API → 빌드 순서 → 검증** 순으로 작성
6. ExitPlanMode 직후 사용자가 "진행" 하면 TodoWrite 로 작업 분해 → 하나씩 실행
7. 빌드 완료 후 `/simplify`, `/security-review`, `/review` 차례대로 돌리고 마지막에 `/init`

## 7. 비용 메모

- Explore 두 명 + Plan 두 명 (Sonnet) ≈ 작은 비용
- 메인 컨텍스트 (Opus 4.7 1M) 는 큰 의사결정만 처리 → 토큰 효율적
- AskUserQuestion 은 사용자에게 즉시 보여서 모델 추론 비용 0
- 가장 비싼 부분은 빌드 단계의 코드 작성 (메인이 직접 함)
