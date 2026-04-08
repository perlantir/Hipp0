/**
 * Wing Affinity — learns cross-agent affinity from feedback and outcomes.
 *
 * When agent A rates a decision from wing B as helpful → increase A's affinity for B.
 * When agent A rates it unhelpful → decrease affinity.
 * Outcomes: successful outcome → small boost for all contributing wings.
 *
 * Asymmetric learning: positive feedback boosts by +0.02, negative decreases by -0.01.
 * This ensures positive learning outpaces negative for faster convergence.
 */

import { getDb } from '../db/index.js';
import type { WingAffinity, DecisionDomain } from '../types.js';
import { AGENT_PERSONAS } from '../config/agentPersonas.js';

const DEFAULT_AFFINITY: WingAffinity = {
  cross_wing_weights: {},
  last_recalculated: new Date().toISOString(),
  feedback_count: 0,
};

// Asymmetric learning rates (positive learning is faster)
const POSITIVE_LEARNING_RATE = 0.02;
const NEGATIVE_LEARNING_RATE = 0.01;

/**
 * Get wing affinity for an agent, initializing if not present.
 */
export async function getWingAffinity(agentId: string): Promise<WingAffinity> {
  const db = getDb();
  const result = await db.query<Record<string, unknown>>(
    'SELECT wing_affinity FROM agents WHERE id = ?',
    [agentId],
  );
  if (result.rows.length === 0) return { ...DEFAULT_AFFINITY };
  const raw = result.rows[0].wing_affinity;
  if (!raw || raw === '{}') return { ...DEFAULT_AFFINITY };
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return { ...DEFAULT_AFFINITY }; }
  }
  return raw as WingAffinity;
}

/**
 * Save updated wing affinity to the database.
 */
async function saveWingAffinity(agentId: string, affinity: WingAffinity): Promise<void> {
  const db = getDb();
  affinity.last_recalculated = new Date().toISOString();
  await db.query(
    'UPDATE agents SET wing_affinity = ? WHERE id = ?',
    [JSON.stringify(affinity), agentId],
  );
}

/**
 * Look up which wing a decision belongs to.
 */
export async function getDecisionWing(decisionId: string): Promise<string | null> {
  const db = getDb();
  const result = await db.query<Record<string, unknown>>(
    'SELECT wing, made_by FROM decisions WHERE id = ?',
    [decisionId],
  );
  if (result.rows.length === 0) return null;
  return (result.rows[0].wing as string) ?? (result.rows[0].made_by as string) ?? null;
}

/**
 * Increase affinity for a wing by a given amount (capped at 1.0).
 */
export async function increaseWingAffinity(
  agentId: string,
  wing: string,
  amount: number,
): Promise<void> {
  const affinity = await getWingAffinity(agentId);
  const current = affinity.cross_wing_weights[wing] ?? 0;
  affinity.cross_wing_weights[wing] = Math.min(1.0, current + amount);
  affinity.feedback_count += 1;
  await saveWingAffinity(agentId, affinity);
}

/**
 * Decrease affinity for a wing by a given amount (floored at 0.0).
 */
export async function decreaseWingAffinity(
  agentId: string,
  wing: string,
  amount: number,
): Promise<void> {
  const affinity = await getWingAffinity(agentId);
  const current = affinity.cross_wing_weights[wing] ?? 0;
  affinity.cross_wing_weights[wing] = Math.max(0.0, current - amount);
  affinity.feedback_count += 1;
  await saveWingAffinity(agentId, affinity);
}

/**
 * Process a feedback event for wing affinity learning.
 * Asymmetric: positive feedback boosts by +0.02, negative decreases by -0.01.
 */
