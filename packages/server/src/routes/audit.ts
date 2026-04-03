import type { Hono } from 'hono';
import { query } from '@nexus/core/db/pool.js';
import { parseAuditEntry } from '@nexus/core/db/parsers.js';
import { requireUUID } from './validation.js';

export function registerAuditRoutes(app: Hono): void {
  app.get('/api/projects/:id/audit', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    const eventType = c.req.query('event_type');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 500);

    const conditions = ['project_id = $1'];
    const params: unknown[] = [projectId];
    let idx = 2;

    if (eventType) {
      conditions.push(`event_type = $${idx++}`);
      params.push(eventType);
    }

    params.push(limit);

    const result = await query(
      `SELECT * FROM audit_log
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      params,
    );

    return c.json(result.rows.map((r) => parseAuditEntry(r as Record<string, unknown>)));
  });
}
