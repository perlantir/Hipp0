/**
 * Wing Affinity — learns cross-agent affinity from feedback and outcomes.
 *
 * When agent A rates a decision from wing B as helpful → increase A's affinity for B.
 * When agent A rates it unhelpful → decrease affinity.
 * Outcomes: successful outcome → small boost for all contributing wings.
 */

import { getDb } from '../db/index.js';
import type { WingAffinity } from '../types.js';

const DEFAULT_AFFINITY: WingAffinity = {
  cross_wing_weights: {},
  last_recalculated: new Date().toISOString(),
  feedback_count: 0,
};

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
 * - score >= 4 (useful/critical) → increase affinity for decision's wing by +0.05
 * - score <= 2 (irrelevant) → decrease affinity for decision's wing by -0.03
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
    await increaseWingAffinity(agentId, wing, 0.05);
  } else if (ratingScore <= 2) {
    await decreaseWingAffinity(agentId, wing, 0.03);
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
