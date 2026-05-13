/**
 * 조달청_나라장터 입찰공고정보서비스 — 용역 카테고리 클라이언트.
 *
 * Base URL: https://apis.data.go.kr/1230000/ad/BidPublicInfoService
 * Operation: /getBidPblancListInfoServc (용역조회)
 * 응답 포맷: JSON (type=json) 또는 XML
 *
 * 필수 파라미터: serviceKey, pageNo, numOfRows, inqryDiv
 *   inqryDiv = 1: 등록일시 기준 (inqryBgnDt~inqryEndDt 필요)
 *   inqryDiv = 2: 변경일시 기준
 *   inqryDiv = 3: 입찰공고번호 기준 (bidNtceNo 필요)
 *
 * 우리는 inqryDiv=1 + 최근 90일 등록 공고를 가져와서
 * 카테고리(edu/oda) 키워드로 클라이언트측 필터링한다.
 */

import type { G2bFetchParams, G2bFetchResult, G2bBidItem } from "../types/g2b.js";
import { normalizeSmesPortalToken } from "../smesQueryEncoding.js";

const BASE =
  "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServc";

// 부서별 키워드 — 응답 후 클라이언트측 필터링용
const CATEGORY_KEYWORDS: Record<"edu" | "oda", string[]> = {
  edu: ["교육", "훈련", "이러닝", "역량강화", "콘텐츠", "리스킬링", "직무", "AI 교육"],
  oda: ["ODA", "개발협력", "원조", "수원국", "국제개발", "역량강화"],
};

function yyyymmddhhmm(d: Date, hhmm: string): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hhmm}`;
}

export async function fetchG2bBidList(
  params: G2bFetchParams,
  fetchFn: typeof fetch = fetch
): Promise<G2bFetchResult> {
  const { serviceKey, category, keyword, pageNo = 1, numOfRows = 50 } = params;

  // 기간 자동 산출 — 최근 30일 (G2B 1개월 제한 회피)
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400_000);
  const inqryBgnDt = params.inqryBgnDt ?? yyyymmddhhmm(thirtyDaysAgo, "0000");
  const inqryEndDt = params.inqryEndDt ?? yyyymmddhhmm(today, "2359");

  const url = new URL(BASE);
  url.searchParams.set("serviceKey", normalizeSmesPortalToken(serviceKey));
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(Math.min(numOfRows, 100)));
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", "1");            // 등록일시 기준
  url.searchParams.set("inqryBgnDt", inqryBgnDt);
  url.searchParams.set("inqryEndDt", inqryEndDt);

  let res: Response;
  try {
    res = await fetchFn(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json,application/xml,*/*", "User-Agent": "gov-support-mcp/0.1" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, httpStatus: 0, items: [], totalCount: 0, bodySnippet: msg };
  }

  const bodyText = await res.text();
  const snippet = bodyText.slice(0, 500);

  if (!res.ok) {
    return { ok: false, httpStatus: res.status, items: [], totalCount: 0, bodySnippet: snippet };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return {
      ok: false,
      httpStatus: res.status,
      items: [],
      totalCount: 0,
      bodySnippet: `JSON 파싱 실패: ${snippet}`,
    };
  }

  // header.resultCode 체크
  const resultCode: string | undefined = parsed?.response?.header?.resultCode ?? parsed?.header?.resultCode;
  const resultMsg: string | undefined = parsed?.response?.header?.resultMsg ?? parsed?.header?.resultMsg;
  if (resultCode && resultCode !== "00" && resultCode !== "0") {
    return {
      ok: false,
      httpStatus: res.status,
      items: [],
      totalCount: 0,
      bodySnippet: `resultCode=${resultCode} ${resultMsg ?? ""} | ${snippet}`,
    };
  }

  // 응답 구조: response.body.items.item — item 이 객체(1건) 또는 배열(여러건)
  const body = parsed?.response?.body ?? parsed?.body;
  const itemsContainer = body?.items;
  let rawItems: G2bBidItem[] = [];
  if (Array.isArray(itemsContainer)) {
    // 일부 구현에선 items 자체가 배열
    rawItems = itemsContainer as G2bBidItem[];
  } else if (itemsContainer?.item) {
    rawItems = Array.isArray(itemsContainer.item)
      ? (itemsContainer.item as G2bBidItem[])
      : [itemsContainer.item as G2bBidItem];
  }
  const totalCount: number = Number(body?.totalCount ?? rawItems.length) || rawItems.length;

  // 분야 키워드 폴백 필터
  const haystackKeys: (keyof G2bBidItem)[] = [
    "bidNtceNm", "srvceDivNm", "ntceInsttNm", "dminsttNm",
    "pubPrcrmntLrgClsfcNm", "pubPrcrmntMidClsfcNm", "pubPrcrmntClsfcNm",
  ];
  const wanted = [...CATEGORY_KEYWORDS[category], ...(keyword ? [keyword] : [])].map((k) => k.toLowerCase());
  const filtered = rawItems.filter((it) => {
    const hay = haystackKeys.map((k) => String(it[k] ?? "")).join(" ").toLowerCase();
    return wanted.some((w) => hay.includes(w));
  });

  // 입찰 마감 미경과 행만 (등록일 기준 조회라 마감 지난 공고가 다수 섞임)
  const todayIso = new Date().toISOString().slice(0, 10);
  function isOpen(it: G2bBidItem): boolean {
    const clse = String(it.bidClseDt ?? "");
    if (!clse) return true; // 마감일 미상 → 일단 포함
    // 14자/12자/8자 datetime 모두 앞 8자에서 ISO 변환
    const m = clse.match(/^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})/);
    if (!m) return true;
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return iso >= todayIso;
  }
  const openOnly = (filtered.length > 0 ? filtered : rawItems).filter(isOpen);

  return {
    ok: true,
    httpStatus: res.status,
    items: openOnly,
    totalCount,
    bodySnippet: `${rawItems.length} raw / ${filtered.length} category / ${openOnly.length} 마감미경과`,
  };
}
