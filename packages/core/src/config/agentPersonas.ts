/**
 * Agent Persona System — maps agent names to expertise topics,
 * exclude tags (negative signals), and keywords for persona-based scoring.
 */

export interface AgentPersona {
  name: string;
  role: string;
  description: string;
  primaryTags: string[];
  excludeTags: string[];
  keywords: string[];
  boostFactor: number;
}

export const AGENT_PERSONAS: Record<string, AgentPersona> = {
  maks: {
    name: 'maks',
    role: 'builder',
    description: 'Full-stack engineering — Hono APIs, database, TypeScript, builds everything',
    primaryTags: ['architecture', 'api', 'database', 'framework', 'hono', 'typescript', 'backend', 'server', 'infra', 'docker', 'deployment', 'node'],
    excludeTags: ['legal', 'compliance', 'marketing', 'tiktok', 'content'],
    keywords: ['build', 'implement', 'api', 'server', 'database', 'endpoint', 'hono', 'typescript', 'deploy'],
    boostFactor: 0.25,
  },
  makspm: {
    name: 'makspm',
    role: 'product',
    description: 'Product management — specs, task delegation, QA coordination, roadmap',
    primaryTags: ['product', 'spec', 'roadmap', 'prioritization', 'qa', 'task', 'planning', 'delegation', 'milestone', 'requirement'],
    excludeTags: ['solidity', 'blockchain', 'devops', 'ci-cd', 'design', 'typography'],
    keywords: ['product', 'spec', 'requirement', 'priority', 'milestone', 'qa', 'task', 'delegation'],
    boostFactor: 0.22,
  },
  scout: {
    name: 'scout',
    role: 'analytics',
    description: 'Research, market analysis, competitive intelligence, data insights',
    primaryTags: ['research', 'analysis', 'competitor', 'market', 'trend', 'data', 'benchmark', 'survey', 'intelligence', 'metrics'],
    excludeTags: ['solidity', 'blockchain', 'design', 'typography', 'devops', 'ci-cd'],
    keywords: ['research', 'analysis', 'competitor', 'market', 'benchmark', 'data', 'insight', 'trend'],
    boostFactor: 0.20,
  },
  clawexpert: {
    name: 'clawexpert',
    role: 'ops',
    description: 'OpenClaw infrastructure, config management, workspace setup, agent orchestration',
    primaryTags: ['openclaw', 'infrastructure', 'config', 'workspace', 'setup', 'ops', 'automation', 'orchestration', 'agent', 'mcp'],
    excludeTags: ['legal', 'marketing', 'tiktok', 'design', 'blockchain', 'solidity'],
    keywords: ['openclaw', 'config', 'workspace', 'setup', 'infrastructure', 'agent', 'automation', 'mcp'],
    boostFactor: 0.22,
  },
  launch: {
    name: 'launch',
    role: 'launch',
    description: 'Go-to-market, marketing, content strategy, TikTok, partnerships',
    primaryTags: ['marketing', 'content', 'tiktok', 'growth', 'launch', 'seo', 'social', 'brand', 'campaign', 'engagement', 'partnership', 'uberkiwi'],
    excludeTags: ['blockchain', 'solidity', 'security', 'devops', 'openclaw', 'ci-cd'],
    keywords: ['launch', 'marketing', 'tiktok', 'content', 'growth', 'campaign', 'social', 'brand', 'partnership'],
    boostFactor: 0.25,
  },
  forge: {
    name: 'forge',
    role: 'reviewer',
    description: 'Code review, CI/CD, testing, security review, quality gates',
    primaryTags: ['code-review', 'testing', 'ci-cd', 'security', 'quality', 'lint', 'coverage', 'audit', 'review', 'pipeline', 'github-actions'],
    excludeTags: ['marketing', 'tiktok', 'content', 'design', 'legal', 'compliance'],
    keywords: ['review', 'test', 'ci', 'cd', 'pipeline', 'coverage', 'lint', 'security', 'quality'],
    boostFactor: 0.22,
  },
  pixel: {
    name: 'pixel',
    role: 'design',
    description: 'UI/UX design, V0 components, color systems, typography, age-adaptive interfaces',
    primaryTags: ['design', 'ui', 'ux', 'palette', 'typography', 'layout', 'component', 'css', 'responsive', 'v0', 'figma', 'age-adaptive'],
    excludeTags: ['legal', 'compliance', 'blockchain', 'security', 'devops', 'cost'],
    keywords: ['design', 'ui', 'ux', 'color', 'typography', 'component', 'layout', 'palette', 'responsive'],
    boostFactor: 0.25,
  },
  chain: {
    name: 'chain',
    role: 'blockchain',
    description: 'Solidity, on-chain scoring, DeFi, smart contracts, token mechanics',
    primaryTags: ['blockchain', 'solidity', 'on-chain', 'smart-contract', 'defi', 'web3', 'token', 'wallet', 'nft', 'ethereum', 'scoring-contract'],
    excludeTags: ['tiktok', 'content', 'marketing', 'design', 'mathind', 'uberkiwi'],
    keywords: ['solidity', 'blockchain', 'on-chain', 'contract', 'token', 'defi', 'web3', 'wallet'],
    boostFactor: 0.25,
  },
  counsel: {
    name: 'counsel',
    role: 'legal',
    description: 'CFTC/SEC compliance, gambling law, privacy, NDAs, licensing, Iowa law',
    primaryTags: ['legal', 'compliance', 'privacy', 'gambling', 'prediction-market', 'cftc', 'sec', 'gdpr', 'ccpa', 'terms', 'nda', 'licensing', 'iowa'],
    excludeTags: ['architecture', 'devops', 'frontend', 'design', 'content', 'tiktok', 'production'],
    keywords: ['legal', 'compliance', 'regulation', 'gambling', 'privacy', 'cftc', 'sec', 'nda', 'license', 'iowa'],
    boostFactor: 0.25,
  },
  gauntlet: {
    name: 'gauntlet',
    role: 'challenge',
    description: 'Challenge generation, difficulty profiling, CDI scoring, contamination detection',
    primaryTags: ['challenge', 'scoring', 'judge', 'elo', 'leaderboard', 'mutation', 'matchmaking', 'bout', 'competition', 'cdi', 'difficulty'],
    excludeTags: ['legal', 'marketing', 'tiktok', 'design', 'compliance', 'devops'],
    keywords: ['challenge', 'scoring', 'judge', 'elo', 'leaderboard', 'bout', 'difficulty', 'mutation', 'matchmaking'],
    boostFactor: 0.25,
  },
};

/**
 * Look up persona by agent name (case-insensitive).
 */
export function getPersona(agentName: string): AgentPersona | undefined {
  return AGENT_PERSONAS[agentName.toLowerCase()];
}
