import { ulid } from "../lib/ulid.js";
import { getDb } from "../db/client.js";
import { publish } from "../lib/sse.js";
import type { AgentId } from "@gov/shared";

export interface CreatePostInput {
  caseId: string;
  runId: string;
  agentId: AgentId;
  title: string;
  bodyMd: string;
  payload: unknown;
}

export interface PostRow {
  id: string;
  caseId: string;
  runId: string;
  agentId: AgentId;
  title: string;
  bodyMd: string;
  payload: unknown;
  createdAt: string;
}

function rowToPost(r: any): PostRow {
  return {
    id: r.id,
    caseId: r.case_id,
    runId: r.run_id,
    agentId: r.agent_id,
    title: r.title,
    bodyMd: r.body_md,
    payload: JSON.parse(r.payload_json),
    createdAt: r.created_at,
  };
}

export function createPost(input: CreatePostInput): PostRow {
  const db = getDb();
  const id = ulid();
  db.prepare(`
    INSERT INTO posts (id, case_id, run_id, agent_id, title, body_md, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.caseId, input.runId, input.agentId,
    input.title, input.bodyMd, JSON.stringify(input.payload),
  );
  const row = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id);
  const post = rowToPost(row);
  publish(input.caseId, {
    id: 0, caseId: input.caseId, runId: input.runId, agentId: input.agentId,
    kind: "artifact", payload: post, createdAt: post.createdAt,
  });
  return post;
}

export function listPostsByCase(caseId: string): PostRow[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM posts WHERE case_id = ? ORDER BY created_at DESC
  `).all(caseId);
  return rows.map(rowToPost);
}

export function listPosts(filter: { agentId?: AgentId; limit?: number } = {}): PostRow[] {
  const db = getDb();
  const limit = filter.limit ?? 100;
  const rows = filter.agentId
    ? db.prepare(`SELECT * FROM posts WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`).all(filter.agentId, limit)
    : db.prepare(`SELECT * FROM posts ORDER BY created_at DESC LIMIT ?`).all(limit);
  return rows.map(rowToPost);
}

export function getPost(id: string): PostRow | null {
  const db = getDb();
  const r = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id);
  return r ? rowToPost(r) : null;
}
