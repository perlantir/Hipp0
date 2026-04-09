import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, AlertTriangle, AlertOctagon, Info, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';

interface Finding {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string;
  data: Record<string, unknown>;
}

interface DigestSummary {
  period: string;
  findings_count: number;
  critical: number;
  warnings: number;
  overall_health: 'good' | 'fair' | 'needs_attention';
}

interface Digest {
  id: string;
  findings: Finding[];
  summary: DigestSummary;
  generated_at: string;
}

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  critical: <AlertOctagon size={14} style={{ color: '#DC2626' }} />,
  warning: <AlertTriangle size={14} style={{ color: '#D97706' }} />,
  info: <Info size={14} style={{ color: '#6B8AE5' }} />,
};

const SEVERITY_BORDER: Record<string, string> = {
  critical: '#DC2626',
  warning: '#D97706',
  info: '#6B8AE5',
};

const HEALTH_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  good: { label: 'Good', color: '#16A34A', bg: '#D1FAE5' },
  fair: { label: 'Fair', color: '#D97706', bg: '#FEF3C7' },
  needs_attention: { label: 'Needs Attention', color: '#DC2626', bg: '#FEE2E2' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        borderLeft: `4px solid ${SEVERITY_BORDER[finding.severity]}`,
      }}
    >
      <div
        className="flex items-start gap-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="mt-0.5 shrink-0">{SEVERITY_ICON[finding.severity]}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {finding.title}
          </p>
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>
      {expanded && (
        <div className="mt-3 ml-5 space-y-2">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {finding.description}
          </p>
          <div
            className="text-xs px-3 py-2 rounded"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          >
            {finding.recommendation}
          </div>
        </div>
      )}
    </div>
  );
}

export function WeeklyDigest() {
  const { get, post } = useApi();
  const { projectId } = useProject();
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchDigest = useCallback(() => {
    if (projectId === 'default') return;
    setLoading(true);
    get<Digest>(`/api/projects/${projectId}/digest`)
      .then(setDigest)
      .catch(() => setDigest(null))
      .finally(() => setLoading(false));
  }, [get, projectId]);

  useEffect(() => { fetchDigest(); }, [fetchDigest]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await post<Digest>(`/api/projects/${projectId}/digest/generate`, {});
      setDigest(result);
    } catch { /* silent */ }
    finally { setGenerating(false); }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          Weekly Digest
        </h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--bg-hover)' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Weekly Digest
        </h2>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-all"
          style={{ background: generating ? '#92400E' : '#D97706', opacity: generating ? 0.7 : 1 }}
        >
          <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
          {generating ? 'Generating...' : 'Generate Now'}
        </button>
      </div>

      {!digest ? (
        <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
          <BarChart3 size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No digest generated yet.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Click "Generate Now" or wait for the weekly automatic run.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary card */}
          <div
            className="rounded-xl p-5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <BarChart3 size={18} style={{ color: 'var(--accent-primary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {digest.summary.period}
                </span>
              </div>
              {(() => {
                const h = HEALTH_CONFIG[digest.summary.overall_health] || HEALTH_CONFIG.good;
                return (
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: h.bg, color: h.color }}
                  >
                    {h.label}
                  </span>
                );
              })()}
            </div>

            <div className="flex gap-6 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {digest.summary.critical > 0 && (
                <span style={{ color: '#DC2626' }}>
                  {digest.summary.critical} critical
                </span>
              )}
              {digest.summary.warnings > 0 && (
                <span style={{ color: '#D97706' }}>
                  {digest.summary.warnings} warning{digest.summary.warnings !== 1 ? 's' : ''}
                </span>
              )}
              <span>{digest.summary?.findings_count ?? 0} total findings</span>
              <span>Generated {timeAgo(digest.generated_at)}</span>
            </div>
          </div>

          {/* Findings */}
          {(!digest.findings || digest.findings.length === 0) ? (
            <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
              <p className="text-sm">No findings — your project is in good shape.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {digest.findings.map((f, i) => (
                <FindingCard key={`${f.type}-${i}`} finding={f} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
