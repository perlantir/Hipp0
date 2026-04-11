/**
 * HermesAgents view — browse the persistent Hermes agents registered
 * against the current project.
 *
 * Backed by the /api/hermes/* routes added in Phase 0. Reads:
 *
 *   GET /api/hermes/agents?project_id=<uuid>
 *   GET /api/hermes/agents/:name?project_id=<uuid>
 *
 * This view is intentionally read-only. Agents are registered by the Hermes
 * runtime via POST /api/hermes/register — this is the dashboard's window
 * into that data so a human can see which agents exist, what their SOUL.md
 * persona says, and which model/toolset they run on.
 */

import { useEffect, useState, useCallback } from 'react';
import { Users, Loader2, AlertTriangle, RefreshCw, Bot, Cpu, Wrench } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HermesAgentConfig {
  model: string;
  toolset?: string;
  platform_access?: string[];
  metadata?: Record<string, unknown>;
}

interface HermesAgentListItem {
  agent_id: string;
  agent_name: string;
  config: HermesAgentConfig | null;
  created_at: string;
  updated_at: string;
}

interface HermesAgentDetail extends HermesAgentListItem {
  soul: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function HermesAgents() {
  const { get } = useApi();
  const { projectId } = useProject();

  const [agents, setAgents] = useState<HermesAgentListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [detail, setDetail] = useState<HermesAgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const isValidProject = UUID_RE.test(projectId);

  const loadAgents = useCallback(() => {
    if (!isValidProject) {
      setAgents([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    get<HermesAgentListItem[]>(`/api/hermes/agents?project_id=${encodeURIComponent(projectId)}`)
      .then((data) => {
        setAgents(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) : 'Failed to load agents');
        setError(msg);
        setLoading(false);
      });
  }, [get, projectId, isValidProject]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const openAgent = useCallback(
    async (name: string) => {
      setSelectedName(name);
      setDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      try {
        const data = await get<HermesAgentDetail>(
          `/api/hermes/agents/${encodeURIComponent(name)}?project_id=${encodeURIComponent(projectId)}`,
        );
        setDetail(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) : 'Failed to load agent');
        setDetailError(msg);
      } finally {
        setDetailLoading(false);
      }
    },
    [get, projectId],
  );

  /* ---- Empty: no project selected ---------------------------------- */
  if (!isValidProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <Bot size={36} className="mx-auto mb-3 text-[var(--text-secondary)] opacity-60" />
          <p className="text-sm text-[var(--text-secondary)]">
            Select a project to browse its Hermes agents.
          </p>
        </div>
      </div>
    );
  }

  /* ---- Loading ----------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="text-sm text-[var(--text-secondary)]">Loading Hermes agents…</span>
        </div>
      </div>
    );
  }

  /* ---- Error ------------------------------------------------------- */
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="card p-6 max-w-md text-center" style={{ backgroundColor: 'var(--bg-card)' }}>
          <AlertTriangle size={24} className="mx-auto mb-2 text-status-reverted" />
          <p className="text-sm text-status-reverted mb-3">{error}</p>
          <button
            onClick={loadAgents}
            className="px-3 py-1.5 text-xs rounded-md bg-[#063ff9] text-white hover:bg-[#0534d4]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const rows = agents ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold mb-1 flex items-center gap-2">
              <Users size={18} className="text-primary" />
              Hermes Agents
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Persistent named agents running on the Hermes runtime. Each agent keeps its own SOUL.md
              persona and shares memory with the rest of the team through HIPP0.
            </p>
          </div>
          <button
            onClick={loadAgents}
            className="p-2 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className="text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Empty state */}
        {rows.length === 0 && (
          <div className="card p-10 text-center" style={{ backgroundColor: 'var(--bg-card)' }}>
            <Bot size={36} className="mx-auto mb-3 text-[var(--text-secondary)] opacity-60" />
            <p className="text-sm font-medium mb-1">No agents registered yet</p>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              Agents appear here after a Hermes runtime calls <code>POST /api/hermes/register</code>.
              See the Hermes integration docs to configure your first agent.
            </p>
          </div>
        )}

        {/* Grid layout: list + detail */}
        {rows.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* List */}
            <div className="lg:col-span-2 space-y-2">
              {rows.map((agent) => {
                const isActive = selectedName === agent.agent_name;
                return (
                  <button
                    key={agent.agent_id}
                    onClick={() => openAgent(agent.agent_name)}
                    className={`w-full text-left card p-4 hover:border-[#063ff9] transition-colors ${
                      isActive ? 'border-[#063ff9] ring-1 ring-[#063ff9]/40' : ''
                    }`}
                    style={{ backgroundColor: 'var(--bg-card)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{agent.agent_name}</div>
                        <div className="text-xs text-[var(--text-secondary)] mt-1 truncate flex items-center gap-1.5">
                          <Cpu size={12} />
                          {agent.config?.model ?? 'unknown model'}
                        </div>
                        {agent.config?.toolset && (
                          <div className="text-xs text-[var(--text-secondary)] mt-0.5 truncate flex items-center gap-1.5">
                            <Wrench size={12} />
                            {agent.config.toolset}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)] mt-2 opacity-70">
                      updated {formatTimestamp(agent.updated_at)}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detail */}
            <div className="lg:col-span-3">
              {!selectedName && (
                <div
                  className="card p-10 text-center h-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--bg-card)' }}
                >
                  <p className="text-sm text-[var(--text-secondary)]">
                    Select an agent to see its persona and configuration.
                  </p>
                </div>
              )}

              {selectedName && detailLoading && (
                <div className="card p-10 text-center" style={{ backgroundColor: 'var(--bg-card)' }}>
                  <Loader2 size={20} className="mx-auto animate-spin text-primary" />
                </div>
              )}

              {selectedName && detailError && (
                <div className="card p-6 text-center" style={{ backgroundColor: 'var(--bg-card)' }}>
                  <AlertTriangle size={20} className="mx-auto mb-2 text-status-reverted" />
                  <p className="text-sm text-status-reverted">{detailError}</p>
                </div>
              )}

              {selectedName && detail && !detailLoading && (
                <div className="card p-6 space-y-5" style={{ backgroundColor: 'var(--bg-card)' }}>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-base font-semibold">{detail.agent_name}</h2>
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] font-mono">
                      {detail.agent_id}
                    </div>
                  </div>

                  {/* Config */}
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                      Configuration
                    </div>
                    <dl className="text-xs space-y-1.5">
                      <div className="flex justify-between gap-3">
                        <dt className="text-[var(--text-secondary)]">Model</dt>
                        <dd className="font-mono text-right truncate">{detail.config?.model ?? '—'}</dd>
                      </div>
                      {detail.config?.toolset && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-[var(--text-secondary)]">Toolset</dt>
                          <dd className="font-mono text-right truncate">{detail.config.toolset}</dd>
                        </div>
                      )}
                      {detail.config?.platform_access && detail.config.platform_access.length > 0 && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-[var(--text-secondary)]">Platforms</dt>
                          <dd className="font-mono text-right truncate">
                            {detail.config.platform_access.join(', ')}
                          </dd>
                        </div>
                      )}
                      <div className="flex justify-between gap-3">
                        <dt className="text-[var(--text-secondary)]">Created</dt>
                        <dd className="text-right">{formatTimestamp(detail.created_at)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-[var(--text-secondary)]">Updated</dt>
                        <dd className="text-right">{formatTimestamp(detail.updated_at)}</dd>
                      </div>
                    </dl>
                  </div>

                  {/* SOUL.md */}
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                      SOUL.md
                    </div>
                    <pre
                      className="text-xs whitespace-pre-wrap font-mono p-3 rounded-md overflow-x-auto"
                      style={{
                        backgroundColor: 'var(--bg-code, rgba(0,0,0,0.2))',
                        maxHeight: '40vh',
                      }}
                    >
                      {detail.soul || '(empty)'}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
