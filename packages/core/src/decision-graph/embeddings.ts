// Generates vector embeddings for text using OpenAI text-embedding-3-small
// or a mock zero-vector when no API key is configured.

import OpenAI from 'openai';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM = 1536;

let _openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!_openai) {
    _openai = new OpenAI({ apiKey: key });
  }
  return _openai;
}

/**
 * Generate a vector embedding for the given text.
 *
 * Returns a 1536-dimension float array. If OPENAI_API_KEY is not set,
 * returns a zero-vector so the rest of the pipeline can proceed in
 * test/development environments without making external API calls.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();

  if (!client) {
    console.warn('[nexus:embeddings] OPENAI_API_KEY not set — returning zero-vector embedding.');
    return new Array(EMBEDDING_DIM).fill(0) as number[];
  }

  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8191), // token safety ceiling
    });
    return response.data[0]?.embedding ?? (new Array(EMBEDDING_DIM).fill(0) as number[]);
  } catch (err) {
    console.error('[nexus:embeddings] Failed to generate embedding:', err);
    throw err;
  }
}

/**
 * Compute cosine similarity between two vectors.
 * Returns a value in [-1, 1]; identical vectors return 1.0.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
