import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { getPool, closePool } from '@nexus/core/db/pool.js';
import { resolveLLMConfig, logLLMConfig } from '@nexus/core';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV ?? 'production';

async function main() {
  // Validate DB connectivity at startup to catch misconfiguration early
  try {
    const pool = getPool();
    const result = await pool.query('SELECT 1 as ok');
    if (result.rows[0]?.ok !== 1) throw new Error('Health check query returned unexpected result');
    console.warn('[nexus] Database connected');
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
        await closePool();
        console.warn('[nexus] Database pool closed');
      } catch (err) {
        console.error('[nexus] Error closing database pool:', (err as Error).message);
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
