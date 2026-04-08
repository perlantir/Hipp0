```
    __  __ _             ___
   / / / /(_)___  ____  / _ \
  / /_/ // // _ \/ __ \/ // /
 / __  // // ___/ /_/ /\__ \
/_/ /_//_// \___/ .___/____/
         |_/   /_/
```

# Hipp0

**The memory and intelligence compiler for AI agent teams.**

Hipp0 gives every AI agent on your team a shared decision memory — a structured graph of what was decided, why, by whom, and how it connects to everything else. Agents query context before acting, record decisions after acting, and the graph grows smarter over time. One API, any framework, any model.

---

## Key Differentiators

- **Role-differentiated compilation** — different agents get different context for the same task, unlike naive RAG which returns identical results.
- **5-signal scoring engine** — directAffect, tagMatch, personaMatch, semanticSimilarity, temporal — not just text similarity.
- **100% agent differentiation** vs 0% for naive RAG (benchmark-proven).
- **0.92 F1 contradiction detection** — automatically catches conflicting decisions.
- **Session memory** — Agent B sees Agent A's actual output, not just historical decisions.
- **Zero-config BYOK** — bring your own Anthropic/OpenAI keys, self-host for free forever.

---

## Features

### Decision Graph Engine
- **5-signal relevance scoring** — directAffect, tagMatch, personaMatch, semanticSimilarity, temporal — with per-agent weight profiles
- **Role-differentiated context compilation** — each agent gets context tuned to its role and current task
- **Tag matcher with stemming** — exact → substring → stemmed fallback for flexible matching
- **PostgreSQL + pgvector** — embeddings via OpenAI `text-embedding-3-small` for semantic search
- **Change Propagator + Dependency Cascade** — when a decision changes, affected decisions are flagged and downstream impacts traced
- **Hierarchy Classifier** — automatic categorization of decisions into domain hierarchies

### Super Brain Orchestration
- **Session management** with multi-step workflows and recommended actions
- **Agent Decision Protocol** — `PROCEED` / `PROCEED_WITH_NOTE` / `SKIP` / `OVERRIDE_TO` / `ASK_FOR_CLARIFICATION` + `action_reason`
- **2 MCP orchestrator tools** — `hipp0_follow_orchestrator` and `hipp0_override_orchestrator`

### Webhooks
- **Outbound webhook delivery** for decision lifecycle events (`decision_created`, `decision_superseded`, `decision_reverted`, `contradiction_detected`, `distillery_completed`, `scan_completed`)
- **Multi-platform formatting** — generic JSON, Slack Block Kit, Discord embeds, Telegram Bot API
- **HMAC-SHA256 signing** with configurable secrets per webhook
- **Validation & test pings** — verify connectivity before going live

### Agent Wings
- **Domain-based agent groupings** with learned cross-wing affinity scores
- **Affinity learning from feedback** — useful/critical ratings boost wing weights, irrelevant ratings reduce them
- **Wing-aware context compilation** — own-wing decisions get a configurable boost
- **Rebalance API** — full recomputation of affinity weights from historical feedback

### Temporal Intelligence
- **Temporal scopes** — `permanent`, `sprint`, `experiment`, `deprecated` with `valid_from`/`valid_until` bounds
- **Freshness scoring** — exponential decay with configurable half-lives (30d validated, 7d unvalidated)
- **Staleness detection** — automatic flags for unvalidated, stale, superseded, and low-confidence decisions
- **Auto-supersede** — new decisions can automatically supersede old ones with full propagation

### Benchmarks
- **5 reproducible benchmark suites** — retrieval accuracy, contradiction detection, role differentiation, token efficiency, compile latency
- **Naive RAG baseline comparison** — side-by-side scoring against a standard RAG approach
- **Configurable scoring parameters** — tunable weights, synonym expansion, cross-reference boosts

### Time Travel
- **Historical context reconstruction** — view what any agent's compiled context looked like at any past date
- **Compile snapshot diffing** — compare two compilations to see added, removed, and re-ranked decisions
- **Weight snapshots** — reconstruct historical scoring weights alongside decisions

### Review Queue
- **Pending decision review** — decisions created with `pending` status enter a review queue
- **Approve/reject workflow** — approval triggers all deferred side-effects (webhooks, contradiction checks, embeddings)
- **Rejection with reason** — rejected decisions are reverted with an audit trail

