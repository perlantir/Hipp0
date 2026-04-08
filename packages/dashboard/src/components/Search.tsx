import { useState, useRef, useEffect } from 'react';
import {
  Search as SearchIcon,
  Loader2,
  ChevronDown,
  ChevronUp,
  Tag,
  User,
  Clock,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';
import type { SearchResult, Decision } from '../types';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Search() {
  const { post } = useApi();
  const { projectId } = useProject();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const data = await post<SearchResult[]>(`/api/projects/${projectId}/decisions/search`, {
        query: query.trim(),
      });
      setResults(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function scoreLabel(score: number): string {
    if (score >= 0.9) return 'Excellent';
    if (score >= 0.7) return 'Good';
    if (score >= 0.5) return 'Fair';
    return 'Low';
  }

  function scoreColor(score: number): string {
    if (score >= 0.7) return 'text-status-active';
    if (score >= 0.5) return 'text-primary';
    return 'text-[var(--text-secondary)]';
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold tracking-tight mb-1">Search</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Semantic search across all decisions
          </p>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative rounded-2xl" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.4)' }}>
            <SearchIcon
              size={22}
              className="absolute left-5 top-1/2 -translate-y-1/2 text-primary pointer-events-none"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search decisions by meaning…"
              className="input pl-14 pr-6 py-5 text-lg rounded-2xl bg-transparent border-none focus:ring-0"
            />
            {loading && (
              <Loader2
                size={18}
                className="absolute right-5 top-1/2 -translate-y-1/2 animate-spin text-primary"
              />
            )}
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="rounded-2xl p-4 mb-4 border-status-reverted/40" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.4)' }}>
            <p className="text-sm text-status-reverted">{error}</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-6 animate-fade-in">
            <p className="text-xs text-[var(--text-secondary)] mb-2">
              {results.length} result{results.length !== 1 ? 's' : ''} found
            </p>

            {results.map((result) => {
              const isExpanded = expanded.has(result.decision.id);
              const d = result.decision;

              return (
                <div key={d.id} className="overflow-hidden rounded-2xl hover:-translate-y-1 transition-all duration-300" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.4)' }}>
                  {/* Header row */}
                  <button
                    onClick={() => toggleExpand(d.id)}
                    className="w-full text-left p-6 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="text-sm font-semibold leading-snug flex-1">{d.title}</h3>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`badge badge-${d.status}`}>{d.status}</span>
                        {isExpanded ? (
                          <ChevronUp
                            size={14}
                            className="text-[var(--text-secondary)]"
                          />
                        ) : (
                          <ChevronDown
                            size={14}
                            className="text-[var(--text-secondary)]"
                          />
                        )}
                      </div>
                    </div>

                    {/* Snippet */}
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2 mb-2">
                      {result.snippet || d.description}
                    </p>

                    {/* Meta row */}
                    <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                      <span className="text-2xl font-bold text-primary">
                        {(result.score * 100).toFixed(0)}%
                      </span>
                      <span className={`font-medium ${scoreColor(result.score)}`}>
                        {scoreLabel(result.score)}
                      </span>

                      {d.tags.length > 0 && (
                        <span className="flex items-center gap-1.5">
                          {d.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="px-3 py-1 rounded-full text-xs border border-white/20 bg-white/40">{tag}</span>
                          ))}
                          {d.tags.length > 3 && <span className="text-xs">+{d.tags.length - 3}</span>}
                        </span>
                      )}

                      {d.namespace && (
                        <span className="text-primary" style={{
                          display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                          backgroundColor: 'rgba(59,130,246,0.13)', border: '1px solid rgba(59,130,246,0.27)',
                        }}>
                          ns:{d.namespace}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-6 pb-6 pt-3 border-t border-white/20 animate-fade-in">
                      <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] block mb-1">
                            Made by
                          </label>
                          <p className="flex items-center gap-1.5">
                            <User size={12} />
                            {d.made_by}
                          </p>
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] block mb-1">
                            Date
                          </label>
                          <p className="flex items-center gap-1.5">
                            <Clock size={12} />
                            {new Date(d.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="mb-3">
                        <label className="text-xs text-[var(--text-secondary)] block mb-1">
                          Description
                        </label>
                        <p className="text-sm leading-relaxed">{d.description}</p>
                      </div>

                      {d.reasoning && (
                        <div className="mb-3">
                          <label className="text-xs text-[var(--text-secondary)] block mb-1">
                            Reasoning
                          </label>
                          <p className="text-sm leading-relaxed">{d.reasoning}</p>
                        </div>
                      )}

                      {d.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {d.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-3 py-1 text-xs rounded-full border border-white/20 bg-white/40"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {searched && results.length === 0 && !loading && !error && (
          <div className="text-center py-12">
            <SearchIcon
              size={28}
              className="mx-auto mb-2 text-[var(--text-tertiary)]"
            />
            <p className="text-sm text-[var(--text-secondary)]">
              No decisions found for "{query}"
            </p>
          </div>
        )}

        {/* Initial state */}
        {!searched && !loading && (
          <div className="text-center py-16">
            <SearchIcon
              size={32}
              className="mx-auto mb-3 text-[var(--text-tertiary)]"
            />
            <p className="text-sm text-[var(--text-secondary)]">
              Type a query and press Enter to search
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
