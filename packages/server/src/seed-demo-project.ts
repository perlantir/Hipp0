/**
 * Idempotent demo project seeder.
 * Creates a fixed "AI SaaS Platform (Demo)" project with 6 agents,
 * 50 decisions, decision edges, and contradictions for the public
 * playground. Skips entirely if the demo project already exists.
 *
 * Called once on server startup (after migrations).
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '@decigraph/core/db/index.js';
import { getRoleProfile } from '@decigraph/core/roles.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEMO_PROJECT_ID = 'demo-0000-0000-0000-000000000001';
const DEMO_TENANT_ID = 'a0000000-0000-4000-8000-000000000001';

interface DemoAgent {
  name: string;
  role: string;
  desc: string;
}

interface DemoDecision {
  title: string;
  desc: string;
  reasoning: string;
  alts: string[];
  tags: string[];
  affects: string[];
  confidence: string;
}

interface DemoData {
  agents: DemoAgent[];
  decisions: DemoDecision[];
}

/** Edges to create between decisions (by title prefix match). */
const DEMO_EDGES: Array<{ from: string; to: string; rel: string }> = [
  { from: 'JWT authentication', to: 'Refresh token rotation', rel: 'requires' },
  { from: 'Use microservices', to: 'Event-driven communication', rel: 'requires' },
  { from: 'PostgreSQL as primary', to: 'Database connection pooling', rel: 'requires' },
  { from: 'React 19 with Server', to: 'Tailwind CSS with custom', rel: 'informs' },
  { from: 'Hono framework', to: 'Zod validation', rel: 'informs' },
  { from: 'Docker Compose', to: 'GitHub Actions CI/CD', rel: 'informs' },
  { from: 'Freemium model', to: 'Pricing: Free / Pro', rel: 'requires' },
  { from: 'Rate limiting', to: 'JWT authentication', rel: 'depends_on' },
  { from: 'Monorepo with Turborepo', to: 'Docker Compose', rel: 'informs' },
  { from: 'Blue-green deployments', to: 'Fly.io for production', rel: 'depends_on' },
  { from: 'Row Level Security', to: 'JWT authentication', rel: 'depends_on' },
  { from: 'Mobile-first responsive', to: 'React 19 with Server', rel: 'informs' },
];

/** Contradictions to seed. */
const DEMO_CONTRADICTIONS: Array<{ a: string; b: string; desc: string; score: number }> = [
  {
    a: 'GraphQL for client-facing API',
    b: 'Hono framework for all API routes',
    desc: 'GraphQL and Hono REST routes serve overlapping purposes for client-facing APIs. Using both may create confusion about which to use for new endpoints.',
    score: 0.72,
  },
  {
    a: 'Use microservices architecture',
    b: 'Monorepo with Turborepo',
    desc: 'Microservices typically imply separate repos per service for independent deployment, but a monorepo centralizes everything. These approaches have conflicting deployment philosophies.',
    score: 0.65,
  },
  {
    a: 'Dark mode primary, light mode as toggle',
    b: 'Landing page hero with live interactive demo',
    desc: 'A dark-mode-first app may clash with marketing expectations for a bright, inviting landing page hero section.',
    score: 0.48,
  },
];

