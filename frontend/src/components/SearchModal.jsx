import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, ExternalLink, Clock } from 'lucide-react';
import { api } from '../lib/api';

const RECENT_KEY   = 'dump-recent-searches';
const MAX_RECENT   = 5;
const DEBOUNCE_MS  = 320;

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}

function saveRecent(q) {
  const prev = getRecent().filter((r) => r !== q);
  localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...prev].slice(0, MAX_RECENT)));
}

const KIND_COLOR = {
  instagram: '#e1306c', youtube: '#ff4444', twitter: '#1da1f2',
  github: '#6ee86e', linkedin: '#0aa880', article: '#aaaaff',
  reddit: '#ff7744', link: '#999', notion: '#ddd',
};

export default function SearchModal({ open, onClose }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [focused, setFocused] = useState(0); // keyboard nav index
  const [recent,  setRecent]  = useState(getRecent());
  const inputRef  = useRef(null);
  const timerRef  = useRef(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setError(null);
      setFocused(0);
      setRecent(getRecent());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await api.search(q.trim());
      setResults(data.results || []);
    } catch (err) {
      setError(err.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (query.trim().length >= 2) {
      timerRef.current = setTimeout(() => doSearch(query), DEBOUNCE_MS);
    } else {
      setResults([]);
    }
    return () => clearTimeout(timerRef.current);
  }, [query, doSearch]);

  // Keyboard navigation
  function handleKeyDown(e) {
    const items = results;
    if (e.key === 'Escape')   { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused((f) => Math.min(f + 1, items.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused((f) => Math.max(f - 1, 0)); }
    if (e.key === 'Enter' && items[focused]) {
      openResult(items[focused]);
    }
  }

  function openResult(r) {
    saveRecent(query.trim());
    setRecent(getRecent());
    const url = r.link_url || r.notion_url;
    if (url) window.open(url, '_blank', 'noopener');
    onClose();
  }

  function handleRecentClick(q) {
    setQuery(q);
    doSearch(q);
  }

  function clearRecent() {
    localStorage.removeItem(RECENT_KEY);
    setRecent([]);
  }

  if (!open) return null;

  const showRecent  = !query && recent.length > 0;
  const showResults = results.length > 0;
  const showEmpty   = !loading && query.trim().length >= 2 && !showResults && !error;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 80,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%', maxWidth: 640, margin: '0 16px',
          background: '#0f0f1a', border: '1px solid #1e1e3a',
          borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Input bar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #1e1e3a' }}>
          <Search size={16} color="#64748b" style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setFocused(0); }}
            placeholder="Search everything… try 'AI coding' or 'productivity'"
            style={{
              flex: 1, padding: '16px 12px', background: 'transparent',
              border: 'none', outline: 'none', color: '#e2e8f0', fontSize: 15,
            }}
          />
          {loading && (
            <span style={{ fontSize: 10, color: '#6366f1', fontFamily: 'monospace', marginRight: 8 }}>
              ···
            </span>
          )}
          <button onClick={onClose} style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ maxHeight: 440, overflowY: 'auto' }}>

          {/* Recent searches */}
          {showRecent && (
            <div style={{ padding: '12px 16px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Recent
                </span>
                <button onClick={clearRecent} style={{ fontSize: 10, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Clear
                </button>
              </div>
              {recent.map((r) => (
                <div
                  key={r}
                  onClick={() => handleRecentClick(r)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 8px', borderRadius: 8, cursor: 'pointer',
                    color: '#a1a1aa', fontSize: 13,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#161628'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Clock size={12} />
                  {r}
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {showResults && (
            <div style={{ padding: '8px 0' }}>
              {results.map((r, i) => {
                const isFocused = i === focused;
                const kindColor = KIND_COLOR[r.link_kind] || '#6366f1';
                return (
                  <div
                    key={r.id}
                    onClick={() => openResult(r)}
                    onMouseEnter={() => setFocused(i)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '10px 16px', cursor: 'pointer',
                      background: isFocused ? '#161628' : 'transparent',
                      borderLeft: isFocused ? '2px solid #6366f1' : '2px solid transparent',
                    }}
                  >
                    {/* Thumbnail or color dot */}
                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                      {r.og_image ? (
                        <img
                          src={r.og_image} alt=""
                          style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: kindColor, marginTop: 6 }} />
                      )}
                    </div>

                    {/* Text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.title || '(untitled)'}
                      </div>
                      {r.og_desc && (
                        <div style={{ fontSize: 11, color: '#64748b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {r.og_desc}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        {r.link_kind && (
                          <span style={{ fontSize: 9, fontFamily: 'monospace', color: kindColor, textTransform: 'uppercase' }}>
                            {r.link_kind}
                          </span>
                        )}
                        {r.tags?.slice(0, 3).map((t) => (
                          <span key={t} style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace' }}>#{t}</span>
                        ))}
                        <span style={{ fontSize: 9, color: '#3f4556', fontFamily: 'monospace', marginLeft: 'auto' }}>
                          {Math.round(r.score * 100)}% match
                        </span>
                      </div>
                    </div>

                    <ExternalLink size={12} color="#3f4556" style={{ flexShrink: 0, marginTop: 4 }} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {showEmpty && (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: '#3f4556', fontSize: 13, fontFamily: 'monospace' }}>
              No results for "{query}"
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: '20px 16px', color: '#ef4444', fontSize: 12, fontFamily: 'monospace' }}>
              ✗ {error}
            </div>
          )}

          {/* Idle */}
          {!query && !showRecent && (
            <div style={{ padding: '30px 16px', textAlign: 'center', color: '#3f4556', fontSize: 12, fontFamily: 'monospace' }}>
              Type to search across all your dumps
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid #1e1e3a', display: 'flex', gap: 16, justifyContent: 'flex-end' }}>
          {[['↑↓', 'navigate'], ['↵', 'open'], ['esc', 'close']].map(([k, l]) => (
            <span key={k} style={{ fontSize: 10, color: '#3f4556', fontFamily: 'monospace' }}>
              <span style={{ background: '#161628', border: '1px solid #1e1e3a', borderRadius: 4, padding: '1px 5px', marginRight: 4 }}>{k}</span>
              {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
