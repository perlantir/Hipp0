import { query, transaction } from '../db/pool.js';
import { parseFeedback } from '../db/parsers.js';
import type { RelevanceFeedback, RelevanceProfile, CreateFeedbackInput } from '../types.js';
import { NotFoundError, NexusError } from '../types.js';

/** Gradient descent learning rate for weight adjustment. */
const LEARNING_RATE = 0.05;

/** Minimum allowed weight value after adjustment. */
const WEIGHT_MIN = 0.0;

/** Maximum allowed weight value after adjustment. */
const WEIGHT_MAX = 1.0;

async function fetchAgentById(agentId: string): Promise<{
  id: string;
  project_id: string;
  relevance_profile: RelevanceProfile;
}> {
  const result = await query<{
    id: string;
    project_id: string;
    relevance_profile: unknown;
    decision_depth: number;
    freshness_preference: string;
    include_superseded: boolean;
  }>(`SELECT id, project_id, relevance_profile FROM agents WHERE id = $1`, [agentId]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Agent', agentId);
  }

  const row = result.rows[0];
  let profile: RelevanceProfile;

  const raw = row.relevance_profile;
  if (typeof raw === 'string') {
    try {
      profile = JSON.parse(raw) as RelevanceProfile;
    } catch {
      profile = {
        weights: {},
        decision_depth: 2,
        freshness_preference: 'balanced',
        include_superseded: false,
      };
    }
  } else if (raw && typeof raw === 'object') {
    profile = raw as RelevanceProfile;
  } else {
    profile = {
      weights: {},
      decision_depth: 2,
      freshness_preference: 'balanced',
      include_superseded: false,
    };
  }

  return { id: row.id, project_id: row.project_id, relevance_profile: profile };
}

async function fetchDecisionTags(decisionId: string): Promise<string[]> {
  const result = await query<{ tags: unknown }>(`SELECT tags FROM decisions WHERE id = $1`, [
    decisionId,
  ]);

  if (result.rows.length === 0) return [];

  const tags = result.rows[0].tags;
  if (Array.isArray(tags)) return tags as string[];
  if (typeof tags === 'string' && tags.startsWith('{')) {
    return tags.slice(1, -1).split(',').filter(Boolean);
  }
  return [];
}

/**
 * Record a feedback event (useful / not useful) for a decision shown to an agent.
 */
export async function recordFeedback(input: CreateFeedbackInput): Promise<RelevanceFeedback> {
  await fetchAgentById(input.agent_id);

  const decisionCheck = await query<{ id: string }>(`SELECT id FROM decisions WHERE id = $1`, [
    input.decision_id,
  ]);
  if (decisionCheck.rows.length === 0) {
    throw new NotFoundError('Decision', input.decision_id);
  }

  const result = await query<Record<string, unknown>>(
    `INSERT INTO relevance_feedback
       (agent_id, decision_id, compile_request_id, was_useful, usage_signal)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.agent_id,
      input.decision_id,
      input.compile_request_id ?? null,
      input.was_useful,
      input.usage_signal ?? null,
    ],
  );

  return parseFeedback(result.rows[0]);
}

/**
 * Retrieve all feedback records for a given agent.
 */
export async function getFeedbackForAgent(agentId: string): Promise<RelevanceFeedback[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT rf.* FROM relevance_feedback rf
     WHERE rf.agent_id = $1
     ORDER BY rf.created_at DESC`,
    [agentId],
  );

  return result.rows.map(parseFeedback);
}

/**
 * Evolve the relevance weights for an agent based on accumulated feedback.
 *
 * Algorithm:
 * - Load all feedback for the agent.
 * - For each feedback item, fetch the associated decision's tags.
 * - Group feedback by tag and compute useful_rate per tag.
 * - Adjust each tag weight: new_weight = old_weight + LEARNING_RATE * (useful_rate - 0.5) * 2
 *   — Moves weight up when useful_rate > 0.5, down when < 0.5.
 *   — Clamp result to [0, 1].
 * - Persist updated profile to agents table.
 */
export async function evolveWeights(agentId: string): Promise<RelevanceProfile> {
  const agent = await fetchAgentById(agentId);
  const feedbackList = await getFeedbackForAgent(agentId);

  if (feedbackList.length === 0) {
    return agent.relevance_profile;
  }

  const tagStats: Record<string, { useful: number; total: number }> = {};

  await Promise.all(
    feedbackList.map(async (fb) => {
      const tags = await fetchDecisionTags(fb.decision_id);
      for (const tag of tags) {
        if (!tagStats[tag]) {
          tagStats[tag] = { useful: 0, total: 0 };
        }
        tagStats[tag].total += 1;
        if (fb.was_useful) {
          tagStats[tag].useful += 1;
        }
      }
    }),
  );

  const oldWeights = { ...agent.relevance_profile.weights };
  const newWeights = { ...oldWeights };

  for (const [tag, stats] of Object.entries(tagStats)) {
    if (stats.total === 0) continue;
    const usefulRate = stats.useful / stats.total;

    // delta = LEARNING_RATE * (useful_rate - 0.5) * 2 ∈ [-0.1, +0.1]
    const delta = LEARNING_RATE * (usefulRate - 0.5) * 2;
    const currentWeight = newWeights[tag] ?? 0.5;
    newWeights[tag] = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, currentWeight + delta));
  }

  const updatedProfile: RelevanceProfile = {
    ...agent.relevance_profile,
    weights: newWeights,
  };

  await query(
    `UPDATE agents
     SET relevance_profile = $2, updated_at = NOW()
     WHERE id = $1`,
    [agentId, JSON.stringify(updatedProfile)],
  );

  return updatedProfile;
}

/**
 * Return statistics about how weights have evolved for an agent.
 *
 * Computes what the weights WOULD become after evolution without persisting,
 * and diffs against current weights to report changes.
 */
export async function getEvolutionStats(agentId: string): Promise<{
  total_feedback: number;
  useful_rate: number;
  weight_changes: Record<string, { before: number; after: number }>;
}> {
  const agent = await fetchAgentById(agentId);
  const feedbackList = await getFeedbackForAgent(agentId);

  const totalFeedback = feedbackList.length;
  const usefulCount = feedbackList.filter((fb) => fb.was_useful).length;
  const usefulRate = totalFeedback > 0 ? usefulCount / totalFeedback : 0;

  if (totalFeedback === 0) {
    return { total_feedback: 0, useful_rate: 0, weight_changes: {} };
  }

  const tagStats: Record<string, { useful: number; total: number }> = {};

  await Promise.all(
    feedbackList.map(async (fb) => {
      const tags = await fetchDecisionTags(fb.decision_id);
      for (const tag of tags) {
        if (!tagStats[tag]) {
          tagStats[tag] = { useful: 0, total: 0 };
        }
        tagStats[tag].total += 1;
        if (fb.was_useful) {
          tagStats[tag].useful += 1;
        }
      }
    }),
  );

  const oldWeights = { ...agent.relevance_profile.weights };
  const weightChanges: Record<string, { before: number; after: number }> = {};

  for (const [tag, stats] of Object.entries(tagStats)) {
    if (stats.total === 0) continue;
    const usefulRate = stats.useful / stats.total;
    const delta = LEARNING_RATE * (usefulRate - 0.5) * 2;
    const before = oldWeights[tag] ?? 0.5;
    const after = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, before + delta));

    if (Math.abs(after - before) > 1e-9) {
      weightChanges[tag] = { before, after };
    }
  }

  return {
    total_feedback: totalFeedback,
    useful_rate: usefulRate,
    weight_changes: weightChanges,
  };
}
