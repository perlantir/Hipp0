import React, { useState } from 'react';
import { Github, MessageSquare, FileText, Upload, CheckCircle, Circle, ChevronRight, X, Users, Zap } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';

// ── Types ────────────────────────────────────────────────────────────────

type Source = 'github' | 'slack' | 'linear' | 'files';
type Phase = 'welcome' | 'scan' | 'preview' | 'importing' | 'complete';

interface Decision {
  title: string;
  confidence: string;
  source: string;
}

interface TeamMember {
  name: string;
  contributions: number;
  suggested_role: string;
}

interface ScanResult {
  scan_id: string;
  source: Source;
  stats: Record<string, number>;
  preview_decisions: Decision[];
  detected_team: TeamMember[];
}

interface ImportResult {
  project_id: string;
  decisions_imported: number;
  agents_created: number;
  contradictions_found: number;
  edges_created: number;
}

// ── Source config ────────────────────────────────────────────────────────

const SOURCES: Array<{ id: Source; label: string; description: string; icon: React.ReactNode; placeholder: string; inputLabel: string }> = [
  {
    id: 'github',
    label: 'GitHub',
    description: 'PRs, issues & discussions',
    icon: <Github size={28} />,
    inputLabel: 'Repository URL',
    placeholder: 'https://github.com/org/repo',
  },
  {
    id: 'slack',
    label: 'Slack',
    description: 'Channels & threads',
    icon: <MessageSquare size={28} />,
    inputLabel: 'Channels (comma-separated)',
    placeholder: '#engineering, #architecture',
  },
  {
    id: 'linear',
    label: 'Linear',
    description: 'Issues & projects',
    icon: <Zap size={28} />,
    inputLabel: 'Team slug',
    placeholder: 'engineering',
  },
  {
    id: 'files',
    label: 'Files',
    description: 'Docs, ADRs & markdown',
    icon: <FileText size={28} />,
    inputLabel: 'Files',
    placeholder: 'Drop files or paste paths...',
  },
];

const IMPORT_STEPS = [
  'Connecting to source...',
  'Scanning for decisions...',
  'Detecting team members...',
  'Building decision graph...',
  'Resolving contradictions...',
  'Finalizing import...',
];

// ── Component ────────────────────────────────────────────────────────────