### Cascade Alerts
- **Dependency graph traversal** — BFS through `requires` edges up to 5 levels deep
- **Urgency-based notifications** — direct impacts are `high` urgency, transitive impacts are `medium`
- **Governor alerts** — all governor-role agents receive critical-urgency summaries of full cascade chains
- **Subscription-based propagation** — agents subscribe to tags or specific decisions for targeted notifications

### Import Wizard
- **GitHub scanning via Octokit** — real PR extraction (titles, descriptions, labels, reviewers, file paths)
- **Full execute pipeline** — scan → preview → selective import with confidence scoring
- **Permanent GitHub Sync wizard** — 3-step guided setup for webhook-driven continuous import

### Collaboration Rooms
- **Real-time WebSocket** — presence tracking, typing indicators, `@mention` autocomplete
- **Cross-platform agent communication** — humans, OpenClaw, Hermes, Claude Code, CrewAI, any agent on any platform
- **Session timeline** with Brain suggestion accept/override

### Interactive Playground
- 4 built-in demo scenarios with with/without comparison
- Speed controls and step-by-step execution
- Live visualization of scoring and context compilation

### Distillery
- **Auto-extract decisions from conversations** using Claude (Anthropic)
- Deduplication, contradiction detection, and graph integration
- Session summarization

### Ask Anything
- **Natural-language Q&A** over your entire decision graph
- Freeform chat interface powered by the Distillery's `/api/distill/ask` endpoint

### Governance
- Weekly digest generation
- Outcomes tracking with impact analysis
- Decision evolution proposals
- **Policy enforcement** — block/warn rules with violation tracking

### Weight Snapshots
- **Point-in-time capture** of agent scoring weights for audit and time-travel reconstruction

### Relevance Feedback
- **Per-decision feedback loop** — rate compiled decisions as critical, useful, or irrelevant
- Feedback drives wing affinity learning and weight tuning

### Export/Import
- **Bulk decision import** from JSON/CSV with preview and deduplication
- **Data export** for offline analysis and backup

### Token Usage & Monitoring
- **Daily compile and decision activity charts** with trend visualization
- **Monitoring dashboard** with health cards, project stats, and alert feeds
- **Sentry integration** for error tracking and performance monitoring

### Billing & Pricing
- **Stripe integration** — checkout, customer portal, webhook-driven subscription management
- **Three-tier pricing** — Free, Pro, Enterprise with monthly/annual billing
- **Usage metering** — compiles, asks, and decisions tracked against plan limits

### Keyboard Shortcuts & Command Palette
- **`Ctrl+K` command palette** for keyboard-driven navigation to any view
- **Full keyboard shortcut system** with `?` to view all bindings

### Cross-Tenant Patterns
- **Community Insights** — anonymized cross-tenant pattern suggestions and tag recommendations

### Integrations
- **18+ MCP tools** for any MCP-compatible client
- **Framework adapters** — LangChain, CrewAI, AutoGen, OpenAI Agents SDK *(Experimental)*
- **TypeScript SDK** (`@hipp0/sdk`), **Python SDK** (`hipp0-sdk`), **CLI** (`@hipp0/cli`)
- **BYOK model support** — bring your own API keys for OpenAI, Anthropic, or OpenRouter

---

## Dashboard

Hipp0 ships with a full-featured React dashboard (port 3200) with 31 views:

### Main Views
| View | Route | Description |
|------|-------|-------------|
| Playground | `#playground` | Interactive multi-agent demo with Super Brain step-by-step simulation |
| Decision Graph | `#graph` | D3 force-directed graph of all decisions, edges, and statuses |
| Timeline | `#timeline` | Chronological decision list with validation sources and status badges |
| Contradictions | `#contradictions` | Conflicting decisions with inline resolution actions |
| Context Compare | `#context` | Side-by-side context package comparison across agents |
| Search | `#search` | Full-text semantic search across all decisions |
| Impact Analysis | `#impact` | Dependency chain visualization for change impact assessment |
| Sessions | `#sessions` | Paginated history of agent sessions with collapsible detail panels |
| Compile Tester | `#compile-tester` | On-demand compile with scored results, diffs, and time-travel mode |
| Review Queue | `#review-queue` | Pending decisions inbox with approve/reject/edit actions |
| Ask Anything | `#ask-anything` | Natural-language chat interface over the decision graph |
| Evolution | `#evolution` | AI-generated improvement proposals for underperforming decisions |
| What-If | `#whatif` | Hypothetical decision modification with live score preview |
| Live Tasks | `#live-tasks` | Real-time active session dashboard with pause/resume controls |
| Team Score | `#team-score` | Agent relevance leaderboard for a given task |
| Collab Room | `#collab-room` | Real-time multi-agent collaboration with WebSocket messaging |
| Wings | `#wings` | Agent wing visualization with cross-wing affinity graph |

