import { ulid } from "../lib/ulid.js";
import { getDb } from "../db/client.js";
import type { AgentId } from "@gov/shared";

export interface AgentRunRow {
  id: string;
  caseId: string;
  agentId: AgentId;
  status: "queued" | "running" | "completed" | "failed";
  model: string;
  tokensIn: number;
  tokensOut: number;
  costKrw: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorText: string | null;
}

function rowToRun(r: any): AgentRunRow {
  return {
    id: r.id, caseId: r.case_id, agentId: r.agent_id, status: r.status,
    model: r.model, tokensIn: r.tokens_in, tokensOut: r.tokens_out,
    costKrw: r.cost_krw, startedAt: r.started_at, finishedAt: r.finished_at,
    errorText: r.error_text,
  };
}

export function createRun(caseId: string, agentId: AgentId, model: string): AgentRunRow {
  const db = getDb();
  const id = ulid();
  // upsert (재실행 시 이전 행 덮어쓰기)
  db.prepare(`
    INSERT INTO agent_runs (id, case_id, agent_id, status, model, started_at)
    VALUES (?, ?, ?, 'running', ?, datetime('now'))
    ON CONFLICT(case_id, agent_id) DO UPDATE SET
      id = excluded.id,
      status = 'running',
      model = excluded.model,
      started_at = datetime('now'),
      finished_at = NULL,
      error_text = NULL,
      tokens_in = 0,
      tokens_out = 0,
      cost_krw = 0
  `).run(id, caseId, agentId, model);
  const row = db.prepare(`SELECT * FROM agent_runs WHERE case_id = ? AND agent_id = ?`).get(caseId, agentId);
  return rowToRun(row);
}

export function completeRun(runId: string, tokensIn: number, tokensOut: number, costKrw: number): void {
  getDb().prepare(`
    UPDATE agent_runs
       SET status = 'completed', finished_at = datetime('now'),
           tokens_in = ?, tokens_out = ?, cost_krw = ?
     WHERE id = ?
  `).run(tokensIn, tokensOut, costKrw, runId);
}

export function failRun(runId: string, error: string): void {
  getDb().prepare(`
    UPDATE agent_runs
       SET status = 'failed', finished_at = datetime('now'), error_text = ?
     WHERE id = ?
  `).run(error, runId);
}

export function getRunsByCase(caseId: string): AgentRunRow[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM agent_runs WHERE case_id = ? ORDER BY started_at`).all(caseId);
  return rows.map(rowToRun);
}

// ── bulk run ────────────────────────────────────────────────────────
export function createBulkRun(caseIds: string[], totalAgents: number): string {
  const id = ulid();
  getDb().prepare(`
    INSERT INTO bulk_runs (id, case_ids_json, total_agents)
    VALUES (?, ?, ?)
  `).run(id, JSON.stringify(caseIds), totalAgents);
  return id;
}

export function incrementBulkCompleted(bulkId: string): void {
  const db = getDb();
  db.prepare(`UPDATE bulk_runs SET completed = completed + 1 WHERE id = ?`).run(bulkId);
  db.prepare(`
    UPDATE bulk_runs SET finished_at = datetime('now')
     WHERE id = ? AND completed >= total_agents
  `).run(bulkId);
}

export function getBulkRun(bulkId: string): {
  id: string; caseIds: string[]; totalAgents: number;
  completed: number; startedAt: string; finishedAt: string | null;
} | null {
  const r = getDb().prepare(`SELECT * FROM bulk_runs WHERE id = ?`).get(bulkId) as any;
  if (!r) return null;
  return {
    id: r.id,
    caseIds: JSON.parse(r.case_ids_json),
    totalAgents: r.total_agents,
    completed: r.completed,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  };
}
