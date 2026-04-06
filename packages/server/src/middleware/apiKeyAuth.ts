/**
 * Per-project API Key Auth Middleware
 *
 * Bearer token authentication on all /api/* routes.
 * - Public routes are exempt (passed through)
 * - If no Authorization header is present, passes through to let
 *   downstream auth (Phase 3) handle it
 * - If Bearer token starts with dg_live_ or dg_test_, validates via
 *   SHA-256 hash lookup and applies per-key rate limiting
 * - Legacy DECIGRAPH_API_KEY env var is supported for backwards compat
 * - last_used_at is updated on each request (fire-and-forget)
 */
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import crypto from 'node:crypto';
import { getDb } from '@decigraph/core/db/index.js';

const PUBLIC_ROUTES = new Set([
  '/api/health',
  '/health',
  '/api/docs',
  '/api/openapi.json',
  '/api/metrics',
  '/api/health/ready',
  '/api/health/live',
  '/api/status',
  '/api/cache/clear',
]);

const PUBLIC_PREFIXES = [
  '/api/auth/',
  '/api/team/invite/',
  '/api/webhooks/',
];

// ── Per-key sliding window rate limiter ────────────────────────────────
interface SlidingWindow {
  timestamps: number[];
}

const perKeyRateStore = new Map<string, SlidingWindow>();

// Prune every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of perKeyRateStore) {
    entry.timestamps = entry.timestamps.filter((t) => t > now - 60_000);
    if (entry.timestamps.length === 0) perKeyRateStore.delete(key);
  }
}, 60_000).unref();

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function checkPerKeyRateLimit(keyHash: string, maxPerMinute: number): RateLimitResult {
  const now = Date.now();
  let entry = perKeyRateStore.get(keyHash);
  if (!entry) {
    entry = { timestamps: [] };
    perKeyRateStore.set(keyHash, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => t > now - 60_000);

  if (entry.timestamps.length >= maxPerMinute) {
    const oldest = entry.timestamps[0] ?? now;
    const retryMs = oldest + 60_000 - now;
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(retryMs / 1000) };
  }

  entry.timestamps.push(now);
  return { allowed: true, remaining: maxPerMinute - entry.timestamps.length, retryAfterSeconds: 0 };
}

function getRateLimitForPath(path: string): number {
  if (path === '/api/compile' || path.endsWith('/compile')) return 20;
  if (path.includes('/distill')) return 10;
  return 100;
}

export const apiKeyAuthMiddleware: MiddlewareHandler = createMiddleware(async (c, next) => {
  const path = c.req.path;

  // Skip auth for public routes
  if (PUBLIC_ROUTES.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    return next();
  }

  // Extract Bearer token — if none, pass through to Phase 3 auth
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);

  // If it's not a dg_ key, let Phase 3 auth handle it (could be JWT)
  if (!token.startsWith('dg_live_') && !token.startsWith('dg_test_')) {
    // Check legacy env var key
    const legacyKey = process.env.DECIGRAPH_API_KEY || process.env.NEXUS_API_KEY;
    if (legacyKey && token === legacyKey) {
      return next();
    }
    // Not a dg_ key — pass through for JWT handling
    return next();
  }

  // Hash the provided key and look it up
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const db = getDb();
  const result = await db.query(
    `SELECT ak.id, ak.project_id, ak.revoked_at, ak.expires_at
     FROM api_keys ak
     WHERE ak.key_hash = ? AND ak.revoked_at IS NULL`,
    [hash],
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'Invalid API key' }, 401);
  }

  const keyRecord = result.rows[0] as Record<string, unknown>;

  if (keyRecord.expires_at && new Date(keyRecord.expires_at as string) < new Date()) {
    return c.json({ error: 'API key expired' }, 401);
  }

  // Per-key rate limiting
  const maxRate = getRateLimitForPath(path);
  const rateCheck = checkPerKeyRateLimit(hash, maxRate);
  if (!rateCheck.allowed) {
    return c.json(
      { error: 'Rate limit exceeded', retry_after_seconds: rateCheck.retryAfterSeconds },
      429,
    );
  }

  // Update last_used_at (fire and forget)
  db.query(
    'UPDATE api_keys SET last_used_at = ? WHERE id = ?',
    [new Date().toISOString(), keyRecord.id],
  ).catch(() => {});

  // Attach to request context
  c.set('projectId', keyRecord.project_id);
  c.set('apiKeyId', keyRecord.id);
  return next();
});
