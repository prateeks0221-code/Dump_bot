const { getDrive } = require('./driveClient');
const { getOrCreateFolder } = require('./driveService');
const config = require('../../config');
const logger = require('../../utils/logger');

// Sanitize for Drive folder name
function sanitize(name) {
  return (name || 'Untitled').replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 100);
}

async function ensureStoryFolder(storyName, storyShortId) {
  if (!config.google.storiesFolderId) {
    throw new Error('GOOGLE_DRIVE_STORIES_FOLDER_ID is not configured');
  }
  const folderName = storyShortId
    ? `${sanitize(storyName)}_${storyShortId}`
    : sanitize(storyName);
  return getOrCreateFolder(folderName, config.google.storiesFolderId);
}

async function ensureSubfolder(storyFolderId, subName) {
  return getOrCreateFolder(subName, storyFolderId);
}

async function moveFileToFolder(fileId, targetFolderId) {
  const drive = getDrive();
  const file = await drive.files.get({
    fileId,
    fields: 'parents',
    supportsAllDrives: true,
  });
  const previousParents = (file.data.parents || []).join(',');

  if (file.data.parents && file.data.parents.includes(targetFolderId)) {
    return { fileId, alreadyThere: true };
  }

  await drive.files.update({
    fileId,
    addParents: targetFolderId,
    removeParents: previousParents,
    fields: 'id,parents,webViewLink',
    supportsAllDrives: true,
  });
  logger.info(`Drive: moved ${fileId} → folder ${targetFolderId}`);
  return { fileId, alreadyThere: false };
}

async function getWebViewLink(fileId) {
  const drive = getDrive();
  const res = await drive.files.get({
    fileId,
    fields: 'webViewLink',
    supportsAllDrives: true,
  });
  return res.data.webViewLink || null;
}

async function deleteFolderIfEmpty(folderId) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (res.data.files.length > 0) return false;
  await drive.files.update({ fileId: folderId, requestBody: { trashed: true }, supportsAllDrives: true });
  logger.info(`Drive: trashed empty folder ${folderId}`);
  return true;
}

module.exports = {
  ensureStoryFolder,
  ensureSubfolder,
  moveFileToFolder,
  getWebViewLink,
  deleteFolderIfEmpty,
};
