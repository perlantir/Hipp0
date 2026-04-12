# HIPP0 + Hermes Deployment — Project State

**Read this file first if you are a new Claude Code instance opening this project.** It is the durable mirror of context that would otherwise be lost when a session ends.

Last updated: 2026-04-12 (Phase G memory fix complete, Phase H pending)

---

## The 30-second summary

HIPP0 is a shared memory layer for AI agents. Hermes is the agent runtime. We are deploying them together on a Hostinger VPS (72.61.127.59) at domains `hipp0.ai`, `api.hipp0.ai`, `app.hipp0.ai`. The deployment is the **Phase 3 integration** of two parallel Claude Code builds:

- **HIPP0** (`perlantir/Hipp0`) — dashboard, chat view, snippet pipeline, `/api/hermes/*` contract routes
- **Hermes** (`perlantir/hermes-agent`) — persistent multi-agent runtime (H1-H5 on `feat/persistent-agents-hipp0`)

The deployment is organized as phases 0a → H. Active branches:
- HIPP0: `claude/build-marketing-website-3HXL3` @ `a19ff87`
- Hermes: `feat/persistent-agents-hipp0` @ `e08b3943`

## Product thesis

HIPP0 is the team memory layer across multiple AI agents. The marquee feature is **role-differentiated cross-agent context retrieval** — when agent A needs context, HIPP0 returns snippets weighted for A's role, filtered by A's task, distilled from what other agents have done. An engineer agent and a reviewer agent asking about the same codebase get different relevant context.

Hermes hosts persistent named agents (Alice, Maks, Forge, etc.) with their own SOUL.md, MEMORY.md, USER.md, skills, and config. When an agent runs, Hermes calls HIPP0 `/api/compile` for context and `/api/capture` for observation, creating the memory loop.

## Era history

The project has been through two eras and two prior name changes. The current name, Hipp0, is what we deploy. The `/opt/nexus/` directory on the VPS is a filesystem fossil from the original project name.

- **Era 1 (the "50+ features overbuild")** — 24+ unmerged feature branches, tons of dashboard views (Evolution Engine, Knowledge Branches, Shared Patterns, Community Insights, etc.), built as a standalone tool that worked with OpenClaw. Deployed to the VPS at `/opt/nexus/` as a docker-compose stack. The `nexus` directory name is a filesystem fossil from the Nexus era.
- **Era 2 (the focused rewrite)** — marketing-branch HEAD. Collapsed to 6 dashboard views (Chat, Pulse, Snippets, Agents, Compile, Settings). Added the `/api/hermes/*` contract routes. Rebuilt snippet pipeline. This is what we are deploying.

The era-1 feature branches will be hidden behind a Labs flag in the Phase 1 dashboard cleanup per the product roadmap. They are not merged and will not be merged.

## Repo + branch layout

### `perlantir/Hipp0`
- Active: `claude/build-marketing-website-3HXL3`
- HEAD: `142c724` (fix(server): emit full bootstrap API key + reorder boot — Phase A unblock)
- Phase 0 → Phase 11 complete on this branch + Phase 0a fix
- `main` is era-1 (do not deploy from main)

### `perlantir/hermes-agent`
- Active: `feat/persistent-agents-hipp0`
- HEAD: `961480e4`
- Fork of NousResearch/hermes-agent
- Added in H1-H5: `hermes_cli/agent_registry.py`, `tools/persistent_delegate_tool.py`, `gateway/persistent_agent_router.py`, `agent/hipp0_memory_provider.py`, slim prompt mode in `agent/prompt_builder.py`, Telegram @mention routing
- Still needed: `hermes_cli/repl.py` CLI REPL entrypoint for `talk-to-alice` (Phase F)
- Also still needed: `gateway/platforms/web_platform.py` WebSocket stub for HIPP0 Chat view (post-Phase-H follow-up, not blocking)

## VPS state (72.61.127.59)

### Docker stack at `/opt/nexus/` — running, untouched until Phase A'
- `hipp0-db` — Postgres 17 + pgvector, volume `nexus_nexus_pgdata`, healthy. **Do not touch.**
- `hipp0-server` — image `nexus-server` (era-1), healthy, bound to `0.0.0.0:3100`, auth enabled
- `hipp0-dashboard` — bound to `0.0.0.0:3200`, healthy
- `openclaw-okny-openclaw-1` — separate tenant, filesystem-integrated to HIPP0 via `HIPP0_OPENCLAW_PATH`, different docker network, **zero HTTP impact on the rebuild**

