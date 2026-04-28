const { Readable } = require('stream');
const { getDrive } = require('./driveClient');
const config = require('../../config');
const logger = require('../../utils/logger');

async function getOrCreateFolder(name, parentId) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)',
    spaces: 'drive',
  });
  if (res.data.files.length > 0) return res.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  logger.info(`Drive: created folder "${name}" under ${parentId}`);
  return created.data.id;
}

async function uploadBuffer(buffer, fileName, mimeType, folderId) {
  const drive = getDrive();
  const stream = Readable.from(buffer);
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: stream },
    fields: 'id,webViewLink',
  });
  logger.info(`Drive: uploaded "${fileName}" → ${res.data.webViewLink}`);
  return { fileId: res.data.id, fileUrl: res.data.webViewLink };
}

async function uploadToMasterDump(buffer, fileName, mimeType) {
  return uploadBuffer(buffer, fileName, mimeType, config.google.masterFolderId);
}

async function moveFileToStoryFolder(fileId, storyName, subfolder) {
  const drive = getDrive();

  const storyFolderId = await getOrCreateFolder(storyName, config.google.storiesFolderId);
  const subFolderId = await getOrCreateFolder(subfolder, storyFolderId);

  const file = await drive.files.get({ fileId, fields: 'parents' });
  const previousParents = (file.data.parents || []).join(',');

  await drive.files.update({
    fileId,
    addParents: subFolderId,
    removeParents: previousParents,
    fields: 'id,parents',
  });
  logger.info(`Drive: moved ${fileId} → Stories/${storyName}/${subfolder}`);
  return subFolderId;
}

async function moveFileToMasterDump(fileId) {
  const drive = getDrive();
  const file = await drive.files.get({ fileId, fields: 'parents' });
  const previousParents = (file.data.parents || []).join(',');

  await drive.files.update({
    fileId,
    addParents: config.google.masterFolderId,
    removeParents: previousParents,
    fields: 'id,parents',
  });
  logger.info(`Drive: moved ${fileId} back to Master_Dump`);
}

module.exports = { uploadToMasterDump, moveFileToStoryFolder, moveFileToMasterDump, getOrCreateFolder };
