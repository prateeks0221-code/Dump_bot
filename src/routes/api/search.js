/**
 * GET /api/search?q=<query>&limit=<n>
 * GET /api/search/status
 */
const express             = require('express');
const { search, getStatus } = require('../../services/search/searchIndex');
const logger              = require('../../utils/logger');

const router = express.Router();

// Simple in-process query cache (clears every 2 min)
const cache     = new Map();
const CACHE_TTL = 2 * 60 * 1000;
setInterval(() => cache.clear(), CACHE_TTL);

router.get('/status', (req, res) => {
  res.json(getStatus());
});

router.get('/', async (req, res) => {
  const q     = (req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);

  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'q must be at least 2 characters' });
  }

  const cacheKey = `${q}:${limit}`;
  if (cache.has(cacheKey)) {
    return res.json({ results: cache.get(cacheKey), cached: true, query: q });
  }

  try {
    const results = await search(q, { limit });
    cache.set(cacheKey, results);
    logger.info(`search: q="${q}" → ${results.length} results`);
    res.json({ results, cached: false, query: q, total: results.length });
  } catch (err) {
    logger.error(`search error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
