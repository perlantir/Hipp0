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
} from '@decigraph/core/memory/session-manager.js';

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
}
