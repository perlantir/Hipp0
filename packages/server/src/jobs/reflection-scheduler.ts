/**
 * Reflection Scheduler
 *
 * Background worker that automatically runs hourly/daily/weekly reflection
 * loops for all active projects on a cron-like cadence. The reflection engine
 * lives in @hipp0/core (runHourlyReflection / runDailyReflection /
 * runWeeklyReflection); this scheduler is the only thing that calls those
 * functions automatically.
 *
 * Design goals:
 *   - Lightweight: no cron dependency, plain setInterval.
 *   - Source of truth for "last run" is the reflection_runs table — not
 *     in-memory state — so restarts do not cause double-runs.
 *   - Safety first: per-project locks, per-tick rate limiting, and every
 *     reflection call wrapped in try/catch so a single failure never blocks
 *     the loop or crashes the server.
 *   - Toggleable via HIPP0_SCHEDULER_ENABLED=false.
 */
import { getDb } from '@hipp0/core/db/index.js';
import {
  runHourlyReflection,
  runDailyReflection,
  runWeeklyReflection,
} from '@hipp0/core/intelligence/reflection-engine.js';
import type { ReflectionType } from '@hipp0/core/intelligence/reflection-engine.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** How often the scheduler loop runs. */
const TICK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/** Maximum number of projects to process in a single tick. */
const MAX_PROJECTS_PER_TICK = 5;

/** Maximum number of active projects to scan per query. */
const MAX_PROJECTS_SCANNED = 100;

/** Staleness thresholds — when a reflection type becomes "due". */
const HOURLY_THRESHOLD_MS = 60 * 60 * 1000;            // 1 hour
const DAILY_THRESHOLD_MS = 24 * 60 * 60 * 1000;        // 24 hours
const WEEKLY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days

/** Idle threshold — projects with no activity in this window skip weekly. */
const IDLE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;     // 7 days

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

interface ProjectRunState {
  hourly?: string;  // ISO timestamp
  daily?: string;
  weekly?: string;
}

interface SchedulerState {
  enabled: boolean;
  running: boolean;
  startedAt: string | null;
  lastTickAt: string | null;
  lastTickDurationMs: number | null;
  nextTickAt: string | null;
  totalTicks: number;
  totalReflectionsRun: number;
  totalReflectionsFailed: number;
  lastRunsByProject: Record<string, ProjectRunState>;
}

const state: SchedulerState = {
  enabled: false,
  running: false,
  startedAt: null,
  lastTickAt: null,
  lastTickDurationMs: null,
  nextTickAt: null,
  totalTicks: 0,
  totalReflectionsRun: 0,
  totalReflectionsFailed: 0,
  lastRunsByProject: {},
};

/** Prevents overlapping reflections for the same project. */
const inFlightProjects = new Set<string>();

/** Prevents overlapping scheduler ticks. */
let tickInProgress = false;

let intervalHandle: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSchedulerEnabled(): boolean {
  const raw = process.env.HIPP0_SCHEDULER_ENABLED;
  if (raw === undefined) return true;
  return raw.toLowerCase() !== 'false' && raw !== '0';
}

function parseTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // SQLite returns timestamps like "2024-01-01 12:34:56" — append Z to
    // force UTC interpretation when no timezone is present.
    const iso = /[TZ+]/.test(value) ? value : value.replace(' ', 'T') + 'Z';
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Look up the last completed reflection of a given type for a project. */
async function getLastCompletedAt(
  projectId: string,
  type: ReflectionType,
): Promise<number | null> {
  const db = getDb();
  try {
    const result = await db.query<Record<string, unknown>>(
      `SELECT MAX(completed_at) AS last
       FROM reflection_runs
       WHERE project_id = ? AND reflection_type = ?`,
      [projectId, type],
    );
    const raw = result.rows[0]?.last;
    return parseTimestamp(raw);
  } catch (err) {
    console.warn(
      `[scheduler] Failed to query last ${type} reflection for ${projectId.slice(0, 8)}:`,
      (err as Error).message,
    );
    return null;
  }
}

