# 모델 선택 & 비용 가이드

이 PoC는 **Anthropic Claude API 전용**으로 짜여 있지만, 다른 LLM 으로 교체 가능합니다.
누가 운영할지·예산이 얼마인지에 따라 달라지므로 옵션과 트레이드오프를 정리합니다.

## 1. 현재 기본값

- **API**: Anthropic Claude (`@anthropic-ai/sdk`)
- **모델 (4개 에이전트 모두)**: `claude-sonnet-4-6`
- **변경 위치**: [`packages/orchestrator/agents/*.json`](../packages/orchestrator/agents/) 의 `model` 필드
- **환경변수**: `ANTHROPIC_API_KEY` 필요 (없으면 자동 mock 모드)

```json
// 예: agents/eligibility.json — 자격평가만 Opus 로 격상
{
  "agent_id": "eligibility",
  "model": "claude-opus-4-7",  // ← 여기만 바꾸면 됨
  ...
}
```

## 2. 비용표 (2026 기준 추정, 케이스 1건 = 4에이전트)

전제: 평균 입력 40K + 출력 16K tokens (입력 = 시스템 프롬프트 + 공고 + 도구 결과, 출력 = JSON 페이로드)

### Anthropic Claude

| 모델 | 입력 단가 ($/M) | 출력 단가 ($/M) | 케이스 1건 USD | 케이스 1건 KRW |
|---|---|---|---|---|
| **Claude Opus 4.7** | $15 | $75 | $1.80 | **약 2,500원** |
| **Claude Sonnet 4.6** ← 기본값 | $3 | $15 | $0.36 | **약 500원** |
| **Claude Haiku 4.5** | $0.8 | $4 | $0.10 | **약 140원** |

### Google Gemini

