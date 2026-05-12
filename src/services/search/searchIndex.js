/**
 * In-memory semantic search index.
 *
 * Architecture:
 *   - Pulls all LUCA_Dump pages from Notion at startup
 *   - Builds text blobs per page (title + og_title + og_description + summary + tags + raw_content)
 *   - Embeds all blobs via Gemini text-embedding-004 (batched)
 *   - Stores {pageId, meta, embedding} in memory
 *   - Refreshes every REFRESH_INTERVAL_MS
 *   - Query: embed query → cosine similarity → hybrid re-rank (0.65 semantic + 0.35 keyword)
 *
 * Personal scale: 200-500 items × 768 dims × 4 bytes ≈ 600KB-1.5MB — fine in memory.
 * No external DB needed.
 */
const { getNotion }               = require('../notion/notionClient');
const config                      = require('../../config');
const { embedText, embedBatch, cosineSim } = require('./embedder');
const logger                      = require('../../utils/logger');

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // rebuild index every 5 min

// ─── Index store ──────────────────────────────────────────────────────────────
const index = {
  items:     [],  // [{ id, blob, meta, embedding: Float32Array|null }]
  lastBuilt: null,
  building:  false,
};

// ─── Notion page → searchable document ───────────────────────────────────────

function readProp(page, key, type) {
  const p = page.properties?.[key];
  if (!p) return null;
  switch (type || p.type) {
    case 'title':        return p.title?.[0]?.plain_text || null;
    case 'rich_text':    return p.rich_text?.[0]?.plain_text || null;
    case 'select':       return p.select?.name || null;
    case 'multi_select': return p.multi_select?.map((s) => s.name).join(' ') || null;
    case 'url':          return p.url || null;
    default:             return null;
  }
}

function pageToDoc(page) {
  const title   = readProp(page, 'Title', 'title') || '';
  const ogTitle = readProp(page, 'og_title', 'rich_text') || '';
  const ogDesc  = readProp(page, 'og_description', 'rich_text') || '';
  const summary = readProp(page, 'summary', 'rich_text') || '';
  const tags    = readProp(page, 'tags', 'multi_select') || '';
  const raw     = readProp(page, 'raw_content', 'rich_text') || '';
  const site    = readProp(page, 'og_site', 'rich_text') || '';
  const kind    = readProp(page, 'link_kind', 'select') || '';
  const type    = readProp(page, 'type', 'select') || '';
  const linkUrl = readProp(page, 'link_url', 'url') || '';

  // Concatenate in priority order for embedding
  const blob = [ogTitle, title, summary, ogDesc, tags, site, kind, type, raw]
    .filter(Boolean)
    .join(' | ')
    .slice(0, 2000);

  return {
    id:       page.id,
    blob,
    meta: {
      id:          page.id,
      title:       ogTitle || title || '(untitled)',
      og_title:    ogTitle,
      og_desc:     ogDesc.slice(0, 200),
      summary:     summary.slice(0, 200),
      tags:        tags ? tags.split(' ') : [],
      link_kind:   kind,
      link_url:    linkUrl,
      og_image:    readProp(page, 'og_image', 'url'),
      type,
      timestamp:   page.created_time,
      notion_url:  page.url,
    },
  };
}

// ─── Index builder ────────────────────────────────────────────────────────────

async function fetchAllPages() {
  const notion = getNotion();
  const pages  = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: config.notion.databaseId,
      sorts:       [{ property: 'timestamp', direction: 'descending' }],
      page_size:   100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return pages;
}

async function buildIndex() {
  if (index.building) {
    logger.info('searchIndex: build already in progress — skip');
    return;
  }
  index.building = true;
  logger.info('searchIndex: starting build…');

  try {
    const pages = await fetchAllPages();
    logger.info(`searchIndex: fetched ${pages.length} pages`);

    const docs   = pages.map(pageToDoc);
    const blobs  = docs.map((d) => d.blob);
    const embeddings = await embedBatch(blobs);

    index.items = docs.map((doc, i) => ({
      ...doc,
      embedding: embeddings[i] || null,
    }));
    index.lastBuilt = new Date();

    const embedded = index.items.filter((i) => i.embedding).length;
    logger.info(`searchIndex: built — ${index.items.length} items, ${embedded} embedded`);
  } catch (err) {
    logger.error(`searchIndex: build failed — ${err.message}`);
  } finally {
    index.building = false;
  }
}

function startIndexer() {
  // Non-blocking startup — don't delay server listen
  setTimeout(() => buildIndex().catch(() => {}), 2000);
  setInterval(() => buildIndex().catch(() => {}), REFRESH_INTERVAL_MS);
  logger.info(`searchIndex: indexer scheduled — refresh every ${REFRESH_INTERVAL_MS / 1000}s`);
}

// ─── Keyword scorer (BM25-lite) ───────────────────────────────────────────────

function keywordScore(blob, tokens) {
  if (!tokens.length || !blob) return 0;
  const lower = blob.toLowerCase();
  let score   = 0;
  for (const t of tokens) {
    if (lower.includes(t)) score += 1 + (lower.split(t).length - 2) * 0.1; // frequency bonus
  }
  return Math.min(score / tokens.length, 1);
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Search the index.
 * @param {string} query
 * @param {object} opts - { limit, keywordWeight }
 * @returns {Array} ranked results with score
 */
async function search(query, { limit = 20, keywordWeight = 0.35 } = {}) {
  if (!query || !query.trim()) return [];

  if (!index.lastBuilt) {
    // Index not ready — fallback to keyword-only
    logger.warn('searchIndex: index not ready — keyword fallback');
    const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    return index.items
      .map((item) => ({ ...item.meta, score: keywordScore(item.blob, tokens) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  const queryEmbed = await embedText(query);
  const tokens     = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const semWeight  = 1 - keywordWeight;

  const scored = index.items.map((item) => {
    const sem = queryEmbed && item.embedding ? cosineSim(queryEmbed, item.embedding) : 0;
    const kw  = keywordScore(item.blob, tokens);
    const score = semWeight * sem + keywordWeight * kw;
    return { ...item.meta, score: Math.round(score * 1000) / 1000 };
  });

  return scored
    .filter((r) => r.score > 0.05) // noise floor
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function getStatus() {
  return {
    items:     index.items.length,
    embedded:  index.items.filter((i) => i.embedding).length,
    lastBuilt: index.lastBuilt,
    building:  index.building,
  };
}

// Trigger index rebuild when new item ingested (call from telegramController)
function invalidate() {
  setTimeout(() => buildIndex().catch(() => {}), 5000); // small delay to let Notion settle
}

module.exports = { search, startIndexer, getStatus, invalidate };
