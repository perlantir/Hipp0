/**
 * Cross-Tenant Pattern Intelligence — Pattern Extractor
 *
 * Extracts anonymous patterns from opted-in projects:
 * 1. Decision pairs — tags that co-occur in the same project
 * 2. Decision sequences — tag A typically followed by tag B within N days
 * 3. Common contradictions — tags that frequently conflict
 *
 * Privacy: only tags and generalized titles are stored. Never descriptions,
 * reasoning, team names, or identifying information.
 *
 * Patterns require 5+ unique tenants before being surfaced.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

/* ── Title Generalization ────────────────────────────────────────── */

/**
 * Strip specific tool names, numbers, and implementations from a title
 * while preserving the category and pattern. Uses regex-based approach
 * (LLM generalization can be added when available).
 */
function generalizeTitle(title: string): string {
  let result = title;

  // Remove specific tool/product names (common in software decisions)
  const toolPatterns = [
    /\b(PostgreSQL|MySQL|MongoDB|Redis|SQLite|DynamoDB|Cassandra|Supabase|PlanetScale|Neon)\b/gi,
    /\b(React|Vue|Angular|Svelte|Next\.?js|Nuxt|Remix|Astro)\b/gi,
    /\b(Express|Hono|Fastify|NestJS|Koa|Django|Rails|Flask|Spring)\b/gi,
    /\b(AWS|GCP|Azure|Fly\.io|Vercel|Netlify|Railway|Render|Heroku|Cloudflare)\b/gi,
    /\b(Stripe|PayPal|Braintree|Paddle)\b/gi,
    /\b(Docker|Kubernetes|K8s|Terraform|Ansible|Pulumi)\b/gi,
    /\b(GitHub|GitLab|Bitbucket|Linear|Jira|Asana|Notion)\b/gi,
    /\b(Tailwind|Shadcn|MUI|Chakra|Radix|Mantine)\b/gi,
    /\b(Jest|Vitest|Playwright|Cypress|Mocha)\b/gi,
    /\b(Sentry|Datadog|Grafana|Prometheus|New Relic|PagerDuty)\b/gi,
    /\b(JWT|OAuth2?|SAML|Auth0|Clerk|NextAuth)\b/gi,
    /\b(BullMQ|RabbitMQ|Kafka|NATS|SQS|PubSub)\b/gi,
  ];

  for (const pattern of toolPatterns) {
    result = result.replace(pattern, '').trim();
  }

  // Remove specific numbers/values
  result = result.replace(/\b\d+[-/]\w+\b/g, ''); // "15-minute", "5-min"
  result = result.replace(/\$\d+[/\w]*/g, '');     // "$29/mo"
  result = result.replace(/\b\d+%\b/g, '');        // "80%"

  // Clean up extra spaces and leading prepositions
  result = result.replace(/\s{2,}/g, ' ').trim();
  result = result.replace(/^(Use|with|for|via|on|in|using)\s+/i, '').trim();
  result = result.replace(/\s+(for|with|via|using)\s*$/i, '').trim();

  // If we stripped too much, return a generic version
  if (result.length < 10) {
    // Fallback: extract the core concept from original
    const words = title.split(/\s+/).filter((w) => w.length >= 4);
    result = words.slice(0, 4).join(' ') || title;
  }

  return result.charAt(0).toUpperCase() + result.slice(1);
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

async function upsertPattern(
  type: string,
  tagA: string,
  titleA: string | null,
  tagB: string | null,
  titleB: string | null,
  projectId: string,
  gapDays?: number,
): Promise<void> {
  const db = getDb();

  // Check if pattern exists
  const existing = await db.query(
    `SELECT id, occurrence_count, tenant_count
     FROM anonymous_patterns
     WHERE pattern_type = ? AND tag_a = ? AND (tag_b = ? OR (tag_b IS NULL AND ? IS NULL))`,
    [type, tagA, tagB, tagB],
  );

  if (existing.rows.length > 0) {
    const pattern = existing.rows[0] as Record<string, unknown>;
    const patternId = pattern.id as string;

    // Check if this tenant already contributed to this pattern
    const contributed = await db.query(
      'SELECT 1 FROM pattern_contributions WHERE project_id = ? AND pattern_id = ?',
      [projectId, patternId],
    );

    if (contributed.rows.length === 0) {
      // New tenant contribution — increment counts
      const newTenantCount = parseInt(String(pattern.tenant_count)) + 1;
      const newOccCount = parseInt(String(pattern.occurrence_count)) + 1;

      // Get total opted-in projects for confidence calculation
      const totalResult = await db.query(
        'SELECT COUNT(*) as c FROM projects WHERE share_anonymous_patterns = ?',
        [true],
      );
      const totalOptedIn = parseInt(String((totalResult.rows[0] as Record<string, unknown>).c)) || 1;
      const confidence = newTenantCount / totalOptedIn;

      await db.query(
        `UPDATE anonymous_patterns
         SET occurrence_count = ?, tenant_count = ?, confidence = ?, last_updated = ?
         WHERE id = ?`,
        [newOccCount, newTenantCount, confidence, new Date().toISOString(), patternId],
      );

      await db.query(
        'INSERT INTO pattern_contributions (id, project_id, pattern_id) VALUES (?, ?, ?)',
        [randomUUID(), projectId, patternId],
      );
    }
  } else {
    // New pattern
    const patternId = randomUUID();
    await db.query(
      `INSERT INTO anonymous_patterns
       (id, pattern_type, tag_a, title_pattern_a, tag_b, title_pattern_b,
        occurrence_count, tenant_count, median_gap_days)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`,
      [patternId, type, tagA, titleA, tagB, titleB, gapDays ?? null],
    );

    await db.query(
      'INSERT INTO pattern_contributions (id, project_id, pattern_id) VALUES (?, ?, ?)',
      [randomUUID(), projectId, patternId],
    );
  }
}

/* ── Pattern Extraction ──────────────────────────────────────────── */

export async function extractPatterns(): Promise<{ processed: number; patterns: number }> {
  const db = getDb();
  let processed = 0;
  let patternsCreated = 0;

  // Get opted-in projects only
  const projects = await db.query(
    'SELECT id FROM projects WHERE share_anonymous_patterns = ?',
    [true],
  );

  for (const row of projects.rows) {
    const projectId = (row as Record<string, unknown>).id as string;

    const decisions = await db.query(
      `SELECT title, tags, created_at
       FROM decisions
       WHERE project_id = ? AND status = 'active'
       ORDER BY created_at ASC`,
      [projectId],
    );

    if (decisions.rows.length < 10) continue; // need minimum data

    const decRows = decisions.rows as Array<Record<string, unknown>>;

    // ── Pattern Type 1: Decision Pairs (tag co-occurrence) ──────
    const allTags = [...new Set(
      decRows.flatMap((d) => parseTags(d.tags)),
    )];

    for (let i = 0; i < allTags.length; i++) {
      for (let j = i + 1; j < allTags.length; j++) {
        const [tagA, tagB] = [allTags[i], allTags[j]].sort();
        await upsertPattern('decision_pair', tagA, null, tagB, null, projectId);
        patternsCreated++;
      }
    }

    // ── Pattern Type 2: Decision Sequences (temporal) ───────────
    for (let i = 0; i < decRows.length - 1; i++) {
      for (let j = i + 1; j < Math.min(i + 5, decRows.length); j++) {
        const gapDays = (
          new Date(decRows[j].created_at as string).getTime() -
          new Date(decRows[i].created_at as string).getTime()
        ) / 86_400_000;

        if (gapDays > 14) break;

        const tagsA = parseTags(decRows[i].tags);
        const tagsB = parseTags(decRows[j].tags);

        for (const tagA of tagsA.slice(0, 2)) {
          for (const tagB of tagsB.slice(0, 2)) {
            if (tagA !== tagB) {
              await upsertPattern(
                'decision_sequence',
                tagA,
                generalizeTitle(decRows[i].title as string),
                tagB,
                generalizeTitle(decRows[j].title as string),
                projectId,
                Math.round(gapDays),
              );
              patternsCreated++;
            }
          }
        }
      }
    }

    // ── Pattern Type 3: Common Contradictions ────────────────────
    try {
      const contradictions = await db.query(
        `SELECT da.tags as tags_a, db.tags as tags_b
         FROM contradictions c
         JOIN decisions da ON c.decision_a_id = da.id
         JOIN decisions db ON c.decision_b_id = db.id
         WHERE c.project_id = ?`,
        [projectId],
      );

      for (const crow of contradictions.rows) {
        const cr = crow as Record<string, unknown>;
        for (const tagA of parseTags(cr.tags_a).slice(0, 2)) {
          for (const tagB of parseTags(cr.tags_b).slice(0, 2)) {
            await upsertPattern('contradiction_common', tagA, null, tagB, null, projectId);
            patternsCreated++;
          }
        }
      }
    } catch {
      // contradictions table might not exist
    }

    processed++;
  }

  console.warn(`[decigraph/patterns] Processed ${processed} projects, ${patternsCreated} pattern updates`);
  return { processed, patterns: patternsCreated };
}

/* ── Get Surfaceable Patterns ────────────────────────────────────── */

export async function getProjectPatterns(
  projectId: string,
): Promise<Array<Record<string, unknown>>> {
  const db = getDb();

  // Get this project's tags
  const decisions = await db.query(
    "SELECT tags FROM decisions WHERE project_id = ? AND status = 'active'",
    [projectId],
  );

  const projectTags = new Set<string>();
  for (const row of decisions.rows) {
    for (const tag of parseTags((row as Record<string, unknown>).tags)) {
      projectTags.add(tag);
    }
  }

  if (projectTags.size === 0) return [];

  // Get patterns with 5+ tenants that match this project's tags
  const patterns = await db.query(
    `SELECT * FROM anonymous_patterns
     WHERE active = ? AND tenant_count >= 5
     ORDER BY confidence DESC LIMIT 20`,
    [true],
  );

  const relevant: Array<Record<string, unknown>> = [];

  for (const row of patterns.rows) {
    const p = row as Record<string, unknown>;
    const tagA = p.tag_a as string;
    const tagB = p.tag_b as string | null;
    const type = p.pattern_type as string;
    const confidence = parseFloat(String(p.confidence));
    const tenantCount = parseInt(String(p.tenant_count));

    let message = '';

    if (type === 'decision_pair' && projectTags.has(tagA) && tagB && !projectTags.has(tagB)) {
      message = `${Math.round(confidence * 100)}% of teams with "${tagA}" decisions also have "${tagB}" decisions. You don't have any yet.`;
    } else if (type === 'decision_sequence' && projectTags.has(tagA) && tagB && !projectTags.has(tagB)) {
      message = `Teams that made "${tagA}" decisions typically follow up with "${tagB}" decisions within ${p.median_gap_days || 'a few'} days.`;
    } else if (type === 'contradiction_common' && projectTags.has(tagA) && tagB && projectTags.has(tagB)) {
      message = `"${tagA}" and "${tagB}" frequently conflict across teams. Review your decisions in these areas.`;
    } else if (type === 'gap_indicator' && projectTags.has(tagA) && tagB && !projectTags.has(tagB)) {
      message = `Teams with "${tagA}" but no "${tagB}" decisions often encounter issues later.`;
    } else {
      continue; // not relevant to this project
    }

    relevant.push({
      type,
      message,
      confidence,
      tenant_count: tenantCount,
      suggested_tag: tagB,
    });
  }

  return relevant.slice(0, 10);
}
