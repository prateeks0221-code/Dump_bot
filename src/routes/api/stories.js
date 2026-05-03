const express = require('express');
const storyService = require('../../services/story/storyService');
const { refreshStoryAggregates } = require('../../services/story/storyAggregator');
const logger = require('../../utils/logger');

const router = express.Router();

// GET /api/stories
router.get('/', async (req, res) => {
  try {
    const status = req.query.status || undefined;
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 100);
    const stories = await storyService.listStories({ status, limit });
    res.json({ stories, total: stories.length });
  } catch (err) {
    logger.error(`GET /api/stories: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories
router.post('/', async (req, res) => {
  try {
    const { name, contextName, category, priority, tags, metaInfo, keyPoints } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name (string) is required' });
    }
    const story = await storyService.createStory({
      name, contextName, category, priority, tags, metaInfo, keyPoints,
    });
    res.status(201).json({ story });
  } catch (err) {
    logger.error(`POST /api/stories: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stories/:id
router.get('/:id', async (req, res) => {
  try {
    const story = await storyService.getStory(req.params.id);
    res.json({ story });
  } catch (err) {
    logger.error(`GET /api/stories/${req.params.id}: ${err.message}`);
    res.status(404).json({ error: err.message });
  }
});

// PATCH /api/stories/:id
router.patch('/:id', async (req, res) => {
  try {
    const story = await storyService.updateStory(req.params.id, req.body || {});
    res.json({ story });
  } catch (err) {
    logger.error(`PATCH /api/stories/${req.params.id}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/stories/:id  (archives in Notion)
router.delete('/:id', async (req, res) => {
  try {
    await storyService.archiveStory(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`DELETE /api/stories/${req.params.id}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stories/:id/items
router.get('/:id/items', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 100);
    const items = await storyService.listItemsForStory(req.params.id, { limit });
    res.json({ items, total: items.length });
  } catch (err) {
    logger.error(`GET /api/stories/${req.params.id}/items: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/assign  body: { itemId }
router.post('/:id/assign', async (req, res) => {
  try {
    const { itemId } = req.body || {};
    if (!itemId) return res.status(400).json({ error: 'itemId required' });
    const result = await storyService.assignItemToStory(itemId, req.params.id);
    res.json(result);
  } catch (err) {
    logger.error(`POST /api/stories/${req.params.id}/assign: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});



// POST /api/stories/:id/refresh — recompute Video/Audio/Document/Link/Repos + count
router.post('/:id/refresh', async (req, res) => {
  try {
    const result = await refreshStoryAggregates(req.params.id);
    res.json(result);
  } catch (err) {
    logger.error(`POST /api/stories/${req.params.id}/refresh: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/unassign  body: { itemId }
router.post('/unassign', async (req, res) => {
  try {
    const { itemId } = req.body || {};
    if (!itemId) return res.status(400).json({ error: 'itemId required' });
    const result = await storyService.assignItemToStory(itemId, null);
    res.json(result);
  } catch (err) {
    logger.error(`POST /api/stories/unassign: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
