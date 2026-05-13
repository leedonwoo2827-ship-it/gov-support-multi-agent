// 나라장터 낙찰정보 (bid_awards) — 가격경쟁력 axis 컨텍스트 입력용
//
// 자격평가 에이전트가 발주처별 평균 낙찰률 통계를 받아서
// "이 발주처는 보통 추정가의 N%로 낙찰" 같은 객관 데이터를 5축에 반영.

import { getDb, transaction } from "../db/client.js";
import type { G2bScsbidItem } from "@gov/mcp-tools";

export interface AwardRow {
  id: string;
  bidNtceNo: string;
  bidNtceOrd: string | null;
  bidNtceNm: string | null;
  dminsttNm: string | null;
  dminsttCd: string | null;
  bidwinnrNm: string | null;
  bidwinnrBizno: string | null;
  sucsfbidAmt: number | null;
  sucsfbidRate: number | null;
  prtcptCnum: number | null;
  fnlSucsfDate: string | null;
  rlOpengDt: string | null;
  category: "edu" | "oda" | null;
}

function rowToAward(r: any): AwardRow {
  return {
    id: r.id,
    bidNtceNo: r.bid_ntce_no,
    bidNtceOrd: r.bid_ntce_ord,
    bidNtceNm: r.bid_ntce_nm,
    dminsttNm: r.dminstt_nm,
    dminsttCd: r.dminstt_cd,
    bidwinnrNm: r.bidwinnr_nm,
    bidwinnrBizno: r.bidwinnr_bizno,
    sucsfbidAmt: r.sucsfbid_amt,
    sucsfbidRate: r.sucsfbid_rate,
    prtcptCnum: r.prtcpt_cnum,
    fnlSucsfDate: r.fnl_sucsf_date,
    rlOpengDt: r.rl_openg_dt,
    category: r.category,
  };
}

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseInt2(v: unknown): number | null {
  const n = parseNum(v);
  return n === null ? null : Math.round(n);
}

export function bulkUpsertAwards(
  items: G2bScsbidItem[],
  category: "edu" | "oda",
): { inserted: number; skipped: number } {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO bid_awards (
      id, bid_ntce_no, bid_ntce_ord, bid_ntce_nm,
      dminstt_nm, dminstt_cd, bidwinnr_nm, bidwinnr_bizno,
      sucsfbid_amt, sucsfbid_rate, prtcpt_cnum,
      fnl_sucsf_date, rl_openg_dt, category, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      bidwinnr_nm = excluded.bidwinnr_nm,
      sucsfbid_amt = excluded.sucsfbid_amt,
      sucsfbid_rate = excluded.sucsfbid_rate,
      prtcpt_cnum = excluded.prtcpt_cnum,
      fnl_sucsf_date = excluded.fnl_sucsf_date,
      category = excluded.category,
      raw_json = excluded.raw_json,
      fetched_at = datetime('now')
  `);
  let inserted = 0;
  let skipped = 0;
  transaction(db, () => {
    for (const it of items) {
      const bidNtceNo = String(it.bidNtceNo ?? "");
      if (!bidNtceNo) { skipped++; continue; }
      const bidNtceOrd = it.bidNtceOrd ? String(it.bidNtceOrd) : null;
      const id = `${bidNtceNo}${bidNtceOrd ? `-${bidNtceOrd}` : ""}`;
      insert.run(
        id, bidNtceNo, bidNtceOrd, (it.bidNtceNm as string) ?? null,
        (it.dminsttNm as string) ?? null, (it.dminsttCd as string) ?? null,
        (it.bidwinnrNm as string) ?? null, (it.bidwinnrBizno as string) ?? null,
        parseNum(it.sucsfbidAmt), parseNum(it.sucsfbidRate), parseInt2(it.prtcptCnum),
        (it.fnlSucsfDate as string) ?? null, (it.rlOpengDt as string) ?? null,
        category, JSON.stringify(it),
      );
      inserted++;
    }
  });
  return { inserted, skipped };
}

export function countAwards(): number {
  return (getDb().prepare(`SELECT COUNT(*) as c FROM bid_awards`).get() as any).c;
}

export function listAwards(limit = 50): AwardRow[] {
  const rows = getDb().prepare(`
    SELECT * FROM bid_awards ORDER BY fnl_sucsf_date DESC LIMIT ?
  `).all(limit);
  return rows.map(rowToAward);
}

// 발주처별 낙찰률 통계 — 자격평가 에이전트의 가격경쟁력 axis 컨텍스트
export interface AwardStats {
  agency: string;
  count: number;
  avgRate: number | null;       // 평균 낙찰률 (%)
  minRate: number | null;
  maxRate: number | null;
  avgAmt: number | null;        // 평균 낙찰금액 (원)
  avgParticipants: number | null; // 평균 참가업체수
  topWinners: { name: string; count: number }[];  // 상위 낙찰업체
}

export function getAwardStatsByAgency(
  agencyKeyword: string,
  category?: "edu" | "oda",
): AwardStats | null {
  const db = getDb();
  const params: any[] = [`%${agencyKeyword}%`];
  let where = `dminstt_nm LIKE ?`;
  if (category) { where += ` AND category = ?`; params.push(category); }

  const summary = db.prepare(`
    SELECT
      COUNT(*) as count,
      AVG(sucsfbid_rate) as avgRate,
      MIN(sucsfbid_rate) as minRate,
      MAX(sucsfbid_rate) as maxRate,
      AVG(sucsfbid_amt) as avgAmt,
      AVG(prtcpt_cnum) as avgParticipants
    FROM bid_awards
    WHERE ${where} AND sucsfbid_rate IS NOT NULL
  `).get(...params) as any;

  if (!summary || summary.count === 0) return null;

  const winners = db.prepare(`
    SELECT bidwinnr_nm as name, COUNT(*) as count
    FROM bid_awards
    WHERE ${where} AND bidwinnr_nm IS NOT NULL
    GROUP BY bidwinnr_nm
    ORDER BY count DESC
    LIMIT 5
  `).all(...params) as { name: string; count: number }[];

  return {
    agency: agencyKeyword,
    count: summary.count,
    avgRate: summary.avgRate,
    minRate: summary.minRate,
    maxRate: summary.maxRate,
    avgAmt: summary.avgAmt,
    avgParticipants: summary.avgParticipants,
    topWinners: winners,
  };
}

// 전체 카테고리 통계 (요약용)
export function getCategoryStats(category: "edu" | "oda"): { count: number; avgRate: number | null; avgParticipants: number | null } {
  const r = getDb().prepare(`
    SELECT COUNT(*) as count, AVG(sucsfbid_rate) as avgRate, AVG(prtcpt_cnum) as avgParticipants
    FROM bid_awards WHERE category = ? AND sucsfbid_rate IS NOT NULL
  `).get(category) as any;
  return { count: r.count ?? 0, avgRate: r.avgRate, avgParticipants: r.avgParticipants };
}
