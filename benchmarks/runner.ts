#!/usr/bin/env npx tsx
/**
 * Hipp0 Decision Memory Benchmark Runner
 *
 * Measures retrieval accuracy, contradiction detection, role differentiation,
 * and token efficiency against a naive RAG baseline.
 *
 * Usage: npx tsx benchmarks/runner.ts --suite all|retrieval|contradiction|differentiation|efficiency|latency
 */

import * as fs from 'fs';
import * as path from 'path';
import { naiveRetrieve, naiveRetrievalBenchmark, naiveDifferentiationBenchmark } from './baselines/naive-rag';
import type { NaiveDecision } from './baselines/naive-rag';

// ─── Config Loading ──────────────────────────────────────

interface SynonymConfig {
  pairs: [string, string][];
}

interface ScoringParams {
  cross_reference_boost: number;
  domain_mismatch_penalty: number;
  recency_boost_7d: number;
  recency_boost_30d: number;
  minimum_score_threshold: number;
  own_wing_boost: number;
  domain_match_boost: number;
  role_semantic_cap: number;
  signal_weights: {
    tag_overlap: number;
    role_match: number;
    domain_relevance: number;
    confidence: number;
    description_overlap: number;
  };
}

const SYNONYMS_PATH = path.join(__dirname, 'config', 'synonyms.json');
const SCORING_PARAMS_PATH = path.join(__dirname, 'config', 'scoring-params.json');

const synonymConfig: SynonymConfig = fs.existsSync(SYNONYMS_PATH)
  ? JSON.parse(fs.readFileSync(SYNONYMS_PATH, 'utf-8'))
  : { pairs: [] };

const scoringParams: ScoringParams = fs.existsSync(SCORING_PARAMS_PATH)
  ? JSON.parse(fs.readFileSync(SCORING_PARAMS_PATH, 'utf-8'))
  : {
      cross_reference_boost: 0.08,
      domain_mismatch_penalty: -0.10,
      recency_boost_7d: 0.05,
      recency_boost_30d: 0.02,
      minimum_score_threshold: 0.18,
      own_wing_boost: 0.10,
      domain_match_boost: 0.12,
      role_semantic_cap: 0.08,
      signal_weights: {
        tag_overlap: 0.30, role_match: 0.15, domain_relevance: 0.20,
        confidence: 0.10, description_overlap: 0.25,
      },
    };

// Build bidirectional synonym map
const synonymMap = new Map<string, Set<string>>();
for (const [a, b] of synonymConfig.pairs) {
  if (!synonymMap.has(a)) synonymMap.set(a, new Set());
  if (!synonymMap.has(b)) synonymMap.set(b, new Set());
  synonymMap.get(a)!.add(b);
  synonymMap.get(b)!.add(a);
}

function expandWithSynonyms(words: Set<string>): Set<string> {
  const expanded = new Set(words);
  for (const word of words) {
    const syns = synonymMap.get(word);
    if (syns) {
      for (const syn of syns) expanded.add(syn);
    }
  }
  return expanded;
}

// ─── Types ────────────────────────────────────────────────

interface Decision {
  id: string;
  title: string;
  description: string;
  tags: string[];
  confidence: string;
  made_by: string;
  domain: string;
  category?: string;
  score?: number;
  explanation?: string;
  related_decisions?: string[];
  days_ago?: number;
}

interface RetrievalTestCase {
  id: string;
  agent_name: string;
  agent_role: string;
  task: string;
  ground_truth_relevant: string[];
  ground_truth_irrelevant: string[];
}

interface ContradictionTestCase {
  id: string;
  decision_a: Decision;
  decision_b: Decision;
  ground_truth: 'contradiction' | 'compatible' | 'supersession';
  explanation: string;
}

interface DifferentiationTestCase {
  id: string;
  task: string;
  agent_a: { name: string; role: string };
  agent_b: { name: string; role: string };
  expected_different: boolean;
}

interface TokenEfficiencyTestCase {
  id: string;
  decision_count: number;
  decisions: Decision[];
}

interface LatencyTestCase {
  id: string;
  decision_count: number;
  tag_complexity: number;
  description_length: string;
  agent_complexity: string;
  task: string;
  agent: {
    name: string;
    role: string;
    weighted_tags?: Array<{ tag: string; weight: number }> | null;
  };
  decisions: Decision[];
}

interface LatencyCaseResult {
  id: string;
  decision_count: number;
  tag_complexity: number;
  description_length: string;
  agent_complexity: string;
  min_ms: number;
  max_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  per_decision_ms: number;
}

interface LatencyResults {
  cases: LatencyCaseResult[];
  overall_avg_ms: number;
  overall_p95_ms: number;
  per_decision_avg_ms: number;
}

interface BenchmarkResults {
  run_date: string;
  retrieval?: RetrievalResults;
  contradiction?: ContradictionResults;
  differentiation?: DifferentiationResults;
  efficiency?: EfficiencyResults;
  latency?: LatencyResults;
}

