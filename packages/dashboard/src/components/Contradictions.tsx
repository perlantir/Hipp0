import { useEffect, useState } from 'react';
import { AlertTriangle, Check, X, Loader2, ArrowRight, MessageSquare } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';
import type { Contradiction, Decision } from '../types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TabFilter = 'unresolved' | 'resolved' | 'dismissed';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Contradictions() {
  const { get, post, patch } = useApi();
  const { projectId } = useProject();

  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabFilter>('unresolved');

  // Resolve modal state
  const [resolving, setResolving] = useState<Contradiction | null>(null);
  const [keepDecision, setKeepDecision] = useState<'a' | 'b' | ''>('');
  const [resolution, setResolution] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    get<Contradiction[]>(`/api/projects/${projectId}/contradictions`)
      .then((data) => {
        if (!cancelled) {
          setContradictions(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load contradictions');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [get, projectId]);

  const filtered = contradictions.filter((c) => c.status === tab);

  const counts = {
    unresolved: contradictions.filter((c) => c.status === 'unresolved').length,
    resolved: contradictions.filter((c) => c.status === 'resolved').length,
    dismissed: contradictions.filter((c) => c.status === 'dismissed').length,
  };

  /* ---- Actions --------------------------------------------------- */

  async function handleDismiss(id: string) {
    try {
      await patch(`/api/projects/${projectId}/contradictions/${id}`, {
        status: 'dismissed',
      });
      setContradictions((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: 'dismissed' as const } : c)),
      );
    } catch {
      // Silently fail — could add toast here
    }
  }

  async function handleResolve() {
    if (!resolving || !keepDecision || !resolution) return;
    setSubmitting(true);
    try {
      await post(`/api/projects/${projectId}/contradictions/${resolving.id}/resolve`, {
        keep_decision: keepDecision === 'a' ? resolving.decision_a_id : resolving.decision_b_id,
        resolution,
      });
      setContradictions((prev) =>
        prev.map((c) =>
          c.id === resolving.id ? { ...c, status: 'resolved' as const, resolution } : c,
        ),
      );
      setResolving(null);
      setKeepDecision('');
      setResolution('');
    } catch {
      // Silently fail
    } finally {
      setSubmitting(false);
    }
  }

  /* ---- Decision card helper -------------------------------------- */

  function DecisionCard({
    decision,
    label,
    selected,
    onSelect,
  }: {
    decision?: Decision;
    label: string;
    selected?: boolean;
    onSelect?: () => void;
  }) {
    if (!decision) {
      return (
        <div className="card p-4 flex-1">
          <p className="text-xs text-nexus-text-muted-dark dark:text-nexus-text-muted-dark">
            {label} — decision data unavailable
          </p>
        </div>
      );
    }
    return (
      <div
        onClick={onSelect}
        className={`card p-4 flex-1 transition-all ${
          onSelect ? 'cursor-pointer hover:shadow-sm' : ''
        } ${selected ? 'ring-2 ring-primary' : ''}`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-2xs font-medium uppercase tracking-wider text-nexus-text-muted-dark dark:text-nexus-text-muted-dark">
            {label}
          </span>
          <span className={`badge badge-${decision.status}`}>{decision.status}</span>
        </div>
        <h4 className="text-sm font-semibold mb-1">{decision.title}</h4>
        <p className="text-xs text-nexus-text-muted-dark dark:text-nexus-text-muted-dark leading-relaxed line-clamp-3">
          {decision.description}
        </p>
        <p className="text-2xs text-nexus-text-faint-dark dark:text-nexus-text-faint-dark mt-2">
          by {decision.made_by} · {new Date(decision.made_at).toLocaleDateString()}
        </p>
      </div>
    );
  }

  /* ---- Loading / Error ------------------------------------------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="text-sm text-nexus-text-muted-dark">Loading contradictions…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="card p-6 max-w-md text-center">
          <p className="text-sm text-status-reverted">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold mb-1">Contradictions</h1>
          <p className="text-sm text-nexus-text-muted-dark dark:text-nexus-text-muted-dark">
            Conflicting decisions that need resolution
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-nexus-border-dark dark:border-nexus-border-dark">
          {(['unresolved', 'resolved', 'dismissed'] as TabFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-nexus-text-muted-dark dark:text-nexus-text-muted-dark hover:text-nexus-text-dark dark:hover:text-nexus-text-dark'
              }`}
            >
              {t}
              <span className="ml-1.5 text-xs opacity-60">({counts[t]})</span>
            </button>
          ))}
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <AlertTriangle
              size={28}
              className="mx-auto mb-2 text-nexus-text-faint-dark dark:text-nexus-text-faint-dark"
            />
            <p className="text-sm text-nexus-text-muted-dark dark:text-nexus-text-muted-dark">
              No {tab} contradictions
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {filtered.map((contradiction) => (
              <div key={contradiction.id} className="card p-5 animate-slide-up">
                {/* Side-by-side decisions */}
                <div className="flex gap-4 mb-4">
                  <DecisionCard decision={contradiction.decision_a} label="Decision A" />
                  <div className="flex items-center shrink-0">
                    <ArrowRight
                      size={16}
                      className="text-nexus-text-faint-dark dark:text-nexus-text-faint-dark rotate-90 sm:rotate-0"
                    />
                  </div>
                  <DecisionCard decision={contradiction.decision_b} label="Decision B" />
                </div>

                {/* Similarity score */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-nexus-text-muted-dark dark:text-nexus-text-muted-dark">
                      Similarity Score
                    </span>
                    <span className="font-medium">
                      {(contradiction.similarity_score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-nexus-border-dark dark:bg-nexus-border-dark overflow-hidden">
                    <div
                      className="h-full rounded-full bg-status-reverted transition-all duration-500"
                      style={{ width: `${contradiction.similarity_score * 100}%` }}
                    />
                  </div>
                </div>

                {/* Conflict description */}
                <div className="flex items-start gap-2 mb-4">
                  <MessageSquare
                    size={14}
                    className="shrink-0 mt-0.5 text-nexus-text-muted-dark dark:text-nexus-text-muted-dark"
                  />
                  <p className="text-sm leading-relaxed">{contradiction.conflict_description}</p>
                </div>

                {/* Resolution (if resolved) */}
                {contradiction.resolution && (
                  <div className="p-3 rounded-md bg-status-active/10 text-sm mb-4">
                    <span className="text-xs font-medium text-primary block mb-1">Resolution</span>
                    {contradiction.resolution}
                  </div>
                )}

                {/* Actions (unresolved only) */}
                {contradiction.status === 'unresolved' && (
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => {
                        setResolving(contradiction);
                        setKeepDecision('');
                        setResolution('');
                      }}
                      className="btn-primary text-xs"
                    >
                      <Check size={14} />
                      Resolve
                    </button>
                    <button
                      onClick={() => handleDismiss(contradiction.id)}
                      className="btn-secondary text-xs"
                    >
                      <X size={14} />
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolve modal */}
      {resolving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="card p-6 w-full max-w-lg mx-4 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Resolve Contradiction</h3>
              <button onClick={() => setResolving(null)} className="btn-ghost p-1">
                <X size={16} />
              </button>
            </div>

            <p className="text-sm text-nexus-text-muted-dark dark:text-nexus-text-muted-dark mb-4">
              Choose which decision to keep and explain the resolution.
            </p>

            {/* Pick decision */}
            <div className="flex gap-3 mb-4">
              <DecisionCard
                decision={resolving.decision_a}
                label="Decision A"
                selected={keepDecision === 'a'}
                onSelect={() => setKeepDecision('a')}
              />
              <DecisionCard
                decision={resolving.decision_b}
                label="Decision B"
                selected={keepDecision === 'b'}
                onSelect={() => setKeepDecision('b')}
              />
            </div>

            {/* Resolution text */}
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Describe the resolution rationale…"
              className="input min-h-[80px] resize-y mb-4"
              rows={3}
            />

            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => setResolving(null)} className="btn-secondary text-xs">
                Cancel
              </button>
              <button
                onClick={handleResolve}
                disabled={!keepDecision || !resolution || submitting}
                className="btn-primary text-xs"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Confirm Resolution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
