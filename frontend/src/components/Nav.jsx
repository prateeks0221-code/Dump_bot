import { Inbox, Layers, LayoutGrid, Search } from 'lucide-react';
import { useRoute, navigate } from '../lib/router';

export default function Nav({ onSearchOpen }) {
  const route = useRoute();
  const tabs = [
    { path: '/desk',    label: 'Dirty Desk', icon: Inbox },
    { path: '/stories', label: 'Stories',    icon: Layers },
    { path: '/wall',    label: 'The Wall',   icon: LayoutGrid },
  ];
  const active = route.path;

  return (
    <div className="flex gap-1.5 items-center">
      {tabs.map(({ path, label, icon: Icon }) => {
        const isActive = active === path || (path === '/stories' && active === '/stories');
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors"
            style={{
              borderColor:     isActive ? '#60a5fa' : '#27272a',
              color:           isActive ? '#60a5fa' : '#a1a1aa',
              backgroundColor: isActive ? 'rgba(96,165,250,0.08)' : 'transparent',
            }}
          >
            <Icon size={12} />
            <span>{label}</span>
          </button>
        );
      })}

      {/* Search trigger */}
      <button
        onClick={onSearchOpen}
        className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors"
        title="Search (⌘K)"
        style={{ borderColor: '#27272a', color: '#a1a1aa' }}
      >
        <Search size={12} />
        <span className="hidden sm:inline">Search</span>
        <span
          className="hidden sm:inline text-[9px] font-mono px-1 rounded"
          style={{ background: '#1a1a1e', color: '#52525b', border: '1px solid #27272a' }}
        >
          ⌘K
        </span>
      </button>
    </div>
  );
}