### Integration Views
| View | Route | Description |
|------|-------|-------------|
| Import | `#import` | Drag-and-drop bulk import from JSON/CSV |
| Import Wizard | `#import-wizard` | 5-phase guided import from GitHub or files |
| Connectors | `#connectors` | External data source management (databases, folders, webhooks, Git) |
| Webhooks | `#webhooks` | Outbound webhook CRUD with test-send and enable/disable toggles |
| Time Travel | `#timetravel` | Historical compile browsing with snapshot diffing |

### Monitoring Views
| View | Route | Description |
|------|-------|-------------|
| Token Usage | `#token-usage` | Daily decision and compile activity charts |
| Alerts | `#notifications` | System notification feed with mark-as-read |
| Health | `#stats` | Project health overview with monitoring cards and trend charts |
| Outcomes | `#outcomes` | Task outcome tracking linked to compiled decisions |
| Weekly Digest | `#digest` | Aggregated weekly health report with severity-based insights |
| Policies | `#policies` | Governance policy management with violation tracking |
| Violations | `#violations` | Policy violation log with severity, evidence, and resolution |

### Settings Views
| View | Route | Description |
|------|-------|-------------|
| Pricing | `#pricing` | Subscription plan comparison (Free/Pro/Enterprise) |
| Billing | `#billing` | Subscription status, usage counters, and invoice history |

---

## Benchmarks

Hipp0 includes a reproducible benchmark suite measuring retrieval accuracy, contradiction detection, role differentiation, token efficiency, and compile latency against a naive RAG baseline.

| Metric | Hipp0 | Naive RAG | Delta |
|--------|-------|-----------|-------|
| Recall@5 | 78% | 39% | +39% |
| Recall@10 | 99% | 50% | +49% |
| Precision@5 | 70% | 34% | +37% |
| MRR | 0.94 | 0.79 | +0.16 |
| Contradiction F1 | 0.92 | N/A | — |
| Differentiation | 100% | 0% | +100% |
| H0C Compression (bench) | 3.4x | N/A | — |
| H0C Compression (full) | 10-12x | N/A | — |
| Compile P95 (500 dec) | 24ms | N/A | — |

\* Token efficiency measured on simplified benchmark decisions. Production compile on full `ScoredDecision` objects achieves 10–12x compression.

H0C compression achieves 10-12x on full `ScoredDecision[]` JSON and 3.4x on simplified benchmark decisions. See [docs/h0c-format.md](docs/h0c-format.md) for the format specification.

Run benchmarks:

```bash
npx tsx benchmarks/runner.ts --suite all
```

Full methodology and results: [benchmarks/README.md](benchmarks/README.md)

---

## How Hipp0 Compares

| Capability | Hipp0 | Mem0 | MemPalace | Zep | LangMem |
|-----------|-------|------|-----------|-----|---------|
| Multi-agent role differentiation | ✅ 100% (benchmark-proven) | ❌ Single-user | ❌ Single-user | ⚠️ Basic | ❌ No |
| Decision memory (not just chat) | ✅ Structured decisions | ❌ Chat history | ❌ Chat history | ❌ Chat history | ❌ Chat history |
| 5-signal scoring engine | ✅ 5 signals + learned affinity | ❌ Embedding only | ❌ Embedding only | ⚠️ 2 signals | ❌ Embedding only |
| Contradiction detection | ✅ 0.92 F1 | ❌ No | ❌ No | ❌ No | ❌ No |
| Session memory (Agent B sees Agent A) | ✅ Super Brain | ❌ No | ❌ No | ⚠️ Basic | ❌ No |
| Token compression | ✅ 3.4x H0C format | ❌ No | ⚠️ AAAK format | ❌ No | ❌ No |
| Real-time collaboration rooms | ✅ WebSocket | ❌ No | ❌ No | ❌ No | ❌ No |
| Self-hosted free tier | ✅ Unlimited forever | ⚠️ Open-source available | ❌ Cloud only | ⚠️ CE deprecated | ✅ Yes |
| Import from GitHub PRs | ✅ Full wizard | ❌ No | ❌ No | ❌ No | ❌ No |
| Framework agnostic | ✅ Any via MCP | ⚠️ Python SDK | ⚠️ Python SDK | ⚠️ Python/TS/Go SDKs | ❌ LangChain only |
| Governance / Policies | ✅ Built-in | ❌ No | ❌ No | ❌ No | ❌ No |
| Open source | ✅ Apache 2.0 | ✅ Apache 2.0 | ❌ Proprietary | ✅ Apache 2.0 | ✅ MIT |

