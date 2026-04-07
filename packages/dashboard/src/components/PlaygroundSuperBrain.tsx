import { useState, useEffect, useRef, useCallback } from 'react';
import { findScenario, type DemoScenario, type DemoStep } from '../data/demo-scenarios';

type Phase = 'input' | 'planning' | 'simulation' | 'complete';
type Speed = 'normal' | 'fast' | 'skip';

const STEP_MS: Record<Speed, number> = { normal: 3000, fast: 1500, skip: 0 };
const QUICK_TASKS = [
  'Set up CI/CD pipeline',
  'Design the database schema',
  'Plan the product launch',
];

export function PlaygroundSuperBrain({ onClassicMode }: { onClassicMode?: () => void }) {
  const [phase, setPhase] = useState<Phase>('input');
  const [taskInput, setTaskInput] = useState('Build JWT authentication with refresh tokens for our SaaS platform');
  const [scenario, setScenario] = useState<DemoScenario | null>(null);
  const [visibleAgents, setVisibleAgents] = useState(0);
  const [currentStep, setCurrentStep] = useState(-1);
  const [stepProgress, setStepProgress] = useState<Record<number, 'pending' | 'typing' | 'done'>>({});
  const [typedChars, setTypedChars] = useState(0);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (typingRef.current) { clearInterval(typingRef.current); typingRef.current = null; }
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // ── Start simulation ──────────────────────────────────────────────────
  const startSimulation = (task: string) => {
    const s = findScenario(task);
    setScenario(s);
    setPhase('planning');
    setVisibleAgents(0);
    setCurrentStep(-1);
    setStepProgress({});
    setTypedChars(0);

    // Stagger agent reveal
    const total = s.plan.length + s.skipped.length;
    for (let i = 0; i < total; i++) {
      setTimeout(() => setVisibleAgents(v => v + 1), 1000 + i * 200);
    }
  };

  // ── Run steps ─────────────────────────────────────────────────────────
  const runSteps = useCallback(() => {
    if (!scenario) return;
    setPhase('simulation');

    if (speed === 'skip') {
      // Instant: show all steps as done
      const prog: Record<number, 'done'> = {};
      scenario.plan.forEach(s => { prog[s.step_number] = 'done'; });
      setStepProgress(prog);
      setCurrentStep(scenario.plan.length);
      setTimeout(() => setPhase('complete'), 300);
      return;
    }

    let stepIdx = 0;
    const playStep = () => {
      if (stepIdx >= scenario.plan.length) {
        setTimeout(() => setPhase('complete'), 500);
        return;
      }
      const step = scenario.plan[stepIdx];
      setCurrentStep(stepIdx);
      setStepProgress(p => ({ ...p, [step.step_number]: 'typing' }));
      setTypedChars(0);

      // Typing animation
      const output = step.output;
      const charMs = Math.max(5, STEP_MS[speed] * 0.4 / output.length);
      let chars = 0;
      typingRef.current = setInterval(() => {
        chars += 3;
        setTypedChars(Math.min(chars, output.length));
        if (chars >= output.length && typingRef.current) {
          clearInterval(typingRef.current);
          typingRef.current = null;
        }
      }, charMs);

      // Complete step after duration
      timerRef.current = setTimeout(() => {
        if (typingRef.current) { clearInterval(typingRef.current); typingRef.current = null; }
        setTypedChars(output.length);
        setStepProgress(p => ({ ...p, [step.step_number]: 'done' }));
        stepIdx++;
        timerRef.current = setTimeout(playStep, 300);
      }, STEP_MS[speed]);
    };

    playStep();
  }, [scenario, speed]);

  // ── Render helpers ────────────────────────────────────────────────────
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  const renderStepCard = (step: DemoStep) => {
    const status = stepProgress[step.step_number] || 'pending';
    const isActive = status === 'typing';
    const isDone = status === 'done';
    const showOutput = isActive || isDone;

    return (
      <div key={step.step_number} style={{
        marginBottom: 16, padding: 16, borderRadius: 8,
        border: `1px solid ${isActive ? '#f59e0b' : isDone ? '#10b981' : '#374151'}`,
        backgroundColor: isActive ? 'rgba(245,158,11,0.05)' : '#111827',
        transition: 'all 0.3s ease',
        opacity: status === 'pending' && currentStep >= 0 && step.step_number > (scenario?.plan[currentStep]?.step_number ?? 0) ? 0.4 : 1,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 600, color: isDone ? '#10b981' : isActive ? '#f59e0b' : '#9ca3af' }}>
            STEP {step.step_number} — {step.agent_name} {isDone ? '✅' : isActive ? '🔄' : ''}
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#6b7280' }}>
            {step.decisions_compiled} decisions compiled
          </span>
        </div>

        {/* Context box */}
        <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>
          {step.top_decisions.map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>• {d.title}</span>
              <span style={{ fontFamily: 'monospace', color: '#6b7280' }}>{d.score.toFixed(2)}</span>
            </div>
          ))}
        </div>

        {/* Green "NEW FROM PREVIOUS" box */}
        {step.new_from_previous && (
          <div style={{
            backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid #10b981',
            borderRadius: 6, padding: 10, marginBottom: 10, fontSize: 13,
          }}>
            <div style={{ color: '#10b981', fontWeight: 600, marginBottom: 4, fontSize: 12 }}>
              🟢 NEW FROM PREVIOUS STEP:
            </div>
            <div style={{ color: '#d1d5db' }}>{step.new_from_previous}</div>
          </div>
        )}

        {/* Output */}
        {showOutput && (
          <div style={{
            backgroundColor: '#1f2937', borderRadius: 6, padding: 10,
            fontFamily: 'monospace', fontSize: 13, color: '#e5e7eb', lineHeight: 1.6,
          }}>
            <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>Output:</div>
            {isDone ? step.output : step.output.slice(0, typedChars)}
            {isActive && <span style={{ animation: 'blink 1s infinite' }}>▊</span>}
          </div>
        )}

        {/* Handoff arrow */}
        {isDone && step.step_number < (scenario?.plan.length ?? 0) && (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: '8px 0', fontSize: 13 }}>
            ↓ passing context to {scenario?.plan[step.step_number]?.agent_name}...
          </div>
        )}
      </div>
    );
  };

  // ── SCREEN 1: Task Input ──────────────────────────────────────────────
  if (phase === 'input') {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>🧠 DeciGraph Super Brain</div>
        <div style={{ color: '#9ca3af', marginBottom: 32, fontSize: 16 }}>The shared brain for AI agent teams</div>

        <div style={{ textAlign: 'left', marginBottom: 16 }}>
          <label style={{ color: '#d1d5db', fontSize: 14, marginBottom: 8, display: 'block' }}>
            Describe a task for your agent team:
          </label>
          <textarea
            value={taskInput}
            onChange={e => setTaskInput(e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: 12, borderRadius: 8, fontSize: 15,
              backgroundColor: '#1f2937', color: '#e5e7eb', border: '1px solid #374151',
              resize: 'none', fontFamily: 'inherit',
            }}
          />
        </div>

        <button
          onClick={() => startSimulation(taskInput)}
          style={{
            width: '100%', padding: '14px 24px', fontSize: 16, fontWeight: 600,
            backgroundColor: '#f59e0b', color: '#000', border: 'none', borderRadius: 8,
            cursor: 'pointer', marginBottom: 20,
          }}
        >
          🧠 Let the Super Brain Run This Task
        </button>

        <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 24 }}>
          Try: {QUICK_TASKS.map((t, i) => (
            <span key={i}>
              {i > 0 && ' • '}
              <span onClick={() => { setTaskInput(t); startSimulation(t); }}
                style={{ color: '#f59e0b', cursor: 'pointer', textDecoration: 'underline' }}>{`"${t}"`}</span>
            </span>
          ))}
        </div>

        {onClassicMode && (
          <button onClick={onClassicMode}
            style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13 }}>
            Switch to Classic Mode →
          </button>
        )}
      </div>
    );
  }

  // ── SCREEN 2: Team Plan ───────────────────────────────────────────────
  if (phase === 'planning' && scenario) {
    const allAgents = [...scenario.plan, ...scenario.skipped.map((s, i) => ({
      step_number: scenario.plan.length + i + 1, agent_name: s.agent_name,
      relevance_score: s.relevance_score, role_suggestion: s.reason, skipped: true,
    }))];

    return (
      <div style={{ maxWidth: 640, margin: '40px auto', padding: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>🧠 Super Brain — Team Plan</div>
        <div style={{ color: '#9ca3af', marginBottom: 20, fontSize: 14 }}>"{taskInput}"</div>

        <div style={{ marginBottom: 24 }}>
          {allAgents.map((a, i) => {
            const isSkipped = 'skipped' in a;
            const visible = i < visibleAgents;
            return (
              <div key={i} style={{
                padding: '10px 12px', marginBottom: 6, borderRadius: 6,
                backgroundColor: isSkipped ? '#1a1a2e' : '#111827',
                border: `1px solid ${isSkipped ? '#2d2d3f' : '#374151'}`,
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(10px)',
                transition: 'all 0.3s ease',
                color: isSkipped ? '#6b7280' : '#e5e7eb',
              }}>
                <span style={{ marginRight: 8 }}>{isSkipped ? '⏭️' : '✅'}</span>
                <span style={{ fontWeight: 600 }}>{a.agent_name}</span>
                <span style={{ color: '#9ca3af', marginLeft: 8 }}>
                  — {'role_suggestion' in a ? (a as DemoStep).role_suggestion : ''} ({pct(a.relevance_score)} match)
                </span>
                {!isSkipped && 'task_suggestion' in a && (
                  <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4, paddingLeft: 28 }}>
                    → {(a as DemoStep).task_suggestion}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ color: '#9ca3af', marginBottom: 16, fontSize: 14 }}>
          Optimal team: {scenario.plan.length} agents out of {scenario.plan.length + scenario.skipped.length}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={runSteps}
            style={{ flex: 1, padding: '12px', backgroundColor: '#f59e0b', color: '#000', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 15 }}>
            ▶ Run Full Simulation
          </button>
          <button onClick={() => { setSpeed('skip'); runSteps(); }}
            style={{ padding: '12px 20px', backgroundColor: '#374151', color: '#e5e7eb', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
            ⏭️ Skip to End
          </button>
        </div>
      </div>
    );
  }

  // ── SCREEN 3: Simulation ──────────────────────────────────────────────
  if (phase === 'simulation' && scenario) {
    const progress = Object.values(stepProgress).filter(s => s === 'done').length / scenario.plan.length;
    return (
      <div style={{ maxWidth: 720, margin: '20px auto', padding: 20 }}>
        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
          <div style={{ flex: 1, height: 6, backgroundColor: '#374151', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: '#10b981', transition: 'width 0.5s ease' }} />
          </div>
          <span style={{ color: '#9ca3af', fontSize: 13, whiteSpace: 'nowrap' }}>
            Step {Object.values(stepProgress).filter(s => s === 'done').length} of {scenario.plan.length}
          </span>
        </div>

        {/* Speed controls */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['normal', 'fast'] as Speed[]).map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              style={{ padding: '4px 12px', fontSize: 12, borderRadius: 4, border: 'none', cursor: 'pointer',
                backgroundColor: speed === s ? '#f59e0b' : '#374151', color: speed === s ? '#000' : '#9ca3af' }}>
              {s === 'normal' ? '1x' : '2x'}
            </button>
          ))}
          <button onClick={() => setPaused(p => !p)}
            style={{ padding: '4px 12px', fontSize: 12, borderRadius: 4, border: 'none', cursor: 'pointer', backgroundColor: '#374151', color: '#9ca3af' }}>
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>

        {scenario.plan.map(step => renderStepCard(step))}

        <style>{`@keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }`}</style>
      </div>
    );
  }

  // ── SCREEN 4: Completion ──────────────────────────────────────────────
  if (phase === 'complete' && scenario) {
    return (
      <div style={{ maxWidth: 640, margin: '40px auto', padding: 20 }}>
        {/* Progress bar - complete */}
        <div style={{ height: 6, backgroundColor: '#10b981', borderRadius: 3, marginBottom: 8 }} />
        <div style={{ textAlign: 'right', color: '#10b981', fontSize: 13, marginBottom: 24 }}>Complete ✅</div>

        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>🧠 Session Complete</div>
        <div style={{ color: '#9ca3af', marginBottom: 24, fontSize: 14 }}>
          {scenario.plan.length} steps • {scenario.plan.length} agents • 0 conflicts
        </div>

        {/* Efficiency bars */}
        <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#111827', borderRadius: 8, border: '1px solid #374151' }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: '#e5e7eb' }}>Context Efficiency:</div>
          {scenario.plan.map((step, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#d1d5db', marginBottom: 4 }}>
                <span>{step.agent_name}</span>
                <span style={{ fontFamily: 'monospace' }}>{step.decisions_compiled}/{scenario.totalDecisions} ({Math.round(step.decisions_compiled / scenario.totalDecisions * 100)}%)</span>
              </div>
              <div style={{ height: 8, backgroundColor: '#374151', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${step.decisions_compiled / scenario.totalDecisions * 100}%`, height: '100%', backgroundColor: '#f59e0b', borderRadius: 4, transition: 'width 1s ease' }} />
              </div>
              {step.new_from_previous && <div style={{ fontSize: 12, color: '#10b981', marginTop: 2 }}>+ {i} previous output{i > 1 ? 's' : ''}</div>}
            </div>
          ))}
        </div>

        {/* With vs Without comparison */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div style={{ padding: 16, backgroundColor: '#1a1a2e', borderRadius: 8, border: '1px solid #2d2d3f' }}>
            <div style={{ fontWeight: 600, color: '#9ca3af', marginBottom: 8, fontSize: 13 }}>Without DeciGraph:</div>
            <div style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.5 }}>
              Each agent sees ALL {scenario.totalDecisions} decisions or NONE. No agent knows what the previous one did.
            </div>
          </div>
          <div style={{ padding: 16, backgroundColor: 'rgba(16,185,129,0.05)', borderRadius: 8, border: '1px solid #10b981' }}>
            <div style={{ fontWeight: 600, color: '#10b981', marginBottom: 8, fontSize: 13 }}>With DeciGraph:</div>
            <div style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.5 }}>
              Each agent sees ONLY what's relevant. Every agent builds on the last one's work. The brain coordinates the whole team.
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ padding: 20, backgroundColor: '#111827', borderRadius: 8, border: '1px solid #374151', textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontWeight: 600, color: '#e5e7eb', marginBottom: 12, fontSize: 16 }}>Ready to give your agents a shared brain?</div>
          <a href="https://github.com/perlantir/DeciGraph" target="_blank" rel="noopener"
            style={{ display: 'inline-block', padding: '10px 24px', backgroundColor: '#f59e0b', color: '#000', borderRadius: 8, fontWeight: 600, textDecoration: 'none', marginBottom: 12 }}>
            ⭐ Star on GitHub
          </a>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
            {['npx @decigraph/cli init my-project', 'git clone https://github.com/perlantir/DeciGraph && docker compose up -d'].map((cmd, i) => (
              <button key={i} onClick={() => navigator.clipboard?.writeText(cmd)}
                style={{ padding: '8px 12px', backgroundColor: '#1f2937', color: '#9ca3af', border: '1px solid #374151', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', cursor: 'pointer' }}>
                {cmd.length > 40 ? cmd.slice(0, 37) + '...' : cmd} 📋
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={() => { setPhase('input'); setScenario(null); }}
            style={{ padding: '10px 20px', backgroundColor: '#374151', color: '#e5e7eb', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            🔄 Try Another Task
          </button>
          {onClassicMode && (
            <button onClick={onClassicMode}
              style={{ padding: '10px 20px', background: 'none', border: '1px solid #374151', color: '#6b7280', borderRadius: 8, cursor: 'pointer' }}>
              Classic Mode →
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
