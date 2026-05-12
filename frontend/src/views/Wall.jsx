import { useState, useEffect, useCallback } from 'react';
import { RotateCw, ShoppingBasket, ExternalLink, BookOpen } from 'lucide-react';
import { api } from '../lib/api';

const KIND_META = {
  twitter:   { icon: '𝕏',  color: '#1da1f2', label: 'X' },
  github:    { icon: '⌥',  color: '#6ee86e', label: 'GitHub' },
  youtube:   { icon: '▶',  color: '#ff4444', label: 'YouTube' },
  instagram: { icon: '◎',  color: '#e1306c', label: 'Instagram' },
  tiktok:    { icon: '♪',  color: '#69c9d0', label: 'TikTok' },
  reddit:    { icon: '◉',  color: '#ff7744', label: 'Reddit' },
  linkedin:  { icon: '∈',  color: '#0aa880', label: 'LinkedIn' },
  article:   { icon: '✦',  color: '#aaaaff', label: 'Article' },
  notion:    { icon: '◻',  color: '#dddddd', label: 'Notion' },
};

function notionPageUrl(pageId) {
  return `https://notion.so/${pageId.replace(/-/g, '')}`;
}

function SourceBadge({ kind }) {
  const m = KIND_META[kind];
  if (!m) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border"
      style={{ color: m.color, borderColor: m.color + '44', backgroundColor: m.color + '11' }}
    >
      <span>{m.icon}</span> {m.label}
    </span>
  );
}

