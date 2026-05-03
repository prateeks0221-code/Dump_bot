import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Plus, X, Layers, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

const CATEGORY_COLORS = {
  research: '#60a5fa', project: '#4ade80', reference: '#a78bfa',
  personal: '#f472b6', ops: '#fb923c',
};

// itemIds = array; on assign, all items get assigned to chosen story
export default function AssignModal({ open, itemIds, onClose, onAssigned }) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [q, setQ] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('project');
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ(''); setHighlight(0); setCreating(false); setError(null);
    setLoading(true);
    api.listStories()
      .then((d) => setStories(d.stories || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return stories;
    return stories.filter((s) =>
      [s.name, s.context_name, s.category, ...(s.tags || [])]
        .filter(Boolean).join(' ').toLowerCase().includes(ql)
    );
  }, [stories, q]);

  const assignTo = async (storyId) => {
    if (!storyId || working) return;
    setWorking(true); setError(null);
    try {
      for (const itemId of itemIds) {
        await api.assign(storyId, itemId);
      }
      onAssigned?.(storyId);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || working) return;
    setWorking(true); setError(null);
    try {
      const { story } = await api.createStory({ name: newName.trim(), category: newCategory });
      for (const itemId of itemIds) {
        await api.assign(story.id, itemId);
      }
      onAssigned?.(story.id);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Escape') return onClose();
    if (creating) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtered.length)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight < filtered.length) assignTo(filtered[highlight]?.id);
      else if (q.trim()) { setNewName(q); setCreating(true); }
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border shadow-2xl"
        style={{ backgroundColor: '#1a1a1e', borderColor: '#3f3f46' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#27272a' }}>
          <div className="flex items-center gap-2 text-[12px]" style={{ color: '#e4e4e7' }}>
            <Layers size={13} style={{ color: '#60a5fa' }} />
            <span>Assign {itemIds.length > 1 ? `${itemIds.length} items` : 'item'} → Story</span>
          </div>
          <button onClick={onClose} className="text-[#71717a] hover:text-[#e4e4e7]">
            <X size={14} />
          </button>
        </div>

        {!creating && (
          <>
            {/* Search */}
            <div className="relative px-4 py-3 border-b" style={{ borderColor: '#27272a' }}>
              <Search size={13} className="absolute left-7 top-1/2 -translate-y-1/2" style={{ color: '#52525b' }} />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setHighlight(0); }}
                onKeyDown={onKey}
                placeholder="Search stories or type new name…"
                className="w-full text-[12px] pl-7 pr-3 py-1.5 rounded-lg border outline-none"
                style={{ backgroundColor: '#0f0f11', borderColor: '#27272a', color: '#e4e4e7' }}
              />
            </div>

            {/* List */}
            <div className="max-h-72 overflow-y-auto py-1">
              {loading && (
                <div className="flex items-center justify-center py-8 text-[12px]" style={{ color: '#52525b' }}>
                  <Loader2 size={14} className="animate-spin mr-2" /> Loading…
                </div>
              )}
              {!loading && filtered.length === 0 && q && (
                <button
                  onClick={() => { setNewName(q); setCreating(true); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-[12px] hover:bg-[#27272a]/40"
                  style={{ color: '#4ade80' }}
                >
                  <Plus size={13} /> Create "{q}"
                </button>
              )}
              {!loading && filtered.map((s, i) => {
                const cat = (s.category || '').toLowerCase();
                const c = CATEGORY_COLORS[cat] || '#71717a';
                return (
                  <button
                    key={s.id}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => assignTo(s.id)}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors"
                    style={{
                      backgroundColor: highlight === i ? 'rgba(96,165,250,0.1)' : 'transparent',
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] truncate" style={{ color: '#e4e4e7' }}>{s.name || '(untitled)'}</div>
                      <div className="text-[10px] font-mono" style={{ color: '#52525b' }}>
                        {s.category || 'uncategorized'}
                        {typeof s.item_count === 'number' ? ` · ${s.item_count} items` : ''}
                      </div>
                    </div>
                  </button>
                );
              })}
              {!loading && filtered.length > 0 && q && (
                <button
                  onClick={() => { setNewName(q); setCreating(true); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-[11px] border-t hover:bg-[#27272a]/40"
                  style={{ color: '#4ade80', borderColor: '#27272a' }}
                >
                  <Plus size={12} /> Create new story
                </button>
              )}
            </div>
          </>
        )}

        {creating && (
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider" style={{ color: '#71717a' }}>
                New story name
              </label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                className="w-full mt-1 text-[12px] px-3 py-1.5 rounded-lg border outline-none"
                style={{ backgroundColor: '#0f0f11', borderColor: '#27272a', color: '#e4e4e7' }}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider" style={{ color: '#71717a' }}>Category</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Object.keys(CATEGORY_COLORS).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setNewCategory(cat)}
                    className="text-[11px] px-2 py-1 rounded border"
                    style={{
                      borderColor: newCategory === cat ? CATEGORY_COLORS[cat] : '#27272a',
                      color: newCategory === cat ? CATEGORY_COLORS[cat] : '#a1a1aa',
                      backgroundColor: newCategory === cat ? CATEGORY_COLORS[cat] + '11' : 'transparent',
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setCreating(false)}
                className="flex-1 text-[11px] px-3 py-1.5 rounded-lg border"
                style={{ borderColor: '#27272a', color: '#a1a1aa' }}
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || working}
                className="flex-1 text-[11px] px-3 py-1.5 rounded-lg border"
                style={{
                  borderColor: '#4ade80',
                  color: '#4ade80',
                  backgroundColor: '#4ade8011',
                  opacity: !newName.trim() || working ? 0.5 : 1,
                }}
              >
                {working ? 'Creating…' : 'Create + Assign'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="px-4 py-2 text-[11px] font-mono border-t" style={{ color: '#ef4444', borderColor: '#27272a' }}>
            ⚠ {error}
          </div>
        )}

        <div className="px-4 py-2 text-[10px] font-mono border-t flex justify-between" style={{ borderColor: '#27272a', color: '#52525b' }}>
          <span>↑↓ navigate · ↵ select · esc close</span>
          {working && <Loader2 size={11} className="animate-spin" />}
        </div>
      </div>
    </div>
  );
}
