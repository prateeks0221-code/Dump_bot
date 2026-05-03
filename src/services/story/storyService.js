const { getNotion } = require('../notion/notionClient');
const config = require('../../config');
const logger = require('../../utils/logger');
const notionStoryService = require('../notion/notionStoryService');
const driveStoryService = require('../drive/driveStoryService');
const driveService = require('../drive/driveService');
const { driveSubfolder } = require('../../utils/fileHelpers');
const { refreshStoryAggregates } = require('./storyAggregator');

function shortId(notionPageId) {
  return (notionPageId || '').replace(/-/g, '').slice(0, 8);
}

async function readContentItem(itemId) {
  const notion = getNotion();
  const page = await notion.pages.retrieve({ page_id: itemId });
  const props = page.properties;
  return {
    pageId: page.id,
    driveFileId: props.drive_file_id?.rich_text?.[0]?.plain_text || null,
    type: props.type?.select?.name || 'file',
    fileUrl: props.file_url?.url || null,
    storyRel: (props.Story?.relation?.[0]?.id || props.story?.relation?.[0]?.id) || null,
  };
}

async function patchContentRelation(itemId, storyId, fileUrl) {
  const notion = getNotion();
  const props = {};
  props.Story = { relation: storyId ? [{ id: storyId }] : [] };
  if (fileUrl) props.file_url = { url: fileUrl };
  await notion.pages.update({ page_id: itemId, properties: props });
}

// Create a new story (Notion + Drive folder)
async function createStory(input) {
  const story = await notionStoryService.createStory(input);
  const folderId = await driveStoryService.ensureStoryFolder(story.name, shortId(story.id));
  await notionStoryService.updateStory(story.id, { driveFolderId: folderId });
  story.drive_folder_id = folderId;
  logger.info(`Story created: "${story.name}" id=${story.id} drive=${folderId}`);
  return story;
}

async function listStories(opts) {
  return notionStoryService.listStories(opts);
}

async function getStory(storyId) {
  return notionStoryService.getStory(storyId);
}

async function updateStory(storyId, fields) {
  return notionStoryService.updateStory(storyId, fields);
}

async function archiveStory(storyId) {
  await notionStoryService.archiveStory(storyId);
  return { ok: true };
}

// Assign content item → story.
// storyId = null/undefined → unassign (move back to Master_Dump).
async function assignItemToStory(itemId, storyId) {
  const item = await readContentItem(itemId);

  // Unassign path
  if (!storyId) {
    if (item.driveFileId && config.google.masterFolderId) {
      await driveStoryService.moveFileToFolder(item.driveFileId, config.google.masterFolderId);
    }
    const newUrl = item.driveFileId ? await driveStoryService.getWebViewLink(item.driveFileId) : null;
    await patchContentRelation(itemId, null, newUrl);
    if (item.storyRel) {
      await refreshStoryAggregates(item.storyRel).catch((e) => logger.error(`aggregate fail: ${e.message}`));
    }
    return { ok: true, action: 'unassigned' };
  }

  // Assign / reassign path
  const story = await notionStoryService.getStory(storyId);
  if (!story) throw new Error(`Story ${storyId} not found`);

  let folderId = story.drive_folder_id;
  if (!folderId) {
    folderId = await driveStoryService.ensureStoryFolder(story.name, shortId(story.id));
    await notionStoryService.updateStory(storyId, { driveFolderId: folderId });
  }

  let targetFolderId = folderId;
  let movedUrl = null;

  if (item.driveFileId) {
    const subName = driveSubfolder(item.fileUrl || '', item.type);
    targetFolderId = await driveStoryService.ensureSubfolder(folderId, subName);
    await driveStoryService.moveFileToFolder(item.driveFileId, targetFolderId);
    movedUrl = await driveStoryService.getWebViewLink(item.driveFileId);
  }

  await patchContentRelation(itemId, storyId, movedUrl);

  // Refresh aggregates on new (and old, if reassign)
  await refreshStoryAggregates(storyId).catch((e) => logger.error(`aggregate fail: ${e.message}`));
  if (item.storyRel && item.storyRel !== storyId) {
    await refreshStoryAggregates(item.storyRel).catch((e) => logger.error(`aggregate fail: ${e.message}`));
  }

  return {
    ok: true,
    action: item.storyRel ? 'reassigned' : 'assigned',
    storyId,
    targetFolderId,
    fileUrl: movedUrl,
  };
}

async function listItemsForStory(storyId, { limit = 100 } = {}) {
  const notion = getNotion();
  const res = await notion.databases.query({
    database_id: config.notion.databaseId,
    filter: { property: 'Story', relation: { contains: storyId } },
    sorts: [{ property: 'timestamp', direction: 'descending' }],
    page_size: Math.min(limit, 100),
  });
  return res.results;
}

module.exports = {
  createStory,
  listStories,
  getStory,
  updateStory,
  archiveStory,
  assignItemToStory,
  listItemsForStory,
};
