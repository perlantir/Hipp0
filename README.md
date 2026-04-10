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

Hipp0 is a persistent decision memory system for AI agent teams. Every decision an agent makes -- architecture choices, tool selections, trade-offs, rejected alternatives -- gets captured, scored, and served back as context the next time it's needed.

The core problem: AI agents are stateless. They repeat the same mistakes, contradict each other, and forget what was decided last week. Hipp0 gives them a shared hippocampus -- a memory layer that learns which past decisions matter for the current task.

One API. Any framework. Any model.

---

## Quick Start

### One command (no Docker, no database setup)

```bash
npx @hipp0/cli init my-project
cd my-project
source .env
```

That's it. Creates a SQLite database, starts the server, creates a project, writes `.env` with your credentials. You're ready to go.

### Record your first decision

```bash
hipp0 add "Use PostgreSQL for persistence" --by architect --tags database,infrastructure
```

### Compile context for an agent

```bash
hipp0 compile builder "implement the data layer"
```

Returns decisions ranked for a builder role -- database decisions high, UI decisions deprioritized.

### Zero-config auto-instrumentation

Add memory to any existing agent with one line:

**Python:**
```python
import hipp0_memory
hipp0_memory.auto()

# Your existing OpenAI/Anthropic code now automatically:
# - Captures conversations for decision extraction
# - Injects relevant past context before each call
# - Tracks outcomes and learns agent skills
from openai import OpenAI
client = OpenAI()
response = client.chat.completions.create(model="gpt-4o", messages=[...])
```

**TypeScript:**
```typescript
import { auto } from '@hipp0/sdk/auto';
auto();

// Same - zero changes to your existing code
import OpenAI from 'openai';
const client = new OpenAI();
const response = await client.chat.completions.create({ model: 'gpt-4o', messages: [...] });
```

Reads `HIPP0_API_URL`, `HIPP0_API_KEY`, `HIPP0_PROJECT_ID` from env (set by `hipp0 init`). Fire-and-forget capture, never blocks your code.

### Docker Compose (production)

```bash
git clone https://github.com/perlantir/Hipp0.git && cd Hipp0
cp .env.example .env   # Add ANTHROPIC_API_KEY at minimum
docker compose up -d
```

| Service | Port | Description |
|---------|------|-------------|
| `hipp0-server` | 3100 | Hono API + WebSocket |
| `hipp0-dashboard` | 3200 | React dashboard |
| `hipp0-db` | 5432 | PostgreSQL 17 + pgvector |

---

## Install

### npm

```bash
npm install @hipp0/sdk          # TypeScript SDK
npm install @hipp0/mcp          # MCP server (21 tools)
npm install @hipp0/cli          # CLI
```

### pip

```bash
pip install hipp0-memory            # Python SDK
pip install hipp0-crewai            # CrewAI integration
pip install hipp0-langchain         # LangChain integration
pip install hipp0-langgraph         # LangGraph checkpointer
pip install hipp0-autogen           # AutoGen memory adapter
pip install hipp0-openai-agents     # OpenAI Agents hooks
```

All packages published and installable. No local builds needed.

---

## How It Works

### 1. Record decisions as they're made

```typescript
import { Hipp0Client } from '@hipp0/sdk';

const client = new Hipp0Client({
  baseUrl: 'http://localhost:3100',
  apiKey: process.env.HIPP0_API_KEY,
  projectId: process.env.HIPP0_PROJECT_ID,
});

await client.recordDecision({
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
const context = await client.compile({
  agent_name: 'builder',
  task_description: 'implement refresh token rotation',
});
// Returns decisions ranked for a builder role
```

### 3. The graph learns from feedback

Rate compiled decisions as critical, useful, or irrelevant. Hipp0 adjusts scoring weights per agent over time.

---

## Benchmarks

Reproducible benchmark suite -- run it yourself:

```bash
npx tsx benchmarks/runner.ts --suite all
```

### Retrieval Accuracy

| Metric | Hipp0 | Naive RAG | Delta |
|--------|-------|-----------|-------|
| Recall@5 | 78% | 39% | +39% |
| Recall@10 | 99% | 50% | +49% |
| Precision@5 | 70% | 34% | +37% |
| MRR | 0.94 | 0.79 | +0.16 |

