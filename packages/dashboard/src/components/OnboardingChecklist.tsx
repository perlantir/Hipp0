import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, X, ExternalLink } from 'lucide-react';
import { useApi } from '../hooks/useApi';

const STORAGE_KEY = 'hipp0-onboarding-dismissed';

interface OnboardingChecklistProps {
  onNavigate: (view: string) => void;
}

interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  link?: string;
  progress?: { current: number; target: number };
}

export function OnboardingChecklist({ onNavigate }: OnboardingChecklistProps) {
  const { get } = useApi();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [items, setItems] = useState<ChecklistItem[]>([
    { id: 'project', label: 'Create your first project', checked: true },
    { id: 'agents', label: 'Add agent personas', checked: false },
    { id: 'decisions', label: 'Create 5 decisions', checked: false, progress: { current: 0, target: 5 } },
    { id: 'compile', label: 'Run your first compile', checked: false, link: 'wizard' },
    { id: 'integration', label: 'Set up an integration', checked: false, link: 'connectors' },
  ]);
  const [decisionCount, setDecisionCount] = useState(0);
  const [visible, setVisible] = useState(false);

  // Fetch status for checklist items
  useEffect(() => {
    if (dismissed) return;

    let cancelled = false;

    async function check() {
      try {
        // Check agents
        const agents = await get<Array<{ id: string }>>('/api/agents').catch(() => []);
        const hasAgents = Array.isArray(agents) && agents.length > 0;

        // Check decisions count from any project
        const projects = await get<Array<{ id: string }>>('/api/projects').catch(() => []);
        let totalDecisions = 0;
        if (Array.isArray(projects) && projects.length > 0) {
          const decisions = await get<Array<{ id: string }>>(
            `/api/projects/${projects[0].id}/decisions`,
          ).catch(() => []);
          totalDecisions = Array.isArray(decisions) ? decisions.length : 0;
        }

        // Check compile history
        let hasCompiled = false;
        if (Array.isArray(projects) && projects.length > 0) {
          const history = await get<Array<{ id: string }>>(
            `/api/projects/${projects[0].id}/compile-history`,
          ).catch(() => []);
          hasCompiled = Array.isArray(history) && history.length > 0;
        }

        // Check connectors
        const connectors = await get<Array<{ id: string }>>('/api/connectors').catch(() => []);
        const hasConnectors = Array.isArray(connectors) && connectors.length > 0;

        if (cancelled) return;

        setDecisionCount(totalDecisions);
        setVisible(totalDecisions < 10);

        setItems([
          { id: 'project', label: 'Create your first project', checked: true },
          { id: 'agents', label: 'Add agent personas', checked: hasAgents },
          {
            id: 'decisions',
            label: 'Create 5 decisions',
            checked: totalDecisions >= 5,
            progress: { current: Math.min(totalDecisions, 5), target: 5 },
          },
          { id: 'compile', label: 'Run your first compile', checked: hasCompiled, link: 'wizard' },
          { id: 'integration', label: 'Set up an integration', checked: hasConnectors, link: 'connectors' },
        ]);
      } catch {
        // Silently fail — onboarding is non-critical
        if (!cancelled) setVisible(false);
      }
    }

    void check();
    return () => { cancelled = true; };
  }, [dismissed, get]);

  if (dismissed || !visible) return null;

  const completedCount = items.filter((i) => i.checked).length;
  const progress = Math.round((completedCount / items.length) * 100);

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, 'true');
    setDismissed(true);
  }

  return (
    <div className="onboarding-card">
      <div className="onboarding-header">
        <div>
          <h3 className="onboarding-title">Get started with Hipp0</h3>
          <p className="onboarding-subtitle">
            {completedCount}/{items.length} steps completed
          </p>
        </div>
        <button onClick={handleDismiss} className="onboarding-dismiss" title="Dismiss">
          <X size={16} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="onboarding-progress-track">
        <div className="onboarding-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Checklist */}
      <ul className="onboarding-list">
        {items.map((item) => (
          <li key={item.id} className={`onboarding-item ${item.checked ? 'completed' : ''}`}>
            {item.checked ? (
              <CheckCircle2 size={18} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            ) : (
              <Circle size={18} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            )}
            <span className="onboarding-item-label">{item.label}</span>
            {item.progress && !item.checked && (
              <span className="onboarding-item-progress">
                {item.progress.current}/{item.progress.target}
              </span>
            )}
            {item.link && !item.checked && (
              <button
                onClick={() => onNavigate(item.link!)}
                className="onboarding-item-link"
              >
                <ExternalLink size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
