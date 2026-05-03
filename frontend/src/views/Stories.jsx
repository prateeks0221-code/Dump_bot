import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Plus, RotateCw, X } from 'lucide-react';
import StoryCard from '../components/StoryCard';
import { api } from '../lib/api';

const CATEGORIES = ['research', 'project', 'reference', 'personal', 'ops'];
const PRIORITIES = ['high', 'medium', 'low'];

const CATEGORY_COLORS = {
  research: '#60a5fa', project: '#4ade80', reference: '#a78bfa',
  personal: '#f472b6', ops: '#fb923c',
};

export default function Stories() {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', contextName: '', category: 'project', priority: 'medium', metaInfo: '', keyPoints: '' });
  const [saving, setSaving] = useState(false);

  const fetchStories = useCallback(async () => {
    try {
      setLoading(true);
      const d = await api.listStories();
      setStories(d.stories || []);
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStories(); }, [fetchStories]);

  const handleDropOnStory = useCallback(async (itemId, storyId) => {
    try { await api.assign(storyId, itemId); fetchStories(); }
    catch (e) { setError(e.message); }
  }, [fetchStories]);

  const handleCreate = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      await api.createStory({
        name: form.name.trim(),
        contextName: form.contextName.trim() || undefined,
        category: form.category,
        priority: form.priority,
        metaInfo: form.metaInfo || undefined,
        keyPoints: form.keyPoints || undefined,
      });
      setShowCreate(false);
      setForm({ name: '', contextName: '', category: 'project', priority: 'medium', metaInfo: '', keyPoints: '' });
      fetchStories();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return stories.filter((s) => {
      if (catFilter !== 'all' && (s.category || '').toLowerCase() !== catFilter) return false;
      if (!ql) return true;
      const hay = [s.name, s.context_name, s.category, s.key_points, s.meta_info, ...(s.tags || [])]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(ql);
    });
  }, [stories, q, catFilter]);

  const counts = useMemo(() => {
    const m = { all: stories.length };
    for (const c of CATEGORIES) m[c] = 0;
    for (const s of stories) {
      const c = (s.category || '').toLowerCase();
      if (m[c] !== undefined) m[c]++;
    }
    return m;
  }, [stories]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: 'rgba(15,15,17,0.95)', borderColor: '#27272a', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-[1100px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-sm font-semibold tracking-wide" style={{ color: '#e4e4e7' }}>Stories</h1>
              <p className="text-[11px] font-mono mt-0.5" style={{ color: '#52525b' }}>
                {filtered.length} of {stories.length} contexts
              </p>
            </div>
            <div className="flex gap-1.5">
              <button onClick={fetchStories}
                className="p-2 rounded-lg border border-[#27272a] hover:border-[#3f3f46]" style={{ color: '#a1a1aa' }}>
                <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border"
                style={{ borderColor: '#4ade80', color: '#4ade80', backgroundColor: '#4ade8011' }}>
                <Plus size={12} /> New Story
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#52525b' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search stories…"
                className="w-full text-[12px] pl-8 pr-3 py-1.5 rounded-lg border outline-none"
                style={{ backgroundColor: '#1a1a1e', borderColor: '#27272a', color: '#e4e4e7' }} />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {['all', ...CATEGORIES].map((c) => {
                const active = catFilter === c;
                const color = c === 'all' ? '#60a5fa' : CATEGORY_COLORS[c];
                return (
                  <button key={c} onClick={() => setCatFilter(c)}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg border"
                    style={{
                      borderColor: active ? color : '#27272a',
                      color: active ? color : '#a1a1aa',
                      backgroundColor: active ? color + '11' : 'transparent',
                    }}>
                    {c} <span style={{ color: '#52525b' }}>· {counts[c] || 0}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 py-5">
        {error && <div className="text-center py-8 text-[12px] font-mono" style={{ color: '#ef4444' }}>⚠ {error}</div>}
        {!error && loading && stories.length === 0 && (
          <div className="text-center py-16 text-[13px] font-mono" style={{ color: '#52525b' }}>Loading stories…</div>
        )}
        {!error && !loading && filtered.length === 0 && (
          <div className="text-center py-16 text-[13px] font-mono" style={{ color: '#52525b' }}>
            {stories.length === 0 ? 'No stories yet. Create your first context.' : 'No stories match.'}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <StoryCard key={s.id} story={s} onDropItem={handleDropOnStory} />
          ))}
        </div>
      </main>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/70" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-xl border shadow-2xl"
            style={{ backgroundColor: '#1a1a1e', borderColor: '#3f3f46' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#27272a' }}>
              <span className="text-[12px]" style={{ color: '#e4e4e7' }}>New Story</span>
              <button onClick={() => setShowCreate(false)} className="text-[#71717a] hover:text-[#e4e4e7]">
                <X size={14} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {[
                { k: 'name', label: 'Name *', required: true },
                { k: 'contextName', label: 'Context Name (subtitle)' },
              ].map(({ k, label }) => (
                <div key={k}>
                  <label className="text-[10px] font-mono uppercase tracking-wider" style={{ color: '#71717a' }}>{label}</label>
                  <input
                    autoFocus={k === 'name'}
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    className="w-full mt-1 text-[12px] px-3 py-1.5 rounded-lg border outline-none"
                    style={{ backgroundColor: '#0f0f11', borderColor: '#27272a', color: '#e4e4e7' }} />
                </div>
              ))}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider" style={{ color: '#71717a' }}>Category</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {CATEGORIES.map((c) => (
                    <button key={c} onClick={() => setForm({ ...form, category: c })}
                      className="text-[11px] px-2 py-1 rounded border"
                      style={{
                        borderColor: form.category === c ? CATEGORY_COLORS[c] : '#27272a',
                        color: form.category === c ? CATEGORY_COLORS[c] : '#a1a1aa',
                        backgroundColor: form.category === c ? CATEGORY_COLORS[c] + '11' : 'transparent',
                      }}>{c}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider" style={{ color: '#71717a' }}>Priority</label>
                <div className="flex gap-1.5 mt-1">
                  {PRIORITIES.map((p) => (
                    <button key={p} onClick={() => setForm({ ...form, priority: p })}
                      className="text-[11px] px-2 py-1 rounded border flex-1"
                      style={{
                        borderColor: form.priority === p ? '#fbbf24' : '#27272a',
                        color: form.priority === p ? '#fbbf24' : '#a1a1aa',
                        backgroundColor: form.priority === p ? '#fbbf2411' : 'transparent',
                      }}>{p}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider" style={{ color: '#71717a' }}>Key points</label>
                <textarea
                  value={form.keyPoints}
                  onChange={(e) => setForm({ ...form, keyPoints: e.target.value })}
                  rows={3}
                  className="w-full mt-1 text-[12px] px-3 py-1.5 rounded-lg border outline-none resize-none"
                  style={{ backgroundColor: '#0f0f11', borderColor: '#27272a', color: '#e4e4e7' }} />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowCreate(false)}
                  className="flex-1 text-[11px] px-3 py-1.5 rounded-lg border"
                  style={{ borderColor: '#27272a', color: '#a1a1aa' }}>Cancel</button>
                <button onClick={handleCreate} disabled={!form.name.trim() || saving}
                  className="flex-1 text-[11px] px-3 py-1.5 rounded-lg border"
                  style={{
                    borderColor: '#4ade80', color: '#4ade80', backgroundColor: '#4ade8011',
                    opacity: !form.name.trim() || saving ? 0.5 : 1,
                  }}>
                  {saving ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
