import crypto from 'node:crypto';
import type { Hono } from 'hono';
import { getDb } from '@hipp0/core/db/index.js';
import { requireUUID, logAudit } from './validation.js';
import { randomUUID } from 'node:crypto';
import {
  recordBatchFeedback,
  computeAndApplyWeightUpdates,
} from '@hipp0/core/relevance-learner/index.js';
import { processWingOutcome } from '@hipp0/core';

// ---------------------------------------------------------------------------
// Alignment analysis (keyword-based v1)
// ---------------------------------------------------------------------------

interface AlignmentResult {
  decisions_referenced: number;
  decisions_ignored: number;
  decisions_contradicted: number;
  alignment_score: number;
  contradiction_score: number;
}

function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function analyzeAlignment(
  decisionScores: Array<{ id: string; title: string; combined_score?: number }>,
  agentOutput: string,
): AlignmentResult {
  const outputLower = agentOutput.toLowerCase();
  let referenced = 0;
  let ignored = 0;
  const contradicted = 0;

  for (const decision of decisionScores) {
    const keywords = extractKeywords(decision.title);
    if (keywords.length === 0) {
      referenced++;
      continue;
    }
    const matchCount = keywords.filter((kw) => outputLower.includes(kw)).length;
    if (matchCount / keywords.length >= 0.5) {
      referenced++;
    } else {
      ignored++;
    }
  }

  const total = decisionScores.length;
  const alignmentScore = total > 0 ? referenced / total : 0;
  const contradictionScore = total > 0 ? contradicted / total : 0;

  return {
    decisions_referenced: referenced,
    decisions_ignored: ignored,
    decisions_contradicted: contradicted,
    alignment_score: Math.round(alignmentScore * 10000) / 10000,
    contradiction_score: Math.round(contradictionScore * 10000) / 10000,
  };
}

// ---------------------------------------------------------------------------
// Auto-learning: processOutcomeSignals
// ---------------------------------------------------------------------------

const outcomeCounters = new Map<string, number>();

