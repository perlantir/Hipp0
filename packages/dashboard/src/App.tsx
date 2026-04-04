import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import {
  GitBranch,
  Clock,
  AlertTriangle,
  Columns2,
  Search as SearchIcon,
  Zap,
  History,
  Bell,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Upload,
  Settings,
  Radio,
} from 'lucide-react';
import { DecisionGraph } from './components/DecisionGraph';
import { Timeline } from './components/Timeline';
import { Contradictions } from './components/Contradictions';
import { ContextComparison } from './components/ContextComparison';
import { Search } from './components/Search';
import { ImpactAnalysis } from './components/ImpactAnalysis';
import { SessionHistory } from './components/SessionHistory';
import { NotificationFeed } from './components/NotificationFeed';
import { ProjectStats } from './components/ProjectStats';
import { Wizard } from './components/Wizard';
import { Import } from './components/Import';
import { Connectors } from './components/Connectors';
import { Webhooks } from './components/Webhooks';
import { TimeTravelView } from './components/TimeTravelView';
import { useApi } from './hooks/useApi';

/* ------------------------------------------------------------------ */
/*  Project context                                                    */
/* ------------------------------------------------------------------ */

interface ProjectContextValue {
  projectId: string;
  setProjectId: (id: string) => void;
}

const ProjectContext = createContext<ProjectContextValue>({
  projectId: 'default',
  setProjectId: () => {},
});

export function useProject() {
  return useContext(ProjectContext);
}

/* ------------------------------------------------------------------ */
/*  Views                                                              */
/* ------------------------------------------------------------------ */

type View =
  | 'graph'
  | 'timeline'
  | 'contradictions'
  | 'context'
  | 'search'
  | 'impact'
  | 'sessions'
  | 'notifications'
  | 'stats'
  | 'import'
  | 'connectors'
  | 'webhooks'
  | 'timetravel'
  | 'wizard';

