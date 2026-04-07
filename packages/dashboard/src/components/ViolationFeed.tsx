import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Shield, Loader2, Clock, Eye } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';

interface Violation {
  id: string;
  policy_id: string;
  project_id: string;
  agent_id: string | null;
  agent_name: string | null;
  outcome_id: string | null;
  violation_type: string;
  severity: string;
  evidence_snippet: string | null;
  explanation: string | null;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  block: { bg: 'rgba(220, 38, 38, 0.08)', text: '#DC2626', border: 'rgba(220, 38, 38, 0.2)' },
  warn: { bg: 'rgba(217, 119, 6, 0.08)', text: '#D97706', border: 'rgba(217, 119, 6, 0.2)' },
  advisory: { bg: 'rgba(59, 130, 246, 0.08)', text: '#3B82F6', border: 'rgba(59, 130, 246, 0.2)' },
};

export function ViolationFeed() {
  const { get, patch } = useApi();
  const { projectId } = useProject();

  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');

  const fetchViolations = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = filter === 'all' ? '' : `?resolved=${filter === 'resolved'}`;

    get<Violation[]>(`/api/projects/${projectId}/violations${params}`)
      .then((data) => {
        setViolations(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load violations');
        setLoading(false);
      });
  }, [get, projectId, filter]);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  const resolveViolation = async (id: string) => {
    try {
      await patch(`/api/violations/${id}/resolve`, { resolved_by: 'dashboard' });
      fetchViolations();
    } catch (err) {
      console.error('Failed to resolve violation:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={20} style={{ color: '#D97706' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Policy Violations
          </h2>
        </div>

        <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          {(['all', 'open', 'resolved'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 text-xs font-medium rounded-md transition-colors"
              style={{
                background: filter === f ? 'var(--bg-card)' : 'transparent',
                color: filter === f ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: filter === f ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="card p-8 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-4 text-center" style={{ color: 'var(--text-secondary)' }}>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && violations.length === 0 && (
        <div className="card p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
          <CheckCircle size={32} className="mx-auto mb-2" style={{ color: '#059669' }} />
          <p className="text-sm font-medium">No violations found</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {filter === 'open' ? 'All violations have been resolved' : 'No policy violations recorded'}
          </p>
        </div>
      )}

      {/* Violation list */}
      {!loading && !error && violations.length > 0 && (
        <div className="space-y-2">
          {violations.map((v) => {
            const style = SEVERITY_STYLES[v.severity] ?? SEVERITY_STYLES.warn;
            return (
              <div
                key={v.id}
                className="card p-4"
                style={{ borderLeft: `3px solid ${style.border}` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className="px-1.5 py-0.5 rounded text-xs font-medium uppercase"
                        style={{ background: style.bg, color: style.text }}
                      >
                        {v.severity}
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded text-xs"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                      >
                        {v.violation_type === 'llm_confirmed' ? 'LLM Confirmed' : 'Keyword Match'}
                      </span>
                      {v.agent_name && (
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          Agent: {v.agent_name}
                        </span>
                      )}
                    </div>

                    {v.explanation && (
                      <p className="text-sm mb-1.5" style={{ color: 'var(--text-primary)' }}>
                        {v.explanation}
                      </p>
                    )}

                    {v.evidence_snippet && (
                      <div
                        className="px-3 py-2 rounded-md text-xs font-mono mb-2"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                      >
                        {v.evidence_snippet}
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        <Clock size={11} />
                        {formatTime(v.created_at)}
                      </span>
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        <Eye size={11} />
                        Detected via: outcome analysis
                      </span>
                      {v.resolved && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: '#059669' }}>
                          <CheckCircle size={11} />
                          Resolved{v.resolved_by ? ` by ${v.resolved_by}` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {!v.resolved && (
                    <button
                      onClick={() => resolveViolation(v.id)}
                      className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0"
                      style={{
                        background: 'rgba(5, 150, 105, 0.1)',
                        color: '#059669',
                      }}
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
