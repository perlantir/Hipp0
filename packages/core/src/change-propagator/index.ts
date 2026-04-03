import { query, transaction } from '../db/pool.js';
import { parseSubscription, parseNotification, parseAgent } from '../db/parsers.js';
import { NexusError, NotFoundError, ValidationError } from '../types.js';
import { getRoleNotificationContext } from '../roles.js';
import type {
  Agent,
  Decision,
  Subscription,
  CreateSubscriptionInput,
  Notification,
  NotificationType,
  Urgency,
} from '../types.js';

/**
 * Map a NotificationType to a default urgency level.
 */
function defaultUrgency(notificationType: NotificationType): Urgency {
  switch (notificationType) {
    case 'decision_superseded':
    case 'decision_reverted':
    case 'contradiction_detected':
    case 'blocked':
      return 'high';
    case 'assumption_invalidated':
    case 'dependency_changed':
      return 'medium';
    case 'decision_created':
    case 'decision_updated':
    case 'artifact_updated':
    case 'unblocked':
      return 'low';
    default:
      return 'medium';
  }
}

/**
 * Build a human-readable notification message for a given decision + event type.
 */
function buildMessage(decision: Decision, eventType: NotificationType): string {
  switch (eventType) {
    case 'decision_created':
      return `New decision created: "${decision.title}" (by ${decision.made_by})`;
    case 'decision_updated':
      return `Decision updated: "${decision.title}" (by ${decision.made_by})`;
    case 'decision_superseded':
      return `Decision "${decision.title}" has been superseded`;
    case 'decision_reverted':
      return `Decision "${decision.title}" has been reverted`;
    case 'contradiction_detected':
      return `Contradiction detected involving decision: "${decision.title}"`;
    case 'blocked':
      return `Decision "${decision.title}" is blocking progress`;
    case 'unblocked':
      return `Decision "${decision.title}" is no longer blocking`;
    case 'assumption_invalidated':
      return `An assumption in decision "${decision.title}" may have been invalidated`;
    case 'dependency_changed':
      return `A dependency of decision "${decision.title}" has changed`;
    case 'artifact_updated':
      return `An artifact related to decision "${decision.title}" has been updated`;
    default:
      return `Update related to decision: "${decision.title}"`;
  }
}

/**
 * Determine whether a subscription's notify_on list includes the given event type.
 * NotifyEvent ⊆ NotificationType — map notification types to notify events.
 */
function eventTypeMatchesNotifyOn(eventType: NotificationType, sub: Subscription): boolean {
  // Wildcard subscriptions (notify_on is empty) always match
  if (!sub.notify_on || sub.notify_on.length === 0) return true;

  const mapping: Record<NotificationType, string> = {
    decision_created: 'update',
    decision_updated: 'update',
    decision_superseded: 'supersede',
    decision_reverted: 'revert',
    artifact_updated: 'update',
    blocked: 'update',
    unblocked: 'update',
    contradiction_detected: 'contradict',
    assumption_invalidated: 'update',
    dependency_changed: 'update',
  };

  const mapped = mapping[eventType];
  if (!mapped) return true;
  return sub.notify_on.includes(mapped as Subscription['notify_on'][number]);
}

// --- Subscription CRUD ---

/**
 * Create a new subscription for an agent to a topic.
 * Supports topic patterns:
 *   - "tag:security"     — subscribe to a specific tag
 *   - "tag:*"            — subscribe to all tags (wildcard)
 *   - "decision:<uuid>"  — subscribe to a specific decision
 */
export async function createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
  const {
    agent_id,
    topic,
    notify_on = ['update', 'supersede', 'revert'],
    priority = 'medium',
  } = input;

  if (!agent_id || !topic) {
    throw new ValidationError('agent_id and topic are required to create a subscription');
  }

  const agentCheck = await query<Record<string, unknown>>(
    `SELECT id FROM agents WHERE id = $1 LIMIT 1`,
    [agent_id],
  );
  if (agentCheck.rows.length === 0) {
    throw new NotFoundError('Agent', agent_id);
  }

  try {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO subscriptions (agent_id, topic, notify_on, priority)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agent_id, topic) DO UPDATE
         SET notify_on = EXCLUDED.notify_on,
             priority  = EXCLUDED.priority
       RETURNING *`,
      [agent_id, topic, notify_on, priority],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NexusError('Failed to create subscription', 'CREATE_FAILED', 500);
    }
    return parseSubscription(row);
  } catch (err) {
    if (err instanceof NexusError) throw err;
    throw new NexusError(
      `Failed to create subscription: ${(err as Error).message}`,
      'DB_ERROR',
      500,
    );
  }
}

/**
 * Retrieve all subscriptions for a given agent.
 */
export async function getSubscriptions(agentId: string): Promise<Subscription[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT * FROM subscriptions WHERE agent_id = $1 ORDER BY created_at ASC`,
    [agentId],
  );
  return result.rows.map(parseSubscription);
}

/**
 * Delete a subscription by its ID.
 */
export async function deleteSubscription(id: string): Promise<void> {
  const result = await query(`DELETE FROM subscriptions WHERE id = $1`, [id]);
  if ((result.rowCount ?? 0) === 0) {
    throw new NotFoundError('Subscription', id);
  }
}

// --- Subscription Matching ---

/**
 * Match a decision + event type against all subscriptions.
 * Supports:
 *   - Exact tag match:   "tag:<tagname>"
 *   - Wildcard tag:      "tag:*"
 *   - Decision ID match: "decision:<uuid>"
 *
 * Returns matched subscriptions paired with their owning agents.
 */
