const { getNotion } = require('../notion/notionClient');
const config = require('../../config');
const logger = require('../../utils/logger');

const MAX_FIELD_CHARS = 1900;          // Notion rich_text limit ~2000
const MAX_LINES_PER_BUCKET = 40;

function readProp(page, key, type) {
  const p = page.properties?.[key];
  if (!p) return null;
  switch (type || p.type) {
    case 'title':     return p.title?.[0]?.plain_text || null;
    case 'rich_text': return p.rich_text?.[0]?.plain_text || null;
    case 'select':    return p.select?.name || null;
    case 'url':       return p.url || null;
    default:          return null;
  }
}

function bucketFor(item) {
  const { type, link_kind } = item;
  if (type === 'video') return 'Video';
  if (type === 'audio') return 'Audio';
  if (type === 'link') {
    if (link_kind === 'github') return 'Repos';
    return 'Link';
  }
  // text, image, file, unknown → Document
  return 'Document';
}

function formatLine(item) {
  const label = item.title || item.summary || item.raw_content || item.id;
  const trimmed = String(label).replace(/\s+/g, ' ').slice(0, 120);
  const url = item.file_url || item.link_url || item.notion_url || '';
  return url ? `• ${trimmed} — ${url}` : `• ${trimmed}`;
}

function joinBucket(lines) {
  const trimmed = lines.slice(0, MAX_LINES_PER_BUCKET);
  let out = trimmed.join('\n');
  if (out.length > MAX_FIELD_CHARS) out = out.slice(0, MAX_FIELD_CHARS - 3) + '...';
  return out;
}

async function refreshStoryAggregates(storyId) {
  const notion = getNotion();
  const res = await notion.databases.query({
    database_id: config.notion.databaseId,
    filter: { property: 'Story', relation: { contains: storyId } },
    sorts: [{ property: 'timestamp', direction: 'descending' }],
    page_size: 100,
  });

  const items = res.results.map((p) => ({
    id: p.id,
    title: readProp(p, 'Title', 'title') || readProp(p, 'title', 'title'),
    type: readProp(p, 'type', 'select'),
    link_kind: readProp(p, 'link_kind', 'select'),
    summary: readProp(p, 'summary', 'rich_text'),
    raw_content: readProp(p, 'raw_content', 'rich_text'),
    file_url: readProp(p, 'file_url', 'url'),
    link_url: readProp(p, 'link_url', 'url'),
    notion_url: p.url,
  }));

  const buckets = { Video: [], Audio: [], Document: [], Link: [], Repos: [] };
  for (const item of items) {
    buckets[bucketFor(item)].push(formatLine(item));
  }

  const props = {};
  for (const [field, lines] of Object.entries(buckets)) {
    const text = lines.length ? joinBucket(lines) : '';
    props[field] = { rich_text: text ? [{ text: { content: text } }] : [] };
  }
  props.item_count = { number: items.length };
  props.last_active = { date: { start: new Date().toISOString() } };

  await notion.pages.update({ page_id: storyId, properties: props });
  logger.info(`Aggregator: refreshed story ${storyId} (${items.length} items)`);
  return { storyId, total: items.length, buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])) };
}

module.exports = { refreshStoryAggregates };
