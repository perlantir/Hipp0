import { useState } from 'react';
import { KeyRound, ArrowRight, AlertCircle } from 'lucide-react';
import { setStoredApiKey } from '../hooks/useApi';

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setError('Please enter an API key');
      return;
    }

    setLoading(true);
    setError('');

    // Validate the key by hitting the health endpoint with auth
    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${baseUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      if (!res.ok) {
        setError('Invalid API key. Check your key and try again.');
        setLoading(false);
        return;
      }
      setStoredApiKey(trimmed);
      onLogin();
    } catch {
      setError('Cannot connect to server. Check the API URL and try again.');
      setLoading(false);
    }
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen px-4"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div
        className="w-full max-w-md p-8 rounded-xl"
        style={{
          background: 'var(--bg-card)',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-light)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-lg bg-[#D97706] flex items-center justify-center">
            <span className="text-white font-bold text-lg">N</span>
          </div>
          <span
            className="font-bold text-2xl tracking-tight"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
          >
            DeciGraph
          </span>
        </div>

        {/* Prompt */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <KeyRound size={20} style={{ color: 'var(--accent-primary)' }} />
            <h2
              className="text-lg font-semibold"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
            >
              Enter your API key to continue
            </h2>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={key}
              onChange={(e) => { setKey(e.target.value); setError(''); }}
              placeholder="dg_live_..."
              autoFocus
              className="input w-full"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.875rem',
              }}
            />
          </div>

          {error && (
            <div
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
              style={{
                color: 'var(--accent-danger)',
                background: 'var(--bg-secondary)',
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="btn-primary w-full flex items-center justify-center gap-2"
            style={{ opacity: loading || !key.trim() ? 0.6 : 1 }}
          >
            {loading ? (
              <span>Connecting...</span>
            ) : (
              <>
                <span>Connect</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Help text */}
        <p
          className="text-center text-xs mt-6"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          Don't have a key? Create a project via the CLI first.
        </p>
      </div>
    </div>
  );
}
