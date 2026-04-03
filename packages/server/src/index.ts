import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.js';
import { initDb, closeDb } from '@nexus/core/db/index.js';
import { resolveLLMConfig, logLLMConfig } from '@nexus/core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = parseInt(process.env.PORT ?? '3100', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV ?? 'production';

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Locate the dashboard dist directory by checking several candidate paths.
 * Returns the directory path (containing index.html) or null when not found.
 */
function resolveDashboardPath(): string | null {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'dashboard', 'dist'),
    path.resolve(__dirname, '..', '..', '..', 'dashboard', 'dist'),
    path.resolve(process.cwd(), 'dashboard'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return null;
}

async function main() {
  // Auto-detect and connect to the database (SQLite or PostgreSQL).
  let db;
  try {
    db = await initDb();
    console.warn(`[nexus] Database connected (${db.dialect})`);
  } catch (err: unknown) {
    console.error('[nexus] FATAL: Cannot connect to database:', (err as Error).message);
    process.exit(1);
  }

  logLLMConfig(resolveLLMConfig());

  // Log auto-discovery config
  const openclawPath = process.env.NEXUS_OPENCLAW_PATH;
  const watchDir = process.env.NEXUS_WATCH_DIR;
  if (openclawPath) {
    const interval = process.env.NEXUS_DISCOVERY_INTERVAL || '30000';
    console.warn(`[nexus] Auto-discovery: openclaw connector watching ${openclawPath} (${parseInt(interval)/1000}s interval)`);
  } else if (watchDir) {
    const interval = process.env.NEXUS_DISCOVERY_INTERVAL || '30000';
    const pattern = process.env.NEXUS_WATCH_PATTERN || '*.md';
    console.warn(`[nexus] Auto-discovery: directory connector watching ${watchDir} (${pattern}, ${parseInt(interval)/1000}s interval)`);
  } else {
    console.warn('[nexus] Auto-discovery: no connectors configured (set NEXUS_OPENCLAW_PATH or NEXUS_WATCH_DIR)');
  }

  // Log contradiction detection
  console.warn('[nexus] Contradiction detection: enabled (semantic threshold: 0.75)');

  const app = createApp();

  // Serve the dashboard static files when they are available (non-Docker mode).
  const dashboardDist = resolveDashboardPath();
  if (dashboardDist) {
    app.get('/dashboard/*', serveStatic({ root: dashboardDist }));
    app.get('/dashboard', (c) => c.redirect('/dashboard/'));
    console.warn(`[nexus] Dashboard: http://${HOST}:${PORT}/dashboard`);
  }

  const server = serve(
    {
      fetch: app.fetch,
      port: PORT,
      hostname: HOST,
    },
    (info) => {
      console.warn(`[nexus] Server started`);
      console.warn(`[nexus] Listening on http://${HOST}:${info.port}`);
      console.warn(`[nexus] Environment: ${NODE_ENV}`);
    },
  );

  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.warn(`\n[nexus] Received ${signal}. Shutting down gracefully...`);

    server.close(async () => {
      console.warn('[nexus] HTTP server closed');

      try {
        await closeDb();
        console.warn('[nexus] Database closed');
      } catch (err) {
        console.error('[nexus] Error closing database:', (err as Error).message);
      }

      console.warn('[nexus] Shutdown complete');
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      console.error('[nexus] Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    console.error('[nexus] Uncaught exception:', err);
    void shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[nexus] Unhandled rejection:', reason);
  });
}

main().catch((err) => {
  console.error('[nexus] Fatal startup error:', err);
  process.exit(1);
});
