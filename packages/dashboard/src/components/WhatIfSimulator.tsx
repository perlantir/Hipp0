import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';
import {
  Loader2,
  Zap,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Minus,
  Check,
  Info,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DecisionSummary {
  id: string;
  title: string;
  description: string;
  tags: string[];
  affects: string[];
  status: string;
}

interface AgentImpact {
  agent_id: string;
  agent_name: string;
  agent_role: string;
  original_rank: number;
  proposed_rank: number;
  original_score: number;
  proposed_score: number;
  score_delta: number;
  rank_delta: number;
}

interface SimulationWarning {
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

interface SimulationResult {
  simulation_id: string;
  original_decision: DecisionSummary;
  proposed_decision: DecisionSummary;
  agent_impacts: AgentImpact[];
  summary: {
    total_agents: number;
    agents_affected: number;
    agents_improved: number;
    agents_degraded: number;
    agents_unchanged: number;
    newly_reached: string[];
    lost: string[];
  };
  warnings: SimulationWarning[];
  cascade_edges: Array<{ source_id: string; target_id: string; relationship: string }>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function severityStyle(severity: string): { bg: string; border: string; text: string } {
  switch (severity) {
    case 'critical': return { bg: 'rgba(239,68,68,0.1)', border: 'var(--accent-danger)', text: 'var(--accent-danger)' };
    case 'warning': return { bg: 'rgba(234,179,8,0.1)', border: '#EAB308', text: '#EAB308' };
    default: return { bg: 'rgba(59,130,246,0.1)', border: 'var(--accent-primary)', text: 'var(--accent-primary)' };
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function WhatIfSimulator() {
  const { projectId } = useProject();
  const { get, post } = useApi();

  const [decisions, setDecisions] = useState<DecisionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Proposed changes
  const [propTitle, setPropTitle] = useState('');
  const [propDescription, setPropDescription] = useState('');
  const [propTags, setPropTags] = useState('');
  const [propAffects, setPropAffects] = useState('');

  // Simulation state
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  /* ---- Fetch decisions -------------------------------------------- */
  useEffect(() => {
    if (projectId === 'default') return;
    let cancelled = false;
    setLoading(true);

    get<DecisionSummary[]>(`/api/projects/${projectId}/decisions`)
      .then((data) => {
        if (!cancelled) {
          const active = (data ?? []).filter((d) => d.status === 'active');
          setDecisions(active);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String((err as Record<string, unknown>)?.message ?? 'Failed to load decisions'));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [projectId, get]);

  /* ---- Select decision -------------------------------------------- */
  const handleSelect = (id: string) => {
    setSelectedId(id);
    setResult(null);
    setApplied(false);
    const dec = decisions.find((d) => d.id === id);
    if (dec) {
      setPropTitle(dec.title);
      setPropDescription(dec.description ?? '');
      setPropTags(Array.isArray(dec.tags) ? dec.tags.join(', ') : '');
      setPropAffects(Array.isArray(dec.affects) ? dec.affects.join(', ') : '');
    }
  };

  /* ---- Run simulation --------------------------------------------- */
  const runSimulation = async () => {
    if (!selectedId) return;
    setSimulating(true);
    setError(null);
    setResult(null);
    setApplied(false);

    const original = decisions.find((d) => d.id === selectedId);
    if (!original) return;

    const proposed_changes: Record<string, unknown> = {};
    if (propTitle !== original.title) proposed_changes.title = propTitle;
    if (propDescription !== (original.description ?? '')) proposed_changes.description = propDescription;
    const newTags = propTags.split(',').map((t) => t.trim()).filter(Boolean);
    const origTags = Array.isArray(original.tags) ? original.tags : [];
    if (JSON.stringify(newTags) !== JSON.stringify(origTags)) proposed_changes.tags = newTags;
    const newAffects = propAffects.split(',').map((a) => a.trim()).filter(Boolean);
    const origAffects = Array.isArray(original.affects) ? original.affects : [];
    if (JSON.stringify(newAffects) !== JSON.stringify(origAffects)) proposed_changes.affects = newAffects;

    if (Object.keys(proposed_changes).length === 0) {
      setError('No changes detected — modify at least one field');
      setSimulating(false);
      return;
    }

    try {
      const sim = await post<SimulationResult>('/api/simulation/preview', {
        decision_id: selectedId,
        proposed_changes,
        project_id: projectId,
      });
      setResult(sim);
    } catch (err) {
      setError(err instanceof Error ? err.message : String((err as Record<string, unknown>)?.message ?? 'Simulation failed'));
    } finally {
      setSimulating(false);
    }
  };

  /* ---- Apply change ----------------------------------------------- */
  const applyChange = async () => {
    if (!selectedId || !result) return;
    setApplying(true);
    setError(null);

    const original = decisions.find((d) => d.id === selectedId);
    if (!original) return;

    const proposed_changes: Record<string, unknown> = {};
    if (propTitle !== original.title) proposed_changes.title = propTitle;
    if (propDescription !== (original.description ?? '')) proposed_changes.description = propDescription;
    const newTags = propTags.split(',').map((t) => t.trim()).filter(Boolean);
    if (JSON.stringify(newTags) !== JSON.stringify(original.tags)) proposed_changes.tags = newTags;
    const newAffects = propAffects.split(',').map((a) => a.trim()).filter(Boolean);
    if (JSON.stringify(newAffects) !== JSON.stringify(original.affects)) proposed_changes.affects = newAffects;

    try {
      await post('/api/simulation/apply', {
        decision_id: selectedId,
        proposed_changes,
        project_id: projectId,
      });
      setApplied(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String((err as Record<string, unknown>)?.message ?? 'Apply failed'));
    } finally {
      setApplying(false);
    }
  };

  /* ---- Reset ------------------------------------------------------ */
  const handleReset = () => {
    const dec = decisions.find((d) => d.id === selectedId);
    if (dec) {
      setPropTitle(dec.title);
      setPropDescription(dec.description ?? '');
      setPropTags(Array.isArray(dec.tags) ? dec.tags.join(', ') : '');
      setPropAffects(Array.isArray(dec.affects) ? dec.affects.join(', ') : '');
    }
    setResult(null);
    setApplied(false);
    setError(null);
  };

  /* ---- Render ----------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ color: 'var(--text-secondary)' }}>
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading decisions...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.15)' }}>
          <Zap className="w-5 h-5" style={{ color: '#EAB308' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>What-If Simulator</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Preview how decision changes affect agent context rankings
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--accent-danger)', border: '1px solid var(--accent-danger)' }}>
          {error}
        </div>
      )}

      {/* Decision selector */}
      <div className="rounded-lg p-4 mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
          Select Decision
        </label>
        <select
          value={selectedId}
          onChange={(e) => handleSelect(e.target.value)}
          className="w-full p-2 rounded-md text-sm"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
        >
          <option value="">-- Choose a decision --</option>
          {decisions.map((d) => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </select>
      </div>

      {/* Empty state */}
      {!selectedId && (
        <div className="text-center py-16" style={{ color: 'var(--text-tertiary)' }}>
          <Zap className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium mb-2">Select a decision and modify it to preview the impact on agent context packages.</p>
        </div>
      )}

      {/* Edit fields */}
      {selectedId && (
        <>
          <div className="rounded-lg p-4 mb-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Proposed Changes</h3>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Title</label>
              <input
                type="text"
                value={propTitle}
                onChange={(e) => setPropTitle(e.target.value)}
                className="w-full p-2 rounded-md text-sm"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
              />
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Description</label>
              <textarea
                value={propDescription}
                onChange={(e) => setPropDescription(e.target.value)}
                rows={3}
                className="w-full p-2 rounded-md text-sm"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
              />
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Tags (comma-separated)</label>
              <input
                type="text"
                value={propTags}
                onChange={(e) => setPropTags(e.target.value)}
                className="w-full p-2 rounded-md text-sm"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
              />
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Affects (comma-separated)</label>
              <input
                type="text"
                value={propAffects}
                onChange={(e) => setPropAffects(e.target.value)}
                className="w-full p-2 rounded-md text-sm"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={runSimulation}
                disabled={simulating}
                className="px-4 py-2 rounded-md text-sm font-medium text-white flex items-center gap-2"
                style={{ background: simulating ? '#6B7280' : '#D97706' }}
              >
                {simulating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {simulating ? 'Simulating...' : 'Run Simulation'}
              </button>

              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </button>
            </div>
          </div>

          {/* Results */}
          {result && (
            <div className="space-y-4">
              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="space-y-2">
                  {result.warnings.map((w, i) => {
                    const style = severityStyle(w.severity);
                    return (
                      <div
                        key={i}
                        className="p-3 rounded-lg text-sm flex items-start gap-2"
                        style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.text }}
                      >
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{w.message}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryCard label="Total Agents" value={result.summary.total_agents} />
                <SummaryCard label="Affected" value={result.summary.agents_affected} color="#EAB308" />
                <SummaryCard label="Improved" value={result.summary.agents_improved} color="#22C55E" />
                <SummaryCard label="Degraded" value={result.summary.agents_degraded} color="#EF4444" />
              </div>

              {/* Newly reached / lost */}
              {(result.summary.newly_reached.length > 0 || result.summary.lost.length > 0) && (
                <div className="flex gap-4 text-sm">
                  {result.summary.newly_reached.length > 0 && (
                    <div className="flex items-center gap-1" style={{ color: '#22C55E' }}>
                      <ArrowUp className="w-4 h-4" />
                      Newly reached: {result.summary.newly_reached.join(', ')}
                    </div>
                  )}
                  {result.summary.lost.length > 0 && (
                    <div className="flex items-center gap-1" style={{ color: '#EF4444' }}>
                      <ArrowDown className="w-4 h-4" />
                      Lost: {result.summary.lost.join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* Agent impact table */}
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-light)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Agent</th>
                      <th className="text-center px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Now (rank)</th>
                      <th className="text-center px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Proposed (rank)</th>
                      <th className="text-center px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Score Delta</th>
                      <th className="text-center px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.agent_impacts.map((impact) => (
                      <tr key={impact.agent_id} style={{ borderTop: '1px solid var(--border-light)' }}>
                        <td className="px-4 py-2" style={{ color: 'var(--text-primary)' }}>
                          <div className="font-medium">{impact.agent_name}</div>
                          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{impact.agent_role}</div>
                        </td>
                        <td className="text-center px-4 py-2" style={{ color: 'var(--text-secondary)' }}>
                          #{impact.original_rank} ({impact.original_score.toFixed(3)})
                        </td>
                        <td className="text-center px-4 py-2" style={{ color: 'var(--text-secondary)' }}>
                          #{impact.proposed_rank} ({impact.proposed_score.toFixed(3)})
                        </td>
                        <td className="text-center px-4 py-2 font-mono">
                          <span style={{ color: impact.score_delta > 0 ? '#22C55E' : impact.score_delta < 0 ? '#EF4444' : 'var(--text-tertiary)' }}>
                            {impact.score_delta > 0 ? '+' : ''}{impact.score_delta.toFixed(3)}
                          </span>
                        </td>
                        <td className="text-center px-4 py-2">
                          {impact.rank_delta > 0 && <ArrowUp className="w-4 h-4 mx-auto" style={{ color: '#22C55E' }} />}
                          {impact.rank_delta < 0 && <ArrowDown className="w-4 h-4 mx-auto" style={{ color: '#EF4444' }} />}
                          {impact.rank_delta === 0 && <Minus className="w-4 h-4 mx-auto" style={{ color: 'var(--text-tertiary)' }} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cascade info */}
              {result.cascade_edges.length > 0 && (
                <div className="p-3 rounded-lg text-sm flex items-start gap-2" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)' }}>
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{result.cascade_edges.length} connected edge(s) may be affected by this change.</span>
                </div>
              )}

              {/* Apply button */}
              <div className="flex gap-2">
                {!applied ? (
                  <button
                    onClick={applyChange}
                    disabled={applying}
                    className="px-4 py-2 rounded-md text-sm font-medium text-white flex items-center gap-2"
                    style={{ background: applying ? '#6B7280' : '#22C55E' }}
                  >
                    {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {applying ? 'Applying...' : 'Apply This Change'}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium" style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid #22C55E' }}>
                    <Check className="w-4 h-4" />
                    Change applied successfully
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary Card                                                       */
/* ------------------------------------------------------------------ */

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
      <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color: color ?? 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}
