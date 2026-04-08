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

## Features

### Decision Graph Engine
- **5-signal relevance scoring** — directAffect, tagMatch, personaMatch, semanticSimilarity, temporal — with per-agent weight profiles
- **Role-differentiated context compilation** — each agent gets context tuned to its role and current task
- **Tag matcher with stemming** — exact → substring → stemmed fallback for flexible matching
- **PostgreSQL + pgvector** — embeddings via OpenAI `text-embedding-3-small` for semantic search
- **Change Propagator + Dependency Cascade** — when a decision changes, affected decisions are flagged and downstream impacts traced

### Super Brain Orchestration
- **Session management** with multi-step workflows and recommended actions
- **Agent Decision Protocol** — `PROCEED` / `PROCEED_WITH_NOTE` / `SKIP` / `OVERRIDE_TO` / `ASK_FOR_CLARIFICATION` + `action_reason`
- **2 MCP orchestrator tools** — `hipp0_follow_orchestrator` and `hipp0_override_orchestrator`

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

### Governance
- Weekly digest generation
- Outcomes tracking with impact analysis
- Decision evolution proposals

### Integrations
- **18+ MCP tools** for any MCP-compatible client
- **Framework adapters** — LangChain, CrewAI, AutoGen, OpenAI Agents SDK
- **TypeScript SDK** (`@hipp0/sdk`), **Python SDK** (`hipp0-sdk`), **CLI** (`@hipp0/cli`)
- **BYOK model support** — bring your own API keys for OpenAI, Anthropic, or OpenRouter

---

## Benchmarks

Hipp0 includes a reproducible benchmark suite measuring retrieval accuracy, contradiction detection, role differentiation, and token efficiency against a naive RAG baseline.

| Metric | Hipp0 | Naive RAG | Delta |
|--------|-------|-----------|-------|
| Recall@5 | 69% | 34% | +35% |
| Recall@10 | 93% | 46% | +47% |
| Precision@5 | 71% | 35% | +36% |
| MRR | 0.95 | 0.78 | +0.17 |
| Contradiction F1 | 0.92 | N/A | — |
| Differentiation | 93% | 0% | +93% |
| Avg Compression | 13.3x | N/A | — |
| Compile P95 (500 dec) | 34ms | N/A | — |

Run benchmarks:

```bash
npx tsx benchmarks/runner.ts --suite all
```

Full methodology and results: [benchmarks/README.md](benchmarks/README.md)

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

---

## MCP Configuration

Add to your MCP client config (Claude Desktop, Cursor, etc.):

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

- [Getting Started](docs/getting-started.md)
- [Quick Start](docs/quickstart.md)
- [Architecture](docs/architecture.md)
- [API Reference](docs/api-reference.md)
- [MCP Setup](docs/mcp-setup.md)
- [Agent Decision Protocol](docs/agent-protocol.md)
- [GitHub Integration](docs/github-integration.md)
- [Self-Hosting](docs/self-hosting.md)
- [Storage & Database](docs/storage.md)
- [Framework Guides](docs/framework-guides/) — LangChain, CrewAI, AutoGen, OpenAI Agents

---

## Links

- **Dashboard**: `http://localhost:3200` (after Docker Compose)
- **API**: `http://localhost:3100/api`
- **Health check**: `http://localhost:3100/api/health`
- **API docs**: `http://localhost:3100/api/docs`

---

## License

MIT

---

<p align="center">
  Built by <strong>Perlantir AI Studio</strong>
</p>
