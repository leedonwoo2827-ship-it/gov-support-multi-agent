# 사용자 설명서

> 정부지원사업 멀티에이전트 분석 대시보드 — **누가, 어떤 키로, 어떻게 쓰는가**

이 문서는 부서/역할별로 적합한 키 구성 + 시연 시나리오를 정리한 것입니다.
기술 셋업은 [README](../README.md) 참고.

---

## 1. 키 종류 한눈에

| 환경변수 / 설정 키 | 발급처 | 용도 | 비용 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) | provider:'anthropic' 에이전트 LLM 호출 (Claude) | 종량 ([상세](MODEL_AND_COST.md)) |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/app/apikey) | provider:'gemini' 에이전트 LLM 호출 (Google) | 무료 티어 가능, 종량 |
| `PUBLIC_DATA_SERVICE_KEY` | [data.go.kr](https://www.data.go.kr/iim/api/selectAcountList.do) | K-Startup, 중소기업 지원사업 등 공공 API 공통 인증 | 무료 (트래픽 한도 10K/일) |
| `BIZINFO_API_KEY` | [bizinfo.go.kr](https://www.bizinfo.go.kr/) | 기업마당 자체 API (data.go.kr 와 별개) | 무료 |
| `SMES24_API_KEY` | [smes.go.kr](https://www.smes.go.kr/) | 중소벤처24 API | 무료 |

**Anthropic / Gemini 둘 다 없으면**: 자동 mock 모드 (결정론적 더미 응답, 비용 0).
**둘 중 하나만 있으면**: provider:'anthropic' 또는 'gemini' 에이전트만 작동, 다른 쪽은 실패.
**둘 다 있으면**: 에이전트 JSON 의 `provider` 필드대로 각각 호출.

> **data.go.kr 인증키 1개로 K-Startup + 중소기업 지원사업 둘 다 호출 가능합니다.**
> 활용신청한 모든 API 가 같은 인증키를 공유합니다.

## 2. 어디에 입력하나 — 대시보드 우상단 [⚙️ 설정]

http://localhost:3000 → 우상단 **[⚙️ 설정]** 클릭 → 4개 키 입력 → [💾 저장]

- 입력한 키는 **로컬 SQLite** (`packages/orchestrator/data/gov.db`) 의 `settings` 테이블에 저장됩니다.
- 환경변수(.env) 와 둘 다 있으면 **DB 값이 우선**합니다.
- 키가 노출돼도 좋게 [👁 표시] 토글로 잠시 보고 [🙈 숨김] 으로 가릴 수 있습니다.
- 삭제 시 [🗑 삭제] 버튼 (DB 에서 제거, env 는 그대로 남음).

---

## 3. 부서/역할별 권장 구성

### 🏢 A. 정부지원사업 컨설팅 부서 (B2B)

**상황**: 여러 고객사에 대해 동시 분석. 비용 추적이 중요.

**권장 키 구성**:
| 키 | 보유 | 비고 |
|---|---|---|
| Anthropic | ✅ 부서 1개 | 부서 회계로 청구 일원화 |
| 공공데이터포털 | ✅ 부서 1개 | data.go.kr 인증키는 회사 단위 발급 권장 |
| 기업마당 | ✅ 부서 1개 | bizinfo 키는 무료 + 회사 한 개로 충분 |
| 중소벤처24 | 선택 | smes.go.kr 만 있는 공고가 필요할 때 |

**모델 권장**: 자격평가/사업계획서 = `claude-sonnet-4-6`, 체크리스트/일정 = `claude-haiku-4-5-20251001` (월 ~50건 분석 시 약 5만원)

### 👤 B. 1인 컨설턴트 / 자영업자

**상황**: 본인 회사 1곳, 가끔 분석.

**권장 키 구성**:
- Anthropic: 본인 결제카드 등록 → 첫 사용 무료 크레딧 $5 → 50번 분석 가능
- 공공데이터포털: 무료, 가입 후 K-Startup 활용신청
- 기업마당: 선택 (API 연동 필요할 때만)

**시연 모드 추천**: API 키 없이 → mock 모드로 PoC 확인 → 마음에 들면 키 발급

### 🏛️ C. 정부지원기관 내부 (다부서)

**상황**: 여러 팀이 같은 시스템 사용. 키 공유 곤란.

**권장**: **각 부서별 별도 PC + 별도 키**
- 한 PC 의 SQLite 에 키 저장 → 그 PC 에서만 사용
- 부서 A 의 PC: A의 Anthropic 키 + A 키
- 부서 B 의 PC: B의 Anthropic 키 + B 키
- → 비용 청구 분리, 호출 quota 분리

> SQLite 파일 자체를 공유하면 키도 같이 공유됨. 절대 금지.

### 🏫 D. 교육/강의 / 스터디

**상황**: 학생들에게 시연.

**권장**: **mock 모드만** (모든 키 비워둠)
- API 비용 0원
- 결정론적 더미 응답이라 시연 일관성 있음
- 학생들에게 코드 구조만 보여줌

---

## 4. 키 발급 방법

### 4-1. data.go.kr (공공데이터포털) 인증키

1. https://www.data.go.kr 회원가입 (실명·휴대폰 인증)
2. 상단 [데이터찾기] → "K-Startup" 검색
3. **창업진흥원_K-Startup(사업소개,사업공고,콘텐츠 등)_조회서비스** 클릭
4. 우측 [활용신청] → 활용 목적 작성 → 제출 → **자동승인** (수 초 내)
5. 마이페이지 > 데이터활용 > Open API > 활용신청 현황 → 승인된 API 클릭
6. **End Point** + **일반 인증키 (Encoding)** 복사
7. 대시보드 [⚙️ 설정] → `공공데이터포털 인증키` 필드에 붙여넣기 → [💾 저장]

> "중소벤처기업부_중소기업 지원사업 공고 조회 서비스" 도 같은 화면에서 활용신청 가능. 같은 인증키로 동작.

### 4-2. bizinfo.go.kr (기업마당) 인증키

1. https://www.bizinfo.go.kr 회원가입
2. 상단 [고객지원] > [API] (또는 https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C171/AS/74/list.do)
3. [이용 신청] → 사이트·목적 작성 → 즉시 발급
4. 발급된 **API 인증 키** 복사 (보통 6자 정도의 짧은 문자열)
5. 대시보드 [⚙️ 설정] → `기업마당 인증키` 필드에 붙여넣기 → [💾 저장]

### 4-3. Anthropic API 키

1. https://console.anthropic.com 가입
2. Settings > API Keys > [Create Key]
3. 키 이름 입력 (예: `gov-support-multi-agent`)
4. **표시되는 즉시 복사** (이후 다시 못 봄)
5. 대시보드 [⚙️ 설정] → `Anthropic API 키` 필드에 붙여넣기 → [💾 저장]

> 기본 무료 크레딧 $5 제공. 추가 결제는 카드 등록 필요.

### 4-4. Google Gemini API 키

1. https://aistudio.google.com/app/apikey 접속 (Google 계정 로그인)
2. [Create API key] 클릭 → 새 프로젝트 또는 기존 프로젝트 선택
3. 키 복사 (예: `AIzaSy...` 39자)
4. 대시보드 [⚙️ 설정] → `Google Gemini API 키` 필드에 붙여넣기 → [💾 저장]

> Gemini 2.5 Flash / Flash-Lite 는 무료 티어 (분당 15회) 제공.
> 에이전트별 모델 변경: `packages/orchestrator/agents/*.json` 의 `provider` 와 `model` 필드 수정.

#### 에이전트별 provider 전환 예시

`agents/doc-checklist.json` 을 Gemini Flash-Lite 로 바꾸려면:

```json
{
  "agent_id": "doc-checklist",
  "provider": "gemini",
  "model": "gemini-2.5-flash-lite",
  ...
}
```

저장 후 orchestrator 재시작 (또는 tsx watch 가 자동 reload).
이후 [전략 분석] 시 doc-checklist 만 Gemini, 나머지 3개는 Anthropic 호출.

---

## 5. 데이터 가져오기 흐름

대시보드의 **[⚙️ 설정] 페이지** → 상단 [📥 실데이터 적재] 섹션

### 옵션 1. 합성 fixture (시연용, API 키 불필요)
- [↩ 합성 fixture 20건으로 되돌리기] 클릭
- 즉시 20건 적재 (제가 만든 가짜 데이터)
- 공고명 클릭하면 **404 — URL 가짜이므로 정상**

### 옵션 2. 실데이터 (실제 정부 API)
- 키 입력 → [💾 저장]
- 옵션:
  - **소스당 받을 건수**: 10~500 (기본 100)
  - **기존 공고 삭제**: ON (덮어쓰기) / OFF (누적)
- [🔄 실데이터 가져오기 (정부 API)] 클릭
- 활성화된 키마다 동시 호출 → SQLite 에 적재
- 공고명 클릭 시 **진짜 정부 페이지로 이동**

> 한 번 받은 후에는 SQLite 캐시만으로 검색 가능. 매번 호출 안 함.
> 새 공고 반영하려면 다시 [🔄 실데이터 가져오기].

---

## 6. 분석 흐름

1. http://localhost:3000 (대시보드)
2. 좌측 검색창에 키워드/지역/업종 → 결과 목록
3. 관심 공고 **체크박스** 다중 선택
4. 우측 상단 [🚀 전략 분석 (선택 N건 × 4 = 4N 글)] 클릭
5. 하단 게시판에 4N 개 카드가 "실행 중" → "완료" 로 갱신
   - 자격평가 / 사업계획서 / 서류 체크리스트 / 마일스톤 일정표
6. 카드 [▼ 상세보기] 로 한국어 마크다운 본문 + Zod 검증된 JSON 페이로드 확인
7. [📦 DB 다운로드] / [📊 공고 CSV] / [📝 게시글 CSV] 로 결과 내보내기

### Mock 모드 vs 실 모드

- ANTHROPIC_API_KEY 없으면 → 자동 **mock 모드** (결정론적 더미 응답, 비용 0원)
- 키 있으면 → 실제 Claude API 호출 (속도·비용 [상세](MODEL_AND_COST.md))

---

## 7. 자주 묻는 질문

### Q. 키를 입력했는데 검색 결과가 그대로네요?
**A.** 검색은 SQLite 캐시를 우선 봅니다. 신규 공고 받으려면:
- [⚙️ 설정] → [🔄 실데이터 가져오기] 한 번 누르세요.

### Q. 다른 사람과 같이 쓰고 싶어요.
**A.** 권장하지 않습니다. SQLite 에 키 평문 저장이라 PC 공유 = 키 공유. 부서별 별도 PC 사용.

### Q. 키가 유출됐을 때?
**A.**
1. data.go.kr 마이페이지 > 활용신청 현황 > 해당 API > [인증키 변경]
2. bizinfo.go.kr 고객지원 > API > 키 폐기 후 재발급
3. Anthropic console > Settings > API Keys > 해당 키 [Delete] → 새로 발급
4. 대시보드 [⚙️ 설정] 에서 새 키로 [💾 저장]

### Q. 비용이 너무 많이 나옵니다.
**A.** 모델을 Haiku 로 낮추세요. `packages/orchestrator/agents/*.json` 의 `model` 필드를 `claude-haiku-4-5-20251001` 로 변경. 4개 모두 Haiku 사용 시 케이스당 약 140원.

### Q. data.go.kr 키 1개로 다른 API 도 쓸 수 있나요?
**A.** 네. 같은 계정에서 활용신청한 모든 API 가 **같은 인증키 1개**를 공유합니다 (data.go.kr 정책). 추가 활용신청은 마이페이지에서 가능하고 자동승인 됩니다.

### Q. 결과를 이메일로 보내거나 공유하려면?
**A.** [⚙️ 설정] → [📦 DB 다운로드] (전체) 또는 케이스 페이지의 Markdown 보고서 다운로드 (`/api/export/cases/:id/md`).

---

## 8. 보안 권장사항

| 항목 | 권장 |
|---|---|
| 키 저장 위치 | 로컬 SQLite (현재 기본) — PC 외부로 절대 공유 금지 |
| .env 파일 | git 에 커밋되지 않게 `.gitignore` 에 포함 (이미 적용됨) |
| 시연 후 키 처리 | 데모 종료 후 발급처에서 **즉시 폐기/재발급** 권장 |
| 외부 노출 | 기본은 LAN 노출. 외부 인터넷 노출 시 추가 인증 필요 |
| 다중 사용자 | 부서별 PC + 부서별 키. SQLite 파일 공유 X |

---

## 9. 시나리오별 체크리스트

### 시연용 (5분 준비)
- [ ] `install.bat` 한 번
- [ ] `dev.bat` → 브라우저 자동 오픈
- [ ] [⚙️ 설정] 에서 키 입력 (또는 mock 모드 그대로)
- [ ] 검색 → 체크 → [전략 분석]

### 본격 도입 (1시간 준비)
- [ ] 부서 단위 Anthropic API 키 발급 + 카드 등록
- [ ] data.go.kr 활용신청 (K-Startup + 중소기업 지원사업)
- [ ] bizinfo.go.kr 인증키 발급
- [ ] 모델 선택 (Sonnet 기본 / Haiku 저비용 / Opus 고품질)
- [ ] 회사 프로파일 입력 — 현재는 데모 프로파일 자동 생성, 실데이터로 교체 시 `POST /api/profiles` 사용
- [ ] [🔄 실데이터 가져오기] 1회
- [ ] 케이스 5건 시범 분석 → 비용 모니터링 → 모델·도구 조합 튜닝

### 운영 단계 (V2 — 추가 작업 필요)
- [ ] 환경변수 + 시크릿 매니저 (AWS Secrets Manager / HashiCorp Vault)
- [ ] 사용자 인증 (NextAuth / Lucia)
- [ ] 부서별 데이터 분리 (workspace_id 컬럼 추가)
- [ ] 호출량/비용 대시보드 위젯
- [ ] CI/CD + 배포 (Vercel / Render / 자체 서버)
