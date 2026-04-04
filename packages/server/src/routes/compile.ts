import crypto from 'node:crypto';
import type { Hono } from 'hono';
import { getDb } from '@decigraph/core/db/index.js';
import {
  parseDecision,
  parseAgent,
  parseArtifact,
  parseSession,
  parseNotification,
} from '@decigraph/core/db/parsers.js';
import { NotFoundError } from '@decigraph/core/types.js';
import type { Decision, ScoredDecision } from '@decigraph/core/types.js';
import { scoreDecision } from '@decigraph/core/context-compiler/index.js';
import {
  requireUUID,
  requireString,
  logAudit,
  generateEmbedding,
  estimateTokens,
} from './validation.js';

const TOKENS_PER_DECISION = 300;

export function registerCompileRoutes(app: Hono): void {
  app.post('/api/compile', async (c) => {
    const db = getDb();
    const startTime = Date.now();
    const body = await c.req.json<{
      agent_name?: unknown;
      project_id?: unknown;
      task_description?: unknown;
      max_tokens?: number;
      include_superseded?: boolean;
      session_lookback_days?: number;
    }>();

    const agent_name = requireString(body.agent_name, 'agent_name', 200);
    const project_id = requireUUID(body.project_id, 'project_id');
    const task_description = requireString(body.task_description, 'task_description', 100000);

    const maxTokens = body.max_tokens ?? 50000;
    const includeSuperseeded = body.include_superseded ?? false;

    // ── Fetch agent (parsed) ──────────────────────────────────────────
    const agentResult = await db.query(
      'SELECT * FROM agents WHERE project_id = ? AND name = ? LIMIT 1',
      [project_id, agent_name],
    );
    if (agentResult.rows.length === 0) {
      throw new NotFoundError('Agent', agent_name);
    }
    const agent = agentResult.rows[0] as Record<string, unknown>;
    const agentId = agent.id as string;
    const agentParsed = parseAgent(agent);

    // ── Fetch notifications ───────────────────────────────────────────
    const notifResult = await db.query(
      `SELECT * FROM notifications
       WHERE agent_id = ? AND read_at IS NULL
       ORDER BY created_at DESC
       LIMIT 20`,
      [agentId],
    );
    const notifications = notifResult.rows.map((r) =>
      parseNotification(r as Record<string, unknown>),
    );

    // ── Fetch recent sessions ─────────────────────────────────────────
    const lookbackDays = body.session_lookback_days ?? 30;
    const sessionResult = await db.query(
      `SELECT * FROM session_summaries
       WHERE project_id = ?
         AND agent_name = ?
         AND created_at > NOW() - INTERVAL '1 day' * ?
       ORDER BY created_at DESC
       LIMIT 5`,
      [project_id, agent_name, lookbackDays],
    );
    const recentSessions = sessionResult.rows.map((r) =>
      parseSession(r as Record<string, unknown>),
    );

    // ── Generate task embedding ───────────────────────────────────────
    const taskEmbedding = await generateEmbedding(task_description);

    // ── Fetch all decisions ───────────────────────────────────────────
    let decisions: Decision[] = [];
    let decisionsConsidered = 0;

    if (taskEmbedding) {
      const statusFilter = includeSuperseeded
        ? "status IN ('active', 'superseded', 'pending')"
        : "status = 'active'";

      const decResult = await db.query(
        `SELECT *, 1 - (embedding <=> ?) as similarity
         FROM decisions
         WHERE project_id = ? AND ${statusFilter} AND embedding IS NOT NULL
         ORDER BY embedding <=> ?
         LIMIT 200`,
        [`[${taskEmbedding.join(',')}]`, project_id, `[${taskEmbedding.join(',')}]`],
      );
      decisionsConsidered = decResult.rows.length;
      decisions = decResult.rows.map((r) => parseDecision(r as Record<string, unknown>));
    } else {
      const statusFilter = includeSuperseeded ? '' : "AND status = 'active'";
      const decResult = await db.query(
        `SELECT * FROM decisions
         WHERE project_id = ? ${statusFilter}
         ORDER BY created_at DESC
         LIMIT 100`,
        [project_id],
      );
      decisionsConsidered = decResult.rows.length;
      decisions = decResult.rows.map((r) => parseDecision(r as Record<string, unknown>));
    }

    // ── Score each decision using the 5-signal algorithm ──────────────
    const taskEmb = taskEmbedding ?? [];
    const scored: ScoredDecision[] = decisions.map((d) =>
      scoreDecision(d, agentParsed, taskEmb),
    );

    // Sort by combined score (highest first)
    scored.sort((a, b) => b.combined_score - a.combined_score);

    // ── Apply token budget ────────────────────────────────────────────
    let tokenCount = 0;
    const reservedTokens = estimateTokens(task_description) + 500;
    const includedDecisions: ScoredDecision[] = [];

    for (const sd of scored) {
      const dTokens =
        estimateTokens(`${sd.title} ${sd.description} ${sd.reasoning}`) + TOKENS_PER_DECISION;
      if (tokenCount + dTokens + reservedTokens > maxTokens) break;
      includedDecisions.push(sd);
      tokenCount += dTokens;
    }

    // ── Fetch artifacts ───────────────────────────────────────────────
    const artifactResult = await db.query(
      `SELECT * FROM artifacts WHERE project_id = ? ORDER BY created_at DESC LIMIT 20`,
      [project_id],
    );
    const artifacts = artifactResult.rows.map((r) => parseArtifact(r as Record<string, unknown>));

    // ── Format markdown ───────────────────────────────────────────────
    const formattedMarkdown = [
      `# DeciGraph Context Package`,
      `**Agent:** ${agent_name}`,
      `**Task:** ${task_description}`,
      `**Compiled:** ${new Date().toISOString()}`,
      '',
      `## Relevant Decisions (${includedDecisions.length})`,
      ...includedDecisions.map((d, i) =>
        [
          `### ${i + 1}. ${d.title} (score: ${d.combined_score.toFixed(2)})`,
          `**Status:** ${d.status} | **Confidence:** ${d.confidence} | **Made by:** ${d.made_by}`,
          `**Description:** ${d.description}`,
          `**Reasoning:** ${d.reasoning}`,
          d.tags.length ? `**Tags:** ${d.tags.join(', ')}` : '',
          d.affects.length ? `**Affects:** ${d.affects.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
      '',
      `## Recent Sessions (${recentSessions.length})`,
      ...recentSessions.map((s) => `### ${s.topic}\n${s.summary}`),
      '',
      `## Unread Notifications (${notifications.length})`,
      ...notifications.map((n) => `- [${n.urgency.toUpperCase()}] ${n.message}`),
    ].join('\n');

    const compilationTimeMs = Date.now() - startTime;

    // ── Audit log ─────────────────────────────────────────────────────
    const taskHash = crypto.createHash('sha256').update(task_description).digest('hex');
    logAudit('compile_request', project_id, {
      agent_name,
      task_description_sha256: taskHash,
      decisions_included: includedDecisions.length,
      decisions_considered: decisionsConsidered,
      compilation_time_ms: compilationTimeMs,
    });

    const compileRequestId = crypto.randomUUID();
    const contextHash = crypto.createHash('sha256').update(formattedMarkdown).digest('hex');

    // ── Record compile history ────────────────────────────────────────
    try {
      await db.query(
        `INSERT INTO compile_history
         (id, project_id, agent_id, agent_name, task_description,
          decision_ids, decision_scores, total_decisions,
          token_budget_used, context_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          compileRequestId,
          project_id,
          agentId,
          agent_name,
          task_description,
          db.arrayParam(includedDecisions.map((d) => d.id)),
          JSON.stringify(includedDecisions.map((d) => ({
            id: d.id,
            title: d.title,
            combined_score: d.combined_score,
          }))),
          includedDecisions.length,
          tokenCount,
          contextHash,
        ],
      );
    } catch (err) {
      console.warn('[decigraph:compile] History recording failed:', (err as Error).message);
    }

    // ── Debug info ────────────────────────────────────────────────────
    const debugFlag = (body as Record<string, unknown>).debug === true;
    const debugInfo = debugFlag ? {
      all_decisions_scored: scored.map((sd) => ({
        title: sd.title,
        combined_score: sd.combined_score,
        included: includedDecisions.some((inc) => inc.id === sd.id),
        excluded_reason: includedDecisions.some((inc) => inc.id === sd.id)
          ? undefined
          : 'below_budget_or_threshold',
        scoring_breakdown: sd.scoring_breakdown,
      })),
      token_budget: {
        total: maxTokens,
        used: tokenCount,
        remaining: maxTokens - tokenCount,
      },
      weights_used: agentParsed.relevance_profile.weights,
    } : undefined;

    // ── Response ──────────────────────────────────────────────────────
    return c.json({
      compile_request_id: compileRequestId,
      agent: { name: agent_name, role: agentParsed.role },
      task: task_description,
      compiled_at: new Date().toISOString(),
      token_count: tokenCount,
      budget_used_pct: Math.round((tokenCount / maxTokens) * 100),
      decisions: includedDecisions.map((sd) => ({
        ...sd,
        combined_score: sd.combined_score,
        scoring_breakdown: sd.scoring_breakdown,
      })),
      artifacts,
      notifications,
      recent_sessions: recentSessions,
      formatted_markdown: formattedMarkdown,
      formatted_json: JSON.stringify({ decisions: includedDecisions, artifacts, notifications }),
      decisions_considered: decisionsConsidered,
      decisions_included: includedDecisions.length,
      relevance_threshold_used: 0,
      compilation_time_ms: compilationTimeMs,
      feedback_hint: `Rate this context: POST /api/feedback/batch with compile_request_id=${compileRequestId}`,
      context_hash: contextHash,
      ...(debugInfo ? { debug: debugInfo } : {}),
    });
  });
}
