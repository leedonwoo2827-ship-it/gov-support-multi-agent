/**
 * 조달청_나라장터 입찰공고정보서비스 (data.go.kr 15129394).
 *
 * 용역 카테고리 operation: /getBidPblancListInfoServc
 * Base URL: apis.data.go.kr/1230000/ad/BidPublicInfoService
 *
 * 모든 필드명은 swagger 명세 (camelCase) 기준.
 */

export interface G2bBidItem {
  // 식별·일정
  bidNtceNo?: string;          // 입찰공고번호
  bidNtceOrd?: string;         // 공고차수
  bidNtceNm?: string;          // 입찰공고명
  bidNtceDt?: string;          // 공고일시
  bidBeginDt?: string;         // 입찰시작일시
  bidClseDt?: string;          // 입찰마감일시
  opengDt?: string;            // 개찰일시
  rgstDt?: string;             // 등록일시
  pqApplDocRcptDt?: string;    // PQ 서류 접수마감

  // 발주 기관
  ntceInsttNm?: string;        // 공고기관
  ntceInsttCd?: string;
  dminsttNm?: string;          // 수요기관
  dminsttCd?: string;

  // 분류
  pubPrcrmntLrgClsfcNm?: string;   // 공공조달분류(대분류)
  pubPrcrmntMidClsfcNm?: string;   // 공공조달분류(중분류)
  pubPrcrmntClsfcNm?: string;      // 공공조달분류(세분류)
  srvceDivNm?: string;             // 용역구분명
  ntceKindNm?: string;             // 공고종류

  // 금액
  presmptPrce?: string;        // 추정가격
  asignBdgtAmt?: string;       // 배정예산

  // 계약/평가
  cntrctCnclsMthdNm?: string;  // 계약체결방법
  bidMethdNm?: string;         // 입찰방식
  pqEvalYn?: string;           // PQ 평가여부
  tpEvalYn?: string;           // 적격심사 여부

  // URL
  bidNtceDtlUrl?: string;      // 상세 URL
  bidNtceUrl?: string;
  stdNtceDocUrl?: string;

  [k: string]: unknown;
}

export interface G2bFetchParams {
  serviceKey: string;
  category: "edu" | "oda";     // 교육·훈련용역 / ODA·국제개발 (키워드 폴백 필터)
  keyword?: string;
  pageNo?: number;
  numOfRows?: number;
  inqryBgnDt?: string;         // YYYYMMDD0000 — 미지정 시 90일 전
  inqryEndDt?: string;         // YYYYMMDD2359 — 미지정 시 오늘
}

export interface G2bFetchResult {
  ok: boolean;
  httpStatus: number;
  items: G2bBidItem[];
  totalCount: number;
  bodySnippet: string;
}
