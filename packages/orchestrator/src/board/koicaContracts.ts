// KOICA 수의계약 (koica_contracts) — ODA 가격경쟁력 axis 컨텍스트 입력용
//
// 자격평가 해외사업부(oda) 에이전트가 KOICA 수의계약 통계를 받아
// "KOICA는 최근 N건 수의계약, 평균 계약금액 X천만원, 주요 파트너 A·B·C" 같은
// 객관 데이터를 5축의 가격경쟁력 axis 에 반영.

import { getDb, transaction } from "../db/client.js";
import type { KoicaVltrnCntrctItem } from "@gov/mcp-tools";

export interface KoicaContractRow {
  id: string;
  pblancNo: string | null;
  cntrctNm: string | null;
  cntrctorNm: string | null;
  cntrctAmount: number | null;
  cntrctDate: string | null;
  cntrctMthNm: string | null;
  prcureSeNm: string | null;
  prcureBsnsSeNm: string | null;
  prcureDetailSeNm: string | null;
}

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeDateLoose(d: unknown): string | null {
  if (!d) return null;
  const s = String(d).trim();
  if (!s) return null;
  if (/^\d{12,14}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}[-/.]\d{2}[-/.]\d{2}/.test(s)) return s.slice(0, 10).replace(/[/.]/g, "-");
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