async function processOutcomeSignals(agentId: string): Promise<void> {
  const db = getDb();

  const outcomes = await db.query<Record<string, unknown>>(
    `SELECT co.*, ch.decision_ids, ch.decision_scores
     FROM compile_outcomes co
     JOIN compile_history ch ON ch.id = co.compile_history_id
     WHERE co.agent_id = ?
     ORDER BY co.created_at DESC
     LIMIT 20`,
    [agentId],
  );

  if (outcomes.rows.length < 5) return;

  const syntheticRatings: Array<{ decision_id: string; rating: string }> = [];

  for (const row of outcomes.rows) {
    let decisionScores: Array<{ id: string; title: string }> = [];
    const rawScores = row.decision_scores;
    if (typeof rawScores === 'string') {
      try { decisionScores = JSON.parse(rawScores); } catch { /* skip */ }
    } else if (Array.isArray(rawScores)) {
      decisionScores = rawScores as Array<{ id: string; title: string }>;
    }

    const taskCompleted = row.task_completed;
    const alignmentScore = row.alignment_score as number | null;
    const referenced = row.decisions_referenced as number | null;
    const compiled = row.decisions_compiled as number | null;

    for (const d of decisionScores) {
      if (alignmentScore != null && alignmentScore > 0.7 && taskCompleted) {
        syntheticRatings.push({ decision_id: d.id, rating: 'useful' });
      } else if (referenced != null && compiled != null && referenced < compiled * 0.3) {
        syntheticRatings.push({ decision_id: d.id, rating: 'irrelevant' });
      }
    }
  }

  if (syntheticRatings.length === 0) return;

  try {
    await recordBatchFeedback(
      agentId,
      undefined,
      'auto-learning from outcome signals',
      syntheticRatings,
    );
    await computeAndApplyWeightUpdates(agentId);
    console.warn(`[hipp0:outcomes] Processed ${syntheticRatings.length} synthetic signals for agent ${agentId}`);
  } catch (err) {
    console.warn('[hipp0:outcomes] Auto-learning failed:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerOutcomeRoutes(app: Hono): void {
    // POST /api/outcomes — Report an outcome
  app.post('/api/outcomes', async (c) => {
    const db = getDb();
    const body = await c.req.json<{
      compile_request_id?: unknown;
      task_completed?: boolean;
      task_duration_ms?: number;
      agent_output?: string;
      error_occurred?: boolean;
      error_message?: string;
    }>();

    const compileRequestId = requireUUID(body.compile_request_id, 'compile_request_id');

    // Look up compile_history record
    const historyResult = await db.query<Record<string, unknown>>(
      `SELECT id, project_id, agent_id, agent_name, decision_ids, decision_scores, total_decisions
       FROM compile_history WHERE id = ?`,
      [compileRequestId],
    );

    if (historyResult.rows.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Compile request not found' } }, 404);
    }

    const history = historyResult.rows[0];
    const projectId = history.project_id as string;
    const agentId = history.agent_id as string;
    const totalDecisions = (history.total_decisions as number) ?? 0;

    // Parse decision scores
    let decisionScores: Array<{ id: string; title: string; combined_score?: number }> = [];
    const rawScores = history.decision_scores;
    if (typeof rawScores === 'string') {
      try { decisionScores = JSON.parse(rawScores); } catch { /* skip */ }
    } else if (Array.isArray(rawScores)) {
      decisionScores = rawScores as Array<{ id: string; title: string; combined_score?: number }>;
    }

    // Alignment analysis
    let alignment: AlignmentResult = {
      decisions_referenced: 0,
      decisions_ignored: 0,
      decisions_contradicted: 0,
      alignment_score: 0,
      contradiction_score: 0,
    };
    let outputHash: string | null = null;
    let outputLength: number | null = null;

    if (body.agent_output && decisionScores.length > 0) {
      alignment = analyzeAlignment(decisionScores, body.agent_output);
      outputHash = crypto.createHash('sha256').update(body.agent_output).digest('hex');
      outputLength = body.agent_output.length;
    }

    const outcomeId = randomUUID();
    const taskCompleted = body.task_completed ?? null;
    const errorOccurred = body.error_occurred ?? false;

    await db.query(
      `INSERT INTO compile_outcomes (
         id, compile_history_id, project_id, agent_id,
         task_completed, task_duration_ms,
         error_occurred, error_message,
         decisions_compiled, decisions_referenced,
         decisions_ignored, decisions_contradicted,
         alignment_score, contradiction_score,
         output_hash, output_length, metadata
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        outcomeId,
        compileRequestId,
        projectId,
        agentId,
        db.dialect === 'sqlite'
          ? (taskCompleted == null ? null : taskCompleted ? 1 : 0)
          : taskCompleted,
        body.task_duration_ms ?? null,
        db.dialect === 'sqlite' ? (errorOccurred ? 1 : 0) : errorOccurred,
        body.error_message ?? null,
        totalDecisions,
        alignment.decisions_referenced,
        alignment.decisions_ignored,
        alignment.decisions_contradicted,
        alignment.alignment_score,
        alignment.contradiction_score,
        outputHash,
        outputLength,
        JSON.stringify({}),
      ],
    );

    logAudit('outcome_reported', projectId, {
      outcome_id: outcomeId,
      compile_request_id: compileRequestId,
      agent_id: agentId,
      task_completed: taskCompleted,
      alignment_score: alignment.alignment_score,
    });

    // Wing affinity: boost for all contributing wings on successful outcome
    if (taskCompleted) {
      processWingOutcome(agentId, compileRequestId).catch(() => {});
    }

    // Check auto-learning trigger
    const count = (outcomeCounters.get(agentId) ?? 0) + 1;
    outcomeCounters.set(agentId, count);
    if (count >= 10) {
      outcomeCounters.set(agentId, 0);
      processOutcomeSignals(agentId).catch(() => {});
    }

    return c.json({
      id: outcomeId,
      compile_request_id: compileRequestId,
      project_id: projectId,
      agent_id: agentId,
      task_completed: taskCompleted,
      alignment_score: alignment.alignment_score,
      decisions_compiled: totalDecisions,
      decisions_referenced: alignment.decisions_referenced,
      decisions_ignored: alignment.decisions_ignored,
    }, 201);
  });

    // GET /api/agents/:id/outcomes — Outcome history
  app.get('/api/agents/:id/outcomes', async (c) => {
    const db = getDb();
    const agentId = requireUUID(c.req.param('id'), 'agentId');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200);

    const result = await db.query<Record<string, unknown>>(
      `SELECT * FROM compile_outcomes
       WHERE agent_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [agentId, limit],
    );

    return c.json(result.rows);
  });

    // GET /api/projects/:id/outcome-summary — Aggregated stats
  app.get('/api/projects/:id/outcome-summary', async (c) => {
    const db = getDb();
    const projectId = requireUUID(c.req.param('id'), 'projectId');

    // Overall stats
    const statsResult = await db.query<Record<string, unknown>>(
      `SELECT
         COUNT(*) as total_outcomes,
         AVG(alignment_score) as avg_alignment_score,
         AVG(CASE WHEN task_completed = ${db.dialect === 'sqlite' ? '1' : 'true'} THEN 1.0 ELSE 0.0 END) as avg_task_completion_rate,
         AVG(task_duration_ms) as avg_task_duration_ms
       FROM compile_outcomes
       WHERE project_id = ?`,
      [projectId],
    );

    const stats = statsResult.rows[0] ?? {};

    // Per-agent breakdown
    const agentResult = await db.query<Record<string, unknown>>(
      `SELECT
         co.agent_id,
         a.name as agent_name,
         COUNT(*) as total_outcomes,
         AVG(co.alignment_score) as avg_alignment_score,
         AVG(CASE WHEN co.task_completed = ${db.dialect === 'sqlite' ? '1' : 'true'} THEN 1.0 ELSE 0.0 END) as avg_task_completion_rate,
         AVG(co.task_duration_ms) as avg_task_duration_ms
       FROM compile_outcomes co
       LEFT JOIN agents a ON a.id = co.agent_id
       WHERE co.project_id = ?
       GROUP BY co.agent_id, a.name`,
      [projectId],
    );

    // Trend: last 7 days vs previous 7 days
    const recentResult = await db.query<Record<string, unknown>>(
      db.dialect === 'sqlite'
        ? `SELECT
             AVG(alignment_score) as avg_alignment,
             AVG(CASE WHEN task_completed = 1 THEN 1.0 ELSE 0.0 END) as avg_completion,
             COUNT(*) as count
           FROM compile_outcomes
           WHERE project_id = ? AND created_at >= datetime('now', '-7 days')`
        : `SELECT
             AVG(alignment_score) as avg_alignment,
             AVG(CASE WHEN task_completed = true THEN 1.0 ELSE 0.0 END) as avg_completion,
             COUNT(*) as count
           FROM compile_outcomes
           WHERE project_id = ? AND created_at >= NOW() - INTERVAL '7 days'`,
      [projectId],
    );

    const previousResult = await db.query<Record<string, unknown>>(
      db.dialect === 'sqlite'
        ? `SELECT
             AVG(alignment_score) as avg_alignment,
             AVG(CASE WHEN task_completed = 1 THEN 1.0 ELSE 0.0 END) as avg_completion,
             COUNT(*) as count
           FROM compile_outcomes
           WHERE project_id = ?
             AND created_at >= datetime('now', '-14 days')
             AND created_at < datetime('now', '-7 days')`
        : `SELECT
             AVG(alignment_score) as avg_alignment,
             AVG(CASE WHEN task_completed = true THEN 1.0 ELSE 0.0 END) as avg_completion,
             COUNT(*) as count
           FROM compile_outcomes
           WHERE project_id = ?
             AND created_at >= NOW() - INTERVAL '14 days'
             AND created_at < NOW() - INTERVAL '7 days'`,
      [projectId],
    );

    const recent = recentResult.rows[0] ?? {};
    const previous = previousResult.rows[0] ?? {};

    const recentAlignment = parseFloat(recent.avg_alignment as string) || 0;
    const previousAlignment = parseFloat(previous.avg_alignment as string) || 0;
    const recentCompletion = parseFloat(recent.avg_completion as string) || 0;
    const previousCompletion = parseFloat(previous.avg_completion as string) || 0;

    return c.json({
      total_outcomes: parseInt(stats.total_outcomes as string) || 0,
      avg_alignment_score: parseFloat(stats.avg_alignment_score as string) || 0,
      avg_task_completion_rate: parseFloat(stats.avg_task_completion_rate as string) || 0,
      avg_task_duration_ms: parseFloat(stats.avg_task_duration_ms as string) || 0,
      by_agent: agentResult.rows.map((row: Record<string, unknown>) => ({
        agent_id: row.agent_id,
        agent_name: row.agent_name ?? 'unknown',
        total_outcomes: parseInt(row.total_outcomes as string) || 0,
        avg_alignment_score: parseFloat(row.avg_alignment_score as string) || 0,
        avg_task_completion_rate: parseFloat(row.avg_task_completion_rate as string) || 0,
        avg_task_duration_ms: parseFloat(row.avg_task_duration_ms as string) || 0,
      })),
      trend: {
        period: '7d',
        alignment_delta: Math.round((recentAlignment - previousAlignment) * 10000) / 10000,
        completion_delta: Math.round((recentCompletion - previousCompletion) * 10000) / 10000,
        recent_count: parseInt(recent.count as string) || 0,
        previous_count: parseInt(previous.count as string) || 0,
      },
    });
  });
}
