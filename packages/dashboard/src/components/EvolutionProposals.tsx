import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';
import {
  Loader2,
  Check,
  X,
  Zap,
  AlertTriangle,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Edit3,
  History,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface EvolutionProposal {
  id: string;
  project_id: string;
  trigger_type: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'accepted' | 'rejected' | 'overridden';
  affected_decision_ids: string[];
  reasoning: string;
  suggested_action: string;
  llm_explanation?: string;
  confidence: number;
  impact_score: number;
  resolved_by?: string;
  resolved_at?: string;
  resolution_notes?: string;
  scan_id?: string;
  created_at: string;
}

interface ScanResult {
  scan_id: string;
  proposals_generated: number;
  scan_duration_ms: number;
  mode: string;
}

interface ScanHistory {
  id: string;
  project_id: string;
  mode: string;
  proposals_generated: number;
  scan_duration_ms: number;
  created_at: string;
}

type EvolutionMode = 'rule' | 'llm' | 'hybrid';

/* ------------------------------------------------------------------ */
/*  Urgency helpers                                                    */
/* ------------------------------------------------------------------ */

const URGENCY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#6b7280',
  low: '#9ca3af',
};

const URGENCY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function UrgencyBadge({ urgency }: { urgency: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{
        backgroundColor: `${URGENCY_COLORS[urgency] ?? '#6b7280'}20`,
        color: URGENCY_COLORS[urgency] ?? '#6b7280',
        border: `1px solid ${URGENCY_COLORS[urgency] ?? '#6b7280'}40`,
      }}
    >
      {URGENCY_LABELS[urgency] ?? urgency}
    </span>
  );
}

