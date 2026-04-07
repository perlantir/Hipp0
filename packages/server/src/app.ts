import { Hono } from 'hono';
// Auditing strategy: route-level logAudit() calls are used for targeted
// logging of important operations (decision CRUD, compile, validate, etc.).
// Per-request auditMiddleware is intentionally not mounted — it would log
// every GET request which is noisy and provides little value.
import {
  errorHandler,
  authMiddleware,
  corsMiddleware,
  requestTimer,
  requestId,
  securityHeaders,
  rateLimiter,
  bodyLimit,
} from './middleware/index.js';
import { phase3AuthMiddleware, optionalAuth, freeTierOrAuth, isAuthRequired } from './auth/middleware.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerDecisionRoutes } from './routes/decisions.js';
import { registerCompileRoutes } from './routes/compile.js';
import { registerDistilleryRoutes } from './routes/distillery.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerContradictionRoutes } from './routes/contradictions.js';
import { registerFeedbackRoutes } from './routes/feedback.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerStatsRoutes } from './routes/stats.js';
import { registerArtifactRoutes } from './routes/artifacts.js';
import { registerDiscoveryRoutes } from './routes/discovery.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerExportImportRoutes } from './routes/export-import.js';
import { registerDocsRoutes } from './routes/docs.js';
import { registerTimeTravelRoutes } from './routes/time-travel.js';
import { registerReviewRoutes } from './routes/review.js';
import { registerStatusRoutes } from './routes/status.js';
import { registerPhase2ContradictionRoutes } from './routes/phase2-contradictions.js';
import { registerPhase2EdgeRoutes } from './routes/phase2-edges.js';
import { registerImpactRoutes } from './routes/impact.js';
import { registerSlackConnector } from './connectors/slack.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerApiKeyRoutes } from './routes/api-keys.js';
import { registerTeamRoutes } from './routes/team.js';
import { registerAuditLogRoutes } from './routes/audit-log.js';
import { registerBillingRoutes, registerStripeWebhookRoute } from './routes/billing.js';
import { registerPolicyRoutes } from './routes/policies.js';
import { tierEnforcement } from './middleware/tierEnforcement.js';
import { getDb } from '@decigraph/core/db/index.js';

const SERVER_START_TIME = Date.now();

