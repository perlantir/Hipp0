/**
 * Bootstrap API Keys — on every startup, generate a default key for any
 * project that has zero active (non-revoked, non-expired) API keys.
 * The full key is logged once to stdout; only the SHA-256 hash is persisted.
 */
import { getDb } from '@hipp0/core/db/index.js';
import crypto from 'node:crypto';

import { DEFAULT_TENANT_ID, DEFAULT_USER_ID } from './constants.js';

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const randomPart = crypto.randomBytes(32).toString('hex');
  const prefix = 'h0_live_';
  const key = `${prefix}${randomPart}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return { key, prefix, hash };
}

export async function bootstrapApiKeys(): Promise<void> {
  const db = getDb();

  // Check if api_keys table exists
  try {
    await db.query('SELECT 1 FROM api_keys LIMIT 0', []);
  } catch {
    console.warn('[hipp0] api_keys table does not exist yet — skipping key bootstrap');
    return;
  }

  // Get all projects
  let projects: Array<Record<string, unknown>>;
  try {
    const result = await db.query('SELECT id, name FROM projects', []);
    projects = result.rows as Array<Record<string, unknown>>;
  } catch {
    console.warn('[hipp0] projects table does not exist yet — skipping key bootstrap');
    return;
  }

  if (projects.length === 0) {
    return;
  }

  for (const project of projects) {
    const projectId = project.id as string;
    const projectName = project.name as string;

    // Check for existing active keys for this project
    const existing = await db.query(
      `SELECT id FROM api_keys
       WHERE project_id = ?
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [projectId],
    );

    if (existing.rows.length > 0) {
      continue; // already has active keys
    }

    // Generate a new key
    const { key, prefix, hash } = generateApiKey();

    await db.query(
      `INSERT INTO api_keys (tenant_id, project_id, name, key_hash, key_prefix, permissions, rate_limit, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [DEFAULT_TENANT_ID, projectId, 'Default (auto-generated)', hash, prefix, 'admin', 1000, DEFAULT_USER_ID],
    );

    const masked = key.slice(0, 16) + '...';
    console.warn('============================================================');
    console.warn(`\ud83d\udd11 API Key generated for project "${projectName}"`);
    console.warn(`   Key: ${masked} (retrieve via GET /api/api-keys)`);
    console.warn('');
    console.warn('   Full key is NOT logged for security.');
    console.warn('============================================================');
  }
}