### Token Compression

Two modes available via `?format=h0c` or `?format=ultra`:

| Decisions | Markdown | H0C (8-10x) | H0C Ultra (20-33x) |
|-----------|----------|-------------|---------------------|
| 10 | 2,154 tokens | 304 tokens | 186 tokens |
| 20 | 4,078 tokens | 486 tokens | 191 tokens |
| 50 | 9,870 tokens | 980 tokens | 301 tokens |

H0C Ultra uses semantic clustering: full detail for top decisions, title-only for mid-tier, domain-grouped summaries for the rest.

### Other Metrics

| Metric | Score |
|--------|-------|
| Contradiction Detection F1 | 0.92 |
| Role Differentiation | 100% (vs 0% naive RAG) |
| Compile P95 at 500 decisions | 19ms |

Full methodology: [benchmarks/README.md](benchmarks/README.md)

---

## MCP Setup (Claude, Cursor, Windsurf)

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hipp0": {
      "command": "npx",
      "args": ["@hipp0/mcp@latest"],
      "env": {
        "HIPP0_API_URL": "http://localhost:3100",
        "HIPP0_API_KEY": "your-api-key",
        "HIPP0_PROJECT_ID": "your-project-id"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add hipp0 -- npx @hipp0/mcp@latest
```

### Auto-setup (reads from .env)

```bash
bash examples/claude-mcp/setup.sh
```

21 MCP tools including `record_decision`, `compile_context`, `search_decisions`, `check_contradictions`, `create_session`, and `distill`.

---

## Framework Integrations

### CrewAI

```python
from hipp0_sdk import Hipp0Client
from hipp0_crewai import Hipp0CrewCallback

client = Hipp0Client()
cb = Hipp0CrewCallback(client=client, project_id="proj-123")

crew = Crew(
    agents=[architect, builder, reviewer],
    tasks=[design_task, build_task, review_task],
    task_callback=cb.on_task_complete,
)
crew.kickoff()
```

### LangGraph

```python
from hipp0_langgraph import Hipp0Checkpointer, inject_hipp0_context

checkpointer = Hipp0Checkpointer(client=client, project_id="proj-123", agent_name="orchestrator")
app = graph.compile(checkpointer=checkpointer)
```

### OpenAI Agents

```python
from hipp0_openai_agents import Hipp0AgentHooks

hooks = Hipp0AgentHooks(client=client, project_id="proj-123", agent_name="assistant")
agent = Agent(name="assistant", instructions="...", hooks=hooks)
```

Working examples: [examples/crewai-team](examples/crewai-team) | [examples/langgraph-agent](examples/langgraph-agent) | [examples/claude-mcp](examples/claude-mcp)

---

## Core Capabilities

**Decision Graph Engine** -- 5-signal scoring, role-differentiated compilation, stemmed tag matching, PostgreSQL + pgvector, change propagation with dependency cascade, hierarchy classification.

**Super Brain Orchestration** -- Multi-step session memory, Agent Decision Protocol (PROCEED / SKIP / OVERRIDE_TO / ASK_FOR_CLARIFICATION), orchestrator mode for team-level synthesis.

**Token Compression** -- H0C format (8-10x) and H0C Ultra (20-33x) compress compiled context to fit tight token budgets. Request via `?format=h0c` or `?format=ultra`.

**Agent Skill Profiling** -- Empirically measures which agents are good at which domains based on real outcome data. `GET /api/projects/:id/agent-skills` returns success rates per agent per domain. `GET /api/projects/:id/suggest-agent?task=...` recommends the best agent for a task.

**Contrastive Explanations** -- Compile with `?explain=true` to get "why this, not that?" explanations. Signal-by-signal comparison showing exactly why decision A ranked higher than B. Zero LLM calls.

**Decision Impact Prediction** -- `POST /api/simulation/predict-impact` predicts success rate, risk factors, and affected agents before a decision is implemented. Uses statistical analysis of similar past decisions.

**Decision A/B Testing** -- Run experiments comparing two decisions head-to-head. Create via `POST /api/projects/:id/experiments`, get results with z-test statistical significance, declare a winner.

**Three-Tier Knowledge Pipeline** -- Automatically promotes raw traces into facts, then facts into distilled insights (procedures, policies, anti-patterns, domain rules). `POST /api/projects/:id/insights/generate` runs the pipeline. The compile endpoint automatically attaches relevant team insights to every context package.

**Automated Reflection Loops** -- Hourly/daily/weekly self-improvement cycles that run without human intervention. Dedup, contradiction detection, skill updates, evolution scans, and insight generation. `POST /api/projects/:id/reflect` with `{type: 'hourly'|'daily'|'weekly'}`.

**Broader Stigmergy** -- Implicit trace capture beyond explicit decisions. Records tool_call, api_response, error, observation, artifact_created, code_change events. `distillTraces` analyzes breadcrumbs for implicit decisions when evidence is strong (3+ similar traces).

**Knowledge Branching** -- Git-style branches for the decision graph. Fork, experiment on a branch, merge winners back. `POST /api/projects/:id/branches`, `GET /api/projects/:id/branches/:id/diff`, `POST /api/projects/:id/branches/:id/merge`.

**Expanded Simulation** -- Multi-decision what-if (`POST /api/simulation/multi-change`), cascade impact through decision_edges up to 3 levels deep (`POST /api/simulation/cascade`), and rollback analysis (`POST /api/simulation/rollback`).

**Team Procedure Extraction** -- Analyzes compile_history to auto-extract reusable team workflows. "For auth tasks: architect -> security_reviewer -> backend (7 times, 92% success)." `GET /api/projects/:id/procedures/suggest?task=...`.

**Memory Analytics** -- Team health metrics, weekly digests, trends. `GET /api/projects/:id/analytics/health`, `GET /api/projects/:id/analytics/trends?days=30`, `POST /api/projects/:id/analytics/digest/generate`.

**Real-Time Event Streaming** -- WebSocket feed of memory events (decisions, contradictions, outcomes, compiles, experiments). Subscribe via `/ws/events?project_id=...&api_key=...` or use the `Hipp0EventStream` SDK client.

**Cross-Project Pattern Sharing** -- Opt-in network effect. Patterns discovered in one project become available (anonymized) to others. `GET /api/shared-patterns`, `POST /api/projects/:id/patterns/share`.

**Zero-Config Auto-Instrumentation** -- One line setup for Python and TypeScript. `import hipp0; hipp0.auto()` or `import { auto } from '@hipp0/sdk/auto'; auto();`. Monkey-patches OpenAI/Anthropic clients to auto-capture conversations and inject context. Fire-and-forget, never blocks.

**Scheduled Reflection Worker** -- Background worker automatically runs hourly/daily/weekly reflection loops on all active projects. No cron setup needed. Enable with `HIPP0_SCHEDULER_ENABLED=true`.

**Digest Delivery** -- Email, Slack, and webhook delivery for weekly digests. Configure per-project via `POST /api/projects/:id/digest/delivery`. Weekly reflections auto-deliver to configured channels.

**OpenTelemetry Observability** -- Full OTel instrumentation. Spans for compile, distill, reflection. Metrics for compile duration, decisions created, contradictions detected, outcomes recorded. Works with Datadog, Grafana, Honeycomb, New Relic. Enable with `HIPP0_TELEMETRY_ENABLED=true`.

**Collaborative Features** -- Comments (threaded), approvals (with requested_by/approvers), and annotations (inline text-range notes) on decisions. Multiple humans can curate the team's memory together. All events emit via the real-time stream.

**Hosted Playground** -- Interactive demo at hipp0.ai/playground. Visitors get an ephemeral sandboxed SQLite database with 50 pre-seeded decisions across 6 agents. 5 pre-built scenarios showcase role differentiation, contradictions, team procedures, impact prediction, and skill profiling. Zero AI credits needed.

**Import & Sync** -- GitHub PR scanning via Octokit, AI-powered decision extraction from PR diffs, preview before import, permanent webhook-driven sync.

**Governance** -- Review queue for pending decisions, approve/reject workflow with audit trail, policy enforcement with block/warn rules, violation tracking, weekly digest.

**Passive Capture** -- Auto-extract decisions from agent conversations via `/api/capture`. Runs the distillery pipeline in the background with dedup detection.

**Outcome Intelligence** -- Track decision outcomes (success/failure/mixed), compute outcome stats, feed results back into the scoring pipeline.

**Trust-Aware Memory** -- Provenance chains track where each decision came from. Trust scores weight decisions by source reliability.

**Execution Governor** -- Preflight validation for agent actions, override with justification, simulation preview for what-if analysis.

---

## How Hipp0 Compares

| Capability | Hipp0 | Mem0 | Zep | LangMem |
|-----------|-------|------|-----|---------|
| Decision memory (not chat history) | Yes | No | No | No |
| Role-differentiated context | Yes (100%) | No | No | No |
| 5-signal scoring | Yes | Embedding only | 2 signals | Embedding only |
| Contradiction detection | 0.92 F1 | No | No | No |
| Token compression | 8-33x | No | No | No |
| Agent skill profiling | Yes | No | No | No |
| Contrastive explanations | Yes | No | No | No |
| Impact prediction | Yes | No | No | No |
| Decision A/B testing | Yes | No | No | No |
| Three-tier knowledge pipeline | Yes | No | No | No |
| Automated reflection loops | Yes | No | No | No |
| Knowledge branching (git-style) | Yes | No | No | No |
| Cascade simulation | Yes | No | No | No |
| Team procedure extraction | Yes | No | No | No |
| Cross-project pattern sharing | Yes (opt-in) | No | No | No |
| Real-time event streaming | Yes (WebSocket) | No | No | No |
| Zero-config auto-instrumentation | Yes | No | No | No |
| Scheduled reflection worker | Yes | No | No | No |
| Email/Slack digest delivery | Yes | No | No | No |
| OpenTelemetry observability | Yes | No | No | No |
| Collaborative comments/approvals | Yes | No | No | No |
| Hosted interactive playground | Yes | No | No | No |
| MCP server | 21 tools | No | No | No |
| Self-hosted | Free forever | Cloud only | Yes | Yes |
| Open source | Apache 2.0 | Apache 2.0 | MIT | MIT |

---

## SDK

### TypeScript

```bash
npm install @hipp0/sdk
```

```typescript
import { Hipp0Client } from '@hipp0/sdk';
const client = new Hipp0Client({ baseUrl: 'http://localhost:3100', apiKey: 'key' });
```

### Python

```bash
pip install hipp0-memory
```

```python
from hipp0_sdk import Hipp0Client
client = Hipp0Client(base_url="http://localhost:3100", api_key="key")
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Powers the Distillery (auto-extraction via Claude) |
| `OPENAI_API_KEY` | No | Enables semantic embeddings (`text-embedding-3-small`) |
| `HIPP0_AUTH_REQUIRED` | No | Set `false` for local dev. Always `true` in production. |
| `HIPP0_LLM_MODEL` | No | Override the default LLM model |
| `DATABASE_URL` | No | Custom PostgreSQL connection string |

Full reference: [`.env.example`](.env.example)

---

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/getting-started.md) | Deploy from zero to running |
| [Architecture](docs/architecture.md) | System design and component internals |
| [API Reference](docs/api-reference.md) | Complete REST API documentation |
| [MCP Setup](docs/mcp-setup.md) | Claude Desktop, Cursor, any MCP client |
| [TypeScript SDK](docs/sdk.md) | Full SDK method reference |
| [Python SDK](docs/python-sdk.md) | Python SDK reference |
| [CLI](docs/cli.md) | CLI commands and flags |
| [H0C Format](docs/h0c-format.md) | Token compression (8-33x) |
| [Benchmarks](docs/benchmarks.md) | Running and interpreting benchmarks |
| [Framework Guides](docs/framework-guides/) | LangGraph, CrewAI, AutoGen, OpenAI Agents |

---

## License

Apache 2.0 -- self-host for free, forever.

---

<p align="center">Built by <strong>Perlantir AI Studio</strong></p>
