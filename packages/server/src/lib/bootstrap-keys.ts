/**
 * Bootstrap API keys for existing projects that have zero keys.
 * Called once on server startup.
 */
import { getDb } from '@decigraph/core/db/index.js';
import { generateApiKey } from './api-key-utils.js';

export async function bootstrapApiKeys(): Promise<void> {
  const db = getDb();

  try {
    // Find projects with zero active (non-revoked) API keys
    const result = await db.query(
      `SELECT p.id, p.name FROM projects p
       WHERE NOT EXISTS (
         SELECT 1 FROM api_keys ak
         WHERE ak.project_id = p.id AND ak.revoked_at IS NULL
       )`,
      [],
    );

    for (const row of result.rows) {
      const project = row as Record<string, unknown>;
      const { key, hash, prefix } = generateApiKey();

      try {
        await db.query(
          `INSERT INTO api_keys (project_id, key_hash, key_prefix, name, tenant_id, permissions, rate_limit, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [project.id, hash, prefix, 'Default', 'a0000000-0000-4000-8000-000000000001', 'admin', 100, 'system'],
        );

        console.warn(`[decigraph] Generated API key for project "${project.name}": ${key}`);
        console.warn(`[decigraph] Save this key — it will not be shown again.`);
      } catch (err) {
        console.warn(`[decigraph] Failed to bootstrap key for project "${project.name}":`, (err as Error).message);
      }
    }

    if (result.rows.length === 0) {
      console.warn('[decigraph] All projects have API keys — no bootstrap needed');
    }
  } catch (err) {
    // api_keys table may not exist yet on first run
    console.warn('[decigraph] API key bootstrap skipped:', (err as Error).message);
  }
}