export async function processWingFeedback(
  agentId: string,
  decisionId: string,
  rating: string,
): Promise<void> {
  const wing = await getDecisionWing(decisionId);
  if (!wing) return;

  // Map ratings to numeric scores
  const ratingScore = rating === 'critical' ? 5 : rating === 'useful' ? 4 : rating === 'missing' ? 3 : rating === 'irrelevant' ? 1 : 3;

  if (ratingScore >= 4) {
    await increaseWingAffinity(agentId, wing, POSITIVE_LEARNING_RATE);
  } else if (ratingScore <= 2) {
    await decreaseWingAffinity(agentId, wing, NEGATIVE_LEARNING_RATE);
  }
}

/**
 * Process batch feedback for wing affinity learning.
 */
export async function processWingFeedbackBatch(
  agentId: string,
  ratings: Array<{ decision_id: string; rating: string }>,
): Promise<void> {
  for (const { decision_id, rating } of ratings) {
    await processWingFeedback(agentId, decision_id, rating);
  }
}

/**
 * Process an outcome event for wing affinity.
 * On successful outcome: increase affinity for all contributing wings by +0.02.
 */
export async function processWingOutcome(
  agentId: string,
  compileHistoryId: string,
): Promise<void> {
  const db = getDb();

  // Get decision IDs from compile history
  const historyResult = await db.query<Record<string, unknown>>(
    'SELECT decision_ids FROM compile_history WHERE id = ?',
    [compileHistoryId],
  );
  if (historyResult.rows.length === 0) return;

  let decisionIds: string[] = [];
  const raw = historyResult.rows[0].decision_ids;
  if (typeof raw === 'string') {
    try { decisionIds = JSON.parse(raw); } catch { /* skip */ }
  } else if (Array.isArray(raw)) {
    decisionIds = raw as string[];
  }

  if (decisionIds.length === 0) return;

  // Get wings for all decisions
  const placeholders = decisionIds.map(() => '?').join(',');
  const wingResult = await db.query<Record<string, unknown>>(
    `SELECT DISTINCT COALESCE(wing, made_by) as wing FROM decisions WHERE id IN (${placeholders})`,
    decisionIds,
  );

  const affinity = await getWingAffinity(agentId);
  for (const row of wingResult.rows) {
    const wing = row.wing as string;
    if (!wing) continue;
    const current = affinity.cross_wing_weights[wing] ?? 0;
    affinity.cross_wing_weights[wing] = Math.min(1.0, current + 0.02);
  }
  affinity.feedback_count += 1;
  await saveWingAffinity(agentId, affinity);
}

/**
 * Rebalance wing affinity from all historical feedback for an agent.
 */
export async function rebalanceWingAffinity(agentId: string): Promise<WingAffinity> {
  const db = getDb();

  // Get all feedback for this agent with decision wing info
  const feedbackResult = await db.query<Record<string, unknown>>(
    `SELECT rf.decision_id, rf.was_useful, COALESCE(d.wing, d.made_by) as wing
     FROM relevance_feedback rf
     JOIN decisions d ON d.id = rf.decision_id
     WHERE rf.agent_id = ?`,
    [agentId],
  );

  const wingCounts: Record<string, { positive: number; negative: number }> = {};

  for (const row of feedbackResult.rows) {
    const wing = row.wing as string;
    if (!wing) continue;
    if (!wingCounts[wing]) wingCounts[wing] = { positive: 0, negative: 0 };
    if (row.was_useful) {
      wingCounts[wing].positive++;
    } else {
      wingCounts[wing].negative++;
    }
  }

  const cross_wing_weights: Record<string, number> = {};
  for (const [wing, counts] of Object.entries(wingCounts)) {
    const total = counts.positive + counts.negative;
    if (total === 0) continue;
    // Weighted ratio: positive contributes +0.05, negative -0.03
    const score = (counts.positive * 0.05 - counts.negative * 0.03);
    cross_wing_weights[wing] = Math.max(0, Math.min(1.0, score));
  }

  const affinity: WingAffinity = {
    cross_wing_weights,
    last_recalculated: new Date().toISOString(),
    feedback_count: feedbackResult.rows.length,
  };

  const dbAdapter = getDb();
  await dbAdapter.query(
    'UPDATE agents SET wing_affinity = ? WHERE id = ?',
    [JSON.stringify(affinity), agentId],
  );

  return affinity;
}

