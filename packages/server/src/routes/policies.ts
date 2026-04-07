/**
 * Governance Policies routes — CRUD for decision_policies + pre-compile check.
 */
import type { Hono } from 'hono';
import { getDb } from '@decigraph/core/db/index.js';
import { ValidationError, NotFoundError } from '@decigraph/core/types.js';
import { requireUUID, requireString, optionalString, logAudit } from './validation.js';
import { checkPlannedAction } from '../governance/runtime-checker.js';

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parsePolicy(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    enforcement_level: row.enforcement_level as string,
    scope: typeof row.scope === 'string' ? JSON.parse(row.scope as string) : (row.scope ?? {}),
    active: row.active === true || row.active === 1,
    created_by: (row.created_by as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function parseViolation(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    policy_id: row.policy_id as string,
    project_id: row.project_id as string,
    agent_id: (row.agent_id as string) ?? null,
    agent_name: (row.agent_name as string) ?? null,
    outcome_id: (row.outcome_id as string) ?? null,
    compile_history_id: (row.compile_history_id as string) ?? null,
    violation_type: row.violation_type as string,
    severity: row.severity as string,
    evidence_snippet: (row.evidence_snippet as string) ?? null,
    explanation: (row.explanation as string) ?? null,
    resolved: row.resolved === true || row.resolved === 1,
    resolved_by: (row.resolved_by as string) ?? null,
    resolved_at: (row.resolved_at as string) ?? null,
    created_at: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerPolicyRoutes(app: Hono): void {
  // ── Pre-compile policy check ──────────────────────────────────────────
  app.post('/api/policies/check', async (c) => {
    const body = await c.req.json<{
      project_id?: unknown;
      agent_name?: unknown;
      planned_action?: unknown;
    }>();

    const projectId = requireUUID(body.project_id, 'project_id');
    const agentName = requireString(body.agent_name, 'agent_name', 200);
    const plannedAction = requireString(body.planned_action, 'planned_action');

    const result = await checkPlannedAction(projectId, agentName, plannedAction);
    return c.json(result);
  });

  // ── List policies for a project ───────────────────────────────────────
  app.get('/api/projects/:projectId/policies', async (c) => {
    const projectId = requireUUID(c.req.param('projectId'), 'projectId');
    const db = getDb();

    const result = await db.query<Record<string, unknown>>(
      `SELECT * FROM decision_policies WHERE project_id = ? ORDER BY created_at DESC`,
      [projectId],
    );

    return c.json(result.rows.map((r) => parsePolicy(r as Record<string, unknown>)));
  });

  // ── Create policy ─────────────────────────────────────────────────────
  app.post('/api/projects/:projectId/policies', async (c) => {
    const projectId = requireUUID(c.req.param('projectId'), 'projectId');
    const db = getDb();

    const body = await c.req.json<{
      title?: unknown;
      description?: unknown;
      enforcement_level?: unknown;
      scope?: unknown;
      created_by?: unknown;
    }>();

    const title = requireString(body.title, 'title', 500);
    const description = optionalString(body.description, 'description', 2000);
    const enforcementLevel = body.enforcement_level as string ?? 'warn';
    if (!['block', 'warn', 'advisory'].includes(enforcementLevel)) {
      throw new ValidationError('enforcement_level must be block, warn, or advisory');
    }
    const createdBy = optionalString(body.created_by, 'created_by', 200);

    const result = await db.query<Record<string, unknown>>(
      `INSERT INTO decision_policies (project_id, title, description, enforcement_level, scope, created_by)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [projectId, title, description ?? null, enforcementLevel, JSON.stringify(body.scope ?? {}), createdBy ?? null],
    );

    const policy = parsePolicy(result.rows[0] as Record<string, unknown>);

    logAudit('policy_created', projectId, { policy_id: policy.id, title });

    return c.json(policy, 201);
  });

  // ── Get single policy ─────────────────────────────────────────────────
  app.get('/api/policies/:id', async (c) => {
    const id = requireUUID(c.req.param('id'), 'id');
    const db = getDb();

    const result = await db.query<Record<string, unknown>>(
      `SELECT * FROM decision_policies WHERE id = ?`,
      [id],
    );

    if (result.rows.length === 0) throw new NotFoundError('Policy not found');
    return c.json(parsePolicy(result.rows[0] as Record<string, unknown>));
  });

  // ── Update policy ─────────────────────────────────────────────────────
  app.patch('/api/policies/:id', async (c) => {
    const id = requireUUID(c.req.param('id'), 'id');
    const db = getDb();

    const body = await c.req.json<{
      title?: unknown;
      description?: unknown;
      enforcement_level?: unknown;
      scope?: unknown;
      active?: unknown;
    }>();

    // Build SET clause dynamically
    const sets: string[] = [];
    const values: unknown[] = [];

    if (body.title !== undefined) {
      sets.push('title = ?');
      values.push(requireString(body.title, 'title', 500));
    }
    if (body.description !== undefined) {
      sets.push('description = ?');
      values.push(body.description === null ? null : requireString(body.description as unknown, 'description', 2000));
    }
    if (body.enforcement_level !== undefined) {
      const level = body.enforcement_level as string;
      if (!['block', 'warn', 'advisory'].includes(level)) {
        throw new ValidationError('enforcement_level must be block, warn, or advisory');
      }
      sets.push('enforcement_level = ?');
      values.push(level);
    }
    if (body.scope !== undefined) {
      sets.push('scope = ?');
      values.push(JSON.stringify(body.scope));
    }
    if (body.active !== undefined) {
      sets.push('active = ?');
      values.push(db.dialect === 'sqlite' ? (body.active ? 1 : 0) : body.active);
    }

    if (sets.length === 0) {
      throw new ValidationError('No fields to update');
    }

    sets.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const result = await db.query<Record<string, unknown>>(
      `UPDATE decision_policies SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
      values,
    );

    if (result.rows.length === 0) throw new NotFoundError('Policy not found');
    return c.json(parsePolicy(result.rows[0] as Record<string, unknown>));
  });

  // ── Delete policy ─────────────────────────────────────────────────────
  app.delete('/api/policies/:id', async (c) => {
    const id = requireUUID(c.req.param('id'), 'id');
    const db = getDb();

    const result = await db.query<Record<string, unknown>>(
      `DELETE FROM decision_policies WHERE id = ? RETURNING id`,
      [id],
    );

    if (result.rows.length === 0) throw new NotFoundError('Policy not found');
    return c.json({ deleted: true, id });
  });

  // ── List violations for a project ─────────────────────────────────────
  app.get('/api/projects/:projectId/violations', async (c) => {
    const projectId = requireUUID(c.req.param('projectId'), 'projectId');
    const db = getDb();

    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200);
    const resolved = c.req.query('resolved');

    let sql = `SELECT * FROM policy_violations WHERE project_id = ?`;
    const queryParams: unknown[] = [projectId];

    if (resolved !== undefined) {
      sql += ` AND resolved = ?`;
      queryParams.push(
        db.dialect === 'sqlite'
          ? (resolved === 'true' ? 1 : 0)
          : (resolved === 'true'),
      );
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    queryParams.push(limit);

    const result = await db.query<Record<string, unknown>>(sql, queryParams);
    return c.json(result.rows.map((r) => parseViolation(r as Record<string, unknown>)));
  });

  // ── Resolve a violation ───────────────────────────────────────────────
  app.patch('/api/violations/:id/resolve', async (c) => {
    const id = requireUUID(c.req.param('id'), 'id');
    const db = getDb();

    const body = await c.req.json<{ resolved_by?: unknown }>();
    const resolvedBy = optionalString(body.resolved_by, 'resolved_by', 200);

    const result = await db.query<Record<string, unknown>>(
      `UPDATE policy_violations
       SET resolved = ?, resolved_by = ?, resolved_at = ?
       WHERE id = ?
       RETURNING *`,
      [
        db.dialect === 'sqlite' ? 1 : true,
        resolvedBy ?? null,
        new Date().toISOString(),
        id,
      ],
    );

    if (result.rows.length === 0) throw new NotFoundError('Violation not found');
    return c.json(parseViolation(result.rows[0] as Record<string, unknown>));
  });

  // ── Compliance summary for a project ──────────────────────────────────
  app.get('/api/projects/:projectId/compliance', async (c) => {
    const projectId = requireUUID(c.req.param('projectId'), 'projectId');
    const db = getDb();

    const [policiesResult, violationsResult, openViolationsResult] = await Promise.all([
      db.query<Record<string, unknown>>(
        `SELECT COUNT(*) as count FROM decision_policies WHERE project_id = ? AND active = ?`,
        [projectId, db.dialect === 'sqlite' ? 1 : true],
      ),
      db.query<Record<string, unknown>>(
        `SELECT COUNT(*) as count FROM policy_violations WHERE project_id = ?`,
        [projectId],
      ),
      db.query<Record<string, unknown>>(
        `SELECT COUNT(*) as count FROM policy_violations WHERE project_id = ? AND resolved = ?`,
        [projectId, db.dialect === 'sqlite' ? 0 : false],
      ),
    ]);

    const activePolicies = parseInt((policiesResult.rows[0] as Record<string, unknown>).count as string ?? '0', 10);
    const totalViolations = parseInt((violationsResult.rows[0] as Record<string, unknown>).count as string ?? '0', 10);
    const openViolations = parseInt((openViolationsResult.rows[0] as Record<string, unknown>).count as string ?? '0', 10);
    const complianceRate = totalViolations === 0 ? 100 : Math.round(((totalViolations - openViolations) / totalViolations) * 100);

    return c.json({
      active_policies: activePolicies,
      total_violations: totalViolations,
      open_violations: openViolations,
      compliance_rate: complianceRate,
    });
  });
}
