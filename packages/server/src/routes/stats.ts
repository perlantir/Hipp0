import type { Hono } from 'hono';
import { getDb } from '@nexus/core/db/index.js';
import { parseDecision, parseEdge, parseAuditEntry } from '@nexus/core/db/parsers.js';
import { requireUUID } from './validation.js';

export function registerStatsRoutes(app: Hono): void {
  app.get('/api/projects/:id/stats', async (c) => {
    const db = getDb();
    const projectId = requireUUID(c.req.param('id'), 'projectId');

    const [
      decisionsResult,
      agentsResult,
      artifactsResult,
      sessionsResult,
      contradictionsResult,
      edgesResult,
      auditResult,
    ] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'active') AS active,
           COUNT(*) FILTER (WHERE status = 'superseded') AS superseded,
           COUNT(*) FILTER (WHERE status = 'pending') AS pending,
           COUNT(*) AS total
         FROM decisions WHERE project_id = ?`,
        [projectId],
      ),
      db.query('SELECT COUNT(*) AS count FROM agents WHERE project_id = ?', [projectId]),
      db.query('SELECT COUNT(*) AS count FROM artifacts WHERE project_id = ?', [projectId]),
      db.query('SELECT COUNT(*) AS count FROM session_summaries WHERE project_id = ?', [projectId]),
      db.query(
        "SELECT COUNT(*) AS count FROM contradictions WHERE project_id = ? AND status = 'unresolved'",
        [projectId],
      ),
      db.query(
        `SELECT COUNT(*) AS count FROM decision_edges e
         JOIN decisions d ON d.id = e.source_id WHERE d.project_id = ?`,
        [projectId],
      ),
      db.query('SELECT * FROM audit_log WHERE project_id = ? ORDER BY created_at DESC LIMIT 10', [
        projectId,
      ]),
    ]);

    const d = decisionsResult.rows[0] as Record<string, unknown>;

    return c.json({
      total_decisions: parseInt(d.total as string, 10),
      active_decisions: parseInt(d.active as string, 10),
      superseded_decisions: parseInt(d.superseded as string, 10),
      pending_decisions: parseInt(d.pending as string, 10),
      total_agents: parseInt((agentsResult.rows[0] as Record<string, unknown>).count as string, 10),
      total_artifacts: parseInt(
        (artifactsResult.rows[0] as Record<string, unknown>).count as string,
        10,
      ),
      total_sessions: parseInt(
        (sessionsResult.rows[0] as Record<string, unknown>).count as string,
        10,
      ),
      unresolved_contradictions: parseInt(
        (contradictionsResult.rows[0] as Record<string, unknown>).count as string,
        10,
      ),
      total_edges: parseInt((edgesResult.rows[0] as Record<string, unknown>).count as string, 10),
      recent_activity: auditResult.rows.map((r) => parseAuditEntry(r as Record<string, unknown>)),
    });
  });

  // Project Graph (all decisions + edges)

  app.get('/api/projects/:id/graph', async (c) => {
    const db = getDb();
    const projectId = requireUUID(c.req.param('id'), 'projectId');

    const [decisionsResult, edgesResult] = await Promise.all([
      db.query('SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at ASC', [projectId]),
      db.query(
        `SELECT e.* FROM decision_edges e
         JOIN decisions d ON d.id = e.source_id
         WHERE d.project_id = ?`,
        [projectId],
      ),
    ]);

    return c.json({
      nodes: decisionsResult.rows.map((r) => parseDecision(r as Record<string, unknown>)),
      edges: edgesResult.rows.map((r) => parseEdge(r as Record<string, unknown>)),
    });
  });
}