> 가격은 Google AI Studio 무료 티어 / Vertex AI 유료 티어 기준이 다를 수 있고, "thinking" 활성화 시 출력 단가가 별도. 정확한 최신가는 [Google AI 가격 페이지](https://ai.google.dev/pricing) 확인.

| 모델 | 입력 ($/M) | 출력 ($/M) | 케이스 1건 KRW | 비고 |
|---|---|---|---|---|
| **Gemini 2.5 Pro** | $1.25 (≤200K) / $2.50 (>200K) | $10 / $15 | 약 250~400원 | 추론·코딩 최강 |
| **Gemini 2.5 Flash** | $0.30 | $2.50 (thinking on) / $0.30 (off) | 약 60~250원 | 메인스트림 추천 |
| **Gemini 2.5 Flash-Lite** | $0.10 | $0.40 | **약 15~25원** | 가장 저렴, 단순 추출용 |
| Gemini 2.0 Flash (구버전) | $0.075 | $0.30 | 약 11원 | 신규 프로젝트 비추 |
| Gemini 1.5 Pro (구버전) | $1.25 | $5 | 약 180원 | EOL 임박 |

`Gemini 2.5 Pro`/`Flash`는 thinking budget 을 0 으로 설정하면 출력비가 1/8 수준으로 떨어집니다. 단순 JSON 추출 위주의 체크리스트/일정 에이전트는 thinking off 권장.

### OpenAI

| 모델 | 입력 ($/M) | 출력 ($/M) | 케이스 1건 KRW |
|---|---|---|---|
| GPT-5 (가설) | TBD | TBD | TBD |
| GPT-4o | $2.5 | $10 | 약 360원 |
| GPT-4o mini | $0.15 | $0.60 | **약 22원** |
| o3 (추론 모델) | $2.0 | $8 | 약 290원 |
| o3-mini | $1.1 | $4.4 | 약 160원 |

### 환산 가정

- 케이스 1건 = 4개 에이전트 × 평균 입력 10K + 출력 4K = 입력 40K, 출력 16K tokens
- 환율 1 USD = 1,380 KRW
- thinking·extended reasoning 등 별도 옵션 비활성화 기준

> 환율 1USD = 1,380KRW 가정. 실제 사용량은 공고 길이·턴 수에 따라 ±50%.

### 사용 시나리오별 비용

| 시나리오 | 분석 건수 | 모델 | 1회 비용 |
|---|---|---|---|
| 1인 자영업자 — 공고 3건 | 3 × 4 = 12회 | Sonnet 4.6 | ~1,500원 |
| 컨설팅사 — 일 20건 | 80회 | Sonnet 4.6 | ~10,000원/일 |
| 대량 스크리닝 | 100건/일 | Haiku 4.5 | ~2,800원/일 |
| 시연·개발 | 5건 | Mock 모드 | **0원** |

## 3. 모델별 권장 용도

| 에이전트 | 추천 모델 | 이유 |
|---|---|---|
| 자격평가 | **Opus 4.7** 또는 Sonnet 4.6 | 다중 조건 추론 필요. Opus 가 미충족 조건 정확도↑ |
| 사업계획서 초안 | **Opus 4.7** 또는 Sonnet 4.6 | 한국어 작문 품질, PSST 4섹션 균형 |
| 서류 체크리스트 | **Sonnet 4.6** 또는 Haiku 4.5 | 공고 텍스트에서 단순 추출, 비용 효율 우선 |
| 마일스톤 일정표 | **Haiku 4.5** | 결정론적 날짜 계산, 가장 가벼움 |

권장 조합 — 자격/계획서는 Opus, 체크리스트/일정은 Haiku로 섞으면 케이스당 약 **1,500원** 으로 품질·비용 균형.

## 4. Gemini 로 바꾸려면 — 작업량 ~3시간

### 변경 필요 파일
- `packages/orchestrator/package.json` — `@anthropic-ai/sdk` 제거, `@google/generative-ai` 추가
- `packages/orchestrator/src/agents/runner.ts` — Anthropic Messages → Gemini `generateContent` 호출로 교체
- `packages/orchestrator/src/agents/toolBridge.ts` — `input_schema` 형식이 다름 (Anthropic: JSON Schema, Gemini: `Schema` 객체)
- `packages/orchestrator/src/lib/cost.ts` — Gemini 단가표로 교체
- `agents/*.json` — `model` 필드를 `gemini-2.5-flash` 등으로

### Anthropic vs Gemini tool-use 차이
- Anthropic: `tools=[{name, description, input_schema}]` → 응답에 `content: [{type: "tool_use", ...}]`
- Gemini: `tools=[{functionDeclarations: [{name, description, parameters}]}]` → 응답에 `candidates[0].content.parts[?].functionCall`

추상화 레이어 (`AnthropicProvider` vs `GeminiProvider`) 를 만들면 이후 전환이 깔끔하지만, 단발성 PoC 면 `runner.ts` 직접 수정이 빠릅니다.

### Gemini 의 장점
- 무료 티어 (분당 15회) — 시연·개발에 충분
- 한국어 품질 우수
- Flash 모델 비용 ~Anthropic Sonnet 의 **1/40**

### Gemini 의 단점
- tool-use 강제(`tool_choice`) 가 Anthropic 보다 덜 신뢰. 페이로드 검증 실패율↑
- 긴 컨텍스트(>50K) 에서 출력 안정성 약간 떨어짐

## 5. OpenAI 로 바꾸려면 — 작업량 ~2시간

OpenAI 의 `tools` API 가 Anthropic 과 가장 유사. `runner.ts` 의 `client.messages.create` 를 `client.chat.completions.create` 로 바꾸고 응답 파싱만 조정하면 됨.

GPT-4o-mini 비용은 Sonnet 4.6 대비 약 **1/16** 수준.

## 6. Mock 모드 — API 키 없이 시연

이 PoC는 `ANTHROPIC_API_KEY` 가 없으면 자동으로 mock 모드로 전환됩니다.
[`packages/orchestrator/src/agents/mock.ts`](../packages/orchestrator/src/agents/mock.ts) 가 결정론적 더미 응답을 만들어 4개 에이전트 게시판이 채워집니다.

```bash
# API 키 없이 실행
pnpm dev
# 또는 키가 있어도 mock 모드 강제
MOCK_AGENTS=1 pnpm dev
```

Mock 모드 응답은 `payload.reasoning` 끝에 "(Mock 응답 — ANTHROPIC_API_KEY 미설정)" 이 붙어 시연용임이 명시됩니다.

## 7. 실비 모니터링

[`packages/orchestrator/src/lib/cost.ts`](../packages/orchestrator/src/lib/cost.ts) 가 토큰 → KRW 환산을 합니다. 게시판 글마다 `cost_krw` 컬럼에 누적되어 SQLite 에 저장됩니다.

```sql
-- 일별 비용 집계
SELECT date(created_at) as day, agent_id, SUM(cost_krw) as krw, SUM(tokens_in + tokens_out) as toks
FROM agent_runs WHERE status = 'completed'
GROUP BY day, agent_id ORDER BY day DESC, krw DESC;
```

대시보드에 비용 위젯을 추가하려면 `apps/web/components/CostBadge.tsx` 를 새로 만들어 위 쿼리를 호출하면 됩니다 (지금은 미구현).

## 8. 결론 추천

- **시연·내부 검증**: Mock 모드 (0원)
- **소규모 베타 (월 100건 미만)**: Sonnet 4.6 단일 모델 — 월 5만원
- **본격 운영 (월 1,000건)**: Opus + Haiku 혼합 — 월 150만원
- **대량 스크리닝 (월 10,000건)**: Haiku 단일 또는 Gemini Flash 전환 — 월 30만원