/** Check whether a project has been active within the idle window. */
async function isProjectIdle(projectId: string): Promise<boolean> {
  const db = getDb();
  try {
    const result = await db.query<Record<string, unknown>>(
      `SELECT updated_at FROM projects WHERE id = ?`,
      [projectId],
    );
    const updatedAt = parseTimestamp(result.rows[0]?.updated_at);
    if (updatedAt === null) return false;
    return Date.now() - updatedAt > IDLE_THRESHOLD_MS;
  } catch {
    return false;
  }
}

function recordLastRun(projectId: string, type: ReflectionType): void {
  const existing = state.lastRunsByProject[projectId] ?? {};
  existing[type] = new Date().toISOString();
  state.lastRunsByProject[projectId] = existing;
}

async function runReflectionSafely(
  projectId: string,
  type: ReflectionType,
): Promise<void> {
  const shortId = projectId.slice(0, 8);
  console.warn(`[scheduler] Running ${type} reflection for project ${shortId}...`);
  const start = Date.now();
  try {
    switch (type) {
      case 'hourly':
        await runHourlyReflection(projectId);
        break;
      case 'daily':
        await runDailyReflection(projectId);
        break;
      case 'weekly':
        await runWeeklyReflection(projectId);
        break;
    }
    const durationMs = Date.now() - start;
    state.totalReflectionsRun++;
    recordLastRun(projectId, type);
    console.warn(
      `[scheduler] Completed ${type} reflection for project ${shortId} in ${durationMs}ms`,
    );
  } catch (err) {
    state.totalReflectionsFailed++;
    console.warn(
      `[scheduler] Failed ${type} reflection for project ${shortId}:`,
      (err as Error).message,
    );
  }
}

/**
 * Decide which reflection (if any) is due for a project. Returns the highest
 * cadence that is overdue — weekly beats daily beats hourly, since the broader
 * runs also capture what the lighter ones do.
 */
