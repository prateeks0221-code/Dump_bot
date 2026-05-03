import { useEffect, useState, useCallback } from 'react';

// Hash routing: #/desk, #/stories, #/stories/<id>
function parseHash() {
  const h = (window.location.hash || '#/desk').replace(/^#/, '');
  const parts = h.split('/').filter(Boolean);
  // ['stories', '<id>']  or  ['desk']
  return { path: '/' + (parts[0] || 'desk'), id: parts[1] || null };
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

export function navigate(path) {
  window.location.hash = path.startsWith('#') ? path : '#' + path;
}

export function useNav() {
  return useCallback((p) => navigate(p), []);
}
