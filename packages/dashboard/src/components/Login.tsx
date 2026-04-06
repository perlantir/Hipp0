import { useState, type FormEvent } from 'react';

interface LoginProps {
  onLogin: (apiKey: string) => void;
  error?: string | null;
}

export function Login({ onLogin, error }: LoginProps) {
  const [apiKey, setApiKey] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (apiKey.trim()) {
      onLogin(apiKey.trim());
    }
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div
        className="w-full max-w-sm p-8 rounded-xl shadow-lg"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-[#D97706] flex items-center justify-center">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <span className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>DeciGraph</span>
        </div>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="api-key"
            className="block text-sm font-medium mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            API Key
          </label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="dg_live_..."
            autoFocus
            className="w-full px-3 py-2 rounded-lg text-sm mb-4"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
            }}
          />
          {error && (
            <p className="text-sm text-red-500 mb-3">{error}</p>
          )}
          <button
            type="submit"
            className="w-full px-4 py-2 bg-[#D97706] text-white rounded-lg text-sm font-medium hover:bg-[#B45309] transition-colors"
          >
            Sign In
          </button>
        </form>

        <div className="mt-4 space-y-1">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Check your server logs for your API key.
          </p>
          <p className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
            Run: docker logs decigraph-server | grep "dg_live_"
          </p>
        </div>
      </div>
    </div>
  );
}