async function getDueReflection(
  projectId: string,
): Promise<ReflectionType | null> {
  const now = Date.now();

  const lastWeekly = await getLastCompletedAt(projectId, 'weekly');
  if (lastWeekly === null || now - lastWeekly > WEEKLY_THRESHOLD_MS) {
    // Skip weekly for idle projects.
    if (!(await isProjectIdle(projectId))) {
      return 'weekly';
    }
  }

  const lastDaily = await getLastCompletedAt(projectId, 'daily');
  if (lastDaily === null || now - lastDaily > DAILY_THRESHOLD_MS) {
    return 'daily';
  }

  const lastHourly = await getLastCompletedAt(projectId, 'hourly');
  if (lastHourly === null || now - lastHourly > HOURLY_THRESHOLD_MS) {
    return 'hourly';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main tick
// ---------------------------------------------------------------------------

/**
 * The main worker loop. Queries active projects and triggers reflections
 * for those that are due, bounded by MAX_PROJECTS_PER_TICK. Safe to call
 * manually (e.g. from the /api/scheduler/trigger endpoint).
 */
export async function runScheduledReflections(): Promise<{
  scanned: number;
  dispatched: number;
  skipped_locked: number;
  skipped_not_due: number;
}> {
  if (tickInProgress) {
    console.warn('[scheduler] Tick already in progress, skipping');
    return { scanned: 0, dispatched: 0, skipped_locked: 0, skipped_not_due: 0 };
  }
  tickInProgress = true;
  const tickStart = Date.now();
  state.totalTicks++;
  state.lastTickAt = new Date(tickStart).toISOString();

  let scanned = 0;
  let dispatched = 0;
  let skippedLocked = 0;
  let skippedNotDue = 0;

  try {
    const db = getDb();
    let projectRows: Array<Record<string, unknown>> = [];
    try {
      const result = await db.query<Record<string, unknown>>(
        `SELECT id FROM projects ORDER BY updated_at DESC LIMIT ?`,
        [MAX_PROJECTS_SCANNED],
      );
      projectRows = result.rows;
    } catch (err) {
      console.warn(
        '[scheduler] Failed to query active projects:',
        (err as Error).message,
      );
      return { scanned: 0, dispatched: 0, skipped_locked: 0, skipped_not_due: 0 };
    }

    for (const row of projectRows) {
      if (dispatched >= MAX_PROJECTS_PER_TICK) break;
      const projectId = row.id as string;
      if (!projectId) continue;
      scanned++;

      if (inFlightProjects.has(projectId)) {
        skippedLocked++;
        continue;
      }

      let dueType: ReflectionType | null;
      try {
        dueType = await getDueReflection(projectId);
      } catch (err) {
        console.warn(
          `[scheduler] Failed due-check for ${projectId.slice(0, 8)}:`,
          (err as Error).message,
        );
        continue;
      }

      if (!dueType) {
        skippedNotDue++;
        continue;
      }

      // Fire-and-forget — run in the background so one slow reflection
      // does not block the rest of the tick. The inFlightProjects lock
      // prevents overlapping runs for the same project.
      inFlightProjects.add(projectId);
      dispatched++;
      void runReflectionSafely(projectId, dueType).finally(() => {
        inFlightProjects.delete(projectId);
      });
    }
  } finally {
    state.lastTickDurationMs = Date.now() - tickStart;
    state.nextTickAt = new Date(Date.now() + TICK_INTERVAL_MS).toISOString();
    tickInProgress = false;
  }

  if (dispatched > 0 || scanned > 0) {
    console.warn(
      `[scheduler] Tick complete: scanned=${scanned} dispatched=${dispatched} locked=${skippedLocked} not_due=${skippedNotDue}`,
    );
  }

  return {
    scanned,
    dispatched,
    skipped_locked: skippedLocked,
    skipped_not_due: skippedNotDue,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the scheduler. Called once at server startup. Idempotent — calling
 * twice is a no-op. Respects the HIPP0_SCHEDULER_ENABLED env var.
 */
export function startScheduler(): void {
  if (intervalHandle) {
    console.warn('[scheduler] Already running, ignoring start request');
    return;
  }

  if (!isSchedulerEnabled()) {
    state.enabled = false;
    console.warn(
      '[scheduler] Disabled via HIPP0_SCHEDULER_ENABLED=false',
    );
    return;
  }

  state.enabled = true;
  state.running = true;
  state.startedAt = new Date().toISOString();
  state.nextTickAt = new Date(Date.now() + TICK_INTERVAL_MS).toISOString();

  console.warn(
    `[scheduler] Started — tick interval ${TICK_INTERVAL_MS / 1000}s, max ${MAX_PROJECTS_PER_TICK} projects per tick`,
  );

  intervalHandle = setInterval(() => {
    void runScheduledReflections().catch((err) => {
      console.warn('[scheduler] Unexpected tick error:', (err as Error).message);
    });
  }, TICK_INTERVAL_MS);

  // Allow the Node process to exit even while the interval is pending.
  if (typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }
}

/**
 * Stop the scheduler. Called during graceful shutdown. Does not wait for
 * in-flight reflections — they will complete on their own and simply update
 * no state by the time they finish.
 */
export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  state.running = false;
  state.nextTickAt = null;
  console.warn('[scheduler] Stopped');
}

// ---------------------------------------------------------------------------
// Introspection
// ---------------------------------------------------------------------------

export interface SchedulerStatus {
  enabled: boolean;
  running: boolean;
  started_at: string | null;
  last_tick_at: string | null;
  last_tick_duration_ms: number | null;
  next_tick_at: string | null;
  tick_interval_ms: number;
  max_projects_per_tick: number;
  total_ticks: number;
  total_reflections_run: number;
  total_reflections_failed: number;
  in_flight_projects: string[];
  last_runs_by_project: Record<string, ProjectRunState>;
}

/**
 * Snapshot of scheduler state. Safe to expose over HTTP.
 */
export function getSchedulerStatus(): SchedulerStatus {
  return {
    enabled: state.enabled,
    running: state.running,
    started_at: state.startedAt,
    last_tick_at: state.lastTickAt,
    last_tick_duration_ms: state.lastTickDurationMs,
    next_tick_at: state.nextTickAt,
    tick_interval_ms: TICK_INTERVAL_MS,
    max_projects_per_tick: MAX_PROJECTS_PER_TICK,
    total_ticks: state.totalTicks,
    total_reflections_run: state.totalReflectionsRun,
    total_reflections_failed: state.totalReflectionsFailed,
    in_flight_projects: Array.from(inFlightProjects),
    last_runs_by_project: { ...state.lastRunsByProject },
  };
}
