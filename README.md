```
    __  __ _             ___
   / / / /(_)___  ____  / _ \
  / /_/ // // _ \/ __ \/ // /
 / __  // // ___/ /_/ /\__ \
/_/ /_//_// \___/ .___/____/
         |_/   /_/
```

# Hipp0

**No agent starts from zero. No decision gets lost.**

Hipp0 is a persistent decision memory system for AI agent teams. Every decision an agent makes — architecture choices, tool selections, trade-offs, rejected alternatives — gets captured, scored, and served back as context the next time it's needed.

The core problem: AI agents are stateless. They repeat the same mistakes, contradict each other, and forget what was decided last week. Hipp0 gives them a shared hippocampus — a memory layer that learns which past decisions matter for the current task.

One API. Any framework. Any model.

---

## Why Hipp0

Most AI memory systems store chat history and retrieve by embedding similarity. That works for single-agent chatbots. It breaks for multi-agent teams where different agents need different context for the same task — a security agent needs auth decisions ranked high, a frontend agent needs UI decisions instead.

Hipp0 stores structured decisions, scores them across five signals, and compiles role-specific context for each agent automatically. The graph learns over time: wing affinity adapts from feedback, temporal intelligence auto-expires stale decisions, and the evolution engine surfaces problems before they cause failures.

---

## Key Differentiators

- **Role-differentiated context** — same task, different context per agent. Benchmark-proven 100% differentiation vs 0% for naive RAG.
- **5-signal scoring** — directAffect, tagMatch, personaMatch, semanticSimilarity, temporal. Not just cosine similarity.
- **0.92 F1 contradiction detection** — catches conflicting decisions automatically before they cause agent failures.
- **Session memory** — Agent B sees Agent A's actual reasoning, not just historical records.
- **Self-hosted, free forever** — bring your own keys, run on your own infra, no vendor lock-in.

---

## Quick Start

### No Docker (fastest)

```bash
npx @hipp0/cli init my-project
```

> **Note:** `@hipp0/cli` is not yet published to npm. See [docs/cli.md](docs/cli.md) for local setup while the package is in pre-release.

Creates a SQLite database, starts the server, opens the dashboard. All features work immediately.

### Docker Compose (recommended for production)

```bash
git clone https://github.com/perlantir/Hipp0.git
cd Hipp0

cp .env.example .env
# Add at minimum: ANTHROPIC_API_KEY

docker compose up -d
```

Three services start:

| Service | Port | What it does |
|---------|------|--------------|
| `hipp0-server` | 3100 | API + WebSocket server |
| `hipp0-dashboard` | 3200 | React dashboard |
| `hipp0-db` | 5432 | PostgreSQL 17 + pgvector |

Full setup walkthrough: [docs/getting-started.md](docs/getting-started.md)

### First API Call

```bash
# Compile context for an agent
curl http://localhost:3100/api/compile \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <API_KEY>' \
  -d '{"agent_name": "architect", "task_description": "design the auth system", "project_id": "<PROJECT_ID>"}'
```

This is the core endpoint. Pass an agent name and task, get back a ranked set of relevant past decisions — scored and filtered for that agent's role.

---

## How It Works

### 1. Record decisions as they're made

```typescript
await hipp0.recordDecision({
  title: 'Use JWT for API auth',
  reasoning: 'Stateless, scalable, framework-agnostic',
  made_by: 'architect',
  affects: ['builder', 'reviewer'],
  tags: ['security', 'api'],
  confidence: 'high',
});
```

### 2. Compile role-specific context before each task

```typescript
const context = await hipp0.compile({
  agent_name: 'builder',
  task_description: 'implement refresh token rotation',
  project_id: projectId,
});
// Returns decisions ranked for a builder role — auth decisions high, UI decisions deprioritized
```

### 3. The graph learns from feedback

Rate compiled decisions as critical, useful, or irrelevant. Hipp0 adjusts scoring weights per agent over time. The more you use it, the better the context gets.

---

## Core Capabilities

### Decision Graph Engine
5-signal scoring, role-differentiated compilation, stemmed tag matching, PostgreSQL + pgvector, change propagation with dependency cascade, hierarchy classification.

### Super Brain Orchestration
Multi-step session memory, Agent Decision Protocol (PROCEED / SKIP / OVERRIDE_TO / ASK_FOR_CLARIFICATION), orchestrator mode for team-level synthesis, interactive Playground for exploring how the brain ranks decisions.

