import { getDb } from "../db/client.js";
import { publish } from "../lib/sse.js";
import type { BoardEvent, EventKind } from "@gov/shared";

export interface AppendEventInput {
  caseId: string | null;
  runId?: string | null;
  agentId?: string | null;
  kind: EventKind;
  payload: unknown;
}

export function appendEvent(input: AppendEventInput): BoardEvent {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO events (case_id, run_id, agent_id, kind, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    input.caseId, input.runId ?? null, input.agentId ?? null,
    input.kind, JSON.stringify(input.payload),
  );
  const row = db.prepare(`SELECT * FROM events WHERE id = ?`).get(result.lastInsertRowid) as any;
  const event: BoardEvent = {
    id: row.id,
    caseId: row.case_id,
    runId: row.run_id,
    agentId: row.agent_id,
    kind: row.kind,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at,
  };
  publish(input.caseId, event);
  return event;
}

export function listEventsByCase(caseId: string, sinceId = 0): BoardEvent[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM events WHERE case_id = ? AND id > ? ORDER BY id ASC
  `).all(caseId, sinceId) as any[];
  return rows.map(r => ({
    id: r.id,
    caseId: r.case_id,
    runId: r.run_id,
    agentId: r.agent_id,
    kind: r.kind,
    payload: JSON.parse(r.payload_json),
    createdAt: r.created_at,
  }));
}
