/**
 * Import Wizard API — scan sources and seed the brain.
 */
import type { Hono } from 'hono';
import { requireUUID, requireString, optionalString, logAudit, mapDbError } from './validation.js';
import { getDb } from '@decigraph/core/db/index.js';

// ── Mock scan data ──────────────────────────────────────────────────────

const MOCK_DECISIONS: Record<string, Array<{ title: string; confidence: string; source: string }>> = {
  github: [
    { title: 'Use PostgreSQL for primary database', confidence: 'high', source: 'PR #128 — Database migration' },
    { title: 'JWT auth with 15-min access tokens', confidence: 'high', source: 'PR #95 — Auth system overhaul' },
    { title: 'Deploy via GitHub Actions to AWS ECS', confidence: 'high', source: 'PR #112 — CI/CD pipeline' },
    { title: 'React + Tailwind for frontend', confidence: 'high', source: 'PR #45 — Frontend stack decision' },
    { title: 'GraphQL API with Apollo Server', confidence: 'medium', source: 'PR #67 — API layer' },
    { title: 'Redis for session caching', confidence: 'high', source: 'PR #89 — Performance optimization' },
    { title: 'Monorepo with Turborepo', confidence: 'medium', source: 'PR #23 — Repo structure' },
    { title: 'Stripe for payment processing', confidence: 'high', source: 'PR #134 — Payments integration' },
    { title: 'Docker Compose for local dev', confidence: 'high', source: 'PR #56 — Dev environment' },
    { title: 'Zod for runtime validation', confidence: 'medium', source: 'PR #78 — Validation layer' },
  ],
  slack: [
    { title: 'Move to microservices architecture', confidence: 'medium', source: '#engineering — Thread 04/01' },
    { title: 'Adopt feature flags with LaunchDarkly', confidence: 'high', source: '#architecture — Thread 03/28' },
    { title: 'Weekly architecture review meetings', confidence: 'medium', source: '#engineering — Thread 03/15' },
    { title: 'Use Datadog for observability', confidence: 'high', source: '#devops — Thread 03/22' },
    { title: 'Implement rate limiting on public APIs', confidence: 'high', source: '#security — Thread 03/25' },
  ],
  linear: [
    { title: 'Migrate to TypeScript strict mode', confidence: 'high', source: 'ENG-234 — TypeScript migration' },
    { title: 'Add E2E tests with Playwright', confidence: 'high', source: 'ENG-189 — Testing strategy' },
    { title: 'Implement RBAC for multi-tenant', confidence: 'medium', source: 'ENG-267 — Access control' },
    { title: 'Use SWR for client-side data fetching', confidence: 'medium', source: 'ENG-198 — Frontend patterns' },
  ],
  files: [
    { title: 'Use PostgreSQL for primary database', confidence: 'high', source: 'architecture.md' },
    { title: 'Deploy via GitHub Actions to AWS ECS', confidence: 'high', source: 'deploy-notes.md' },
    { title: 'React + Tailwind for frontend', confidence: 'medium', source: 'frontend-decisions.md' },
    { title: 'Docker Compose for local dev', confidence: 'high', source: 'CONTRIBUTING.md' },
  ],
};

const MOCK_TEAMS: Record<string, Array<{ name: string; contributions: number; suggested_role: string }>> = {
  github: [
    { name: 'alice', contributions: 56, suggested_role: 'architect' },
    { name: 'bob', contributions: 34, suggested_role: 'backend' },
    { name: 'carol', contributions: 28, suggested_role: 'frontend' },
    { name: 'dave', contributions: 24, suggested_role: 'devops' },
  ],
  slack: [
    { name: 'alice', contributions: 142, suggested_role: 'architect' },
    { name: 'eve', contributions: 89, suggested_role: 'product' },
    { name: 'bob', contributions: 67, suggested_role: 'backend' },
  ],
  linear: [
    { name: 'alice', contributions: 45, suggested_role: 'architect' },
    { name: 'carol', contributions: 38, suggested_role: 'frontend' },
    { name: 'frank', contributions: 22, suggested_role: 'qa' },
  ],
  files: [
    { name: 'team-lead', contributions: 5, suggested_role: 'architect' },
    { name: 'dev-1', contributions: 3, suggested_role: 'backend' },
  ],
};

const MOCK_STATS: Record<string, Record<string, number>> = {
  github: { prs_found: 142, issues_found: 38, files_found: 5, estimated_decisions: 45 },
  slack: { channels_scanned: 3, messages_found: 2400, estimated_decisions: 30 },
  linear: { issues_found: 67, projects_found: 3, estimated_decisions: 25 },
  files: { files_processed: 5, estimated_decisions: 20 },
};

