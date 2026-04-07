/**
 * Demo scenarios for the Super Brain Playground.
 * Provides pre-built simulation data so the playground runs without a backend.
 */

export interface DemoStep {
  step_number: number;
  agent_name: string;
  relevance_score: number;
  role_suggestion: string;
  task_suggestion: string;
  decisions_compiled: number;
  top_decisions: Array<{ title: string; score: number }>;
  new_from_previous: string | null;
  output: string;
}

export interface DemoScenario {
  plan: DemoStep[];
  skipped: Array<{ agent_name: string; relevance_score: number; reason: string }>;
  totalDecisions: number;
}

const JWT_AUTH_SCENARIO: DemoScenario = {
  totalDecisions: 50,
  plan: [
    {
      step_number: 1,
      agent_name: 'architect',
      relevance_score: 0.92,
      role_suggestion: 'design_lead',
      task_suggestion: 'Design JWT auth system architecture with refresh token rotation',
      decisions_compiled: 18,
      top_decisions: [
        { title: 'Use microservices architecture with API gateway', score: 0.88 },
        { title: 'PostgreSQL as primary database', score: 0.82 },
        { title: 'Hono framework for all API routes', score: 0.76 },
      ],
      new_from_previous: null,
      output: 'Designed JWT authentication with RS256 signing, 15-minute access tokens, and 7-day refresh tokens stored in httpOnly cookies. Refresh token rotation with family detection for replay attack prevention. Token blacklist in Redis for immediate revocation.',
    },
    {
      step_number: 2,
      agent_name: 'backend',
      relevance_score: 0.87,
      role_suggestion: 'implementation_lead',
      task_suggestion: 'Implement JWT auth endpoints based on architecture design',
      decisions_compiled: 22,
      top_decisions: [
        { title: 'JWT authentication with RS256', score: 0.95 },
        { title: 'Database connection pooling with pg-pool', score: 0.78 },
        { title: 'Zod validation for all inputs', score: 0.72 },
      ],
      new_from_previous: 'architect designed RS256 JWT with 15-min access tokens and 7-day refresh rotation',
      output: 'Implemented /auth/login, /auth/refresh, /auth/logout endpoints. Added Hono middleware for token verification. Refresh token rotation stores token families in PostgreSQL with cascade invalidation. Rate limiting: 5 login attempts per minute per IP.',
    },
    {
      step_number: 3,
      agent_name: 'security',
      relevance_score: 0.94,
      role_suggestion: 'security_reviewer',
      task_suggestion: 'Review JWT implementation for security vulnerabilities',
      decisions_compiled: 15,
      top_decisions: [
        { title: 'Row Level Security policies', score: 0.91 },
        { title: 'Rate limiting per endpoint', score: 0.85 },
        { title: 'JWT authentication with RS256', score: 0.83 },
      ],
      new_from_previous: 'backend implemented auth endpoints with refresh rotation and rate limiting',
      output: 'Security review passed with 2 recommendations: (1) Add CSRF token for cookie-based auth flows, (2) Implement token binding to prevent token theft across devices. No critical vulnerabilities found. RS256 implementation is solid. Rate limiting is appropriate.',
    },
    {
      step_number: 4,
      agent_name: 'frontend',
      relevance_score: 0.68,
      role_suggestion: 'implementation_lead',
      task_suggestion: 'Implement login UI and token management in React',
      decisions_compiled: 12,
      top_decisions: [
        { title: 'React 19 with Server Components', score: 0.74 },
        { title: 'Tailwind CSS with custom design system', score: 0.65 },
        { title: 'Mobile-first responsive design', score: 0.58 },
      ],
      new_from_previous: 'security approved the JWT design with CSRF and token binding recommendations',
      output: 'Built login form with Zod client-side validation, automatic token refresh via axios interceptor, and secure token storage. Added loading states, error handling, and "remember me" checkbox that extends refresh token to 30 days.',
    },
  ],
  skipped: [
    { agent_name: 'devops', relevance_score: 0.22, reason: 'Low relevance — deployment not in scope for auth implementation' },
    { agent_name: 'marketer', relevance_score: 0.05, reason: 'Minimal relevance — no marketing aspect to auth work' },
  ],
};