export async function matchSubscriptions(
  decision: Decision,
  eventType: string,
): Promise<Array<{ subscription: Subscription; agent: Agent }>> {
  const result = await query<Record<string, unknown>>(
    `SELECT s.*, a.id AS a_id, a.project_id AS a_project_id, a.name AS a_name,
            a.role AS a_role, a.relevance_profile AS a_relevance_profile,
            a.context_budget_tokens AS a_context_budget_tokens,
            a.created_at AS a_created_at, a.updated_at AS a_updated_at
       FROM subscriptions s
       JOIN agents a ON a.id = s.agent_id
      WHERE a.project_id = $1`,
    [decision.project_id],
  );

  const matches: Array<{ subscription: Subscription; agent: Agent }> = [];

  for (const row of result.rows) {
    const sub = parseSubscription(row);

    const agentRow: Record<string, unknown> = {
      id: row['a_id'],
      project_id: row['a_project_id'],
      name: row['a_name'],
      role: row['a_role'],
      relevance_profile: row['a_relevance_profile'],
      context_budget_tokens: row['a_context_budget_tokens'],
      created_at: row['a_created_at'],
      updated_at: row['a_updated_at'],
    };
    const agent = parseAgent(agentRow);

    if (!eventTypeMatchesNotifyOn(eventType as NotificationType, sub)) {
      continue;
    }

    let topicMatches = false;
    const topic = sub.topic;

    if (topic === 'tag:*') {
      // Wildcard: matches any decision with at least one tag
      topicMatches = decision.tags.length >= 0; // always true
    } else if (topic.startsWith('tag:')) {
      const tagName = topic.slice('tag:'.length);
      topicMatches = decision.tags.includes(tagName);
    } else if (topic.startsWith('decision:')) {
      const decisionId = topic.slice('decision:'.length);
      topicMatches = decision.id === decisionId;
    } else {
      // Fallback: treat topic as a plain tag name
      topicMatches = decision.tags.includes(topic);
    }

    if (topicMatches) {
      matches.push({ subscription: sub, agent });
    }
  }

  return matches;
}

// --- Change Propagation ---

/**
 * Propagate a decision change event to all matching subscribers.
 *
 * - Finds all agents subscribed to matching topics
 * - Generates role-appropriate notifications using ROLE_TEMPLATES notification_context
 * - Persists notifications to the notifications table
 * - Invalidates affected context cache entries
 *
 * Returns the list of created Notification objects.
 */
export async function propagateChange(
  decision: Decision,
  eventType: NotificationType,
): Promise<Notification[]> {
  const matches = await matchSubscriptions(decision, eventType);
  if (matches.length === 0) return [];

  const created: Notification[] = [];

  await transaction(async (client) => {
    for (const { subscription, agent } of matches) {
      const message = buildMessage(decision, eventType);
      const roleContext = getRoleNotificationContext(agent.role);
      const urgency = defaultUrgency(eventType);

      // Apply subscription priority to upgrade urgency
      let resolvedUrgency: Urgency = urgency;
      if (subscription.priority === 'high' && urgency !== 'critical') {
        resolvedUrgency = urgency === 'medium' || urgency === 'low' ? 'high' : urgency;
      }

      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO notifications
           (agent_id, decision_id, notification_type, message, role_context, urgency)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [agent.id, decision.id, eventType, message, roleContext, resolvedUrgency],
      );

      const row = result.rows[0];
      if (row) {
        created.push(parseNotification(row));
      }
    }
  });

  try {
    await invalidateCache(decision.id);
  } catch (err) {
    console.warn('[nexus:change-propagator] Cache invalidation failed:', (err as Error).message);
  }

  try {
    await query(
      `INSERT INTO audit_log (event_type, decision_id, project_id, details)
       VALUES ($1, $2, $3, $4)`,
      [
        'change_propagated',
        decision.id,
        decision.project_id,
        JSON.stringify({
          notification_type: eventType,
          notifications_created: created.length,
          // TODO: WebSocket support for real-time push notifications
          matched_agents: matches.map((m) => m.agent.name),
        }),
      ],
    );
  } catch (err) {
    console.warn('[nexus:change-propagator] Audit log write failed:', (err as Error).message);
  }

  return created;
}

// --- Cache Invalidation ---

/**
 * Delete all context cache entries that include the given decision ID.
 * Returns the number of cache entries invalidated.
 */
export async function invalidateCache(decisionId: string): Promise<number> {
  const result = await query(
    `DELETE FROM context_cache
      WHERE $1 = ANY(decision_ids_included)`,
    [decisionId],
  );
  return result.rowCount ?? 0;
}

// --- Notification Retrieval ---

/**
 * Retrieve notifications for an agent, optionally filtered to unread only.
 */
export async function getNotifications(
  agentId: string,
  unreadOnly = false,
): Promise<Notification[]> {
  let sql = `SELECT * FROM notifications WHERE agent_id = $1`;
  if (unreadOnly) {
    sql += ` AND read_at IS NULL`;
  }
  sql += ` ORDER BY created_at DESC`;

  const result = await query<Record<string, unknown>>(sql, [agentId]);
  return result.rows.map(parseNotification);
}

/**
 * Mark a notification as read, recording the current timestamp.
 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const result = await query(
    `UPDATE notifications SET read_at = NOW() WHERE id = $1 AND read_at IS NULL`,
    [notificationId],
  );
  if ((result.rowCount ?? 0) === 0) {
    // Either already read or not found — treat both gracefully
    const check = await query(`SELECT id FROM notifications WHERE id = $1`, [notificationId]);
    if (check.rowCount === 0) {
      throw new NotFoundError('Notification', notificationId);
    }
    // Already read — no-op is acceptable
  }
}

// Re-export error classes for convenience
export { NexusError, NotFoundError, ValidationError };
