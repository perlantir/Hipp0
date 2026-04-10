/**
 * Analytics Routes — Memory Analytics & Weekly Digest endpoints.
 *
 * GET  /api/projects/:id/analytics/health           — current team memory health
 * GET  /api/projects/:id/analytics/trends?days=30   — time-series data for charts
 * GET  /api/projects/:id/analytics/digest/latest    — most recent stored digest
 * POST /api/projects/:id/analytics/digest/generate  — generate a new digest now
 * GET  /api/projects/:id/analytics/digests          — list historical digests
 */

import type { Hono } from 'hono';
import { getDb } from '@hipp0/core/db/index.js';
import {
  computeTeamHealth,
  getMemoryTrends,
  generateWeeklyDigest,
} from '@hipp0/core/intelligence/memory-analytics.js';
import { requireUUID } from './validation.js';
import { requireProjectAccess } from './_helpers.js';

export function registerAnalyticsRoutes(app: Hono): void {
  // Team health snapshot
  app.get('/api/projects/:id/analytics/health', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    await requireProjectAccess(c, projectId);

    try {
      const health = await computeTeamHealth(projectId);
      return c.json(health);
    } catch (err) {
      console.error(
        '[hipp0:analytics] Health computation failed:',
        (err as Error).message,
      );
      return c.json({ error: 'Health computation failed' }, 500);
    }
  });

  // Time-series trends
  app.get('/api/projects/:id/analytics/trends', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    await requireProjectAccess(c, projectId);

    const daysRaw = c.req.query('days');
    let days = 30;
    if (daysRaw !== undefined) {
      const parsed = parseInt(daysRaw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        days = Math.min(parsed, 365);
      }
    }

    try {
      const trends = await getMemoryTrends(projectId, days);
      return c.json(trends);
    } catch (err) {
      console.error(
        '[hipp0:analytics] Trends computation failed:',
        (err as Error).message,
      );
      return c.json({ error: 'Trends computation failed' }, 500);
    }
  });

  // Latest stored weekly digest
  app.get('/api/projects/:id/analytics/digest/latest', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    await requireProjectAccess(c, projectId);

    const db = getDb();

    try {
      const result = await db.query<Record<string, unknown>>(
        `SELECT id, project_id, period_start, period_end, digest_data, created_at
         FROM weekly_digests
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [projectId],
      );

      if (result.rows.length === 0) {
        return c.json(
          { error: 'No digest found. Generate one first.' },
          404,
        );
      }

      const row = result.rows[0];
      const digestData =
        typeof row.digest_data === 'string'
          ? JSON.parse(row.digest_data as string)
          : row.digest_data;

      return c.json({
        id: row.id,
        project_id: row.project_id,
        period_start: row.period_start,
        period_end: row.period_end,
        digest: digestData,
        created_at: row.created_at,
      });
    } catch (err) {
      console.error(
        '[hipp0:analytics] Fetch latest digest failed:',
        (err as Error).message,
      );
      return c.json({ error: 'Failed to fetch latest digest' }, 500);
    }
  });

  // Generate a new weekly digest now
  app.post('/api/projects/:id/analytics/digest/generate', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    await requireProjectAccess(c, projectId);

    try {
      const digest = await generateWeeklyDigest(projectId);
      return c.json(digest, 201);
    } catch (err) {
      console.error(
        '[hipp0:analytics] Digest generation failed:',
        (err as Error).message,
      );
      return c.json({ error: 'Digest generation failed' }, 500);
    }
  });

  // List historical digests
  app.get('/api/projects/:id/analytics/digests', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    await requireProjectAccess(c, projectId);

    const limitRaw = c.req.query('limit');
    let limit = 20;
    if (limitRaw !== undefined) {
      const parsed = parseInt(limitRaw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.min(parsed, 100);
      }
    }

    const db = getDb();
    try {
      const result = await db.query<Record<string, unknown>>(
        `SELECT id, project_id, period_start, period_end, digest_data, created_at
         FROM weekly_digests
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [projectId, limit],
      );

      const digests = result.rows.map((row) => ({
        id: row.id,
        project_id: row.project_id,
        period_start: row.period_start,
        period_end: row.period_end,
        digest:
          typeof row.digest_data === 'string'
            ? JSON.parse(row.digest_data as string)
            : row.digest_data,
        created_at: row.created_at,
      }));

      return c.json({ digests });
    } catch (err) {
      console.error(
        '[hipp0:analytics] List digests failed:',
        (err as Error).message,
      );
      return c.json({ digests: [] });
    }
  });
}