function ChunkCard({ chunk, onToggleBasket }) {
  const [inBasket, setInBasket] = useState(chunk.in_basket);
  const [toggling, setToggling] = useState(false);

  const handleBasket = useCallback(async (e) => {
    e.stopPropagation();
    setToggling(true);
    const next = !inBasket;
    setInBasket(next);
    try {
      await onToggleBasket(chunk.id, next);
    } catch {
      setInBasket(!next);
    } finally {
      setToggling(false);
    }
  }, [chunk.id, inBasket, onToggleBasket]);

  const displayTitle = chunk.og_title || chunk.title || '(untitled)';
  const openUrl = chunk.source_url || chunk.link_url || chunk.notion_url;

  return (
    <div
      className="group relative rounded-xl border transition-all duration-200"
      style={{
        backgroundColor: '#1a1a1e',
        borderColor: inBasket ? '#f59e0b' : '#27272a',
        padding: '14px',
        boxShadow: inBasket ? '0 0 0 1px #f59e0b33 inset' : undefined,
      }}
    >
      {chunk.link_kind && KIND_META[chunk.link_kind] && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl"
          style={{ backgroundColor: KIND_META[chunk.link_kind].color }}
        />
      )}

      <h3 className="text-[13px] font-medium leading-snug mb-1.5 line-clamp-2" style={{ color: '#e4e4e7' }}>
        {displayTitle}
      </h3>

      {chunk.link_kind && <div className="mb-2"><SourceBadge kind={chunk.link_kind} /></div>}

      {chunk.summary && (
        <p className="text-[11px] leading-relaxed line-clamp-3 mb-3" style={{ color: '#a1a1aa' }}>
          {chunk.summary}
        </p>
      )}

      {chunk.story_name && (
        <div className="text-[10px] font-mono mb-2" style={{ color: '#52525b' }}>
          ↳ {chunk.story_name}
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto">
        <button
          onClick={handleBasket}
          disabled={toggling}
          title={inBasket ? 'Remove from basket' : 'Add to basket'}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors"
          style={{
            borderColor: inBasket ? '#f59e0b' : '#27272a',
            color: inBasket ? '#f59e0b' : '#52525b',
            backgroundColor: inBasket ? '#f59e0b11' : 'transparent',
          }}
        >
          <ShoppingBasket size={12} />
          {inBasket ? 'In basket' : 'Basket'}
        </button>

        {chunk.wiki_page_id && (
          <a
            href={notionPageUrl(chunk.wiki_page_id)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-[#27272a] hover:border-[#a78bfa] hover:text-[#a78bfa] transition-colors"
            style={{ color: '#52525b' }}
            title="Open wiki"
          >
            <BookOpen size={12} /> Wiki
          </a>
        )}

        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-[#27272a] hover:border-[#60a5fa] hover:text-[#60a5fa] transition-colors"
            style={{ color: '#52525b' }}
          >
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  );
}

function EpicSection({ epic, onToggleBasket, basketOnly }) {
  const chunks = basketOnly ? epic.chunks.filter((c) => c.in_basket) : epic.chunks;
  if (chunks.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[11px] font-mono uppercase tracking-widest" style={{ color: '#52525b' }}>
          {epic.name}
        </h2>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#27272a]" style={{ color: '#3f3f46' }}>
          {chunks.length}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {chunks.map((chunk) => (
          <ChunkCard key={chunk.id} chunk={chunk} onToggleBasket={onToggleBasket} />
        ))}
      </div>
    </section>
  );
}

export default function Wall() {
  const [epics, setEpics] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [basketOnly, setBasketOnly] = useState(false);

  const fetchWall = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getWall();
      setEpics(data.epics || []);
      setTotal(data.total || 0);
      setLastFetch(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWall();
    const id = setInterval(fetchWall, 60000);
    return () => clearInterval(id);
  }, [fetchWall]);

  const handleToggleBasket = useCallback(async (id, in_basket) => {
    await api.toggleBasket(id, in_basket);
  }, []);

  const basketCount = epics.reduce((n, e) => n + e.chunks.filter((c) => c.in_basket).length, 0);

  return (
    <>
      <header
        className="sticky top-0 z-40 border-b"
        style={{ backgroundColor: 'rgba(15,15,17,0.95)', borderColor: '#27272a', backdropFilter: 'blur(8px)' }}
      >
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold tracking-wide" style={{ color: '#e4e4e7' }}>The Wall</h1>
            <p className="text-[11px] font-mono mt-0.5" style={{ color: '#52525b' }}>
              {total} chunks · {epics.length} epics
              {basketCount > 0 && (
                <span className="ml-2" style={{ color: '#f59e0b' }}>· 🧺 {basketCount} in basket</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBasketOnly((v) => !v)}
              className="text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors"
              style={{
                borderColor: basketOnly ? '#f59e0b' : '#27272a',
                color: basketOnly ? '#f59e0b' : '#a1a1aa',
                backgroundColor: basketOnly ? '#f59e0b11' : 'transparent',
              }}
            >
              🧺 Basket{basketOnly ? ' (on)' : ''}
            </button>
            <button
              onClick={fetchWall}
              className="p-2 rounded-lg border border-[#27272a] hover:border-[#3f3f46]"
              style={{ color: '#a1a1aa' }}
            >
              <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-6">
        {error && (
          <div className="text-center py-16 text-[13px] font-mono" style={{ color: '#ef4444' }}>⚠ {error}</div>
        )}
        {!error && loading && epics.length === 0 && (
          <div className="text-center py-16 text-[13px] font-mono" style={{ color: '#52525b' }}>Loading the wall…</div>
        )}
        {!error && !loading && epics.length === 0 && (
          <div className="text-center py-16 text-[13px] font-mono" style={{ color: '#52525b' }}>
            No chunks yet. Send a reel link to Telegram to get started.
          </div>
        )}
        {epics.map((epic) => (
          <EpicSection key={epic.name} epic={epic} onToggleBasket={handleToggleBasket} basketOnly={basketOnly} />
        ))}
      </main>

      <footer className="max-w-[1400px] mx-auto px-4 py-6 text-center">
        <p className="text-[10px] font-mono" style={{ color: '#3f3f46' }}>
          {lastFetch ? `Last refreshed ${lastFetch.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </p>
      </footer>
    </>
  );
}
