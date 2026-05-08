import { getDb, transaction } from "../db/client.js";
import type { Program, SearchFilters } from "@gov/shared";

function rowToProgram(r: any): Program {
  return {
    id: r.id,
    source: r.source,
    programId: r.program_id,
    title: r.title,
    agency: r.agency,
    region: r.region,
    industry: r.industry,
    field: r.field,
    deadline: r.deadline,
    url: r.url,
    summary: r.summary,
    rawText: r.raw_text,
  };
}

export function upsertProgram(p: Program): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO programs (id, source, program_id, title, agency, region, industry, field, deadline, url, summary, raw_text, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, agency = excluded.agency, region = excluded.region,
      industry = excluded.industry, field = excluded.field, deadline = excluded.deadline,
      url = excluded.url, summary = excluded.summary, raw_text = excluded.raw_text,
      cached_at = datetime('now')
  `).run(p.id, p.source, p.programId, p.title, p.agency, p.region, p.industry,
         p.field, p.deadline, p.url, p.summary, p.rawText);
}

export function bulkUpsertPrograms(programs: Program[]): { inserted: number; skipped: number } {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO programs (id, source, program_id, title, agency, region, industry, field, deadline, url, summary, raw_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET cached_at = datetime('now')
  `);
  let inserted = 0;
  let skipped = 0;
  transaction(db, () => {
    for (const p of programs) {
      // 필수 필드 누락 시 skip
      if (!p.id || !p.source || !p.programId || !p.title) {
        skipped++;
        continue;
      }
      insert.run(
        p.id, p.source, p.programId, p.title,
        p.agency ?? null, p.region ?? null, p.industry ?? null, p.field ?? null,
        p.deadline ?? null, p.url ?? null, p.summary ?? null,
        p.rawText ?? p.summary ?? p.title,
      );
      inserted++;
    }
  });
  return { inserted, skipped };
}

export function getProgram(id: string): Program | null {
  const r = getDb().prepare(`SELECT * FROM programs WHERE id = ?`).get(id);
  return r ? rowToProgram(r) : null;
}

export function searchPrograms(f: SearchFilters): { total: number; programs: Program[] } {
  const db = getDb();
  const where: string[] = [];
  const params: any[] = [];
  if (f.keyword) {
    where.push(`(title LIKE ? OR summary LIKE ? OR raw_text LIKE ?)`);
    const kw = `%${f.keyword}%`;
    params.push(kw, kw, kw);
  }
  if (f.region) { where.push(`region LIKE ?`); params.push(`%${f.region}%`); }
  if (f.industry) { where.push(`industry LIKE ?`); params.push(`%${f.industry}%`); }
  if (f.field) { where.push(`field = ?`); params.push(f.field); }
  if (f.deadlineBefore) { where.push(`deadline <= ?`); params.push(f.deadlineBefore); }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) as c FROM programs ${whereSql}`).get(...params) as any).c;

  const offset = (f.page - 1) * f.pageSize;
  const rows = db.prepare(`
    SELECT * FROM programs ${whereSql}
    ORDER BY deadline ASC NULLS LAST, cached_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, f.pageSize, offset);

  return { total, programs: rows.map(rowToProgram) };
}

export function countPrograms(): number {
  return (getDb().prepare(`SELECT COUNT(*) as c FROM programs`).get() as any).c;
}

export function listAllPrograms(): Program[] {
  const rows = getDb().prepare(`SELECT * FROM programs ORDER BY deadline ASC`).all();
  return rows.map(rowToProgram);
}