### Postgres contents (from Phase 0d diagnostic)
- **111 decisions are REAL DOGFOOD DATA, not demo seed.** Span Mar 10 → Apr 10.
- made_by breakdown: chain 28, architect 21, backend 18, aegis 15, clawexpert 13, frontend 9, distillery 4, marketer 3
- Source: 57 auto_distilled, 51 manual, 3 auto_capture
- Real project references: "Agent Sparta", ERC-4337, on-chain ELO
- Project UUID: `de000000-0000-4000-8000-000000000001` (the demo project UUID, but populated with real data)
- **Backed up at: `/var/backups/hipp0/pre-deploy-20260411-203946.sql.gz`** (839 KB, pg_dump custom format, verified 113 lines in decisions COPY block = 111 rows + COPY header + \. terminator)

### Credentials captured (Phase 0d)
- **`HIPP0_API_KEY`** — 64-char hex (NOT h0_live_ format). Legacy env-var-based root admin bypass. Source: `docker exec hipp0-server printenv HIPP0_API_KEY`. Stored at `/etc/team-hippo/api-key.txt` (mode 600). Validated: `Authorization: Bearer <KEY>` returns HTTP 200 on `/api/projects`. Persists across rebuild via `/opt/nexus/.env` mount.
- **`ANTHROPIC_API_KEY`** — `sk-ant-api03-...` 108 chars. Source: same container. Stored in `/etc/team-hippo/secrets.env` (mode 640) alongside `HIPP0_BASE_URL=http://127.0.0.1:3100` and `HIPP0_API_KEY_FILE=/etc/team-hippo/api-key.txt`.

### Caddy config (pre-rebuild, HTTP only)
- `http://api.hipp0.ai` → `localhost:3100`
- `http://app.hipp0.ai` → `localhost:3200`
- **Topology decision: KEEP the api/app split.** Do NOT consolidate to `app.hipp0.ai → :3100`. The split is the intended era-2 final topology — api serves the JSON API, app serves the React dashboard which talks back to api.
- Phase B will add Let's Encrypt TLS to both site blocks.

### Filesystem state
| Path | Owner | Mode | Purpose |
|---|---|---|---|
| `/etc/team-hippo/api-key.txt` | root:teamhippo | 600 | HIPP0_API_KEY plaintext |
| `/etc/team-hippo/secrets.env` | root:teamhippo | 640 | ANTHROPIC_API_KEY + HIPP0_BASE_URL + HIPP0_API_KEY_FILE |
| `/var/backups/hipp0/pre-deploy-*.sql.gz` | hipp0:hipp0 | 640 | Pre-deployment Postgres dump |
| `/var/lib/hipp0/` | hipp0:hipp0 | 750 | Empty (failed Phase A SQLite path, cleaned up) |
| `/home/hipp0/hipp0/` | hipp0:hipp0 | 755 | Leftover from failed Phase A attempt, unused, harmless |
| `/root/integration/hipp0/` | root | 755 | Marketing branch clone, HEAD 142c724 |
| `/root/integration/hermes-agent/` | root | 755 | Hermes H1-H5 branch clone, HEAD 961480e4 |
| `/opt/nexus/` | root | 755 | Era-1 docker-compose dir, running stack |

## Deployment phases

### Completed
- **Phase 0a** — bootstrap-key fix patch (commit 142c724). Emits `[hipp0:BOOTSTRAP_API_KEY] project_id=... name="..." key=...` log line on first-boot bootstrap. Still valid for future fresh deploys but NOT on critical path for this deploy (we use the legacy HIPP0_API_KEY env var directly).
- **Phase 0b** — repo pull, dependency install, monorepo build, tests (165/166 pass; one pre-existing discovery-routes test failure unrelated to this patch).
- **Phase 0c** — cleanup of failed Phase A attempt (`hipp0.service` removed, `/var/lib/hipp0/hipp0.db` removed).
- **Phase 0d** — HIPP0_API_KEY + ANTHROPIC_API_KEY captured, pg_dump backup taken, auth verified against running docker image.

