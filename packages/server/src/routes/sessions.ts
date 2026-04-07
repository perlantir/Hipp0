/**
 * Session Memory API routes — multi-step task sessions.
 */

import type { Hono } from 'hono';
import { requireUUID, requireString, optionalString, logAudit, mapDbError } from './validation.js';
import {
  startSession,
  recordStep,
  getSessionContext,
  getSessionState,
  updateSessionStatus,
  listProjectSessions,
} from '@hipp0/core/memory/session-manager.js';
import { scoreTeamForTask } from '@hipp0/core/intelligence/role-signals.js';
import { suggestNextAgent, generateSessionPlan } from '@hipp0/core/intelligence/orchestrator.js';
import { getDb } from '@hipp0/core/db/index.js';

export function registerSessionRoutes(app: Hono): void {
  // ── Start a new task session ────────────────────────────────────────
  app.post('/api/tasks/session/start', async (c) => {
    const body = await c.req.json<{
      project_id?: unknown;
      title?: unknown;
      description?: unknown;
    }>();

    const project_id = requireUUID(body.project_id, 'project_id');
    const title = requireString(body.title, 'title', 500);
    const description = optionalString(body.description, 'description', 5000);

    try {
      const result = await startSession({ project_id, title, description });

      logAudit('session_started', project_id, {
        session_id: result.session_id,
        title,
      });

      return c.json(result, 201);
    } catch (err) {
      mapDbError(err);
    }
  });

  // ── Record a step in a session ──────────────────────────────────────
  app.post('/api/tasks/session/:id/step', async (c) => {
    const sessionId = requireUUID(c.req.param('id'), 'session_id');
    const body = await c.req.json<{
      agent_name?: unknown;
      agent_role?: unknown;
      task_description?: unknown;
      output?: unknown;
      artifacts?: unknown[];
      duration_ms?: number;
      decisions_created?: string[];
      project_id?: unknown;
    }>();

    const agent_name = requireString(body.agent_name, 'agent_name', 200);
    const task_description = requireString(body.task_description, 'task_description', 100000);
    const output = requireString(body.output, 'output', 500000);
    const agent_role = optionalString(body.agent_role, 'agent_role', 200);

    // Get project_id from session if not provided
    let project_id: string;
    if (body.project_id) {
      project_id = requireUUID(body.project_id, 'project_id');
    } else {
      const state = await getSessionState(sessionId);
      project_id = state.session.project_id;
    }

    try {
      const result = await recordStep({
        session_id: sessionId,
        project_id,
        agent_name,
        agent_role,
        task_description,
        output,
        artifacts: body.artifacts,
        duration_ms: body.duration_ms,
        decisions_created: body.decisions_created,
      });

      logAudit('session_step_recorded', project_id, {
        session_id: sessionId,
        step_number: result.step_number,
        agent_name,
      });

      return c.json(result, 201);
    } catch (err) {
      mapDbError(err);
    }
  });

  // ── Get full session state ──────────────────────────────────────────
  app.get('/api/tasks/session/:id/state', async (c) => {
    const sessionId = requireUUID(c.req.param('id'), 'session_id');
    try {
      const state = await getSessionState(sessionId);
      return c.json(state);
    } catch (err) {
      if ((err as Error).message?.includes('not found')) {
        return c.json({ error: { code: 'NOT_FOUND', message: (err as Error).message } }, 404);
      }
      throw err;
    }
  });

  // ── Get session context for an agent ────────────────────────────────
  app.get('/api/tasks/session/:id/context/:agentName', async (c) => {
    const sessionId = requireUUID(c.req.param('id'), 'session_id');
    const agentName = c.req.param('agentName');
    const task = c.req.query('task') ?? '';

    // Get project_id from session
    const state = await getSessionState(sessionId);
    const ctx = await getSessionContext(sessionId, agentName, task, state.session.project_id);
    return c.json(ctx);
  });

  // ── Pause session ───────────────────────────────────────────────────
  app.post('/api/tasks/session/:id/pause', async (c) => {
    const sessionId = requireUUID(c.req.param('id'), 'session_id');
    const session = await updateSessionStatus(sessionId, 'paused');
    logAudit('session_paused', session.project_id, { session_id: sessionId });
    return c.json(session);
  });

  // ── Resume session ──────────────────────────────────────────────────
  app.post('/api/tasks/session/:id/resume', async (c) => {
    const sessionId = requireUUID(c.req.param('id'), 'session_id');
    const session = await updateSessionStatus(sessionId, 'active');
    logAudit('session_resumed', session.project_id, { session_id: sessionId });
    return c.json(session);
  });

  // ── Complete session ────────────────────────────────────────────────
  app.post('/api/tasks/session/:id/complete', async (c) => {
    const sessionId = requireUUID(c.req.param('id'), 'session_id');
    const session = await updateSessionStatus(sessionId, 'completed');
    logAudit('session_completed', session.project_id, { session_id: sessionId });
    return c.json(session);
  });

  // ── List sessions for a project ─────────────────────────────────────
  app.get('/api/projects/:id/sessions-live', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'project_id');
    const status = c.req.query('status') ?? undefined;
    const sessions = await listProjectSessions(projectId, status);
    return c.json(sessions);
  });

  // ── Suggest next agent (Super Brain Phase 3) ───────────────────────
  app.post('/api/tasks/session/:id/suggest-next', async (c) => {
    const sessionId = requireUUID(c.req.param('id'), 'session_id');

    // Get project_id from session
    const state = await getSessionState(sessionId);
    const projectId = state.session.project_id;

    try {
      const suggestion = await suggestNextAgent(sessionId, projectId);

      logAudit('orchestrator_suggest', projectId, {
        session_id: sessionId,
        recommended_agent: suggestion.recommended_agent,
        confidence: suggestion.confidence,
        is_session_complete: suggestion.is_session_complete,
      });

      return c.json(suggestion);
    } catch (err) {
      if ((err as Error).message?.includes('not found')) {
        return c.json({ error: { code: 'NOT_FOUND', message: (err as Error).message } }, 404);
      }
      mapDbError(err);
    }
  });

  // ── Generate session plan (Super Brain Phase 3) ────────────────────
  app.post('/api/tasks/session/:id/plan', async (c) => {
    const sessionId = requireUUID(c.req.param('id'), 'session_id');

    const state = await getSessionState(sessionId);
    const projectId = state.session.project_id;

    try {
      const plan = await generateSessionPlan(sessionId, projectId);

      logAudit('orchestrator_plan', projectId, {
        session_id: sessionId,
        estimated_agents: plan.estimated_agents,
      });

      return c.json(plan);
    } catch (err) {
      if ((err as Error).message?.includes('not found')) {
        return c.json({ error: { code: 'NOT_FOUND', message: (err as Error).message } }, 404);
      }
      mapDbError(err);
    }
  });

  // ── Accept/override suggestion (Super Brain Phase 3) ───────────────
  app.post('/api/tasks/session/:id/accept-suggestion', async (c) => {
    const sessionId = requireUUID(c.req.param('id'), 'session_id');
    const body = await c.req.json<{
      accepted_agent?: unknown;
      override?: unknown;
      override_reason?: unknown;
    }>();

    const acceptedAgent = requireString(body.accepted_agent, 'accepted_agent', 200);
    const isOverride = body.override === true;
    const overrideReason = isOverride
      ? optionalString(body.override_reason, 'override_reason', 5000)
      : undefined;

    const state = await getSessionState(sessionId);
    const projectId = state.session.project_id;

    // Get the current suggestion to record what was suggested
    let suggestedAgent = acceptedAgent;
    let confidence: number | null = null;
    try {
      const suggestion = await suggestNextAgent(sessionId, projectId);
      suggestedAgent = suggestion.recommended_agent || acceptedAgent;
      confidence = suggestion.confidence;
    } catch {
      // Non-fatal — record anyway
    }

    const db = getDb();
    try {
      await db.query(
        `INSERT INTO orchestration_decisions
           (session_id, step_number, suggested_agent, actual_agent, was_override, override_reason, suggestion_confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          state.session.current_step + 1,
          suggestedAgent,
          acceptedAgent,
          isOverride,
          overrideReason ?? null,
          confidence,
        ],
      );

      logAudit('orchestrator_accept', projectId, {
        session_id: sessionId,
        accepted_agent: acceptedAgent,
        was_override: isOverride,
      });

      return c.json({
        accepted: true,
        agent: acceptedAgent,
        was_override: isOverride,
      }, 201);
    } catch (err) {
      mapDbError(err);
    }
  });

  // ── Score team for a task (Super Brain Phase 2) ─────────────────────
  app.post('/api/projects/:id/team-score', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'project_id');
    const body = await c.req.json<{
      task_description?: unknown;
      session_id?: unknown;
    }>();

    const taskDescription = requireString(body.task_description, 'task_description', 100000);
    const sessionId = body.session_id ? requireUUID(body.session_id, 'session_id') : undefined;

    try {
      const result = await scoreTeamForTask(projectId, taskDescription, sessionId);

      logAudit('team_score', projectId, {
        task_description_length: taskDescription.length,
        recommended_participants: result.recommended_participants.length,
        recommended_skip: result.recommended_skip.length,
        optimal_team_size: result.optimal_team_size,
      });

      return c.json(result);
    } catch (err) {
      mapDbError(err);
    }
  });
}
