/**
 * Wing management endpoints — agent-specific context spaces with learned affinity.
 */

import type { Hono } from 'hono';
import { getDb } from '@hipp0/core/db/index.js';
import { rebalanceWingAffinity } from '@hipp0/core';
import { requireUUID, requireString, logAudit } from './validation.js';

export function registerWingRoutes(app: Hono): void {
  // ── GET /api/agents/:name/wing — Wing stats for an agent ────────────
  app.get('/api/agents/:name/wing', async (c) => {
    const db = getDb();
    const agentName = c.req.param('name');
    const projectId = c.req.query('project_id');

    // Find the agent
    let agentQuery = 'SELECT * FROM agents WHERE name = ?';
    const params: unknown[] = [agentName];
    if (projectId) {
      agentQuery += ' AND project_id = ?';
      params.push(projectId);
    }
    agentQuery += ' LIMIT 1';

    const agentResult = await db.query<Record<string, unknown>>(agentQuery, params);
    if (agentResult.rows.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Agent "${agentName}" not found` } }, 404);
    }

    const agent = agentResult.rows[0];
    const agentProjectId = agent.project_id as string;

    // Decision count for this wing
    const decisionResult = await db.query<Record<string, unknown>>(
      `SELECT COUNT(*) as count FROM decisions WHERE project_id = ? AND (wing = ? OR (wing IS NULL AND made_by = ?))`,
      [agentProjectId, agentName, agentName],
    );
    const decisionCount = parseInt((decisionResult.rows[0] as Record<string, unknown>).count as string ?? '0', 10);

    // Top domains
    const domainResult = await db.query<Record<string, unknown>>(
      `SELECT domain, COUNT(*) as count FROM decisions
       WHERE project_id = ? AND (wing = ? OR (wing IS NULL AND made_by = ?)) AND domain IS NOT NULL
       GROUP BY domain ORDER BY count DESC LIMIT 5`,
      [agentProjectId, agentName, agentName],
    );
    const topDomains = domainResult.rows.map((r) => r.domain as string);

    // Cross-wing connections (decisions that affect other agents)
    const crossWingResult = await db.query<Record<string, unknown>>(
      `SELECT DISTINCT UNNEST(affects) as connected_agent FROM decisions
       WHERE project_id = ? AND (wing = ? OR (wing IS NULL AND made_by = ?))`,
      [agentProjectId, agentName, agentName],
    );
    const connections = crossWingResult.rows
      .map((r) => r.connected_agent as string)
      .filter((a) => a && a !== agentName);

    // Parse wing_affinity
    let wingAffinity = { cross_wing_weights: {}, last_recalculated: '', feedback_count: 0 };
    const rawAffinity = agent.wing_affinity;
    if (rawAffinity) {
      if (typeof rawAffinity === 'string') {
        try { wingAffinity = JSON.parse(rawAffinity); } catch { /* skip */ }
      } else if (typeof rawAffinity === 'object') {
        wingAffinity = rawAffinity as typeof wingAffinity;
      }
    }

    return c.json({
      agent_name: agentName,
      wing: agentName,
      decision_count: decisionCount,
      top_domains: topDomains,
      cross_wing_connections: connections.map((name) => ({
        wing: name,
        strength: (wingAffinity.cross_wing_weights as Record<string, number>)[name] ?? 0,
      })),
      wing_affinity: wingAffinity,
    });
  });

  // ── GET /api/projects/:id/wings — All wings in a project ────────────
  app.get('/api/projects/:id/wings', async (c) => {
    const db = getDb();
    const projectId = requireUUID(c.req.param('id'), 'project_id');

    // Get all wings with counts and top domains
    const wingResult = await db.query<Record<string, unknown>>(
      `SELECT COALESCE(wing, made_by) as wing_name, COUNT(*) as decision_count
       FROM decisions WHERE project_id = ?
       GROUP BY COALESCE(wing, made_by) ORDER BY decision_count DESC`,
      [projectId],
    );

    const wings: Array<Record<string, unknown>> = [];
    for (const row of wingResult.rows) {
      const wingName = row.wing_name as string;
      const decisionCount = parseInt(row.decision_count as string ?? '0', 10);

      // Top domains for this wing
      const domainResult = await db.query<Record<string, unknown>>(
        `SELECT domain, COUNT(*) as count FROM decisions
         WHERE project_id = ? AND (wing = ? OR (wing IS NULL AND made_by = ?)) AND domain IS NOT NULL
         GROUP BY domain ORDER BY count DESC LIMIT 3`,
        [projectId, wingName, wingName],
      );
      const topDomains = domainResult.rows.map((r) => r.domain as string);

      // Cross-references: which other wings reference this wing's decisions
      const crossRefResult = await db.query<Record<string, unknown>>(
        `SELECT rf.agent_id, a.name as agent_name, COUNT(*) as ref_count
         FROM relevance_feedback rf
         JOIN decisions d ON d.id = rf.decision_id
         JOIN agents a ON a.id = rf.agent_id
         WHERE d.project_id = ? AND COALESCE(d.wing, d.made_by) = ? AND rf.was_useful = true
         GROUP BY rf.agent_id, a.name
         ORDER BY ref_count DESC LIMIT 5`,
        [projectId, wingName],
      );

      wings.push({
        wing: wingName,
        decision_count: decisionCount,
        top_domains: topDomains,
        cross_references: crossRefResult.rows.map((r) => ({
          agent: r.agent_name as string,
          strength: Math.min(1.0, (parseInt(r.ref_count as string ?? '0', 10) * 0.1)),
        })),
      });
    }

    return c.json({ project_id: projectId, wings });
  });

  // ── POST /api/agents/:name/wing/rebalance — Recalculate affinity ────
  app.post('/api/agents/:name/wing/rebalance', async (c) => {
    const db = getDb();
    const agentName = c.req.param('name');
    const projectId = c.req.query('project_id');

    // Find agent
    let agentQuery = 'SELECT id, project_id FROM agents WHERE name = ?';
    const params: unknown[] = [agentName];
    if (projectId) {
      agentQuery += ' AND project_id = ?';
      params.push(projectId);
    }
    agentQuery += ' LIMIT 1';

    const agentResult = await db.query<Record<string, unknown>>(agentQuery, params);
    if (agentResult.rows.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Agent "${agentName}" not found` } }, 404);
    }

    const agentId = agentResult.rows[0].id as string;
    const affinity = await rebalanceWingAffinity(agentId);

    logAudit('wing_rebalanced', agentResult.rows[0].project_id as string, {
      agent_name: agentName,
      agent_id: agentId,
      wings_count: Object.keys(affinity.cross_wing_weights).length,
      feedback_count: affinity.feedback_count,
    });

    return c.json({
      agent_name: agentName,
      wing_affinity: affinity,
      rebalanced_at: new Date().toISOString(),
    });
  });
}
