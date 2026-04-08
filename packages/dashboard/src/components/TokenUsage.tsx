import { useState, useEffect } from 'react';
import { Loader2, BarChart3, Activity, GitBranch } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';

interface Stats {
  total_decisions: number;
  active_decisions: number;
  superseded_decisions: number;
  pending_decisions: number;
  total_agents: number;
  total_sessions: number;
  decision_trend: Array<{ date: string; count: number }>;
  feedback?: { total_ratings: number; per_compilation: number };
  [key: string]: unknown;
}

interface UsageData {
  daily_decisions: Array<{ date: string; count: number }>;
  daily_compiles: Array<{ date: string; count: number }>;
  total_compiles: number;
}

export function TokenUsage() {
  const { get } = useApi();
  const { projectId } = useProject();

  const [stats, setStats] = useState<Stats | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      get<Stats>(`/api/projects/${projectId}/stats`),
      get<UsageData>(`/api/projects/${projectId}/usage`).catch(() => null),
    ])
      .then(([statsData, usageData]) => {
        if (cancelled) return;
        setStats(statsData);
        setUsage(usageData);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load stats');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [get, projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-[var(--text-secondary)]" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="card p-6 text-center max-w-md">
          <p className="text-sm text-red-600">{error || 'No data available'}</p>
        </div>
      </div>
    );
  }

  // Merge daily data: prefer usage endpoint, fall back to stats decision_trend
  const dailyDecisions = usage?.daily_decisions ?? stats.decision_trend ?? [];
  const dailyCompiles = usage?.daily_compiles ?? [];
  const totalCompiles = usage?.total_compiles ?? 0;

  // Get last 30 days of data
  const last30 = dailyDecisions.slice(-30);
  const maxCount = Math.max(...last30.map((d) => d.count), ...dailyCompiles.map((d) => d.count), 1);

  return (
    <div className="p-12 max-w-5xl mx-auto space-y-8">
      <h1 className="text-4xl font-bold tracking-tight">Token Usage & Activity</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard icon={<GitBranch size={18} />} label="Total Decisions" value={stats.total_decisions} />
        <SummaryCard icon={<Activity size={18} />} label="Active" value={stats.active_decisions} color="#01696F" />
        <SummaryCard icon={<BarChart3 size={18} />} label="Total Compiles" value={totalCompiles} color="var(--accent-primary)" />
        <SummaryCard icon={<Activity size={18} />} label="Sessions" value={stats.total_sessions} color="var(--accent-secondary)" />
      </div>

      {/* Daily decisions chart */}
      <div className="rounded-2xl p-8" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '16px' }}>
        <h2 className="text-2xl font-bold tracking-tight mb-6">Daily Decisions (Last 30 Days)</h2>
        {last30.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] py-8 text-center">No activity data yet</p>
        ) : (
          <BarChart data={last30} maxValue={maxCount} color="var(--accent-primary)" />
        )}
      </div>

      {/* Daily compiles chart */}
      {dailyCompiles.length > 0 && (
        <div className="rounded-2xl p-8" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '16px' }}>
          <h2 className="text-2xl font-bold tracking-tight mb-6">Daily Compiles (Last 30 Days)</h2>
          <BarChart data={dailyCompiles.slice(-30)} maxValue={maxCount} color="var(--accent-secondary)" />
        </div>
      )}

      {/* Feedback stats */}
      {stats.feedback && (
        <div className="rounded-2xl p-8" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '16px' }}>
          <h2 className="text-2xl font-bold tracking-tight mb-4">Feedback</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Ratings</span>
              <p className="text-3xl font-bold">{stats.feedback.total_ratings}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Per Compilation</span>
              <p className="text-3xl font-bold">{stats.feedback.per_compilation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '16px' }}>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: color || 'var(--text-secondary)' }}>{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      </div>
      <p className="text-3xl font-bold" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
    </div>
  );
}

function BarChart({ data, maxValue, color }: { data: Array<{ date: string; count: number }>; maxValue: number; color: string }) {
  const chartH = 160;
  const barW = Math.max(6, Math.min(20, (800 - data.length * 2) / data.length));
  const gap = 2;
  const svgW = data.length * (barW + gap);

  return (
    <div className="overflow-x-auto">
      <svg width={svgW} height={chartH + 24} className="min-w-full">
        {data.map((d, i) => {
          const barH = maxValue > 0 ? (d.count / maxValue) * chartH : 0;
          const x = i * (barW + gap);
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={chartH - barH}
                width={barW}
                height={Math.max(barH, 1)}
                rx={2}
                fill={color}
                opacity={0.8}
              >
                <title>{`${d.date}: ${d.count}`}</title>
              </rect>
              {/* Show date label every ~5 bars */}
              {(i % Math.max(1, Math.floor(data.length / 6)) === 0) && (
                <text
                  x={x + barW / 2}
                  y={chartH + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--text-tertiary)"
                >
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
