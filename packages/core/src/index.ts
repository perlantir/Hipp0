// --- Types ---
export * from './types.js';

// --- LLM Config ---
export * from './config/llm.js';

// --- Roles ---
export {
  ROLE_TEMPLATES,
  ROLE_NAMES,
  getRoleNotificationContext,
  getRoleProfile,
  listRoles,
} from './roles.js';
export type { RoleTemplate } from './roles.js';

// --- Database ---
// New adapter API (preferred for new code)
export { initDb, getDb, closeDb } from './db/index.js';
export type { DatabaseAdapter, QueryResult } from './db/index.js';
export type { DatabaseConfig } from './db/index.js';
export { createAdapter, resolveDialect } from './db/index.js';
// Backward-compatible pool API (legacy — prefer db/index.js for new code)
export { getPool, query, getClient, transaction, closePool, healthCheck } from './db/pool.js';
export { runMigrations } from './db/migrations.js';
export * from './db/parsers.js';

// --- Decision Graph ---
export {
  createDecision,
  getDecision,
  updateDecision,
  listDecisions,
  searchDecisionsByEmbedding,
  createEdge,
  getEdges,
  deleteEdge,
  getConnectedDecisions,
  getGraph,
  supersedeDecision,
  getSupersessionChain,
  getImpact,
} from './decision-graph/index.js';
export { generateEmbedding } from './decision-graph/embeddings.js';

// --- Context Compiler ---
export { compileContext, scoreDecision, cosineSimilarity } from './context-compiler/index.js';

// --- Hipp0Condensed Compression ---
export {
  condenseDecisions,
  condenseSessionHistory,
  condenseContradictions,
  condenseTeamScores,
  condenseRecommendedAction,
  condenseCompileResponse,
  computeCompressionMetrics,
  estimateTokens,
} from './context-compiler/compression.js';
export type { CondenseCompileInput } from './context-compiler/compression.js';

// --- H0C Encoder / Decoder ---
export { encodeH0C, encodeH0CPatterns } from './compression/h0c-encoder.js';
export type { H0CEncodeOptions, DecodedDecision } from './compression/h0c-encoder.js';
export { decodeH0C, decodeH0CPatterns } from './compression/h0c-decoder.js';

// --- Change Propagator ---
export {
  createSubscription,
  getSubscriptions,
  deleteSubscription,
  propagateChange,
  getNotifications,
  markNotificationRead,
  matchSubscriptions,
  invalidateCache,
} from './change-propagator/index.js';

// --- Distillery ---
export {
  distill,
  extractDecisions,
  deduplicateDecisions,
  detectContradictions,
  integrateDecisions,
  createSessionSummary,
} from './distillery/index.js';

// --- Temporal ---
export {
  computeFreshness,
  computeEffectiveConfidence,
  confidenceToScore,
  getTemporalFlags,
  validateDecision,
  blendScores,
} from './temporal/index.js';

// --- Role Signals (Super Brain Phase 2) ---
export {
  generateRoleSignal,
  generateRoleSuggestion,
  scoreTeamForTask,
} from './intelligence/role-signals.js';
export type { RoleSignal, TeamRelevance } from './intelligence/role-signals.js';

// --- Smart Orchestrator (Super Brain Phase 3) ---
export {
  suggestNextAgent,
  generateSessionPlan,
  generateTaskSuggestion,
  buildReasoningExplanation,
} from './intelligence/orchestrator.js';
export type { NextAgentSuggestion, SessionPlan } from './intelligence/orchestrator.js';

// --- Relevance Learner ---
export {
  recordFeedback,
  getFeedbackForAgent,
  evolveWeights,
  getEvolutionStats,
} from './relevance-learner/index.js';

// --- Hierarchy / Classification ---
export {
  classifyDecision,
  inferDomainFromTask,
} from './hierarchy/classifier.js';
export type { ClassificationResult } from './hierarchy/classifier.js';

// --- Wings / Affinity ---
export {
  getWingAffinity,
  getDecisionWing,
  increaseWingAffinity,
  decreaseWingAffinity,
  processWingFeedback,
  processWingFeedbackBatch,
  processWingOutcome,
  rebalanceWingAffinity,
  computeWingSources,
  classifyDecisionWing,
  maybeRecalculateWings,
  recalculateProjectWings,
  getAgentWingAffinityScore,
  resetRecalcCounter,
  getRecalcCounter,
} from './wings/affinity.js';
export type { WingClassification } from './wings/affinity.js';

// --- Evolution Engine ---
export {
  runEvolutionScan,
  computeUrgency,
} from './intelligence/evolution-engine.js';
export type {
  EvolutionMode,
  ProposalUrgency,
  ProposalStatus,
  TriggerType,
  EvolutionProposal,
  EvolutionScanResult,
} from './intelligence/evolution-engine.js';

// --- Evolution Handlers (Phase 2) ---
export {
  executeProposalHandler,
  handleOrphanedDecision,
  handleStaleDecision,
  handleContradiction,
  handleConcentrationRisk,
  handleHighImpactUnvalidated,
  findRelatedDecisions,
} from './intelligence/evolution-handlers.js';
export type {
  ExecutionResult,
  ProposalRecord,
} from './intelligence/evolution-handlers.js';

// --- Trust Scorer (Provenance & Trust Phase 2) ---
export {
  computeTrust,
  trustMultiplier,
  defaultProvenance,
  validationProvenance,
} from './intelligence/trust-scorer.js';

// --- Pattern Recommendations ---
export {
  getPatternRecommendations,
  listPatterns,
  DEFAULT_MIN_PATTERN_CONFIDENCE,
  MAX_SUGGESTED_PATTERNS,
} from './intelligence/pattern-extractor.js';
