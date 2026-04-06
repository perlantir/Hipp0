import type { Hono } from 'hono';
import { getDb } from '@decigraph/core/db/index.js';
import { parseProject } from '@decigraph/core/db/parsers.js';
import { NotFoundError } from '@decigraph/core/types.js';
import { requireUUID, requireString, optionalString, mapDbError } from './validation.js';
import { generateApiKey } from '../bootstrap-keys.js';

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

      // Auto-generate a default API key for the new project
      let apiKey: string | undefined;
      try {
        const { key, prefix, hash } = generateApiKey();
        const DEFAULT_TENANT_ID = 'a0000000-0000-4000-8000-000000000001';
        const DEFAULT_USER_ID = 'a0000000-0000-4000-8000-000000000001';
        await db.query(
          `INSERT INTO api_keys (tenant_id, project_id, name, key_hash, key_prefix, permissions, rate_limit, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [DEFAULT_TENANT_ID, project.id, 'Default (auto-generated)', hash, prefix, 'admin', 1000, DEFAULT_USER_ID],
        );
        apiKey = key;

        console.log('============================================================');
        console.log(`\ud83d\udd11 API Key generated for project "${name}"`);
        console.log(`   Key: ${key}`);
        console.log('');
        console.log('   Save this key now \u2014 it will NOT be shown again.');
        console.log('   Use it in the dashboard login and API requests.');
        console.log('============================================================');
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
