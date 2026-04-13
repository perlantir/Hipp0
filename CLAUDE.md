# CLAUDE.md

Behavioral guidelines for working in the HIPP0 codebase. Read fully before every task.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

-----

## 1. Think Before Coding

**Don’t assume. Don’t hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don’t pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what’s confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No “flexibility” or “configurability” that wasn’t requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: “Would a senior engineer say this is overcomplicated?” If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don’t “improve” adjacent code, comments, or formatting.
- Don’t refactor things that aren’t broken.
- Match existing style, even if you’d do it differently.
- If you notice unrelated dead code, mention it — don’t delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don’t remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user’s request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- “Add validation” → “Write tests for invalid inputs, then make them pass”
- “Fix the bug” → “Write a test that reproduces it, then make it pass”
- “Refactor X” → “Ensure tests pass before and after”

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria (“make it work”) require constant clarification.

-----

## 5. HIPP0 Project Context

### What This Is

HIPP0 is an AI decision memory system for multi-agent teams. It captures, stores, scores, and retrieves decisions. Published as `@hipp0/cli`, `@hipp0/mcp`, `@hipp0/sdk` (npm) and `hipp0-memory` (PyPI). Licensed Apache 2.0.

### Architecture

- **Runtime:** Docker Compose on Hostinger VPS (`72.61.127.59`)
- **Repo path on VPS:** `/opt/nexus`
- **GitHub:** `perlantir/Hipp0`
- **Docker service name:** `server` (NOT `hipp0-server`)
- **Container:** `openclaw-okny-openclaw-1`
- **Database:** Postgres — `POSTGRES_USER=hipp0`, `POSTGRES_PASSWORD=hipp0_dev`
- **Ports:** 3100 (API), 3200 (dashboard)
- **Embeddings:** OpenAI `text-embedding-3-small`
- **Auth:** Disabled (dev mode)
- **Website:** Separate repo (`perlantir/hipp0-website`) on Vercel at `hipp0.ai`

### Scoring System

5 signals: `directAffect` (0.30), `tagMatch` (0.20), `personaMatch` (0.25), `semanticSimilarity` (0.25), plus `trust_multiplier` (0.7–1.15) and `outcome_multiplier`. 21 MCP tools total.

### Key Features (Shipped)

Outcome Intelligence, Trust-Aware Memory, Autonomous Memory Capture, Adaptive Agent Learning, Execution Governance.

### Deploy Command

```bash
git fetch origin main && git reset --hard origin/main && docker compose build server && docker compose up -d
```

### Test Suite

- UAT suite v3: 180 tests across 9 Playwright files (54 pass / 10 fail / 16 skip)
- V4 spec: 350 tests, 23 files — defined in `HIPP0-QA-FULL-SUITE-V4.md`
- SQLite path is broken; Docker/Postgres path works
- **Always run tests before declaring a task complete**

### Known Issues & Pending Work

- Dashboard Docker build broken (vite/pnpm issue)
- README has stale “not yet published” warnings
- Roadmap needs update
- VPS credentials need rotation (Anthropic API key, Telegram bot tokens, Slack token, Brave API key)
- GitHub Release v0.1.0 not yet cut
- OOM fix pending: `NODE_OPTIONS=--max-old-space-size=4096`

-----

## 6. Workflow Rules

### Communication Style

- Be direct, decisive, technically specific.
- No unnecessary questions — if you can infer it, do it.
- Deliver actionable outputs, not theory.
- When delivering files, provide the full updated file — don’t ask Nick to make manual edits.

### Before You Start

1. Read this file completely.
1. Understand which part of the system you’re touching.
1. State your plan with verifiable steps.
1. If touching Docker, DB, or deploy config — say so explicitly before proceeding.

### Before You Finish

1. Run the relevant tests. If tests don’t exist for your change, note that.
1. Verify the Docker build still works if you touched server code.
1. Confirm no new linting errors or import breakage.
1. Summarize what changed and what to verify manually.

### Never Do

- Push directly to main without explicit approval.
- Modify `.env` files without stating exactly what changed.
- Delete or overwrite DB data without confirmation.
- Refactor code outside the scope of the current task.
- Assume a service is running — check first.

-----

**These guidelines are working if:** diffs are tight, tests pass before and after, deploy commands succeed on first try, and clarifying questions come before implementation — not after mistakes.
