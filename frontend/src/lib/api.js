// Tiny fetch wrappers
async function jget(url) {
  const r = await fetch(url);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

async function jsend(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

export const api = {
  // Desk
  getItems:   ({ today = true, limit = 200, processed = false } = {}) =>
    jget(`/api/desk/items?today=${today}&limit=${limit}&processed=${processed}`),
  patchItem:  (id, body) => jsend('PATCH', `/api/desk/items/${id}`, body),

  // Stories
  listStories: () => jget('/api/stories'),
  getStory:    (id) => jget(`/api/stories/${id}`),
  storyItems:  (id) => jget(`/api/stories/${id}/items`),
  createStory: (body) => jsend('POST', '/api/stories', body),
  updateStory: (id, body) => jsend('PATCH', `/api/stories/${id}`, body),
  archiveStory: (id) => jsend('DELETE', `/api/stories/${id}`),
  refreshStory: (id) => jsend('POST', `/api/stories/${id}/refresh`),
  assign:      (storyId, itemId) => jsend('POST', `/api/stories/${storyId}/assign`, { itemId }),
  unassign:    (itemId) => jsend('POST', `/api/stories/unassign`, { itemId }),
};
