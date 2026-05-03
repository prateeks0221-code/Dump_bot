import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, RotateCw, Edit3, Save, Archive, RefreshCw, Folder, Hash, Clock } from 'lucide-react';
import Card from '../components/Card';
import AssignModal from '../components/AssignModal';
import { api } from '../lib/api';
import { navigate } from '../lib/router';

const CATEGORY_COLORS = {
  research: '#60a5fa', project: '#4ade80', reference: '#a78bfa',
  personal: '#f472b6', ops: '#fb923c',
};

function normalizeItem(p) {
  const props = p.properties || {};
  const get = (k, t) => {
    const v = props[k]; if (!v) return null;
    switch (t || v.type) {
      case 'title':        return v.title?.[0]?.plain_text || null;
      case 'rich_text':    return v.rich_text?.[0]?.plain_text || null;
      case 'select':       return v.select?.name || null;
      case 'multi_select': return v.multi_select?.map((s) => s.name) || [];
      case 'checkbox':     return v.checkbox ?? false;
      case 'date':         return v.date?.start || null;
      case 'url':          return v.url || null;
      default: return null;
    }
  };
  return {
    id: p.id,
    title: get('Title', 'title') || get('title', 'title'),
    type: get('type', 'select') || 'unknown',
    timestamp: get('timestamp', 'date') || p.created_time,
    processed: get('processed', 'checkbox') || false,
    raw_content: get('raw_content', 'rich_text'),
    summary: get('summary', 'rich_text'),
    tags: get('tags', 'multi_select') || [],
    file_url: get('file_url', 'url'),
    drive_file_id: get('drive_file_id', 'rich_text'),
    link_kind: get('link_kind', 'select'),
    link_url: get('link_url', 'url'),
    og_title: get('og_title', 'rich_text'),
    og_description: get('og_description', 'rich_text'),
    og_image: get('og_image', 'url')?.replaceAll('&amp;', '&'),
    og_site: get('og_site', 'rich_text'),
    story_id: props.Story?.relation?.[0]?.id || props.story?.relation?.[0]?.id || null,
    notion_url: p.url,
    last_edited: p.last_edited_time,
  };
}

