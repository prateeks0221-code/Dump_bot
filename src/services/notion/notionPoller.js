const config = require('../../config');
const logger = require('../../utils/logger');
const { getRecentlyUpdatedEntries } = require('./notionService');
const storyService = require('../story/storyService');

// In-memory map: pageId → storyPageId (last seen)
const pageState = new Map();

function readStoryRel(page) {
  const rel = page.properties?.Story || page.properties?.story;
  if (!rel || rel.type !== 'relation' || rel.relation.length === 0) return null;
  return rel.relation[0].id;
}

async function processDiff(page) {
  const pageId = page.id;
  const currentStoryId = readStoryRel(page);
  const prev = pageState.get(pageId);

  // Skip if unchanged (and we already have state)
  if (prev !== undefined && prev === currentStoryId) return;

  try {
    // Delegate to storyService — handles Drive move, file_url update, aggregation
    await storyService.assignItemToStory(pageId, currentStoryId);
    logger.info(`Poller: synced page ${pageId} → story ${currentStoryId || 'null (Master_Dump)'}`);
  } catch (err) {
    logger.error(`Poller sync failed for ${pageId}: ${err.message}`);
    return; // don't update state if failed; retry next loop
  }

  pageState.set(pageId, currentStoryId);
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
