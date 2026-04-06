/**
 * Per-project API Key Routes
 *
 * POST   /api/projects/:id/keys            — Create key (returns full key ONCE)
 * GET    /api/projects/:id/keys            — List keys (prefix only)
 * DELETE /api/projects/:id/keys/:keyId     — Revoke key (soft-delete)
 * POST   /api/projects/:id/keys/:keyId/rotate — Rotate key
 */
import type { Hono } from 'hono';
import { getDb } from '@decigraph/core/db/index.js';
import { requireUUID } from './validation.js';
import { generateApiKey } from '../lib/api-key-utils.js';

export function registerProjectKeyRoutes(app: Hono): void {
  // POST /api/projects/:id/keys — create API key
  app.post('/api/projects/:id/keys', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'id');
    const db = getDb();

    // Verify project exists
    const project = await db.query('SELECT id FROM projects WHERE id = ?', [projectId]);
    if (project.rows.length === 0) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const body = await c.req.json<{ name?: string; expires_in_days?: number }>().catch(() => ({} as { name?: string; expires_in_days?: number }));
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Default';
    const expiresInDays = typeof body.expires_in_days === 'number' ? body.expires_in_days : null;

    const { key, hash, prefix } = generateApiKey();
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60_000).toISOString()
      : null;

    const result = await db.query(
      `INSERT INTO api_keys (project_id, key_hash, key_prefix, name, expires_at, tenant_id, permissions, rate_limit, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, name, key_prefix, created_at, expires_at`,
      [projectId, hash, prefix, name, expiresAt,
       'a0000000-0000-4000-8000-000000000001', 'admin', 100, 'system'],
    );

    const created = result.rows[0] as Record<string, unknown>;

    return c.json({
      id: created.id,
      key,
      prefix: created.key_prefix,
      name: created.name,
      created_at: created.created_at,
      expires_at: created.expires_at,
      warning: 'Save this key now. It cannot be retrieved again.',
    }, 201);
  });

  // GET /api/projects/:id/keys — list keys (prefix only, never full key)
  app.get('/api/projects/:id/keys', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'id');
    const db = getDb();

    const result = await db.query(
      `SELECT id, name, key_prefix, created_at, last_used_at, expires_at, revoked_at
       FROM api_keys
       WHERE project_id = ?
       ORDER BY created_at DESC`,
      [projectId],
    );

    const keys = result.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      key_prefix: r.key_prefix,
      created_at: r.created_at,
      last_used_at: r.last_used_at,
      expires_at: r.expires_at,
      revoked: r.revoked_at != null,
    }));

    return c.json(keys);
  });

  // DELETE /api/projects/:id/keys/:keyId — revoke key (soft-delete)
  app.delete('/api/projects/:id/keys/:keyId', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'id');
    const keyId = requireUUID(c.req.param('keyId'), 'keyId');
    const db = getDb();

    const result = await db.query(
      `UPDATE api_keys SET revoked_at = NOW()
       WHERE id = ? AND project_id = ? AND revoked_at IS NULL
       RETURNING id`,
      [keyId, projectId],
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'API key not found or already revoked' }, 404);
    }

    return c.json({ revoked: true });
  });

  // POST /api/projects/:id/keys/:keyId/rotate — revoke old + create new
  app.post('/api/projects/:id/keys/:keyId/rotate', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'id');
    const keyId = requireUUID(c.req.param('keyId'), 'keyId');
    const db = getDb();

    // Get existing key info
    const existing = await db.query(
      'SELECT id, name, expires_at FROM api_keys WHERE id = ? AND project_id = ? AND revoked_at IS NULL',
      [keyId, projectId],
    );

    if (existing.rows.length === 0) {
      return c.json({ error: 'API key not found or already revoked' }, 404);
    }

    const old = existing.rows[0] as Record<string, unknown>;
    const { key, hash, prefix } = generateApiKey();

    // Revoke old key
    await db.query(
      'UPDATE api_keys SET revoked_at = NOW() WHERE id = ?',
      [keyId],
    );

    // Create new key with same name
    const result = await db.query(
      `INSERT INTO api_keys (project_id, key_hash, key_prefix, name, expires_at, tenant_id, permissions, rate_limit, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, name, key_prefix, created_at, expires_at`,
      [projectId, hash, prefix, old.name, old.expires_at,
       'a0000000-0000-4000-8000-000000000001', 'admin', 100, 'system'],
    );

    const created = result.rows[0] as Record<string, unknown>;

    return c.json({
      id: created.id,
      key,
      prefix: created.key_prefix,
      name: created.name,
      created_at: created.created_at,
      expires_at: created.expires_at,
      warning: 'Save this key now. The old key has been invalidated.',
    });
  });
}
