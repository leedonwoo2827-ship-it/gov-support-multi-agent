/**
 * KOICA ODA 입찰정보 목록조회 클라이언트.
 *
 * 서비스 URL: http://openapi.koica.go.kr/api/ws/PrcureService/getBidPblancInfoList
 *   (KOICA 자체 도메인, HTTP)
 * 응답 포맷: XML
 * 인증키: data.go.kr 발급 PUBLIC_DATA_SERVICE_KEY 재사용 (serviceKey 파라미터)
 *
 * 필수 파라미터: P_YEAR(4), P_PAGE_NO(2), P_PAGE_SIZE(3)
 */

import type { KoicaFetchParams, KoicaFetchResult, KoicaOdaItem } from "../types/koica.js";
import { normalizeSmesPortalToken } from "../smesQueryEncoding.js";

const BASE = "http://openapi.koica.go.kr/api/ws/PrcureService/getBidPblancInfoList";

function parseKoicaXml(xml: string): { items: KoicaOdaItem[]; totalCount: number; resultCode?: string; resultMsg?: string } {
  const resultCodeMatch = xml.match(/<RESULT_CODE>([^<]*)<\/RESULT_CODE>/i);
  const resultMsgMatch = xml.match(/<RESULT_MSG>([^<]*)<\/RESULT_MSG>/i);
  const totalCountMatch = xml.match(/<TOTAL_COUNT>(\d+)<\/TOTAL_COUNT>/i);

  const items: KoicaOdaItem[] = [];
  // Items 컨테이너 내부의 각 row — 보통 <item>...</item> 또는 <row>...</row>
  const itemRegex = /<(item|row|Items)>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const itemBody = m[2];
    const item: KoicaOdaItem = {};
    const fieldRegex = /<([A-Z][A-Z0-9_]*)>([^<]*)<\/\1>/g;
    let f: RegExpExecArray | null;
    while ((f = fieldRegex.exec(itemBody)) !== null) {
      const [, key, val] = f;
      (item as Record<string, unknown>)[key] = val.trim();
    }
    if (Object.keys(item).length > 0) items.push(item);
  }

  return {
    items,
    totalCount: totalCountMatch ? parseInt(totalCountMatch[1], 10) : items.length,
    resultCode: resultCodeMatch?.[1],
    resultMsg: resultMsgMatch?.[1],
  };
}

export async function fetchKoicaOdaList(
  params: KoicaFetchParams,
  fetchFn: typeof fetch = fetch
): Promise<KoicaFetchResult> {
  const { serviceKey, year = new Date().getFullYear(), keyword, pageNo = 1, numOfRows = 30 } = params;

  const url = new URL(BASE);
  url.searchParams.set("serviceKey", normalizeSmesPortalToken(serviceKey));
  url.searchParams.set("P_YEAR", String(year));
  url.searchParams.set("P_PAGE_NO", String(pageNo));
  url.searchParams.set("P_PAGE_SIZE", String(Math.min(numOfRows, 100)));

  let res: Response;
  try {
    res = await fetchFn(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/xml,text/xml,*/*", "User-Agent": "gov-support-mcp/0.1" },
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

  const parsed = parseKoicaXml(bodyText);

  // resultCode가 명시되었고 "00"/"0" 외이면 실패로 표시
  if (parsed.resultCode && parsed.resultCode !== "00" && parsed.resultCode !== "0") {
    return {
      ok: false,
      httpStatus: res.status,
      items: [],
      totalCount: 0,
      bodySnippet: `RESULT_CODE=${parsed.resultCode} ${parsed.resultMsg ?? ""} | ${snippet}`,
    };
  }

  // 키워드 폴백 필터
  const filtered = keyword
    ? parsed.items.filter((it) => {
        const hay = [it.BID_NM, it.PRCURE_BSNS_SE_CD_NM, it.PRCURE_SE_NM]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(keyword.toLowerCase());
      })
    : parsed.items;

  return {
    ok: true,
    httpStatus: res.status,
    items: filtered,
    totalCount: parsed.totalCount,
    bodySnippet: snippet,
  };
}
