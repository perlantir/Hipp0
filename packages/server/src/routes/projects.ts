import type { Hono } from 'hono';
import { query } from '@nexus/core/db/pool.js';
import { parseProject } from '@nexus/core/db/parsers.js';
import { NotFoundError } from '@nexus/core/types.js';
import { requireUUID, requireString, optionalString, mapDbError } from './validation.js';

export function registerProjectRoutes(app: Hono): void {
  app.post('/api/projects', async (c) => {
    const body = await c.req.json<{
      name?: unknown;
      description?: unknown;
      metadata?: Record<string, unknown>;
    }>();

    const name = requireString(body.name, 'name', 500);
    const description = optionalString(body.description, 'description', 10000);

    try {
      const result = await query(
        `INSERT INTO projects (name, description, metadata)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [name, description ?? null, JSON.stringify(body.metadata ?? {})],
      );
      return c.json(parseProject(result.rows[0] as Record<string, unknown>), 201);
    } catch (err) {
      mapDbError(err);
    }
  });

  app.get('/api/projects/:id', async (c) => {
    const id = requireUUID(c.req.param('id'), 'id');
    const result = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (result.rows.length === 0) throw new NotFoundError('Project', id);
    return c.json(parseProject(result.rows[0] as Record<string, unknown>));
  });
}