/**
 * Compute wing_sources breakdown from a list of decisions.
 */
export function computeWingSources(
  decisions: Array<{ wing?: string | null; made_by: string }>,
  requestingAgent: string,
): Record<string, number> {
  const sources: Record<string, number> = {};
  for (const d of decisions) {
    const wing = d.wing ?? d.made_by;
    const key = wing === requestingAgent ? 'own_wing' : wing;
    sources[key] = (sources[key] ?? 0) + 1;
  }
  return sources;
}

/* ── Auto-classification: score decision against wing profiles ──── */

export interface WingClassification {
  auto_domain: string;
  auto_category: string;
  classification_confidence: number;
  best_wing: string | null;
  wing_scores: Record<string, number>;
}

/**
 * Score a decision against all wing profiles using 5-signal scoring.
 * Returns the best-matching wing and classification metadata.
 * Signals:
 *   1. Tag overlap with persona primaryTags
 *   2. Keyword match against title/description
 *   3. Domain alignment
 *   4. Made-by identity (direct match)
 *   5. Exclude-tag penalty
 */
export function classifyDecisionWing(
  title: string,
  description: string,
  tags: string[],
  madeBy: string,
  domain?: string | null,
): WingClassification {
  const tagsLower = tags.map((t) => t.toLowerCase());
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();
  const textLower = `${titleLower} ${descLower}`;

  const wingScores: Record<string, number> = {};
  let bestWing: string | null = null;
  let bestScore = 0;

  for (const [name, persona] of Object.entries(AGENT_PERSONAS)) {
    let score = 0;

    // Signal 1: Tag overlap (0–0.4)
    if (tagsLower.length > 0 && persona.primaryTags.length > 0) {
      const overlap = persona.primaryTags.filter((t) => tagsLower.includes(t)).length;
      score += Math.min(0.4, (overlap / Math.max(tagsLower.length, 1)) * 0.6);
    }

    // Signal 2: Keyword match (0–0.25)
    if (persona.keywords.length > 0) {
      const hits = persona.keywords.filter((kw) => textLower.includes(kw.toLowerCase())).length;
      score += Math.min(0.25, hits * 0.06);
    }

    // Signal 3: Domain alignment (0–0.15)
    if (domain && persona.primaryTags.includes(domain)) {
      score += 0.15;
    }

    // Signal 4: Made-by match (0.2 bonus)
    if (madeBy.toLowerCase() === name.toLowerCase()) {
      score += 0.2;
    }

    // Signal 5: Exclude-tag penalty
    const excludeHits = persona.excludeTags.filter((t) => tagsLower.includes(t)).length;
    score -= Math.min(0.15, excludeHits * 0.05);

    score = Math.max(0, Math.min(1.0, score));
    wingScores[name] = Math.round(score * 1000) / 1000;

    if (score > bestScore) {
      bestScore = score;
      bestWing = name;
    }
  }

  // If no wing matches above threshold, flag as uncategorized
  const MATCH_THRESHOLD = 0.3;
  if (bestScore < MATCH_THRESHOLD) {
    bestWing = null;
  }

  return {
    auto_domain: domain ?? 'general',
    auto_category: bestWing ? 'classified' : 'uncategorized',
    classification_confidence: Math.round(bestScore * 100) / 100,
    best_wing: bestWing,
    wing_scores: wingScores,
  };
}

/* ── Wing recalculation trigger ─────────────────────────────────── */

// In-memory counter for tracking decisions since last wing recalculation
let _decisionsSinceLastCalc = 0;
const RECALC_THRESHOLD = 50;

/**
 * Increment decision counter and check if wing recalculation is due.
 * Returns true if recalculation was triggered.
 */
