/**
 * 조달청_나라장터 낙찰정보서비스 — 용역 카테고리 클라이언트.
 *
 * Base URL: https://apis.data.go.kr/1230000/as/ScsbidInfoService
 * Operation: /getScsbidListSttusServc (낙찰된 목록 현황 용역조회)
 * 필수: serviceKey, pageNo, numOfRows, inqryDiv
 *   inqryDiv = 1: 등록일시 기준 (inqryBgnDt~inqryEndDt 필요)
 *
 * 응답 구조: response.body.items.item (입찰공고 API와 동일 패턴)
 */

import type { G2bScsbidFetchParams, G2bScsbidFetchResult, G2bScsbidItem } from "../types/g2bScsbid.js";
import { normalizeSmesPortalToken } from "../smesQueryEncoding.js";

const BASE =
  "https://apis.data.go.kr/1230000/as/ScsbidInfoService/getScsbidListSttusServc";

const CATEGORY_KEYWORDS: Record<"edu" | "oda", string[]> = {
  edu: ["교육", "훈련", "이러닝", "역량강화", "콘텐츠", "리스킬링", "직무"],
  oda: ["ODA", "개발협력", "원조", "국제개발", "역량강화"],
};

function yyyymmddhhmm(d: Date, hhmm: string): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hhmm}`;
}

export async function fetchG2bScsbidList(
  params: G2bScsbidFetchParams,
  fetchFn: typeof fetch = fetch
): Promise<G2bScsbidFetchResult> {
  const { serviceKey, category, pageNo = 1, numOfRows = 100 } = params;

  // G2B 1개월 제한 회피 — 최근 30일
  // 더 긴 표본이 필요하면 호출자가 inqryBgnDt/inqryEndDt 명시 (월별 페이지네이션)
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400_000);
  const inqryBgnDt = params.inqryBgnDt ?? yyyymmddhhmm(thirtyDaysAgo, "0000");
  const inqryEndDt = params.inqryEndDt ?? yyyymmddhhmm(today, "2359");

  const url = new URL(BASE);
  url.searchParams.set("serviceKey", normalizeSmesPortalToken(serviceKey));
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(Math.min(numOfRows, 100)));
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("inqryBgnDt", inqryBgnDt);
  url.searchParams.set("inqryEndDt", inqryEndDt);

  let res: Response;
  try {
    res = await fetchFn(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json,*/*", "User-Agent": "gov-support-mcp/0.1" },
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
    return { ok: false, httpStatus: res.status, items: [], totalCount: 0, bodySnippet: `JSON 파싱 실패: ${snippet}` };
  }

  const resultCode: string | undefined = parsed?.response?.header?.resultCode ?? parsed?.header?.resultCode;
  const resultMsg: string | undefined = parsed?.response?.header?.resultMsg ?? parsed?.header?.resultMsg;
  if (resultCode && resultCode !== "00" && resultCode !== "0") {
    return {
      ok: false, httpStatus: res.status, items: [], totalCount: 0,
      bodySnippet: `resultCode=${resultCode} ${resultMsg ?? ""} | ${snippet}`,
    };
  }

  const body = parsed?.response?.body ?? parsed?.body;
  const itemsContainer = body?.items;
  let rawItems: G2bScsbidItem[] = [];
  if (Array.isArray(itemsContainer)) {
    rawItems = itemsContainer as G2bScsbidItem[];
  } else if (itemsContainer?.item) {
    rawItems = Array.isArray(itemsContainer.item)
      ? (itemsContainer.item as G2bScsbidItem[])
      : [itemsContainer.item as G2bScsbidItem];
  }
  const totalCount: number = Number(body?.totalCount ?? rawItems.length) || rawItems.length;

  // 카테고리 키워드 폴백 필터 (공고명·발주처에서 키워드 매칭)
  const wanted = CATEGORY_KEYWORDS[category].map(k => k.toLowerCase());
  const filtered = rawItems.filter((it) => {
    const hay = [it.bidNtceNm, it.dminsttNm].filter(Boolean).join(" ").toLowerCase();
    return wanted.some(w => hay.includes(w));
  });

  return {
    ok: true,
    httpStatus: res.status,
    items: filtered.length > 0 ? filtered : rawItems,
    totalCount,
    bodySnippet: `${rawItems.length} raw / ${filtered.length} filtered`,
  };
}