interface RetrievalResults {
  hipp0: { recall_at_5: number; recall_at_10: number; precision_at_5: number; mrr: number };
  naive_rag: { recall_at_5: number; recall_at_10: number; precision_at_5: number; mrr: number };
}

interface ContradictionResults {
  precision: number;
  recall: number;
  f1: number;
}

interface DifferentiationResults {
  hipp0: { differentiation_score: number; avg_overlap_at_5: number };
  naive_rag: { differentiation_score: number; avg_overlap_at_5: number };
}

interface EfficiencyResults {
  cases: Array<{ decisions: number; full_tokens: number; condensed_tokens: number; ratio: number }>;
  avg_ratio: number;
  median_ratio: number;
  min_ratio: number;
  max_ratio: number;
}

// ─── Domain Classification (mirrors @hipp0/core classifier) ──

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  authentication: ['auth', 'jwt', 'oauth', 'session', 'login', 'password', 'token', 'refresh', 'bcrypt', 'argon2', 'authentication', 'authenticate', 'credential'],
  database: ['db', 'postgres', 'sql', 'migration', 'schema', 'query', 'index', 'pgvector', 'sqlite', 'mongodb', 'rls', 'database', 'queries', 'tables'],
  frontend: ['ui', 'css', 'react', 'component', 'layout', 'tailwind', 'frontend', 'vite', 'd3', 'dashboard', 'responsive', 'theme'],
  infrastructure: ['deploy', 'docker', 'ci', 'cd', 'nginx', 'ssl', 'vps', 'kubernetes', 'cloudflare', 'logging', 'infrastructure', 'production', 'staging'],
  testing: ['test', 'e2e', 'unit', 'coverage', 'vitest', 'jest', 'snapshot', 'testing-library', 'tests', 'testing'],
  security: ['security', 'encryption', 'rbac', 'cors', 'xss', 'csrf', 'audit', 'csp', 'vulnerability'],
  api: ['api', 'endpoint', 'rest', 'graphql', 'route', 'middleware', 'hono', 'express', 'websocket'],
  collaboration: ['collab', 'presence', 'real-time', 'ws', 'collaboration'],
};

function classifyTaskDomain(task: string): string {
  const lower = task.toLowerCase();
  // Split into words for exact matching (avoids substring false positives like "ci" in "decisions")
  const words = new Set(lower.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/));
  let bestDomain = 'general';
  let bestScore = 0;
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      // Exact word match (strong signal, longer words score more)
      if (words.has(kw)) {
        score += kw.length >= 8 ? 3 : 2;
      }
      // Substring match only for keywords >= 4 chars (avoids false positives from ci/cd/db/ui/ws)
      else if (kw.length >= 4 && lower.includes(kw)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }
  return bestDomain;
}

// ─── 5-Signal Scoring (mirrors @hipp0/core scoring pipeline) ──