export function createApp() {
  const app = new Hono();

  // Global middleware stack
  app.use('*', requestId);
  app.use('*', requestTimer);
  app.use('*', securityHeaders);
  app.use('*', corsMiddleware);
  app.use('*', bodyLimit({ maxBytes: 2 * 1024 * 1024 }));

  // ── Phase 3: Global rate limiting ─────────────────────────────────
  // Unauthenticated: 60/min, Authenticated: 300/min (enforced in middleware)
  app.use('/api/*', rateLimiter({ maxRequests: 100 }));
  app.use('/api/compile', rateLimiter({ maxRequests: 30, windowMs: 60000, namespace: 'compile' }));
  app.use(
    '/api/*/distill*',
    rateLimiter({ maxRequests: 10, windowMs: 60000, namespace: 'distill' }),
  );
  app.use(
    '/api/*/decisions',
    rateLimiter({ maxRequests: 60, windowMs: 60000, namespace: 'decisions' }),
  );
  app.onError(errorHandler);

  // ── Phase 3: Auth middleware ───────────────────────────────────────
  // When DECIGRAPH_AUTH_REQUIRED=false (default), optionalAuth is used.
  // When true, phase3AuthMiddleware enforces JWT or API key.
  // Public routes are always exempt.
  app.use('/api/*', async (c, next) => {
    const path = c.req.path;

    // Always public
    if (
      path === '/api/health' ||
      path === '/api/health/ready' ||
      path === '/api/health/live' ||
      path === '/api/status' ||
      path === '/api/metrics' ||
      path === '/api/cache/clear' ||
      path === '/api/docs' ||
      path === '/api/openapi.json' ||
      path.startsWith('/api/auth/') ||
      path.startsWith('/api/team/invite/') ||
      path === '/api/webhooks/github' ||
      path === '/api/webhooks/slack/events' ||
      path === '/api/webhooks/slack/commands' ||
      path === '/api/webhooks/stripe'
    ) {
      await next();
      return;
    }

    // /api/compile uses free tier when auth is required
    if (path === '/api/compile') {
      await freeTierOrAuth(c, next);
      return;
    }

    // /api/distill/ask — same free tier logic
    if (path === '/api/distill/ask') {
      await freeTierOrAuth(c, next);
      return;
    }

    // All other /api/* routes
    if (isAuthRequired()) {
      await phase3AuthMiddleware(c, next);
    } else {
      // Legacy: optionalAuth attaches user if token present, defaults to nick tenant
      // Then fall through to original authMiddleware for DECIGRAPH_API_KEY compat
      await optionalAuth(c, async () => {
        if (process.env.DECIGRAPH_API_KEY) {
          await authMiddleware(c, next);
        } else {
          await next();
        }
      });
    }
  });

  // ── Phase 6: Tier enforcement (after auth, before routes) ──────────
  app.use('/api/*', tierEnforcement());

  // Health — enhanced with db latency, uptime, version
  app.get('/api/health', async (c) => {
    let dbLatencyMs = -1;
    try {
      const db = getDb();
      const start = Date.now();
      await db.query('SELECT 1', []);
      dbLatencyMs = Date.now() - start;
    } catch { /* db unavailable */ }

    return c.json({
      status: 'ok',
      version: '0.3.0',
      timestamp: new Date().toISOString(),
      db_latency_ms: dbLatencyMs,
      uptime_seconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
      node_env: process.env.NODE_ENV ?? 'production',
    });
  });

  // Liveness probe — always 200 (proves process is alive)
  app.get('/api/health/live', (c) => {
    return c.json({ status: 'ok' });
  });

  // Readiness probe — checks DB connection
  app.get('/api/health/ready', async (c) => {
    try {
      const db = getDb();
      await db.query('SELECT 1', []);
      return c.json({ status: 'ready' });
    } catch {
      return c.json({ status: 'not_ready', reason: 'database connection failed' }, 503);
    }
  });

  // Metrics endpoint — operational counters
  app.get('/api/metrics', async (c) => {
    try {
      const db = getDb();
      const [decisionsToday, compilesToday, avgCompile] = await Promise.all([
        db.query(
          "SELECT COUNT(*) as c FROM decisions WHERE created_at >= CURRENT_DATE",
          [],
        ).catch(() => ({ rows: [{ c: 0 }] })),
        db.query(
          "SELECT COUNT(*) as c FROM compile_history WHERE compiled_at >= CURRENT_DATE",
          [],
        ).catch(() => ({ rows: [{ c: 0 }] })),
        db.query(
          "SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (compiled_at - compiled_at)) * 1000), 0) as avg_ms FROM compile_history WHERE compiled_at >= CURRENT_DATE",
          [],
        ).catch(() => ({ rows: [{ avg_ms: 0 }] })),
      ]);

      return c.json({
        decisions_today: parseInt((decisionsToday.rows[0] as Record<string, unknown>).c as string ?? '0', 10),
        compiles_today: parseInt((compilesToday.rows[0] as Record<string, unknown>).c as string ?? '0', 10),
        avg_compile_ms: parseFloat((avgCompile.rows[0] as Record<string, unknown>).avg_ms as string ?? '0'),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // ── Phase 3: Auth, Team, API Key, Audit Log routes ────────────────
  registerAuthRoutes(app);
  registerApiKeyRoutes(app);
  registerTeamRoutes(app);
  registerAuditLogRoutes(app);

  // Register route modules
  registerProjectRoutes(app);
  registerAgentRoutes(app);
  registerDecisionRoutes(app);
  registerCompileRoutes(app);
  registerDistilleryRoutes(app);
  registerNotificationRoutes(app);
  registerContradictionRoutes(app);
  registerFeedbackRoutes(app);
  registerAuditRoutes(app);
  registerStatsRoutes(app);
  registerArtifactRoutes(app);
  registerDiscoveryRoutes(app);
  registerWebhookRoutes(app);
  registerExportImportRoutes(app);
  registerDocsRoutes(app);
  registerTimeTravelRoutes(app);
  registerReviewRoutes(app);
  registerStatusRoutes(app);
  registerPhase2ContradictionRoutes(app);
  registerPhase2EdgeRoutes(app);
  registerImpactRoutes(app);
  registerSlackConnector(app);

  // ── Governance: policy & violation management ──────────────────────
  registerPolicyRoutes(app);

  // ── Phase 6: Billing + Stripe webhook ─────────────────────────────
  registerBillingRoutes(app);
  registerStripeWebhookRoute(app);

  return app;
}

export default createApp();