export function ImportWizard() {
  const { post } = useApi();
  const { projectId } = useProject();

  const [phase, setPhase] = useState<Phase>('welcome');
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [sourceInput, setSourceInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedDecisions, setSelectedDecisions] = useState<Set<number>>(new Set());
  const [projectName, setProjectName] = useState('');
  const [importStep, setImportStep] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Actions ──────────────────────────────────────────────────────────

  function selectSource(src: Source) {
    setSelectedSource(src);
    setPhase('scan');
    setError(null);
  }

  async function runScan() {
    if (!selectedSource) return;
    setScanning(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (projectId && projectId !== 'default') body.project_id = projectId;
      if (sourceInput) body.config_value = sourceInput;

      const result = await post<ScanResult>(`/api/import-wizard/scan/${selectedSource}`, body);
      setScanResult(result);
      // Select all decisions by default
      setSelectedDecisions(new Set(result.preview_decisions.map((_, i) => i)));
      setPhase('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed. Please try again.');
    } finally {
      setScanning(false);
    }
  }

  async function runImport() {
    if (!scanResult || !projectName.trim()) return;
    setPhase('importing');
    setImportStep(0);

    // Animate through steps
    for (let i = 0; i < IMPORT_STEPS.length; i++) {
      await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
      setImportStep(i + 1);
    }

    try {
      const result = await post<ImportResult>('/api/import-wizard/execute', {
        scan_id: scanResult.scan_id,
        project_name: projectName.trim(),
      });
      setImportResult(result);
      setPhase('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed. Please try again.');
      setPhase('preview');
    }
  }

  function toggleDecision(i: number) {
    setSelectedDecisions(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // ── Styles ───────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 12,
    padding: 20,
  };

  const accentBtn: React.CSSProperties = {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '12px 24px',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  };

  const ghostBtn: React.CSSProperties = {
    background: 'none',
    border: '1px solid var(--border-light)',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  };

  const input: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-light)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  };

  // ── Phase: Welcome ───────────────────────────────────────────────────

  if (phase === 'welcome') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Upload size={22} color="var(--accent)" />
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Import Wizard</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
            Connect a source and DeciGraph will scan it for architectural decisions, automatically
            build your decision graph, and detect your team.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {SOURCES.map(src => (
            <button
              key={src.id}
              onClick={() => selectSource(src.id)}
              style={{
                ...card,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'; }}
            >
              <span style={{ color: 'var(--accent)', marginTop: 2 }}>{src.icon}</span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 15, marginBottom: 4 }}>
                  {src.label}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{src.description}</div>
              </div>
            </button>
          ))}
        </div>

        <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 20, textAlign: 'center' }}>
          All scans use simulated data — no credentials required in this preview.
        </p>
      </div>
    );
  }

  // ── Phase: Scan ──────────────────────────────────────────────────────

  if (phase === 'scan' && selectedSource) {
    const srcConfig = SOURCES.find(s => s.id === selectedSource)!;

    return (
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <button onClick={() => setPhase('welcome')} style={{ ...ghostBtn, padding: '6px 10px' }}>←</button>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Configure {srcConfig.label} source
          </span>
        </div>

        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ color: 'var(--accent)' }}>{srcConfig.icon}</span>
            <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>{srcConfig.label}</span>
          </div>

          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 6 }}>
            {srcConfig.inputLabel}
          </label>
          <input
            style={input}
            value={sourceInput}
            onChange={e => setSourceInput(e.target.value)}
            placeholder={srcConfig.placeholder}
          />

          {error && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#7f1d1d22', border: '1px solid #991b1b44', borderRadius: 8, color: '#fca5a5', fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>

        <button
          onClick={runScan}
          disabled={scanning}
          style={{ ...accentBtn, width: '100%', opacity: scanning ? 0.7 : 1 }}
        >
          {scanning ? 'Scanning...' : `Scan ${srcConfig.label}`}
        </button>

        <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 12, textAlign: 'center' }}>
          This will simulate a scan and return mock decision data.
        </p>
      </div>
    );
  }

  // ── Phase: Preview ───────────────────────────────────────────────────

  if (phase === 'preview' && scanResult) {
    const statEntries = Object.entries(scanResult.stats);

    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--text-primary)', marginBottom: 4 }}>
              Scan Complete
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Review what was found and configure your import.
            </div>
          </div>
          <button onClick={() => setPhase('welcome')} style={{ ...ghostBtn, padding: '6px 10px' }}>
            <X size={16} />
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {statEntries.map(([key, val]) => (
            <div key={key} style={{ ...card, flex: '1 1 120px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{val}</div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 2 }}>
                {key.replace(/_/g, ' ')}
              </div>
            </div>
          ))}
        </div>

        {/* Decisions */}
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 15 }}>
              Decisions Found ({scanResult.preview_decisions.length})
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              {selectedDecisions.size} selected
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
            {scanResult.preview_decisions.map((d, i) => (
              <button
                key={i}
                onClick={() => toggleDecision(i)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  background: selectedDecisions.has(i) ? 'var(--bg-secondary)' : 'transparent',
                  border: `1px solid ${selectedDecisions.has(i) ? 'var(--accent)' : 'var(--border-light)'}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                {selectedDecisions.has(i)
                  ? <CheckCircle size={16} color="var(--accent)" style={{ marginTop: 1, flexShrink: 0 }} />
                  : <Circle size={16} color="var(--text-tertiary)" style={{ marginTop: 1, flexShrink: 0 }} />
                }
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 500 }}>{d.title}</div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 2 }}>{d.source}</div>
                </div>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: d.confidence === 'high' ? '#059669' + '22' : '#d97706' + '22',
                  color: d.confidence === 'high' ? '#059669' : '#d97706',
                }}>
                  {d.confidence}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Team */}
        {scanResult.detected_team.length > 0 && (
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Users size={16} color="var(--text-secondary)" />
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 15 }}>
                Detected Team ({scanResult.detected_team.length})
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {scanResult.detected_team.map((m, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 20,
                }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
                    {m.name[0]?.toUpperCase()}
                  </span>
                  <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>{m.name}</span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{m.suggested_role}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Project name + import */}
        <div style={{ ...card }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 6 }}>
            Project name
          </label>
          <input
            style={{ ...input, marginBottom: 14 }}
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            placeholder="My Project"
          />
          {error && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: '#7f1d1d22', border: '1px solid #991b1b44', borderRadius: 8, color: '#fca5a5', fontSize: 13 }}>
              {error}
            </div>
          )}
          <button
            onClick={runImport}
            disabled={!projectName.trim() || selectedDecisions.size === 0}
            style={{ ...accentBtn, width: '100%', opacity: (!projectName.trim() || selectedDecisions.size === 0) ? 0.5 : 1 }}
          >
            Import {selectedDecisions.size} Decisions <ChevronRight size={16} style={{ display: 'inline', marginLeft: 4, verticalAlign: 'middle' }} />
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: Importing ─────────────────────────────────────────────────

  if (phase === 'importing') {
    const progress = Math.round((importStep / IMPORT_STEPS.length) * 100);

    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 20 }}>🧠</div>
        <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>
          Importing...
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 32 }}>
          Building your decision graph
        </div>

        {/* Progress bar */}
        <div style={{ background: 'var(--border-light)', borderRadius: 8, height: 6, marginBottom: 24, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            background: 'var(--accent)',
            borderRadius: 8,
            width: `${progress}%`,
            transition: 'width 0.4s ease',
          }} />
        </div>

        {/* Steps */}
        <div style={{ textAlign: 'left', ...card }}>
          {IMPORT_STEPS.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < IMPORT_STEPS.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
              {i < importStep
                ? <CheckCircle size={16} color="#059669" />
                : i === importStep
                  ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                  : <Circle size={16} color="var(--text-tertiary)" />
              }
              <span style={{ fontSize: 13, color: i < importStep ? 'var(--text-secondary)' : i === importStep ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                {step}
              </span>
            </div>
          ))}
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Phase: Complete ──────────────────────────────────────────────────

  if (phase === 'complete' && importResult) {
    const stats = [
      { label: 'Decisions Imported', value: importResult.decisions_imported, color: 'var(--accent)' },
      { label: 'Agents Created', value: importResult.agents_created, color: '#059669' },
      { label: 'Contradictions Found', value: importResult.contradictions_found, color: '#d97706' },
      { label: 'Edges Created', value: importResult.edges_created, color: '#7c3aed' },
    ];

    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '48px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <div style={{ fontWeight: 700, fontSize: 24, color: 'var(--text-primary)', marginBottom: 8 }}>
          Import Complete!
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 32 }}>
          Your decision graph is ready. Here's what was imported:
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
          {stats.map(s => (
            <div key={s.label} style={{ ...card, textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => { window.location.hash = 'playground'; }}
            style={{ ...accentBtn, width: '100%' }}
          >
            Start First Session →
          </button>
          <button
            onClick={() => { window.location.hash = 'graph'; }}
            style={{ ...ghostBtn, width: '100%' }}
          >
            View Decision Graph
          </button>
          <button
            onClick={() => {
              setPhase('welcome');
              setScanResult(null);
              setImportResult(null);
              setProjectName('');
              setSourceInput('');
              setSelectedSource(null);
              setError(null);
            }}
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13 }}
          >
            Import another source
          </button>
        </div>
      </div>
    );
  }

  return null;
}
