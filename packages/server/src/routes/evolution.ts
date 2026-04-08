/**
 * Autonomous Evolution Engine — API Routes
 *
 * 7 endpoints:
 *   POST /api/evolution/scan
 *   GET  /api/evolution/proposals
 *   GET  /api/evolution/proposals/:id
 *   POST /api/evolution/proposals/:id/accept
 *   POST /api/evolution/proposals/:id/reject
 *   POST /api/evolution/proposals/:id/override
 *   GET  /api/evolution/history
 */
import type { Hono } from 'hono';
import { getDb } from '@hipp0/core';
import { NotFoundError, ValidationError } from '@hipp0/core';
import {
  runEvolutionScan,
} from '@hipp0/core';
import type { EvolutionMode, EvolutionProposal } from '@hipp0/core';

export function registerEvolutionRoutes(app: Hono): void {
  // ── POST /api/evolution/scan ──────────────────────────────────────
  app.post('/api/evolution/scan', async (c) => {
    const body = await c.req.json<{ project_id?: string; mode?: string }>().catch(() => ({} as Record<string, unknown>));
    const projectId = (body.project_id ?? c.req.query('project_id') ?? '') as string;
    const modeParam = (body.mode ?? c.req.query('mode') ?? 'rule') as string;

    if (!projectId) {
      throw new ValidationError('project_id is required');
    }
    const mode = (['rule', 'llm', 'hybrid'].includes(modeParam) ? modeParam : 'rule') as EvolutionMode;

    const scanResult = await runEvolutionScan(projectId, mode);
    const db = getDb();

    // Record scan
    const scanInsert = await db.query(
      `INSERT INTO evolution_scans (project_id, mode, proposals_generated, scan_duration_ms)
       VALUES (?, ?, ?, ?)
       RETURNING id`,
      [projectId, mode, scanResult.proposals.length, scanResult.scan_duration_ms],
    );
    const scanId = (scanInsert.rows[0] as Record<string, unknown>).id as string;

    // Store proposals
    for (const p of scanResult.proposals) {
      await db.query(
        `INSERT INTO evolution_proposals (project_id, trigger_type, urgency, affected_decision_ids, reasoning, suggested_action, confidence, impact_score, scan_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          p.trigger_type,
          p.urgency,
          JSON.stringify(p.affected_decision_ids),
          p.reasoning,
          p.suggested_action,
          p.confidence,
          p.impact_score,
          scanId,
        ],
      );
    }

    return c.json({
      scan_id: scanId,
      proposals_generated: scanResult.proposals.length,
      scan_duration_ms: scanResult.scan_duration_ms,
      mode,
    });
  });

  // ── GET /api/evolution/proposals ──────────────────────────────────
  app.get('/api/evolution/proposals', async (c) => {
    const db = getDb();
    const urgencyFilter = c.req.query('urgency');
    const statusFilter = c.req.query('status') || 'pending';

    let sql = `SELECT * FROM evolution_proposals WHERE status = ?`;
    const params: unknown[] = [statusFilter];

    if (urgencyFilter) {
      const urgencies = urgencyFilter.split(',').map((u) => u.trim());
      const placeholders = urgencies.map(() => '?').join(',');
      sql += ` AND urgency IN (${placeholders})`;
      params.push(...urgencies);
    }

    sql += ` ORDER BY
      CASE urgency WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
      impact_score DESC`;

    const result = await db.query(sql, params);

    const proposals = result.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        ...r,
        affected_decision_ids: typeof r.affected_decision_ids === 'string'
          ? JSON.parse(r.affected_decision_ids as string)
          : r.affected_decision_ids ?? [],
      };
    });

    return c.json(proposals);
  });

  // ── GET /api/evolution/proposals/:id ──────────────────────────────
  app.get('/api/evolution/proposals/:id', async (c) => {
    const db = getDb();
    const id = c.req.param('id');
    const result = await db.query(`SELECT * FROM evolution_proposals WHERE id = ?`, [id]);
    if (result.rows.length === 0) {
      throw new NotFoundError('EvolutionProposal', id);
    }
    const r = result.rows[0] as Record<string, unknown>;
    return c.json({
      ...r,
      affected_decision_ids: typeof r.affected_decision_ids === 'string'
        ? JSON.parse(r.affected_decision_ids as string)
        : r.affected_decision_ids ?? [],
    });
  });

  // ── POST /api/evolution/proposals/:id/accept ──────────────────────
  app.post('/api/evolution/proposals/:id/accept', async (c) => {
    const db = getDb();
    const id = c.req.param('id');
    const body = await c.req.json<{ resolved_by?: string; notes?: string }>().catch(() => ({} as { resolved_by?: string; notes?: string }));

    const result = await db.query(
      `UPDATE evolution_proposals
       SET status = 'accepted', resolved_by = ?, resolved_at = datetime('now'), resolution_notes = ?
       WHERE id = ? AND status = 'pending'
       RETURNING id`,
      [body.resolved_by ?? 'system', body.notes ?? '', id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('EvolutionProposal', id);
    }

    return c.json({ status: 'accepted', id });
  });

  // ── POST /api/evolution/proposals/:id/reject ──────────────────────
  app.post('/api/evolution/proposals/:id/reject', async (c) => {
    const db = getDb();
    const id = c.req.param('id');
    const body = await c.req.json<{ resolved_by?: string; reason?: string }>().catch(() => ({} as { resolved_by?: string; reason?: string }));

    const result = await db.query(
      `UPDATE evolution_proposals
       SET status = 'rejected', resolved_by = ?, resolved_at = datetime('now'), resolution_notes = ?
       WHERE id = ? AND status = 'pending'
       RETURNING id`,
      [body.resolved_by ?? 'system', body.reason ?? '', id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('EvolutionProposal', id);
    }

    return c.json({ status: 'rejected', id });
  });

  // ── POST /api/evolution/proposals/:id/override ────────────────────
  app.post('/api/evolution/proposals/:id/override', async (c) => {
    const db = getDb();
    const id = c.req.param('id');
    const body = await c.req.json<{ override_action: string; notes?: string; resolved_by?: string }>().catch(() => ({} as Record<string, unknown>));

    if (!body.override_action) {
      throw new ValidationError('override_action is required');
    }

    const result = await db.query(
      `UPDATE evolution_proposals
       SET status = 'overridden', resolved_by = ?, resolved_at = datetime('now'),
           resolution_notes = ?, suggested_action = ?
       WHERE id = ? AND status = 'pending'
       RETURNING id`,
      [
        (body.resolved_by ?? 'system') as string,
        (body.notes ?? '') as string,
        body.override_action as string,
        id,
      ],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('EvolutionProposal', id);
    }

    return c.json({ status: 'overridden', id });
  });

  // ── GET /api/evolution/history ────────────────────────────────────
  app.get('/api/evolution/history', async (c) => {
    const db = getDb();
    const projectId = c.req.query('project_id');

    let sql = `SELECT * FROM evolution_scans`;
    const params: unknown[] = [];

    if (projectId) {
      sql += ` WHERE project_id = ?`;
      params.push(projectId);
    }

    sql += ` ORDER BY created_at DESC LIMIT 50`;

    const result = await db.query(sql, params);
    return c.json(result.rows);
  });
}
