/**
 * Passive Decision Capture routes — auto-extract decisions from agent conversations.
 *
 * POST /api/capture — submit a conversation for background extraction
 * GET  /api/capture/:id — check capture status
 * GET  /api/projects/:id/captures — list captures for a project
 */

import type { Hono } from 'hono';
import { requireUUID, requireString, optionalString, logAudit, mapDbError } from './validation.js';
import { getDb } from '@hipp0/core/db/index.js';
import { distill } from '@hipp0/core/distillery/index.js';
import { withSpan, getMetrics, recordHistogram } from '../telemetry.js';
import { dispatchWebhooks } from '@hipp0/core/webhooks/index.js';
import { runCaptureDedup } from '@hipp0/core/intelligence/capture-dedup.js';
import { defaultProvenance, computeTrust } from '@hipp0/core/intelligence/trust-scorer.js';
import { safeEmit } from '../events/event-stream.js';

export function registerCaptureRoutes(app: Hono): void {
    // POST /api/capture — Submit conversation for background extraction
  app.post('/api/capture', async (c) => {
    const body = await c.req.json<{
      agent_name?: unknown;
      project_id?: unknown;
      conversation?: unknown;
      content?: unknown;
      text?: unknown;
      session_id?: unknown;
      source?: unknown;
      source_event_id?: unknown;
      source_channel?: unknown;
    }>();

    const agent_name = requireString(body.agent_name, 'agent_name', 200);
    const project_id = requireUUID(body.project_id, 'project_id');
    // Accept content/text as aliases for conversation
    const rawConversation = body.conversation ?? body.content ?? body.text;
    const conversation = requireString(rawConversation, 'conversation', 500000);
    const session_id = body.session_id ? requireUUID(body.session_id, 'session_id') : null;
    const source = optionalString(body.source, 'source', 50) ?? 'api';

    const source_event_id = optionalString(body.source_event_id, 'source_event_id', 500) ?? null;
    const source_channel = optionalString(body.source_channel, 'source_channel', 200) ?? null;

    const validSources = ['openclaw', 'telegram', 'slack', 'discord', 'github', 'api', 'cli', 'web', 'vscode', 'jetbrains', 'test', 'manual', 'hermes'];
    if (!validSources.includes(source)) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: `source must be one of: ${validSources.join(', ')}` } }, 400);
    }

    const db = getDb();

    // Verify project exists and check settings in one query
    const projResult = await db.query('SELECT id, metadata FROM projects WHERE id = ?', [project_id]);
    if (projResult.rows.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
    }

    // Check auto_capture setting
    let metadata: Record<string, unknown> = {};
    const raw = (projResult.rows[0] as Record<string, unknown>).metadata;
    if (typeof raw === 'string') {
      try { metadata = JSON.parse(raw); } catch { /* empty */ }
    } else if (typeof raw === 'object' && raw !== null) {
      metadata = raw as Record<string, unknown>;
    }

    // auto_capture defaults to false; warn but don't block
    if (metadata.auto_capture === false) {
      console.warn(`[hipp0:capture] auto_capture is disabled for project ${project_id}, processing anyway (explicit API call)`);
    }

    // Dedup check — block exact duplicates
    const dedupResult = await runCaptureDedup(project_id, conversation);
    if (dedupResult.dedup_action === 'blocked_exact_dup') {
      return c.json({
        capture_id: dedupResult.exact_duplicate_id,
        status: 'duplicate',
        dedup_hash: dedupResult.dedup_hash,
        message: 'Exact duplicate capture detected within 24h window',
      }, 200);
    }

    // Insert capture record
    let captureId: string;
    try {
      const insertResult = await db.query(
        `INSERT INTO captures (project_id, agent_name, session_id, source, conversation_text, status, dedup_hash, dedup_result, source_event_id, source_channel)
         VALUES (?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?)
         RETURNING id`,
        [project_id, agent_name, session_id, source, conversation, dedupResult.dedup_hash, JSON.stringify(dedupResult), source_event_id, source_channel],
      );

      captureId = (insertResult.rows[0] as Record<string, unknown>).id as string;
    } catch (err) {
      mapDbError(err);
      return; // TypeScript flow - mapDbError always throws
    }

    logAudit('capture_started', project_id, {
      capture_id: captureId,
      agent_name,
      source,
      session_id,
    });

    safeEmit('capture.started', project_id, {
      capture_id: captureId,
      agent_name,
      source,
      session_id,
    });

    // Return immediately — extraction runs in the background.
    //
    // Retry-After signals the recommended initial poll cadence for the
    // status endpoint (GET /api/capture/:id). The distillery pipeline
    // typically finishes in 1-10 seconds; clients should poll at this
    // interval with exponential backoff (cap ~5s) until status is
    // 'completed' or 'failed'. Documented here instead of in a separate
    // doc so the contract travels with the response.
    c.header('Retry-After', '1');
    const response = c.json({ capture_id: captureId, status: 'processing' }, 202);

    // Fire-and-forget background extraction
    void runCaptureExtraction(captureId, project_id, conversation, agent_name, session_id, source);

    return response;
  });

    // GET /api/capture/:id — Check capture status
  app.get('/api/capture/:id', async (c) => {
    const captureId = requireUUID(c.req.param('id'), 'capture_id');
    const projectId = c.req.query('project_id');
    const db = getDb();

    let sql = 'SELECT id, project_id, agent_name, session_id, source, status, extracted_decision_ids, error_message, created_at, completed_at FROM captures WHERE id = ?';
    const params: unknown[] = [captureId];
    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }

    const result = await db.query(sql, params);

    if (result.rows.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Capture not found' } }, 404);
    }

    const row = result.rows[0] as Record<string, unknown>;
    let decisionIds: string[] = [];
    const rawIds = row.extracted_decision_ids;
    if (typeof rawIds === 'string') {
      try { decisionIds = JSON.parse(rawIds); } catch { /* empty */ }
    } else if (Array.isArray(rawIds)) {
      decisionIds = rawIds as string[];
    }

    return c.json({
      id: row.id,
      status: row.status,
      extracted_decision_count: decisionIds.length,
      extracted_decision_ids: decisionIds,
      error_message: row.error_message ?? null,
      created_at: row.created_at,
      completed_at: row.completed_at ?? null,
    });
  });

    // GET /api/projects/:id/captures — List captures for a project
  app.get('/api/projects/:id/captures', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'project_id');
    const db = getDb();
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    const result = await db.query(
      `SELECT id, project_id, agent_name, session_id, source, status, extracted_decision_ids, error_message, created_at, completed_at
       FROM captures
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [projectId, limit, offset],
    );

    const captures = result.rows.map((row) => {
      const r = row as Record<string, unknown>;
      let decisionIds: string[] = [];
      const rawIds = r.extracted_decision_ids;
      if (typeof rawIds === 'string') {
        try { decisionIds = JSON.parse(rawIds); } catch { /* empty */ }
      } else if (Array.isArray(rawIds)) {
        decisionIds = rawIds as string[];
      }

      return {
        id: r.id,
        project_id: r.project_id,
        agent_name: r.agent_name,
        session_id: r.session_id ?? null,
        source: r.source,
        status: r.status,
        extracted_decision_count: decisionIds.length,
        extracted_decision_ids: decisionIds,
        error_message: r.error_message ?? null,
        created_at: r.created_at,
        completed_at: r.completed_at ?? null,
      };
    });

    return c.json(captures);
  });
}

/**
 * Background extraction — runs the distillery pipeline and updates the capture record.
 */
async function runCaptureExtraction(
  captureId: string,
  projectId: string,
  conversation: string,
  agentName: string,
  sessionId: string | null,
  source: string,
): Promise<void> {
  const db = getDb();
  const __captureStart = Date.now();
  let __captureSuccess = true;

  try {
    // Run the distillery pipeline — traced under the distill_conversation span.
    const result = await withSpan('distill_conversation', {
      project_id: projectId,
      agent_name: agentName,
      source,
    }, async () => distill(projectId, conversation, agentName, sessionId ?? undefined));

    // Mark extracted decisions with appropriate source and flag for review
    // SQLite's original CHECK constraint only allows 'manual', 'auto_distilled', 'imported'
    // so we use 'auto_distilled' on SQLite and record the real origin in provenance_chain
    const captureSource = db.dialect === 'sqlite' ? 'auto_distilled' : 'auto_capture';
    const decisionIds = result.decisions.map((d) => d.id);
    for (const id of decisionIds) {
      await db.query(
        `UPDATE decisions SET source = ?, confidence = 'low', review_status = 'pending_review', status = 'pending'
         WHERE id = ?`,
        [captureSource, id],
      ).catch((err) => {
        console.warn(`[hipp0:capture] Could not update source for decision ${id}:`, (err as Error).message);
      });
    }

    // Assign provenance chain from Phase 2 for passive captures
    for (const id of decisionIds) {
      const provenance = [defaultProvenance('auto_capture', agentName)];
      provenance[0].source_label = `Captured from ${agentName} via ${source}`;
      const { trust_score } = computeTrust({
        source: 'auto_capture',
        confidence: 'low',
        created_at: new Date().toISOString(),
        provenance_chain: provenance,
      } as Parameters<typeof computeTrust>[0]);
      await db.query(
        `UPDATE decisions SET provenance_chain = ?, trust_score = ? WHERE id = ? AND (provenance_chain IS NULL OR provenance_chain = '[]')`,
        [JSON.stringify(provenance), trust_score, id],
      ).catch(() => {});
    }

    // Update capture record
    await db.query(
      `UPDATE captures SET status = 'completed', extracted_decision_ids = ?, completed_at = ?
       WHERE id = ?`,
      [db.arrayParam(decisionIds), new Date().toISOString(), captureId],
    );

    logAudit('capture_completed', projectId, {
      capture_id: captureId,
      decisions_extracted: decisionIds.length,
      agent_name: agentName,
    });

    safeEmit('capture.completed', projectId, {
      capture_id: captureId,
      decisions_extracted: decisionIds.length,
      decision_ids: decisionIds,
      agent_name: agentName,
      source,
    });

    // Dispatch webhook
    dispatchWebhooks(projectId, 'capture_completed', {
      capture_id: captureId,
      decisions_extracted: decisionIds.length,
      decision_ids: decisionIds,
      agent_name: agentName,
    }).catch((err) => console.warn('[hipp0:webhook]', (err as Error).message));

  } catch (err) {
    __captureSuccess = false;
    const errorMsg = (err as Error).message ?? 'Unknown extraction error';
    console.error(`[hipp0:capture] Extraction failed for capture ${captureId}:`, errorMsg);

    await db.query(
      `UPDATE captures SET status = 'failed', error_message = ?, completed_at = ?
       WHERE id = ?`,
      [errorMsg.slice(0, 2000), new Date().toISOString(), captureId],
    ).catch((updateErr) => {
      console.error(`[hipp0:capture] Failed to update capture status:`, (updateErr as Error).message);
    });

    logAudit('capture_failed', projectId, {
      capture_id: captureId,
      error: errorMsg,
    });
  } finally {
    try {
      const __m = getMetrics();
      recordHistogram(__m.captureDuration, Date.now() - __captureStart, {
        project_id: projectId,
        agent_name: agentName,
        source,
        success: __captureSuccess,
      });
    } catch { /* ignore */ }
  }
}