// API 응답 필드명의 변동 가능성 — 동의어 필드를 우선순위로 펼쳐서 읽는다.
function pickStr(it: KoicaVltrnCntrctItem, keys: string[]): string | null {
  for (const k of keys) {
    const v = (it as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function pickNum(it: KoicaVltrnCntrctItem, keys: string[]): number | null {
  for (const k of keys) {
    const n = parseNum((it as Record<string, unknown>)[k]);
    if (n !== null) return n;
  }
  return null;
}

export function bulkUpsertKoicaContracts(
  items: KoicaVltrnCntrctItem[],
): { inserted: number; skipped: number } {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO koica_contracts (
      id, pblanc_no, cntrct_nm, cntrctor_nm,
      cntrct_amount, cntrct_date, cntrct_mth_nm,
      prcure_se_nm, prcure_bsns_se_nm, prcure_detail_se_nm,
      raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      cntrctor_nm = excluded.cntrctor_nm,
      cntrct_amount = excluded.cntrct_amount,
      cntrct_date = excluded.cntrct_date,
      raw_json = excluded.raw_json,
      fetched_at = datetime('now')
  `);
  let inserted = 0;
  let skipped = 0;
  transaction(db, () => {
    for (const it of items) {
      const pblancNo = pickStr(it, ["PBLANC_NO", "CNTRCT_NO"]);
      const cntrctNm = pickStr(it, ["CNTRCT_NM", "BID_NM"]);
      const cntrctorNm = pickStr(it, ["CNTRCTOR_NM", "BIZ_NM", "CRPNM"]);
      const cntrctAmount = pickNum(it, ["CNTRCT_AMOUNT", "CNTRCT_AMT"]);
      const cntrctDate = normalizeDateLoose(pickStr(it, ["CNTRCT_DATE", "CNTRCT_DTM"]));
      const cntrctMthNm = pickStr(it, ["CNTRCT_MTH_NM"]);
      const prcureSeNm = pickStr(it, ["PRCURE_SE_NM"]);
      const prcureBsnsSeNm = pickStr(it, ["PRCURE_BSNS_SE_CD_NM"]);
      const prcureDetailSeNm = pickStr(it, ["PRCURE_DETAIL_SE_NM"]);

      // id 키: pblanc_no + cntrct_date 가 가장 안정적. 둘 다 없으면 raw 해시.
      let id = pblancNo ? `${pblancNo}${cntrctDate ? `-${cntrctDate}` : ""}` : "";
      if (!id) {
        const hash = `${cntrctNm ?? ""}|${cntrctorNm ?? ""}|${cntrctAmount ?? ""}|${cntrctDate ?? ""}`;
        if (!hash.replace(/\|/g, "")) { skipped++; continue; }
        id = `koica-vltrn:${hash}`;
      }
      insert.run(
        id, pblancNo, cntrctNm, cntrctorNm,
        cntrctAmount, cntrctDate, cntrctMthNm,
        prcureSeNm, prcureBsnsSeNm, prcureDetailSeNm,
        JSON.stringify(it),
      );
      inserted++;
    }
  });
  return { inserted, skipped };
}

export function countKoicaContracts(): number {
  return (getDb().prepare(`SELECT COUNT(*) as c FROM koica_contracts`).get() as any).c;
}

// 분야/사업명 키워드로 KOICA 수의계약 통계 — ODA 가격경쟁력 axis 입력
export interface KoicaContractStats {
  keyword: string;
  count: number;
  avgAmt: number | null;            // 평균 계약금액 (원)
  minAmt: number | null;
  maxAmt: number | null;
  topContractors: { name: string; count: number }[];  // 주요 수의 파트너
  recentSamples: { name: string; amount: number | null; date: string | null; nm: string | null }[];
}

export function getKoicaContractStats(keyword: string): KoicaContractStats | null {
  if (!keyword || !keyword.trim()) return null;
  const db = getDb();
  const like = `%${keyword.trim()}%`;
  // 사업명·조달사업구분·상세구분 어느 곳에 키워드가 들어가도 매칭
  const where = `(cntrct_nm LIKE ? OR prcure_bsns_se_nm LIKE ? OR prcure_detail_se_nm LIKE ?)`;

  const summary = db.prepare(`
    SELECT
      COUNT(*) as count,
      AVG(cntrct_amount) as avgAmt,
      MIN(cntrct_amount) as minAmt,
      MAX(cntrct_amount) as maxAmt
    FROM koica_contracts
    WHERE ${where} AND cntrct_amount IS NOT NULL
  `).get(like, like, like) as any;

  if (!summary || summary.count === 0) return null;

  const winners = db.prepare(`
    SELECT cntrctor_nm as name, COUNT(*) as count
    FROM koica_contracts
    WHERE ${where} AND cntrctor_nm IS NOT NULL
    GROUP BY cntrctor_nm
    ORDER BY count DESC
    LIMIT 5
  `).all(like, like, like) as { name: string; count: number }[];

  const samples = db.prepare(`
    SELECT cntrctor_nm as name, cntrct_amount as amount, cntrct_date as date, cntrct_nm as nm
    FROM koica_contracts
    WHERE ${where}
    ORDER BY cntrct_date DESC NULLS LAST
    LIMIT 5
  `).all(like, like, like) as { name: string; amount: number | null; date: string | null; nm: string | null }[];

  return {
    keyword,
    count: summary.count,
    avgAmt: summary.avgAmt,
    minAmt: summary.minAmt,
    maxAmt: summary.maxAmt,
    topContractors: winners,
    recentSamples: samples,
  };
}

// 전체 KOICA 수의계약 요약 — 분야별 키워드 통계 미지정 시 폴백
export function getKoicaContractGlobalStats(): { count: number; avgAmt: number | null; topContractors: { name: string; count: number }[] } {
  const db = getDb();
  const r = db.prepare(`
    SELECT COUNT(*) as count, AVG(cntrct_amount) as avgAmt
    FROM koica_contracts WHERE cntrct_amount IS NOT NULL
  `).get() as any;
  const winners = db.prepare(`
    SELECT cntrctor_nm as name, COUNT(*) as count
    FROM koica_contracts WHERE cntrctor_nm IS NOT NULL
    GROUP BY cntrctor_nm ORDER BY count DESC LIMIT 5
  `).all() as { name: string; count: number }[];
  return { count: r.count ?? 0, avgAmt: r.avgAmt, topContractors: winners };
}
