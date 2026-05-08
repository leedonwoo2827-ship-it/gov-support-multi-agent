// Node 24 내장 node:sqlite 사용 — 별도 네이티브 빌드 불필요

import { DatabaseSync, type StatementSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type DB = DatabaseSync;

let _db: DB | null = null;

export function getDb(path = process.env.DB_PATH ?? "./data/gov.db"): DB {
  if (_db) return _db;
  // path 가 ":memory:" 가 아니면 디렉토리 보장
  if (path !== ":memory:") {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  const ddl = readFileSync(join(__dirname, "schema.sql"), "utf8");
  db.exec(ddl);
  _db = db;
  return db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}

/**
 * 트랜잭션 헬퍼 (node:sqlite 는 db.transaction 미제공).
 */
export function transaction<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export type { StatementSync };