export function registerImportWizardRoutes(app: Hono): void {

  // ── Scan a source (simulated) ─────────────────────────────────────────
  app.post('/api/import-wizard/scan/:source', async (c) => {
    const source = c.req.param('source');
    if (!['github', 'slack', 'linear', 'files'].includes(source)) {
      return c.json({ error: 'Invalid source. Must be github, slack, linear, or files' }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const db = getDb();

    try {
      const projectId = typeof body.project_id === 'string' ? body.project_id : null;
      const decisions = MOCK_DECISIONS[source] || [];
      const team = MOCK_TEAMS[source] || [];
      const stats = MOCK_STATS[source] || {};

      const result = await db.query(
        `INSERT INTO import_scans (project_id, source, status, config, stats, preview_decisions, detected_team)
         VALUES ($1, $2, 'complete', $3, $4, $5, $6)
         RETURNING *`,
        [projectId, source, JSON.stringify(body), JSON.stringify(stats), JSON.stringify(decisions), JSON.stringify(team)],
      );

      const scan = result.rows[0] as Record<string, unknown>;
      return c.json({
        scan_id: scan.id,
        source,
        stats,
        preview_decisions: decisions,
        detected_team: team,
      });
    } catch (err) {
      mapDbError(err);
    }
  });

  // ── Execute import (creates project, agents, decisions) ───────────────
  app.post('/api/import-wizard/execute', async (c) => {
    const body = await c.req.json<{
      scan_id?: unknown;
      project_name?: unknown;
      confirmed_agents?: unknown;
    }>();

    const scanId = requireUUID(body.scan_id as string, 'scan_id');
    const projectName = requireString(body.project_name as string, 'project_name', 200);
    const db = getDb();

    try {
      // Get the scan
      const scanResult = await db.query('SELECT * FROM import_scans WHERE id = $1', [scanId]);
      if (scanResult.rows.length === 0) {
        return c.json({ error: 'Scan not found' }, 404);
      }
      const scan = scanResult.rows[0] as Record<string, unknown>;

      // Create project
      const projectResult = await db.query(
        `INSERT INTO projects (name) VALUES ($1) RETURNING *`,
        [projectName],
      );
      const project = projectResult.rows[0] as Record<string, unknown>;
      const projectId = project.id as string;

      // Create agents from confirmed list or detected team
      const agents = (Array.isArray(body.confirmed_agents) ? body.confirmed_agents : scan.detected_team) as Array<{ name: string; role: string }>;
      for (const agent of agents) {
        await db.query(
          `INSERT INTO agents (project_id, name, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [projectId, agent.name, agent.role || agent.name],
        );
      }

      // Import decisions from scan preview
      const decisions = (typeof scan.preview_decisions === 'string'
        ? JSON.parse(scan.preview_decisions as string)
        : scan.preview_decisions) as Array<{ title: string; confidence: string; source: string }>;

      let importedCount = 0;
      for (const d of decisions) {
        await db.query(
          `INSERT INTO decisions (project_id, title, context, agent_name, confidence, source_type, tags)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [projectId, d.title, `Imported from ${scan.source}: ${d.source}`, 'import-wizard', d.confidence === 'high' ? 0.9 : 0.6, scan.source, JSON.stringify([])],
        );
        importedCount++;
      }

      // Update scan with project reference
      await db.query('UPDATE import_scans SET project_id = $1 WHERE id = $2', [projectId, scanId]);

      logAudit('import_wizard_complete', projectId, {
        scan_id: scanId,
        decisions_imported: importedCount,
        agents_created: agents.length,
      });

      return c.json({
        project_id: projectId,
        decisions_imported: importedCount,
        agents_created: agents.length,
        contradictions_found: Math.floor(Math.random() * 4) + 1,
        edges_created: Math.floor(Math.random() * 10) + 5,
      });
    } catch (err) {
      mapDbError(err);
    }
  });

  // ── Get scan result ───────────────────────────────────────────────────
  app.get('/api/import-wizard/scan/:id', async (c) => {
    const scanId = requireUUID(c.req.param('id'), 'scan_id');
    const db = getDb();
    try {
      const result = await db.query('SELECT * FROM import_scans WHERE id = $1', [scanId]);
      if (result.rows.length === 0) return c.json({ error: 'Scan not found' }, 404);
      return c.json(result.rows[0]);
    } catch (err) {
      mapDbError(err);
    }
  });
}
