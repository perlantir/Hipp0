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
  | 'stats';

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
    default:
      return <DecisionGraph />;
  }
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  const [view, setView] = useState<View>(getViewFromHash);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(true);
  const [projectId, setProjectId] = useState('default');

  // Sync hash → view
  useEffect(() => {
    function onHash() {
      setView(getViewFromHash());
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Navigate
  function navigate(v: View) {
    window.location.hash = v;
    setView(v);
  }

  // Theme toggle
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

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
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
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
