import { useState } from 'react';
import { setToken } from '../lib/api';
import { Lock } from 'lucide-react';

export default function AuthGate({ onAuthed }) {
  const [val, setVal]   = useState('');
  const [err, setErr]   = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!val.trim()) return;
    setBusy(true);
    setErr('');

    setToken(val.trim());

    // Verify token works
    try {
      const r = await fetch('/api/search/status', {
        headers: { 'X-Portal-Token': val.trim() },
      });
      if (r.status === 401) {
        setErr('Wrong token.');
        setToken('');
      } else {
        onAuthed();
      }
    } catch {
      // Network error — accept token optimistically
      onAuthed();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: '#080810' }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#0f0f1a', border: '1px solid #1e1e3a',
          borderRadius: 16, padding: '40px 36px', width: 340, textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 16 }}>
          <Lock size={32} color="#6366f1" style={{ margin: '0 auto' }} />
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 3, color: '#6366f1', marginBottom: 24, textTransform: 'uppercase' }}>
          DUMP_BOT
        </div>
        <input
          type="password"
          placeholder="Portal token"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          autoFocus
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            background: '#161628', border: '1px solid #1e1e3a',
            color: '#e2e8f0', fontSize: 13, outline: 'none',
            marginBottom: 12,
          }}
        />
        {err && (
          <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 10 }}>{err}</div>
        )}
        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%', padding: '10px', borderRadius: 8,
            background: '#6366f1', color: '#fff', fontSize: 13,
            fontWeight: 700, border: 'none', cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}
