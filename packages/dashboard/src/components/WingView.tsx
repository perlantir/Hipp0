import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WingStats {
  agent_name: string;
  wing: string;
  decision_count: number;
  top_domains: string[];
  cross_wing_connections: Array<{ wing: string; strength: number }>;
  wing_affinity: {
    cross_wing_weights: Record<string, number>;
    last_recalculated: string;
    feedback_count: number;
  };
}

interface ProjectWing {
  wing: string;
  decision_count: number;
  top_domains: string[];
  cross_references: Array<{ agent: string; strength: number }>;
}

interface ProjectWingsResponse {
  project_id: string;
  wings: ProjectWing[];
}

/* ------------------------------------------------------------------ */
/*  Wing badge color                                                    */
/* ------------------------------------------------------------------ */

const WING_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
];

function wingColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return WING_COLORS[Math.abs(hash) % WING_COLORS.length];
}

function WingBadge({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const color = wingColor(name);
  const px = size === 'md' ? '8px 14px' : '2px 8px';
  const fs = size === 'md' ? 13 : 11;
  return (
    <span style={{
      display: 'inline-block', padding: px, borderRadius: 4,
      backgroundColor: color + '22', color, fontWeight: 600, fontSize: fs,
      border: `1px solid ${color}44`,
    }}>
      {name}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Affinity bar                                                        */
/* ------------------------------------------------------------------ */

function AffinityBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const barColor = value >= 0.7 ? '#10b981' : value >= 0.4 ? '#f59e0b' : '#6b7280';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <WingBadge name={label} />
      <div style={{ flex: 1, height: 8, backgroundColor: 'var(--bg-tertiary, #1f2937)', borderRadius: 4 }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: barColor, borderRadius: 4, transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-secondary, #9ca3af)', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Wing Relationship Graph (simple SVG)                                */
/* ------------------------------------------------------------------ */

function WingRelationshipGraph({ wings }: { wings: ProjectWing[] }) {
  if (wings.length === 0) return <p style={{ color: 'var(--text-secondary)' }}>No wings found</p>;

  const cx = 250, cy = 200, r = 140;
  const nodes = wings.map((w, i) => {
    const angle = (2 * Math.PI * i) / wings.length - Math.PI / 2;
    return { ...w, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  // Build edges from cross_references
  const edges: Array<{ from: typeof nodes[0]; to: typeof nodes[0]; strength: number }> = [];
  for (const node of nodes) {
    for (const ref of node.cross_references) {
      const target = nodes.find((n) => n.wing === ref.agent);
      if (target && ref.strength > 0) {
        edges.push({ from: node, to: target, strength: ref.strength });
      }
    }
  }

  return (
    <svg width="500" height="400" viewBox="0 0 500 400" style={{ maxWidth: '100%' }}>
      {/* Edges */}
      {edges.map((e, i) => (
        <line
          key={`edge-${i}`}
          x1={e.from.x} y1={e.from.y}
          x2={e.to.x} y2={e.to.y}
          stroke={`rgba(59, 130, 246, ${Math.max(0.15, e.strength)})`}
          strokeWidth={Math.max(1, e.strength * 4)}
        />
      ))}
      {/* Nodes */}
      {nodes.map((n) => {
        const color = wingColor(n.wing);
        const radius = Math.max(16, Math.min(30, 10 + n.decision_count * 0.5));
        return (
          <g key={n.wing}>
            <circle cx={n.x} cy={n.y} r={radius} fill={color + '33'} stroke={color} strokeWidth={2} />
            <text
              x={n.x} y={n.y + radius + 14}
              textAnchor="middle"
              fill="var(--text-primary, #e5e7eb)"
              fontSize={11}
              fontWeight={600}
            >
              {n.wing}
            </text>
            <text
              x={n.x} y={n.y + 4}
              textAnchor="middle"
              fill={color}
              fontSize={10}
              fontWeight={700}
            >
              {n.decision_count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent Wing Detail                                                   */
/* ------------------------------------------------------------------ */

function AgentWingDetail({ agentName, onClose }: { agentName: string; onClose: () => void }) {
  const { get, post } = useApi();
  const { projectId } = useProject();
  const [stats, setStats] = useState<WingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebalancing, setRebalancing] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get<WingStats>(`/api/agents/${encodeURIComponent(agentName)}/wing?project_id=${projectId}`);
      setStats(data);
    } catch { /* skip */ }
    setLoading(false);
  }, [agentName, projectId, get]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const handleRebalance = async () => {
    setRebalancing(true);
    try {
      await post(`/api/agents/${encodeURIComponent(agentName)}/wing/rebalance?project_id=${projectId}`, {});
      await loadStats();
    } catch { /* skip */ }
    setRebalancing(false);
  };

  if (loading) return <div style={{ padding: 20, color: 'var(--text-secondary)' }}>Loading wing data...</div>;
  if (!stats) return <div style={{ padding: 20, color: 'var(--text-secondary)' }}>No wing data found</div>;

  const sortedWeights = Object.entries(stats.wing_affinity.cross_wing_weights)
    .sort(([, a], [, b]) => b - a);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: 'var(--text-primary, #e5e7eb)' }}>
          Wing: <WingBadge name={stats.agent_name} size="md" />
        </h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>x</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ padding: 12, backgroundColor: 'var(--bg-tertiary, #1f2937)', borderRadius: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{stats.decision_count}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Decisions</div>
        </div>
        <div style={{ padding: 12, backgroundColor: 'var(--bg-tertiary, #1f2937)', borderRadius: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{sortedWeights.length}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Cross-wing links</div>
        </div>
        <div style={{ padding: 12, backgroundColor: 'var(--bg-tertiary, #1f2937)', borderRadius: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{stats.wing_affinity.feedback_count}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Feedback events</div>
        </div>
      </div>

      {stats.top_domains.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 6 }}>TOP DOMAINS</h4>
          <div style={{ display: 'flex', gap: 6 }}>
            {stats.top_domains.map((d) => (
              <span key={d} style={{ padding: '2px 8px', borderRadius: 4, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 12 }}>{d}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0 }}>CROSS-WING AFFINITY</h4>
          <button
            onClick={handleRebalance}
            disabled={rebalancing}
            style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              border: '1px solid var(--border-primary, #374151)',
              opacity: rebalancing ? 0.5 : 1,
            }}
          >
            {rebalancing ? 'Rebalancing...' : 'Rebalance'}
          </button>
        </div>
        {sortedWeights.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary, #6b7280)' }}>No cross-wing affinity data yet. Provide feedback to learn affinities.</p>
        ) : (
          sortedWeights.map(([wing, weight]) => (
            <AffinityBar key={wing} label={wing} value={weight} />
          ))
        )}
      </div>

      {stats.wing_affinity.last_recalculated && (
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
          Last recalculated: {new Date(stats.wing_affinity.last_recalculated).toLocaleString()}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main WingView                                                       */
/* ------------------------------------------------------------------ */

export function WingView() {
  const { get } = useApi();
  const { projectId } = useProject();
  const [wings, setWings] = useState<ProjectWing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    get<ProjectWingsResponse>(`/api/projects/${projectId}/wings`)
      .then((data) => setWings(data.wings ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId, get]);

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading wing data...</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h2 style={{ color: 'var(--text-primary, #e5e7eb)', marginBottom: 4, fontSize: 20 }}>Agent Wings</h2>
      <p style={{ color: 'var(--text-secondary, #9ca3af)', fontSize: 13, marginBottom: 20 }}>
        Each agent operates in its own wing — a dedicated context space. Cross-wing affinity is learned from feedback.
      </p>

      {selectedAgent ? (
        <AgentWingDetail agentName={selectedAgent} onClose={() => setSelectedAgent(null)} />
      ) : (
        <>
          {/* Wing Relationship Graph */}
          <div style={{ backgroundColor: 'var(--bg-secondary, #111827)', borderRadius: 8, padding: 16, marginBottom: 24, border: '1px solid var(--border-primary, #1f2937)' }}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: 14, marginBottom: 12 }}>Wing Relationship Graph</h3>
            <WingRelationshipGraph wings={wings} />
          </div>

          {/* Wing List */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {wings.map((w) => (
              <div
                key={w.wing}
                onClick={() => setSelectedAgent(w.wing)}
                style={{
                  padding: 16, borderRadius: 8, cursor: 'pointer',
                  backgroundColor: 'var(--bg-secondary, #111827)',
                  border: '1px solid var(--border-primary, #1f2937)',
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = wingColor(w.wing))}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-primary, #1f2937)')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <WingBadge name={w.wing} size="md" />
                  <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{w.decision_count}</span>
                </div>
                {w.top_domains.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                    {w.top_domains.map((d) => (
                      <span key={d} style={{ padding: '1px 6px', borderRadius: 3, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 10 }}>{d}</span>
                    ))}
                  </div>
                )}
                {w.cross_references.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Referenced by: {w.cross_references.slice(0, 3).map((r) => r.agent).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
