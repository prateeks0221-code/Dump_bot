const config = require('../../config');
const logger = require('../../utils/logger');
const { getRecentlyUpdatedEntries, extractStoryName, getPageTitle } = require('./notionService');
const { moveFileToStoryFolder, moveFileToMasterDump } = require('../drive/driveService');
const { driveSubfolder } = require('../../utils/fileHelpers');

// In-memory map: pageId → { storyPageId, driveFileId, type }
const pageState = new Map();

async function processDiff(page) {
  const pageId = page.id;
  const props = page.properties;

  const driveFileId = props.drive_file_id?.rich_text?.[0]?.plain_text;
  const type = props.type?.select?.name || 'file';
  const mimeHint = props.file_url?.url || '';

  if (!driveFileId) return;

  const currentStoryPageId = extractStoryName(page);
  const prev = pageState.get(pageId) || {};

  if (currentStoryPageId === prev.storyPageId) return;

  if (currentStoryPageId) {
    const storyName = await getPageTitle(currentStoryPageId);
    const subfolder = driveSubfolder(mimeHint, type);
    await moveFileToStoryFolder(driveFileId, storyName, subfolder);
    logger.info(`Poller: page ${pageId} → Story "${storyName}/${subfolder}"`);
  } else {
    await moveFileToMasterDump(driveFileId);
    logger.info(`Poller: page ${pageId} → Master_Dump (story removed)`);
  }

  pageState.set(pageId, { storyPageId: currentStoryPageId, driveFileId, type });
}

function startPoller() {
  let lastPoll = new Date(Date.now() - config.notion.pollIntervalMs);

  setInterval(async () => {
    const since = lastPoll;
    lastPoll = new Date();

    try {
      const pages = await getRecentlyUpdatedEntries(since);
      if (pages.length > 0) logger.info(`Poller: ${pages.length} updated page(s) detected`);

      await Promise.allSettled(pages.map(processDiff));
    } catch (err) {
      logger.error(`Poller error: ${err.message}`);
    }
  }, config.notion.pollIntervalMs);

  logger.info(`Notion poller started — interval ${config.notion.pollIntervalMs}ms`);
}

module.exports = { startPoller };