### Phase G — Memory fix (2026-04-12)
- **Phase G.1** — Created `user_facts` table in Postgres (project_id, agent_name, fact_key, fact_value, confidence, etc.)
- **Phase G.2** — Added `GET /api/hermes/captures` endpoint returning conversation_text for cross-session memory fallback
- **Phase G.3** — REPL (`hermes_cli/repl.py`) injects recent captures into system prompt as "Recent conversations" section
- **Phase G.4** — Distillery is now agent-aware: when `source=hermes`, uses `extractAgentItems()` which extracts decisions + user_facts + observations (3 categories instead of just decisions)
- **Phase G.5** — Capture pipeline auto-inserts extracted user_facts into `user_facts` table after distillery completes
- **Phase G.6** — Compile `MIN_SCORE` lowered from 0.50 to 0.15, now configurable via `HIPP0_COMPILE_MIN_SCORE` env var
- **Phase G.7** — Compile response includes `user_facts` array alongside decisions
- **Phase G.8** — Added `GET /api/hermes/extracted-facts` lightweight endpoint for querying distillery-extracted user_facts
- **Phase G.9** — REPL syncs user_facts from HIPP0 to `~/.hermes/agents/alice/USER.md` at startup with update-in-place markers
- **Phase G.10** — End-to-end cross-session memory verified: Alice remembers Nick's name, preferences, and priorities across sessions
- Current DB state: 114 decisions (111 original + 3 from test captures), 4 user_facts for alice, 15+ captures

### Pending
- **Phase H** — dashboard handoff. User opens `https://app.hipp0.ai/` in browser, verifies Alice appears in Hermes Agents view, the session from Phase G appears in conversations, the captured fact appears in user-facts.

## Critical gotchas discovered during diagnostic

1. **`/api/status` requires auth** on both era-1 and era-2 code. Use **`/api/health`** (public, listed in `PUBLIC_ROUTES`) for liveness/healthcheck probes. The original runbook's assumption that `/api/status` is public is wrong.

2. **`X-API-Key` header is NOT supported in era-2 code.** The marketing branch's `packages/server/src/middleware/index.ts:167-184` only reads `Authorization: Bearer`. The era-1 docker image supports both; the rebuild will remove `X-API-Key` support. All post-rebuild curls must use `Authorization: Bearer <KEY>`. The dashboard was migrated in commit `56316ea` to send Bearer from localStorage.

3. **HIPP0_API_KEY is 64-char hex, not h0_live_ format.** The `h0_live_*` format is for database-stored user API keys (auth flow steps 3-4); the env-var `HIPP0_API_KEY` is the step-5 legacy fallback compared verbatim via `safeEqual()` at `middleware/index.ts:218`.

4. **OpenClaw is NOT affected by HIPP0 server restart.** Different docker network, filesystem-integrated only. Zero downtime risk to OpenClaw.

5. **No active traffic on `:3100` during the deployment window.** Phase A' rebuild has effectively zero downtime impact on any external consumer.

6. **Pre-existing test failure** in `tests/discovery-routes.test.ts` (`POST /api/ingest/webhook > validates required fields` expects HTTP 400, gets HTTP 401 because auth fires first). **Not caused by Phase 0a patch** — verified by checking out parent commit 2088e71 and reproducing. Not a deploy blocker.

## How to resume if you are a new Claude Code instance

1. **Read this file first.** You should now have the full product thesis, era history, deployment status, and critical gotchas.
2. `git fetch origin && git log --oneline -10` on the marketing branch to see if anything has moved since this doc was last updated.
3. Check `~/.claude/` project session state if any exists.
4. For VPS context, SSH to `root@72.61.127.59` (if you have access) and read `/etc/team-hippo/api-key.txt` + `/var/backups/hipp0/` + `docker ps` to confirm the stack is still as described above.
5. **Do NOT touch `/opt/nexus/`, `hipp0-db` container, or the `nexus_nexus_pgdata` volume** without explicit user confirmation.
6. **Do NOT attempt Phase A'** without confirming the pg_dump backup exists at `/var/backups/hipp0/pre-deploy-*.sql.gz` and is >100 KB.
7. **Every curl to HIPP0 uses `Authorization: Bearer $(cat /etc/team-hippo/api-key.txt)`** — not X-API-Key, not Basic.
8. **Every healthcheck uses `/api/health`** — not `/api/status`.
9. If you need to run diagnostics on the VPS, the base64-encoded one-liner from the sandbox Claude's Phase 0d message is the safest paste format.

## Update policy

This file is updated after every phase completion. When you finish a phase, append a dated note under the phase entry and move it from "Pending" to "Completed". Commit the update as `docs(deployment): PROJECT_STATE Phase <X> complete` on the marketing branch.
