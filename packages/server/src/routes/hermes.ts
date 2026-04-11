/**
 * /api/hermes/* — runtime integration endpoints for a Hermes fork acting
 * as the `Hipp0MemoryProvider`.
 *
 * Wire contract: packages/core/src/types/hermes-contract.ts
 *
 * Endpoints:
 *
 *   POST   /api/hermes/register         — upsert persistent agent profile
 *   GET    /api/hermes/agents           — list registered agents (dashboard)
 *   GET    /api/hermes/agents/:name     — fetch a single agent profile
 *   POST   /api/hermes/session/start    — begin a new session, get session_id
 *   POST   /api/hermes/session/end      — close session + optional outcome
 *   POST   /api/hermes/user-facts       — upsert facts (If-Match optimistic lock)
 *   GET    /api/hermes/user-facts       — read current facts for a user
 *
 * Capture / compile / outcomes are intentionally NOT duplicated here — the
 * Hermes provider calls the existing /api/capture, /api/compile and
 * /api/outcomes routes with `source: "hermes"`.
 */

import crypto from 'node:crypto';
import type { Hono } from 'hono';
import { getDb } from '@hipp0/core/db/index.js';
import { requireUUID, requireString, optionalString, logAudit, mapDbError } from './validation.js';
import { requireProjectAccess } from './_helpers.js';
import {
  HERMES_AGENT_NAME_RE,
  type HermesPlatform,
  type HermesAgentConfig,
  type HermesUserFact,
} from '@hipp0/core/types/hermes-contract.js';

const VALID_PLATFORMS: readonly HermesPlatform[] = ['telegram', 'discord', 'slack', 'whatsapp', 'signal', 'web', 'cli'];

function requireAgentName(val: unknown, field = 'agent_name'): string {
  const name = requireString(val, field, 64);
  if (!HERMES_AGENT_NAME_RE.test(name)) {
    throw new Error(`${field} must match ${HERMES_AGENT_NAME_RE}`);
  }
  return name;
}

function requirePlatform(val: unknown, field = 'platform'): HermesPlatform {
  const raw = requireString(val, field, 32);
  if (!(VALID_PLATFORMS as readonly string[]).includes(raw)) {
    throw new Error(`${field} must be one of: ${VALID_PLATFORMS.join(', ')}`);
  }
  return raw as HermesPlatform;
}

function parseAgentConfig(val: unknown): HermesAgentConfig {
  if (typeof val !== 'object' || val === null) {
    throw new Error('config must be an object');
  }
  const obj = val as Record<string, unknown>;
  const model = requireString(obj.model, 'config.model', 200);
  const toolset = optionalString(obj.toolset, 'config.toolset', 200);
  let platform_access: HermesPlatform[] | undefined;
  if (Array.isArray(obj.platform_access)) {
    platform_access = obj.platform_access.map((p) => requirePlatform(p, 'config.platform_access[]'));
  }
  const metadata = (typeof obj.metadata === 'object' && obj.metadata !== null)
    ? (obj.metadata as Record<string, unknown>)
    : undefined;
  return { model, toolset, platform_access, metadata };
}

