import { query, transaction } from '../db/pool.js';
import { parseDecision, parseEdge, parseAgent } from '../db/parsers.js';
import { generateEmbedding } from './embeddings.js';
import type {
  Decision,
  DecisionEdge,
  GraphNode,
  GraphResult,
  ImpactAnalysis,
  Agent,
  CreateDecisionInput,
  CreateEdgeInput,
} from '../types.js';
import { NotFoundError, NexusError } from '../types.js';
import type pg from 'pg';

function buildEmbeddingText(input: CreateDecisionInput): string {
  return [
    input.title,
    input.description,
    input.reasoning,
    ...(input.tags ?? []),
    ...(input.affects ?? []),
  ]
    .filter(Boolean)
    .join(' ');
}

async function fetchDecisionById(id: string, client?: pg.PoolClient): Promise<Decision> {
  const sql = `SELECT * FROM decisions WHERE id = $1`;
  const result = client
    ? await client.query<Record<string, unknown>>(sql, [id])
    : await query<Record<string, unknown>>(sql, [id]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Decision', id);
  }
  return parseDecision(result.rows[0]);
}

// --- Decision CRUD ---

/**
 * Insert a new decision and generate its embedding.
 */
export async function createDecision(input: CreateDecisionInput): Promise<Decision> {
  const embeddingText = buildEmbeddingText(input);
  const embedding = await generateEmbedding(embeddingText);
  const embeddingStr = `[${embedding.join(',')}]`;

  const result = await query<Record<string, unknown>>(
    `INSERT INTO decisions (
       project_id, title, description, reasoning, made_by,
       source, source_session_id, confidence, status, supersedes_id,
       alternatives_considered, affects, tags, assumptions,
       open_questions, dependencies, confidence_decay_rate, metadata, embedding
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12, $13, $14,
       $15, $16, $17, $18, $19::vector
     ) RETURNING *`,
    [
      input.project_id,
      input.title,
      input.description,
      input.reasoning,
      input.made_by,
      input.source ?? 'manual',
      input.source_session_id ?? null,
      input.confidence ?? 'medium',
      input.status ?? 'active',
      input.supersedes_id ?? null,
      JSON.stringify(input.alternatives_considered ?? []),
      input.affects ?? [],
      input.tags ?? [],
      JSON.stringify(input.assumptions ?? []),
      JSON.stringify(input.open_questions ?? []),
      JSON.stringify(input.dependencies ?? []),
      input.confidence_decay_rate ?? 0,
      JSON.stringify(input.metadata ?? {}),
      embeddingStr,
    ],
  );

  return parseDecision(result.rows[0]);
}

/**
 * Retrieve a single decision by ID. Throws NotFoundError if missing.
 */
export async function getDecision(id: string): Promise<Decision> {
  return fetchDecisionById(id);
}

/**
 * Update mutable fields of a decision by ID.
 */
