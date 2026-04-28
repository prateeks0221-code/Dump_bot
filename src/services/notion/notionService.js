const { getNotion } = require('./notionClient');
const config = require('../../config');
const logger = require('../../utils/logger');

async function findByMessageId(messageId) {
  const notion = getNotion();
  const res = await notion.databases.query({
    database_id: config.notion.databaseId,
    filter: {
      property: 'message_id',
      rich_text: { equals: String(messageId) },
    },
  });
  return res.results[0] || null;
}

async function createEntry({ title, type, timestamp, fileUrl, rawContent, messageId, driveFileId }) {
  const notion = getNotion();
  const props = {
    title: { title: [{ text: { content: title } }] },
    type: { select: { name: type } },
    timestamp: { date: { start: timestamp } },
    message_id: { rich_text: [{ text: { content: String(messageId) } }] },
    processed: { checkbox: false },
  };

  if (fileUrl) props.file_url = { url: fileUrl };
  if (rawContent) props.raw_content = { rich_text: [{ text: { content: rawContent.slice(0, 2000) } }] };
  if (driveFileId) props.drive_file_id = { rich_text: [{ text: { content: driveFileId } }] };

  const page = await notion.pages.create({
    parent: { database_id: config.notion.databaseId },
    properties: props,
  });

  logger.info(`Notion: created entry ${page.id} for message ${messageId}`);
  return page;
}

// Only fills fields that are empty — never overwrites user edits
async function patchEmptyFields(pageId, updates) {
  const notion = getNotion();
  const page = await notion.pages.retrieve({ page_id: pageId });
  const props = page.properties;
  const patch = {};

  for (const [key, value] of Object.entries(updates)) {
    const existing = props[key];
    if (!existing) { patch[key] = value; continue; }

    const isEmpty =
      (existing.type === 'rich_text' && existing.rich_text.length === 0) ||
      (existing.type === 'title' && existing.title.length === 0) ||
      (existing.type === 'url' && !existing.url) ||
      (existing.type === 'select' && !existing.select) ||
      (existing.type === 'multi_select' && existing.multi_select.length === 0) ||
      (existing.type === 'checkbox' && existing.checkbox === false && key !== 'processed');

    if (isEmpty) patch[key] = value;
  }

  if (Object.keys(patch).length === 0) return;
  await notion.pages.update({ page_id: pageId, properties: patch });
  logger.info(`Notion: patched empty fields on ${pageId}: ${Object.keys(patch).join(', ')}`);
}

async function getRecentlyUpdatedEntries(since) {
  const notion = getNotion();
  const res = await notion.databases.query({
    database_id: config.notion.databaseId,
    filter: {
      timestamp: 'last_edited_time',
      last_edited_time: { after: since.toISOString() },
    },
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    page_size: 50,
  });
  return res.results;
}

function extractStoryName(page) {
  const rel = page.properties?.story;
  if (!rel || rel.type !== 'relation' || rel.relation.length === 0) return null;
  // story name is resolved separately via page title lookup
  return rel.relation[0].id;
}

async function getPageTitle(pageId) {
  const notion = getNotion();
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    const titleProp = Object.values(page.properties).find((p) => p.type === 'title');
    return titleProp?.title?.[0]?.plain_text || pageId;
  } catch {
    return pageId;
  }
}

module.exports = { findByMessageId, createEntry, patchEmptyFields, getRecentlyUpdatedEntries, extractStoryName, getPageTitle };
