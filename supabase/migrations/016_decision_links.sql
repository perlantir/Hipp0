-- Decision links table (cross-platform issue/PR tracking)
-- Safe to run after any prior migration — uses IF NOT EXISTS
CREATE TABLE IF NOT EXISTS decision_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  external_url TEXT,
  link_type TEXT NOT NULL DEFAULT 'implements',
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_links_decision ON decision_links(decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_links_project ON decision_links(project_id);
CREATE INDEX IF NOT EXISTS idx_decision_links_external ON decision_links(platform, external_id);