export async function seedDemoProject(): Promise<void> {
  const db = getDb();

  // ── Idempotency check: skip if demo project already exists ──────
  try {
    const existing = await db.query(
      'SELECT id FROM projects WHERE id = ?',
      [DEMO_PROJECT_ID],
    );
    if (existing.rows.length > 0) {
      console.warn('[decigraph/demo] Demo project already seeded — skipping');
      return;
    }
  } catch {
    // Table might not exist yet; let it fail later if so
  }

  console.warn('[decigraph/demo] Seeding demo project...');

  // ── Load demo data from JSON ────────────────────────────────────
  const jsonPath = path.join(__dirname, 'demo-decisions.json');
  if (!fs.existsSync(jsonPath)) {
    console.warn('[decigraph/demo] demo-decisions.json not found — skipping seed');
    return;
  }
  const data: DemoData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  // ── 1. Create demo project ─────────────────────────────────────
  await db.query(
    `INSERT INTO projects (id, name, description, tenant_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      DEMO_PROJECT_ID,
      'AI SaaS Platform (Demo)',
      'A realistic demo project showing how DeciGraph tracks architectural, security, frontend, backend, DevOps, and business decisions for an AI SaaS product.',
      DEMO_TENANT_ID,
      new Date().toISOString(),
    ],
  );

  // ── 2. Create agents ───────────────────────────────────────────
  const agentIds: Record<string, string> = {};
  for (const agent of data.agents) {
    const id = randomUUID();
    agentIds[agent.name] = id;
    const profile = getRoleProfile(agent.role);
    await db.query(
      `INSERT INTO agents (id, project_id, name, role, relevance_profile, context_budget_tokens, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, DEMO_PROJECT_ID, agent.name, agent.role, JSON.stringify(profile), 50000, DEMO_TENANT_ID],
    );
  }

  // ── 3. Create decisions ────────────────────────────────────────
  // Spread created_at dates over 30 days so the timeline looks realistic
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const decisionIds: Record<string, string> = {}; // title → id

  for (let i = 0; i < data.decisions.length; i++) {
    const d = data.decisions[i];
    const id = randomUUID();
    decisionIds[d.title] = id;

    // Evenly spread decisions across 30 days, newest first
    const offset = thirtyDays * (1 - i / data.decisions.length);
    const createdAt = new Date(now - offset).toISOString();

    // Pick made_by from first agent in affects list
    const madeBy = d.affects[0] || 'architect';

    await db.query(
      `INSERT INTO decisions (id, project_id, title, description, reasoning, made_by, source, confidence, status, alternatives_considered, affects, tags, created_at, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        DEMO_PROJECT_ID,
        d.title,
        d.desc,
        d.reasoning,
        madeBy,
        'demo-seed',
        d.confidence,
        'active',
        JSON.stringify(d.alts),
        db.arrayParam(d.tags),
        db.arrayParam(d.tags),
        createdAt,
        DEMO_TENANT_ID,
      ],
    );
  }

  // ── 4. Create decision edges ───────────────────────────────────
  let edgesCreated = 0;
  for (const edge of DEMO_EDGES) {
    const sourceTitle = Object.keys(decisionIds).find((t) => t.startsWith(edge.from));
    const targetTitle = Object.keys(decisionIds).find((t) => t.startsWith(edge.to));
    if (sourceTitle && targetTitle) {
      try {
        await db.query(
          `INSERT INTO decision_edges (source_id, target_id, relationship)
           VALUES (?, ?, ?)`,
          [decisionIds[sourceTitle], decisionIds[targetTitle], edge.rel],
        );
        edgesCreated++;
      } catch {
        // Edge table might not exist or constraint violation — skip
      }
    }
  }

  // ── 5. Create contradictions ───────────────────────────────────
  let contradictionsCreated = 0;
  for (const c of DEMO_CONTRADICTIONS) {
    const aTitle = Object.keys(decisionIds).find((t) => t.startsWith(c.a));
    const bTitle = Object.keys(decisionIds).find((t) => t.startsWith(c.b));
    if (aTitle && bTitle) {
      try {
        await db.query(
          `INSERT INTO contradictions (id, project_id, decision_a_id, decision_b_id, similarity_score, conflict_description, status, tenant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            DEMO_PROJECT_ID,
            decisionIds[aTitle],
            decisionIds[bTitle],
            c.score,
            c.desc,
            'unresolved',
            DEMO_TENANT_ID,
          ],
        );
        contradictionsCreated++;
      } catch {
        // Table may not exist — skip
      }
    }
  }

  console.warn(
    `[decigraph/demo] Seeded: 1 project, ${data.agents.length} agents, ${data.decisions.length} decisions, ${edgesCreated} edges, ${contradictionsCreated} contradictions`,
  );
}
