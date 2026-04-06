import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  Edit3,
  Loader2,
  Inbox,
  ChevronDown,
  ChevronUp,
  Tag,
  User,
  AlertTriangle,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ReviewDecision {
  id: string;
  title: string;
  description: string;
  reasoning: string;
  tags: string[];
  confidence: string;
  made_by: string;
  source: string;
  created_at: string;
  review_status: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function confidenceBadge(confidence: string) {
  const colors: Record<string, string> = {
    high: 'bg-green-500/15 text-green-600',
    medium: 'bg-amber-500/15 text-amber-600',
    low: 'bg-red-500/15 text-red-600',
  };
  return colors[confidence] ?? 'bg-[var(--border-light)] text-[var(--text-secondary)]';
}

/* ------------------------------------------------------------------ */
/*  Review Item                                                        */
/* ------------------------------------------------------------------ */

function ReviewItem({
  decision,
  onApprove,
  onReject,
}: {
  decision: ReviewDecision;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(decision.title);
  const [editDesc, setEditDesc] = useState(decision.description);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { patch } = useApi();

  async function handleApprove() {
    setActionLoading('approve');
    try {
      if (editing && (editTitle !== decision.title || editDesc !== decision.description)) {
        await patch(`/api/decisions/${decision.id}`, { title: editTitle, description: editDesc });
      }
      await onApprove(decision.id);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject() {
    setActionLoading('reject');
    try {
      await onReject(decision.id, rejectReason);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="card p-4 animate-slide-up">
      <div className="flex items-start gap-3">
        {/* Content */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="input w-full text-sm font-semibold mb-1"
            />
          ) : (
            <h3 className="text-sm font-semibold mb-1 leading-snug">{decision.title}</h3>
          )}

          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`text-2xs px-1.5 py-0.5 rounded-full capitalize ${confidenceBadge(decision.confidence)}`}>
              {decision.confidence}
            </span>
            <span className="text-2xs text-[var(--text-tertiary)] flex items-center gap-1">
              <User size={10} /> {decision.made_by}
            </span>
            <span className="text-2xs text-[var(--text-tertiary)]">
              {relativeTime(decision.created_at)}
            </span>
            <span className="text-2xs text-[var(--text-tertiary)] capitalize">{decision.source}</span>
          </div>

          {/* Tags */}
          {decision.tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <Tag size={10} className="text-[var(--text-tertiary)]" />
              {decision.tags.map((tag) => (
                <span key={tag} className="tag-pill text-2xs">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setEditing((e) => !e)}
            className="btn-ghost p-1.5"
            title="Edit before approving"
          >
            <Edit3 size={14} />
          </button>
          <button
            onClick={handleApprove}
            disabled={!!actionLoading}
            className="btn-ghost p-1.5 text-green-600 hover:bg-green-500/10"
            title="Approve"
          >
            {actionLoading === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          </button>
          <button
            onClick={() => setShowReject((v) => !v)}
            className="btn-ghost p-1.5 text-red-500 hover:bg-red-500/10"
            title="Reject"
          >
            <XCircle size={14} />
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="btn-ghost p-1"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded: reasoning + description */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-[var(--border-light)] space-y-2">
          {editing ? (
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="input w-full text-sm h-20 resize-y"
            />
          ) : (
            <>
              {decision.description && (
                <p className="text-sm text-[var(--text-secondary)]">{decision.description}</p>
              )}
              {decision.reasoning && (
                <div>
                  <p className="text-xs font-medium text-[var(--text-secondary)] mb-0.5">Reasoning</p>
                  <p className="text-sm text-[var(--text-secondary)]">{decision.reasoning}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Reject reason */}
      {showReject && (
        <div className="mt-3 pt-3 border-t border-[var(--border-light)] space-y-2">
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (optional)"
            className="input w-full text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleReject()}
          />
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => setShowReject(false)} className="btn-secondary text-xs">Cancel</button>
            <button
              onClick={handleReject}
              disabled={!!actionLoading}
              className="btn-primary text-xs bg-red-600 hover:bg-red-700 flex items-center gap-1.5"
            >
              {actionLoading === 'reject' ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ReviewQueue                                                        */
/* ------------------------------------------------------------------ */

export function ReviewQueue() {
  const { get, post } = useApi();
  const { projectId } = useProject();

  const [decisions, setDecisions] = useState<ReviewDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<ReviewDecision[]>(`/api/projects/${projectId}/review-queue`);
      setDecisions(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message :
        (typeof err === 'object' && err !== null && 'message' in err)
          ? String((err as { message: unknown }).message)
          : 'Failed to load review queue.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [get, projectId]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  async function handleApprove(id: string) {
    await post(`/api/decisions/${id}/approve`, {});
    await fetchQueue();
  }

  async function handleReject(id: string, reason: string) {
    await post(`/api/decisions/${id}/reject`, { reason });
    await fetchQueue();
  }

  /* ---- Loading ---------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="text-sm text-[var(--text-secondary)]">Loading review queue…</span>
        </div>
      </div>
    );
  }

  /* ---- Error ------------------------------------------------------ */
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="card p-6 max-w-md text-center">
          <AlertTriangle size={24} className="mx-auto mb-2 text-status-reverted" />
          <p className="text-sm text-status-reverted">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold mb-1">Review Queue</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {decisions.length} decision{decisions.length !== 1 ? 's' : ''} pending review
            </p>
          </div>
        </div>

        {/* Queue */}
        {decisions.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-xl bg-[var(--border-light)]/30 flex items-center justify-center mx-auto mb-4">
              <Inbox size={22} className="text-[var(--text-secondary)]" />
            </div>
            <p className="text-sm font-medium mb-1">No decisions pending review.</p>
            <p className="text-xs text-[var(--text-secondary)]">
              Decisions extracted from conversations will appear here for review.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {decisions.map((d) => (
              <ReviewItem
                key={d.id}
                decision={d}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
