const express = require('express');
const { getNotion } = require('../../services/notion/notionClient');
const config = require('../../config');
const logger = require('../../utils/logger');

const router = express.Router();

function prop(page, key, type) {
  const p = page.properties[key];
  if (!p) return null;
  switch (type || p.type) {
    case 'title':     return p.title?.[0]?.plain_text || null;
    case 'rich_text': return p.rich_text?.[0]?.plain_text || null;
    case 'select':    return p.select?.name || null;
    case 'checkbox':  return p.checkbox ?? false;
    case 'url':       return p.url || null;
    default:          return null;
  }
}

function normalizeChunk(page, storyMap) {
  const storyRel = page.properties?.Story?.relation || page.properties?.story?.relation || [];
  const storyId  = storyRel[0]?.id || null;
  const story    = storyId ? storyMap[storyId] : null;

  return {
    id:           page.id,
    title:        prop(page, 'Title', 'title') || prop(page, 'title', 'title'),
    og_title:     prop(page, 'og_title', 'rich_text'),
    summary:      prop(page, 'summary', 'rich_text'),
    link_kind:    prop(page, 'link_kind', 'select'),
    source_url:   prop(page, 'source_url', 'url'),
    link_url:     prop(page, 'link_url', 'url'),
    wiki_page_id: prop(page, 'wiki_page_id', 'rich_text'),
    in_basket:    prop(page, 'in_basket', 'checkbox'),
    story_id:     storyId,
    story_name:   story?.name || null,
    epic:         story?.category || null,
    notion_url:   page.url,
  };
}

// GET /api/wall
router.get('/', async (req, res) => {
  try {
    const notion = getNotion();

    const chunksRes = await notion.databases.query({
      database_id: config.notion.databaseId,
      sorts: [{ property: 'timestamp', direction: 'descending' }],
      page_size: 200,
    });

    const pages = chunksRes.results;

    const storyIds = [...new Set(
      pages
        .map((p) => (p.properties?.Story?.relation || p.properties?.story?.relation || [])[0]?.id)
        .filter(Boolean)
    )];

    const storyMap = {};
    await Promise.all(storyIds.map(async (id) => {
      try {
        const s = await notion.pages.retrieve({ page_id: id });
        storyMap[id] = {
          name:     s.properties?.Name?.title?.[0]?.plain_text || null,
          category: s.properties?.category?.select?.name || null,
        };
      } catch { /* story deleted or inaccessible */ }
    }));

    const chunks = pages.map((p) => normalizeChunk(p, storyMap));

    const epicMap = {};
    for (const chunk of chunks) {
      const key = chunk.epic || 'Unepiced';
      if (!epicMap[key]) epicMap[key] = [];
      epicMap[key].push(chunk);
    }

    const epics = Object.entries(epicMap)
      .map(([name, items]) => ({ name, chunks: items }))
      .sort((a, b) => {
        if (a.name === 'Unepiced') return 1;
        if (b.name === 'Unepiced') return -1;
        return a.name.localeCompare(b.name);
      });

    res.json({ epics, total: chunks.length });
  } catch (err) {
    logger.error(`GET /api/wall error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/wall/:id/basket
router.patch('/:id/basket', async (req, res) => {
  try {
    const notion = getNotion();
    const { in_basket } = req.body;
    if (typeof in_basket !== 'boolean') return res.status(400).json({ error: 'in_basket must be boolean' });

    await notion.pages.update({
      page_id: req.params.id,
      properties: { in_basket: { checkbox: in_basket } },
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error(`PATCH /api/wall/${req.params.id}/basket error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
