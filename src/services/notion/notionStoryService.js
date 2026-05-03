const { getNotion } = require('./notionClient');
const config = require('../../config');
const logger = require('../../utils/logger');

function getDbId() {
  if (!config.notion.storiesDbId) {
    throw new Error('NOTION_STORIES_DB_ID is not configured');
  }
  return config.notion.storiesDbId;
}

function readProp(page, key, type) {
  const p = page.properties?.[key];
  if (!p) return null;
  switch (type || p.type) {
    case 'title':        return p.title?.[0]?.plain_text || null;
    case 'rich_text':    return p.rich_text?.[0]?.plain_text || null;
    case 'select':       return p.select?.name || null;
    case 'multi_select': return p.multi_select?.map((s) => s.name) || [];
    case 'date':         return p.date?.start || null;
    case 'number':       return p.number ?? null;
    default:             return null;
  }
}

function normalizeStory(page) {
  return {
    id: page.id,
    name: readProp(page, 'Name', 'title'),
    context_name: readProp(page, 'Context Name', 'rich_text'),
    status: readProp(page, 'Status', 'select'),
    tags: readProp(page, 'Tags', 'multi_select'),
    category: readProp(page, 'category', 'select'),
    priority: readProp(page, 'priority', 'select'),
    date: readProp(page, 'Date', 'date'),
    meta_info: readProp(page, 'Meta Info', 'rich_text'),
    key_points: readProp(page, 'Context Key Points', 'rich_text'),
    drive_folder_id: readProp(page, 'drive_folder_id', 'rich_text'),
    last_active: readProp(page, 'last_active', 'date'),
    item_count: readProp(page, 'item_count', 'number'),
    notion_url: page.url,
    created_at: page.created_time,
    updated_at: page.last_edited_time,
  };
}

async function listStories({ status, limit = 100 } = {}) {
  const notion = getNotion();
  const filter = status ? { property: 'Status', select: { equals: status } } : undefined;
  const res = await notion.databases.query({
    database_id: getDbId(),
    ...(filter ? { filter } : {}),
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    page_size: Math.min(limit, 100),
  });
  return res.results.map(normalizeStory);
}

async function getStory(storyId) {
  const notion = getNotion();
  const page = await notion.pages.retrieve({ page_id: storyId });
  return normalizeStory(page);
}

async function createStory({ name, contextName, category, priority, tags, metaInfo, keyPoints }) {
  const notion = getNotion();
  const props = {
    Name: { title: [{ text: { content: name } }] },
  };
  if (contextName) props['Context Name'] = { rich_text: [{ text: { content: contextName } }] };
  if (category)    props.category         = { select: { name: category } };
  if (priority)    props.priority         = { select: { name: priority } };
  if (Array.isArray(tags) && tags.length) {
    props.Tags = { multi_select: tags.map((t) => ({ name: t })) };
  }
  if (metaInfo)    props['Meta Info']          = { rich_text: [{ text: { content: metaInfo.slice(0, 2000) } }] };
  if (keyPoints)   props['Context Key Points'] = { rich_text: [{ text: { content: keyPoints.slice(0, 2000) } }] };

  props.Date = { date: { start: new Date().toISOString() } };
  props.last_active = { date: { start: new Date().toISOString() } };
  props.item_count = { number: 0 };

  const page = await notion.pages.create({
    parent: { database_id: getDbId() },
    properties: props,
  });
  logger.info(`Notion: created story "${name}" (${page.id})`);
  return normalizeStory(page);
}

async function updateStory(storyId, fields = {}) {
  const notion = getNotion();
  const props = {};
  if (fields.name)        props.Name = { title: [{ text: { content: fields.name } }] };
  if (fields.contextName) props['Context Name'] = { rich_text: [{ text: { content: fields.contextName } }] };
  if (fields.status)      props.Status = { select: { name: fields.status } };
  if (fields.category)    props.category = { select: { name: fields.category } };
  if (fields.priority)    props.priority = { select: { name: fields.priority } };
  if (Array.isArray(fields.tags)) {
    props.Tags = { multi_select: fields.tags.map((t) => ({ name: t })) };
  }
  if (fields.metaInfo !== undefined) {
    props['Meta Info'] = { rich_text: [{ text: { content: (fields.metaInfo || '').slice(0, 2000) } }] };
  }
  if (fields.keyPoints !== undefined) {
    props['Context Key Points'] = { rich_text: [{ text: { content: (fields.keyPoints || '').slice(0, 2000) } }] };
  }
  if (fields.driveFolderId) {
    props.drive_folder_id = { rich_text: [{ text: { content: fields.driveFolderId } }] };
  }
  if (fields.itemCount !== undefined) props.item_count = { number: fields.itemCount };
  if (fields.touch) props.last_active = { date: { start: new Date().toISOString() } };

  if (Object.keys(props).length === 0) return null;
  const page = await notion.pages.update({ page_id: storyId, properties: props });
  return normalizeStory(page);
}

async function archiveStory(storyId) {
  const notion = getNotion();
  await notion.pages.update({ page_id: storyId, archived: true });
  logger.info(`Notion: archived story ${storyId}`);
}

async function countItemsForStory(storyId) {
  const notion = getNotion();
  const res = await notion.databases.query({
    database_id: config.notion.databaseId,
    filter: { property: 'Story', relation: { contains: storyId } },
    page_size: 100,
  });
  return res.results.length;
}

module.exports = {
  listStories,
  getStory,
  createStory,
  updateStory,
  archiveStory,
  countItemsForStory,
  normalizeStory,
};
