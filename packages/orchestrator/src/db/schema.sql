-- 정부지원사업 멀티에이전트 게시판 — SQLite 스키마

CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,                    -- {source}:{program_id}
  source TEXT NOT NULL,
  program_id TEXT NOT NULL,
  title TEXT NOT NULL,
  agency TEXT,
  region TEXT,
  industry TEXT,
  field TEXT,
  deadline TEXT,
  url TEXT,
  summary TEXT,
  raw_text TEXT NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_programs_deadline ON programs(deadline);
CREATE INDEX IF NOT EXISTS idx_programs_source ON programs(source);
CREATE INDEX IF NOT EXISTS idx_programs_field ON programs(field);

CREATE TABLE IF NOT EXISTS search_queries (
  id TEXT PRIMARY KEY,
  query_key TEXT UNIQUE NOT NULL,
  filters_json TEXT NOT NULL,
  program_ids_json TEXT NOT NULL,
  total INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS company_profiles (
  id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  company_profile_id TEXT NOT NULL REFERENCES company_profiles(id),
  program_id TEXT NOT NULL REFERENCES programs(id),
  bulk_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(company_profile_id, program_id)
);
CREATE INDEX IF NOT EXISTS idx_cases_bulk ON cases(bulk_run_id);
CREATE INDEX IF NOT EXISTS idx_cases_program ON cases(program_id);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_krw REAL DEFAULT 0,
  started_at TEXT,
  finished_at TEXT,
  error_text TEXT,
  UNIQUE(case_id, agent_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES agent_runs(id),
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_case ON posts(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_agent ON posts(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT,
  run_id TEXT,
  agent_id TEXT,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_case ON events(case_id, id);

CREATE TABLE IF NOT EXISTS bulk_runs (
  id TEXT PRIMARY KEY,
  case_ids_json TEXT NOT NULL,
  total_agents INTEGER NOT NULL,
  completed INTEGER DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
