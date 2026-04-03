import type { ExtractedDecision } from '../types.js';
import { query } from '../db/pool.js';
import { generateEmbedding } from '../decision-graph/embeddings.js';

const DEDUP_SIMILARITY_THRESHOLD = 0.9;

interface SimilarDecisionRow {
  id: string;
  similarity: number;
}

/** Stage 2 — Remove decisions already represented in the DB via pgvector similarity. */
export async function deduplicateDecisions(
  projectId: string,
  extracted: ExtractedDecision[],
): Promise<ExtractedDecision[]> {
  if (extracted.length === 0) return [];

  const unique: ExtractedDecision[] = [];

  for (const decision of extracted) {
    const textToEmbed = `${decision.title}\n${decision.description}`;

    let embedding: number[];
    try {
      embedding = await generateEmbedding(textToEmbed);
    } catch (err) {
      console.error(
        `[nexus:distillery] deduplicateDecisions: embedding failed for "${decision.title}":`,
        err,
      );
      // Include when we can't verify — better a near-duplicate than silent drop
      unique.push(decision);
      continue;
    }

    // Zero-vector means embeddings unavailable (mock mode); skip similarity check
    const isZeroVector = embedding.every((v) => v === 0);
    if (isZeroVector) {
      unique.push(decision);
      continue;
    }

    const vectorLiteral = `[${embedding.join(',')}]`;

    let rows: SimilarDecisionRow[] = [];
    try {
      const result = await query<SimilarDecisionRow>(
        `SELECT id,
                1 - (embedding <=> $1::vector) AS similarity
         FROM decisions
         WHERE project_id = $2
           AND status = 'active'
           AND embedding IS NOT NULL
           AND 1 - (embedding <=> $1::vector) > $3
         ORDER BY similarity DESC
         LIMIT 1`,
        [vectorLiteral, projectId, DEDUP_SIMILARITY_THRESHOLD],
      );
      rows = result.rows;
    } catch (err) {
      console.error(
        `[nexus:distillery] deduplicateDecisions: similarity query failed for "${decision.title}":`,
        err,
      );
      unique.push(decision);
      continue;
    }

    if (rows.length > 0) {
      console.warn(
        `[nexus:distillery] Duplicate detected for "${decision.title}" ` +
          `(similarity=${rows[0]?.similarity?.toFixed(4)}); skipping.`,
      );
      continue;
    }

    unique.push(decision);
  }

  return unique;
}
