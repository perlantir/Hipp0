/**
 * Proactive Decision Intelligence — Weekly Digest
 *
 * 7 independent analyzers that surface insights:
 * 1. Coverage Gap Detector
 * 2. Decision Velocity Tracker
 * 3. Instability Detector
 * 4. Agent Alignment Monitor (requires outcome tracking)
 * 5. Stale Decision Sweep
 * 6. Contradiction Cluster Detector
 * 7. Cross-Agent Consistency Check (requires outcome tracking)
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

/* ── Types ───────────────────────────────────────────────────────── */

export interface Finding {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string;
  data: Record<string, unknown>;
}

export interface DigestSummary {
  period: string;
  findings_count: number;
  critical: number;
  warnings: number;
  overall_health: 'good' | 'fair' | 'needs_attention';
}

export interface DigestResult {
  id: string;
  findings: Finding[];
  summary: DigestSummary;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function daysAgo(d: Date, days: number): string {
  return new Date(d.getTime() - days * 86_400_000).toISOString();
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

/* ── Analyzer 1: Coverage Gap Detector ───────────────────────────── */

async function analyzeCoverageGaps(
  projectId: string,
): Promise<Finding | null> {
  const db = getDb();

  const result = await db.query(
    `SELECT tags FROM decisions WHERE project_id = ? AND status = 'active'`,
    [projectId],
  );

  // Count tags in application code (cross-DB compatible)
  const tagCounts: Record<string, number> = {};
  for (const row of result.rows) {
    const tags = parseTags((row as Record<string, unknown>).tags);
    for (const tag of tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const expectedCategories = [
    'architecture', 'security', 'api', 'database',
    'frontend', 'testing', 'deployment', 'monitoring',
  ];

  const missing = expectedCategories.filter((cat) => !tagCounts[cat] || tagCounts[cat] === 0);
  if (missing.length === 0) return null;

  return {
    type: 'coverage_gap',
    severity: missing.includes('security') ? 'critical' : 'warning',
    title: `${missing.length} decision categories have no coverage`,
    description: `Your project has decisions across ${Object.keys(tagCounts).length} categories but is missing: ${missing.join(', ')}.`,
    recommendation: `Consider documenting decisions for: ${missing.join(', ')}.`,
    data: { tag_counts: tagCounts, missing },
  };
}

/* ── Analyzer 2: Decision Velocity Tracker ───────────────────────── */

async function analyzeVelocity(
  projectId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<Finding | null> {
  const db = getDb();

  // Get decisions from last 8 weeks, group by week in application code
  const result = await db.query(
    `SELECT created_at FROM decisions
     WHERE project_id = ? AND created_at > ? AND status = 'active'
     ORDER BY created_at ASC`,
    [projectId, daysAgo(periodEnd, 56)],
  );

  if (result.rows.length < 3) return null;

  // Bucket into weeks
  const weekBuckets: Record<string, number> = {};
  for (const row of result.rows) {
    const d = new Date((row as Record<string, unknown>).created_at as string);
    const weekStart = new Date(d);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const key = weekStart.toISOString().split('T')[0];
    weekBuckets[key] = (weekBuckets[key] || 0) + 1;
  }

  const counts = Object.values(weekBuckets);
  if (counts.length < 2) return null;

  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const latest = counts[counts.length - 1];
  const changePct = avg > 0 ? ((latest - avg) / avg) * 100 : 0;

  if (Math.abs(changePct) < 40) return null;

  const direction = changePct > 0 ? 'increased' : 'dropped';

  return {
    type: 'velocity_change',
    severity: changePct < -50 ? 'warning' : 'info',
    title: `Decision velocity ${direction} ${Math.abs(Math.round(changePct))}%`,
    description: `This week: ${latest} decisions. Average: ${avg.toFixed(1)}/week over ${counts.length} weeks.`,
    recommendation: changePct < -40
      ? 'Your team may be blocked or in pure execution mode. Consider a decision-making review.'
      : 'High decision velocity is healthy during active design phases. Ensure decisions are getting proper review.',
    data: { weekly_counts: counts, average: avg, latest, change_pct: changePct },
  };
}

/* ── Analyzer 3: Instability Detector ────────────────────────────── */

async function analyzeInstability(
  projectId: string,
  periodEnd: Date,
): Promise<Finding | null> {
  const db = getDb();

  const result = await db.query(
    `SELECT d.title, COUNT(*) as supersede_count
     FROM decision_edges de
     JOIN decisions d ON de.target_id = d.id
     WHERE d.project_id = ?
       AND de.relationship = 'supersedes'
       AND de.created_at > ?
     GROUP BY d.title
     HAVING COUNT(*) >= 3
     ORDER BY COUNT(*) DESC`,
    [projectId, daysAgo(periodEnd, 30)],
  );

  if (result.rows.length === 0) return null;

  const unstable = result.rows.map((r: Record<string, unknown>) => ({
    title: r.title as string,
    changes: parseInt(String(r.supersede_count)),
  }));

  return {
    type: 'instability',
    severity: 'warning',
    title: `${unstable.length} decision(s) changed 3+ times this month`,
    description: `These decisions keep being superseded, suggesting the team hasn't settled: ${unstable.map((u) => `"${u.title}" (${u.changes}x)`).join(', ')}.`,
    recommendation: 'Schedule a dedicated discussion to finalize these decisions.',
    data: { unstable_decisions: unstable },
  };
}

/* ── Analyzer 4: Agent Alignment Monitor ─────────────────────────── */

async function analyzeAgentAlignment(
  projectId: string,
  periodEnd: Date,
): Promise<Finding | null> {
  const db = getDb();

  // Check if outcome tracking data exists
  try {
    const countResult = await db.query(
      'SELECT COUNT(*) as c FROM compile_outcomes WHERE project_id = ?',
      [projectId],
    );
    if (parseInt(String((countResult.rows[0] as Record<string, unknown>).c)) < 10) return null;
  } catch {
    return null; // compile_outcomes table may not exist
  }

  const result = await db.query(
    `SELECT a.name,
       AVG(co.alignment_score) as avg_alignment,
       COUNT(*) as outcome_count
     FROM compile_outcomes co
     JOIN agents a ON co.agent_id = a.id
     WHERE co.project_id = ?
       AND co.created_at > ?
       AND co.alignment_score IS NOT NULL
     GROUP BY a.name
     HAVING AVG(co.alignment_score) < 0.5 AND COUNT(*) >= 5`,
    [projectId, daysAgo(periodEnd, 14)],
  );

  if (result.rows.length === 0) return null;

  const lowAgents = result.rows.map((r: Record<string, unknown>) => ({
    name: r.name as string,
    alignment: Math.round(parseFloat(String(r.avg_alignment)) * 100),
    outcomes: parseInt(String(r.outcome_count)),
  }));

  return {
    type: 'agent_alignment',
    severity: 'warning',
    title: `${lowAgents.length} agent(s) frequently ignore compiled decisions`,
    description: `${lowAgents.map((a) => `"${a.name}" (${a.alignment}% alignment over ${a.outcomes} tasks)`).join(', ')}.`,
    recommendation: 'These agents may need role reconfiguration, or the decisions compiled for them may not match their tasks.',
    data: { low_alignment_agents: lowAgents },
  };
}

/* ── Analyzer 5: Stale Decision Sweep ────────────────────────────── */

async function analyzeStaleness(
  projectId: string,
  periodEnd: Date,
): Promise<Finding | null> {
  const db = getDb();

  // Find active decisions created 60+ days ago that haven't been validated recently
  const result = await db.query(
    `SELECT d.id, d.title, d.created_at
     FROM decisions d
     WHERE d.project_id = ?
       AND d.status = 'active'
       AND d.created_at < ?`,
    [projectId, daysAgo(periodEnd, 60)],
  );

  if (result.rows.length === 0) return null;

  const staleDecisions = result.rows.map((r: Record<string, unknown>) => ({
    title: r.title as string,
    created_at: r.created_at as string,
  }));

  return {
    type: 'staleness',
    severity: staleDecisions.length > 10 ? 'warning' : 'info',
    title: `${staleDecisions.length} decision(s) may be stale`,
    description: `These decisions were created 60+ days ago and may need review for continued relevance.`,
    recommendation: 'Review these decisions for continued relevance. Archive or supersede outdated ones.',
    data: { stale_decisions: staleDecisions.slice(0, 20) },
  };
}

/* ── Analyzer 6: Contradiction Cluster Detector ──────────────────── */

async function analyzeContradictionClusters(
  projectId: string,
): Promise<Finding | null> {
  const db = getDb();

  // Get unresolved contradictions with their decisions' tags
  const result = await db.query(
    `SELECT da.tags as a_tags, db.tags as b_tags
     FROM contradictions c
     JOIN decisions da ON c.decision_a_id = da.id
     JOIN decisions db ON c.decision_b_id = db.id
     WHERE c.project_id = ? AND c.status = 'unresolved'`,
    [projectId],
  );

  if (result.rows.length < 3) return null;

  // Count tags across all contradiction pairs in application code
  const tagConflicts: Record<string, number> = {};
  for (const row of result.rows) {
    const r = row as Record<string, unknown>;
    const allTags = [...parseTags(r.a_tags), ...parseTags(r.b_tags)];
    const unique = [...new Set(allTags)];
    for (const tag of unique) {
      tagConflicts[tag] = (tagConflicts[tag] || 0) + 1;
    }
  }

  const clusters = Object.entries(tagConflicts)
    .filter(([, count]) => count >= 3)
    .map(([tag, count]) => ({ tag, contradictions: count }))
    .sort((a, b) => b.contradictions - a.contradictions);

  if (clusters.length === 0) return null;

  return {
    type: 'contradiction_cluster',
    severity: 'critical',
    title: `Contradiction cluster in ${clusters.map((c) => `"${c.tag}"`).join(', ')}`,
    description: `Multiple contradictions cluster around the same topic areas. This indicates fundamental disagreements that are slowing the team.`,
    recommendation: `Resolve the ${clusters[0].tag} strategy before making further decisions in this area.`,
    data: { clusters },
  };
}

/* ── Analyzer 7: Cross-Agent Consistency Check ───────────────────── */

async function analyzeConsistency(
  projectId: string,
  periodEnd: Date,
): Promise<Finding | null> {
  const db = getDb();

  // Simplified: check if different agents have very different task completion rates
  try {
    const result = await db.query(
      `SELECT a.name,
         AVG(CASE WHEN co.task_completed THEN 1.0 ELSE 0.0 END) as success_rate,
         COUNT(*) as task_count
       FROM compile_outcomes co
       JOIN agents a ON co.agent_id = a.id
       WHERE co.project_id = ? AND co.created_at > ?
       GROUP BY a.name
       HAVING COUNT(*) >= 5`,
      [projectId, daysAgo(periodEnd, 14)],
    );

    if (result.rows.length < 2) return null;

    const agents = result.rows.map((r: Record<string, unknown>) => ({
      name: r.name as string,
      success_rate: parseFloat(String(r.success_rate)),
      tasks: parseInt(String(r.task_count)),
    }));

    const maxRate = Math.max(...agents.map((a) => a.success_rate));
    const minRate = Math.min(...agents.map((a) => a.success_rate));

    if (maxRate - minRate < 0.3) return null;

    const struggling = agents.filter((a) => a.success_rate < maxRate - 0.3);
    if (struggling.length === 0) return null;

    return {
      type: 'consistency',
      severity: 'info',
      title: `${struggling.length} agent(s) have lower success rates`,
      description: `Some agents succeed at different rates: ${struggling.map((a) => `"${a.name}" (${Math.round(a.success_rate * 100)}% over ${a.tasks} tasks)`).join(', ')}.`,
      recommendation: 'Clarify task assignments or adjust agent roles to improve consistency.',
      data: { agents },
    };
  } catch {
    return null; // compile_outcomes may not exist
  }
}

/* ── Digest Generation ───────────────────────────────────────────── */

export async function generateDigest(
  projectId: string,
): Promise<DigestResult> {
  const db = getDb();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  // Minimum threshold: 20+ active decisions
  const countResult = await db.query(
    "SELECT COUNT(*) as c FROM decisions WHERE project_id = ? AND status = 'active'",
    [projectId],
  );
  const decisionCount = parseInt(String((countResult.rows[0] as Record<string, unknown>).c) || '0');
  if (decisionCount < 20) {
    const id = randomUUID();
    const emptySummary: DigestSummary = {
      period: `${weekAgo.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}`,
      findings_count: 0,
      critical: 0,
      warnings: 0,
      overall_health: 'good',
    };
    return { id, findings: [], summary: emptySummary };
  }

  // Run all analyzers (each handles its own errors)
  const results = await Promise.allSettled([
    analyzeCoverageGaps(projectId),
    analyzeVelocity(projectId, weekAgo, now),
    analyzeInstability(projectId, now),
    analyzeAgentAlignment(projectId, now),
    analyzeStaleness(projectId, now),
    analyzeContradictionClusters(projectId),
    analyzeConsistency(projectId, now),
  ]);

  const findings = results
    .filter((r): r is PromiseFulfilledResult<Finding | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter(Boolean) as Finding[];

  // Sort by severity
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const summary: DigestSummary = {
    period: `${weekAgo.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}`,
    findings_count: findings.length,
    critical: findings.filter((f) => f.severity === 'critical').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    overall_health: findings.some((f) => f.severity === 'critical')
      ? 'needs_attention'
      : findings.filter((f) => f.severity === 'warning').length > 2
        ? 'fair'
        : 'good',
  };

  // Store
  const id = randomUUID();
  await db.query(
    `INSERT INTO digests (id, project_id, period_start, period_end, findings, summary)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, projectId, weekAgo.toISOString(), now.toISOString(),
     JSON.stringify(findings), JSON.stringify(summary)],
  );

  return { id, findings, summary };
}
