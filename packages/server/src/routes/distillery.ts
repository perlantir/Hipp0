import type { Hono } from 'hono';
import { query } from '@nexus/core/db/pool.js';
import { parseDecision, parseSession } from '@nexus/core/db/parsers.js';
import { NexusError } from '@nexus/core/types.js';
import type { Decision } from '@nexus/core/types.js';
import {
  requireUUID,
  requireString,
  optionalString,
  mapDbError,
  logAudit,
  generateEmbedding,
} from './validation.js';

export function registerDistilleryRoutes(app: Hono): void {
  app.post('/api/projects/:id/distill', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    const body = await c.req.json<{
      conversation_text?: unknown;
      agent_name?: unknown;
      session_id?: unknown;
    }>();

    const conversation_text = requireString(body.conversation_text, 'conversation_text', 100000);

    const apiKey = process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new NexusError('No LLM API key configured', 'CONFIGURATION_ERROR', 503);
    }

    const prompt = `You are an expert at extracting architectural and technical decisions from conversations.

Extract all decisions from the following conversation text. For each decision, provide:
- title: short, action-oriented title
- description: what was decided
- reasoning: why this decision was made
- alternatives_considered: array of {option, rejected_reason}
- confidence: "high" | "medium" | "low"
- tags: relevant topic tags
- affects: affected components/systems
- assumptions: assumptions this decision relies on
- open_questions: unresolved questions
- dependencies: other decisions this depends on
- implicit: true if this is an implicit/implicit decision

Return a JSON object with a "decisions" array. Only return valid JSON.

CONVERSATION:
${conversation_text}`;

    type ExtractedDecision = {
      title: string;
      description: string;
      reasoning: string;
      alternatives_considered?: Array<{ option: string; rejected_reason: string }>;
      confidence?: string;
      tags?: string[];
      affects?: string[];
      assumptions?: string[];
      open_questions?: string[];
      dependencies?: string[];
    };

    let extractedDecisions: ExtractedDecision[] = [];

    try {
      if (process.env.OPENAI_API_KEY) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
          }),
        });
        const data = (await response.json()) as {
          choices: Array<{ message: { content: string } }>;
        };
        try {
          const parsed = JSON.parse(data.choices[0]?.message?.content ?? '{}') as {
            decisions?: ExtractedDecision[];
          };
          extractedDecisions = parsed.decisions ?? [];
        } catch {
          extractedDecisions = [];
        }
      } else if (process.env.ANTHROPIC_API_KEY) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const data = (await response.json()) as { content: Array<{ text: string }> };
        const text = data.content[0]?.text ?? '{}';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]) as { decisions?: ExtractedDecision[] };
            extractedDecisions = parsed.decisions ?? [];
          } catch {
            extractedDecisions = [];
          }
        }
      }
    } catch (err) {
      console.error('[nexus] Distill LLM error:', err);
      throw new NexusError('Failed to extract decisions from conversation', 'DISTILL_ERROR', 500);
    }

    const madeBy = optionalString(body.agent_name, 'agent_name', 200) ?? 'distiller';
    const session_id = body.session_id != null ? requireUUID(body.session_id, 'session_id') : null;
    const createdDecisions: Decision[] = [];

    for (const ed of extractedDecisions) {
      if (!ed.title || !ed.description || !ed.reasoning) continue;

      const embedding = await generateEmbedding(`${ed.title}\n${ed.description}\n${ed.reasoning}`);

      try {
        const result = await query(
          `INSERT INTO decisions (
             project_id, title, description, reasoning, made_by,
             source, source_session_id, confidence, status,
             alternatives_considered, affects, tags, assumptions,
             open_questions, dependencies, embedding
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING *`,
          [
            projectId,
            ed.title,
            ed.description,
            ed.reasoning,
            madeBy,
            'auto_distilled',
            session_id,
            ed.confidence ?? 'medium',
            'active',
            JSON.stringify(ed.alternatives_considered ?? []),
            ed.affects ?? [],
            ed.tags ?? [],
            JSON.stringify(ed.assumptions ?? []),
            JSON.stringify(ed.open_questions ?? []),
            JSON.stringify(ed.dependencies ?? []),
            embedding ? `[${embedding.join(',')}]` : null,
          ],
        );
        createdDecisions.push(parseDecision(result.rows[0] as Record<string, unknown>));
      } catch (err) {
        console.error('[nexus] Failed to persist distilled decision:', err);
      }
    }

    logAudit('distill_completed', projectId, {
      session_id,
      decisions_extracted: createdDecisions.length,
      agent_name: madeBy,
    });

    return c.json(
      {
        decisions_extracted: createdDecisions.length,
        contradictions_found: 0,
        decisions: createdDecisions,
      },
      201,
    );
  });

  app.post('/api/projects/:id/distill/session', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    const body = await c.req.json<{
      conversation_text?: unknown;
      agent_name?: unknown;
      session_id?: unknown;
      topic?: unknown;
    }>();

    requireString(body.conversation_text, 'conversation_text', 100000);
    const agent_name = requireString(body.agent_name, 'agent_name', 200);
    const topic = optionalString(body.topic, 'topic', 500);

    // Call the distill endpoint internally
    const distillResult = await fetch(`${c.req.url.replace('/session', '')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: c.req.header('Authorization') ?? '',
      },
      body: JSON.stringify({
        conversation_text: body.conversation_text,
        agent_name: body.agent_name,
        session_id: body.session_id,
      }),
    });
    const distilled = (await distillResult.json()) as {
      decisions_extracted: number;
      decisions: Decision[];
    };

    try {
      const summaryResult = await query(
        `INSERT INTO session_summaries (
           project_id, agent_name, topic, summary,
           decision_ids, extraction_model, extraction_confidence
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          projectId,
          agent_name,
          topic ?? 'Session',
          `Session with ${distilled.decisions_extracted} decisions extracted`,
          distilled.decisions.map((d) => d.id),
          'gpt-4o',
          0.8,
        ],
      );

      const session = parseSession(summaryResult.rows[0] as Record<string, unknown>);

      logAudit('distill_session_completed', projectId, {
        session_id: session.id,
        decisions_extracted: distilled.decisions_extracted,
        agent_name,
      });

      return c.json(
        {
          decisions_extracted: distilled.decisions_extracted,
          contradictions_found: 0,
          decisions: distilled.decisions,
          session_summary: session,
        },
        201,
      );
    } catch (err) {
      mapDbError(err);
    }
  });

  app.post('/api/projects/:id/sessions', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    const body = await c.req.json<{
      agent_name?: unknown;
      topic?: unknown;
      summary?: unknown;
      decision_ids?: string[];
      artifact_ids?: string[];
      assumptions?: string[];
      open_questions?: string[];
      lessons_learned?: string[];
      raw_conversation_hash?: unknown;
      extraction_model?: unknown;
      extraction_confidence?: number;
    }>();

    const agent_name = requireString(body.agent_name, 'agent_name', 200);
    const topic = requireString(body.topic, 'topic', 500);
    const summary = requireString(body.summary, 'summary', 10000);

    try {
      const result = await query(
        `INSERT INTO session_summaries (
           project_id, agent_name, topic, summary,
           decision_ids, artifact_ids, assumptions,
           open_questions, lessons_learned,
           raw_conversation_hash, extraction_model, extraction_confidence
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          projectId,
          agent_name,
          topic,
          summary,
          body.decision_ids ?? [],
          body.artifact_ids ?? [],
          body.assumptions ?? [],
          body.open_questions ?? [],
          body.lessons_learned ?? [],
          optionalString(body.raw_conversation_hash, 'raw_conversation_hash', 256) ?? null,
          optionalString(body.extraction_model, 'extraction_model', 100) ?? null,
          body.extraction_confidence ?? null,
        ],
      );
      return c.json(parseSession(result.rows[0] as Record<string, unknown>), 201);
    } catch (err) {
      mapDbError(err);
    }
  });

  app.get('/api/projects/:id/sessions', async (c) => {
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    const result = await query(
      'SELECT * FROM session_summaries WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId],
    );
    return c.json(result.rows.map((r) => parseSession(r as Record<string, unknown>)));
  });
}
