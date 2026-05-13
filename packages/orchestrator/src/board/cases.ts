import { ulid } from "../lib/ulid.js";
import { getDb } from "../db/client.js";
import type { Case, Department } from "@gov/shared";

export type { Case };

function rowToCase(r: any): Case {
  return {
    id: r.id,
    companyProfileId: r.company_profile_id,
    programId: r.program_id,
    bulkRunId: r.bulk_run_id,
    status: r.status,
    createdAt: r.created_at,
    department: r.department ?? undefined,
  };
}

export function createOrGetCase(
  companyProfileId: string,
  programId: string,
  bulkRunId: string | null = null,
  department: Department = "planning",
): Case {
  const db = getDb();
  const existing = db.prepare(`
    SELECT * FROM cases WHERE company_profile_id = ? AND program_id = ?
  `).get(companyProfileId, programId);
  if (existing) {
    if (bulkRunId) {
      db.prepare(`UPDATE cases SET bulk_run_id = ? WHERE id = ?`).run(bulkRunId, (existing as any).id);
      const refreshed = db.prepare(`SELECT * FROM cases WHERE id = ?`).get((existing as any).id);
      return rowToCase(refreshed);
    }
    return rowToCase(existing);
  }
  const id = ulid();
  db.prepare(`
    INSERT INTO cases (id, company_profile_id, program_id, bulk_run_id, status, department)
    VALUES (?, ?, ?, ?, 'open', ?)
  `).run(id, companyProfileId, programId, bulkRunId, department);
  const row = db.prepare(`SELECT * FROM cases WHERE id = ?`).get(id);
  return rowToCase(row);
}

export function getCase(id: string): Case | null {
  const r = getDb().prepare(`SELECT * FROM cases WHERE id = ?`).get(id);
  return r ? rowToCase(r) : null;
}

export function listCases(department?: Department): Case[] {
  const db = getDb();
  const rows = department
    ? db.prepare(`SELECT * FROM cases WHERE department = ? ORDER BY created_at DESC LIMIT 200`).all(department)
    : db.prepare(`SELECT * FROM cases ORDER BY created_at DESC LIMIT 200`).all();
  return rows.map(rowToCase);
}

export function updateCaseStatus(id: string, status: "open" | "complete" | "partial"): void {
  getDb().prepare(`UPDATE cases SET status = ? WHERE id = ?`).run(status, id);
}
