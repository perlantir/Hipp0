import type { Hono } from 'hono';
import { query } from '@nexus/core/db/pool.js';
import { parseFeedback } from '@nexus/core/db/parsers.js';
import { ValidationError } from '@nexus/core/types.js';
import { requireUUID, optionalString, mapDbError } from './validation.js';

export function registerFeedbackRoutes(app: Hono): void {
  app.post('/api/feedback', async (c) => {
    const body = await c.req.json<{
      agent_id?: unknown;
      decision_id?: unknown;
      compile_request_id?: unknown;
      was_useful?: boolean;
      usage_signal?: unknown;
    }>();

    const agent_id = requireUUID(body.agent_id, 'agent_id');
    const decision_id = requireUUID(body.decision_id, 'decision_id');
    if (body.was_useful === undefined) throw new ValidationError('was_useful is required');

    const compile_request_id =
      body.compile_request_id != null
        ? requireUUID(body.compile_request_id, 'compile_request_id')
        : null;

    try {
      const result = await query(
        `INSERT INTO relevance_feedback (agent_id, decision_id, compile_request_id, was_useful, usage_signal)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          agent_id,
          decision_id,
          compile_request_id,
          body.was_useful,
          optionalString(body.usage_signal, 'usage_signal', 100) ?? null,
        ],
      );
      return c.json(parseFeedback(result.rows[0] as Record<string, unknown>), 201);
    } catch (err) {
      mapDbError(err);
    }
  });
}