export default function StoryDesk({ storyId }) {
  const [story, setStory] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [reassigning, setReassigning] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [s, it] = await Promise.all([api.getStory(storyId), api.storyItems(storyId)]);
      setStory(s.story);
      setItems((it.items || []).map(normalizeItem));
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [storyId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const startEdit = () => {
    setDraft({
      name: story.name || '',
      contextName: story.context_name || '',
      category: story.category || '',
      priority: story.priority || '',
      metaInfo: story.meta_info || '',
      keyPoints: story.key_points || '',
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      await api.updateStory(storyId, draft);
      setEditing(false);
      fetchAll();
    } catch (e) { setError(e.message); }
  };

  const handleRefresh = async () => {
    try { await api.refreshStory(storyId); fetchAll(); }
    catch (e) { setError(e.message); }
  };

  const handleArchive = async () => {
    if (!confirm('Archive this story? Items will be unassigned and moved back to Master_Dump (manual).')) return;
    try { await api.archiveStory(storyId); navigate('/stories'); }
    catch (e) { setError(e.message); }
  };

  const handleUnassign = async (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try { await api.unassign(id); fetchAll(); }
    catch (e) { setError(e.message); fetchAll(); }
  };

  const handleReassignOne = (id) => setReassigning({ itemIds: [id] });

  const c = CATEGORY_COLORS[(story?.category || '').toLowerCase()] || '#71717a';

  // Group items by type for sidebar tally
  const tally = useMemo(() => {
    const t = { audio: 0, video: 0, image: 0, link: 0, file: 0, text: 0 };
    for (const i of items) if (t[i.type] !== undefined) t[i.type]++;
    return t;
  }, [items]);

  if (loading && !story) {
    return <div className="max-w-[1100px] mx-auto px-4 py-16 text-center text-[12px] font-mono" style={{ color: '#52525b' }}>Loading story…</div>;
  }
  if (error) {
    return <div className="max-w-[1100px] mx-auto px-4 py-16 text-center text-[12px] font-mono" style={{ color: '#ef4444' }}>⚠ {error}</div>;
  }
  if (!story) return null;

  return (
    <>
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: 'rgba(15,15,17,0.95)', borderColor: '#27272a', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-[1100px] mx-auto px-4 py-3">
          <button onClick={() => navigate('/stories')}
            className="flex items-center gap-1.5 text-[11px] font-mono mb-2 hover:text-white"
            style={{ color: '#71717a' }}>
            <ArrowLeft size={12} /> Back to Stories
          </button>

          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c }} />
                {!editing ? (
                  <h1 className="text-base font-semibold" style={{ color: '#e4e4e7' }}>
                    {story.name || '(untitled)'}
                  </h1>
                ) : (
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="text-base font-semibold bg-transparent border-b outline-none flex-1"
                    style={{ color: '#e4e4e7', borderColor: '#3f3f46' }} />
                )}
              </div>
              {(story.context_name || editing) && (
                editing ? (
                  <input value={draft.contextName} onChange={(e) => setDraft({ ...draft, contextName: e.target.value })}
                    placeholder="Context name"
                    className="text-[12px] bg-transparent outline-none w-full mt-0.5"
                    style={{ color: '#a1a1aa' }} />
                ) : (
                  <p className="text-[12px]" style={{ color: '#a1a1aa' }}>{story.context_name}</p>
                )
              )}
              <div className="flex items-center gap-3 text-[10px] font-mono mt-1.5" style={{ color: '#52525b' }}>
                <span className="flex items-center gap-1"><Hash size={10} /> {items.length} items</span>
                <span className="flex items-center gap-1"><Folder size={10} /> {story.category || 'uncategorized'}</span>
                {story.priority && <span style={{ color: '#fbbf24' }}>● {story.priority}</span>}
                {story.last_active && (
                  <span className="flex items-center gap-1"><Clock size={10} /> {new Date(story.last_active).toLocaleString()}</span>
                )}
              </div>
            </div>

            <div className="flex gap-1.5 shrink-0">
              {!editing ? (
                <>
                  <button onClick={fetchAll}
                    className="p-1.5 rounded-md border border-[#27272a] hover:border-[#3f3f46]" style={{ color: '#a1a1aa' }} title="Refresh items">
                    <RotateCw size={12} />
                  </button>
                  <button onClick={handleRefresh}
                    className="p-1.5 rounded-md border border-[#27272a] hover:border-[#60a5fa]" style={{ color: '#a1a1aa' }} title="Recompute aggregates">
                    <RefreshCw size={12} />
                  </button>
                  <button onClick={startEdit}
                    className="flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-md border border-[#27272a] hover:border-[#fbbf24] hover:text-[#fbbf24]" style={{ color: '#a1a1aa' }}>
                    <Edit3 size={11} /> Edit
                  </button>
                  <button onClick={handleArchive}
                    className="p-1.5 rounded-md border border-[#27272a] hover:border-[#ef4444]" style={{ color: '#a1a1aa' }} title="Archive">
                    <Archive size={12} />
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setEditing(false)}
                    className="text-[11px] px-2 py-1.5 rounded-md border border-[#27272a]" style={{ color: '#a1a1aa' }}>
                    Cancel
                  </button>
                  <button onClick={saveEdit}
                    className="flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-md border"
                    style={{ borderColor: '#4ade80', color: '#4ade80', backgroundColor: '#4ade8011' }}>
                    <Save size={11} /> Save
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-5">
        <div>
          {/* Editable key points */}
          {(story.key_points || editing) && (
            <div className="mb-5 rounded-xl border p-4" style={{ borderColor: '#27272a', backgroundColor: '#1a1a1e' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: '#52525b' }}>
                Key Points
              </div>
              {editing ? (
                <textarea value={draft.keyPoints} onChange={(e) => setDraft({ ...draft, keyPoints: e.target.value })}
                  rows={3} className="w-full text-[12px] bg-transparent outline-none resize-none"
                  style={{ color: '#e4e4e7' }} />
              ) : (
                <p className="text-[12px] whitespace-pre-wrap leading-relaxed" style={{ color: '#d4d4d8' }}>
                  {story.key_points}
                </p>
              )}
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-16 text-[12px] font-mono" style={{ color: '#52525b' }}>
              No items in this story yet. Drag cards from Dirty Desk.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map((item) => (
                <Card
                  key={item.id}
                  item={item}
                  onAssign={handleReassignOne}
                  onUnassign={handleUnassign}
                />
              ))}
            </div>
          )}
        </div>

        {/* Side panel — tally + meta */}
        <aside className="hidden lg:block">
          <div className="sticky top-[140px] space-y-4">
            <div className="rounded-xl border p-3" style={{ borderColor: '#27272a', backgroundColor: '#1a1a1e' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#52525b' }}>
                Breakdown
              </div>
              {Object.entries(tally).map(([k, v]) => v > 0 && (
                <div key={k} className="flex items-center justify-between text-[11px] py-1"
                  style={{ color: '#a1a1aa' }}>
                  <span className="capitalize">{k}</span>
                  <span className="font-mono" style={{ color: '#e4e4e7' }}>{v}</span>
                </div>
              ))}
            </div>

            {(story.meta_info || editing) && (
              <div className="rounded-xl border p-3" style={{ borderColor: '#27272a', backgroundColor: '#1a1a1e' }}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#52525b' }}>
                  Meta
                </div>
                {editing ? (
                  <textarea value={draft.metaInfo} onChange={(e) => setDraft({ ...draft, metaInfo: e.target.value })}
                    rows={4} className="w-full text-[11px] bg-transparent outline-none resize-none"
                    style={{ color: '#d4d4d8' }} />
                ) : (
                  <p className="text-[11px] whitespace-pre-wrap" style={{ color: '#d4d4d8' }}>{story.meta_info}</p>
                )}
              </div>
            )}

            {story.tags?.length > 0 && (
              <div className="rounded-xl border p-3" style={{ borderColor: '#27272a', backgroundColor: '#1a1a1e' }}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: '#52525b' }}>
                  Tags
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {story.tags.map((t) => (
                    <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
                      style={{ borderColor: '#27272a', color: '#a1a1aa', backgroundColor: '#0f0f11' }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {story.notion_url && (
              <a href={story.notion_url} target="_blank" rel="noreferrer"
                className="block text-center text-[11px] font-mono py-2 rounded-lg border hover:border-[#60a5fa] hover:text-[#60a5fa]"
                style={{ borderColor: '#27272a', color: '#a1a1aa' }}>
                Open in Notion →
              </a>
            )}
          </div>
        </aside>
      </main>

      <AssignModal
        open={!!reassigning}
        itemIds={reassigning?.itemIds || []}
        onClose={() => setReassigning(null)}
        onAssigned={() => { setReassigning(null); fetchAll(); }}
      />
    </>
  );
}
