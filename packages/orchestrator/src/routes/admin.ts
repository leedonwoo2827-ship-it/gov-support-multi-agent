// 관리자 라우트 — 실데이터 시드 (대시보드 버튼에서 호출)

import { Hono } from "hono";
import { searchGovernmentSupport, fetchG2bScsbidList, fetchKoicaVltrnCntrctList } from "@gov/mcp-tools";
import { getDb } from "../db/client.js";
import { bulkUpsertPrograms, countPrograms } from "../board/programs.js";
import { bulkUpsertAwards, countAwards } from "../board/awards.js";
import { bulkUpsertKoicaContracts, countKoicaContracts } from "../board/koicaContracts.js";
import { getApiKeys } from "../board/settings.js";
import type { Program, Department } from "@gov/shared";

function inferDepartmentFromSource(source: string): Department {
  if (source === "g2b-edu") return "edu";
  if (source === "koica" || source === "g2b-oda" || source === "edcf" || source === "kotra") return "oda";
  return "planning";
}

interface ImportHistoryRow {
  id: number;
  kind: string;
  sources: string[];
  maxPerSource: number | null;
  wipe: boolean;
  countInserted: number;
  countTotalAfter: number;
  warnings: string[];
  ranAt: string;
}

function logImport(input: {
  kind: "real" | "fixture";
  sources: string[];
  maxPerSource?: number;
  wipe: boolean;
  countInserted: number;
  countTotalAfter: number;
  warnings?: string[];
}): void {
  getDb().prepare(`
    INSERT INTO import_history (kind, sources_json, max_per_source, wipe, count_inserted, count_total_after, warnings_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.kind,
    JSON.stringify(input.sources),
    input.maxPerSource ?? null,
    input.wipe ? 1 : 0,
    input.countInserted,
    input.countTotalAfter,
    JSON.stringify(input.warnings ?? []),
  );
}

/**
 * 정부 API 의 다양한 날짜 포맷을 ISO YYYY-MM-DD 로 정규화.
 * - "20260512" → "2026-05-12"
 * - "20260512180000" → "2026-05-12" (G2B datetime 14자)
 * - "202605121800" → "2026-05-12"  (12자)
 * - "2026-05-12" → "2026-05-12"
 * - "2026-05-12 18:00:00" → "2026-05-12"
 * - "2026/05/12" → "2026-05-12"
 * - 빈 값 / 파싱 불가 → null
 */
function normalizeDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const s = String(d).trim();
  if (!s) return null;
  // G2B/KOICA datetime (12 or 14자) — 앞 8자만 잘라 사용
  if (/^\d{12,14}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}[-/.]\d{2}[-/.]\d{2}/.test(s)) {
    return s.slice(0, 10).replace(/[/.]/g, "-");
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

function listHistory(limit = 20): ImportHistoryRow[] {
  const rows = getDb().prepare(`
    SELECT * FROM import_history ORDER BY id DESC LIMIT ?
  `).all(limit) as any[];
  return rows.map(r => ({
    id: r.id,
    kind: r.kind,
    sources: JSON.parse(r.sources_json),
    maxPerSource: r.max_per_source,
    wipe: !!r.wipe,
    countInserted: r.count_inserted,
    countTotalAfter: r.count_total_after,
    warnings: JSON.parse(r.warnings_json || "[]"),
    ranAt: r.ran_at,
  }));
}

const router = new Hono();

router.post("/seed-real", async (c) => {
  const keys = getApiKeys();

  // 사용자가 [받을 건수] / sources / wipe / department 입력 가능
  const body = await c.req.json().catch(() => ({}));
  const maxPerSource = Math.min(Math.max(Number(body?.maxPerSource ?? 100), 10), 500);
  const wipe = body?.wipe === true;  // 기본 false — 명시적 동의해야 wipe (fixture 보호)
  const departmentFilter = body?.department as Department | undefined;

  // 부서별 sources 결정 — body.sources 가 있으면 우선, 없으면 키 보유 + 부서 필터로 자동 결정
  let usedSources: string[] = Array.isArray(body?.sources) && body.sources.length > 0
    ? body.sources
    : [];
  if (usedSources.length === 0) {
    if (keys.publicDataServiceKey) {
      if (!departmentFilter || departmentFilter === "planning") usedSources.push("kstartup");
      if (!departmentFilter || departmentFilter === "edu") usedSources.push("g2b-edu");
      if (!departmentFilter || departmentFilter === "oda") usedSources.push("koica");
    }
    if (keys.bizinfoApiKey && (!departmentFilter || departmentFilter === "planning")) usedSources.push("bizinfo");
    if (keys.smes24Token && (!departmentFilter || departmentFilter === "planning")) usedSources.push("smes24");
  }

  if (usedSources.length === 0) {
    return c.json({
      ok: false,
      error: "API 키가 없습니다. 설정 페이지에서 PUBLIC_DATA_SERVICE_KEY 또는 BIZINFO_API_KEY 를 입력하세요.",
    }, 400);
  }

  try {
    const result = await searchGovernmentSupport(
      {
        sources: usedSources as any[],
        onlyRecruiting: true,
        maxPerSource,
      },
      keys,
    );

    if (result.announcements.length === 0) {
      return c.json({
        ok: false,
        error: "API 응답이 비어있습니다.",
        warnings: result.warnings,
        sourceStats: result.sourceStats,
      }, 502);
    }

    // NormalizedAnnouncement 의 필드: announcementId, title, source, agency, deadline, field, region, detailUrl, rawItem
    const programs: Program[] = result.announcements
      .filter(a => a.source && a.announcementId && a.title)
      .map((a) => {
        const prefix = `${a.source}:`;
        const programId = a.announcementId.startsWith(prefix)
          ? a.announcementId.slice(prefix.length)
          : a.announcementId;
        const raw = a.rawItem as Record<string, any>;
        // KOICA list 응답엔 날짜·지역·업종이 없는 대신 진행상태/계약방법/낙찰자선정/입찰한도/공고번호가 있어,
        // JSON 으로 묶어 summary 에 저장 → ProgramTableOda 가 파싱해서 전용 칸으로 렌더링.
        const summary: string | null = a.source === "koica"
          ? JSON.stringify({
              status: raw?.BID_PROGRS_STTUS_NM ?? null,
              cntrct: raw?.CNTRCT_MTH_NM ?? null,
              scsbid: raw?.SCSBID_MTH_NM ?? null,
              limit: raw?.BID_LMT_AMOUNT ?? null,
              bsnsSe: raw?.PRCURE_BSNS_SE_CD_NM ?? null,
              detailSe: raw?.PRCURE_DETAIL_SE_NM ?? null,
              pblancNo: raw?.PBLANC_NO ?? null,
              pblancOdr: raw?.PBLANC_ODR ?? null,
            })
          : (raw?.pblancNm || raw?.biz_pbanc_nm || raw?.bidNtceNm || raw?.bsnsNm || null);
        const rawText = [
          raw?.pblancCn,                                    // bizinfo 공고 내용
          raw?.pbanc_ctnt,                                  // kstartup 공고 내용
          raw?.bsns_sumry, raw?.aply_trgt_ctnt, raw?.bsns_inq_ctnt,
          raw?.bidNtceNm, raw?.bsnsNm, raw?.bsns_areaNm,    // G2B / KOICA
          a.title,
          a.agency,
          a.field,
          a.region,
        ].filter(Boolean).join("\n\n").slice(0, 5000) || a.title;

        return {
          id: a.announcementId,
          source: a.source,
          programId,
          title: a.title,
          agency: a.agency ?? null,
          region: a.region ?? null,
          industry: null,
          field: a.field ?? null,
          deadline: normalizeDate(a.deadline),
          url: a.detailUrl ?? null,
          summary,
          rawText,
          department: a.department ?? inferDepartmentFromSource(a.source),
        };
      });

    const skippedFromApi = result.announcements.length - programs.length;

    const db = getDb();
    if (wipe) {
      // FK 의존성 순서: events → posts → agent_runs → cases → programs
      db.exec(`
        DELETE FROM events;
        DELETE FROM posts;
        DELETE FROM agent_runs;
        DELETE FROM cases;
        DELETE FROM programs;
        DELETE FROM bid_awards;
        DELETE FROM koica_contracts;
      `);
    }
    const { inserted, skipped: skippedDb } = bulkUpsertPrograms(programs);
    const totalAfter = countPrograms();
    const allWarnings = [...(result.warnings ?? [])];
    const totalSkipped = skippedFromApi + skippedDb;
    if (totalSkipped > 0) {
      allWarnings.push(`필수 필드 누락 ${totalSkipped}건 건너뜀`);
    }

    // ── 낙찰정보 부가 수집 (A1: 자격평가 가격경쟁력 axis 컨텍스트) ──
    // PUBLIC_DATA_SERVICE_KEY 가 있을 때만, 부서별로 별도 호출.
    const awardsStats: Record<string, { fetched: number; inserted: number; error?: string }> = {};
    if (keys.publicDataServiceKey) {
      const scsbidCategories: Array<"edu" | "oda"> = [];
      // department 필터 없거나 해당 부서일 때만
      if (!departmentFilter || departmentFilter === "edu") scsbidCategories.push("edu");
      if (!departmentFilter || departmentFilter === "oda") scsbidCategories.push("oda");

      for (const cat of scsbidCategories) {
        try {
          const r = await fetchG2bScsbidList({
            serviceKey: keys.publicDataServiceKey,
            category: cat,
            pageNo: 1,
            numOfRows: 100,
          });
          if (!r.ok) {
            awardsStats[`g2b-scsbid-${cat}`] = { fetched: 0, inserted: 0, error: r.bodySnippet.slice(0, 120) };
            allWarnings.push(`낙찰정보(${cat}) HTTP ${r.httpStatus} — ${r.bodySnippet.slice(0, 120)}`);
          } else {
            const { inserted: ai } = bulkUpsertAwards(r.items, cat);
            awardsStats[`g2b-scsbid-${cat}`] = { fetched: r.items.length, inserted: ai };
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          awardsStats[`g2b-scsbid-${cat}`] = { fetched: 0, inserted: 0, error: msg };
          allWarnings.push(`낙찰정보(${cat}) 오류: ${msg}`);
        }
      }

      // KOICA 수의계약 (ODA 가격경쟁력 axis 입력) — oda 부서일 때만
      if (!departmentFilter || departmentFilter === "oda") {
        try {
          const r = await fetchKoicaVltrnCntrctList({
            serviceKey: keys.publicDataServiceKey,
            pageNo: 1,
            numOfRows: 100,
          });
          if (!r.ok) {
            awardsStats["koica-vltrn"] = { fetched: 0, inserted: 0, error: r.bodySnippet.slice(0, 120) };
            allWarnings.push(`KOICA 수의계약 HTTP ${r.httpStatus} — ${r.bodySnippet.slice(0, 120)}`);
          } else {
            const { inserted: ki } = bulkUpsertKoicaContracts(r.items);
            awardsStats["koica-vltrn"] = { fetched: r.items.length, inserted: ki };
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          awardsStats["koica-vltrn"] = { fetched: 0, inserted: 0, error: msg };
          allWarnings.push(`KOICA 수의계약 오류: ${msg}`);
        }
      }
    }
    const awardsTotalAfter = countAwards();
    const koicaContractsTotalAfter = countKoicaContracts();

    logImport({
      kind: "real",
      sources: usedSources,
      maxPerSource,
      wipe,
      countInserted: inserted,
      countTotalAfter: totalAfter,
      warnings: allWarnings,
    });

    return c.json({
      ok: true,
      count: inserted,
      countTotalAfter: totalAfter,
      sources: usedSources,
      maxPerSource,
      wipe,
      sourceStats: result.sourceStats,
      awardsStats,
      awardsTotalAfter,
      koicaContractsTotalAfter,
      warnings: allWarnings,
    });
  } catch (err) {
    return c.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

router.post("/seed-fixture", async (c) => {
  // 합성 fixture 로 다시 채우기 — settings 페이지의 "원래대로" 버튼
  const { readFileSync } = await import("node:fs");
  const { join, resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const fixturePath = join(resolve(__dirname, "..", "..", "..", ".."), "_docs", "fixtures", "programs.sample.json");
  const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as any[];
  const programs: Program[] = raw.map(r => ({
    id: `${r.source}:${r.programId}`,
    source: r.source,
    programId: r.programId,
    title: r.title,
    agency: r.agency ?? null,
    region: r.region ?? null,
    industry: r.industry ?? null,
    field: r.field ?? null,
    deadline: r.deadline ?? null,
    url: r.url ?? null,
    summary: r.summary ?? null,
    rawText: r.rawText ?? r.summary ?? r.title,
  }));

  const db = getDb();
  db.exec(`
    DELETE FROM events;
    DELETE FROM posts;
    DELETE FROM agent_runs;
    DELETE FROM cases;
    DELETE FROM programs;
  `);
  const { inserted } = bulkUpsertPrograms(programs);
  const totalAfter = countPrograms();

  logImport({
    kind: "fixture",
    sources: ["fixture"],
    wipe: true,
    countInserted: inserted,
    countTotalAfter: totalAfter,
  });

  return c.json({ ok: true, count: inserted, countTotalAfter: totalAfter });
});

router.get("/history", (c) => {
  const limit = Number(c.req.query("limit") ?? 20);
  return c.json({ history: listHistory(limit) });
});

export default router;