export function registerHermesRoutes(app: Hono): void {
  // -----------------------------------------------------------------------
  // POST /api/hermes/register — upsert persistent agent profile
  // -----------------------------------------------------------------------
  app.post('/api/hermes/register', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const project_id = requireUUID(body.project_id, 'project_id');
    await requireProjectAccess(c, project_id);
    const agent_name = requireAgentName(body.agent_name);
    const soul = requireString(body.soul, 'soul', 100_000);
    const config = parseAgentConfig(body.config);

    const db = getDb();

    // Check if agent already exists
    const existing = await db.query(
      'SELECT id FROM hermes_agents WHERE project_id = ? AND agent_name = ?',
      [project_id, agent_name],
    );

    let agent_id: string;
    let created = false;
    try {
      if (existing.rows.length > 0) {
        agent_id = (existing.rows[0] as Record<string, unknown>).id as string;
        await db.query(
          `UPDATE hermes_agents
             SET soul_md = ?, config_json = ?, updated_at = ?
           WHERE id = ?`,
          [soul, JSON.stringify(config), new Date().toISOString(), agent_id],
        );
      } else {
        agent_id = crypto.randomUUID();
        created = true;
        await db.query(
          `INSERT INTO hermes_agents (id, project_id, agent_name, soul_md, config_json)
           VALUES (?, ?, ?, ?, ?)`,
          [agent_id, project_id, agent_name, soul, JSON.stringify(config)],
        );
      }
    } catch (err) {
      mapDbError(err);
      return; // unreachable, mapDbError always throws
    }

    logAudit('hermes_agent_registered', project_id, {
      agent_id,
      agent_name,
      created,
    });

    return c.json({ agent_id, agent_name, created }, created ? 201 : 200);
  });

  // -----------------------------------------------------------------------
  // GET /api/hermes/agents — list registered agents for a project
  // -----------------------------------------------------------------------
  app.get('/api/hermes/agents', async (c) => {
    const project_id = requireUUID(c.req.query('project_id'), 'project_id');
    await requireProjectAccess(c, project_id);
    const db = getDb();
    const result = await db.query(
      `SELECT id, agent_name, config_json, created_at, updated_at
         FROM hermes_agents
        WHERE project_id = ?
        ORDER BY agent_name ASC`,
      [project_id],
    );
    const agents = result.rows.map((row) => {
      const r = row as Record<string, unknown>;
      let config: unknown = null;
      if (typeof r.config_json === 'string') {
        try { config = JSON.parse(r.config_json); } catch { /* keep null */ }
      } else if (typeof r.config_json === 'object' && r.config_json !== null) {
        config = r.config_json;
      }
      return {
        agent_id: r.id,
        agent_name: r.agent_name,
        config,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });
    return c.json(agents);
  });

  // -----------------------------------------------------------------------
  // GET /api/hermes/agents/:name — fetch single agent (includes SOUL.md)
  // -----------------------------------------------------------------------
  app.get('/api/hermes/agents/:name', async (c) => {
    const project_id = requireUUID(c.req.query('project_id'), 'project_id');
    await requireProjectAccess(c, project_id);
    const agent_name = requireAgentName(c.req.param('name'));
    const db = getDb();
    const result = await db.query(
      `SELECT id, agent_name, soul_md, config_json, created_at, updated_at
         FROM hermes_agents
        WHERE project_id = ? AND agent_name = ?`,
      [project_id, agent_name],
    );
    if (result.rows.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
    }
    const r = result.rows[0] as Record<string, unknown>;
    let config: unknown = null;
    if (typeof r.config_json === 'string') {
      try { config = JSON.parse(r.config_json); } catch { /* keep null */ }
    } else if (typeof r.config_json === 'object' && r.config_json !== null) {
      config = r.config_json;
    }
    return c.json({
      agent_id: r.id,
      agent_name: r.agent_name,
      soul: r.soul_md,
      config,
      created_at: r.created_at,
      updated_at: r.updated_at,
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/hermes/session/start — create a hermes_conversations row
  // -----------------------------------------------------------------------
  app.post('/api/hermes/session/start', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const project_id = requireUUID(body.project_id, 'project_id');
    await requireProjectAccess(c, project_id);
    const agent_name = requireAgentName(body.agent_name);
    const platform = requirePlatform(body.platform);
    const external_user_id = optionalString(body.external_user_id, 'external_user_id', 200) ?? null;
    const external_chat_id = optionalString(body.external_chat_id, 'external_chat_id', 200) ?? null;
    const metadata = (typeof body.metadata === 'object' && body.metadata !== null)
      ? JSON.stringify(body.metadata)
      : null;

    const db = getDb();

    // Look up agent_id for the name
    const agentResult = await db.query(
      'SELECT id FROM hermes_agents WHERE project_id = ? AND agent_name = ?',
      [project_id, agent_name],
    );
    if (agentResult.rows.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Agent ${agent_name} not registered` } }, 404);
    }
    const agent_id = (agentResult.rows[0] as Record<string, unknown>).id as string;

    const conversation_id = crypto.randomUUID();
    const session_id = crypto.randomUUID();
    const started_at = new Date().toISOString();

    try {
      await db.query(
        `INSERT INTO hermes_conversations
           (id, session_id, project_id, agent_id, platform, external_user_id, external_chat_id, metadata_json, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [conversation_id, session_id, project_id, agent_id, platform, external_user_id, external_chat_id, metadata, started_at],
      );
    } catch (err) {
      mapDbError(err);
      return;
    }

    logAudit('hermes_session_start', project_id, {
      conversation_id,
      session_id,
      agent_name,
      platform,
    });

    return c.json({ session_id, conversation_id, started_at }, 201);
  });

  // -----------------------------------------------------------------------
  // POST /api/hermes/session/end — close session + optional outcome
  // -----------------------------------------------------------------------
  app.post('/api/hermes/session/end', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const session_id = requireUUID(body.session_id, 'session_id');

    const db = getDb();

    const convResult = await db.query(
      'SELECT id, project_id, ended_at FROM hermes_conversations WHERE session_id = ?',
      [session_id],
    );
    if (convResult.rows.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }, 404);
    }
    const convRow = convResult.rows[0] as Record<string, unknown>;
    const project_id = convRow.project_id as string;
    await requireProjectAccess(c, project_id);

    if (convRow.ended_at) {
      // Idempotent close — return existing end state
      return c.json({
        session_id,
        ended_at: convRow.ended_at,
        summary_snippet_ids: [],
      });
    }

    const ended_at = new Date().toISOString();
    await db.query(
      'UPDATE hermes_conversations SET ended_at = ? WHERE session_id = ?',
      [ended_at, session_id],
    );

    // Optional outcome bundled with session/end — future work will wire the
    // relevance-learner pipeline. For Phase 0 we simply log it.
    const outcome = body.outcome as Record<string, unknown> | undefined;
    if (outcome) {
      logAudit('hermes_session_outcome', project_id, {
        session_id,
        rating: outcome.rating,
        signal_source: outcome.signal_source,
        snippet_count: Array.isArray(outcome.snippet_ids) ? outcome.snippet_ids.length : 0,
      });
    }

    logAudit('hermes_session_end', project_id, { session_id });

    // Rolling summary is a later-phase feature — return empty list for now.
    return c.json({
      session_id,
      ended_at,
      summary_snippet_ids: [],
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/hermes/user-facts — upsert facts with ETag optimistic lock
  // -----------------------------------------------------------------------
  app.post('/api/hermes/user-facts', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const project_id = requireUUID(body.project_id, 'project_id');
    await requireProjectAccess(c, project_id);
    const external_user_id = requireString(body.external_user_id, 'external_user_id', 200);

    if (!Array.isArray(body.facts) || body.facts.length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'facts must be a non-empty array' } }, 400);
    }
    const facts: HermesUserFact[] = body.facts.map((f, i) => {
      if (typeof f !== 'object' || f === null) {
        throw new Error(`facts[${i}] must be an object`);
      }
      const obj = f as Record<string, unknown>;
      return {
        key: requireString(obj.key, `facts[${i}].key`, 200),
        value: requireString(obj.value, `facts[${i}].value`, 10_000),
        additive: obj.additive === true,
        source: optionalString(obj.source, `facts[${i}].source`, 200),
      };
    });

    const db = getDb();

    // Compute current version (max version across existing rows for this user)
    const versionResult = await db.query(
      `SELECT version FROM hermes_user_facts
        WHERE project_id = ? AND external_user_id = ?
        ORDER BY updated_at DESC
        LIMIT 1`,
      [project_id, external_user_id],
    );
    const currentVersion = versionResult.rows.length > 0
      ? (versionResult.rows[0] as Record<string, unknown>).version as string
      : null;

    const ifMatch = c.req.header('If-Match');
    if (ifMatch && currentVersion && ifMatch !== currentVersion) {
      return c.json(
        { error: { code: 'CONFLICT', message: 'If-Match does not match current version', current_version: currentVersion } },
        409,
      );
    }

    const newVersion = crypto.randomUUID();
    const now = new Date().toISOString();

    for (const fact of facts) {
      if (fact.additive) {
        // Append-style upsert: store as a separate row with a suffix key.
        // Simpler semantics: create a new row with a unique derived key so
        // the unique index on (project_id, external_user_id, key) holds.
        const suffix = crypto.randomUUID().slice(0, 8);
        const derivedKey = `${fact.key}:${suffix}`;
        const rowId = crypto.randomUUID();
        await db.query(
          `INSERT INTO hermes_user_facts
             (id, project_id, external_user_id, key, value, source, version, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [rowId, project_id, external_user_id, derivedKey, fact.value, fact.source ?? null, newVersion, now],
        );
      } else {
        // Replace-style upsert on (project_id, external_user_id, key)
        const existing = await db.query(
          `SELECT id FROM hermes_user_facts
            WHERE project_id = ? AND external_user_id = ? AND key = ?`,
          [project_id, external_user_id, fact.key],
        );
        if (existing.rows.length > 0) {
          const id = (existing.rows[0] as Record<string, unknown>).id as string;
          await db.query(
            `UPDATE hermes_user_facts
                SET value = ?, source = ?, version = ?, updated_at = ?
              WHERE id = ?`,
            [fact.value, fact.source ?? null, newVersion, now, id],
          );
        } else {
          const rowId = crypto.randomUUID();
          await db.query(
            `INSERT INTO hermes_user_facts
               (id, project_id, external_user_id, key, value, source, version, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [rowId, project_id, external_user_id, fact.key, fact.value, fact.source ?? null, newVersion, now],
          );
        }
      }
    }

    // Re-read the current snapshot
    const snapshotResult = await db.query(
      `SELECT key, value, source, updated_at FROM hermes_user_facts
        WHERE project_id = ? AND external_user_id = ?
        ORDER BY key ASC`,
      [project_id, external_user_id],
    );
    const factRecords = snapshotResult.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        key: r.key as string,
        value: r.value as string,
        source: (r.source as string | null) ?? null,
        updated_at: r.updated_at as string,
      };
    });

    logAudit('hermes_user_facts_upsert', project_id, {
      external_user_id,
      fact_count: facts.length,
      version: newVersion,
    });

    return c.json({
      external_user_id,
      version: newVersion,
      facts: factRecords,
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/hermes/user-facts — read current facts snapshot
  // -----------------------------------------------------------------------
  app.get('/api/hermes/user-facts', async (c) => {
    const project_id = requireUUID(c.req.query('project_id'), 'project_id');
    await requireProjectAccess(c, project_id);
    const external_user_id = requireString(c.req.query('external_user_id'), 'external_user_id', 200);

    const db = getDb();
    const result = await db.query(
      `SELECT key, value, source, version, updated_at FROM hermes_user_facts
        WHERE project_id = ? AND external_user_id = ?
        ORDER BY updated_at DESC, key ASC`,
      [project_id, external_user_id],
    );

    if (result.rows.length === 0) {
      return c.json({ external_user_id, version: null, facts: [] });
    }

    const version = (result.rows[0] as Record<string, unknown>).version as string;
    const facts = result.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        key: r.key as string,
        value: r.value as string,
        source: (r.source as string | null) ?? null,
        updated_at: r.updated_at as string,
      };
    });

    return c.json({ external_user_id, version, facts });
  });
}
