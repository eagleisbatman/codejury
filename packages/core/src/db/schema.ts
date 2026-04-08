export const SCHEMA = `
CREATE TABLE IF NOT EXISTS review_sessions (
  review_id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  branch TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  verdict TEXT,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  report_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES review_sessions(review_id),
  file_path TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  suggested_fix TEXT,
  agreement_score REAL NOT NULL DEFAULT 0,
  consensus_status TEXT NOT NULL DEFAULT 'split',
  contributing_experts TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expert_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id TEXT NOT NULL REFERENCES review_sessions(review_id),
  expert_id TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  raw_findings INTEGER NOT NULL DEFAULT 0,
  valid_findings INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON review_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_findings_review_id ON findings(review_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
CREATE INDEX IF NOT EXISTS idx_findings_file_path ON findings(file_path);
CREATE INDEX IF NOT EXISTS idx_expert_runs_review_id ON expert_runs(review_id);
`;
