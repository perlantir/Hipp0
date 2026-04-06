import { useState, useEffect, useCallback } from 'react';
import { useApi, clearStoredApiKey } from '../hooks/useApi';
import { useProject } from '../App';
import {
  Plus,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Key,
  AlertTriangle,
  Loader2,
  LogOut,
  Clock,
  Shield,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked: boolean;
}

interface CreatedKey {
  id: string;
  key: string;
  prefix: string;
  name: string;
  warning: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ApiKeys() {
  const { get, post, del } = useApi();
  const { projectId } = useProject();

  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpDays, setNewKeyExpDays] = useState('');
  const [creating, setCreating] = useState(false);

  // Created key display
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  // Confirm revoke
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    if (projectId === 'default') return;
    setLoading(true);
    try {
      const data = await get<ApiKeyRecord[]>(`/api/projects/${projectId}/keys`);
      setKeys(data ?? []);
      setError('');
    } catch {
      setError('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, [get, projectId]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  async function handleCreate() {
    setCreating(true);
    try {
      const body: Record<string, unknown> = { name: newKeyName || 'Default' };
      const days = parseInt(newKeyExpDays, 10);
      if (days > 0) body.expires_in_days = days;

      const result = await post<CreatedKey>(`/api/projects/${projectId}/keys`, body);
      setCreatedKey(result);
      setShowCreate(false);
      setNewKeyName('');
      setNewKeyExpDays('');
      fetchKeys();
    } catch {
      setError('Failed to create key');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    try {
      await del(`/api/projects/${projectId}/keys/${keyId}`);
      setRevokeTarget(null);
      fetchKeys();
    } catch {
      setError('Failed to revoke key');
    }
  }

  async function handleRotate(keyId: string) {
    try {
      const result = await post<CreatedKey>(`/api/projects/${projectId}/keys/${keyId}/rotate`, {});
      setCreatedKey(result);
      fetchKeys();
    } catch {
      setError('Failed to rotate key');
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleLogout() {
    clearStoredApiKey();
    window.location.reload();
  }

  const activeKeys = keys.filter((k) => !k.revoked);
  const revokedKeys = keys.filter((k) => k.revoked);

  if (projectId === 'default') {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="card p-8 text-center">
          <Key size={32} style={{ color: 'var(--text-tertiary)' }} className="mx-auto mb-3" />
          <p style={{ color: 'var(--text-secondary)' }}>Select a project to manage API keys.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
            API Keys
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Manage authentication keys for this project
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            Create New Key
          </button>
          <button
            onClick={handleLogout}
            className="btn-ghost flex items-center gap-2"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-2 text-sm px-4 py-3 rounded-lg"
          style={{ background: 'var(--alert-bg)', border: `1px solid var(--accent-danger)`, color: 'var(--accent-danger)' }}
        >
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}

      {/* Created key banner */}
      {createdKey && (
        <div
          className="card p-5 space-y-3"
          style={{ border: '2px solid var(--accent-primary)' }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} style={{ color: 'var(--accent-primary)' }} />
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {createdKey.warning}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                wordBreak: 'break-all',
              }}
            >
              {createdKey.key}
            </code>
            <button
              onClick={() => handleCopy(createdKey.key)}
              className="btn-secondary flex items-center gap-1"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="text-xs underline"
            style={{ color: 'var(--text-secondary)' }}
          >
            I've saved this key
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="card p-8 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
        </div>
      ) : (
        <>
          {/* Active keys */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
              <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                Active Keys ({activeKeys.length})
              </h2>
            </div>
            {activeKeys.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <Key size={24} style={{ color: 'var(--text-tertiary)' }} className="mx-auto mb-2" />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  No active API keys. Create one to get started.
                </p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
                {activeKeys.map((k) => (
                  <div key={k.id} className="px-5 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Shield size={14} style={{ color: 'var(--accent-success)' }} />
                        <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                          {k.name}
                        </span>
                        <code
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-secondary)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {k.key_prefix}...
                        </code>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        <span>Created {formatDate(k.created_at)}</span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          Last used: {timeAgo(k.last_used_at)}
                        </span>
                        {k.expires_at && (
                          <span>Expires {formatDate(k.expires_at)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleRotate(k.id)}
                        className="btn-ghost p-2"
                        title="Rotate key"
                      >
                        <RefreshCw size={14} />
                      </button>
                      <button
                        onClick={() => setRevokeTarget(k.id)}
                        className="btn-ghost p-2"
                        title="Revoke key"
                        style={{ color: 'var(--accent-danger)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Revoked keys */}
          {revokedKeys.length > 0 && (
            <div className="card overflow-hidden" style={{ opacity: 0.7 }}>
              <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
                <h2 className="font-semibold text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Revoked Keys ({revokedKeys.length})
                </h2>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
                {revokedKeys.map((k) => (
                  <div key={k.id} className="px-5 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm line-through" style={{ color: 'var(--text-tertiary)' }}>
                          {k.name}
                        </span>
                        <span
                          className="text-2xs px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--accent-danger)', color: 'white' }}
                        >
                          Revoked
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="w-full max-w-md p-6 rounded-xl space-y-4"
            style={{
              background: 'var(--bg-card)',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border-light)',
            }}
          >
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Create New API Key
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Key Name
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Production, CI/CD"
                  className="input w-full"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Expiration (days, optional)
                </label>
                <input
                  type="number"
                  value={newKeyExpDays}
                  onChange={(e) => setNewKeyExpDays(e.target.value)}
                  placeholder="e.g. 90"
                  className="input w-full"
                  min="1"
                  max="365"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowCreate(false); setNewKeyName(''); setNewKeyExpDays(''); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="btn-primary flex items-center gap-2"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke confirmation modal */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="w-full max-w-sm p-6 rounded-xl space-y-4"
            style={{
              background: 'var(--bg-card)',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border-light)',
            }}
          >
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Revoke API Key?
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              This key will immediately stop working. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => setRevokeTarget(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => handleRevoke(revokeTarget)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--accent-danger)' }}
              >
                Revoke Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