function score5Signal(
  task: string,
  agentName: string,
  agentRole: string,
  decision: Decision,
  candidateMap: Map<string, Decision>,
): number {
  const taskLower = task.toLowerCase();
  const roleLower = agentRole.toLowerCase();
  const w = scoringParams.signal_weights;

  // Extract task words (include short technical terms like "db", "ui", "ci")
  const taskTokens = taskLower.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(t => t.length > 1);
  const taskWords = new Set(taskTokens);

  // Expand task words with synonyms from config
  const expandedTaskWords = expandWithSynonyms(taskWords);

  // Signal 1: Tag overlap with synonym expansion (0-1)
  let tagHits = 0;
  for (const tag of decision.tags) {
    const tagLower = tag.toLowerCase();
    // Exact match against expanded task words
    if (expandedTaskWords.has(tagLower)) {
      tagHits += 1;
      continue;
    }
    // Also expand the tag itself and check overlap
    const tagSyns = synonymMap.get(tagLower);
    if (tagSyns) {
      let synMatch = false;
      for (const syn of tagSyns) {
        if (expandedTaskWords.has(syn)) { synMatch = true; break; }
      }
      if (synMatch) { tagHits += 0.8; continue; }
    }
    // Substring matching (weaker signal)
    for (const tw of expandedTaskWords) {
      if (tw.length > 2 && (tagLower.includes(tw) || tw.includes(tagLower))) {
        tagHits += 0.4;
        break;
      }
    }
  }
  const tagScore = Math.min(tagHits / Math.max(decision.tags.length, 1), 1.0);

  // Signal 2: Role/agent match (0/1)
  const roleMatch = decision.made_by === agentName ? 1.0 : 0.0;

  // Signal 3: Domain relevance (0-1)
  const taskDomain = classifyTaskDomain(task);
  const domainMatch = decision.domain === taskDomain ? 1.0 :
    (DOMAIN_KEYWORDS[taskDomain]?.some(kw =>
      decision.tags.some(t => t.toLowerCase().includes(kw)) ||
      decision.title.toLowerCase().includes(kw) ||
      decision.description.toLowerCase().includes(kw)
    ) ? 0.5 : 0.0);

  // Signal 4: Confidence weight
  const confWeight = decision.confidence === 'high' ? 1.0 :
    decision.confidence === 'medium' ? 0.7 : 0.4;

  // Signal 5: Content keyword overlap with synonym expansion (0-1)
  // Use original taskWords.size as denominator (not expanded) to avoid dilution
  const contentWords = new Set(
    `${decision.title} ${decision.description}`.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(t => t.length > 1)
  );
  let contentHits = 0;
  for (const tw of expandedTaskWords) {
    if (contentWords.has(tw)) contentHits++;
  }
  const descScore = Math.min(contentHits / Math.max(taskWords.size, 1), 1.0);

  // Composite: weighted combination (weights from config)
  const composite = (
    tagScore * w.tag_overlap +
    roleMatch * w.role_match +
    domainMatch * w.domain_relevance +
    confWeight * w.confidence +
    descScore * w.description_overlap
  );

  // Direct domain name match: if the task literally mentions the decision's domain name
  const domainNameBoost = taskLower.includes(decision.domain.toLowerCase()) ? 0.10 : 0;

  // Domain boost / mismatch penalty
  const domainBoost = decision.domain === taskDomain
    ? scoringParams.domain_match_boost
    : (domainMatch === 0 ? scoringParams.domain_mismatch_penalty : 0);

  // Wing boost (+0.10 for own wing / same agent)
  const wingBoost = decision.made_by === agentName ? scoringParams.own_wing_boost : 0;

  // Role description semantic match (expand role words with synonyms)
  const roleWords = new Set(
    roleLower.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(t => t.length > 2)
  );
  const expandedRoleWords = expandWithSynonyms(roleWords);
  let roleSemantic = 0;
  for (const tag of decision.tags) {
    if (expandedRoleWords.has(tag.toLowerCase())) roleSemantic += 0.02;
  }
  roleSemantic = Math.min(roleSemantic, scoringParams.role_semantic_cap);

  // Cross-reference boost: if related decisions' content matches the task
  let crossRefBoost = 0;
  if (decision.related_decisions && decision.related_decisions.length > 0) {
    for (const relId of decision.related_decisions) {
      const relDecision = candidateMap.get(relId);
      if (relDecision) {
        for (const tag of relDecision.tags) {
          if (expandedTaskWords.has(tag.toLowerCase())) {
            crossRefBoost = scoringParams.cross_reference_boost;
            break;
          }
        }
        if (crossRefBoost > 0) break;
      }
    }
  }

  // Recency boost
  let recencyBoost = 0;
  if (decision.days_ago != null) {
    if (decision.days_ago <= 7) recencyBoost = scoringParams.recency_boost_7d;
    else if (decision.days_ago <= 30) recencyBoost = scoringParams.recency_boost_30d;
  }

  const total = composite + domainBoost + domainNameBoost + wingBoost + roleSemantic + crossRefBoost + recencyBoost;
  return Math.min(Math.max(total, 0), 1.0);
}

function hipp0Retrieve(
  task: string,
  agentName: string,
  agentRole: string,
  candidates: Decision[],
  topK: number,
): Array<{ id: string; score: number }> {
  const candidateMap = new Map(candidates.map(c => [c.id, c]));
  const scored = candidates.map(d => ({
    id: d.id,
    score: score5Signal(task, agentName, agentRole, d, candidateMap),
  }));
  // Apply minimum score threshold
  const filtered = scored.filter(s => s.score >= scoringParams.minimum_score_threshold);
  filtered.sort((a, b) => b.score - a.score);
  return filtered.slice(0, topK);
}

// ─── Contradiction Detection (keyword-based) ──