const NAV_ITEMS: { id: View; label: string; icon: ReactNode }[] = [
  { id: 'graph', label: 'Decision Graph', icon: <GitBranch size={18} /> },
  { id: 'timeline', label: 'Timeline', icon: <Clock size={18} /> },
  { id: 'contradictions', label: 'Contradictions', icon: <AlertTriangle size={18} /> },
  { id: 'context', label: 'Context Compare', icon: <Columns2 size={18} /> },
  { id: 'search', label: 'Search', icon: <SearchIcon size={18} /> },
  { id: 'impact', label: 'Impact Analysis', icon: <Zap size={18} /> },
  { id: 'sessions', label: 'Sessions', icon: <History size={18} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
  { id: 'stats', label: 'Project Stats', icon: <BarChart3 size={18} /> },
  { id: 'import', label: 'Import', icon: <Upload size={18} /> },
  { id: 'connectors', label: 'Connectors', icon: <Settings size={18} /> },
  { id: 'webhooks', label: 'Webhooks', icon: <Radio size={18} /> },
  { id: 'timetravel', label: 'Time Travel', icon: <Clock size={18} /> },
];

function getViewFromHash(): View {
  const hash = window.location.hash.replace('#', '') as View;
  if (NAV_ITEMS.find((n) => n.id === hash)) return hash;
  return 'graph';
}

/* ------------------------------------------------------------------ */
/*  View renderer                                                      */
/* ------------------------------------------------------------------ */

function ViewContent({ view }: { view: View }) {
  switch (view) {
    case 'graph':
      return <DecisionGraph />;
    case 'timeline':
      return <Timeline />;
    case 'contradictions':
      return <Contradictions />;
    case 'context':
      return <ContextComparison />;
    case 'search':
      return <Search />;
    case 'impact':
      return <ImpactAnalysis />;
    case 'sessions':
      return <SessionHistory />;
    case 'notifications':
      return <NotificationFeed />;
    case 'stats':
      return <ProjectStats />;
    case 'import':
      return <Import />;
    case 'connectors':
      return <Connectors />;
    case 'webhooks':
      return <Webhooks />;
    case 'timetravel':
      return <TimeTravelView />;
    default:
      return <DecisionGraph />;
  }
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  const { get } = useApi();

  const [view, setView] = useState<View>(getViewFromHash);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(true);
  const [projectId, setProjectId] = useState('default');

  // First-run detection
  const [showWizard, setShowWizard] = useState(false);
  const [projectsChecked, setProjectsChecked] = useState(false);

  // Unresolved contradictions badge count
  const [unresolvedCount, setUnresolvedCount] = useState<number | null>(null);

  /* ---- Check for first run -------------------------------------- */
  useEffect(() => {
    get<Array<{ id: string }>>('/api/projects')
      .then((projects) => {
        if (Array.isArray(projects) && projects.length === 0) {
          setShowWizard(true);
        } else if (Array.isArray(projects) && projects.length > 0) {
          // Use the first project if projectId is still the placeholder
          if (projectId === 'default' && projects[0]?.id) {
            setProjectId(projects[0].id);
          }
        }
        setProjectsChecked(true);
      })
      .catch(() => {
        // If the API is unreachable, skip wizard and show dashboard
        setProjectsChecked(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  /* ---- Fetch unresolved contradiction count --------------------- */
  useEffect(() => {
    if (!projectsChecked || showWizard || projectId === 'default') return;

    let cancelled = false;
    get<Array<{ id: string }>>(`/api/projects/${projectId}/contradictions?status=unresolved`)
      .then((data) => {
        if (!cancelled) {
          setUnresolvedCount(Array.isArray(data) ? data.length : null);
        }
      })
      .catch(() => {
        if (!cancelled) setUnresolvedCount(null);
      });

    return () => {
      cancelled = true;
    };
  }, [get, projectId, projectsChecked, showWizard]);

  /* ---- Sync hash → view ---------------------------------------- */
  useEffect(() => {
    function onHash() {
      setView(getViewFromHash());
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  /* ---- Navigate ------------------------------------------------- */
  function navigate(v: View) {
    window.location.hash = v;
    setView(v);
  }

  /* ---- Theme toggle -------------------------------------------- */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  /* ---- Wizard complete ----------------------------------------- */
  function handleWizardComplete(newProjectId: string) {
    setProjectId(newProjectId);
    setShowWizard(false);
    navigate('graph');
  }

  /* ---- Loading splash (waiting for first-run check) ------------ */
  if (!projectsChecked) {
    return (
      <ProjectContext.Provider value={{ projectId, setProjectId }}>
        <div
          className={`flex items-center justify-center h-screen ${
            dark ? 'bg-nexus-bg-dark' : 'bg-nexus-bg-light'
          }`}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <GitBranch size={16} className="text-white" />
            </div>
          </div>
        </div>
      </ProjectContext.Provider>
    );
  }

  /* ---- Wizard -------------------------------------------------- */
  if (showWizard) {
    return (
      <ProjectContext.Provider value={{ projectId, setProjectId }}>
        <Wizard onComplete={handleWizardComplete} />
      </ProjectContext.Provider>
    );
  }

  /* ---- Main dashboard ------------------------------------------ */
  return (
    <ProjectContext.Provider value={{ projectId, setProjectId }}>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`flex flex-col shrink-0 transition-[width] duration-200 ${
            collapsed ? 'w-16' : 'w-56'
          } ${
            dark
              ? 'bg-[#111110] border-r border-nexus-border-dark'
              : 'bg-[#EEEDEA] border-r border-nexus-border-light'
          }`}
        >
          {/* Logo area */}
          <div className="flex items-center gap-3 px-4 h-14 shrink-0">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
              <GitBranch size={14} className="text-white" />
            </div>
            {!collapsed && (
              <span className="font-semibold text-sm tracking-tight truncate">Nexus</span>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 flex flex-col gap-0.5 px-2 py-2 overflow-y-auto scrollbar-thin">
            {NAV_ITEMS.map((item) => {
              const active = view === item.id;
              const isContradictions = item.id === 'contradictions';
              const showBadge =
                isContradictions &&
                unresolvedCount !== null &&
                unresolvedCount > 0;

              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 ${
                    active
                      ? 'bg-primary/15 text-primary'
                      : dark
                        ? 'text-nexus-text-muted-dark hover:text-nexus-text-dark hover:bg-white/5'
                        : 'text-nexus-text-muted-light hover:text-nexus-text-light hover:bg-black/5'
                  }`}
                >
                  <span className="shrink-0 relative">
                    {item.icon}
                    {/* Badge dot for collapsed sidebar */}
                    {showBadge && collapsed && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-400" />
                    )}
                  </span>
                  {!collapsed && (
                    <span className="truncate flex-1">{item.label}</span>
                  )}
                  {/* Numeric badge for expanded sidebar */}
                  {!collapsed && showBadge && (
                    <span className="shrink-0 ml-auto text-xs font-semibold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">
                      {unresolvedCount! > 99 ? '99+' : unresolvedCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Bottom controls */}
          <div className="flex flex-col gap-1 px-2 py-3 border-t border-inherit">
            <button
              onClick={() => setDark(!dark)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150 ${
                dark
                  ? 'text-nexus-text-muted-dark hover:text-nexus-text-dark hover:bg-white/5'
                  : 'text-nexus-text-muted-light hover:text-nexus-text-light hover:bg-black/5'
              }`}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
              {!collapsed && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150 ${
                dark
                  ? 'text-nexus-text-muted-dark hover:text-nexus-text-dark hover:bg-white/5'
                  : 'text-nexus-text-muted-light hover:text-nexus-text-light hover:bg-black/5'
              }`}
            >
              {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        </aside>

        {/* Main */}
        <main
          className={`flex-1 overflow-y-auto ${dark ? 'bg-nexus-bg-dark' : 'bg-nexus-bg-light'}`}
        >
          <ViewContent view={view} />
        </main>
      </div>
    </ProjectContext.Provider>
  );
}
