/**
 * Compile Route — delegates to core compileContext() for all scoring,
 * sorting, and formatting. The route only handles HTTP concerns:
 * request parsing, audit logging, compile history recording, and
 * the debug mode overlay.
 */

import crypto from 'node:crypto';
import type { Hono } from 'hono';
import { getDb } from '@decigraph/core/db/index.js';
import { compileContext } from '@decigraph/core/context-compiler/index.js';
import type { CompileRequest } from '@decigraph/core/types.js';
import { requireUUID, requireString, logAudit } from './validation.js';
import { broadcast } from '../websocket.js';
import { cache, compileKey, CACHE_TTL } from '../cache/redis.js';

export function registerCompileRoutes(app: Hono): void {
  app.post('/api/compile', async (c) => {
    const db = getDb();
    const body = await c.req.json<{
      agent_name?: unknown;
      project_id?: unknown;
      task_description?: unknown;
      max_tokens?: number;
      include_superseded?: boolean;
      session_lookback_days?: number;
      debug?: boolean;
    }>();

    const agent_name = requireString(body.agent_name, 'agent_name', 200);
    const project_id = requireUUID(body.project_id, 'project_id');
    const task_description = requireString(body.task_description, 'task_description', 100000);

    // ── Check cache first ───────────────────────────────────────────
    const taskHash = crypto.createHash('sha256').update(task_description).digest('hex');
    const cacheHit = await cache.get(compileKey(project_id, agent_name, taskHash));
    if (cacheHit && body.debug !== true) {
      try {
        const cached = JSON.parse(cacheHit);
        return c.json({ ...cached, cache_hit: true });
      } catch {
        // Invalid cache entry, proceed with fresh compile
      }
    }

    // ── Delegate to core compileContext() ────────────────────────────
    // This uses the full 5-signal scoring pipeline: freshness weighting,
    // confidence decay, graph expansion, score blending, context caching,
    // and markdown + JSON formatting.
    const request: CompileRequest = {
      agent_name,
      project_id,
      task_description,
      max_tokens: body.max_tokens,
      include_superseded: body.include_superseded,
      session_lookback_days: body.session_lookback_days,
    };

    const result = await compileContext(request);

    // ── Server-only concerns: audit + history ────────────────────────
    const compileRequestId = crypto.randomUUID();
    const contextHash = crypto.createHash('sha256')
      .update(result.formatted_markdown)
      .digest('hex');

    // Privacy: store hash by default, raw text only if DECIGRAPH_STORE_RAW_TASKS=true
    const storeRawTasks = process.env.DECIGRAPH_STORE_RAW_TASKS === 'true';
    const taskForStorage = storeRawTasks
      ? task_description
      : crypto.createHash('sha256').update(task_description).digest('hex');

    // Audit log (always uses hash — taskHash computed above for cache key)
    logAudit('compile_request', project_id, {
      agent_name,
      task_description_sha256: taskHash,
      decisions_included: result.decisions_included,
      decisions_considered: result.decisions_considered,
      compilation_time_ms: result.compilation_time_ms,
    });

    // Record compile history
    const agentResult = await db.query(
      'SELECT id FROM agents WHERE project_id = ? AND name = ? LIMIT 1',
      [project_id, agent_name],
    );
    const agentId = agentResult.rows.length > 0
      ? (agentResult.rows[0] as Record<string, unknown>).id as string
      : 'unknown';

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
          taskForStorage,
          db.arrayParam(result.decisions.map((d) => d.id)),
          JSON.stringify(result.decisions.map((d) => ({
            id: d.id,
            title: d.title,
            combined_score: d.combined_score,
          }))),
          result.decisions_included,
          result.token_count,
          contextHash,
        ],
      );
    } catch (err) {
      console.warn('[decigraph:compile] History recording failed:', (err as Error).message);
    }

    // ── Debug info (optional) ────────────────────────────────────────
    const debugInfo = body.debug === true ? {
      scoring_pipeline: 'core/context-compiler compileContext()',
      signals: ['direct_affect', 'tag_matching', 'role_relevance', 'semantic_similarity', 'status_penalty'],
      task_hash: taskHash,
      raw_tasks_stored: storeRawTasks,
    } : undefined;

    // ── Broadcast compile completion ──────────────────────────────────
    broadcast('compile_completed', {
      compile_request_id: compileRequestId,
      project_id,
      agent_name,
      decisions_included: result.decisions_included,
    });

    // ── Governance: policy overlay ──────────────────────────────────
    let policyNotices: Array<Record<string, unknown>> = [];
    let policySummary: Record<string, unknown> | undefined;
    let policyMarkdown = '';

    try {
      const activePolicies = await db.query(
        `SELECT dp.*, d.title AS decision_title
         FROM decision_policies dp
         JOIN decisions d ON dp.decision_id = d.id
         WHERE dp.project_id = ? AND dp.active = ?
           AND (dp.expires_at IS NULL OR dp.expires_at > ?)`,
        [project_id, true, new Date().toISOString()],
      );

      if (activePolicies.rows.length > 0) {
        const blockPolicies: Array<{ title: string; approved_by: string }> = [];
        const warnPolicies: Array<{ title: string; approved_by: string }> = [];
        const advisoryPolicies: Array<{ title: string }> = [];
        const compiledIds = (result.decisions ?? []).map((d: { id?: string }) => d.id);

        for (const row of activePolicies.rows) {
          const p = row as Record<string, unknown>;
          const enforcement = p.enforcement as string;
          const title = p.decision_title as string;
          const approvedBy = p.approved_by as string;

          // Check applies_to scoping
          let appliesTo: string[] = [];
          if (Array.isArray(p.applies_to)) appliesTo = p.applies_to as string[];
          else if (typeof p.applies_to === 'string') {
            try { appliesTo = JSON.parse(p.applies_to as string); } catch { appliesTo = []; }
          }
          if (appliesTo.length > 0 && !appliesTo.includes(agent_name)) continue;

          const msg = enforcement === 'block'
            ? `POLICY REQUIREMENT: You MUST comply with "${title}". This is an approved, enforced policy.`
            : enforcement === 'warn'
              ? `POLICY ADVISORY: "${title}" is an approved decision. Consider compliance carefully.`
              : `Policy note: "${title}" is an approved decision.`;

          policyNotices.push({
            decision_id: p.decision_id,
            decision_title: title,
            enforcement,
            category: p.category,
            approved_by: approvedBy,
            message: msg,
          });

          if (enforcement === 'block') blockPolicies.push({ title, approved_by: approvedBy });
          else if (enforcement === 'warn') warnPolicies.push({ title, approved_by: approvedBy });
          else advisoryPolicies.push({ title });
        }

        policySummary = {
          block_policies: blockPolicies,
          warn_policies: warnPolicies,
          advisory_policies: advisoryPolicies,
          total_enforced: blockPolicies.length + warnPolicies.length,
        };

        // Build markdown section for enforced policies
        const enforced = policyNotices.filter((n) => n.enforcement !== 'advisory');
        if (enforced.length > 0) {
          const lines = enforced.map((n) => `- ${n.message}`).join('\n');
          policyMarkdown = `## Active Policies (${enforced.length} enforced)\n${lines}\n\n---\n\n`;
        }
      }
    } catch (err) {
      console.warn('[decigraph:compile] Policy overlay failed:', (err as Error).message);
    }

    // Prepend policy markdown to formatted output
    const formattedMarkdown = policyMarkdown
      ? policyMarkdown + (result.formatted_markdown ?? '')
      : result.formatted_markdown;

    // ── Cache the result ──────────────────────────────────────────────
    const responsePayload = {
      compile_request_id: compileRequestId,
      ...result,
      formatted_markdown: formattedMarkdown,
      context_hash: contextHash,
      feedback_hint: `Rate this context: POST /api/feedback/batch with compile_request_id=${compileRequestId}`,
      outcome_hint: `Report task results: POST /api/outcomes with compile_request_id=${compileRequestId}`,
      ...(policyNotices.length > 0 ? { policy_notices: policyNotices } : {}),
      ...(policySummary ? { policy_summary: policySummary } : {}),

      ...(debugInfo ? { debug: debugInfo } : {}),
    };

    if (!debugInfo) {
      cache.set(
        compileKey(project_id, agent_name, taskHash),
        JSON.stringify(responsePayload),
        CACHE_TTL.COMPILE,
      ).catch(() => {});
    }

    // ── Response ─────────────────────────────────────────────────────
    console.log("[decigraph/compile-response]", { agent: agent_name, resultDecisions: (result.decisions ?? []).length, decisionsIncluded: result.decisions_included });
    return c.json(responsePayload);

  });
}