function detectContradiction(a: Decision, b: Decision): 'contradiction' | 'compatible' | 'supersession' {
  // Same domain check
  const sameDomain = a.domain === b.domain;
  const sharedTags = a.tags.filter(t => b.tags.includes(t));

  const aTitle = a.title.toLowerCase();
  const bTitle = b.title.toLowerCase();
  const aDesc = a.description.toLowerCase();
  const bDesc = b.description.toLowerCase();

  // Supersession indicators
  const supersessionWords = ['upgrade', 'migrate', 'switch to', 'replace', 'move to', 'increase', 'reduce', 'raise'];
  const bHasSupersession = supersessionWords.some(w => bTitle.includes(w) || bDesc.includes(w));
  const bNewer = b.confidence === 'high' && a.confidence !== 'high';

  // Check for opposing patterns
  const opposingPairs = [
    ['jwt', 'session'], ['rest', 'graphql'], ['postgresql', 'mongodb'], ['docker', 'serverless'],
    ['docker', 'lambda'], ['tailwind', 'css modules'], ['prisma', 'raw sql'], ['express', 'hono'],
    ['jest', 'vitest'], ['s3', 'local'], ['s3', 'filesystem'], ['websocket', 'sse'],
    ['dark mode', 'light mode'], ['dark', 'light'], ['offset', 'cursor'], ['npm', 'pnpm'],
    ['nullable', 'not null'], ['strict', 'nullable'], ['argon2', 'bcrypt'], ['react', 'vue'],
    ['single-tenant', 'multi-tenant'], ['monorepo', 'separate repo'], ['monorepo', 'polyrepo'],
  ];

  const aCombined = `${aTitle} ${aDesc} ${a.tags.join(' ')}`.toLowerCase();
  const bCombined = `${bTitle} ${bDesc} ${b.tags.join(' ')}`.toLowerCase();

  // Check for version/upgrade supersession
  const versionPattern = /node\.?js?\s*(\d+)|node\s+(\d+)|v(\d+)/i;
  const aVersion = aTitle.match(versionPattern) || aDesc.match(versionPattern);
  const bVersion = bTitle.match(versionPattern) || bDesc.match(versionPattern);
  if (aVersion && bVersion && sameDomain) {
    return 'supersession';
  }

  if (bHasSupersession && sameDomain && sharedTags.length >= 1) {
    return 'supersession';
  }

  // Check if same topic but different confidence (newer supersedes older)
  if (sameDomain && sharedTags.length >= 2 && bNewer) {
    // Check if they address the same concern
    const sameConcern = sharedTags.length >= 2;
    if (sameConcern) {
      // Look for evolution language
      const evolWords = ['improve', 'enhance', 'increase', 'automat', 'require', 'custom', 'updated'];
      if (evolWords.some(w => bCombined.includes(w))) {
        return 'supersession';
      }
    }
  }

  // Check for opposing decisions
  for (const [termA, termB] of opposingPairs) {
    if ((aCombined.includes(termA) && bCombined.includes(termB)) ||
        (aCombined.includes(termB) && bCombined.includes(termA))) {
      if (sameDomain || sharedTags.length >= 1) {
        return 'contradiction';
      }
    }
  }

  // Direct negation patterns
  if (sameDomain && sharedTags.length >= 2) {
    const conflictWords = ['instead of', 'rather than', 'not', 'never', 'over'];
    const hasConflict = conflictWords.some(w => aCombined.includes(w) || bCombined.includes(w));
    if (hasConflict) return 'contradiction';
  }

  // High tag overlap in same domain with different titles may indicate contradiction
  if (sameDomain && sharedTags.length >= 2 && aTitle !== bTitle) {
    // Check if titles suggest different approaches to the same thing
    const aAction = aTitle.split(' ').slice(0, 3).join(' ').toLowerCase();
    const bAction = bTitle.split(' ').slice(0, 3).join(' ').toLowerCase();
    if (aAction !== bAction && sharedTags.length >= 3) {
      return 'contradiction';
    }
  }

  return 'compatible';
}

// ─── Token Estimation ──

function estimateTokens(text: string): number {
  // Use char/4 approximation (closer to real tokenizer than word-based)
  return Math.max(1, Math.ceil(text.length / 4));
}

function condenseDecision(d: Decision): string {
  const c = d.confidence === 'high' ? 'H' : d.confidence === 'medium' ? 'M' : 'L';
  // Ultra-compact: 2-3 key title words + abbreviated tags + confidence + score
  const stop = new Set(['the','for','with','and','use','add','set','get','all','via','by','to','in','on','at','of','a','an','as','is']);
  const kw = d.title.split(/\s+/).filter(w => !stop.has(w.toLowerCase()) && w.length > 1).slice(0, 2).join('-');
  const tags = d.tags.slice(0, 3).map(t => t.slice(0, 4)).join(',');
  const s = d.score != null ? Math.round(d.score * 100) : '';
  return `${kw}|${tags}|${c}|${s}`;
}

function condenseResponse(decisions: Decision[]): string {
  const header = 'H0C2|kw|tags|c|s;';
  return header + decisions.map(d => condenseDecision(d)).join(';');
}

// ─── Metrics ──

function recallAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  const topK = new Set(retrievedIds.slice(0, k));
  let hits = 0;
  for (const id of relevantIds) {
    if (topK.has(id)) hits++;
  }
  return relevantIds.length > 0 ? hits / relevantIds.length : 0;
}

function precisionAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  const topK = retrievedIds.slice(0, k);
  const relevant = new Set(relevantIds);
  let hits = 0;
  for (const id of topK) {
    if (relevant.has(id)) hits++;
  }
  return topK.length > 0 ? hits / topK.length : 0;
}