export async function updateDecision(
  id: string,
  updates: Partial<CreateDecisionInput>,
): Promise<Decision> {
  await fetchDecisionById(id);

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const addField = (col: string, val: unknown, asJson = false) => {
    setClauses.push(`${col} = $${idx++}`);
    values.push(asJson ? JSON.stringify(val) : val);
  };

  if (updates.title !== undefined) addField('title', updates.title);
  if (updates.description !== undefined) addField('description', updates.description);
  if (updates.reasoning !== undefined) addField('reasoning', updates.reasoning);
  if (updates.made_by !== undefined) addField('made_by', updates.made_by);
  if (updates.source !== undefined) addField('source', updates.source);
  if (updates.source_session_id !== undefined)
    addField('source_session_id', updates.source_session_id);
  if (updates.confidence !== undefined) addField('confidence', updates.confidence);
  if (updates.status !== undefined) addField('status', updates.status);
  if (updates.supersedes_id !== undefined) addField('supersedes_id', updates.supersedes_id);
  if (updates.alternatives_considered !== undefined)
    addField('alternatives_considered', updates.alternatives_considered, true);
  if (updates.affects !== undefined) addField('affects', updates.affects);
  if (updates.tags !== undefined) addField('tags', updates.tags);
  if (updates.assumptions !== undefined) addField('assumptions', updates.assumptions, true);
  if (updates.open_questions !== undefined)
    addField('open_questions', updates.open_questions, true);
  if (updates.dependencies !== undefined) addField('dependencies', updates.dependencies, true);
  if (updates.confidence_decay_rate !== undefined)
    addField('confidence_decay_rate', updates.confidence_decay_rate);
  if (updates.metadata !== undefined) addField('metadata', updates.metadata, true);

  const contentChanged =
    updates.title !== undefined ||
    updates.description !== undefined ||
    updates.reasoning !== undefined ||
    updates.tags !== undefined ||
    updates.affects !== undefined;

  if (contentChanged) {
    const current = await fetchDecisionById(id);
    const merged: CreateDecisionInput = {
      project_id: current.project_id,
      title: updates.title ?? current.title,
      description: updates.description ?? current.description,
      reasoning: updates.reasoning ?? current.reasoning,
      tags: updates.tags ?? current.tags,
      affects: updates.affects ?? current.affects,
      made_by: current.made_by,
    };
    const embedding = await generateEmbedding(buildEmbeddingText(merged));
    const embeddingStr = `[${embedding.join(',')}]`;
    setClauses.push(`embedding = $${idx++}::vector`);
    values.push(embeddingStr);
  }

  setClauses.push(`updated_at = NOW()`);

  if (setClauses.length === 1) {
    return fetchDecisionById(id);
  }

  values.push(id);
  const result = await query<Record<string, unknown>>(
    `UPDATE decisions SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );

  return parseDecision(result.rows[0]);
}

/**
 * List decisions for a project with optional filters.
 */
export async function listDecisions(
  projectId: string,
  filters?: {
    status?: Decision['status'];
    tags?: string[];
    made_by?: string;
    limit?: number;
    offset?: number;
  },
): Promise<Decision[]> {
  const conditions: string[] = ['project_id = $1'];
  const values: unknown[] = [projectId];
  let idx = 2;

  if (filters?.status) {
    conditions.push(`status = $${idx++}`);
    values.push(filters.status);
  }

  if (filters?.made_by) {
    conditions.push(`made_by = $${idx++}`);
    values.push(filters.made_by);
  }

  if (filters?.tags && filters.tags.length > 0) {
    conditions.push(`tags && $${idx++}::text[]`);
    values.push(filters.tags);
  }

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  const sql = `
    SELECT * FROM decisions
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${idx++} OFFSET $${idx++}
  `;
  values.push(limit, offset);

  const result = await query<Record<string, unknown>>(sql, values);
  return result.rows.map(parseDecision);
}

/**
 * Vector similarity search using pgvector cosine distance.
 */
export async function searchDecisionsByEmbedding(
  projectId: string,
  embedding: number[],
  limit = 10,
): Promise<Decision[]> {
  const embeddingStr = `[${embedding.join(',')}]`;

  const result = await query<Record<string, unknown>>(
    `SELECT *, (embedding <=> $1::vector) AS _distance
     FROM decisions
     WHERE project_id = $2 AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [embeddingStr, projectId, limit],
  );

  return result.rows.map(parseDecision);
}

// --- Edge CRUD ---

/**
 * Create an edge between two decisions.
 */
export async function createEdge(input: CreateEdgeInput): Promise<DecisionEdge> {
  await fetchDecisionById(input.source_id);
  await fetchDecisionById(input.target_id);

  const result = await query<Record<string, unknown>>(
    `INSERT INTO decision_edges (source_id, target_id, relationship, description, strength)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.source_id,
      input.target_id,
      input.relationship,
      input.description ?? null,
      input.strength ?? 1.0,
    ],
  );

  return parseEdge(result.rows[0]);
}

/**
 * Retrieve all edges connected to a decision (as source or target).
 */
export async function getEdges(decisionId: string): Promise<DecisionEdge[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT * FROM decision_edges
     WHERE source_id = $1 OR target_id = $1
     ORDER BY created_at ASC`,
    [decisionId],
  );
  return result.rows.map(parseEdge);
}

/**
 * Delete an edge by ID.
 */
export async function deleteEdge(id: string): Promise<void> {
  const result = await query(`DELETE FROM decision_edges WHERE id = $1`, [id]);
  if ((result.rowCount ?? 0) === 0) {
    throw new NotFoundError('DecisionEdge', id);
  }
}

