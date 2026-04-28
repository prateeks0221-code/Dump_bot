const express = require('express');
const { getNotion } = require('../../services/notion/notionClient');
const config = require('../../config');
const { enrichLink } = require('../../services/link/linkService');
const { patchEmptyFields } = require('../../services/notion/notionService');
const logger = require('../../utils/logger');

const router = express.Router();

function prop(page, key, type) {
  const p = page.properties[key];
  if (!p) return null;
  switch (type || p.type) {
    case 'title': return p.title?.[0]?.plain_text || null;
    case 'rich_text': return p.rich_text?.[0]?.plain_text || null;
    case 'select': return p.select?.name || null;
    case 'multi_select': return p.multi_select?.map((s) => s.name) || [];
    case 'checkbox': return p.checkbox ?? false;
    case 'date': return p.date?.start || null;
    case 'url': return p.url || null;
    default: return null;
  }
}

function normalizeItem(page) {
  return {
    id: page.id,
    title: prop(page, 'title', 'title'),
    type: prop(page, 'type', 'select'),
    timestamp: prop(page, 'timestamp', 'date'),
    processed: prop(page, 'processed', 'checkbox'),
    raw_content: prop(page, 'raw_content', 'rich_text'),
    summary: prop(page, 'summary', 'rich_text'),
    tags: prop(page, 'tags', 'multi_select'),
    file_url: prop(page, 'file_url', 'url'),
    drive_file_id: prop(page, 'drive_file_id', 'rich_text'),
    link_kind: prop(page, 'link_kind', 'select'),
    link_url: prop(page, 'link_url', 'url'),
    og_title: prop(page, 'og_title', 'rich_text'),
    og_description: prop(page, 'og_description', 'rich_text'),
    og_image: prop(page, 'og_image', 'url'),
    og_site: prop(page, 'og_site', 'rich_text'),
    notion_url: page.url,
    last_edited: page.last_edited_time,
  };
}

// GET /api/desk/items?processed=false&limit=100&today=true
router.get('/items', async (req, res) => {
  try {
    const notion = getNotion();
    const showProcessed = req.query.processed === 'true';
    const todayOnly = req.query.today === 'true';
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 200);

    const filters = [];

    if (!showProcessed && !todayOnly) {
      filters.push({ property: 'processed', checkbox: { equals: false } });
    }

    if (todayOnly) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      filters.push({ property: 'timestamp', date: { on_or_after: d.toISOString() } });
    }

    const filter = filters.length > 1
      ? { and: filters }
      : filters[0];

    const response = await notion.databases.query({
      database_id: config.notion.databaseId,
      ...(filter ? { filter } : {}),
      sorts: [{ property: 'timestamp', direction: 'descending' }],
      page_size: limit,
    });

    const items = response.results.map(normalizeItem);
    res.json({ items, total: items.length });
  } catch (err) {
    logger.error(`GET /api/desk/items error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/desk/items/:id
router.patch('/items/:id', async (req, res) => {
  try {
    const notion = getNotion();
    const { processed, tags, wall, position_x, position_y } = req.body;
    const patch = {};

    if (typeof processed === 'boolean') patch.processed = { checkbox: processed };
    if (Array.isArray(tags)) patch.tags = { multi_select: tags.map((t) => ({ name: t })) };
    if (wall !== undefined) patch.wall = { select: wall ? { name: wall } : null };
    if (position_x !== undefined) patch.position_x = { number: position_x };
    if (position_y !== undefined) patch.position_y = { number: position_y };

    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to patch' });

    await notion.pages.update({ page_id: req.params.id, properties: patch });
    res.json({ ok: true });
  } catch (err) {
    logger.error(`PATCH /api/desk/items/${req.params.id} error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/desk/items/:id/unfurl — retry OG unfurl
router.post('/items/:id/unfurl', async (req, res) => {
  try {
    const { raw_content } = req.body;
    if (!raw_content) return res.status(400).json({ error: 'raw_content required' });

    const linkData = await enrichLink(raw_content);
    if (!linkData) return res.json({ ok: false, reason: 'no url or unfurl failed' });

    const linkPatch = {};
    if (linkData.link_kind) linkPatch.link_kind = { select: { name: linkData.link_kind } };
    if (linkData.link_url) linkPatch.link_url = { url: linkData.link_url };
    if (linkData.og_title) linkPatch.og_title = { rich_text: [{ text: { content: linkData.og_title.slice(0, 2000) } }] };
    if (linkData.og_description) linkPatch.og_description = { rich_text: [{ text: { content: linkData.og_description.slice(0, 2000) } }] };
    if (linkData.og_image) linkPatch.og_image = { url: linkData.og_image };
    if (linkData.og_site) linkPatch.og_site = { rich_text: [{ text: { content: linkData.og_site.slice(0, 200) } }] };

    await patchEmptyFields(req.params.id, linkPatch);
    res.json({ ok: true, linkData });
  } catch (err) {
    logger.error(`POST unfurl error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
