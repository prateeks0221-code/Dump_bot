import { Folder, Clock, Hash } from 'lucide-react';
import { navigate } from '../lib/router';

const CATEGORY_COLORS = {
  research: '#60a5fa', project: '#4ade80', reference: '#a78bfa',
  personal: '#f472b6', ops: '#fb923c',
};

const PRIORITY_COLORS = { high: '#ef4444', medium: '#fbbf24', low: '#71717a' };

function relTime(iso) {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function StoryCard({ story, onDropItem, onClick }) {
  const cat = (story.category || '').toLowerCase();
  const c = CATEGORY_COLORS[cat] || '#71717a';
  const pri = (story.priority || '').toLowerCase();
  const pc = PRIORITY_COLORS[pri];

  const handleDragOver = (e) => {
    if (e.dataTransfer.types.includes('text/x-item-id')) {
      e.preventDefault();
      e.currentTarget.style.borderColor = c;
      e.currentTarget.style.backgroundColor = c + '11';
    }
  };
  const handleDragLeave = (e) => {
    e.currentTarget.style.borderColor = '#27272a';
    e.currentTarget.style.backgroundColor = '#1a1a1e';
  };
  const handleDrop = (e) => {
    e.preventDefault();
    handleDragLeave(e);
    const itemId = e.dataTransfer.getData('text/x-item-id');
    if (itemId && onDropItem) onDropItem(itemId, story.id);
  };

  return (
    <div
      onClick={onClick || (() => navigate(`/stories/${story.id}`))}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="group relative rounded-xl border transition-all duration-150 cursor-pointer hover:shadow-lg"
      style={{
        backgroundColor: '#1a1a1e',
        borderColor: '#27272a',
        padding: '14px',
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl" style={{ backgroundColor: c }} />

      <div className="flex items-start gap-2 mb-2">
        <Folder size={14} className="mt-0.5 shrink-0" style={{ color: c }} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate" style={{ color: '#e4e4e7' }}>
            {story.name || '(untitled)'}
          </div>
          {story.context_name && (
            <div className="text-[11px] truncate" style={{ color: '#a1a1aa' }}>
              {story.context_name}
            </div>
          )}
        </div>
        {pc && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase"
            style={{ color: pc, borderColor: pc + '33', backgroundColor: pc + '11', border: '1px solid' }}>
            {pri}
          </span>
        )}
      </div>

      {story.key_points && (
        <p className="text-[11px] leading-relaxed mb-2 line-clamp-2" style={{ color: '#71717a' }}>
          {story.key_points}
        </p>
      )}

      <div className="flex items-center gap-3 text-[10px] font-mono mt-2" style={{ color: '#52525b' }}>
        <span className="flex items-center gap-1">
          <Hash size={10} /> {story.item_count ?? 0}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={10} /> {relTime(story.last_active || story.updated_at)}
        </span>
        {story.category && (
          <span className="px-1.5 py-0.5 rounded" style={{ color: c, backgroundColor: c + '11' }}>
            {story.category}
          </span>
        )}
      </div>

      {story.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {story.tags.slice(0, 4).map((t) => (
            <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 rounded border"
              style={{ borderColor: '#27272a', color: '#a1a1aa', backgroundColor: '#0f0f11' }}>
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
