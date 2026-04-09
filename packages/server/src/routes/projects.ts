import type { Hono } from 'hono';
import { getDb } from '@hipp0/core/db/index.js';
import { parseProject } from '@hipp0/core/db/parsers.js';
import { NotFoundError } from '@hipp0/core/types.js';
import { requireUUID, requireString, optionalString, mapDbError } from './validation.js';
import { generateApiKey } from '../bootstrap-keys.js';
import { isAuthRequired, getTenantId } from '../auth/middleware.js';
import { DEFAULT_TENANT_ID, DEFAULT_USER_ID } from '../constants.js';

export function registerProjectRoutes(app: Hono): void {
  app.post('/api/projects', async (c) => {
    const db = getDb();
    const body = await c.req.json<{
      name?: unknown;
      description?: unknown;
      metadata?: Record<string, unknown>;
    }>();

    const name = requireString(body.name, 'name', 500);
    const description = optionalString(body.description, 'description', 10000);

    const tenantId = isAuthRequired() ? getTenantId(c) : 'a0000000-0000-4000-8000-000000000001';

    try {
      const result = await db.query(
        `INSERT INTO projects (name, description, metadata, tenant_id)
         VALUES (?, ?, ?, ?)
         RETURNING *`,
        [name, description ?? null, JSON.stringify(body.metadata ?? {}), tenantId],
      );
      const project = parseProject(result.rows[0] as Record<string, unknown>);

      // Auto-generate a default API key for the new project
      let apiKey: string | undefined;
      try {
        const { key, prefix, hash } = generateApiKey();
        await db.query(
          `INSERT INTO api_keys (tenant_id, project_id, name, key_hash, key_prefix, permissions, rate_limit, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [DEFAULT_TENANT_ID, project.id, 'Default (auto-generated)', hash, prefix, 'admin', 1000, DEFAULT_USER_ID],
        );
        apiKey = key;

        const masked = key.slice(0, 16) + '...';
        console.warn(`[hipp0] API key generated for project "${name}": ${masked} (retrieve via GET /api/api-keys)`);
      } catch {
        // api_keys table may not exist yet — project still created successfully
      }

      return c.json({
        ...project,
        ...(apiKey ? { api_key: apiKey, api_key_warning: 'Save this key now. It cannot be retrieved again.' } : {}),
      }, 201);
    } catch (err) {
      mapDbError(err);
    }
  });


  app.get('/api/projects', async (c) => {
    const db = getDb();
    let result;
    if (isAuthRequired()) {
      const tenantId = getTenantId(c);
      result = await db.query('SELECT * FROM projects WHERE tenant_id = ? ORDER BY created_at DESC', [tenantId]);
    } else {
      result = await db.query('SELECT * FROM projects ORDER BY created_at DESC', []);
    }
    return c.json(result.rows.map((r: Record<string, unknown>) => parseProject(r)));
  });

  app.get('/api/projects/:id', async (c) => {
    const db = getDb();
    const id = requireUUID(c.req.param('id'), 'id');
    const tenantId = isAuthRequired() ? getTenantId(c) : '';
    let result;
    if (tenantId) {
      result = await db.query('SELECT * FROM projects WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    } else {
      result = await db.query('SELECT * FROM projects WHERE id = ?', [id]);
    }
    if (result.rows.length === 0) throw new NotFoundError('Project', id);
    return c.json(parseProject(result.rows[0] as Record<string, unknown>));
  });
}