> Comparison based on publicly available documentation as of April 2026. Features may have changed. We encourage you to verify against each project's latest docs: [Mem0](https://mem0.ai), [Zep](https://getzep.com), [LangMem](https://github.com/langchain-ai/langmem), MemPalace.

---

## Why Hipp0

Most AI memory systems store chat history and retrieve it by embedding similarity. This works for single-agent chatbots — ask a question, get back the most semantically similar past messages. But it falls apart for multi-agent teams, where different agents need fundamentally different context for the same task. A security reviewer and a frontend developer looking at the same authentication code need completely different supporting information, and embedding similarity alone cannot provide that.

Hipp0 stores structured decisions — not chat logs — and scores them with five signals (directAffect, tagMatch, personaMatch, semanticSimilarity, temporal) rather than relying on text similarity alone. It compiles role-specific context packages so each agent gets exactly the context it needs. A security agent reviewing auth code gets authentication and encryption decisions ranked high. A frontend agent reviewing the same code gets UI component and state management decisions instead. Same task, different context — automatically, with no manual curation.

The system improves over time. Wing affinity learns from relevance feedback, boosting cross-domain context that agents actually use and demoting what they ignore. Temporal intelligence automatically expires stale decisions and freshens validated ones. Contradiction detection (0.92 F1) prevents conflicting guidance from reaching agents simultaneously. The result is an agent team that gets smarter the longer it works together — a self-improving decision memory, not a growing pile of chat transcripts.

---

## Roadmap

- Calibration sprint (precision tuning to 82% target)
- Publish `@hipp0/mcp` + `@hipp0/cli` + `@hipp0/sdk` to npm
- Publish `hipp0-memory` to PyPI
- Logo and launch video
- Framework integration testing (LangChain / CrewAI / AutoGen / OpenAI Agents)
- Latency benchmark suite

---

## Quick Start

### Docker Compose (recommended)

```bash
git clone https://github.com/perlantir/Hipp0.git
cd Hipp0

# Create .env from template
cp .env.example .env
# Edit .env — add at minimum: ANTHROPIC_API_KEY

# Start everything
docker compose up -d
```

The stack starts three services:
| Service | Port | Description |
|---------|------|-------------|
| `hipp0-server` | 3100 | API + WebSocket server |
| `hipp0-dashboard` | 3200 | React dashboard |
| `hipp0-db` | 5432 | PostgreSQL 17 + pgvector |

### API Key Setup

On first startup, Hipp0 auto-generates an API key for the default project. Retrieve it:

```bash
curl http://localhost:3100/api/projects
# → returns project_id

curl http://localhost:3100/api/api-keys?project_id=<PROJECT_ID>
# → returns your API key
```

Include it in all requests:

```
Authorization: Bearer <API_KEY>
```

### Compile Context (your first API call)

```bash
# Compile context for an agent
curl http://localhost:3100/api/compile \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <API_KEY>' \
  -d '{"agent_name": "architect", "task_description": "design the auth system", "project_id": "<PROJECT_ID>"}'
```

---

## MCP Configuration

> **Note:** `@hipp0/mcp` is not yet published to npm. Use the local path for now.

### Future (when published)

```json
{
  "mcpServers": {
    "hipp0": {
      "command": "npx",
      "args": ["-y", "@hipp0/mcp"],
      "env": {
        "HIPP0_API_URL": "http://localhost:3100",
        "HIPP0_API_KEY": "<YOUR_API_KEY>",
        "HIPP0_PROJECT_ID": "<YOUR_PROJECT_ID>"
      }
    }
  }
}
```

### Current (local path)

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

This exposes 18+ tools including `record_decision`, `get_context`, `search_decisions`, `hipp0_follow_orchestrator`, and `hipp0_override_orchestrator`.

---

## SDK Usage

### TypeScript

```typescript
import { Hipp0Client } from '@hipp0/sdk';

const client = new Hipp0Client({
  baseUrl: 'http://localhost:3100',
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
});

// Record a decision
await client.recordDecision({
  title: 'Use JWT for auth',
  description: 'Chose JWT over session cookies for stateless API auth',
  made_by: 'backend-agent',
  tags: ['auth', 'security'],
  confidence: 'high',
});

// Get context for an agent
const context = await client.compile({
  agent_name: 'backend-agent',
  task: 'implement refresh token rotation',
});
```

