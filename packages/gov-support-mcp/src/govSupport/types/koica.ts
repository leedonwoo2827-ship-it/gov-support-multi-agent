/**
 * KOICA ODA 입찰정보 목록조회 응답 타입 (신규 GW 엔드포인트).
 *
 * 서비스 URL: https://apis.data.go.kr/B260003/PrcureService/getBidPblancInfoList
 *   (구 openapi.koica.go.kr 도메인 2026-05 폐기. data.go.kr 신규 데이터셋 15158380)
 * 응답 포맷: JSON (필드명 UPPER_SNAKE_CASE). 수치 필드는 JSON number 로 반환됨.
 * 응답 구조: HEADER + BODY.ITEMS.ITEM (단건이면 객체, 다건이면 배열 — 클라이언트에서 정규화).
 *
 * 추가 엔드포인트 (동일 Base URL):
 *  - /getOrprPlanInfoList   년간 발주 계획 조회
 *  - /getVltrnCntrctList    수의계약 목록 조회 (ODA 가격경쟁력 분석 후보)
 */

export interface KoicaOdaItem {
  BID_LMT_AMOUNT?: string | number; // 입찰한도액
  BID_NM?: string;                  // 입찰명
  BID_POP_OUT_URL?: string;         // 입찰공고상세내용 외부 URL
  BID_PROGRS_STTUS_NM?: string;     // 입찰진행상태명 (낙찰/접수중 등)
  CNTRCT_MTH_NM?: string;           // 계약방법 (일반경쟁/제한경쟁 등)
  PBLANC_NO?: string;               // 공고번호 (예: P2015-00001)
  PBLANC_ODR?: string | number;     // 공고차수
  PRCURE_BSNS_SE_CD_NM?: string;    // 조달사업구분명 (원조조달입찰 등)
  PRCURE_DETAIL_SE_NM?: string;     // 조달상세구분명 (신규 GW 필드)
  PRCURE_SE_NM?: string;            // 조달구분명 (구매/용역 등)
  SCSBID_MTH_NM?: string;           // 낙찰자선정방식명
  RNUM?: string | number;           // 행번호
  [k: string]: unknown;
}

export interface KoicaFetchParams {
  serviceKey: string;
  year?: number;          // P_YEAR (필수) — 기본 현재 연도
  keyword?: string;
  pageNo?: number;        // P_PAGE_NO
  numOfRows?: number;     // P_PAGE_SIZE
}

export interface KoicaFetchResult {
  ok: boolean;
  httpStatus: number;
  items: KoicaOdaItem[];
  totalCount: number;
  bodySnippet: string;
}

/**
 * KOICA 수의계약 목록조회 (/getVltrnCntrctList) 응답 아이템.
 *
 * 입찰공고 API와 동일한 GW (B260003/PrcureService) — UPPER_SNAKE_CASE 필드.
 * 수의계약은 경쟁입찰이 없으므로 낙찰률·참가업체수 개념이 없고, 계약상대업체·계약금액이 핵심 지표.
 *
 * data.go.kr 신규 GW 의 실 응답 필드명이 추후 확정되면 옵셔널 필드를 확장한다.
 * 현재는 KOICA 다른 엔드포인트의 명명 규칙(PBLANC_NO, BID_NM, *_NM 패턴)을 따라 유추한 스키마.
 */
export interface KoicaVltrnCntrctItem {
  PBLANC_NO?: string;                   // 공고번호 (있을 경우)
  CNTRCT_NO?: string;                   // 계약번호
  BID_NM?: string;                      // 사업/계약명
  CNTRCT_NM?: string;                   // 계약명 (BID_NM 대체)
  CNTRCT_MTH_NM?: string;               // 계약방법 ("수의계약" 등)
  CNTRCT_DATE?: string;                 // 계약일자 (YYYYMMDD 또는 YYYY-MM-DD)
  CNTRCT_DTM?: string;                  // 계약일시 (대체 필드)
  CNTRCT_AMOUNT?: string | number;      // 계약금액
  CNTRCT_AMT?: string | number;         // 계약금액 (대체)
  CNTRCTOR_NM?: string;                 // 계약상대업체명
  BIZ_NM?: string;                      // 업체명 (대체)
  CRPNM?: string;                       // 법인명 (대체)
  PRCURE_SE_NM?: string;                // 조달구분명 (용역/구매/공사)
  PRCURE_BSNS_SE_CD_NM?: string;        // 조달사업구분명
  PRCURE_DETAIL_SE_NM?: string;         // 조달상세구분
  RNUM?: string | number;
  [k: string]: unknown;
}

export interface KoicaVltrnFetchParams {
  serviceKey: string;
  year?: number;          // P_YEAR — 미지정 시 현재/직전 연도 자동 폴백
  keyword?: string;       // 사업명·조달구분 키워드 필터
  pageNo?: number;
  numOfRows?: number;
}

export interface KoicaVltrnFetchResult {
  ok: boolean;
  httpStatus: number;
  items: KoicaVltrnCntrctItem[];
  totalCount: number;
  bodySnippet: string;
}
