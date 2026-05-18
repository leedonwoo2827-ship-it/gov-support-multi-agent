/**
 * KOICA ODA 입찰정보 목록조회 클라이언트 (신규 GW 엔드포인트).
 *
 * 서비스 URL: https://apis.data.go.kr/B260003/PrcureService/getBidPblancInfoList
 *   (구 openapi.koica.go.kr 도메인은 2026-05 폐기. data.go.kr 신규 데이터셋 15158380)
 * 응답 포맷: JSON 또는 XML — 이 GW는 `type=json` 파라미터를 줘도 XML 로 응답하는 경우가 있어
 *   본문을 sniff 해서 두 형식 모두 파싱한다. 구조 = HEADER + BODY.ITEMS.(ITEM|item).
 * 인증키: data.go.kr 발급 PUBLIC_DATA_SERVICE_KEY (serviceKey 파라미터, 다른 data.go.kr API와 동일 키)
 *
 * 필수 파라미터: P_YEAR(4), P_PAGE_NO, P_PAGE_SIZE
 * 다년도 폴백: year 미지정 시 현재 연도가 0건이면 자동으로 직전 연도까지 묶어서 반환한다
 *   (회계연도 전환 직후 KOICA 공고 미게재 케이스 대응).
 */

import type {
  KoicaFetchParams,
  KoicaFetchResult,
  KoicaOdaItem,
  KoicaVltrnCntrctItem,
  KoicaVltrnFetchParams,
  KoicaVltrnFetchResult,
} from "../types/koica.js";
import { normalizeSmesPortalToken } from "../smesQueryEncoding.js";

const BASE = "https://apis.data.go.kr/B260003/PrcureService/getBidPblancInfoList";
const VLTRN_BASE = "https://apis.data.go.kr/B260003/PrcureService/getVltrnCntrctList";

interface KoicaParsed {
  resultCode?: string;
  resultMsg?: string;
  items: KoicaOdaItem[];
  totalCount: number;
}

interface KoicaGwJson {
  HEADER?: { RESULT_CODE?: string; RESULT_MSG?: string };
  BODY?: { ITEMS?: { ITEM?: KoicaOdaItem | KoicaOdaItem[] } | null };
  TOTAL_COUNT?: number | string;
}

function toItemArray(item: KoicaOdaItem | KoicaOdaItem[] | undefined | null): KoicaOdaItem[] {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

function parseKoicaJson(bodyText: string): KoicaParsed | null {
  let parsed: KoicaGwJson;
  try {
    parsed = JSON.parse(bodyText) as KoicaGwJson;
  } catch {
    return null;
  }
  const rawTotal = parsed.TOTAL_COUNT;
  const items = toItemArray(parsed.BODY?.ITEMS?.ITEM);
  const totalCount =
    typeof rawTotal === "number"
      ? rawTotal
      : rawTotal
        ? parseInt(String(rawTotal), 10) || items.length
        : items.length;
  return {
    resultCode: parsed.HEADER?.RESULT_CODE,
    resultMsg: parsed.HEADER?.RESULT_MSG,
    items,
    totalCount,
  };
}

function parseKoicaXml(xml: string): KoicaParsed {
  const headerMatch = xml.match(/<HEADER[^>]*>([\s\S]*?)<\/HEADER>/i);
  const headerBody = headerMatch?.[1] ?? "";
  const resultCode = headerBody.match(/<RESULT_CODE[^>]*>([^<]*)<\/RESULT_CODE>/i)?.[1]?.trim();
  const resultMsg = headerBody.match(/<RESULT_MSG[^>]*>([^<]*)<\/RESULT_MSG>/i)?.[1]?.trim();
  const totalMatch = xml.match(/<TOTAL_COUNT[^>]*>(\d+)<\/TOTAL_COUNT>/i);
  const totalCount = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  const items: KoicaOdaItem[] = [];
  // <ITEMS class="array"/> (self-closing, 0건) 또는 <ITEMS>...<item>...</item>...</ITEMS>
  const itemsMatch = xml.match(/<ITEMS[^>]*>([\s\S]*?)<\/ITEMS>/i);
  if (itemsMatch) {
    const itemsBody = itemsMatch[1];
    const itemRegex = /<(item|ITEM|row)[^>]*>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(itemsBody)) !== null) {
      const body = m[2];
      const item: KoicaOdaItem = {};
      const fieldRegex = /<([A-Z][A-Z0-9_]*)[^>]*>([^<]*)<\/\1>/g;
      let f: RegExpExecArray | null;
      while ((f = fieldRegex.exec(body)) !== null) {
        const [, key, val] = f;
        (item as Record<string, unknown>)[key] = val.trim();
      }
      if (Object.keys(item).length > 0) items.push(item);
    }
  }

  return { resultCode, resultMsg, items, totalCount };
}

