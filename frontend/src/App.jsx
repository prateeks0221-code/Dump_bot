import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, RotateCw, Archive, Inbox, Image, FileText, Link2, File } from 'lucide-react';
import Card from './components/Card';

const FILTERS = [
  { key: 'all',    label: 'All',    icon: Inbox },
  { key: 'links',  label: 'Links',  icon: Link2 },
  { key: 'images', label: 'Images', icon: Image },
  { key: 'files',  label: 'Files',  icon: File },
  { key: 'notes',  label: 'Notes',  icon: FileText },
];

function getTimeGroup(iso) {
  const h = new Date(iso).getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 22) return 'Evening';
  return 'Night';
}

function formatDateHeader(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function matchesFilter(item, filterKey) {
  if (filterKey === 'all') return true;
  if (filterKey === 'links') return item.type === 'link' || !!item.link_kind;
  if (filterKey === 'images') return item.type === 'image';
  if (filterKey === 'files') return item.type === 'file' || item.type === 'audio' || item.type === 'video';
  if (filterKey === 'notes') return item.type === 'text' || item.type === 'unknown';
  return true;
}

function matchesSearch(item, q) {
  if (!q) return true;
  const hay = [
    item.title,
    item.og_title,
    item.og_description,
    item.raw_content,
    item.summary,
    item.og_site,
    item.link_kind,
    item.type,
    ...(item.tags || []),
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [lastFetch, setLastFetch] = useState(null);
  const [archivedIds, setArchivedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('desk-archived') || '[]')); }
    catch { return new Set(); }
  });

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/desk/items?today=true&limit=200');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setItems(data.items || []);
      setLastFetch(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    const id = setInterval(fetchItems, 60000);
    return () => clearInterval(id);
  }, [fetchItems]);

  const filtered = useMemo(() => {
    let list = items.filter((i) => !archivedIds.has(i.id));
    list = list.filter((i) => matchesFilter(i, activeFilter));
    list = list.filter((i) => matchesSearch(i, search));
    return list;
  }, [items, activeFilter, search, archivedIds]);

  const grouped = useMemo(() => {
    const map = {};
    for (const item of filtered) {
      const g = getTimeGroup(item.timestamp);
      if (!map[g]) map[g] = [];
      map[g].push(item);
    }
    const order = ['Night', 'Morning', 'Afternoon', 'Evening'];
    return order.filter((k) => map[k]).map((k) => ({ group: k, items: map[k] }));
  }, [filtered]);

  const todayStr = useMemo(() => {
    const d = new Date();
    return formatDateHeader(d.toISOString());
  }, []);

  const handleMarkRead = useCallback(async (id) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, processed: true } : i));
    try {
      await fetch(`/api/desk/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processed: true }),
      });
    } catch {}
  }, []);

  const handleArchive = useCallback((id) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem('desk-archived', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const unreadCount = useMemo(() => items.filter((i) => !i.processed && !archivedIds.has(i.id)).length, [items, archivedIds]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0f0f11' }}>
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: 'rgba(15,15,17,0.95)', borderColor: '#27272a', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-[800px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-sm font-semibold tracking-wide" style={{ color: '#e4e4e7' }}>
                Dirty Desk
              </h1>
              <p className="text-[11px] font-mono mt-0.5" style={{ color: '#52525b' }}>
                {todayStr} — {filtered.length} items{unreadCount > 0 ? ` · ${unreadCount} unread` : ''}
              </p>
            </div>
            <button
              onClick={fetchItems}
              className="p-2 rounded-lg border border-[#27272a] hover:border-[#3f3f46] transition-colors"
              style={{ color: '#a1a1aa' }}
              title="Refresh"
            >
              <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#52525b' }} />
              <input
                type="text"
                placeholder="Search dumps…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-[12px] pl-8 pr-3 py-1.5 rounded-lg border outline-none transition-colors"
                style={{
                  backgroundColor: '#1a1a1e',
                  borderColor: '#27272a',
                  color: '#e4e4e7',
                }}
                onFocus={(e) => e.target.style.borderColor = '#3f3f46'}
                onBlur={(e) => e.target.style.borderColor = '#27272a'}
              />
            </div>
            <div className="flex gap-1.5">
              {FILTERS.map((f) => {
                const Icon = f.icon;
                const active = activeFilter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setActiveFilter(f.key)}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors"
                    style={{
                      borderColor: active ? '#60a5fa' : '#27272a',
                      color: active ? '#60a5fa' : '#a1a1aa',
                      backgroundColor: active ? 'rgba(96,165,250,0.08)' : 'transparent',
                    }}
                  >
                    <Icon size={12} />
                    <span className="hidden sm:inline">{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[800px] mx-auto px-4 py-5">
        {error && (
          <div className="text-center py-16 text-[13px] font-mono" style={{ color: '#ef4444' }}>
            ⚠ {error}
          </div>
        )}

        {!error && loading && items.length === 0 && (
          <div className="text-center py-16 text-[13px] font-mono" style={{ color: '#52525b' }}>
            Loading the desk…
          </div>
        )}

        {!error && !loading && filtered.length === 0 && (
          <div className="text-center py-16 text-[13px] font-mono" style={{ color: '#52525b' }}>
            {items.length === 0 ? 'Desk is clear — nothing dumped today.' : 'No items match your filter.'}
          </div>
        )}

        {grouped.map(({ group, items: groupItems }) => (
          <section key={group} className="mb-6">
            <h2 className="text-[10px] font-mono uppercase tracking-widest mb-3 px-1" style={{ color: '#52525b' }}>
              {group}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {groupItems.map((item) => (
                <Card
                  key={item.id}
                  item={item}
                  onMarkRead={handleMarkRead}
                  onArchive={handleArchive}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* Footer */}
      <footer className="max-w-[800px] mx-auto px-4 py-6 text-center">
        <p className="text-[10px] font-mono" style={{ color: '#3f3f46' }}>
          {lastFetch ? `Last refreshed ${lastFetch.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </p>
      </footer>
    </div>
  );
}