// --- Graph Traversal ---

/**
 * Get connected decisions using the get_connected_decisions SQL function.
 * Falls back to a recursive CTE query if the function is not present.
 */
export async function getConnectedDecisions(
  decisionId: string,
  maxDepth = 3,
): Promise<GraphNode[]> {
  await fetchDecisionById(decisionId);

  try {
    const result = await query<{
      decision_id: string;
      depth: number;
      via_relationship: string;
    }>(`SELECT * FROM get_connected_decisions($1, $2)`, [decisionId, maxDepth]);

    const nodes: GraphNode[] = [];
    for (const row of result.rows) {
      try {
        const decision = await fetchDecisionById(row.decision_id);
        nodes.push({
          decision,
          depth: row.depth,
          via_relationship: row.via_relationship,
        });
      } catch {
        // Skip missing decisions (referential integrity issue)
      }
    }
    return nodes;
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code !== '42883') {
      // 42883 = undefined_function — only fall back for that
      throw err;
    }

    return getConnectedDecisionsFallback(decisionId, maxDepth);
  }
}

/**
 * Fallback recursive CTE traversal when the SQL function is unavailable.
 */
async function getConnectedDecisionsFallback(
  decisionId: string,
  maxDepth: number,
): Promise<GraphNode[]> {
  const result = await query<{
    decision_id: string;
    depth: number;
    via_relationship: string;
  }>(
    `WITH RECURSIVE graph AS (
       SELECT
         target_id   AS decision_id,
         1           AS depth,
         relationship AS via_relationship
       FROM decision_edges
       WHERE source_id = $1
       UNION ALL
       SELECT
         e.target_id,
         g.depth + 1,
         e.relationship
       FROM decision_edges e
       JOIN graph g ON e.source_id = g.decision_id
       WHERE g.depth < $2
     )
     SELECT DISTINCT ON (decision_id) decision_id, depth, via_relationship
     FROM graph
     ORDER BY decision_id, depth`,
    [decisionId, maxDepth],
  );

  const nodes: GraphNode[] = [];
  for (const row of result.rows) {
    try {
      const decision = await fetchDecisionById(row.decision_id);
      nodes.push({
        decision,
        depth: row.depth,
        via_relationship: row.via_relationship,
      });
    } catch {
      // Skip missing decisions
    }
  }
  return nodes;
}

/**
 * Return nodes and edges for graph visualization centered on a decision.
 */
export async function getGraph(decisionId: string, depth = 2): Promise<GraphResult> {
  const rootDecision = await fetchDecisionById(decisionId);
  const connectedNodes = await getConnectedDecisions(decisionId, depth);

  const decisionIds = [decisionId, ...connectedNodes.map((n) => n.decision.id)];

  const uniqueIds = [...new Set(decisionIds)];

  const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(', ');
  const edgesResult = await query<Record<string, unknown>>(
    `SELECT * FROM decision_edges
     WHERE source_id IN (${placeholders})
        OR target_id IN (${placeholders})`,
    [...uniqueIds, ...uniqueIds],
  );

  const idSet = new Set(uniqueIds);
  const edges = edgesResult.rows
    .map(parseEdge)
    .filter((e) => idSet.has(e.source_id) && idSet.has(e.target_id));

  const nodes = [rootDecision, ...connectedNodes.map((n) => n.decision)];

  const seen = new Set<string>();
  const uniqueNodes: Decision[] = [];
  for (const n of nodes) {
    if (!seen.has(n.id)) {
      seen.add(n.id);
      uniqueNodes.push(n);
    }
  }

  return { nodes: uniqueNodes, edges };
}

// --- Supersession ---

/**
 * Create a new decision that supersedes an existing one.
 * - Creates the new decision
 * - Marks the old decision as 'superseded'
 * - Creates a 'supersedes' edge from new → old
 */
