-- Migration 016: Per-project API key management
-- Adds project_id linkage, revoked_at for soft-delete, and missing columns
-- to the existing api_keys table from Phase 3 (012_phase3_multitenancy.sql).

-- Add revoked_at column for soft-delete (audit trail) instead of hard delete
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Ensure project_id column exists (it should from Phase 3 but may be nullable)
-- If it already exists this is a no-op via IF NOT EXISTS
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Index for per-project key lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);

-- Index for hash-based lookups (may already exist)
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- Index for non-revoked key lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(key_hash) WHERE revoked_at IS NULL;