### Python

> **Note:** `hipp0-sdk` is not yet published to PyPI. Install locally:
>
> ```bash
> cd python-sdk
> pip install -e .
> ```

```python
from hipp0_sdk import Hipp0Client

client = Hipp0Client(
    base_url="http://localhost:3100",
    api_key="your-api-key",
    project_id="your-project-id",
)

# Record a decision
client.record_decision(
    title="Use JWT for auth",
    description="Chose JWT over session cookies for stateless API auth",
    made_by="backend-agent",
    tags=["auth", "security"],
    confidence="high",
)

# Get context
context = client.compile(
    agent_name="backend-agent",
    task="implement refresh token rotation",
)
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Hipp0 Dashboard                       │
│              (React + Vite · port 3200)                  │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / WebSocket
┌────────────────────────▼────────────────────────────────┐
│                    Hipp0 Server                           │
│               (Hono + Node · port 3100)                  │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Context  │ │  Super   │ │ Distill- │ │   Import   │ │
│  │ Compiler │ │  Brain   │ │   ery    │ │   Wizard   │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │  Collab  │ │ Change   │ │ Contra-  │ │   MCP      │ │
│  │  Rooms   │ │ Propag.  │ │ dictions │ │  (18+ tools│ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│             PostgreSQL 17 + pgvector                     │
│         Decisions · Agents · Edges · Sessions            │
│         Embeddings · Collab Rooms · Import Scans         │
└─────────────────────────────────────────────────────────┘
```

---

## Environment Variables

See [`.env.example`](.env.example) for the full reference. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | For Distillery (decision extraction via Claude) |
| `OPENAI_API_KEY` | No | For semantic embeddings (`text-embedding-3-small`) |
| `HIPP0_AUTH_DISABLED` | No | Set `true` for local dev (skips API key auth) |
| `HIPP0_LLM_MODEL` | No | Override default LLM model |
| `HIPP0_CORS_ORIGINS` | No | Allowed CORS origins (production) |
| `DATABASE_URL` | No | Custom PostgreSQL connection string |

---

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/getting-started.md) | Initial setup and first steps |
| [Quick Start](docs/quickstart.md) | Minimal setup to get running |
| [Architecture](docs/architecture.md) | System design and component overview |
| [API Reference](docs/api-reference.md) | Complete REST API documentation |
| [MCP Setup](docs/mcp-setup.md) | MCP client configuration guide |
| [Agent Decision Protocol](docs/agent-protocol.md) | How agents interpret and act on Brain signals |
| [GitHub Integration](docs/github-integration.md) | PR scanning, sync, and webhook setup |
| [Self-Hosting](docs/self-hosting.md) | Production deployment guide |
| [Storage & Database](docs/storage.md) | PostgreSQL schema and migration info |
| [Framework Guides](docs/framework-guides/) | LangChain, CrewAI, AutoGen, OpenAI Agents *(Experimental)* |
| [Webhooks](docs/webhooks.md) | Webhook setup, event types, payload format, and retry behavior |
| [Agent Wings](docs/agent-wings.md) | Wing groupings, affinity learning, and API endpoints |
| [Temporal Intelligence](docs/temporal-intelligence.md) | Temporal scopes, staleness detection, and auto-supersede |
| [Collaboration Rooms](docs/collab-rooms.md) | Room creation, WebSocket events, presence, and @mentions |
| [Benchmarks](docs/benchmarks.md) | How to run, interpret results, and add custom suites |
| [Time Travel](docs/time-travel.md) | Historical graph state and compile snapshot diffing |
| [Review Queue](docs/review-queue.md) | What triggers review, approve/reject/edit flow |
| [Cascade Alerts](docs/cascade-alerts.md) | Upstream change propagation and notification flow |
| [How Hipp0 Compares](docs/comparison.md) | vs Mem0, MemPalace, Zep, LangMem |

---

## Links

- **Dashboard**: `http://localhost:3200` (after Docker Compose)
- **API**: `http://localhost:3100/api`
- **Health check**: `http://localhost:3100/api/health`
- **API docs**: `http://localhost:3100/api/docs`

---

## License

Apache 2.0

---

<p align="center">
  Built by <strong>Perlantir AI Studio</strong>
</p>
