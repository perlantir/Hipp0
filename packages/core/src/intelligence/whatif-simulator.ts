/**
 * Feature 11: What-If Simulator
 *
 * Real-time impact preview showing per-agent rank/score changes
 * before committing a decision change. Two modes:
 *   - Real-time: uses live scoring engine (always works)
 *   - Historical: queries compile_history (optional, fault-tolerant)
 */
import { getDb } from '../db/index.js';
import { scoreDecision, cosineSimilarity } from '../context-compiler/index.js';
import type { Decision, Agent, ScoredDecision } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ProposedChanges {
  title?: string;
  description?: string;
  tags?: string[];
  affects?: string[];
}

export interface AgentImpact {
  agent_id: string;
  agent_name: string;
  agent_role: string;
  original_rank: number;
  proposed_rank: number;
  original_score: number;
  proposed_score: number;
  score_delta: number;
  rank_delta: number;
}

export interface SimulationWarning {
  type: 'rank_drop' | 'lost_agent' | 'new_contradiction' | 'cascade_risk';
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface SimulationResult {
  simulation_id: string;
  original_decision: Decision;
  proposed_decision: Decision;
  agent_impacts: AgentImpact[];
  summary: {
    total_agents: number;
    agents_affected: number;
    agents_improved: number;
    agents_degraded: number;
    agents_unchanged: number;
    newly_reached: string[];
    lost: string[];
  };
  warnings: SimulationWarning[];
  cascade_edges: Array<{ source_id: string; target_id: string; relationship: string }>;
}

export interface HistoricalImpact {
  lookback_days: number;
  compile_appearances: number;
  agents_that_received: string[];
  avg_score: number;
}

/* ------------------------------------------------------------------ */
/*  Zero vector for skipping semantic similarity                       */
/* ------------------------------------------------------------------ */

const ZERO_VECTOR: number[] = new Array(1536).fill(0) as number[];

/* ------------------------------------------------------------------ */
/*  Helper: Build proposed decision from original + changes            */
/* ------------------------------------------------------------------ */

function buildProposedDecision(original: Decision, changes: ProposedChanges): Decision {
  return {
    ...original,
    title: changes.title ?? original.title,
    description: changes.description ?? original.description,
    tags: changes.tags ?? original.tags,
    affects: changes.affects ?? original.affects,
  };
}

/* ------------------------------------------------------------------ */
/*  Helper: Get rank of a decision for a given agent                   */
/* ------------------------------------------------------------------ */

function getRank(
  decisionId: string,
  scoredDecisions: ScoredDecision[],
): { rank: number; score: number } {
  const sorted = [...scoredDecisions].sort((a, b) => b.combined_score - a.combined_score);
  const idx = sorted.findIndex((d) => d.id === decisionId);
  if (idx === -1) return { rank: -1, score: 0 };
  return { rank: idx + 1, score: sorted[idx].combined_score };
}

/* ------------------------------------------------------------------ */
/*  Check for potential contradictions                                  */
/* ------------------------------------------------------------------ */

export function checkProposedContradictions(
  proposedDecision: Decision,
  otherDecisions: Decision[],
): SimulationWarning[] {
  const warnings: SimulationWarning[] = [];

  for (const other of otherDecisions) {
    if (other.id === proposedDecision.id) continue;
    if (other.status !== 'active') continue;

    // Use embedding cosine similarity if both have embeddings
    const propEmb = proposedDecision.embedding;
    const otherEmb = other.embedding;
    if (
      propEmb && Array.isArray(propEmb) && propEmb.length > 0 &&
      otherEmb && Array.isArray(otherEmb) && otherEmb.length > 0
    ) {
      const sim = cosineSimilarity(propEmb, otherEmb);
      if (sim > 0.85) {
        warnings.push({
          type: 'new_contradiction',
          message: `High similarity (${(sim * 100).toFixed(0)}%) with "${other.title}" — potential contradiction`,
          severity: 'warning',
        });
      }
    }
  }

  return warnings;
}

/* ------------------------------------------------------------------ */
/*  Find cascade impact via decision_edges                             */
/* ------------------------------------------------------------------ */

export async function findCascadeImpact(
  decisionId: string,
  projectId: string,
): Promise<Array<{ source_id: string; target_id: string; relationship: string }>> {
  const db = getDb();
  try {
    const result = await db.query(
      `SELECT source_id, target_id, relationship
       FROM decision_edges
       WHERE source_id = ? OR target_id = ?`,
      [decisionId, decisionId],
    );
    return result.rows as Array<{ source_id: string; target_id: string; relationship: string }>;
  } catch {
    // decision_edges table may not exist
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Main: simulateDecisionChange                                       */
/* ------------------------------------------------------------------ */

export async function simulateDecisionChange(
  decisionId: string,
  proposedChanges: ProposedChanges,
  projectId: string,
): Promise<SimulationResult> {
  const db = getDb();

  // 1. Get all agents for the project
  const agentsResult = await db.query(
    `SELECT * FROM agents WHERE project_id = ?`,
    [projectId],
  );
  const agents = agentsResult.rows as unknown as Agent[];

  // 2. Get the original decision
  const decResult = await db.query(
    `SELECT * FROM decisions WHERE id = ? AND project_id = ?`,
    [decisionId, projectId],
  );
  if (decResult.rows.length === 0) {
    throw new Error(`Decision not found: ${decisionId}`);
  }
  const originalDecision = decResult.rows[0] as unknown as Decision;

  // Parse JSON fields if needed
  if (typeof originalDecision.tags === 'string') {
    originalDecision.tags = JSON.parse(originalDecision.tags as unknown as string);
  }
  if (typeof originalDecision.affects === 'string') {
    originalDecision.affects = JSON.parse(originalDecision.affects as unknown as string);
  }

  // 3. Get ALL active decisions for the project
  const allDecResult = await db.query(
    `SELECT * FROM decisions WHERE project_id = ? AND status = 'active'`,
    [projectId],
  );
  const allDecisions = (allDecResult.rows as unknown as Decision[]).map((d) => {
    if (typeof d.tags === 'string') d.tags = JSON.parse(d.tags as unknown as string);
    if (typeof d.affects === 'string') d.affects = JSON.parse(d.affects as unknown as string);
    return d;
  });

  // 4. Build proposed decision
  const proposedDecision = buildProposedDecision(originalDecision, proposedChanges);

  // 5. For each agent: score original and proposed, compute rank changes
  const agentImpacts: AgentImpact[] = [];
  const newlyReached: string[] = [];
  const lost: string[] = [];

  for (const agent of agents) {
    // Parse relevance_profile if it's a string
    if (typeof agent.relevance_profile === 'string') {
      agent.relevance_profile = JSON.parse(agent.relevance_profile as unknown as string);
    }

    // Score ALL decisions for this agent (original set)
    const originalScores = allDecisions.map((d) =>
      scoreDecision(d, agent, ZERO_VECTOR),
    );

    // Score ALL decisions with proposed change swapped in
    const proposedDecisions = allDecisions.map((d) =>
      d.id === decisionId ? proposedDecision : d,
    );
    const proposedScores = proposedDecisions.map((d) =>
      scoreDecision(d, agent, ZERO_VECTOR),
    );

    // Get rank of target decision in both sets
    const origRank = getRank(decisionId, originalScores);
    const propRank = getRank(decisionId, proposedScores);

    const scoreDelta = propRank.score - origRank.score;
    const rankDelta = origRank.rank - propRank.rank; // positive = improved

    // Track newly reached/lost
    const MIN_SCORE = 0.50;
    if (origRank.score < MIN_SCORE && propRank.score >= MIN_SCORE) {
      newlyReached.push(agent.name);
    }
    if (origRank.score >= MIN_SCORE && propRank.score < MIN_SCORE) {
      lost.push(agent.name);
    }

    agentImpacts.push({
      agent_id: agent.id,
      agent_name: agent.name,
      agent_role: agent.role,
      original_rank: origRank.rank,
      proposed_rank: propRank.rank,
      original_score: Math.round(origRank.score * 1000) / 1000,
      proposed_score: Math.round(propRank.score * 1000) / 1000,
      score_delta: Math.round(scoreDelta * 1000) / 1000,
      rank_delta: rankDelta,
    });
  }

  // 6. Summary
  const affected = agentImpacts.filter((a) => a.score_delta !== 0);
  const improved = agentImpacts.filter((a) => a.score_delta > 0);
  const degraded = agentImpacts.filter((a) => a.score_delta < 0);

  // 7. Check contradictions
  const contradictionWarnings = checkProposedContradictions(proposedDecision, allDecisions);

  // 8. Check cascade
  const cascadeEdges = await findCascadeImpact(decisionId, projectId);

  // 9. Generate warnings
  const warnings: SimulationWarning[] = [...contradictionWarnings];

  // Warn about significant rank drops
  for (const impact of agentImpacts) {
    if (impact.rank_delta < -3) {
      warnings.push({
        type: 'rank_drop',
        message: `"${impact.agent_name}" drops ${Math.abs(impact.rank_delta)} ranks (${impact.original_rank} → ${impact.proposed_rank})`,
        severity: impact.rank_delta < -5 ? 'critical' : 'warning',
      });
    }
  }

  // Warn about lost agents
  for (const name of lost) {
    warnings.push({
      type: 'lost_agent',
      message: `"${name}" would no longer receive this decision in context`,
      severity: 'warning',
    });
  }

  // Warn about cascade risk
  if (cascadeEdges.length > 3) {
    warnings.push({
      type: 'cascade_risk',
      message: `This decision has ${cascadeEdges.length} edges — changes may cascade`,
      severity: 'warning',
    });
  }

  return {
    simulation_id: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    original_decision: originalDecision,
    proposed_decision: proposedDecision,
    agent_impacts: agentImpacts,
    summary: {
      total_agents: agents.length,
      agents_affected: affected.length,
      agents_improved: improved.length,
      agents_degraded: degraded.length,
      agents_unchanged: agents.length - affected.length,
      newly_reached: newlyReached,
      lost,
    },
    warnings,
    cascade_edges: cascadeEdges,
  };
}

/* ------------------------------------------------------------------ */
/*  Historical impact (optional — compile_history may not exist)       */
/* ------------------------------------------------------------------ */

export async function simulateHistoricalImpact(
  decisionId: string,
  proposedChanges: ProposedChanges,
  projectId: string,
  lookbackDays: number = 30,
): Promise<HistoricalImpact | null> {
  const db = getDb();
  try {
    const result = await db.query(
      `SELECT agent_name, decision_ids, decision_scores
       FROM compile_history
       WHERE project_id = ?
         AND compiled_at >= NOW() - INTERVAL '${lookbackDays} days'
       ORDER BY compiled_at DESC`,
      [projectId],
    );

    if (result.rows.length === 0) return null;

    let appearances = 0;
    const agentSet = new Set<string>();
    let totalScore = 0;

    for (const row of result.rows) {
      const r = row as Record<string, unknown>;
      const ids: string[] = typeof r.decision_ids === 'string'
        ? JSON.parse(r.decision_ids as string)
        : (r.decision_ids as string[]) ?? [];
      const scores: number[] = typeof r.decision_scores === 'string'
        ? JSON.parse(r.decision_scores as string)
        : (r.decision_scores as number[]) ?? [];

      const idx = ids.indexOf(decisionId);
      if (idx !== -1) {
        appearances++;
        agentSet.add(r.agent_name as string);
        totalScore += scores[idx] ?? 0;
      }
    }

    return {
      lookback_days: lookbackDays,
      compile_appearances: appearances,
      agents_that_received: [...agentSet],
      avg_score: appearances > 0 ? Math.round((totalScore / appearances) * 1000) / 1000 : 0,
    };
  } catch {
    // compile_history table may not exist
    return null;
  }
}