const CI_CD_SCENARIO: DemoScenario = {
  totalDecisions: 50,
  plan: [
    {
      step_number: 1,
      agent_name: 'devops',
      relevance_score: 0.95,
      role_suggestion: 'deployment_lead',
      task_suggestion: 'Design CI/CD pipeline architecture',
      decisions_compiled: 20,
      top_decisions: [
        { title: 'GitHub Actions CI/CD', score: 0.93 },
        { title: 'Docker Compose for local development', score: 0.87 },
        { title: 'Monorepo with Turborepo', score: 0.81 },
      ],
      new_from_previous: null,
      output: 'Designed 3-stage pipeline: (1) Lint + typecheck + unit tests on PR, (2) Integration tests + build on merge to main, (3) Blue-green deploy to Fly.io on release tag. Turborepo remote caching for 60% faster CI. Docker layer caching for builds.',
    },
    {
      step_number: 2,
      agent_name: 'architect',
      relevance_score: 0.72,
      role_suggestion: 'design_lead',
      task_suggestion: 'Review pipeline architecture for infrastructure alignment',
      decisions_compiled: 16,
      top_decisions: [
        { title: 'Blue-green deployments on Fly.io', score: 0.88 },
        { title: 'Use microservices architecture', score: 0.76 },
        { title: 'Database connection pooling', score: 0.68 },
      ],
      new_from_previous: 'devops designed 3-stage pipeline with Turborepo caching and blue-green deploy',
      output: 'Approved pipeline design. Added recommendation: include database migration step between build and deploy stages with automatic rollback on failure. Suggested health check endpoint (/api/health) verification before traffic switch in blue-green.',
    },
    {
      step_number: 3,
      agent_name: 'security',
      relevance_score: 0.58,
      role_suggestion: 'security_reviewer',
      task_suggestion: 'Review CI/CD pipeline for security best practices',
      decisions_compiled: 10,
      top_decisions: [
        { title: 'Row Level Security policies', score: 0.72 },
        { title: 'API key management', score: 0.68 },
        { title: 'Rate limiting per endpoint', score: 0.55 },
      ],
      new_from_previous: 'architect approved pipeline with migration rollback and health checks',
      output: 'Reviewed pipeline security: (1) Secrets must use GitHub encrypted secrets, never env vars in workflow files, (2) Add SAST scanning step (CodeQL), (3) Pin all action versions to SHA, not tags, (4) Add Dependabot for dependency updates. No blockers.',
    },
  ],
  skipped: [
    { agent_name: 'frontend', relevance_score: 0.18, reason: 'Low relevance — CI/CD is infrastructure-focused' },
    { agent_name: 'backend', relevance_score: 0.25, reason: 'Low relevance — pipeline design, not implementation' },
    { agent_name: 'marketer', relevance_score: 0.03, reason: 'Minimal relevance — no marketing aspect' },
  ],
};

const DB_SCHEMA_SCENARIO: DemoScenario = {
  totalDecisions: 50,
  plan: [
    {
      step_number: 1,
      agent_name: 'architect',
      relevance_score: 0.96,
      role_suggestion: 'design_lead',
      task_suggestion: 'Design the database schema for the platform',
      decisions_compiled: 24,
      top_decisions: [
        { title: 'PostgreSQL as primary database', score: 0.96 },
        { title: 'Use microservices architecture with API gateway', score: 0.82 },
        { title: 'Database connection pooling with pg-pool', score: 0.79 },
      ],
      new_from_previous: null,
      output: 'Designed normalized schema with 12 core tables: users, organizations, projects, decisions, agents, sessions, steps, edges, contradictions, notifications, subscriptions, audit_log. Used UUID primary keys, JSONB for flexible metadata, and pgvector for embeddings.',
    },
    {
      step_number: 2,
      agent_name: 'backend',
      relevance_score: 0.85,
      role_suggestion: 'implementation_lead',
      task_suggestion: 'Implement schema migrations and data access layer',
      decisions_compiled: 19,
      top_decisions: [
        { title: 'PostgreSQL as primary database', score: 0.92 },
        { title: 'Zod validation for all inputs', score: 0.78 },
        { title: 'Hono framework for all API routes', score: 0.71 },
      ],
      new_from_previous: 'architect designed 12-table normalized schema with UUID keys and pgvector',
      output: 'Created SQL migrations for all 12 tables with proper constraints, indexes (B-tree for lookups, GIN for JSONB, HNSW for vector similarity), and RLS policies. Built type-safe query builder with parameterized queries to prevent SQL injection.',
    },
    {
      step_number: 3,
      agent_name: 'security',
      relevance_score: 0.71,
      role_suggestion: 'security_reviewer',
      task_suggestion: 'Review schema for security and access control',
      decisions_compiled: 12,
      top_decisions: [
        { title: 'Row Level Security policies', score: 0.94 },
        { title: 'JWT authentication with RS256', score: 0.78 },
        { title: 'API key management', score: 0.65 },
      ],
      new_from_previous: 'backend implemented migrations with RLS policies and parameterized queries',
      output: 'Schema security review: RLS policies are correctly scoped per-project. Recommended adding audit triggers for decisions and agents tables. Verified no PII stored in plaintext. Suggested encrypting API keys at rest using pgcrypto.',
    },
  ],
  skipped: [
    { agent_name: 'frontend', relevance_score: 0.15, reason: 'Low relevance — schema design is backend-focused' },
    { agent_name: 'devops', relevance_score: 0.28, reason: 'Low relevance — not yet at deployment stage' },
    { agent_name: 'marketer', relevance_score: 0.02, reason: 'Minimal relevance — no marketing aspect' },
  ],
};

