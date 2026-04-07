/**
 * Feature 10: Autonomous Decision Evolution — API Routes
 */
import type { Hono } from 'hono';
import { getDb } from '@decigraph/core/db/index.js';
import { NotFoundError, ValidationError } from '@decigraph/core/types.js';
import { requireUUID, optionalString, mapDbError } from './validation.js';

// In-memory rate limit for manual trigger (1 per hour per project)
const triggerTimestamps = new Map<string, number>();

export function registerEvolutionRoutes(app: Hono): void {
  // ── GET /api/projects/:id/evolution-proposals ──────────────────────
  app.get('/api/projects/:id/evolution-proposals', async (c) => {
    const db = getDb();
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    const status = c.req.query('status') || 'proposed';

    const result = await db.query(
      `SELECT ep.*,
              d.title AS original_title,
              d.description AS original_description,
              d.reasoning AS original_reasoning,
              d.tags AS original_tags,
              d.affects AS original_affects,
              d.status AS original_status
       FROM decision_evolution_proposals ep
       JOIN decisions d ON d.id = ep.original_decision_id
       WHERE ep.project_id = ? AND ep.status = ?
       ORDER BY ep.created_at DESC`,
      [projectId, status],
    );

    const proposals = result.rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: row.id,
        project_id: row.project_id,
        original_decision_id: row.original_decision_id,
        original: {
          title: row.original_title,
          description: row.original_description,
          reasoning: row.original_reasoning,
          tags: row.original_tags,
          affects: row.original_affects,
          status: row.original_status,
        },
        proposed: {
          title: row.proposed_title,
          description: row.proposed_description,
          reasoning: row.proposed_reasoning,
          tags: row.proposed_tags,
          affects: row.proposed_affects,
        },
        trigger_reason: row.trigger_reason,
        trigger_data: typeof row.trigger_data === 'string'
          ? JSON.parse(row.trigger_data as string)
          : row.trigger_data,
        predicted_impact: typeof row.predicted_impact === 'string'
          ? JSON.parse(row.predicted_impact as string)
          : row.predicted_impact,
        simulation_ran: row.simulation_ran,
        simulation_results: typeof row.simulation_results === 'string'
          ? JSON.parse(row.simulation_results as string)
          : row.simulation_results,
        status: row.status,
        reviewed_by: row.reviewed_by,
        reviewed_at: row.reviewed_at,
        review_notes: row.review_notes,
        new_decision_id: row.new_decision_id,
        created_at: row.created_at,
        expires_at: row.expires_at,
      };
    });

    return c.json(proposals);
  });

  // ── POST /api/evolution/:id/approve ────────────────────────────────
  app.post('/api/evolution/:id/approve', async (c) => {
    const db = getDb();
    const proposalId = requireUUID(c.req.param('id'), 'proposalId');
    const body = await c.req.json<{
      review_notes?: unknown;
      reviewed_by?: unknown;
    }>();
    const reviewNotes = optionalString(body.review_notes, 'review_notes', 2000) ?? '';
    const reviewedBy = optionalString(body.reviewed_by, 'reviewed_by', 200) ?? 'system';

    // Get the proposal
    const proposalResult = await db.query(
      `SELECT * FROM decision_evolution_proposals WHERE id = ? AND status = 'proposed'`,
      [proposalId],
    );
    if (proposalResult.rows.length === 0) {
      throw new NotFoundError('EvolutionProposal', proposalId);
    }
    const proposal = proposalResult.rows[0] as Record<string, unknown>;

    try {
      // Create the new decision
      const newDecision = await db.query(
        `INSERT INTO decisions (project_id, title, description, reasoning, made_by, source, confidence, status, supersedes_id, tags, affects, validated_at)
         VALUES (?, ?, ?, ?, ?, 'auto_distilled', 'high', 'active', ?, ?, ?, NOW())
         RETURNING id`,
        [
          proposal.project_id,
          proposal.proposed_title,
          proposal.proposed_description,
          proposal.proposed_reasoning,
          reviewedBy,
          proposal.original_decision_id,
          proposal.proposed_tags ?? '{}',
          proposal.proposed_affects ?? '{}',
        ],
      );
      const newDecisionId = (newDecision.rows[0] as Record<string, unknown>).id as string;

      // Supersede the original decision
      await db.query(
        `UPDATE decisions SET status = 'superseded' WHERE id = ?`,
        [proposal.original_decision_id],
      );

      // Create supersedes edge
      await db.query(
        `INSERT INTO decision_edges (source_id, target_id, relationship, description)
         VALUES (?, ?, 'supersedes', ?)`,
        [newDecisionId, proposal.original_decision_id as string, `Evolution: ${proposal.trigger_reason}`],
      );

      // Update proposal
      await db.query(
        `UPDATE decision_evolution_proposals
         SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(),
             review_notes = ?, new_decision_id = ?
         WHERE id = ?`,
        [reviewedBy, reviewNotes, newDecisionId, proposalId],
      );

      return c.json({
        status: 'approved',
        new_decision_id: newDecisionId,
        original_decision_id: proposal.original_decision_id,
      }, 201);
    } catch (err) {
      mapDbError(err);
    }
  });

  // ── POST /api/evolution/:id/reject ─────────────────────────────────
  app.post('/api/evolution/:id/reject', async (c) => {
    const db = getDb();
    const proposalId = requireUUID(c.req.param('id'), 'proposalId');
    const body = await c.req.json<{
      review_notes?: unknown;
      reviewed_by?: unknown;
    }>();
    const reviewNotes = optionalString(body.review_notes, 'review_notes', 2000) ?? '';
    const reviewedBy = optionalString(body.reviewed_by, 'reviewed_by', 200) ?? 'system';

    const result = await db.query(
      `UPDATE decision_evolution_proposals
       SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), review_notes = ?
       WHERE id = ? AND status = 'proposed'
       RETURNING id`,
      [reviewedBy, reviewNotes, proposalId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('EvolutionProposal', proposalId);
    }

    return c.json({ status: 'rejected', id: proposalId });
  });

  // ── POST /api/projects/:id/evolution/trigger ───────────────────────
  app.post('/api/projects/:id/evolution/trigger', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'projectId');

    // Rate limit: 1 per hour per project
    const lastTrigger = triggerTimestamps.get(projectId) ?? 0;
    if (Date.now() - lastTrigger < 3600_000) {
      throw new ValidationError('Evolution scan can only be triggered once per hour');
    }
    triggerTimestamps.set(projectId, Date.now());

    // Run async — don't block the response
    const { findEvolutionCandidates, generateEvolutionProposal, simulateProposalImpact } =
      await import('@decigraph/core/intelligence/decision-evolver.js');

    const db = getDb();
    const candidates = await findEvolutionCandidates(projectId);

    let created = 0;
    for (const candidate of candidates) {
      try {
        const proposal = await generateEvolutionProposal(candidate, projectId);

        // Skip reaffirm — just update validated_at
        if (proposal.change_type === 'reaffirm') {
          await db.query(
            `UPDATE decisions SET validated_at = NOW(), stale = false WHERE id = ?`,
            [candidate.decision_id],
          );
          continue;
        }

        const simulation = await simulateProposalImpact(
          candidate.decision_id,
          proposal,
          projectId,
        );

        await db.query(
          `INSERT INTO decision_evolution_proposals
           (project_id, original_decision_id, proposed_title, proposed_description,
            proposed_reasoning, proposed_tags, proposed_affects, trigger_reason,
            trigger_data, predicted_impact, simulation_ran, simulation_results)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            projectId,
            candidate.decision_id,
            proposal.title,
            proposal.description,
            proposal.reasoning,
            proposal.tags,
            proposal.affects,
            candidate.trigger_reason,
            JSON.stringify(candidate.trigger_data),
            JSON.stringify(proposal.predicted_impact),
            true,
            JSON.stringify(simulation),
          ],
        );
        created++;
      } catch (err) {
        console.warn(`[decigraph/evolution] Failed for decision ${candidate.decision_id}:`, (err as Error).message);
      }
    }

    return c.json({
      candidates_found: candidates.length,
      proposals_created: created,
    });
  });

  // ── POST /api/decisions/:id/evolve ─────────────────────────────────
  app.post('/api/decisions/:id/evolve', async (c) => {
    const db = getDb();
    const decisionId = requireUUID(c.req.param('id'), 'decisionId');
    const body = await c.req.json<{ reason?: unknown }>();
    const reason = optionalString(body.reason, 'reason', 500) ?? 'Manual evolution request';

    // Get the decision
    const decisionResult = await db.query(
      `SELECT id, project_id, title, description, reasoning, tags, affects
       FROM decisions WHERE id = ? AND status = 'active'`,
      [decisionId],
    );
    if (decisionResult.rows.length === 0) {
      throw new NotFoundError('Decision', decisionId);
    }
    const d = decisionResult.rows[0] as Record<string, unknown>;

    const { generateEvolutionProposal, simulateProposalImpact } =
      await import('@decigraph/core/intelligence/decision-evolver.js');

    const candidate = {
      decision_id: d.id as string,
      project_id: d.project_id as string,
      title: d.title as string,
      description: d.description as string,
      reasoning: d.reasoning as string,
      tags: (d.tags as string[]) ?? [],
      affects: (d.affects as string[]) ?? [],
      trigger_reason: 'manual_request',
      trigger_data: { reason },
    };

    const proposal = await generateEvolutionProposal(candidate, d.project_id as string);

    if (proposal.change_type === 'reaffirm') {
      await db.query(
        `UPDATE decisions SET validated_at = NOW(), stale = false WHERE id = ?`,
        [decisionId],
      );
      return c.json({ change_type: 'reaffirm', message: 'Decision reaffirmed — no changes needed' });
    }

    const simulation = await simulateProposalImpact(decisionId, proposal, d.project_id as string);

    const insertResult = await db.query(
      `INSERT INTO decision_evolution_proposals
       (project_id, original_decision_id, proposed_title, proposed_description,
        proposed_reasoning, proposed_tags, proposed_affects, trigger_reason,
        trigger_data, predicted_impact, simulation_ran, simulation_results)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        d.project_id,
        decisionId,
        proposal.title,
        proposal.description,
        proposal.reasoning,
        proposal.tags,
        proposal.affects,
        'manual_request',
        JSON.stringify({ reason }),
        JSON.stringify(proposal.predicted_impact),
        true,
        JSON.stringify(simulation),
      ],
    );

    const proposalId = (insertResult.rows[0] as Record<string, unknown>).id as string;

    return c.json({
      proposal_id: proposalId,
      proposal,
      simulation,
    }, 201);
  });
}
