import React, { useState, useEffect, useCallback } from 'react';
import { AlertOctagon, CheckCircle, Eye, ArrowUp } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';

interface Violation {
  id: string;
  decision_title: string;
  violation_type: string;
  description: string;
  severity: string;
  evidence: string | null;
  agent_name: string | null;
  status: string;
  created_at: string;
}

const SEVERITY_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  critical: { border: '#DC2626', bg: '#FEE2E2', text: '#991B1B' },
  high: { border: '#D97706', bg: '#FEF3C7', text: '#92400E' },
  medium: { border: '#EAB308', bg: '#FEF9C3', text: '#854D0E' },
  low: { border: '#6B7280', bg: '#F3F4F6', text: '#374151' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function Violations() {
  const { get, patch } = useApi();
  const { projectId } = useProject();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [filter, setFilter] = useState<string>('open');
  const [loading, setLoading] = useState(true);

  const fetchViolations = useCallback(() => {
    if (projectId === 'default') return;
    setLoading(true);
    const path = filter
      ? `/api/projects/${projectId}/violations?status=${filter}`
      : `/api/projects/${projectId}/violations`;
    get<Violation[]>(path)
      .then(setViolations)
      .catch(() => setViolations([]))
      .finally(() => setLoading(false));
  }, [get, projectId, filter]);

  useEffect(() => { fetchViolations(); }, [fetchViolations]);

  const handleAction = async (id: string, status: string) => {
    try {
      await patch(`/api/violations/${id}`, { status, resolved_by: 'dashboard' });
      fetchViolations();
    } catch { /* ignore */ }
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Violations
        </h2>
        <div className="flex gap-1 rounded-lg p-0.5" style={{ background: 'var(--bg-secondary)' }}>
          {['open', 'acknowledged', 'resolved', ''].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="text-xs px-3 py-1.5 rounded-md transition-all font-medium"
              style={{
                background: filter === f ? 'var(--bg-card)' : 'transparent',
                color: filter === f ? 'var(--text-primary)' : 'var(--text-tertiary)',
                boxShadow: filter === f ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {f || 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: 'var(--bg-hover)' }} />
          ))}
        </div>
      ) : violations.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
          <CheckCircle size={32} className="mx-auto mb-3 opacity-40" style={{ color: 'var(--accent-success)' }} />
          <p className="text-sm">No {filter || ''} violations.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {violations.map((v) => {
            const sev = SEVERITY_COLORS[v.severity] || SEVERITY_COLORS.low;
            return (
              <div
                key={v.id}
                className="rounded-xl p-4"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-light)',
                  borderLeft: `4px solid ${sev.border}`,
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-2xs font-bold uppercase px-1.5 py-0.5 rounded"
                      style={{ background: sev.bg, color: sev.text }}
                    >
                      {v.severity}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {timeAgo(v.created_at)}
                    </span>
                    <span
                      className="text-2xs px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
                    >
                      {v.violation_type}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {v.status}
                  </span>
                </div>

                <p className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                  {v.description}
                </p>

                {v.evidence && (
                  <p
                    className="text-xs px-3 py-2 rounded mb-2 font-mono"
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                  >
                    {v.evidence}
                  </p>
                )}

                {v.agent_name && (
                  <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    Agent: {v.agent_name}
                  </p>
                )}

                {v.status === 'open' && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleAction(v.id, 'resolved')}
                      className="text-xs px-2.5 py-1 rounded font-medium text-white"
                      style={{ background: 'var(--accent-success)' }}
                    >
                      Resolve
                    </button>
                    <button
                      onClick={() => handleAction(v.id, 'acknowledged')}
                      className="text-xs px-2.5 py-1 rounded font-medium"
                      style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
                    >
                      Acknowledge
                    </button>
                    <button
                      onClick={() => handleAction(v.id, 'dismissed')}
                      className="text-xs px-2.5 py-1 rounded font-medium"
                      style={{ color: 'var(--text-tertiary)', border: '1px solid var(--border-light)' }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
