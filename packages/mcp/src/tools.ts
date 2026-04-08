/**
 * MCP Tool definitions and handlers for Hipp0.
 *
 * 6 tools:
 *   1. compile_context — get scored decisions for a task
 *   2. add_decision — record a new decision
 *   3. ask_decisions — natural language query
 *   4. search_decisions — filter by tag/agent/status
 *   5. get_contradictions — find conflicting decisions
 *   6. report_outcome — report task outcome for weight evolution
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Hipp0Client } from '../../sdk/src/index.js';
import type { Decision, Contradiction, CompileContextInput, WhatChangedResponse } from '../../sdk/src/types.js';

export interface ToolConfig {
  projectId: string;
}

export function registerAllTools(
  server: McpServer,
  client: Hipp0Client,
  config: ToolConfig,
): void {
  // ── Tool 1: compile_context ────────────────────────────────────────────

  server.registerTool(
    'compile_context',
    {
      title: 'Compile context for a task',
      description:
        'Get persona-specific, scored decisions relevant to a task. Returns ranked results with explanations.',
      inputSchema: {
        agent_name: z.string().describe('Agent requesting context (e.g., maks, counsel, pixel)'),
        task_description: z.string().describe('What the agent is working on'),
        project_id: z.string().optional().describe('Project ID (optional, uses default)'),
        task_session_id: z.string().optional().describe('Task session ID — includes session context from previous steps'),
        format: z.enum(['json', 'h0c', 'markdown']).optional().describe('Response format: json (default), h0c (compact), or markdown'),
      },
    },
    async (args) => {
      const pkg = await client.compileContext({
        agent_name: args.agent_name,
        project_id: args.project_id ?? config.projectId,
        task_description: args.task_description,
        task_session_id: args.task_session_id,
        ...(args.format ? { format: args.format } : {}),
      } as CompileContextInput & { task_session_id?: string; format?: string });

      return {
        content: [{
          type: 'text' as const,
          text: pkg.formatted_markdown ?? JSON.stringify({
            decisions_included: pkg.decisions_included,
            decisions_considered: pkg.decisions_considered,
            compilation_time_ms: pkg.compilation_time_ms,
          }, null, 2),
        }],
      };
    },
  );

  // ── Tool 2: add_decision ───────────────────────────────────────────────

  server.registerTool(
    'add_decision',
    {
      title: 'Record a new decision',
      description: 'Record a new decision from the current conversation',
      inputSchema: {
        title: z.string().describe('Short imperative title (e.g., "Use Stripe for billing")'),
        description: z.string().optional().describe('Why this decision was made'),
        tags: z.array(z.string()).optional().describe('Topic tags'),
        affects: z.array(z.string()).optional().describe('Agent names affected'),
        confidence: z.enum(['high', 'medium', 'low']).optional().describe('Confidence level'),
        temporal_scope: z.enum(['permanent', 'sprint', 'experiment']).optional().describe('Temporal scope: permanent (default), sprint (14-day), or experiment (7-day)'),
        project_id: z.string().optional().describe('Project ID'),
      },
    },
    async (args) => {
      const decision = await client.createDecision(
        args.project_id ?? config.projectId,
        {
          title: args.title,
          description: args.description ?? '',
          reasoning: '',
          made_by: 'mcp',
          source: 'manual',
          tags: args.tags ?? [],
          affects: args.affects ?? [],
          confidence: args.confidence ?? 'high',
          temporal_scope: args.temporal_scope ?? 'permanent',
        },
      );

      return {
        content: [{
          type: 'text' as const,
          text: `Decision recorded: "${decision.title}" (id: ${decision.id})`,
        }],
      };
    },
  );

  // ── Tool 3: ask_decisions ──────────────────────────────────────────────

  server.registerTool(
    'ask_decisions',
    {
      title: 'Ask about decisions',
      description:
        'Ask a natural language question about team decisions. Returns a synthesized answer with sources.',
      inputSchema: {
        question: z.string().describe('Question about decisions (e.g., "What did we decide about authentication?")'),
        project_id: z.string().optional().describe('Project ID'),
      },
    },
    async (args) => {
      const result = await client.ask(
        args.project_id ?? config.projectId,
        args.question,
      );

      let text = result.answer;
      if (result.sources?.length > 0) {
        text += '\n\nSources:\n' + result.sources
          .map((s) => `  - ${s.title} (relevance: ${s.score})`)
          .join('\n');
      }

      return {
        content: [{ type: 'text' as const, text }],
      };
    },
  );

  // ── Tool 4: search_decisions ───────────────────────────────────────────

  server.registerTool(
    'search_decisions',
    {
      title: 'Search decisions',
      description: 'Search and filter decisions by tag, agent, status, or text',
      inputSchema: {
        query: z.string().optional().describe('Search text'),
        tags: z.array(z.string()).optional().describe('Filter by tags'),
        agent: z.string().optional().describe('Filter by agent name'),
        status: z.enum(['active', 'superseded', 'reverted', 'pending']).optional().describe('Filter by status'),
        limit: z.number().optional().describe('Max results (default: 10)'),
        project_id: z.string().optional().describe('Project ID'),
      },
    },
    async (args) => {
      const pid = args.project_id ?? config.projectId;
      const limit = args.limit ?? 10;

      let decisions: Decision[];
      if (args.query) {
        decisions = await client.searchDecisions(pid, args.query, limit);
      } else {
        decisions = await client.listDecisions(pid, {
          status: args.status,
          limit,
        });
      }

      // Filter by tags/agent client-side if needed
      if (args.tags?.length) {
        const tagSet = new Set(args.tags);
        decisions = decisions.filter((d: Decision) =>
          (d.tags ?? []).some((t: string) => tagSet.has(t)),
        );
      }
      if (args.agent) {
        const agentName = args.agent;
        decisions = decisions.filter((d: Decision) =>
          (d.affects ?? []).includes(agentName) || d.made_by === agentName,
        );
      }

      const text = decisions.length === 0
        ? 'No decisions found matching your criteria.'
        : decisions.map((d: Decision) =>
            `- ${d.title} [${d.status}] (by ${d.made_by}, tags: ${(d.tags ?? []).join(', ')})`
          ).join('\n');

      return {
        content: [{ type: 'text' as const, text: `Found ${decisions.length} decisions:\n\n${text}` }],
      };
    },
  );

  // ── Tool 5: get_contradictions ─────────────────────────────────────────

  server.registerTool(
    'get_contradictions',
    {
      title: 'Get contradictions',
      description: 'Get decisions that contradict each other',
      inputSchema: {
        project_id: z.string().optional().describe('Project ID'),
        limit: z.number().optional().describe('Max results (default: 10)'),
      },
    },
    async (args) => {
      const pid = args.project_id ?? config.projectId;
      const contradictions = await client.getContradictions(pid);

      const limited = contradictions.slice(0, args.limit ?? 10);

      if (limited.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No contradictions found.' }],
        };
      }

      const text = limited.map((c: Contradiction) =>
        `- Decision ${c.decision_a_id.slice(0, 8)} vs ${c.decision_b_id.slice(0, 8)} — ${c.conflict_description ?? 'conflict detected'} [${c.status}]`
      ).join('\n');

      return {
        content: [{ type: 'text' as const, text: `Found ${limited.length} contradictions:\n\n${text}` }],
      };
    },
  );

  // ── Tool 6: report_outcome ────────────────────────────────────────────

  server.registerTool(
    'report_outcome',
    {
      title: 'Report task outcome',
      description:
        'Report the result of a task that used compiled context. Enables passive weight evolution via alignment tracking.',
      inputSchema: {
        compile_request_id: z.string().describe('The compile_request_id from a compile_context response'),
        task_completed: z.boolean().describe('Whether the task was completed successfully'),
        task_duration_ms: z.number().optional().describe('How long the task took in milliseconds'),
        agent_output: z.string().optional().describe('The agent output text (used for alignment analysis, not stored)'),
        error_message: z.string().optional().describe('Error message if the task failed'),
      },
    },
    async (args) => {
      const result = await client.reportOutcome({
        compile_request_id: args.compile_request_id,
        task_completed: args.task_completed,
        task_duration_ms: args.task_duration_ms,
        agent_output: args.agent_output,
        error_occurred: args.error_message ? true : undefined,
        error_message: args.error_message,
      });

      return {
        content: [{
          type: 'text' as const,
          text: [
            `Outcome recorded (id: ${result.id})`,
            `  Task completed: ${result.task_completed}`,
            `  Alignment score: ${(result.alignment_score * 100).toFixed(1)}%`,
            `  Decisions: ${result.decisions_referenced}/${result.decisions_compiled} referenced`,
          ].join('\n'),
        }],
      };
    },
  );

  // ── Tool 7: start_session ─────────────────────────────────────────

  server.registerTool(
    'start_session',
    {
      title: 'Start a task session',
      description:
        'Start a new multi-step task session. Returns a session_id to pass to compile_context and record_step.',
      inputSchema: {
        project_id: z.string().optional().describe('Project ID (optional, uses default)'),
        title: z.string().describe('Short title for the task session'),
        description: z.string().optional().describe('Detailed description of the task'),
      },
    },
    async (args) => {
      const result = await client.startSession({
        project_id: args.project_id ?? config.projectId,
        title: args.title,
        description: args.description,
      });

      return {
        content: [{
          type: 'text' as const,
          text: `Session started: "${result.title}" (session_id: ${result.session_id})\n\nPass this session_id to compile_context as task_session_id to include session context.`,
        }],
      };
    },
  );

  // ── Tool 8: record_step ──────────────────────────────────────────

  server.registerTool(
    'record_step',
    {
      title: 'Record a session step',
      description:
        'Record your work output as a step in a task session. The next agent will see your output summary.',
      inputSchema: {
        session_id: z.string().describe('Task session ID'),
        agent_name: z.string().describe('Your agent name'),
        agent_role: z.string().optional().describe('Your role in this task'),
        task_description: z.string().describe('What you were asked to do'),
        output: z.string().describe('Your work output'),
        decisions_created: z.array(z.string()).optional().describe('IDs of decisions created during this step'),
      },
    },
    async (args) => {
      const result = await client.recordStep(args.session_id, {
        agent_name: args.agent_name,
        agent_role: args.agent_role,
        task_description: args.task_description,
        output: args.output,
        decisions_created: args.decisions_created,
      });

      return {
        content: [{
          type: 'text' as const,
          text: `Step ${result.step_number} recorded (id: ${result.step_id})`,
        }],
      };
    },
  );

  // ── Tool 9: get_session ──────────────────────────────────────────

  server.registerTool(
    'get_session',
    {
      title: 'Get task session state',
      description:
        'Get the full state of a task session including all steps and their outputs.',
      inputSchema: {
        session_id: z.string().describe('Task session ID'),
      },
    },
    async (args) => {
      const rawState = (await client.getSessionState(args.session_id)) as unknown as Record<string, unknown>;
      const session = rawState.session as Record<string, unknown> ?? {};
      const steps = rawState.steps as Array<Record<string, unknown>> ?? [];

      const lines = [
        `Session: ${session.title ?? ''} [${session.status ?? ''}]`,
        `Steps: ${steps.length} | Agents: ${((session.agents_involved as string[]) ?? []).join(', ')}`,
        '',
      ];

      for (const step of steps) {
        lines.push(`Step ${step.step_number} — ${step.agent_name} [${step.status}]`);
        lines.push(`  Task: ${step.task_description}`);
        lines.push(`  Output: ${(step.output_summary ?? (step.output as string)?.slice(0, 200)) ?? '(none)'}`);
        lines.push('');
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );

  // ── Tool 10: score_team ────────────────────────────────────────────

  server.registerTool(
    'score_team',
    {
      title: 'Score team for a task',
      description:
        'Score all agents for a task and get participation recommendations. Shows who should participate, who should skip, and suggested roles.',
      inputSchema: {
        project_id: z.string().optional().describe('Project ID (optional, uses default)'),
        task_description: z.string().describe('Description of the task to score agents for'),
        session_id: z.string().optional().describe('Task session ID — factors in prior participation'),
      },
    },
    async (args) => {
      const result = await client.scoreTeam({
        projectId: args.project_id ?? config.projectId,
        taskDescription: args.task_description,
        sessionId: args.session_id,
      });

      const lines = [
        `Team Score for: "${result.task_description.slice(0, 80)}"`,
        `Optimal team size: ${result.optimal_team_size}`,
        '',
        `Recommended (${result.recommended_participants.length}):`,
      ];

      for (const p of result.recommended_participants) {
        lines.push(`  + ${p.agent_name} — ${p.role_suggestion} (relevance: ${(p.relevance_score * 100).toFixed(0)}%, rank: ${p.rank_among_agents})`);
      }

      if (result.recommended_skip.length > 0) {
        lines.push('');
        lines.push(`Skip (${result.recommended_skip.length}):`);
        for (const s of result.recommended_skip) {
          lines.push(`  - ${s.agent_name} — ${s.reason} (abstain: ${(s.abstain_probability * 100).toFixed(0)}%)`);
        }
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );

  // ── Tool 12: suggest_next (Super Brain Phase 3) ─────────────────────

  server.registerTool(
    'suggest_next',
    {
      title: 'Suggest next agent',
      description:
        'Get the recommended next agent for a task session. Returns who should go next, what they should do, and pre-loaded context. Zero LLM calls — pure scoring math.',
      inputSchema: {
        session_id: z.string().describe('Task session ID'),
      },
    },
    async (args) => {
      try {
        const suggestion = await client.suggestNextAgent(args.session_id);

        if (suggestion.is_session_complete) {
          return {
            content: [{
              type: 'text' as const,
              text: `Session complete: ${suggestion.completion_reason ?? 'No more relevant agents'}`,
            }],
          };
        }

        const lines = [
          `Next agent: ${suggestion.recommended_agent} (${suggestion.recommended_role})`,
          `Confidence: ${(suggestion.confidence * 100).toFixed(0)}%`,
          `Task: ${suggestion.task_suggestion}`,
          '',
          `Reasoning: ${suggestion.reasoning}`,
        ];

        if (suggestion.alternatives.length > 0) {
          lines.push('', 'Alternatives:');
          for (const alt of suggestion.alternatives) {
            lines.push(`  - ${alt.agent} (${alt.role}) — ${(alt.score * 100).toFixed(0)}%: ${alt.task_suggestion}`);
          }
        }

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        };
      }
    },
  );

  // ── Tool 13: session_plan (Super Brain Phase 3) ─────────────────────

  server.registerTool(
    'session_plan',
    {
      title: 'Get session plan',
      description:
        'Get a suggested multi-step plan for a task session. Shows the optimal agent sequence in workflow order (design → build → review → deploy).',
      inputSchema: {
        session_id: z.string().describe('Task session ID'),
      },
    },
    async (args) => {
      try {
        const plan = await client.getSessionPlan(args.session_id);

        const lines = [
          `Plan for: "${plan.session_title}"`,
          `Estimated agents: ${plan.estimated_agents}`,
          '',
        ];

        for (const step of plan.suggested_plan) {
          lines.push(`${step.step}. ${step.agent} (${step.role}) — relevance: ${(step.relevance * 100).toFixed(0)}%`);
          lines.push(`   Task: ${step.task}`);
        }

        lines.push('', plan.note);

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        };
      }
    },
  );

  // ── Tool 6: check_policy ───────────────────────────────────────────

  server.registerTool(
    'check_policy',
    {
      title: 'Check policy compliance',
      description: 'Check if a planned action violates any approved policies before executing',
      inputSchema: {
        project_id: z.string().optional().describe('Project ID'),
        agent_name: z.string().describe('Agent name to check policies for'),
        planned_action: z.string().describe('Description of the planned action to verify'),
      },
    },
    async (args) => {
      const pid = args.project_id ?? config.projectId;
      const result = await client.checkPolicy({
        projectId: pid,
        agentName: args.agent_name,
        plannedAction: args.planned_action,
      });

      if (result.compliant) {
        const advText = (result.advisories ?? []).length > 0
          ? `\n\nAdvisories:\n${(result.advisories as Array<{ policy_decision: string; note: string }>).map((a) => `- ${a.note}`).join('\n')}`
          : '';
        return {
          content: [{ type: 'text' as const, text: `Compliant — no policy violations detected.${advText}` }],
        };
      }

      const vText = (result.violations as Array<{ policy_decision: string; enforcement: string; explanation: string }>)
        .map((v) => `- [${v.enforcement.toUpperCase()}] ${v.policy_decision}: ${v.explanation}`)
        .join('\n');

      return {
        content: [{ type: 'text' as const, text: `Policy violations found:\n\n${vText}` }],

      };
    },
  );
  // ── Tool: follow_orchestrator ──────────────────────────────────────

  server.registerTool(
    'follow_orchestrator',
    {
      title: 'Follow the orchestrator suggestion',
      description:
        "Accept the Super Brain's recommendation for the current session. Records your acceptance and returns the pre-compiled context for the recommended next agent.",
      inputSchema: {
        session_id: z.string().describe('The active session ID'),
        your_agent_name: z.string().describe('Your agent name'),
      },
    },
    async (args) => {
      // 1. Get session state to find the suggestion
      const state = (await client.getSessionState(args.session_id)) as unknown as Record<string, unknown>;
      const stateSummary = typeof state === 'object' && state !== null ? (state as Record<string, unknown>).state_summary : '';
      let suggestion: Record<string, unknown> = {};
      try {
        if (typeof stateSummary === 'string' && stateSummary.startsWith('{')) {
          suggestion = JSON.parse(stateSummary) as Record<string, unknown>;
        }
      } catch { /* ignore */ }

      const recommendedAgent = (suggestion.recommended_agent as string) || args.your_agent_name;

      // 2. Accept suggestion
      try {
        await client.acceptSuggestion(args.session_id, {
          accepted_agent: recommendedAgent,
          override: false,
        });
      } catch { /* accept may not be required */ }

      // 3. Compile context for the recommended agent
      const compiled = await client.compileContext({
        agent_name: recommendedAgent,
        project_id: config.projectId,
        task_description: (suggestion.task_suggestion as string) || 'Continue the task',
      });

      return {
        content: [{
          type: 'text' as const,
          text: compiled.formatted_markdown ?? JSON.stringify({ decisions_included: compiled.decisions_included }, null, 2),
        }],
      };
    },
  );

  // ── Tool: override_orchestrator ────────────────────────────────────

  server.registerTool(
    'override_orchestrator',
    {
      title: 'Override the orchestrator suggestion',
      description:
        "Override the Super Brain's recommendation. You disagree with the suggested next agent and want a different agent to go next. Your reason is recorded so Hipp0 learns from the override.",
      inputSchema: {
        session_id: z.string().describe('The active session ID'),
        your_agent_name: z.string().describe('Your agent name'),
        override_to_agent: z.string().describe('Which agent should go next instead'),
        reason: z.string().describe('Why you disagree with the suggestion'),
      },
    },
    async (args) => {
      // 1. Accept with override
      try {
        await client.acceptSuggestion(args.session_id, {
          accepted_agent: args.override_to_agent,
          override: true,
          override_reason: args.reason,
        });
      } catch { /* accept may not be required */ }

      // 2. Compile context for the override agent
      const compiled = await client.compileContext({
        agent_name: args.override_to_agent,
        project_id: config.projectId,
        task_description: 'Continue the task (overridden by ' + args.your_agent_name + ')',
      });

      return {
        content: [{
          type: 'text' as const,
          text: compiled.formatted_markdown ?? JSON.stringify({ decisions_included: compiled.decisions_included }, null, 2),
        }],
      };
    },
  );

  // ── Tool: hipp0_what_changed ───────────────────────────────────────

  server.registerTool(
    'hipp0_what_changed',
    {
      title: 'What changed since a date',
      description:
        'Get a summary of all decision changes since a given date: new decisions, superseded, deprecated, and updated.',
      inputSchema: {
        since: z.string().describe('ISO date string (e.g., "2026-04-01")'),
        project_id: z.string().optional().describe('Project ID (optional, uses default)'),
      },
    },
    async (args) => {
      const pid = args.project_id ?? config.projectId;
      const changes = await client.getChanges(pid, args.since) as WhatChangedResponse;

      const lines = [
        `Changes since ${changes.period.from.slice(0, 10)}:`,
        changes.summary,
        '',
      ];

      if (changes.created.length > 0) {
        lines.push(`New decisions (${changes.created.length}):`);
        for (const d of changes.created.slice(0, 10)) {
          lines.push(`  + ${d.title} (by ${d.made_by}${d.domain ? `, ${d.domain}` : ''})`);
        }
        lines.push('');
      }

      if (changes.superseded.length > 0) {
        lines.push(`Superseded (${changes.superseded.length}):`);
        for (const d of changes.superseded.slice(0, 10)) {
          lines.push(`  ~ ${d.title} → ${d.superseded_by?.slice(0, 8) ?? 'unknown'}`);
        }
        lines.push('');
      }

      if (changes.deprecated.length > 0) {
        lines.push(`Deprecated (${changes.deprecated.length}):`);
        for (const d of changes.deprecated.slice(0, 10)) {
          lines.push(`  - ${d.title}`);
        }
        lines.push('');
      }

      if (changes.updated.length > 0) {
        lines.push(`Updated (${changes.updated.length}):`);
        for (const d of changes.updated.slice(0, 10)) {
          lines.push(`  * ${d.title}${d.fields_changed.length > 0 ? ` (${d.fields_changed.join(', ')})` : ''}`);
        }
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );

}