export async function maybeRecalculateWings(projectId: string): Promise<boolean> {
  _decisionsSinceLastCalc++;
  if (_decisionsSinceLastCalc < RECALC_THRESHOLD) return false;

  _decisionsSinceLastCalc = 0;

  // Trigger async recalculation for all agents in the project
  recalculateProjectWings(projectId).catch((err) =>
    console.error('[hipp0/wings] Recalculation failed:', (err as Error).message),
  );
  return true;
}

/**
 * Reset the recalculation counter (for testing).
 */
export function resetRecalcCounter(): void {
  _decisionsSinceLastCalc = 0;
}

/**
 * Get current recalc counter (for testing).
 */
export function getRecalcCounter(): number {
  return _decisionsSinceLastCalc;
}

/**
 * Recalculate wings for all agents in a project.
 * Detects wing merges (>80% tag overlap) and returns merge suggestions.
 */
export async function recalculateProjectWings(
  projectId: string,
): Promise<{ agents_updated: number; merge_suggestions: Array<{ wing_a: string; wing_b: string; overlap: number }> }> {
  const db = getDb();

  // Get all agents in the project
  const agentResult = await db.query<Record<string, unknown>>(
    'SELECT id, name FROM agents WHERE project_id = ?',
    [projectId],
  );

  let updated = 0;
  for (const row of agentResult.rows) {
    try {
      await rebalanceWingAffinity(row.id as string);
      updated++;
    } catch { /* skip failed agents */ }
  }

  // Detect potential merges: wings with >80% tag overlap
  const wingTagsResult = await db.query<Record<string, unknown>>(
    `SELECT COALESCE(wing, made_by) as wing_name, tags
     FROM decisions WHERE project_id = ? AND status = 'active'`,
    [projectId],
  );

  const wingTagSets: Record<string, Set<string>> = {};
  for (const row of wingTagsResult.rows) {
    const wing = row.wing_name as string;
    if (!wing) continue;
    if (!wingTagSets[wing]) wingTagSets[wing] = new Set();
    let tags: string[] = [];
    const rawTags = row.tags;
    if (typeof rawTags === 'string') {
      try { tags = JSON.parse(rawTags); } catch { /* skip */ }
    } else if (Array.isArray(rawTags)) {
      tags = rawTags as string[];
    }
    for (const t of tags) wingTagSets[wing].add(t);
  }

  const wingNames = Object.keys(wingTagSets);
  const mergeSuggestions: Array<{ wing_a: string; wing_b: string; overlap: number }> = [];

  for (let i = 0; i < wingNames.length; i++) {
    for (let j = i + 1; j < wingNames.length; j++) {
      const setA = wingTagSets[wingNames[i]];
      const setB = wingTagSets[wingNames[j]];
      if (setA.size === 0 || setB.size === 0) continue;

      const intersection = new Set([...setA].filter((t) => setB.has(t)));
      const smaller = Math.min(setA.size, setB.size);
      const overlap = smaller > 0 ? intersection.size / smaller : 0;

      if (overlap > 0.8) {
        mergeSuggestions.push({
          wing_a: wingNames[i],
          wing_b: wingNames[j],
          overlap: Math.round(overlap * 100) / 100,
        });
      }
    }
  }

  // Update project metadata with last recalculation info
  try {
    await db.query(
      `UPDATE projects SET metadata = json_set(COALESCE(metadata, '{}'), '$.last_wing_calc_decision_count', (SELECT COUNT(*) FROM decisions WHERE project_id = ?))
       WHERE id = ?`,
      [projectId, projectId],
    );
  } catch {
    // json_set may not exist in all dialects, skip silently
  }

  return { agents_updated: updated, merge_suggestions: mergeSuggestions };
}

/**
 * Get the wing affinity score for a specific agent+wing pair.
 * Returns 0.5 (neutral) if no data exists.
 */
export async function getAgentWingAffinityScore(agentId: string, wing: string): Promise<number> {
  const affinity = await getWingAffinity(agentId);
  return affinity.cross_wing_weights[wing] ?? 0.5;
}
