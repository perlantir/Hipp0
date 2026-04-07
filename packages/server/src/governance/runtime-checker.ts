/**
 * Governance Runtime Checker — detects policy violations in agent output
 * by scanning for negation patterns near policy keywords.
 *
 * For block-level policies, attempts LLM confirmation when available.
 * For warn-level policies, uses keyword-only detection.
 */

import { getDb } from '@decigraph/core/db/index.js';
import { resolveLLMConfig, createLLMClient } from '@decigraph/core/config/llm.js';
import { dispatchWebhooks } from '@decigraph/core/webhooks/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolicyCheckParams {
  agentOutput: string;
  compiledDecisionIds: string[];
  agentId?: string;
  agentName?: string;
  projectId: string;
  compileHistoryId?: string;
  outcomeId?: string;
}

export interface PolicyViolation {
  policy_id: string;
  policy_title: string;
  enforcement_level: string;
  violation_type: string;
  severity: string;
  evidence_snippet: string;
  explanation: string;
}

interface PolicyRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  enforcement_level: string;
  scope: string | Record<string, unknown>;
  active: boolean | number;
}

// ---------------------------------------------------------------------------
// Negation patterns
// ---------------------------------------------------------------------------

const NEGATION_PATTERNS = [
  'not using',
  'instead of',
  'replace',
  'switch from',
  'moving away from',
  'dropping',
  'removing',
  'without',
  'skip',
  'avoid',
  "don't use",
  "won't use",
  'do not use',
  'will not use',
  'stopped using',
  'no longer',
];

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------

function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

// ---------------------------------------------------------------------------
// Negation detection near keyword
// ---------------------------------------------------------------------------

function findNegationNearKeyword(
  text: string,
  keyword: string,
): { found: boolean; snippet: string } {
  const lowerText = text.toLowerCase();
  const keywordIdx = lowerText.indexOf(keyword.toLowerCase());

  if (keywordIdx === -1) {
    return { found: false, snippet: '' };
  }

  // Look in a window of 80 chars before the keyword
  const windowStart = Math.max(0, keywordIdx - 80);
  const windowEnd = Math.min(lowerText.length, keywordIdx + keyword.length + 40);
  const window = lowerText.slice(windowStart, windowEnd);

  for (const pattern of NEGATION_PATTERNS) {
    if (window.includes(pattern)) {
      // Extract a readable snippet around the match
      const snippetStart = Math.max(0, keywordIdx - 60);
      const snippetEnd = Math.min(text.length, keywordIdx + keyword.length + 60);
      const snippet = text.slice(snippetStart, snippetEnd).trim();
      return { found: true, snippet: `...${snippet}...` };
    }
  }

  return { found: false, snippet: '' };
}

// ---------------------------------------------------------------------------
// LLM confirmation for block-level violations
// ---------------------------------------------------------------------------

