import type { Hono } from 'hono';
import { getDb } from '@nexus/core/db/index.js';
import { parseDecision, parseEdge } from '@nexus/core/db/parsers.js';
import { NotFoundError, ValidationError } from '@nexus/core/types.js';
import type { Decision, DecisionEdge, NotificationType } from '@nexus/core/types.js';
import { propagateChange } from '@nexus/core/change-propagator/index.js';
import { checkForContradictions } from '@nexus/core/contradiction-detector/index.js';
import {
  requireUUID,
  requireString,
  optionalString,
  validateTags,
  validateAffects,
  validateAlternatives,
  mapDbError,
  logAudit,
  generateEmbedding,
} from './validation.js';

export function registerDecisionRoutes(app: Hono): void {
  // Decisions — Create & List (project-scoped)

  app.post('/api/projects/:id/decisions', async (c) => {
    const db = getDb();
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    const body = await c.req.json<{
      title?: unknown;
      description?: unknown;
      reasoning?: unknown;
      made_by?: unknown;
      source?: unknown;
      source_session_id?: unknown;
      confidence?: unknown;
      status?: unknown;
      supersedes_id?: unknown;
      alternatives_considered?: unknown;
      affects?: unknown;
      tags?: unknown;
      assumptions?: unknown;
      open_questions?: unknown;
      dependencies?: unknown;
      confidence_decay_rate?: number;
      metadata?: Record<string, unknown>;
    }>();

    const title = requireString(body.title, 'title', 500);
    const description = requireString(body.description, 'description', 10000);
    const reasoning = requireString(body.reasoning, 'reasoning', 10000);
    const made_by = requireString(body.made_by, 'made_by', 200);
    const tags = validateTags(body.tags);
    const affects = validateAffects(body.affects);
    const alternatives_considered = validateAlternatives(body.alternatives_considered);

    const supersedes_id =
      body.supersedes_id != null ? requireUUID(body.supersedes_id, 'supersedes_id') : null;

    const embeddingText = `${title}\n${description}\n${reasoning}`;
    const embedding = await generateEmbedding(embeddingText);

    try {
      const result = await db.query(
        `INSERT INTO decisions (
           project_id, title, description, reasoning, made_by,
           source, source_session_id, confidence, status, supersedes_id,
           alternatives_considered, affects, tags, assumptions,
           open_questions, dependencies, confidence_decay_rate, metadata, embedding
         ) VALUES (
           ?, ?, ?, ?, ?,
           ?, ?, ?, ?, ?,
           ?, ?, ?, ?,
           ?, ?, ?, ?, ?
         ) RETURNING *`,
        [
          projectId,
          title,
          description,
          reasoning,
          made_by,
          body.source ?? 'manual',
          body.source_session_id ?? null,
          body.confidence ?? 'high',
          body.status ?? 'active',
          supersedes_id,
          JSON.stringify(alternatives_considered),
          db.arrayParam(affects),
          db.arrayParam(tags),
          JSON.stringify(body.assumptions ?? []),
          JSON.stringify(body.open_questions ?? []),
          JSON.stringify(body.dependencies ?? []),
          body.confidence_decay_rate ?? 0.0,
          JSON.stringify(body.metadata ?? {}),
          embedding ? `[${embedding.join(',')}]` : null,
        ],
      );

      const decision = parseDecision(result.rows[0] as Record<string, unknown>);

      logAudit('decision_created', projectId, {
        decision_id: decision.id,
        title: decision.title,
        made_by: decision.made_by,
      });

      propagateChange(decision, 'decision_created').catch((err) =>
        console.error('[nexus] Change propagation failed:', (err as Error).message),
      );

      checkForContradictions(decision).catch((err) =>
        console.error('[nexus] Contradiction check failed:', (err as Error).message),
      );

      return c.json(decision, 201);
    } catch (err) {
      mapDbError(err);
    }
  });

  app.get('/api/projects/:id/decisions', async (c) => {
    const db = getDb();
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    const status = c.req.query('status');
    const tagsParam = c.req.query('tags');
    const madeBy = c.req.query('made_by');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 500);
    const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10), 0);

    const tags = tagsParam ? tagsParam.split(',').map((t) => t.trim()) : null;

    const conditions: string[] = ['d.project_id = ?'];
    const params: unknown[] = [projectId];

    if (status) {
      conditions.push(`d.status = ?`);
      params.push(status);
    }
    if (tags && tags.length > 0) {
      conditions.push(`d.tags && ?`);
      params.push(db.arrayParam(tags));
    }
    if (madeBy) {
      conditions.push(`d.made_by = ?`);
      params.push(madeBy);
    }

    params.push(limit);
    params.push(offset);

    const result = await db.query(
      `SELECT * FROM decisions d
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.created_at DESC
       LIMIT ? OFFSET ?`,
      params,
    );

    return c.json(result.rows.map((r) => parseDecision(r as Record<string, unknown>)));
  });

  // Decisions — Single CRUD

  app.get('/api/decisions/:id', async (c) => {
    const db = getDb();
    const id = requireUUID(c.req.param('id'), 'id');
    const result = await db.query('SELECT * FROM decisions WHERE id = ?', [id]);
    if (result.rows.length === 0) throw new NotFoundError('Decision', id);
    return c.json(parseDecision(result.rows[0] as Record<string, unknown>));
  });

  app.patch('/api/decisions/:id', async (c) => {
    const db = getDb();
    const id = requireUUID(c.req.param('id'), 'id');
    const body = await c.req.json<
      Partial<{
        title: unknown;
        description: unknown;
        reasoning: unknown;
        made_by: unknown;
        confidence: unknown;
        status: unknown;
        affects: unknown;
        tags: unknown;
        assumptions: unknown[];
        open_questions: unknown[];
        dependencies: unknown[];
        alternatives_considered: unknown;
        confidence_decay_rate: number;
        metadata: Record<string, unknown>;
        validated_at: unknown;
        validation_source: unknown;
      }>
    >();

    const existing = await db.query('SELECT id FROM decisions WHERE id = ?', [id]);
    if (existing.rows.length === 0) throw new NotFoundError('Decision', id);

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];

    const addField = (col: string, val: unknown, asJson = false) => {
      setClauses.push(`${col} = ?`);
      params.push(asJson ? JSON.stringify(val) : val);
    };

    if (body.title !== undefined) addField('title', requireString(body.title, 'title', 500));
    if (body.description !== undefined)
      addField('description', requireString(body.description, 'description', 10000));
    if (body.reasoning !== undefined)
      addField('reasoning', requireString(body.reasoning, 'reasoning', 10000));
    if (body.made_by !== undefined)
      addField('made_by', requireString(body.made_by, 'made_by', 200));
    if (body.confidence !== undefined) addField('confidence', body.confidence);
    if (body.status !== undefined) addField('status', body.status);
    if (body.affects !== undefined) addField('affects', db.arrayParam(validateAffects(body.affects)));
    if (body.tags !== undefined) addField('tags', db.arrayParam(validateTags(body.tags)));
    if (body.assumptions !== undefined) addField('assumptions', body.assumptions, true);
    if (body.open_questions !== undefined) addField('open_questions', body.open_questions, true);
    if (body.dependencies !== undefined) addField('dependencies', body.dependencies, true);
    if (body.alternatives_considered !== undefined)
      addField('alternatives_considered', validateAlternatives(body.alternatives_considered), true);
    if (body.confidence_decay_rate !== undefined)
      addField('confidence_decay_rate', body.confidence_decay_rate);
    if (body.metadata !== undefined) addField('metadata', body.metadata, true);
    if (body.validated_at !== undefined) addField('validated_at', body.validated_at);
    if (body.validation_source !== undefined)
      addField(
        'validation_source',
        optionalString(body.validation_source, 'validation_source', 200),
      );

    params.push(id);

    const result = await db.query(
      `UPDATE decisions SET ${setClauses.join(', ')} WHERE id = ? RETURNING *`,
      params,
    );

    const decision = parseDecision(result.rows[0] as Record<string, unknown>);

    logAudit('decision_updated', decision.project_id, {
      decision_id: decision.id,
      fields_updated: Object.keys(body),
    });

    propagateChange(decision, 'decision_updated').catch((err) =>
      console.error('[nexus] Change propagation failed:', (err as Error).message),
    );

    return c.json(decision);
  });

  // Supersede Decision

  app.post('/api/decisions/:id/supersede', async (c) => {
    const db = getDb();
    const oldId = requireUUID(c.req.param('id'), 'id');
    const body = await c.req.json<{
      title?: unknown;
      description?: unknown;
      reasoning?: unknown;
      made_by?: unknown;
      tags?: unknown;
      affects?: unknown;
    }>();

    const title = requireString(body.title, 'title', 500);
    const description = requireString(body.description, 'description', 10000);
    const reasoning = requireString(body.reasoning, 'reasoning', 10000);
    const made_by = requireString(body.made_by, 'made_by', 200);
    const tags = validateTags(body.tags);
    const affects = validateAffects(body.affects);

    const result = await db.transaction(async (txQuery) => {
      const oldResult = await txQuery('SELECT * FROM decisions WHERE id = ?', [oldId]);
      if (oldResult.rows.length === 0) throw new NotFoundError('Decision', oldId);
      const old = oldResult.rows[0] as Record<string, unknown>;

      const embeddingText = `${title}\n${description}\n${reasoning}`;
      const embedding = await generateEmbedding(embeddingText);

      const newResult = await txQuery(
        `INSERT INTO decisions (
           project_id, title, description, reasoning, made_by,
           source, confidence, status, supersedes_id,
           affects, tags, alternatives_considered, assumptions,
           open_questions, dependencies, metadata, embedding
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         RETURNING *`,
        [
          old.project_id,
          title,
          description,
          reasoning,
          made_by,
          'manual',
          'high',
          'active',
          oldId,
          db.arrayParam(affects.length ? affects : (old.affects as string[] ?? [])),
          db.arrayParam(tags.length ? tags : (old.tags as string[] ?? [])),
          old.alternatives_considered ?? '[]',
          old.assumptions ?? '[]',
          old.open_questions ?? '[]',
          old.dependencies ?? '[]',
          old.metadata ?? '{}',
          embedding ? `[${embedding.join(',')}]` : null,
        ],
      );

      await txQuery(
        "UPDATE decisions SET status = 'superseded', updated_at = NOW() WHERE id = ?",
        [oldId],
      );

      await txQuery(
        `INSERT INTO decision_edges (source_id, target_id, relationship, strength)
         VALUES (?, ?, 'supersedes', 1.0)
         ON CONFLICT (source_id, target_id, relationship) DO NOTHING`,
        [newResult.rows[0].id, oldId],
      );

      return {
        newDecision: parseDecision(newResult.rows[0] as Record<string, unknown>),
        oldDecision: parseDecision({ ...old, status: 'superseded' }),
      };
    });

    logAudit('decision_superseded', (result.newDecision as Decision).project_id, {
      old_decision_id: oldId,
      new_decision_id: (result.newDecision as Decision).id,
      made_by,
    });

    propagateChange(result.newDecision as Decision, 'decision_superseded').catch((err) =>
      console.error('[nexus] Change propagation failed:', (err as Error).message),
    );

    return c.json(result, 201);
  });

  // Decision revert (restore superseded → active)

  app.post('/api/decisions/:id/revert', async (c) => {
    const db = getDb();
    const id = requireUUID(c.req.param('id'), 'id');

    const result = await db.query(
      `UPDATE decisions SET status = 'active', updated_at = NOW() WHERE id = ? RETURNING *`,
      [id],
    );

    if (result.rows.length === 0) throw new NotFoundError('Decision', id);
    const decision = parseDecision(result.rows[0] as Record<string, unknown>);

    logAudit('decision_reverted', decision.project_id, { decision_id: decision.id });

    propagateChange(decision, 'decision_reverted').catch((err) =>
      console.error('[nexus] Change propagation failed:', (err as Error).message),
    );

    return c.json(decision);
  });

  // Decision Graph + Impact

  app.get('/api/decisions/:id/graph', async (c) => {
    const db = getDb();
    const id = requireUUID(c.req.param('id'), 'id');
    const depth = Math.min(parseInt(c.req.query('depth') ?? '3', 10), 10);

    const visited = new Set<string>();
    const nodes: Decision[] = [];
    const edges: DecisionEdge[] = [];
    const queue: Array<{ nodeId: string; currentDepth: number }> = [
      { nodeId: id, currentDepth: 0 },
    ];

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { nodeId, currentDepth } = item;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const decResult = await db.query('SELECT * FROM decisions WHERE id = ?', [nodeId]);
      if (decResult.rows.length === 0) continue;
      nodes.push(parseDecision(decResult.rows[0] as Record<string, unknown>));

      if (currentDepth >= depth) continue;

      const edgeResult = await db.query(
        'SELECT * FROM decision_edges WHERE source_id = ? OR target_id = ?',
        [nodeId, nodeId],
      );

      for (const row of edgeResult.rows) {
        const edge = parseEdge(row as Record<string, unknown>);
        if (!edges.find((e) => e.id === edge.id)) {
          edges.push(edge);
        }
        const nextId = edge.source_id === nodeId ? edge.target_id : edge.source_id;
        if (!visited.has(nextId)) {
          queue.push({ nodeId: nextId, currentDepth: currentDepth + 1 });
        }
      }
    }

    return c.json({ nodes, edges });
  });

  app.get('/api/decisions/:id/impact', async (c) => {
    const db = getDb();
    const id = requireUUID(c.req.param('id'), 'id');

    const decResult = await db.query('SELECT * FROM decisions WHERE id = ?', [id]);
    if (decResult.rows.length === 0) throw new NotFoundError('Decision', id);
    const decision = parseDecision(decResult.rows[0] as Record<string, unknown>);

    const downstreamEdges = await db.query(
      `SELECT DISTINCT d.* FROM decisions d
       JOIN decision_edges e ON e.target_id = d.id
       WHERE e.source_id = ?`,
      [id],
    );
    const downstreamDecisions = downstreamEdges.rows.map((r) =>
      parseDecision(r as Record<string, unknown>),
    );

    const affectedAgentIds = new Set<string>();
    if (decision.affects.length > 0) {
      const agentResult = await db.query(
        `SELECT DISTINCT a.* FROM agents a
         JOIN subscriptions s ON s.agent_id = a.id
         WHERE s.topic = ANY(?) AND a.project_id = ?`,
        [db.arrayParam(decision.affects), decision.project_id],
      );
      for (const row of agentResult.rows) {
        const agent = row as Record<string, unknown>;
        affectedAgentIds.add(agent.id as string);
      }
    }

    const affectedAgentsResult =
      affectedAgentIds.size > 0
        ? await db.query(`SELECT * FROM agents WHERE id = ANY(?)`, [
            db.arrayParam(Array.from(affectedAgentIds)),
          ])
        : { rows: [] };
    const affectedAgents = affectedAgentsResult.rows.map((r) => r as Record<string, unknown>);

    const blockingResult = await db.query(
      `SELECT DISTINCT d.* FROM decisions d
       JOIN decision_edges e ON e.source_id = d.id
       WHERE e.target_id = ? AND e.relationship = 'blocks'`,
      [id],
    );
    const blockingDecisions = blockingResult.rows.map((r) =>
      parseDecision(r as Record<string, unknown>),
    );

    const supersessionChain: Decision[] = [];
    let currentId: string | undefined = decision.supersedes_id;
    while (currentId) {
      const chainResult = await db.query('SELECT * FROM decisions WHERE id = ?', [currentId]);
      if (chainResult.rows.length === 0) break;
      const chainDecision = parseDecision(chainResult.rows[0] as Record<string, unknown>);
      supersessionChain.push(chainDecision);
      currentId = chainDecision.supersedes_id;
      if (supersessionChain.length > 20) break;
    }

    const cacheResult = await db.query(
      `SELECT COUNT(*) as count FROM context_cache
       WHERE ? = ANY(decision_ids_included) AND expires_at > NOW()`,
      [id],
    );
    const cachedContextsInvalidated = parseInt(
      ((cacheResult.rows[0] as Record<string, unknown>)?.count as string) ?? '0',
      10,
    );

    return c.json({
      decision,
      downstream_decisions: downstreamDecisions,
      affected_agents: affectedAgents.map((a) => ({
        id: a.id,
        project_id: a.project_id,
        name: a.name,
        role: a.role,
      })),
      cached_contexts_invalidated: cachedContextsInvalidated,
      blocking_decisions: blockingDecisions,
      supersession_chain: supersessionChain,
    });
  });

  // Edges

  app.post('/api/decisions/:id/edges', async (c) => {
    const db = getDb();
    const sourceId = requireUUID(c.req.param('id'), 'id');
    const body = await c.req.json<{
      target_id?: unknown;
      relationship?: unknown;
      description?: unknown;
      strength?: number;
    }>();

    const target_id = requireUUID(body.target_id, 'target_id');
    const relationship = requireString(body.relationship, 'relationship', 100);

    const validRelationships = [
      'supersedes',
      'requires',
      'informs',
      'blocks',
      'contradicts',
      'enables',
      'depends_on',
      'refines',
      'reverts',
    ];
    if (!validRelationships.includes(relationship)) {
      throw new ValidationError(`relationship must be one of: ${validRelationships.join(', ')}`);
    }

    if (sourceId === target_id) {
      throw new ValidationError('Cannot create self-referencing edge');
    }

    try {
      const result = await db.query(
        `INSERT INTO decision_edges (source_id, target_id, relationship, description, strength)
         VALUES (?, ?, ?, ?, ?)
         RETURNING *`,
        [
          sourceId,
          target_id,
          relationship,
          optionalString(body.description, 'description', 1000) ?? null,
          body.strength ?? 1.0,
        ],
      );
      return c.json(parseEdge(result.rows[0] as Record<string, unknown>), 201);
    } catch (err) {
      mapDbError(err);
    }
  });

  app.get('/api/decisions/:id/edges', async (c) => {
    const db = getDb();
    const id = requireUUID(c.req.param('id'), 'id');
    const result = await db.query(
      'SELECT * FROM decision_edges WHERE source_id = ? OR target_id = ? ORDER BY created_at ASC',
      [id, id],
    );
    return c.json(result.rows.map((r) => parseEdge(r as Record<string, unknown>)));
  });

  app.delete('/api/edges/:id', async (c) => {
    const db = getDb();
    const id = requireUUID(c.req.param('id'), 'id');
    const result = await db.query('DELETE FROM decision_edges WHERE id = ? RETURNING id', [id]);
    if (result.rows.length === 0) throw new NotFoundError('Edge', id);
    return c.json({ deleted: true, id });
  });

  // Semantic Search

  app.post('/api/projects/:id/decisions/search', async (c) => {
    const db = getDb();
    const projectId = requireUUID(c.req.param('id'), 'projectId');
    const body = await c.req.json<{ query?: unknown; limit?: number }>();

    const searchQuery = requireString(body.query, 'query', 1000);
    const limit = Math.min(body.limit ?? 10, 50);

    const embedding = await generateEmbedding(searchQuery);

    if (embedding) {
      const result = await db.query(
        `SELECT *, 1 - (embedding <=> ?) as similarity
         FROM decisions
         WHERE project_id = ? AND embedding IS NOT NULL
         ORDER BY embedding <=> ?
         LIMIT ?`,
        [`[${embedding.join(',')}]`, projectId, `[${embedding.join(',')}]`, limit],
      );
      return c.json(result.rows.map((r) => parseDecision(r as Record<string, unknown>)));
    } else {
      const result = await db.query(
        `SELECT * FROM decisions
         WHERE project_id = ?
           AND (title ILIKE ? OR description ILIKE ? OR reasoning ILIKE ?)
         ORDER BY created_at DESC
         LIMIT ?`,
        [projectId, `%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`, limit],
      );
      return c.json(result.rows.map((r) => parseDecision(r as Record<string, unknown>)));
    }
  });
}
