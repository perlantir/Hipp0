import React, { useState, useEffect, useCallback } from 'react';
import { Shield, AlertTriangle, Info, Pencil, XCircle } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';

interface Policy {
  id: string;
  decision_id: string;
  decision_title: string;
  enforcement: string;
  approved_by: string;
  category: string;
  applies_to: string[] | string;
  violations_count: number;
  created_at: string;
}

const ENFORCEMENT_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  block: { label: 'BLOCK', color: '#DC2626', bg: '#FEE2E2', icon: <Shield size={14} /> },
  warn: { label: 'WARN', color: '#D97706', bg: '#FEF3C7', icon: <AlertTriangle size={14} /> },
  advisory: { label: 'ADVISORY', color: '#6B7280', bg: '#F3F4F6', icon: <Info size={14} /> },
};

function PolicyCard({ policy, onDeactivate }: { policy: Policy; onDeactivate: (id: string) => void }) {
  const cfg = ENFORCEMENT_CONFIG[policy.enforcement] || ENFORCEMENT_CONFIG.advisory;
  const violations = typeof policy.violations_count === 'number' ? policy.violations_count : parseInt(String(policy.violations_count) || '0', 10);

  let appliesTo: string[] = [];
  if (Array.isArray(policy.applies_to)) appliesTo = policy.applies_to;
  else if (typeof policy.applies_to === 'string') {
    try { appliesTo = JSON.parse(policy.applies_to); } catch { appliesTo = []; }
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        borderTop: `3px solid ${cfg.color}`,
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {policy.decision_title}
        </h4>
        <span
          className="text-2xs font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: cfg.bg, color: cfg.color }}
        >
          {cfg.label}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
        <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-secondary)' }}>
          {policy.category}
        </span>
        <span>Approved by {policy.approved_by}</span>
        <span>Applies to: {appliesTo.length === 0 ? 'all agents' : appliesTo.join(', ')}</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: violations > 0 ? '#DC2626' : 'var(--text-tertiary)' }}>
          {violations} violation{violations !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => onDeactivate(policy.id)}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
          >
            Deactivate
          </button>
        </div>
      </div>
    </div>
  );
}

export function Policies() {
  const { get, del } = useApi();
  const { projectId } = useProject();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPolicies = useCallback(() => {
    if (projectId === 'default') return;
    setLoading(true);
    get<Policy[]>(`/api/projects/${projectId}/policies`)
      .then(setPolicies)
      .catch(() => setPolicies([]))
      .finally(() => setLoading(false));
  }, [get, projectId]);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const handleDeactivate = async (id: string) => {
    try {
      await del(`/api/policies/${id}`);
      fetchPolicies();
    } catch { /* ignore */ }
  };

  const grouped = {
    block: policies.filter((p) => p.enforcement === 'block'),
    warn: policies.filter((p) => p.enforcement === 'warn'),
    advisory: policies.filter((p) => p.enforcement === 'advisory'),
  };

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Decision Policies</h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--bg-hover)' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Decision Policies ({policies.length})
        </h2>
      </div>

      {policies.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
          <Shield size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No policies defined yet.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Approve a decision as policy from the decision detail view.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {(['block', 'warn', 'advisory'] as const).map((level) => {
            const items = grouped[level];
            if (items.length === 0) return null;
            const cfg = ENFORCEMENT_CONFIG[level];
            return (
              <div key={level}>
                <h3
                  className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5"
                  style={{ color: cfg.color }}
                >
                  {cfg.icon} {cfg.label} ({items.length})
                </h3>
                <div className="space-y-3">
                  {items.map((p) => (
                    <PolicyCard key={p.id} policy={p} onDeactivate={handleDeactivate} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
