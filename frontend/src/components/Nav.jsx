import { Inbox, Layers } from 'lucide-react';
import { useRoute, navigate } from '../lib/router';

export default function Nav() {
  const route = useRoute();
  const tabs = [
    { path: '/desk',    label: 'Dirty Desk', icon: Inbox },
    { path: '/stories', label: 'Stories',    icon: Layers },
  ];
  const active = route.path;

  return (
    <div className="flex gap-1.5">
      {tabs.map(({ path, label, icon: Icon }) => {
        const isActive = active === path || (path === '/stories' && active === '/stories');
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors"
            style={{
              borderColor: isActive ? '#60a5fa' : '#27272a',
              color: isActive ? '#60a5fa' : '#a1a1aa',
              backgroundColor: isActive ? 'rgba(96,165,250,0.08)' : 'transparent',
            }}
          >
            <Icon size={12} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
