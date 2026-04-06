import type { Hono } from 'hono';
import { getDb } from '@decigraph/core/db/index.js';
import { parseProject } from '@decigraph/core/db/parsers.js';
import { NotFoundError } from '@decigraph/core/types.js';
import { requireUUID, requireString, optionalString, mapDbError } from './validation.js';
import { generateApiKey } from '../lib/api-key-utils.js';

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

    try {
      const result = await db.query(
        `INSERT INTO projects (name, description, metadata)
         VALUES (?, ?, ?)
         RETURNING *`,
        [name, description ?? null, JSON.stringify(body.metadata ?? {})],
      );
      const project = parseProject(result.rows[0] as Record<string, unknown>);

      // Auto-create a default API key for the new project
      let apiKey: string | undefined;
      try {
        const { key, hash, prefix } = generateApiKey();
        await db.query(
          `INSERT INTO api_keys (project_id, key_hash, key_prefix, name, tenant_id, permissions, rate_limit, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [project.id, hash, prefix, 'Default', 'a0000000-0000-4000-8000-000000000001', 'admin', 100, 'system'],
        );
        apiKey = key;
      } catch (keyErr) {
        console.warn('[decigraph] Failed to auto-create API key for project:', (keyErr as Error).message);
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
    const result = await db.query('SELECT * FROM projects ORDER BY created_at DESC', []);
    return c.json(result.rows.map((r: Record<string, unknown>) => parseProject(r)));
  });

  app.get('/api/projects/:id', async (c) => {
    const db = getDb();
    const id = requireUUID(c.req.param('id'), 'id');
    const result = await db.query('SELECT * FROM projects WHERE id = ?', [id]);
    if (result.rows.length === 0) throw new NotFoundError('Project', id);
    return c.json(parseProject(result.rows[0] as Record<string, unknown>));
  });
}