### Import & Sync
GitHub PR scanning via Octokit, AI-powered decision extraction from PR diffs, preview before import, permanent webhook-driven sync.

### Governance
Review queue for pending decisions, approve/reject workflow with audit trail, policy enforcement with block/warn rules, violation tracking, weekly digest.

### Integrations
18+ MCP tools, TypeScript SDK (`@hipp0/sdk`), Python SDK (`hipp0-sdk`), CLI (`@hipp0/cli`), framework adapters for LangGraph, CrewAI, AutoGen, OpenAI Agents, LangChain.

---

## Benchmarks

Reproducible benchmark suite — run it yourself:

```bash
npx tsx benchmarks/runner.ts --suite all
```

| Metric | Hipp0 | Naive RAG | Delta |
|--------|-------|-----------|-------|
| Recall@5 | 78% | 39% | +39% |
| Recall@10 | 99% | 50% | +49% |
| Precision@5 | 70% | 34% | +37% |
| MRR | 0.94 | 0.79 | +0.16 |
| Contradiction F1 | 0.92 | N/A | — |
| Role Differentiation | 100% | 0% | +100% |
| H0C Compression (full) | 10-12x | N/A | — |
| Compile P95 (500 decisions) | 24ms | N/A | — |

Full methodology: [benchmarks/README.md](benchmarks/README.md) · [docs/benchmarks.md](docs/benchmarks.md)

---

## How Hipp0 Compares

| Capability | Hipp0 | Mem0 | Supermemory | Zep | LangMem |
|-----------|-------|------|-------------|-----|---------|
| Multi-agent role differentiation | ✅ 100% benchmark-proven | ❌ Single-user | ❌ Single-user | ⚠️ Basic | ❌ No |
| Decision memory (not just chat) | ✅ Structured decisions | ❌ Chat history | ❌ Chat history | ❌ Chat history | ❌ Chat history |
| 5-signal scoring | ✅ 5 signals + learned affinity | ❌ Embedding only | ❌ Embedding only | ⚠️ 2 signals | ❌ Embedding only |
| Contradiction detection | ✅ 0.92 F1 | ❌ No | ❌ No | ❌ No | ❌ No |
| Session memory (Agent B sees Agent A) | ✅ Super Brain | ❌ No | ❌ No | ⚠️ Basic | ❌ No |
| Token compression | ✅ 10-12x H0C format | ❌ No | ❌ No | ❌ No | ❌ No |
| Self-hosted free tier | ✅ Unlimited forever | ❌ Cloud only | ⚠️ Partial | ✅ Yes | ✅ Yes |
| Import from GitHub PRs | ✅ Full wizard | ❌ No | ❌ No | ❌ No | ❌ No |
| Governance / Policies | ✅ Built-in | ❌ No | ❌ No | ❌ No | ❌ No |
| Framework agnostic | ✅ Any via MCP | ⚠️ Python SDK | ⚠️ Python SDK | ⚠️ Python SDK | ❌ LangChain only |
| Open source | ✅ Apache 2.0 | ✅ Apache 2.0 | ❌ Proprietary | ✅ MIT | ✅ MIT |

> Comparison based on publicly available documentation as of April 2026. Verify against each project's current docs before making decisions.

Detailed breakdown: [docs/comparison.md](docs/comparison.md)

---

## MCP Setup

> **Note:** `@hipp0/mcp` is not yet published to npm. Use the local path below while the package is in pre-release.

```json
{
  "mcpServers": {
    "hipp0": {
      "command": "node",
      "args": ["./packages/mcp/dist/index.js"],
      "env": {
        "HIPP0_API_URL": "http://localhost:3100",
        "HIPP0_API_KEY": "<YOUR_API_KEY>",
        "HIPP0_PROJECT_ID": "<YOUR_PROJECT_ID>"
      }
    }
  }
}
```

Exposes 18+ tools including `record_decision`, `get_context`, `search_decisions`, `hipp0_follow_orchestrator`, and `hipp0_override_orchestrator`.

Full guide: [docs/mcp-setup.md](docs/mcp-setup.md)

---

## SDK

### TypeScript

> **Note:** `@hipp0/sdk` is not yet published to npm. See [docs/sdk.md](docs/sdk.md) for local install instructions.

