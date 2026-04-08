import { useState, useEffect } from 'react';
import { Play, Columns2, Loader2, ChevronDown } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';

interface ScoredDecision {
  id?: string;
  title: string;
  description?: string;
  score?: number;
  status?: string;
  reasoning?: string;
  wing?: string | null;
  made_by?: string;
  namespace?: string | null;
}

interface CompileResult {
  decisions?: ScoredDecision[];
  context_used?: number;
  agent_name?: string;
  wing_sources?: Record<string, number>;
  [key: string]: unknown;
}

const WING_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
];

function wingColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return WING_COLORS[Math.abs(hash) % WING_COLORS.length];
}

export function CompileTester() {
  const { get, post } = useApi();
  const { projectId } = useProject();

  const [agents, setAgents] = useState<Array<{ name: string }>>([]);
  const [agentName, setAgentName] = useState('');
  const [agentName2, setAgentName2] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [result, setResult] = useState<CompileResult | null>(null);
  const [result2, setResult2] = useState<CompileResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [error2, setError2] = useState<string | null>(null);
  const [sideBySide, setSideBySide] = useState(false);
  const [namespace, setNamespace] = useState('');
  const [namespaces, setNamespaces] = useState<Array<{ namespace: string; count: number }>>([]);

  useEffect(() => {
    get<Array<{ name: string }>>(`/api/projects/${projectId}/agents`)
      .then((data) => {
        if (Array.isArray(data)) setAgents(data);
      })
      .catch(() => {});
    get<Array<{ namespace: string; count: number }>>(`/api/projects/${projectId}/namespaces`)
      .then((data) => {
        if (Array.isArray(data)) setNamespaces(data);
      })
      .catch(() => {});
  }, [get, projectId]);

  async function runCompile(agent: string, setRes: (r: CompileResult | null) => void, setErr: (e: string | null) => void, setLoad: (l: boolean) => void) {
    if (!agent || !taskDescription.trim()) return;
    setLoad(true);
    setErr(null);
    setRes(null);
    try {
      const data = await post<CompileResult>('/api/compile', {
        agent_name: agent,
        project_id: projectId,
        task_description: taskDescription.trim(),
        ...(namespace ? { namespace } : {}),
      });
      setRes(data);
    } catch (err: any) {
      setErr(err.message || 'Compile failed');
    } finally {
      setLoad(false);
    }
  }

  function handleCompile() {
    runCompile(agentName, setResult, setError, setLoading);
    if (sideBySide && agentName2) {
      runCompile(agentName2, setResult2, setError2, setLoading2);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Compile Tester</h1>
        <button
          onClick={() => { setSideBySide(!sideBySide); setResult2(null); setError2(null); }}
          className={`btn-secondary text-xs gap-1.5 ${sideBySide ? 'bg-amber-100 text-amber-800' : ''}`}
        >
          <Columns2 size={14} />
          {sideBySide ? 'Single Mode' : 'Side-by-Side'}
        </button>
      </div>

      {/* Input area */}
      <div className="card p-5 space-y-4">
        <div className={`grid gap-4 ${sideBySide ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1.5">Agent</label>
            <div className="relative">
              <select value={agentName} onChange={(e) => setAgentName(e.target.value)} className="input w-full appearance-none pr-8">
                <option value="">Select agent…</option>
                {agents.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-secondary)]" />
            </div>
          </div>
          {sideBySide && (
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1.5">Agent B</label>
              <div className="relative">
                <select value={agentName2} onChange={(e) => setAgentName2(e.target.value)} className="input w-full appearance-none pr-8">
                  <option value="">Select agent…</option>
                  {agents.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-secondary)]" />
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-[1fr_200px]">
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1.5">Task Description</label>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Describe the task to compile decisions for…"
              rows={3}
              className="input w-full resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1.5">Namespace</label>
            <div className="relative">
              <select value={namespace} onChange={(e) => setNamespace(e.target.value)} className="input w-full appearance-none pr-8">
                <option value="">All (no filter)</option>
                {namespaces.map((ns) => <option key={ns.namespace} value={ns.namespace}>{ns.namespace} ({ns.count})</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-secondary)]" />
            </div>
          </div>
        </div>

        <button
          onClick={handleCompile}
          disabled={!agentName || !taskDescription.trim() || loading}
          className="btn-primary gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          Compile
        </button>
      </div>

      {/* Results */}
      <div className={`grid gap-6 ${sideBySide ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        <ResultColumn label={sideBySide ? `Agent A: ${agentName || '—'}` : undefined} result={result} loading={loading} error={error} />
        {sideBySide && (
          <ResultColumn label={`Agent B: ${agentName2 || '—'}`} result={result2} loading={loading2} error={error2} />
        )}
      </div>
    </div>
  );
}

function ResultColumn({ label, result, loading, error }: { label?: string; result: CompileResult | null; loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div className="card p-6 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-[var(--text-secondary)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-5">
        {label && <h3 className="text-sm font-medium mb-3">{label}</h3>}
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!result) return null;

  const decisions = result.decisions ?? [];
  const wingSources = result.wing_sources;

  return (
    <div className="card p-5">
      {label && <h3 className="text-sm font-medium mb-3">{label}</h3>}
      {result.context_used != null && (
        <p className="text-xs text-[var(--text-secondary)] mb-3">Context tokens used: {result.context_used}</p>
      )}
      {wingSources && Object.keys(wingSources).length > 0 && (
        <div className="mb-3" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(wingSources).sort(([,a],[,b]) => b - a).map(([wing, count]) => {
            const color = wing === 'own_wing' ? '#10b981' : wingColor(wing);
            return (
              <span key={wing} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                backgroundColor: color + '22', color, border: `1px solid ${color}44`,
              }}>
                {wing} <span style={{ fontWeight: 400 }}>({count})</span>
              </span>
            );
          })}
        </div>
      )}
      {decisions.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">No decisions returned</p>
      ) : (
        <div className="space-y-2">
          {decisions.map((d, i) => {
            const dWing = d.wing ?? d.made_by;
            const dWingColor = dWing ? wingColor(dWing) : '#6b7280';
            return (
              <div key={d.id ?? i} className="p-3 rounded-lg border border-[var(--border-light)] bg-[var(--bg-primary)]">
                <div className="flex items-center justify-between mb-1">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {dWing && (
                      <span style={{
                        display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                        backgroundColor: dWingColor + '22', color: dWingColor, border: `1px solid ${dWingColor}44`,
                      }}>
                        {dWing}
                      </span>
                    )}
                    {d.namespace && (
                      <span style={{
                        display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                        backgroundColor: '#6366f122', color: '#6366f1', border: '1px solid #6366f144',
                      }}>
                        ns:{d.namespace}
                      </span>
                    )}
                    <span className="text-sm font-medium">{d.title}</span>
                  </div>
                  {d.score != null && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      {d.score.toFixed(2)}
                    </span>
                  )}
                </div>
                {d.description && <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{d.description}</p>}
                {d.reasoning && <p className="text-xs text-[var(--text-tertiary)] mt-1 italic">{d.reasoning}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