function TriggerBadge({ trigger }: { trigger: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{
        backgroundColor: 'var(--bg-tertiary, #374151)',
        color: 'var(--text-secondary, #9ca3af)',
      }}
    >
      {trigger.replace(/_/g, ' ')}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Proposal Card                                                      */
/* ------------------------------------------------------------------ */

function ProposalCard({
  proposal,
  onAccept,
  onReject,
  onOverride,
}: {
  proposal: EvolutionProposal;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onOverride: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = URGENCY_COLORS[proposal.urgency] ?? '#6b7280';

  return (
    <div
      className="rounded-lg p-4 mb-3"
      style={{
        backgroundColor: 'var(--bg-secondary, #1f2937)',
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <TriggerBadge trigger={proposal.trigger_type} />
            <UrgencyBadge urgency={proposal.urgency} />
            <span className="text-xs" style={{ color: 'var(--text-muted, #6b7280)' }}>
              {(proposal.confidence * 100).toFixed(0)}% confidence
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted, #6b7280)' }}>
              Impact: {(proposal.impact_score * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-sm mb-2" style={{ color: 'var(--text-primary, #e5e7eb)' }}>
            {proposal.reasoning}
          </p>
          {proposal.suggested_action && (
            <p className="text-xs" style={{ color: 'var(--text-secondary, #9ca3af)' }}>
              Suggested: <span className="font-medium">{proposal.suggested_action.replace(/_/g, ' ')}</span>
            </p>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-2 p-1 rounded hover:bg-gray-700"
          style={{ color: 'var(--text-muted, #6b7280)' }}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border, #374151)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted, #6b7280)' }}>
            Affected decisions: {proposal.affected_decision_ids.length > 0 ? proposal.affected_decision_ids.map((id) => id.slice(0, 8)).join(', ') : 'None'}
          </p>
          {proposal.llm_explanation && (
            <p className="text-xs mb-2" style={{ color: 'var(--text-secondary, #9ca3af)' }}>
              LLM: {proposal.llm_explanation}
            </p>
          )}
        </div>
      )}

      {proposal.status === 'pending' && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onAccept(proposal.id)}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700"
          >
            <Check size={14} /> Accept
          </button>
          <button
            onClick={() => onReject(proposal.id)}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700"
          >
            <X size={14} /> Reject
          </button>
          <button
            onClick={() => onOverride(proposal.id)}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium"
            style={{
              backgroundColor: 'var(--bg-tertiary, #374151)',
              color: 'var(--text-secondary, #9ca3af)',
            }}
          >
            <Edit3 size={14} /> Override
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function EvolutionProposals() {
  const api = useApi();
  const { projectId } = useProject();

  const [tab, setTab] = useState<'proposals' | 'history'>('proposals');
  const [proposals, setProposals] = useState<EvolutionProposal[]>([]);
  const [history, setHistory] = useState<ScanHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState<EvolutionMode>('rule');
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);

  const fetchProposals = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await api.get<EvolutionProposal[]>(`/api/evolution/proposals?status=pending`);
      setProposals(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [api, projectId]);

  const fetchHistory = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<ScanHistory[]>(`/api/evolution/history?project_id=${projectId}`);
      setHistory(data);
    } catch {
      // ignore
    }
  }, [api, projectId]);

  useEffect(() => {
    fetchProposals();
    fetchHistory();
  }, [fetchProposals, fetchHistory]);

  const handleScan = async () => {
    if (!projectId) return;
    setScanning(true);
    try {
      const result = await api.post<ScanResult>('/api/evolution/scan', { project_id: projectId, mode });
      setLastScan(result);
      await fetchProposals();
      await fetchHistory();
    } catch {
      // ignore
    } finally {
      setScanning(false);
    }
  };

  const handleAccept = async (id: string) => {
    await api.post(`/api/evolution/proposals/${id}/accept`, {});
    setProposals((prev) => prev.filter((p) => p.id !== id));
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt('Rejection reason (optional):') ?? '';
    await api.post(`/api/evolution/proposals/${id}/reject`, { reason });
    setProposals((prev) => prev.filter((p) => p.id !== id));
  };

  const handleOverride = async (id: string) => {
    const overrideAction = window.prompt('Override action:');
    if (!overrideAction) return;
    const notes = window.prompt('Notes (optional):') ?? '';
    await api.post(`/api/evolution/proposals/${id}/override`, { override_action: overrideAction, notes });
    setProposals((prev) => prev.filter((p) => p.id !== id));
  };

  const criticalCount = proposals.filter((p) => p.urgency === 'critical').length;
  const highCount = proposals.filter((p) => p.urgency === 'high').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary, #f3f4f6)' }}>
            Evolution Engine
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-muted, #6b7280)' }}>
            Autonomous rule-based decision evolution
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border, #374151)' }}>
            {(['rule', 'llm', 'hybrid'] as EvolutionMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-3 py-1.5 text-xs font-medium capitalize"
                style={{
                  backgroundColor: mode === m ? 'var(--accent, #d97706)' : 'transparent',
                  color: mode === m ? '#fff' : 'var(--text-secondary, #9ca3af)',
                }}
              >
                {m}
              </button>
            ))}
          </div>
          {/* Scan button */}
          <button
            onClick={handleScan}
            disabled={scanning || !projectId}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#063ff9] text-white hover:bg-[#0534d4] disabled:opacity-50"
          >
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            Scan Now
          </button>
        </div>
      </div>

      {/* Last scan stats */}
      {lastScan && (
        <div
          className="flex items-center gap-4 p-3 rounded-lg text-xs"
          style={{ backgroundColor: 'var(--bg-secondary, #1f2937)', color: 'var(--text-secondary, #9ca3af)' }}
        >
          <span>{lastScan.proposals_generated} proposals</span>
          <span>{criticalCount} critical</span>
          <span>{highCount} high</span>
          <span>{lastScan.scan_duration_ms}ms</span>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-4" style={{ borderBottom: '1px solid var(--border, #374151)' }}>
        <button
          onClick={() => setTab('proposals')}
          className="flex items-center gap-1.5 pb-2 text-sm font-medium"
          style={{
            color: tab === 'proposals' ? 'var(--accent, #d97706)' : 'var(--text-muted, #6b7280)',
            borderBottom: tab === 'proposals' ? '2px solid var(--accent, #d97706)' : '2px solid transparent',
          }}
        >
          <AlertTriangle size={14} /> Proposals ({proposals.length})
        </button>
        <button
          onClick={() => setTab('history')}
          className="flex items-center gap-1.5 pb-2 text-sm font-medium"
          style={{
            color: tab === 'history' ? 'var(--accent, #d97706)' : 'var(--text-muted, #6b7280)',
            borderBottom: tab === 'history' ? '2px solid var(--accent, #d97706)' : '2px solid transparent',
          }}
        >
          <History size={14} /> History
        </button>
      </div>

      {/* Content */}
      {tab === 'proposals' && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin" size={24} style={{ color: 'var(--text-muted, #6b7280)' }} />
            </div>
          ) : proposals.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--text-muted, #6b7280)' }}>
              <RefreshCw size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No pending proposals. Run a scan to detect evolution opportunities.</p>
            </div>
          ) : (
            proposals.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                onAccept={handleAccept}
                onReject={handleReject}
                onOverride={handleOverride}
              />
            ))
          )}
        </div>
      )}

      {tab === 'history' && (
        <div>
          {history.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted, #6b7280)' }}>
              No scan history yet.
            </p>
          ) : (
            <table className="w-full text-sm" style={{ color: 'var(--text-secondary, #9ca3af)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border, #374151)' }}>
                  <th className="text-left py-2 font-medium">Date</th>
                  <th className="text-left py-2 font-medium">Mode</th>
                  <th className="text-right py-2 font-medium">Proposals</th>
                  <th className="text-right py-2 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {history.map((scan) => (
                  <tr key={scan.id} style={{ borderBottom: '1px solid var(--border, #374151)20' }}>
                    <td className="py-2 flex items-center gap-1.5">
                      <Clock size={12} />
                      {new Date(scan.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 capitalize">{scan.mode}</td>
                    <td className="py-2 text-right">{scan.proposals_generated}</td>
                    <td className="py-2 text-right">{scan.scan_duration_ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default EvolutionProposals;
