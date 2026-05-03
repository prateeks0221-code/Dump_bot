import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, RotateCw, Inbox, Image, FileText, Link2, File, Layers, X, Grid3x3, BookOpen } from 'lucide-react';
import Card from '../components/Card';
import AssignModal from '../components/AssignModal';
import { api } from '../lib/api';
import { navigate } from '../lib/router';

const FILTERS = [
  { key: 'all',        label: 'All',        icon: Inbox },
  { key: 'links',      label: 'Links',      icon: Link2 },
  { key: 'images',     label: 'Images',     icon: Image },
  { key: 'files',      label: 'Files',      icon: File },
  { key: 'notes',      label: 'Notes',      icon: FileText },
];

const CATEGORY_COLORS = {
  research: '#60a5fa', project: '#4ade80', reference: '#a78bfa',
  personal: '#f472b6', ops: '#fb923c',
};

function getTimeGroup(iso) {
  const h = new Date(iso).getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 22) return 'Evening';
  return 'Night';
}

function formatDateHeader(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function matchesFilter(item, key) {
  if (key === 'all') return true;
  if (key === 'links') return item.type === 'link' || !!item.link_kind;
  if (key === 'images') return item.type === 'image';
  if (key === 'files') return item.type === 'file' || item.type === 'audio' || item.type === 'video';
  if (key === 'notes') return item.type === 'text' || item.type === 'unknown';
  return true;
}

function matchesSearch(item, q) {
  if (!q) return true;
  const hay = [item.title, item.og_title, item.og_description, item.raw_content, item.summary,
    item.og_site, item.link_kind, item.type, ...(item.tags || [])].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

function normalize(item) {
  const o = item || {};
  const ts = (typeof o.timestamp === 'string' && o.timestamp) || new Date().toISOString();
  return {
    ...o,
    id: o.id || crypto.randomUUID(),
    title: o.title || null,
    type: o.type || 'unknown',
    timestamp: ts,
    processed: !!o.processed,
    tags: Array.isArray(o.tags) ? o.tags.filter((t) => typeof t === 'string') : [],
    notion_url: o.notion_url || '#',
    last_edited: o.last_edited || ts,
    og_image: typeof o.og_image === 'string' ? o.og_image.replaceAll('&amp;', '&') : null,
    story_id: o.story_id || null,
  };
}

export default function Desk() {
  const [items, setItems] = useState([]);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [lastFetch, setLastFetch] = useState(null);
  const [viewMode, setViewMode] = useState('all'); // 'all' or 'stories'
  const [archivedIds, setArchivedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('desk-archived') || '[]')); }
    catch { return new Set(); }
  });
  const [selected, setSelected] = useState(new Set());
  const [assignTarget, setAssignTarget] = useState(null); // { itemIds: [...] }

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [itemsData, storiesData] = await Promise.all([
        api.getItems({ unassignedOnly: true, limit: 200 }),
        api.listStories(),
      ]);
      setItems(Array.isArray(itemsData.items) ? itemsData.items.map(normalize) : []);
      setStories(storiesData.stories || []);
      setLastFetch(new Date());
      setError(null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 60000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const storyById = useMemo(() => {
    const m = {};
    for (const s of stories) m[s.id] = s;
    return m;
  }, [stories]);

  const filtered = useMemo(() => {
    return items
      .filter((i) => !archivedIds.has(i.id))
      .filter((i) => matchesFilter(i, activeFilter))
      .filter((i) => matchesSearch(i, search));
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

  const todayStr = useMemo(() => formatDateHeader(new Date().toISOString()), []);
  const unassignedCount = useMemo(() => items.filter((i) => !i.story_id && !archivedIds.has(i.id)).length, [items, archivedIds]);

  const handleMarkRead = useCallback(async (id) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, processed: true } : i));
    try { await api.patchItem(id, { processed: true }); } catch {}
  }, []);

  const handleArchive = useCallback((id) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem('desk-archived', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleAssignOne = useCallback((id) => setAssignTarget({ itemIds: [id] }), []);
  const handleUnassign = useCallback(async (id) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, story_id: null } : i));
    try { await api.unassign(id); } catch (e) { setError(e.message); }
  }, []);

  const handleToggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => setSelected(new Set());

  const handleBulkAssign = () => {
    if (selected.size === 0) return;
    setAssignTarget({ itemIds: [...selected] });
  };

  // Drop target helpers (story chips in sidebar)
  const onChipDragOver = (e, c) => {
    if (e.dataTransfer.types.includes('text/x-item-id')) {
      e.preventDefault();
      e.currentTarget.style.borderColor = c;
      e.currentTarget.style.backgroundColor = c + '22';
    }
  };
  const onChipDragLeave = (e) => {
    e.currentTarget.style.borderColor = '#27272a';
    e.currentTarget.style.backgroundColor = 'transparent';
  };
  const onChipDrop = async (e, storyId) => {
    e.preventDefault();
    onChipDragLeave(e);
    const itemId = e.dataTransfer.getData('text/x-item-id');
    if (!itemId) return;
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, story_id: storyId } : i));
    try { await api.assign(storyId, itemId); fetchAll(); }
    catch (err) { setError(err.message); }
  };

  const onAssigned = () => { clearSelection(); fetchAll(); };

  return (
    <>
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: 'rgba(15,15,17,0.98)', borderColor: '#27272a', backdropFilter: 'blur(10px)' }}>
        <div className="max-w-[1100px] mx-auto px-4 py-4">
          {/* Title & View Mode Tabs */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-sm font-semibold tracking-wide" style={{ color: '#e4e4e7' }}>Dirty Desk</h1>
                <div className="flex gap-1 border-l border-[#27272a] pl-3">
                  <button
                    onClick={() => setViewMode('all')}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
                    style={{
                      borderColor: viewMode === 'all' ? '#60a5fa' : 'transparent',
                      color: viewMode === 'all' ? '#60a5fa' : '#a1a1aa',
                      backgroundColor: viewMode === 'all' ? '#60a5fa11' : 'transparent',
                      border: viewMode === 'all' ? '1px solid #60a5fa' : '1px solid transparent',
                    }}
                  >
                    <Grid3x3 size={13} />
                    All Dumps
                  </button>
                  <button
                    onClick={() => { setViewMode('stories'); navigate('/stories'); }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
                    style={{
                      borderColor: viewMode === 'stories' ? '#4ade80' : 'transparent',
                      color: viewMode === 'stories' ? '#4ade80' : '#a1a1aa',
                      backgroundColor: viewMode === 'stories' ? '#4ade8011' : 'transparent',
                      border: viewMode === 'stories' ? '1px solid #4ade80' : '1px solid transparent',
                    }}
                  >
                    <BookOpen size={13} />
                    Stories
                  </button>
                </div>
              </div>
              <p className="text-[10px] font-mono" style={{ color: '#52525b' }}>
                {todayStr} • {filtered.length} items
              </p>
            </div>
            <button onClick={fetchAll} className="p-2 rounded-lg border border-[#27272a] hover:border-[#3f3f46] transition-colors" style={{ color: '#a1a1aa' }}>
              <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#52525b' }} />
              <input
                type="text" placeholder="Search dumps…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full text-[12px] pl-8 pr-3 py-1.5 rounded-lg border outline-none"
                style={{ backgroundColor: '#1a1a1e', borderColor: '#27272a', color: '#e4e4e7' }}
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {FILTERS.map(({ key, label, icon: Icon }) => {
                const active = activeFilter === key;
                return (
                  <button key={key} onClick={() => setActiveFilter(key)}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border transition-all"
                    style={{
                      borderColor: active ? '#60a5fa' : '#27272a',
                      color: active ? '#60a5fa' : '#a1a1aa',
                      backgroundColor: active ? '#60a5fa08' : 'transparent',
                    }}>
                    <Icon size={12} />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-[120px] z-30 border-b" style={{ backgroundColor: '#60a5fa11', borderColor: '#60a5fa33' }}>
          <div className="max-w-[1100px] mx-auto px-4 py-2 flex items-center gap-3">
            <span className="text-[11px] font-mono" style={{ color: '#60a5fa' }}>
              {selected.size} selected
            </span>
            <button onClick={handleBulkAssign}
              className="text-[11px] flex items-center gap-1 px-2.5 py-1 rounded-md border"
              style={{ borderColor: '#60a5fa', color: '#60a5fa', backgroundColor: '#60a5fa11' }}>
              <Layers size={12} /> Assign all
            </button>
            <button onClick={clearSelection}
              className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-md hover:text-white"
              style={{ color: '#a1a1aa' }}>
              <X size={12} /> Clear
            </button>
            <span className="text-[10px] font-mono ml-auto" style={{ color: '#52525b' }}>
              shift-click to select
            </span>
          </div>
        </div>
      )}

      <main className="max-w-[1100px] mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-5">
        {/* Items column */}
        <div>
          {error && (
            <div className="text-center py-16 text-[13px] font-mono" style={{ color: '#ef4444' }}>⚠ {error}</div>
          )}
          {!error && loading && items.length === 0 && (
            <div className="text-center py-16 text-[13px] font-mono" style={{ color: '#52525b' }}>Loading the desk…</div>
          )}
          {!error && !loading && filtered.length === 0 && (
            <div className="text-center py-16 text-[13px] font-mono" style={{ color: '#52525b' }}>
              {items.length === 0 ? 'Desk is clear.' : 'No items match your filter.'}
            </div>
          )}
          {grouped.map(({ group, items: groupItems }) => (
            <section key={group} className="mb-8">
              <h2 className="text-[10px] font-mono uppercase tracking-widest mb-3 px-1 text-[#3f3f46]">
                {group}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {groupItems.map((item) => (
                  <Card
                    key={item.id}
                    item={item}
                    selected={selected.has(item.id)}
                    storyName={item.story_id ? storyById[item.story_id]?.name : null}
                    onMarkRead={handleMarkRead}
                    onArchive={handleArchive}
                    onAssign={handleAssignOne}
                    onUnassign={handleUnassign}
                    onToggleSelect={handleToggleSelect}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Stories sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-[140px]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#52525b' }}>
                Stories ({stories.length})
              </h2>
              <button onClick={() => navigate('/stories')}
                className="text-[10px] font-mono hover:underline transition-colors" style={{ color: '#60a5fa' }}>
                View all →
              </button>
            </div>
            <p className="text-[10px] font-mono mb-2" style={{ color: '#3f3f46' }}>
              drop to assign
            </p>
            <div className="flex flex-col gap-1.5 max-h-[70vh] overflow-y-auto pr-1">
              {stories.length === 0 && (
                <div className="text-[11px] font-mono py-3" style={{ color: '#52525b' }}>
                  No stories yet.
                </div>
              )}
              {stories.map((s) => {
                const c = CATEGORY_COLORS[(s.category || '').toLowerCase()] || '#71717a';
                return (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/stories/${s.id}`)}
                    onDragOver={(e) => onChipDragOver(e, c)}
                    onDragLeave={onChipDragLeave}
                    onDrop={(e) => onChipDrop(e, s.id)}
                    className="group cursor-pointer rounded-lg border px-2.5 py-1.5 transition-all hover:border-current"
                    style={{ borderColor: '#27272a' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c }} />
                      <span className="text-[11px] truncate flex-1" style={{ color: '#e4e4e7' }}>
                        {s.name || '(untitled)'}
                      </span>
                      <span className="text-[9px] font-mono" style={{ color: '#52525b' }}>
                        {s.item_count ?? 0}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </main>

      <footer className="max-w-[1100px] mx-auto px-4 py-6 text-center">
        <p className="text-[10px] font-mono" style={{ color: '#3f3f46' }}>
          {lastFetch ? `Last refreshed ${lastFetch.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </p>
      </footer>

      <AssignModal
        open={!!assignTarget}
        itemIds={assignTarget?.itemIds || []}
        onClose={() => setAssignTarget(null)}
        onAssigned={onAssigned}
      />
    </>
  );
}
