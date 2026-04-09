/**
 * Feature 11: What-If Simulator — API Routes
 */
import type { Hono } from 'hono';
import { getDb } from '@hipp0/core/db/index.js';
import { NotFoundError, ValidationError } from '@hipp0/core/types.js';
import { requireUUID, requireString, validateTags, validateAffects } from './validation.js';
import { requireProjectAccess } from './_helpers.js';
import {
  simulateDecisionChange,
  simulateHistoricalImpact,
} from '@hipp0/core/intelligence/whatif-simulator.js';

export function registerSimulationRoutes(app: Hono): void {
    // POST /api/simulation/preview
  app.post('/api/simulation/preview', async (c) => {
    const body = await c.req.json();

    const decisionId = requireUUID(body.decision_id, 'decision_id');
    const projectId = requireUUID(body.project_id, 'project_id');
    await requireProjectAccess(c, projectId);

    if (!body.proposed_changes || typeof body.proposed_changes !== 'object') {
      throw new ValidationError('proposed_changes is required and must be an object');
    }

    const proposedChanges: Record<string, unknown> = {};
    if (body.proposed_changes.title !== undefined) {
      proposedChanges.title = requireString(body.proposed_changes.title, 'proposed_changes.title', 500);
    }
    if (body.proposed_changes.description !== undefined) {
      proposedChanges.description = requireString(body.proposed_changes.description, 'proposed_changes.description', 10000);
    }
    if (body.proposed_changes.tags !== undefined) {
      proposedChanges.tags = validateTags(body.proposed_changes.tags);
    }
    if (body.proposed_changes.affects !== undefined) {
      proposedChanges.affects = validateAffects(body.proposed_changes.affects);
    }

    const result = await simulateDecisionChange(decisionId, proposedChanges, projectId);
    return c.json(result);
  });

    // POST /api/simulation/historical
  app.post('/api/simulation/historical', async (c) => {
    const body = await c.req.json();

    const decisionId = requireUUID(body.decision_id, 'decision_id');
    const projectId = requireUUID(body.project_id, 'project_id');
    await requireProjectAccess(c, projectId);
    const lookbackDays = typeof body.lookback_days === 'number' ? body.lookback_days : 30;

    if (!body.proposed_changes || typeof body.proposed_changes !== 'object') {
      throw new ValidationError('proposed_changes is required and must be an object');
    }

    const proposedChanges: Record<string, unknown> = {};
    if (body.proposed_changes.title !== undefined) {
      proposedChanges.title = body.proposed_changes.title;
    }
    if (body.proposed_changes.description !== undefined) {
      proposedChanges.description = body.proposed_changes.description;
    }
    if (body.proposed_changes.tags !== undefined) {
      proposedChanges.tags = body.proposed_changes.tags;
    }
    if (body.proposed_changes.affects !== undefined) {
      proposedChanges.affects = body.proposed_changes.affects;
    }

    // Run both real-time and historical simulation
    const [simulation, historical] = await Promise.all([
      simulateDecisionChange(decisionId, proposedChanges, projectId),
      simulateHistoricalImpact(decisionId, proposedChanges, projectId, lookbackDays),
    ]);

    return c.json({
      ...simulation,
      historical: historical ?? { lookback_days: lookbackDays, compile_appearances: 0, agents_that_received: [], avg_score: 0 },
    });
  });

    // POST /api/simulation/apply
  app.post('/api/simulation/apply', async (c) => {
    const db = getDb();
    const body = await c.req.json();

    const decisionId = requireUUID(body.decision_id, 'decision_id');
    const projectId = requireUUID(body.project_id, 'project_id');
    await requireProjectAccess(c, projectId);

    if (!body.proposed_changes || typeof body.proposed_changes !== 'object') {
      throw new ValidationError('proposed_changes is required and must be an object');
    }

    // Get original decision
    const origResult = await db.query(
      `SELECT * FROM decisions WHERE id = ? AND project_id = ?`,
      [decisionId, projectId],
    );
    if (origResult.rows.length === 0) {
      throw new NotFoundError('Decision', decisionId);
    }
    const original = origResult.rows[0] as Record<string, unknown>;

    // Parse JSON fields from original
    const origTags = typeof original.tags === 'string' ? JSON.parse(original.tags as string) : original.tags ?? [];
    const origAffects = typeof original.affects === 'string' ? JSON.parse(original.affects as string) : original.affects ?? [];
    const origAlternatives = typeof original.alternatives_considered === 'string'
      ? JSON.parse(original.alternatives_considered as string) : original.alternatives_considered ?? [];
    const origAssumptions = typeof original.assumptions === 'string'
      ? JSON.parse(original.assumptions as string) : original.assumptions ?? [];
    const origOpenQuestions = typeof original.open_questions === 'string'
      ? JSON.parse(original.open_questions as string) : original.open_questions ?? [];
    const origDependencies = typeof original.dependencies === 'string'
      ? JSON.parse(original.dependencies as string) : original.dependencies ?? [];
    const origMetadata = typeof original.metadata === 'string'
      ? JSON.parse(original.metadata as string) : original.metadata ?? {};

    // Build new decision values
    const newTitle = body.proposed_changes.title ?? original.title;
    const newDescription = body.proposed_changes.description ?? original.description;
    const newTags = body.proposed_changes.tags ?? origTags;
    const newAffects = body.proposed_changes.affects ?? origAffects;

    // Generate new ID
    const newId = crypto.randomUUID();

    // Create new decision with proposed content
    await db.query(
      `INSERT INTO decisions (id, project_id, title, description, reasoning, made_by, source, confidence, status, supersedes_id, alternatives_considered, affects, tags, assumptions, open_questions, dependencies, confidence_decay_rate, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        projectId,
        newTitle,
        newDescription,
        original.reasoning ?? '',
        original.made_by ?? 'whatif-simulator',
        'manual',
        original.confidence ?? 'medium',
        decisionId,
        JSON.stringify(origAlternatives),
        JSON.stringify(newAffects),
        JSON.stringify(newTags),
        JSON.stringify(origAssumptions),
        JSON.stringify(origOpenQuestions),
        JSON.stringify(origDependencies),
        original.confidence_decay_rate ?? 0.1,
        JSON.stringify(origMetadata),
      ],
    );

    // Supersede original
    await db.query(
      `UPDATE decisions SET status = 'superseded', updated_at = NOW() WHERE id = ?`,
      [decisionId],
    );

    // Create decision_edge if table exists
    try {
      await db.query(
        `INSERT INTO decision_edges (id, source_id, target_id, relationship, description, strength)
         VALUES (?, ?, ?, 'supersedes', 'Applied via What-If Simulator', 1.0)`,
        [crypto.randomUUID(), newId, decisionId],
      );
    } catch {
      // decision_edges table may not exist
    }

    return c.json({
      success: true,
      new_decision_id: newId,
      superseded_decision_id: decisionId,
    });
  });
}
