export const LEARNING_SCHEMA = `
CREATE TABLE IF NOT EXISTS finding_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  finding_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('accept', 'dismiss', 'ignore')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trajectories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id TEXT NOT NULL,
  expert_id TEXT NOT NULL,
  model TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  iterations INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  final_finding_count INTEGER NOT NULL DEFAULT 0,
  compressed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reflections (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('post_review', 'post_feedback')),
  observations_json TEXT NOT NULL DEFAULT '[]',
  pattern_suggestions_json TEXT NOT NULL DEFAULT '[]',
  calibration_updates_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_patterns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  prompt_fragment TEXT NOT NULL,
  trigger_conditions_json TEXT NOT NULL DEFAULT '[]',
  success_rate REAL NOT NULL DEFAULT 0.0,
  expert_source TEXT NOT NULL,
  examples_json TEXT NOT NULL DEFAULT '[]',
  times_applied INTEGER NOT NULL DEFAULT 0,
  times_accepted INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used TEXT
);

CREATE TABLE IF NOT EXISTS calibration_entries (
  expert_id TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  total_findings INTEGER NOT NULL DEFAULT 0,
  accepted INTEGER NOT NULL DEFAULT 0,
  dismissed INTEGER NOT NULL DEFAULT 0,
  ignored INTEGER NOT NULL DEFAULT 0,
  confidence_multiplier REAL NOT NULL DEFAULT 1.0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (expert_id, category, severity)
);

CREATE TABLE IF NOT EXISTS compressed_observations (
  id TEXT PRIMARY KEY,
  source_episode_ids_json TEXT NOT NULL DEFAULT '[]',
  observation TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_finding ON finding_feedback(finding_id);
CREATE INDEX IF NOT EXISTS idx_feedback_review ON finding_feedback(review_id);
CREATE INDEX IF NOT EXISTS idx_trajectories_review ON trajectories(review_id);
CREATE INDEX IF NOT EXISTS idx_trajectories_compressed ON trajectories(compressed);
CREATE INDEX IF NOT EXISTS idx_reflections_review ON reflections(review_id);
`;
