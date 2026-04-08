/**
 * H0C (Hipp0Condensed) Encoder — high-ratio compression for compiled decisions.
 *
 * Produces a compact, one-line-per-decision format with:
 * - Tag deduplication via a header index
 * - Field abbreviation (title→t, tags→g, score→s, etc.)
 * - Confidence shorthand (high→H, medium→M, low→L)
 * - Integer scores (0.92→92)
 * - Compact dates (2026-04-08T01:29:38.121Z→Apr8)
 *
 * Target: 12-18x token reduction vs full JSON.
 */

import type { ScoredDecision, ConfidenceLevel, SuggestedPattern } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Options                                                            */
/* ------------------------------------------------------------------ */

export interface H0CEncodeOptions {
  /** Include first-sentence reasoning hint (default: false) */
  includeReasoning?: boolean;
  /** Max words for description summary (default: 10) */
  maxDescriptionWords?: number;
}

/* ------------------------------------------------------------------ */
/*  Decoded decision type (returned by decoder)                        */
/* ------------------------------------------------------------------ */

export interface DecodedDecision {
  title: string;
  score: number;
  confidence: ConfidenceLevel;
  made_by: string;
  date: string;
  tags: string[];
  description: string;
  reasoning?: string;
  namespace?: string;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function confShorthand(c: ConfidenceLevel): string {
  if (c === 'high') return 'H';
  if (c === 'medium') return 'M';
  return 'L';
}

function compactDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${MONTH_NAMES[d.getMonth()]}${d.getDate()}`;
  } catch {
    return '';
  }
}

function truncateWords(text: string, maxWords: number): string {
  if (!text) return '';
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return words.slice(0, maxWords).join(' ').replace(/[.,;:!?]+$/, '');
}

function firstSentence(text: string): string {
  if (!text) return '';
  const match = text.match(/^[^.!?]*[.!?]/);
  return match ? match[0].trim() : text;
}

/** Escape pipe characters so they don't break the line format. */
function safePipe(val: string): string {
  return val.replace(/\|/g, '/').replace(/\n/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/*  Encoder                                                            */
/* ------------------------------------------------------------------ */

export function encodeH0C(
  decisions: ScoredDecision[],
  options?: H0CEncodeOptions,
): string {
  if (decisions.length === 0) return '#H0C v2\n---\n(empty)';

  const includeReasoning = options?.includeReasoning ?? false;
  const maxDescWords = options?.maxDescriptionWords ?? 5;

  // 1. Build tag index from all decisions
  const tagSet = new Set<string>();
  for (const d of decisions) {
    for (const tag of d.tags) {
      tagSet.add(tag);
    }
  }
  const tagList = [...tagSet];
  const tagIndex = new Map<string, number>();
  tagList.forEach((tag, i) => tagIndex.set(tag, i));

  // 2. Build header
  const tagHeader = tagList.map((t, i) => `${i}=${t}`).join(' ');
  const lines: string[] = [];
  lines.push(`#H0C v2`);
  if (tagList.length > 0) {
    lines.push(`#TAGS: ${tagHeader}`);
  }
  lines.push('---');

  // 3. One line per decision
  for (const d of decisions) {
    const score = Math.round((d.combined_score ?? 0) * 100);
    const conf = confShorthand(d.confidence);
    const by = safePipe(d.made_by);
    const date = compactDate(d.created_at);
    const title = safePipe(truncateWords(d.title, 8));

    // Tag references by index
    const tagRefs = d.tags.map((t) => tagIndex.get(t)).filter((i) => i !== undefined);
    const tagStr = tagRefs.length > 0 ? `g:${tagRefs.join(',')}` : '';

    // Description: first sentence, truncated
    const desc = safePipe(truncateWords(firstSentence(d.description), maxDescWords));

    // Namespace indicator
    const nsStr = d.namespace ? `ns:${safePipe(d.namespace)}` : '';

    // Build line: [score|conf|by:agent|date|ns:namespace] title|tags|description
    let line = `[${score}|${conf}|${by}|${date}${nsStr ? `|${nsStr}` : ''}]${title}`;
    if (tagStr) line += `|${tagStr}`;
    if (desc) line += `|${desc}`;

    // Optional reasoning hint
    if (includeReasoning && d.reasoning) {
      const reason = safePipe(truncateWords(firstSentence(d.reasoning), 8));
      if (reason) line += `|r:${reason}`;
    }

    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Encode suggested patterns into H0C patterns section.
 * Format: ---PATTERNS---
 * [P|confidence|source_count] title | description
 */
export function encodeH0CPatterns(patterns: SuggestedPattern[]): string {
  if (patterns.length === 0) return '';

  const lines: string[] = ['---PATTERNS---'];
  for (const p of patterns) {
    const conf = Math.round(p.confidence * 100);
    const title = safePipe(truncateWords(p.title, 8));
    const desc = safePipe(truncateWords(p.description, 12));
    lines.push(`[P|${conf}|${p.source_count}src] ${title} | ${desc}`);
  }
  return lines.join('\n');
}
