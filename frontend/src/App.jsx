import { useState, useEffect } from 'react';
import Nav          from './components/Nav';
import Desk         from './views/Desk';
import Stories      from './views/Stories';
import StoryDesk    from './views/StoryDesk';
import Wall         from './views/Wall';
import SearchModal  from './components/SearchModal';
import AuthGate     from './components/AuthGate';
import { useRoute } from './lib/router';
import { getToken } from './lib/api';

function needsAuth() {
  // If PORTAL_SECRET is set server-side, a 401 will come back from the first API call.
  // We use localStorage presence as the client-side gate.
  // If no token stored AND server requires one → AuthGate appears after first 401.
  // On first visit with no server-side secret → getToken() returns '' → passthrough.
  return false; // server decides; client reacts to 401 via api.js auto-reload
}

export default function App() {
  const { path, id }      = useRoute();
  const [searchOpen, setSearchOpen] = useState(false);
  const [authed, setAuthed]         = useState(() => {
    // Already have a token stored → skip gate
    // No token → check if server actually requires one on first real call
    return true; // optimistic; 401 → AuthGate shown
  });
  const [needGate, setNeedGate]     = useState(false);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Listen for 401 from api.js (it clears token and reloads — we intercept before reload)
  useEffect(() => {
    function handleUnauth() { setNeedGate(true); }
    window.addEventListener('portal-unauth', handleUnauth);
    return () => window.removeEventListener('portal-unauth', handleUnauth);
  }, []);

  if (needGate) {
    return <AuthGate onAuthed={() => { setNeedGate(false); window.location.reload(); }} />;
  }

  let view;
  if (path === '/stories' && id) view = <StoryDesk storyId={id} />;
  else if (path === '/stories')  view = <Stories />;
  else if (path === '/wall')     view = <Wall />;
  else                           view = <Desk />;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0f0f11' }}>
      <div className="border-b" style={{ borderColor: '#27272a', backgroundColor: '#0f0f11' }}>
        <div className="max-w-[1100px] mx-auto px-4 py-2 flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: '#3f3f46' }}>
            DUMP_BOT
          </span>
          <Nav onSearchOpen={() => setSearchOpen(true)} />
        </div>
      </div>
      {view}
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