const LAUNCH_SCENARIO: DemoScenario = {
  totalDecisions: 50,
  plan: [
    {
      step_number: 1,
      agent_name: 'marketer',
      relevance_score: 0.94,
      role_suggestion: 'launch_coordinator',
      task_suggestion: 'Plan the product launch strategy',
      decisions_compiled: 14,
      top_decisions: [
        { title: 'Freemium model with usage-based pricing', score: 0.91 },
        { title: 'Pricing: Free / Pro / Enterprise', score: 0.88 },
        { title: 'Landing page hero with live interactive demo', score: 0.82 },
      ],
      new_from_previous: null,
      output: 'Launch plan: Week 1 — soft launch to 50 beta users from waitlist. Week 2 — Product Hunt launch with live demo. Week 3 — Dev community outreach (HN, Reddit, Discord). Messaging: "The shared brain for AI agent teams." Pricing page goes live day 1.',
    },
    {
      step_number: 2,
      agent_name: 'frontend',
      relevance_score: 0.72,
      role_suggestion: 'implementation_lead',
      task_suggestion: 'Build the landing page and pricing page',
      decisions_compiled: 16,
      top_decisions: [
        { title: 'React 19 with Server Components', score: 0.78 },
        { title: 'Landing page hero with live interactive demo', score: 0.92 },
        { title: 'Dark mode primary, light mode as toggle', score: 0.65 },
      ],
      new_from_previous: 'marketer planned 3-week launch with Product Hunt and dev community outreach',
      output: 'Built responsive landing page with animated decision graph hero, feature cards, pricing table (Free/Pro/Enterprise), and testimonial section. Added interactive demo embed showing context compilation in real-time. Dark mode default with light toggle.',
    },
    {
      step_number: 3,
      agent_name: 'architect',
      relevance_score: 0.55,
      role_suggestion: 'design_lead',
      task_suggestion: 'Review launch infrastructure and scaling readiness',
      decisions_compiled: 18,
      top_decisions: [
        { title: 'Blue-green deployments on Fly.io', score: 0.82 },
        { title: 'Database connection pooling', score: 0.75 },
        { title: 'Rate limiting per endpoint', score: 0.68 },
      ],
      new_from_previous: 'frontend built landing page with interactive demo and pricing table',
      output: 'Infrastructure review for launch readiness: (1) Auto-scaling configured for 10x traffic spike, (2) CDN for static assets, (3) Database connection pool sized for 500 concurrent users, (4) Rate limiting adjusted for demo traffic. Ready for launch.',
    },
  ],
  skipped: [
    { agent_name: 'backend', relevance_score: 0.28, reason: 'Low relevance — launch is marketing + frontend focused' },
    { agent_name: 'security', relevance_score: 0.22, reason: 'Low relevance — launch planning, not security review' },
    { agent_name: 'devops', relevance_score: 0.35, reason: 'Moderate relevance but architect covered infrastructure review' },
  ],
};

const SCENARIOS: Record<string, DemoScenario> = {
  jwt: JWT_AUTH_SCENARIO,
  cicd: CI_CD_SCENARIO,
  database: DB_SCHEMA_SCENARIO,
  launch: LAUNCH_SCENARIO,
};

const KEYWORD_MAP: Array<{ keywords: string[]; key: string }> = [
  { keywords: ['jwt', 'auth', 'login', 'token', 'password', 'session'], key: 'jwt' },
  { keywords: ['ci', 'cd', 'pipeline', 'deploy', 'github actions', 'ci/cd'], key: 'cicd' },
  { keywords: ['database', 'schema', 'table', 'migration', 'postgres', 'sql'], key: 'database' },
  { keywords: ['launch', 'marketing', 'product hunt', 'pricing', 'landing'], key: 'launch' },
];

export function findScenario(task: string): DemoScenario {
  const lower = task.toLowerCase();
  for (const entry of KEYWORD_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return SCENARIOS[entry.key];
    }
  }
  // Default to JWT auth scenario
  return JWT_AUTH_SCENARIO;
}