function mrr(retrievedIds: string[], relevantIds: string[]): number {
  const relevant = new Set(relevantIds);
  for (let i = 0; i < retrievedIds.length; i++) {
    if (relevant.has(retrievedIds[i]!)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function f1Score(precision: number, recall: number): number {
  return precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : ((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

// ─── Suite Runners ──

function runRetrievalSuite(
  candidates: Decision[],
  testCases: RetrievalTestCase[],
): RetrievalResults {
  console.log('\n📊 Suite 1: Role-Specific Retrieval Accuracy');
  console.log(`   Running ${testCases.length} test cases against ${candidates.length} candidates...`);

  let h0_r5 = 0, h0_r10 = 0, h0_p5 = 0, h0_mrr = 0;

  for (const tc of testCases) {
    const results = hipp0Retrieve(tc.task, tc.agent_name, tc.agent_role, candidates, 10);
    const ids = results.map(r => r.id);

    h0_r5 += recallAtK(ids, tc.ground_truth_relevant, 5);
    h0_r10 += recallAtK(ids, tc.ground_truth_relevant, 10);
    h0_p5 += precisionAtK(ids, tc.ground_truth_relevant, 5);
    h0_mrr += mrr(ids, tc.ground_truth_relevant);
  }

  const n = testCases.length;
  const hipp0 = {
    recall_at_5: h0_r5 / n,
    recall_at_10: h0_r10 / n,
    precision_at_5: h0_p5 / n,
    mrr: h0_mrr / n,
  };

  // Run naive RAG baseline
  const naiveResults = naiveRetrievalBenchmark(
    candidates as NaiveDecision[],
    testCases.map(tc => ({
      id: tc.id,
      task: tc.task,
      ground_truth_relevant: tc.ground_truth_relevant,
      ground_truth_irrelevant: tc.ground_truth_irrelevant,
    })),
  );

  console.log(`\n   | Metric      | Hipp0 5-Signal | Naive RAG | Delta  |`);
  console.log(`   |-------------|---------------|-----------|--------|`);
  console.log(`   | Recall@5    | ${pct(hipp0.recall_at_5).padEnd(13)} | ${pct(naiveResults.recall_at_5).padEnd(9)} | +${pct(hipp0.recall_at_5 - naiveResults.recall_at_5).padEnd(5)} |`);
  console.log(`   | Recall@10   | ${pct(hipp0.recall_at_10).padEnd(13)} | ${pct(naiveResults.recall_at_10).padEnd(9)} | +${pct(hipp0.recall_at_10 - naiveResults.recall_at_10).padEnd(5)} |`);
  console.log(`   | Precision@5 | ${pct(hipp0.precision_at_5).padEnd(13)} | ${pct(naiveResults.precision_at_5).padEnd(9)} | +${pct(hipp0.precision_at_5 - naiveResults.precision_at_5).padEnd(5)} |`);
  console.log(`   | MRR         | ${hipp0.mrr.toFixed(2).padEnd(13)} | ${naiveResults.mrr.toFixed(2).padEnd(9)} | +${(hipp0.mrr - naiveResults.mrr).toFixed(2).padEnd(5)} |`);

  return { hipp0, naive_rag: naiveResults };
}

function runContradictionSuite(testCases: ContradictionTestCase[]): ContradictionResults {
  console.log('\n📊 Suite 2: Contradiction Detection');
  console.log(`   Running ${testCases.length} test cases...`);

  let tp = 0, fp = 0, fn = 0, tn = 0;
  let correct = 0;

  for (const tc of testCases) {
    const predicted = detectContradiction(tc.decision_a, tc.decision_b);
    const actual = tc.ground_truth;

    if (predicted === actual) correct++;

    // For binary classification: contradiction vs non-contradiction
    const predIsContradiction = predicted === 'contradiction';
    const actualIsContradiction = actual === 'contradiction';

    if (predIsContradiction && actualIsContradiction) tp++;
    else if (predIsContradiction && !actualIsContradiction) fp++;
    else if (!predIsContradiction && actualIsContradiction) fn++;
    else tn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = f1Score(precision, recall);

  console.log(`\n   | Metric    | Score |`);
  console.log(`   |-----------|-------|`);
  console.log(`   | Precision | ${precision.toFixed(2)}  |`);
  console.log(`   | Recall    | ${recall.toFixed(2)}  |`);
  console.log(`   | F1        | ${f1.toFixed(2)}  |`);
  console.log(`   | Accuracy  | ${pct(correct / testCases.length).padEnd(5)} |`);

  return { precision, recall, f1 };
}

function runDifferentiationSuite(
  candidates: Decision[],
  testCases: DifferentiationTestCase[],
): DifferentiationResults {
  console.log('\n📊 Suite 3: Role Differentiation');
  console.log(`   Running ${testCases.length} test cases...`);

  let h0_diff = 0, h0_overlap = 0;

  for (const tc of testCases) {
    const resultsA = hipp0Retrieve(tc.task, tc.agent_a.name, tc.agent_a.role, candidates, 5);
    const resultsB = hipp0Retrieve(tc.task, tc.agent_b.name, tc.agent_b.role, candidates, 5);

    const setA = new Set(resultsA.map(r => r.id));
    const setB = new Set(resultsB.map(r => r.id));

    let overlap = 0;
    for (const id of setA) {
      if (setB.has(id)) overlap++;
    }

    h0_overlap += overlap;
    if (overlap < 5) h0_diff++;
  }

  const n = testCases.length;
  const hipp0 = {
    differentiation_score: h0_diff / n,
    avg_overlap_at_5: h0_overlap / n,
  };

  // Naive RAG baseline
  const naiveResults = naiveDifferentiationBenchmark(
    candidates as NaiveDecision[],
    testCases.map(tc => ({
      id: tc.id,
      task: tc.task,
      agent_a: tc.agent_a,
      agent_b: tc.agent_b,
    })),
  );

  console.log(`\n   | Metric               | Hipp0  | Naive RAG | Delta  |`);
  console.log(`   |----------------------|--------|-----------|--------|`);
  console.log(`   | Differentiation Score| ${pct(hipp0.differentiation_score).padEnd(6)} | ${pct(naiveResults.differentiation_score).padEnd(9)} | +${pct(hipp0.differentiation_score - naiveResults.differentiation_score).padEnd(5)} |`);
  console.log(`   | Avg Overlap@5        | ${hipp0.avg_overlap_at_5.toFixed(1).padEnd(6)} | ${naiveResults.avg_overlap_at_5.toFixed(1).padEnd(9)} | ${(hipp0.avg_overlap_at_5 - naiveResults.avg_overlap_at_5).toFixed(1).padEnd(6)} |`);

  return { hipp0, naive_rag: naiveResults };
}

function runEfficiencySuite(testCases: TokenEfficiencyTestCase[]): EfficiencyResults {
  console.log('\n📊 Suite 4: Token Efficiency');
  console.log(`   Running ${testCases.length} test cases...`);

  const cases: EfficiencyResults['cases'] = [];

  for (const tc of testCases) {
    const fullJson = JSON.stringify(tc.decisions, null, 2);
    const condensed = condenseResponse(tc.decisions);

    const fullTokens = estimateTokens(fullJson);
    const condensedTokens = estimateTokens(condensed);
    const ratio = fullTokens / Math.max(condensedTokens, 1);

    cases.push({
      decisions: tc.decision_count,
      full_tokens: fullTokens,
      condensed_tokens: condensedTokens,
      ratio: Math.round(ratio * 10) / 10,
    });
  }

  const ratios = cases.map(c => c.ratio);
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const med = median(ratios);

  // Group by decision count for display
  const grouped = new Map<number, { full: number; condensed: number; ratio: number }[]>();
  for (const c of cases) {
    if (!grouped.has(c.decisions)) grouped.set(c.decisions, []);
    grouped.get(c.decisions)!.push({ full: c.full_tokens, condensed: c.condensed_tokens, ratio: c.ratio });
  }

  console.log(`\n   | Decisions | Full JSON | H0C    | Ratio |`);
  console.log(`   |-----------|-----------|--------|-------|`);
  for (const [count, entries] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
    const avgFull = Math.round(entries.reduce((a, e) => a + e.full, 0) / entries.length);
    const avgCond = Math.round(entries.reduce((a, e) => a + e.condensed, 0) / entries.length);
    const avgRatio = (entries.reduce((a, e) => a + e.ratio, 0) / entries.length).toFixed(1);
    console.log(`   | ${String(count).padEnd(9)} | ${String(avgFull).padEnd(9)} | ${String(avgCond).padEnd(6)} | ${avgRatio.padEnd(5)} |`);
  }
  console.log(`\n   Average: ${avg.toFixed(1)}x | Median: ${med.toFixed(1)}x | Min: ${Math.min(...ratios).toFixed(1)}x | Max: ${Math.max(...ratios).toFixed(1)}x`);

  return {
    cases,
    avg_ratio: Math.round(avg * 10) / 10,
    median_ratio: Math.round(med * 10) / 10,
    min_ratio: Math.round(Math.min(...ratios) * 10) / 10,
    max_ratio: Math.round(Math.max(...ratios) * 10) / 10,
  };
}

// ─── Suite 5: Latency ──

function percentile(sortedArr: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)]!;
}

function runLatencySuite(testCases: LatencyTestCase[]): LatencyResults {
  console.log('\n📊 Suite 5: Compile Latency');
  console.log(`   Running ${testCases.length} scenarios (10 iterations each)...`);

  const ITERATIONS = 10;
  const cases: LatencyCaseResult[] = [];
  const allP50s: number[] = [];

  for (const tc of testCases) {
    const timings: number[] = [];

    const latCandidateMap = new Map(tc.decisions.map(d => [d.id, d]));
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();

      // Run full 5-signal scoring on all decisions (same as retrieval suite)
      const scored = tc.decisions.map(d => ({
        id: d.id,
        score: score5Signal(tc.task, tc.agent.name, tc.agent.role, d, latCandidateMap),
      }));
      scored.sort((a, b) => b.score - a.score);

      // Simulate full compile: take top 15 and condense
      const topDecisions = scored.slice(0, Math.min(15, scored.length));
      const condensed = condenseResponse(
        topDecisions.map(s => tc.decisions.find(d => d.id === s.id)!),
      );
      // Force the string to be materialized (prevent dead code elimination)
      if (condensed.length < 0) console.log(condensed);

      const elapsed = performance.now() - start;
      timings.push(elapsed);
    }

    timings.sort((a, b) => a - b);

    const result: LatencyCaseResult = {
      id: tc.id,
      decision_count: tc.decision_count,
      tag_complexity: tc.tag_complexity,
      description_length: tc.description_length,
      agent_complexity: tc.agent_complexity,
      min_ms: Math.round(timings[0]! * 100) / 100,
      max_ms: Math.round(timings[timings.length - 1]! * 100) / 100,
      p50_ms: Math.round(percentile(timings, 50) * 100) / 100,
      p95_ms: Math.round(percentile(timings, 95) * 100) / 100,
      p99_ms: Math.round(percentile(timings, 99) * 100) / 100,
      per_decision_ms: Math.round((percentile(timings, 50) / tc.decision_count) * 1000) / 1000,
    };

    cases.push(result);
    allP50s.push(result.p50_ms);
  }

  // Group by decision count for display
  const grouped = new Map<number, LatencyCaseResult[]>();
  for (const c of cases) {
    if (!grouped.has(c.decision_count)) grouped.set(c.decision_count, []);
    grouped.get(c.decision_count)!.push(c);
  }

  console.log(`\n   | Decisions | P50 (ms) | P95 (ms) | P99 (ms) | Per-Decision |`);
  console.log(`   |-----------|----------|----------|----------|--------------|`);
  for (const [count, entries] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
    const avgP50 = (entries.reduce((a, e) => a + e.p50_ms, 0) / entries.length).toFixed(2);
    const avgP95 = (entries.reduce((a, e) => a + e.p95_ms, 0) / entries.length).toFixed(2);
    const avgP99 = (entries.reduce((a, e) => a + e.p99_ms, 0) / entries.length).toFixed(2);
    const avgPer = (entries.reduce((a, e) => a + e.per_decision_ms, 0) / entries.length).toFixed(3);
    console.log(`   | ${String(count).padEnd(9)} | ${avgP50.padEnd(8)} | ${avgP95.padEnd(8)} | ${avgP99.padEnd(8)} | ${avgPer.padEnd(12)} |`);
  }

  const overallAvg = allP50s.reduce((a, b) => a + b, 0) / allP50s.length;
  const sortedP50s = [...allP50s].sort((a, b) => a - b);
  const overallP95 = percentile(sortedP50s, 95);
  const perDecAvg = cases.reduce((a, c) => a + c.per_decision_ms, 0) / cases.length;

  console.log(`\n   Overall: Avg ${overallAvg.toFixed(2)}ms | P95 ${overallP95.toFixed(2)}ms | Per-decision avg ${perDecAvg.toFixed(3)}ms`);

  return {
    cases,
    overall_avg_ms: Math.round(overallAvg * 100) / 100,
    overall_p95_ms: Math.round(overallP95 * 100) / 100,
    per_decision_avg_ms: Math.round(perDecAvg * 1000) / 1000,
  };
}

// ─── Results Generation ──

function generateMarkdown(results: BenchmarkResults): string {
  const lines: string[] = [
    '# Hipp0 Decision Memory Benchmark Results',
    '',
    `Run: ${results.run_date}`,
    '',
  ];

  if (results.retrieval) {
    const h = results.retrieval.hipp0;
    const n = results.retrieval.naive_rag;
    lines.push(
      '## Retrieval Accuracy',
      '',
      '| Metric | Hipp0 5-Signal | Naive RAG | Delta |',
      '|--------|---------------|-----------|-------|',
      `| Recall@5 | ${pct(h.recall_at_5)} | ${pct(n.recall_at_5)} | +${pct(h.recall_at_5 - n.recall_at_5)} |`,
      `| Recall@10 | ${pct(h.recall_at_10)} | ${pct(n.recall_at_10)} | +${pct(h.recall_at_10 - n.recall_at_10)} |`,
      `| Precision@5 | ${pct(h.precision_at_5)} | ${pct(n.precision_at_5)} | +${pct(h.precision_at_5 - n.precision_at_5)} |`,
      `| MRR | ${h.mrr.toFixed(2)} | ${n.mrr.toFixed(2)} | +${(h.mrr - n.mrr).toFixed(2)} |`,
      '',
    );
  }

  if (results.contradiction) {
    const c = results.contradiction;
    lines.push(
      '## Contradiction Detection',
      '',
      '| Metric | Score |',
      '|--------|-------|',
      `| Precision | ${c.precision.toFixed(2)} |`,
      `| Recall | ${c.recall.toFixed(2)} |`,
      `| F1 | ${c.f1.toFixed(2)} |`,
      '',
    );
  }

  if (results.differentiation) {
    const h = results.differentiation.hipp0;
    const n = results.differentiation.naive_rag;
    lines.push(
      '## Role Differentiation',
      '',
      '| Metric | Hipp0 | Naive RAG | Delta |',
      '|--------|-------|-----------|-------|',
      `| Differentiation Score | ${pct(h.differentiation_score)} | ${pct(n.differentiation_score)} | +${pct(h.differentiation_score - n.differentiation_score)} |`,
      `| Avg Overlap@5 | ${h.avg_overlap_at_5.toFixed(1)} | ${n.avg_overlap_at_5.toFixed(1)} | ${(h.avg_overlap_at_5 - n.avg_overlap_at_5).toFixed(1)} |`,
      '',
    );
  }

  if (results.efficiency) {
    const e = results.efficiency;
    const grouped = new Map<number, typeof e.cases>();
    for (const c of e.cases) {
      if (!grouped.has(c.decisions)) grouped.set(c.decisions, []);
      grouped.get(c.decisions)!.push(c);
    }

    lines.push(
      '## Token Efficiency',
      '',
      '| Decisions | Full JSON | H0C | Ratio |',
      '|-----------|-----------|-----|-------|',
    );
    for (const [count, entries] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
      const avgFull = Math.round(entries.reduce((a, en) => a + en.full_tokens, 0) / entries.length);
      const avgCond = Math.round(entries.reduce((a, en) => a + en.condensed_tokens, 0) / entries.length);
      const avgRatio = (entries.reduce((a, en) => a + en.ratio, 0) / entries.length).toFixed(1);
      lines.push(`| ${count} | ${avgFull.toLocaleString()} | ${avgCond} | ${avgRatio}x |`);
    }
    lines.push(
      '',
      `Average: ${e.avg_ratio}x | Median: ${e.median_ratio}x | Range: ${e.min_ratio}x – ${e.max_ratio}x`,
      '',
    );
  }

  if (results.latency) {
    const lat = results.latency;
    const grouped = new Map<number, LatencyCaseResult[]>();
    for (const c of lat.cases) {
      if (!grouped.has(c.decision_count)) grouped.set(c.decision_count, []);
      grouped.get(c.decision_count)!.push(c);
    }

    lines.push(
      '## Compile Latency',
      '',
      '| Decisions | P50 (ms) | P95 (ms) | P99 (ms) | Per-Decision (ms) |',
      '|-----------|----------|----------|----------|--------------------|',
    );
    for (const [count, entries] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
      const avgP50 = (entries.reduce((a, e) => a + e.p50_ms, 0) / entries.length).toFixed(2);
      const avgP95 = (entries.reduce((a, e) => a + e.p95_ms, 0) / entries.length).toFixed(2);
      const avgP99 = (entries.reduce((a, e) => a + e.p99_ms, 0) / entries.length).toFixed(2);
      const avgPer = (entries.reduce((a, e) => a + e.per_decision_ms, 0) / entries.length).toFixed(3);
      lines.push(`| ${count} | ${avgP50} | ${avgP95} | ${avgP99} | ${avgPer} |`);
    }
    lines.push(
      '',
      `Overall: Avg ${lat.overall_avg_ms}ms | P95 ${lat.overall_p95_ms}ms | Per-decision ${lat.per_decision_avg_ms}ms`,
      '',
    );
  }

  return lines.join('\n');
}

// ─── Main ──

async function main() {
  const args = process.argv.slice(2);
  const suiteIdx = args.indexOf('--suite');
  const suite = suiteIdx >= 0 ? args[suiteIdx + 1] : 'all';

  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   Hipp0 Decision Memory Benchmark Runner      ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`\nSuite: ${suite}`);

  const datasetsDir = path.join(__dirname, 'datasets');
  const resultsDir = path.join(__dirname, 'results');

  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  const results: BenchmarkResults = {
    run_date: new Date().toISOString().split('T')[0]!,
  };

  // Load shared candidates
  const retrievalData = JSON.parse(fs.readFileSync(path.join(datasetsDir, 'role-retrieval.json'), 'utf-8'));
  const candidates: Decision[] = retrievalData.shared_candidates;

  if (suite === 'all' || suite === 'retrieval') {
    results.retrieval = runRetrievalSuite(candidates, retrievalData.test_cases);
  }

  if (suite === 'all' || suite === 'contradiction') {
    const contradictionData = JSON.parse(fs.readFileSync(path.join(datasetsDir, 'contradiction-detection.json'), 'utf-8'));
    results.contradiction = runContradictionSuite(contradictionData.test_cases);
  }

  if (suite === 'all' || suite === 'differentiation') {
    const diffData = JSON.parse(fs.readFileSync(path.join(datasetsDir, 'role-differentiation.json'), 'utf-8'));
    results.differentiation = runDifferentiationSuite(candidates, diffData.test_cases);
  }

  if (suite === 'all' || suite === 'efficiency') {
    const effData = JSON.parse(fs.readFileSync(path.join(datasetsDir, 'token-efficiency.json'), 'utf-8'));
    results.efficiency = runEfficiencySuite(effData.test_cases);
  }

  if (suite === 'all' || suite === 'latency') {
    const latData = JSON.parse(fs.readFileSync(path.join(datasetsDir, 'latency-scenarios.json'), 'utf-8'));
    results.latency = runLatencySuite(latData.test_cases);
  }

  // Write results
  fs.writeFileSync(path.join(resultsDir, 'latest.json'), JSON.stringify(results, null, 2));
  const markdown = generateMarkdown(results);
  fs.writeFileSync(path.join(resultsDir, 'latest.md'), markdown);

  console.log('\n✅ Results written to:');
  console.log(`   benchmarks/results/latest.json`);
  console.log(`   benchmarks/results/latest.md`);
}

main().catch(console.error);
