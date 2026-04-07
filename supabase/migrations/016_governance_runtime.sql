-- Feature 5B: Governance Runtime — decision_policies + policy_violations
-- Safe to run before or after Feature 5 (uses IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS decision_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  enforcement_level TEXT NOT NULL DEFAULT 'warn' CHECK (enforcement_level IN ('block', 'warn', 'advisory')),
  scope JSONB DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES decision_policies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id TEXT,
  agent_name TEXT,
  outcome_id UUID,
  compile_history_id UUID,
  violation_type TEXT NOT NULL DEFAULT 'keyword' CHECK (violation_type IN ('keyword', 'llm_confirmed', 'manual')),
  severity TEXT NOT NULL DEFAULT 'warn' CHECK (severity IN ('block', 'warn', 'advisory')),
  evidence_snippet TEXT,
  explanation TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_policies_project_id ON decision_policies (project_id);
CREATE INDEX IF NOT EXISTS idx_decision_policies_active ON decision_policies (project_id, active);
CREATE INDEX IF NOT EXISTS idx_policy_violations_project_id ON policy_violations (project_id);
CREATE INDEX IF NOT EXISTS idx_policy_violations_policy_id ON policy_violations (policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_violations_created_at ON policy_violations (created_at);
