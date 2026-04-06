-- Decision links table (cross-platform issue/PR tracking)
-- Safe to run after any prior migration — uses IF NOT EXISTS
CREATE TABLE IF NOT EXISTS decision_links (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,          -- 'github', 'linear', 'jira', etc.
  external_id TEXT NOT NULL,       -- e.g. 'ENG-123', 'PR #45'
  external_url TEXT,
  link_type TEXT NOT NULL DEFAULT 'implements',  -- 'implements', 'tracks', 'blocks'
  status TEXT NOT NULL DEFAULT 'open',           -- 'open', 'completed', 'cancelled'
  title TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_decision_links_decision ON decision_links(decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_links_project ON decision_links(project_id);
CREATE INDEX IF NOT EXISTS idx_decision_links_external ON decision_links(platform, external_id);
