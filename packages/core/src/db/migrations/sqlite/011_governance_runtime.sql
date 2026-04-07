-- Feature 5B: Governance Runtime — decision_policies + policy_violations (SQLite)

CREATE TABLE IF NOT EXISTS decision_policies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  enforcement_level TEXT NOT NULL DEFAULT 'warn' CHECK (enforcement_level IN ('block', 'warn', 'advisory')),
  scope TEXT DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS policy_violations (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES decision_policies(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id TEXT,
  agent_name TEXT,
  outcome_id TEXT,
  compile_history_id TEXT,
  violation_type TEXT NOT NULL DEFAULT 'keyword' CHECK (violation_type IN ('keyword', 'llm_confirmed', 'manual')),
  severity TEXT NOT NULL DEFAULT 'warn' CHECK (severity IN ('block', 'warn', 'advisory')),
  evidence_snippet TEXT,
  explanation TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_decision_policies_project_id ON decision_policies (project_id);
CREATE INDEX IF NOT EXISTS idx_policy_violations_project_id ON policy_violations (project_id);
CREATE INDEX IF NOT EXISTS idx_policy_violations_policy_id ON policy_violations (policy_id);
