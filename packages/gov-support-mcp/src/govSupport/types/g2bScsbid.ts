/**
 * 조달청_나라장터 낙찰정보서비스 (data.go.kr 15129397).
 * 용역 카테고리 operation: /getScsbidListSttusServc
 * Base URL: apis.data.go.kr/1230000/as/ScsbidInfoService
 */

export interface G2bScsbidItem {
  // 식별
  bidNtceNo?: string;          // 입찰공고번호 (입찰공고 API 연결 키)
  bidNtceOrd?: string;         // 공고차수
  bidClsfcNo?: string;         // 입찰분류번호
  rbidNo?: string;
  ntceDivCd?: string;
  bidNtceNm?: string;          // 공고명

  // 발주처
  dminsttCd?: string;
  dminsttNm?: string;          // 수요기관

  // 낙찰자
  fnlSucsfCorpOfcl?: string;
  bidwinnrNm?: string;         // 최종낙찰업체명 ⭐
  bidwinnrBizno?: string;      // 사업자번호
  bidwinnrCeoNm?: string;      // 대표자명
  bidwinnrAdrs?: string;
  bidwinnrTelNo?: string;

  // 금액·경쟁
  sucsfbidAmt?: string;        // 최종낙찰금액 ⭐
  sucsfbidRate?: string;       // 최종낙찰률 (%) ⭐⭐
  prtcptCnum?: string;         // 참가업체수

  // 일시
  rlOpengDt?: string;          // 실개찰일시
  fnlSucsfDate?: string;       // 최종낙찰일시
  rgstDt?: string;

  [k: string]: unknown;
}

export interface G2bScsbidFetchParams {
  serviceKey: string;
  category: "edu" | "oda";     // 키워드 폴백 필터용
  pageNo?: number;
  numOfRows?: number;
  inqryBgnDt?: string;         // YYYYMMDD0000 — 미지정 시 180일 전
  inqryEndDt?: string;         // YYYYMMDD2359 — 미지정 시 오늘
}

export interface G2bScsbidFetchResult {
  ok: boolean;
  httpStatus: number;
  items: G2bScsbidItem[];
  totalCount: number;
  bodySnippet: string;
}