async function confirmViolationWithLLM(
  agentOutput: string,
  policyTitle: string,
  policyDescription: string | null,
  evidenceSnippet: string,
): Promise<{ violates: boolean; explanation: string; evidence_snippet: string } | null> {
  const llmConfig = resolveLLMConfig();
  if (!llmConfig.distillery) return null;

  try {
    const client = createLLMClient(llmConfig.distillery);

    const response = await client.chat.completions.create({
      model: llmConfig.distillery.model,
      temperature: 0,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content:
            'You are a policy compliance checker. Determine if agent output violates a decision policy. Return JSON only: { "violates": boolean, "explanation": string, "evidence_snippet": string }. Be conservative — only flag clear violations.',
        },
        {
          role: 'user',
          content: `Policy: "${policyTitle}"${policyDescription ? ` — ${policyDescription}` : ''}\n\nSuspected violation snippet: "${evidenceSnippet}"\n\nFull agent output:\n${agentOutput.slice(0, 2000)}`,
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content) as {
      violates: boolean;
      explanation: string;
      evidence_snippet: string;
    };
    return parsed;
  } catch (err) {
    console.warn(
      '[decigraph:governance] LLM confirmation failed:',
      (err as Error).message,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main: check output against policies
// ---------------------------------------------------------------------------

export async function checkOutputAgainstPolicies(
  params: PolicyCheckParams,
): Promise<PolicyViolation[]> {
  const db = getDb();
  const violations: PolicyViolation[] = [];

  // Query active block/warn policies for this project
  const policiesResult = await db.query<Record<string, unknown>>(
    `SELECT id, project_id, title, description, enforcement_level, scope, active
     FROM decision_policies
     WHERE project_id = ? AND active = ? AND enforcement_level IN (?, ?)`,
    [params.projectId, db.dialect === 'sqlite' ? 1 : true, 'block', 'warn'],
  );

  const policies = policiesResult.rows as unknown as PolicyRow[];

  for (const policy of policies) {
    const keywords = extractKeywords(policy.title);
    if (keywords.length === 0) continue;

    // Check each keyword for negation patterns in agent output
    let detected = false;
    let bestSnippet = '';

    for (const keyword of keywords) {
      const result = findNegationNearKeyword(params.agentOutput, keyword);
      if (result.found) {
        detected = true;
        bestSnippet = result.snippet;
        break;
      }
    }

    if (!detected) continue;

    // For block-level: attempt LLM confirmation
    if (policy.enforcement_level === 'block') {
      const llmResult = await confirmViolationWithLLM(
        params.agentOutput,
        policy.title,
        policy.description,
        bestSnippet,
      );

      if (llmResult) {
        if (!llmResult.violates) continue; // LLM says no violation

        const violation: PolicyViolation = {
          policy_id: policy.id,
          policy_title: policy.title,
          enforcement_level: policy.enforcement_level,
          violation_type: 'llm_confirmed',
          severity: 'block',
          evidence_snippet: llmResult.evidence_snippet || bestSnippet,
          explanation: llmResult.explanation,
        };

        violations.push(violation);
        await insertViolation(params, violation);
        continue;
      }

      // LLM unavailable — fall back to keyword-only for block
    }

    // Keyword-only violation (warn-level or block-level fallback)
    const violation: PolicyViolation = {
      policy_id: policy.id,
      policy_title: policy.title,
      enforcement_level: policy.enforcement_level,
      violation_type: 'keyword',
      severity: policy.enforcement_level,
      evidence_snippet: bestSnippet,
      explanation: `Agent output contains negation pattern near policy keyword from "${policy.title}"`,
    };

    violations.push(violation);
    await insertViolation(params, violation);
  }

  // Fire webhooks for violations
  if (violations.length > 0) {
    dispatchWebhooks(params.projectId, 'policy_violation_detected', {
      violations: violations.map((v) => ({
        policy_title: v.policy_title,
        severity: v.severity,
        evidence_snippet: v.evidence_snippet,
      })),
      agent_name: params.agentName,
      outcome_id: params.outcomeId,
    }).catch((err: Error) => {
      console.warn('[decigraph:governance] Webhook dispatch error:', err.message);
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Insert violation record
// ---------------------------------------------------------------------------

async function insertViolation(
  params: PolicyCheckParams,
  violation: PolicyViolation,
): Promise<void> {
  const db = getDb();
  try {
    await db.query(
      `INSERT INTO policy_violations
        (policy_id, project_id, agent_id, agent_name, outcome_id, compile_history_id,
         violation_type, severity, evidence_snippet, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        violation.policy_id,
        params.projectId,
        params.agentId ?? null,
        params.agentName ?? null,
        params.outcomeId ?? null,
        params.compileHistoryId ?? null,
        violation.violation_type,
        violation.severity,
        violation.evidence_snippet,
        violation.explanation,
      ],
    );
  } catch (err) {
    console.error('[decigraph:governance] Failed to insert violation:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Pre-compile policy check (keyword-only, no DB writes)
// ---------------------------------------------------------------------------

export interface PreCompileCheckResult {
  compliant: boolean;
  violations: Array<{
    policy_id: string;
    policy_title: string;
    enforcement_level: string;
    evidence_snippet: string;
    explanation: string;
  }>;
  advisories: Array<{
    policy_id: string;
    policy_title: string;
    message: string;
  }>;
}

export async function checkPlannedAction(
  projectId: string,
  agentName: string,
  plannedAction: string,
): Promise<PreCompileCheckResult> {
  const db = getDb();

  const policiesResult = await db.query<Record<string, unknown>>(
    `SELECT id, project_id, title, description, enforcement_level, scope, active
     FROM decision_policies
     WHERE project_id = ? AND active = ?`,
    [projectId, db.dialect === 'sqlite' ? 1 : true],
  );

  const policies = policiesResult.rows as unknown as PolicyRow[];

  const violations: PreCompileCheckResult['violations'] = [];
  const advisories: PreCompileCheckResult['advisories'] = [];

  for (const policy of policies) {
    const keywords = extractKeywords(policy.title);
    if (keywords.length === 0) continue;

    // Check for negation near keywords
    let detected = false;
    let bestSnippet = '';

    for (const keyword of keywords) {
      const result = findNegationNearKeyword(plannedAction, keyword);
      if (result.found) {
        detected = true;
        bestSnippet = result.snippet;
        break;
      }
    }

    if (!detected) continue;

    if (policy.enforcement_level === 'advisory') {
      advisories.push({
        policy_id: policy.id,
        policy_title: policy.title,
        message: `Planned action may conflict with advisory policy: "${policy.title}"`,
      });
    } else {
      violations.push({
        policy_id: policy.id,
        policy_title: policy.title,
        enforcement_level: policy.enforcement_level,
        evidence_snippet: bestSnippet,
        explanation: `Planned action contains negation pattern near policy keyword from "${policy.title}"`,
      });
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
    advisories,
  };
}
