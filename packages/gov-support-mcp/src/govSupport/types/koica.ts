/**
 * KOICA ODA 입찰정보 목록조회 응답 타입.
 *
 * 서비스 URL: http://openapi.koica.go.kr/api/ws/PrcureService/getBidPblancInfoList
 * 응답 포맷: XML (필드명 UPPER_SNAKE_CASE).
 */

export interface KoicaOdaItem {
  BID_LMT_AMOUNT?: string;       // 입찰한도액
  BID_NM?: string;               // 입찰명
  BID_POP_OUT_URL?: string;      // 입찰공고상세내용 외부 URL
  BID_PROGRS_STTUS_NM?: string;  // 입찰진행상태명 (낙찰/접수중 등)
  CNTRCT_MTH_NM?: string;        // 계약방법 (일반경쟁/제한경쟁 등)
  PBLANC_NO?: string;            // 공고번호 (예: P2015-00001)
  PBLANC_ODR?: string;           // 공고차수
  PRCURE_BSNS_SE_CD_NM?: string; // 조달사업구분명 (원조조달입찰 등)
  PRCURE_SE_NM?: string;         // 조달구분명 (구매/용역 등)
  RNUM?: string;                 // 행번호
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