```typescript
import { Hipp0Client } from '@hipp0/sdk';

const client = new Hipp0Client({
  baseUrl: 'http://localhost:3100',
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
});

await client.recordDecision({
  title: 'Use JWT for auth',
  made_by: 'backend-agent',
  tags: ['auth', 'security'],
  confidence: 'high',
});

const context = await client.compile({
  agent_name: 'backend-agent',
  task: 'implement refresh token rotation',
});
```

### Python

> **Note:** `hipp0-sdk` is not yet published to PyPI. Install locally: `cd python-sdk && pip install -e .`

```python
from hipp0_sdk import Hipp0Client

client = Hipp0Client(
    base_url="http://localhost:3100",
    api_key="your-api-key",
    project_id="your-project-id",
)

client.record_decision(
    title="Use JWT for auth",
    made_by="backend-agent",
    tags=["auth", "security"],
    confidence="high",
)

context = client.compile(
    agent_name="backend-agent",
    task="implement refresh token rotation",
)
```

---

## Environment Variables

See [`.env.example`](.env.example) for the full reference.

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Powers the Distillery (auto-extraction via Claude) |
| `OPENAI_API_KEY` | No | Enables semantic embeddings (`text-embedding-3-small`) |
| `HIPP0_AUTH_REQUIRED` | No | Set `false` for local dev without API keys. Always `true` in production. |
| `HIPP0_LLM_MODEL` | No | Override the default LLM model |
| `HIPP0_CORS_ORIGINS` | No | Allowed CORS origins for production |
| `DATABASE_URL` | No | Custom PostgreSQL connection string |

---

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/getting-started.md) | Deploy from zero to running |
| [Architecture](docs/architecture.md) | System design and component internals |
| [API Reference](docs/api-reference.md) | Complete REST API documentation |
| [MCP Setup](docs/mcp-setup.md) | Connect Claude Desktop, Cursor, or any MCP client |
| [TypeScript SDK](docs/sdk.md) | Full SDK method reference |
| [Python SDK](docs/python-sdk.md) | Python SDK reference and examples |
| [CLI](docs/cli.md) | CLI commands and flags |
| [Super Brain](docs/super-brain.md) | Multi-step session memory and orchestration |
| [Distillery](docs/distillery.md) | Auto-extraction of decisions from conversations |
| [Agent Decision Protocol](docs/agent-protocol.md) | How agents interpret and act on Brain signals |
| [Agent Wings](docs/agent-wings.md) | Wing groupings, affinity learning, API |
| [Temporal Intelligence](docs/temporal-intelligence.md) | Scopes, staleness detection, auto-supersede |
| [Cascade Alerts](docs/cascade-alerts.md) | Upstream change propagation |
| [Review Queue](docs/review-queue.md) | Pending decisions, approve/reject flow |
| [Time Travel](docs/time-travel.md) | Historical graph state and snapshot diffing |
| [Passive Capture](docs/passive-capture.md) | Auto-extract decisions from conversation transcripts |
| [GitHub Integration](docs/github-integration.md) | PR scanning, sync, webhook setup |
| [Webhooks](docs/webhooks.md) | Outbound events, payload format, retry behavior |
| [Namespace Isolation](docs/namespaces.md) | Scoping decisions by domain |
| [Policies & Governance](docs/policies.md) | Block/warn rules and violation tracking |
| [Evolution Engine](docs/evolution.md) | AI-generated improvement proposals |
| [Playground](docs/playground.md) | Interactive brain explorer |
| [H0C Format](docs/h0c-format.md) | Token-efficient context serialization (10-12x compression) |
| [Benchmarks](docs/benchmarks.md) | Running and interpreting benchmark suites |
| [Comparison](docs/comparison.md) | vs Mem0, Supermemory, Zep, LangMem |
| [Self-Hosting](docs/self-hosting.md) | Production deployment guide |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common errors and fixes |
| [Framework Guides](docs/framework-guides/) | LangGraph, CrewAI, AutoGen, OpenAI Agents, LangChain |

---

## Roadmap

- Publish `@hipp0/mcp`, `@hipp0/cli`, `@hipp0/sdk` to npm
- Publish `hipp0-sdk` to PyPI
- Precision calibration sprint (Recall@5 → 82% target)
- LangChain framework integration testing
- Background workers documentation

---

## License

Apache 2.0 — self-host for free, forever.

---

<p align="center">Built by <strong>Perlantir AI Studio</strong></p>