export async function supersedeDecision(
  oldId: string,
  newInput: CreateDecisionInput,
): Promise<{ newDecision: Decision; oldDecision: Decision }> {
  await fetchDecisionById(oldId);

  return transaction(async (client) => {
    const embeddingText = buildEmbeddingText(newInput);
    const embedding = await generateEmbedding(embeddingText);
    const embeddingStr = `[${embedding.join(',')}]`;

    const insertResult = await client.query<Record<string, unknown>>(
      `INSERT INTO decisions (
         project_id, title, description, reasoning, made_by,
         source, source_session_id, confidence, status, supersedes_id,
         alternatives_considered, affects, tags, assumptions,
         open_questions, dependencies, confidence_decay_rate, metadata, embedding
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15, $16, $17, $18, $19::vector
       ) RETURNING *`,
      [
        newInput.project_id,
        newInput.title,
        newInput.description,
        newInput.reasoning,
        newInput.made_by,
        newInput.source ?? 'manual',
        newInput.source_session_id ?? null,
        newInput.confidence ?? 'medium',
        newInput.status ?? 'active',
        oldId, // supersedes_id points to the old decision
        JSON.stringify(newInput.alternatives_considered ?? []),
        newInput.affects ?? [],
        newInput.tags ?? [],
        JSON.stringify(newInput.assumptions ?? []),
        JSON.stringify(newInput.open_questions ?? []),
        JSON.stringify(newInput.dependencies ?? []),
        newInput.confidence_decay_rate ?? 0,
        JSON.stringify(newInput.metadata ?? {}),
        embeddingStr,
      ],
    );

    const newDecision = parseDecision(insertResult.rows[0]);

    const updateResult = await client.query<Record<string, unknown>>(
      `UPDATE decisions SET status = 'superseded', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [oldId],
    );
    const oldDecision = parseDecision(updateResult.rows[0]);

    await client.query(
      `INSERT INTO decision_edges (source_id, target_id, relationship, strength)
       VALUES ($1, $2, 'supersedes', 1.0)`,
      [newDecision.id, oldId],
    );

    return { newDecision, oldDecision };
  });
}

/**
 * Follow the supersedes_id chain from a decision back to the original.
 */
export async function getSupersessionChain(decisionId: string): Promise<Decision[]> {
  const chain: Decision[] = [];
  const visited = new Set<string>();

  let currentId: string | undefined = decisionId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const decision = await fetchDecisionById(currentId);
    chain.push(decision);
    currentId = decision.supersedes_id;
  }

  return chain;
}

// --- Impact Analysis ---

/**
 * Analyse the downstream impact of a decision:
 * - downstream decisions (those that depend on or are informed by this one)
 * - affected agents (whose 'affects' matches decision's affects)
 * - blocking decisions (edges where this decision is the target of a 'blocks' relationship)
 * - supersession chain
 */
export async function getImpact(decisionId: string): Promise<ImpactAnalysis> {
  const decision = await fetchDecisionById(decisionId);

  const downstreamEdgesResult = await query<Record<string, unknown>>(
    `SELECT DISTINCT d.* FROM decisions d
     JOIN decision_edges e ON e.target_id = d.id
     WHERE e.source_id = $1 AND e.relationship IN ('requires', 'informs', 'enables', 'depends_on', 'refines')`,
    [decisionId],
  );
  const downstreamDecisions = downstreamEdgesResult.rows.map(parseDecision);

  let affectedAgents: Agent[] = [];
  if (decision.affects.length > 0) {
    const agentsResult = await query<Record<string, unknown>>(
      `SELECT * FROM agents
       WHERE project_id = $1`,
      [decision.project_id],
    );
    affectedAgents = agentsResult.rows
      .map(parseAgent)
      .filter(
        (agent) => decision.affects.includes(agent.role) || decision.affects.includes(agent.name),
      );
  }

  const blockingResult = await query<Record<string, unknown>>(
    `SELECT DISTINCT d.* FROM decisions d
     JOIN decision_edges e ON e.source_id = d.id
     WHERE e.target_id = $1 AND e.relationship = 'blocks'`,
    [decisionId],
  );
  const blockingDecisions = blockingResult.rows.map(parseDecision);

  const supersessionChain = await getSupersessionChain(decisionId);
  const chainWithoutSelf = supersessionChain.slice(1);

  return {
    decision,
    downstream_decisions: downstreamDecisions,
    affected_agents: affectedAgents,
    cached_contexts_invalidated: 0, // Actual cache invalidation handled by context compiler
    blocking_decisions: blockingDecisions,
    supersession_chain: chainWithoutSelf,
  };
}
