import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';
import {
  Loader2,
  Check,
  X,
  Zap,
  AlertTriangle,
  Clock,
  ArrowRight,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface EvolutionProposal {
  id: string;
  project_id: string;
  original_decision_id: string;
  original: {
    title: string;
    description: string;
    reasoning: string;
    tags: string[];
    affects: string[];
    status: string;
  };
  proposed: {
    title: string;
    description: string;
    reasoning: string;
    tags: string[];
    affects: string[];
  };
  trigger_reason: string;
  trigger_data: Record<string, unknown>;
  predicted_impact: {
    alignment_improvement_estimate: number;
    contradictions_resolved: number;
    agents_newly_affected: string[];
    risk_level: 'low' | 'medium' | 'high';
    confidence: 'high' | 'medium' | 'low';
  };
  simulation_ran: boolean;
  simulation_results: {
    compiles_analyzed: number;
    avg_score_improvement: number;
    rank_changes: Array<{ agent: string; old_rank: number; new_rank: number }>;
    affected_agents: string[];
  };
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  new_decision_id: string | null;
  created_at: string;
  expires_at: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const TRIGGER_LABELS: Record<string, string> = {
  low_alignment: 'Low Alignment',
  frequently_contradicted: 'Frequently Contradicted',
  frequently_superseded: 'Frequently Superseded',
  stale: 'Stale Decision',
  low_outcome_success: 'Low Outcome Success',
  manual_request: 'Manual Request',
};

const TRIGGER_PRIORITY: Record<string, number> = {
  frequently_contradicted: 0,
  low_alignment: 1,
  frequently_superseded: 2,
  low_outcome_success: 3,
  stale: 4,
  manual_request: 5,
};

function riskColor(risk: string): string {
  switch (risk) {
    case 'high': return 'text-red-400';
    case 'medium': return 'text-yellow-400';
    default: return 'text-green-400';
  }
}

function confidenceColor(conf: string): string {
  switch (conf) {
    case 'high': return 'text-green-400';
    case 'medium': return 'text-yellow-400';
    default: return 'text-red-400';
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type TabFilter = 'proposed' | 'approved' | 'rejected' | 'expired';

export function EvolutionProposals() {
  const { projectId } = useProject();
  const { get, post } = useApi();

  const [proposals, setProposals] = useState<EvolutionProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabFilter>('proposed');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  /* ---- Fetch proposals ------------------------------------------- */
  useEffect(() => {
    if (projectId === 'default') return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    get<EvolutionProposal[]>(`/api/projects/${projectId}/evolution-proposals?status=${tab}`)
      .then((data) => {
        if (!cancelled) {
          // Sort by trigger priority (higher severity first)
          const sorted = (data ?? []).sort(
            (a, b) =>
              (TRIGGER_PRIORITY[a.trigger_reason] ?? 99) -
              (TRIGGER_PRIORITY[b.trigger_reason] ?? 99),
          );
          setProposals(sorted);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String((err as Record<string, unknown>)?.message ?? 'Failed to load proposals');
          setError(msg);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [projectId, tab, get]);

  /* ---- Actions --------------------------------------------------- */
  const handleApprove = async (id: string) => {
    setSubmitting(id);
    try {
      await post(`/api/evolution/${id}/approve`, {
        review_notes: reviewNotes,
        reviewed_by: 'dashboard',
      });
      setProposals((prev) => prev.filter((p) => p.id !== id));
      setReviewNotes('');
      setExpandedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve proposal');
    } finally {
      setSubmitting(null);
    }
  };

  const handleReject = async (id: string) => {
    setSubmitting(id);
    try {
      await post(`/api/evolution/${id}/reject`, {
        review_notes: reviewNotes,
        reviewed_by: 'dashboard',
      });
      setProposals((prev) => prev.filter((p) => p.id !== id));
      setReviewNotes('');
      setExpandedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject proposal');
    } finally {
      setSubmitting(null);
    }
  };

  const handleTriggerScan = async () => {
    setTriggering(true);
    try {
      await post<{ candidates_found: number; proposals_created: number }>(
        `/api/projects/${projectId}/evolution/trigger`,
        {},
      );
      // Refresh the list
      const data = await get<EvolutionProposal[]>(
        `/api/projects/${projectId}/evolution-proposals?status=proposed`,
      );
      setProposals(
        (data ?? []).sort(
          (a, b) =>
            (TRIGGER_PRIORITY[a.trigger_reason] ?? 99) -
            (TRIGGER_PRIORITY[b.trigger_reason] ?? 99),
        ),
      );
      setTab('proposed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String((err as Record<string, unknown>)?.message ?? 'Failed to trigger scan');
      setError(msg);
    } finally {
      setTriggering(false);
    }
  };

  /* ---- Loading / Error ------------------------------------------- */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="card p-6 max-w-md text-center">
          <p className="text-sm" style={{ color: 'var(--accent-danger)' }}>{error}</p>
          <button
            className="btn-secondary text-xs mt-3"
            onClick={() => { setError(null); setLoading(true); }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  /* ---- Render ----------------------------------------------------- */
  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Decision Evolution
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            AI-generated improvement proposals for underperforming decisions
          </p>
        </div>
        <button
          className="btn-primary text-xs flex items-center gap-1.5"
          onClick={handleTriggerScan}
          disabled={triggering}
        >
          {triggering ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Scan Now
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b mb-6" style={{ borderColor: 'var(--border-primary)' }}>
        {(['proposed', 'approved', 'rejected', 'expired'] as TabFilter[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? 'border-[var(--accent-primary)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {proposals.length === 0 && (
        <div className="card p-8 text-center">
          <Zap size={32} className="mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {tab === 'proposed'
              ? 'No evolution proposals. Hipp0 analyzes decisions daily and proposes improvements when it detects underperformance.'
              : `No ${tab} proposals.`}
          </p>
        </div>
      )}

      {/* Proposal cards */}
      <div className="space-y-4">
        {proposals.map((p) => {
          const isExpanded = expandedId === p.id;
          return (
            <div key={p.id} className="card p-5">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: 'var(--accent-primary)',
                        color: '#fff',
                        opacity: 0.9,
                      }}
                    >
                      {TRIGGER_LABELS[p.trigger_reason] ?? p.trigger_reason}
                    </span>
                    <span className={`text-xs font-medium ${riskColor(p.predicted_impact.risk_level)}`}>
                      {p.predicted_impact.risk_level} risk
                    </span>
                    <span className={`text-xs ${confidenceColor(p.predicted_impact.confidence)}`}>
                      {p.predicted_impact.confidence} confidence
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {p.original.title}
                  </h3>
                </div>
                <button
                  className="btn-ghost text-xs flex items-center gap-1 shrink-0"
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                >
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {isExpanded ? 'Less' : 'Details'}
                </button>
              </div>

              {/* Side-by-side comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                {/* Original */}
                <div
                  className="p-3 rounded-lg border"
                  style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
                >
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
                    ORIGINAL
                  </div>
                  <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    {p.original.title}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {p.original.description}
                  </p>
                </div>

                {/* Proposed */}
                <div
                  className="p-3 rounded-lg border"
                  style={{ borderColor: 'var(--accent-primary)', background: 'rgba(217, 119, 6, 0.05)' }}
                >
                  <div className="flex items-center gap-1 text-xs font-medium mb-1" style={{ color: 'var(--accent-primary)' }}>
                    <ArrowRight size={12} /> PROPOSED
                  </div>
                  <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    {p.proposed.title}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {p.proposed.description}
                  </p>
                </div>
              </div>

              {/* Predicted impact summary */}
              <div className="flex flex-wrap gap-3 text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                {p.predicted_impact.alignment_improvement_estimate > 0 && (
                  <span className="flex items-center gap-1">
                    <Zap size={12} className="text-green-400" />
                    +{(p.predicted_impact.alignment_improvement_estimate * 100).toFixed(0)}% alignment
                  </span>
                )}
                {p.predicted_impact.contradictions_resolved > 0 && (
                  <span className="flex items-center gap-1">
                    <AlertTriangle size={12} className="text-yellow-400" />
                    {p.predicted_impact.contradictions_resolved} contradiction{p.predicted_impact.contradictions_resolved > 1 ? 's' : ''} resolved
                  </span>
                )}
                {p.simulation_ran && p.simulation_results?.compiles_analyzed > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {p.simulation_results.compiles_analyzed} compiles analyzed
                  </span>
                )}
                {p.simulation_ran && p.simulation_results?.avg_score_improvement > 0 && (
                  <span className="flex items-center gap-1">
                    <Zap size={12} className="text-blue-400" />
                    +{(p.simulation_results.avg_score_improvement * 100).toFixed(1)}% avg score
                  </span>
                )}
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t pt-3 mt-3 space-y-3" style={{ borderColor: 'var(--border-primary)' }}>
                  {/* Reasoning */}
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
                      PROPOSED REASONING
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {p.proposed.reasoning}
                    </p>
                  </div>

                  {/* Tags / Affects */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>TAGS</div>
                      <div className="flex flex-wrap gap-1">
                        {(p.proposed.tags ?? []).map((tag) => (
                          <span key={tag} className="tag-pill">{tag}</span>
                        ))}
                        {(!p.proposed.tags || p.proposed.tags.length === 0) && (
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>None</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>AFFECTS</div>
                      <div className="flex flex-wrap gap-1">
                        {(p.proposed.affects ?? []).map((a) => (
                          <span key={a} className="tag-pill">{a}</span>
                        ))}
                        {(!p.proposed.affects || p.proposed.affects.length === 0) && (
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>None</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Trigger data */}
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>TRIGGER DATA</div>
                    <pre className="text-xs p-2 rounded" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                      {JSON.stringify(p.trigger_data, null, 2)}
                    </pre>
                  </div>

                  {/* Simulation rank changes */}
                  {p.simulation_ran && p.simulation_results?.rank_changes?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
                        RANK CHANGES
                      </div>
                      <div className="space-y-1">
                        {p.simulation_results.rank_changes.map((rc) => (
                          <div key={rc.agent} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {rc.agent}: #{rc.old_rank} → #{rc.new_rank}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Review notes input + action buttons (only for proposed) */}
                  {tab === 'proposed' && (
                    <div className="space-y-2">
                      <textarea
                        className="input w-full text-xs"
                        rows={2}
                        placeholder="Review notes (optional)..."
                        value={expandedId === p.id ? reviewNotes : ''}
                        onChange={(e) => setReviewNotes(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          className="btn-primary text-xs flex items-center gap-1"
                          onClick={() => handleApprove(p.id)}
                          disabled={submitting === p.id}
                        >
                          {submitting === p.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          Approve & Apply
                        </button>
                        <button
                          className="btn-secondary text-xs flex items-center gap-1"
                          onClick={() => handleReject(p.id)}
                          disabled={submitting === p.id}
                        >
                          <X size={12} />
                          Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Review info for non-proposed */}
                  {tab !== 'proposed' && p.reviewed_by && (
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      Reviewed by {p.reviewed_by} on{' '}
                      {p.reviewed_at ? new Date(p.reviewed_at).toLocaleDateString() : 'N/A'}
                      {p.review_notes && <span> — {p.review_notes}</span>}
                    </div>
                  )}
                </div>
              )}

              {/* Quick action buttons when not expanded (proposed only) */}
              {!isExpanded && tab === 'proposed' && (
                <div className="flex gap-2 mt-2">
                  <button
                    className="btn-primary text-xs flex items-center gap-1"
                    onClick={() => handleApprove(p.id)}
                    disabled={submitting === p.id}
                  >
                    {submitting === p.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Check size={12} />
                    )}
                    Approve
                  </button>
                  <button
                    className="btn-secondary text-xs flex items-center gap-1"
                    onClick={() => handleReject(p.id)}
                    disabled={submitting === p.id}
                  >
                    <X size={12} />
                    Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