async function fetchKoicaOdaListForYear(
  serviceKey: string,
  year: number,
  pageNo: number,
  pageSize: number,
  fetchFn: typeof fetch
): Promise<{ ok: boolean; httpStatus: number; parsed: KoicaParsed | null; bodySnippet: string }> {
  const url = new URL(BASE);
  url.searchParams.set("serviceKey", normalizeSmesPortalToken(serviceKey));
  url.searchParams.set("P_YEAR", String(year));
  url.searchParams.set("P_PAGE_NO", String(pageNo));
  url.searchParams.set("P_PAGE_SIZE", String(pageSize));
  url.searchParams.set("type", "json");

  let res: Response;
  try {
    res = await fetchFn(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json,application/xml;q=0.9,*/*;q=0.8", "User-Agent": "gov-support-mcp/0.1" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, httpStatus: 0, parsed: null, bodySnippet: msg };
  }

  const bodyText = await res.text();
  const snippet = bodyText.slice(0, 500);

  if (!res.ok) {
    return { ok: false, httpStatus: res.status, parsed: null, bodySnippet: snippet };
  }

  const trimmed = bodyText.trimStart();
  const parsed = trimmed.startsWith("<") ? parseKoicaXml(bodyText) : parseKoicaJson(bodyText);

  if (!parsed) {
    return { ok: false, httpStatus: res.status, parsed: null, bodySnippet: snippet };
  }

  return { ok: true, httpStatus: res.status, parsed, bodySnippet: snippet };
}

export async function fetchKoicaOdaList(
  params: KoicaFetchParams,
  fetchFn: typeof fetch = fetch
): Promise<KoicaFetchResult> {
  const { serviceKey, year, keyword, pageNo = 1, numOfRows = 30 } = params;
  const pageSize = Math.min(numOfRows, 100);

  const yearsToTry = year !== undefined ? [year] : [new Date().getFullYear(), new Date().getFullYear() - 1];

  let lastHttpStatus = 0;
  let lastSnippet = "";
  let lastResultCode: string | undefined;
  let lastResultMsg: string | undefined;
  const combinedItems: KoicaOdaItem[] = [];
  let combinedTotal = 0;

  for (const y of yearsToTry) {
    const r = await fetchKoicaOdaListForYear(serviceKey, y, pageNo, pageSize, fetchFn);
    lastHttpStatus = r.httpStatus;
    lastSnippet = r.bodySnippet;

    if (!r.ok || !r.parsed) {
      // 네트워크/파싱 실패 — 이 연도는 건너뜀
      continue;
    }

    lastResultCode = r.parsed.resultCode;
    lastResultMsg = r.parsed.resultMsg;

    if (r.parsed.resultCode && r.parsed.resultCode !== "00" && r.parsed.resultCode !== "0") {
      // 인증/권한 오류 — 다른 연도 시도해봐야 같은 결과, 즉시 실패
      return {
        ok: false,
        httpStatus: r.httpStatus,
        items: [],
        totalCount: 0,
        bodySnippet: `RESULT_CODE=${r.parsed.resultCode} ${r.parsed.resultMsg ?? ""} | ${lastSnippet}`,
      };
    }

    combinedItems.push(...r.parsed.items);
    combinedTotal += r.parsed.totalCount;

    // year 명시되었거나 첫 연도에서 데이터가 잡혔으면 추가 호출 불필요
    if (year !== undefined || r.parsed.items.length > 0) break;
  }

  let items = combinedItems;
  if (keyword) {
    const kw = keyword.toLowerCase();
    items = items.filter((it) => {
      const hay = [it.BID_NM, it.PRCURE_BSNS_SE_CD_NM, it.PRCURE_SE_NM]
        .filter(Boolean)
        .map(String)
        .join(" ")
        .toLowerCase();
      return hay.includes(kw);
    });
  }

  const meta = lastResultCode
    ? `RESULT_CODE=${lastResultCode} ${lastResultMsg ?? ""} years=${yearsToTry.join(",")} | ${lastSnippet}`
    : lastSnippet;

  return {
    ok: true,
    httpStatus: lastHttpStatus || 200,
    items,
    totalCount: combinedTotal || items.length,
    bodySnippet: meta,
  };
}

// ── 수의계약 목록 (/getVltrnCntrctList) ──────────────────────────────────
// 입찰공고 GW 와 동일 패턴 (B260003/PrcureService, P_YEAR/P_PAGE_NO/P_PAGE_SIZE,
// HEADER + BODY.ITEMS.ITEM 구조). 자격평가의 "ODA 가격경쟁력" axis 컨텍스트 입력용.

interface KoicaVltrnParsed {
  resultCode?: string;
  resultMsg?: string;
  items: KoicaVltrnCntrctItem[];
  totalCount: number;
}

interface KoicaVltrnGwJson {
  HEADER?: { RESULT_CODE?: string; RESULT_MSG?: string };
  BODY?: { ITEMS?: { ITEM?: KoicaVltrnCntrctItem | KoicaVltrnCntrctItem[] } | null };
  TOTAL_COUNT?: number | string;
}

function toVltrnArray(item: KoicaVltrnCntrctItem | KoicaVltrnCntrctItem[] | undefined | null): KoicaVltrnCntrctItem[] {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

function parseKoicaVltrnJson(bodyText: string): KoicaVltrnParsed | null {
  let parsed: KoicaVltrnGwJson;
  try {
    parsed = JSON.parse(bodyText) as KoicaVltrnGwJson;
  } catch {
    return null;
  }
  const rawTotal = parsed.TOTAL_COUNT;
  const items = toVltrnArray(parsed.BODY?.ITEMS?.ITEM);
  const totalCount =
    typeof rawTotal === "number"
      ? rawTotal
      : rawTotal
        ? parseInt(String(rawTotal), 10) || items.length
        : items.length;
  return {
    resultCode: parsed.HEADER?.RESULT_CODE,
    resultMsg: parsed.HEADER?.RESULT_MSG,
    items,
    totalCount,
  };
}

function parseKoicaVltrnXml(xml: string): KoicaVltrnParsed {
  const headerMatch = xml.match(/<HEADER[^>]*>([\s\S]*?)<\/HEADER>/i);
  const headerBody = headerMatch?.[1] ?? "";
  const resultCode = headerBody.match(/<RESULT_CODE[^>]*>([^<]*)<\/RESULT_CODE>/i)?.[1]?.trim();
  const resultMsg = headerBody.match(/<RESULT_MSG[^>]*>([^<]*)<\/RESULT_MSG>/i)?.[1]?.trim();
  const totalMatch = xml.match(/<TOTAL_COUNT[^>]*>(\d+)<\/TOTAL_COUNT>/i);
  const totalCount = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  const items: KoicaVltrnCntrctItem[] = [];
  const itemsMatch = xml.match(/<ITEMS[^>]*>([\s\S]*?)<\/ITEMS>/i);
  if (itemsMatch) {
    const itemsBody = itemsMatch[1];
    const itemRegex = /<(item|ITEM|row)[^>]*>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(itemsBody)) !== null) {
      const body = m[2];
      const item: KoicaVltrnCntrctItem = {};
      const fieldRegex = /<([A-Z][A-Z0-9_]*)[^>]*>([^<]*)<\/\1>/g;
      let f: RegExpExecArray | null;
      while ((f = fieldRegex.exec(body)) !== null) {
        const [, key, val] = f;
        (item as Record<string, unknown>)[key] = val.trim();
      }
      if (Object.keys(item).length > 0) items.push(item);
    }
  }

  return { resultCode, resultMsg, items, totalCount };
}

async function fetchKoicaVltrnForYear(
  serviceKey: string,
  year: number,
  pageNo: number,
  pageSize: number,
  fetchFn: typeof fetch
): Promise<{ ok: boolean; httpStatus: number; parsed: KoicaVltrnParsed | null; bodySnippet: string }> {
  const url = new URL(VLTRN_BASE);
  url.searchParams.set("serviceKey", normalizeSmesPortalToken(serviceKey));
  url.searchParams.set("P_YEAR", String(year));
  url.searchParams.set("P_PAGE_NO", String(pageNo));
  url.searchParams.set("P_PAGE_SIZE", String(pageSize));
  url.searchParams.set("type", "json");

  let res: Response;
  try {
    res = await fetchFn(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json,application/xml;q=0.9,*/*;q=0.8", "User-Agent": "gov-support-mcp/0.1" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, httpStatus: 0, parsed: null, bodySnippet: msg };
  }

  const bodyText = await res.text();
  const snippet = bodyText.slice(0, 500);

  if (!res.ok) {
    return { ok: false, httpStatus: res.status, parsed: null, bodySnippet: snippet };
  }

  const trimmed = bodyText.trimStart();
  const parsed = trimmed.startsWith("<") ? parseKoicaVltrnXml(bodyText) : parseKoicaVltrnJson(bodyText);

  if (!parsed) {
    return { ok: false, httpStatus: res.status, parsed: null, bodySnippet: snippet };
  }

  return { ok: true, httpStatus: res.status, parsed, bodySnippet: snippet };
}

export async function fetchKoicaVltrnCntrctList(
  params: KoicaVltrnFetchParams,
  fetchFn: typeof fetch = fetch
): Promise<KoicaVltrnFetchResult> {
  const { serviceKey, year, keyword, pageNo = 1, numOfRows = 100 } = params;
  const pageSize = Math.min(numOfRows, 100);

  const yearsToTry = year !== undefined ? [year] : [new Date().getFullYear(), new Date().getFullYear() - 1];

  let lastHttpStatus = 0;
  let lastSnippet = "";
  let lastResultCode: string | undefined;
  let lastResultMsg: string | undefined;
  const combinedItems: KoicaVltrnCntrctItem[] = [];
  let combinedTotal = 0;

  for (const y of yearsToTry) {
    const r = await fetchKoicaVltrnForYear(serviceKey, y, pageNo, pageSize, fetchFn);
    lastHttpStatus = r.httpStatus;
    lastSnippet = r.bodySnippet;

    if (!r.ok || !r.parsed) continue;

    lastResultCode = r.parsed.resultCode;
    lastResultMsg = r.parsed.resultMsg;

    if (r.parsed.resultCode && r.parsed.resultCode !== "00" && r.parsed.resultCode !== "0") {
      return {
        ok: false,
        httpStatus: r.httpStatus,
        items: [],
        totalCount: 0,
        bodySnippet: `RESULT_CODE=${r.parsed.resultCode} ${r.parsed.resultMsg ?? ""} | ${lastSnippet}`,
      };
    }

    combinedItems.push(...r.parsed.items);
    combinedTotal += r.parsed.totalCount;
    if (year !== undefined || r.parsed.items.length > 0) break;
  }

  let items = combinedItems;
  if (keyword) {
    const kw = keyword.toLowerCase();
    items = items.filter((it) => {
      const hay = [it.BID_NM, it.CNTRCT_NM, it.PRCURE_BSNS_SE_CD_NM, it.PRCURE_SE_NM, it.PRCURE_DETAIL_SE_NM]
        .filter(Boolean)
        .map(String)
        .join(" ")
        .toLowerCase();
      return hay.includes(kw);
    });
  }

  const meta = lastResultCode
    ? `RESULT_CODE=${lastResultCode} ${lastResultMsg ?? ""} years=${yearsToTry.join(",")} | ${lastSnippet}`
    : lastSnippet;

  return {
    ok: true,
    httpStatus: lastHttpStatus || 200,
    items,
    totalCount: combinedTotal || items.length,
    bodySnippet: meta,
  };
}
