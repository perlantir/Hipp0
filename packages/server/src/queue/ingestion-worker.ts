/**
 * Ingestion Worker — validates, generates embedding, deduplicates, and inserts
 * a structured decision into the database.
 */
import { getDb } from '@decigraph/core/db/index.js';
import { generateEmbedding } from '@decigraph/core/decision-graph/embeddings.js';
import type { IngestionJobData, NotificationJobData } from './index.js';
import { addNotificationJob } from './index.js';

/**
 * Process ingestion job: embed, dedupe, insert.
 */
export async function handleIngestionJob(data: IngestionJobData): Promise<void> {
  const db = getDb();

  console.log(`[decigraph/ingestion] Processing: "${data.title}" source=${data.source} by=${data.made_by}`);

  // ── Dedupe check by source_session_id ────────────────────────────────────
  if (data.source_session_id) {
    try {
      const existing = await db.query(
        'SELECT id FROM decisions WHERE source_session_id = ? LIMIT 1',
        [data.source_session_id],
      );
      if (existing.rows.length > 0) {
        console.log(`[decigraph/ingestion] Duplicate skipped: source_session_id=${data.source_session_id}`);
        return;
      }
    } catch (err) {
      console.warn('[decigraph/ingestion] Dedupe check failed:', (err as Error).message);
      // Continue — better to potentially duplicate than to drop a decision
    }
  }

  // ── Generate embedding ───────────────────────────────────────────────────
  let vectorLiteral: string | null = null;
  try {
    const embedding = await generateEmbedding(`${data.title}\n${data.description}`);
    if (embedding && !embedding.every((v) => v === 0)) {
      vectorLiteral = `[${embedding.join(',')}]`;
    }
  } catch (err) {
    console.warn(`[decigraph/ingestion] Embedding failed for "${data.title}":`, (err as Error).message);
    // Continue without embedding — decision still gets inserted
  }

  // ── Validate project exists ──────────────────────────────────────────────
  try {
    const proj = await db.query('SELECT id FROM projects WHERE id = ?', [data.project_id]);
    if (proj.rows.length === 0) {
      console.error(`[decigraph/ingestion] Project not found: ${data.project_id}`);
      return;
    }
  } catch (err) {
    console.error(`[decigraph/ingestion] Project check failed:`, (err as Error).message);
    return;
  }

  // ── Insert decision ──────────────────────────────────────────────────────
  const confidenceScore = data.confidence === 'high' ? 0.9 : data.confidence === 'medium' ? 0.6 : 0.3;
  const autoApproveThreshold = parseFloat(process.env.DECIGRAPH_AUTO_APPROVE_THRESHOLD ?? '0.85');
  const autoApproved = confidenceScore >= autoApproveThreshold;
  const decisionStatus = autoApproved ? 'active' : 'pending';
  const reviewStatus = autoApproved ? 'approved' : 'pending_review';

  try {
    const result = await db.query(
      `INSERT INTO decisions
         (project_id, title, description, reasoning, made_by, source,
          source_session_id, confidence, status,
          alternatives_considered, affects, tags,
          review_status, embedding)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, title`,
      [
        data.project_id,
        data.title,
        data.description,
        data.reasoning,
        data.made_by,
        data.source,
        data.source_session_id,
        data.confidence,
        decisionStatus,
        JSON.stringify(data.alternatives_considered),
        db.arrayParam(data.affects),
        db.arrayParam(data.tags),
        reviewStatus,
        vectorLiteral,
      ],
    );

    const inserted = result.rows[0] as Record<string, unknown> | undefined;
    const decisionId = (inserted?.id as string) ?? 'unknown';

    console.log(`[decigraph/ingestion] Decision inserted: id=${decisionId} title="${data.title}" status=${decisionStatus}`);

    // ── Forward to notification queue ────────────────────────────────────
    const notificationData: NotificationJobData = {
      title: data.title,
      source: data.source,
      decision_id: decisionId,
    };

    // For Telegram, include chat/message info for reply
    if (data.source === 'telegram' && data.source_session_id) {
      const [chatId, messageId] = data.source_session_id.split(':');
      if (chatId) notificationData.chat_id = chatId;
      if (messageId) notificationData.message_id = parseInt(messageId, 10);
    }

    await addNotificationJob(notificationData);
  } catch (err) {
    console.error(`[decigraph/ingestion] Insert failed for "${data.title}":`, (err as Error).message);
    throw err; // Re-throw so BullMQ retries
  }
}
