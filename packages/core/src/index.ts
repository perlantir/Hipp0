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

// --- Relevance Learner ---
export {
  recordFeedback,
  getFeedbackForAgent,
  evolveWeights,
  getEvolutionStats,
} from './relevance-learner/index.js';
