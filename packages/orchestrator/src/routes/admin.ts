// 관리자 라우트 — 실데이터 시드 (대시보드 버튼에서 호출)

import { Hono } from "hono";
import { searchGovernmentSupport } from "@gov/mcp-tools";
import { getDb } from "../db/client.js";
import { bulkUpsertPrograms, countPrograms } from "../board/programs.js";
import { getApiKeys } from "../board/settings.js";
import type { Program } from "@gov/shared";

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
  const usedSources: string[] = [];
  if (keys.publicDataServiceKey) usedSources.push("kstartup");
  if (keys.bizinfoApiKey) usedSources.push("bizinfo");
  if (keys.smes24Token) usedSources.push("smes24");

  if (usedSources.length === 0) {
    return c.json({
      ok: false,
      error: "API 키가 없습니다. 설정 페이지에서 PUBLIC_DATA_SERVICE_KEY 또는 BIZINFO_API_KEY 를 입력하세요.",
    }, 400);
  }

  // 사용자가 [받을 건수] 입력 가능. 기본 100, 최대 500 (소스당)
  const body = await c.req.json().catch(() => ({}));
  const maxPerSource = Math.min(Math.max(Number(body?.maxPerSource ?? 100), 10), 500);
  const wipe = body?.wipe !== false;  // 기본 true (기존 데이터 삭제 후 적재)

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
        // 본문 추출 (소스별 필드명 다름)
        const summary = raw?.pblancNm || raw?.biz_pbanc_nm || null;
        const rawText = [
          raw?.pblancCn,                                    // bizinfo 공고 내용
          raw?.pbanc_ctnt,                                  // kstartup 공고 내용
          raw?.bsns_sumry, raw?.aply_trgt_ctnt, raw?.bsns_inq_ctnt,
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
          deadline: a.deadline ?? null,
          url: a.detailUrl ?? null,
          summary,
          rawText,
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
      `);
    }
    const { inserted, skipped: skippedDb } = bulkUpsertPrograms(programs);
    const totalAfter = countPrograms();
    const allWarnings = [...(result.warnings ?? [])];
    const totalSkipped = skippedFromApi + skippedDb;
    if (totalSkipped > 0) {
      allWarnings.push(`필수 필드 누락 ${totalSkipped}건 건너뜀`);
    }

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
