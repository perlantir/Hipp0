import type { Hono } from 'hono';
import { query } from '@nexus/core/db/pool.js';
import { parseContradiction } from '@nexus/core/db/parsers.js';
import { NotFoundError, ValidationError } from '@nexus/core/types.js';
import { requireUUID, optionalString } from './validation.js';

export function registerContradictionRoutes(app: Hono): void {
  app.get('/api/projects/:id/contradictions', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    const status = c.req.query('status') ?? 'unresolved';
    const result = await query(
      'SELECT * FROM contradictions WHERE project_id = $1 AND status = $2 ORDER BY detected_at DESC',
      [projectId, status],
    );
    return c.json(result.rows.map((r) => parseContradiction(r as Record<string, unknown>)));
  });

  app.patch('/api/contradictions/:id', async (c) => {
    const id = requireUUID(c.req.param('id'), 'id');
    const body = await c.req.json<{
      status?: unknown;
      resolved_by?: unknown;
      resolution?: unknown;
    }>();

    const statusVal = body.status !== undefined ? optionalString(body.status, 'status', 50) : null;
    const resolvedByVal =
      body.resolved_by !== undefined ? optionalString(body.resolved_by, 'resolved_by', 200) : null;
    const resolutionVal =
      body.resolution !== undefined ? optionalString(body.resolution, 'resolution', 10000) : null;

    if (!statusVal && !resolvedByVal && !resolutionVal)
      throw new ValidationError('No fields to update');

    const result = await query(
      `UPDATE contradictions SET
        status = COALESCE($1, status),
        resolved_by = COALESCE($2, resolved_by),
        resolution = COALESCE($3, resolution),
        resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END
      WHERE id = $4 RETURNING *`,
      [statusVal, resolvedByVal, resolutionVal, id],
    );

    if (result.rows.length === 0) throw new NotFoundError('Contradiction', id);
    return c.json(parseContradiction(result.rows[0] as Record<string, unknown>));
  });
}
