import type { Hono } from 'hono';
import { query } from '@nexus/core/db/pool.js';
import { parseAgent } from '@nexus/core/db/parsers.js';
import { NotFoundError } from '@nexus/core/types.js';
import { getRoleProfile } from '@nexus/core/roles.js';
import { requireUUID, requireString, mapDbError } from './validation.js';

export function registerAgentRoutes(app: Hono): void {
  app.post('/api/projects/:id/agents', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    const body = await c.req.json<{
      name?: unknown;
      role?: unknown;
      relevance_profile?: Record<string, unknown>;
      context_budget_tokens?: number;
    }>();

    const name = requireString(body.name, 'name', 200);
    const role = requireString(body.role, 'role', 100);

    const proj = await query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (proj.rows.length === 0) throw new NotFoundError('Project', projectId);

    const profile = body.relevance_profile ?? getRoleProfile(role);

    try {
      const result = await query(
        `INSERT INTO agents (project_id, name, role, relevance_profile, context_budget_tokens)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [projectId, name, role, JSON.stringify(profile), body.context_budget_tokens ?? 50000],
      );
      return c.json(parseAgent(result.rows[0] as Record<string, unknown>), 201);
    } catch (err) {
      mapDbError(err);
    }
  });

  app.get('/api/projects/:id/agents', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    const result = await query(
      'SELECT * FROM agents WHERE project_id = $1 ORDER BY created_at ASC',
      [projectId],
    );
    return c.json(result.rows.map((r) => parseAgent(r as Record<string, unknown>)));
  });
}
