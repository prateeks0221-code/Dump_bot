const { getFileBuffer, sendMessage } = require('../services/telegram/telegramClient');
const { uploadToMasterDump } = require('../services/drive/driveService');
const { findByMessageId, createEntry, patchEmptyFields } = require('../services/notion/notionService');
const { transcribeAudio, generateSummaryAndTags } = require('../services/ai/aiService');
const { detectMessageType, buildFileName } = require('../utils/fileHelpers');
const logger = require('../utils/logger');

const MIME_MAP = {
  voice: 'audio/ogg',
  audio: null,
  document: null,
  photo: 'image/jpeg',
  video: 'video/mp4',
};

async function handleUpdate(req, res) {
  res.sendStatus(200); // always ack Telegram first

  const msg = req.body?.message;
  if (!msg) return;

  const messageId = msg.message_id;
  const chatId = msg.chat.id;
  const timestamp = new Date(msg.date * 1000).toISOString();

  try {
    // idempotency: skip already-processed messages
    const existing = await findByMessageId(messageId);
    if (existing) {
      logger.info(`Telegram: message ${messageId} already processed — skipping`);
      return;
    }

    const type = detectMessageType(msg);
    logger.info(`Telegram: message ${messageId} type=${type}`);

    let rawContent = msg.text || msg.caption || null;
    let fileUrl = null;
    let driveFileId = null;
    let title = rawContent ? rawContent.slice(0, 80) : `${type} – ${timestamp}`;

    if (['audio', 'voice', 'file', 'image', 'video'].includes(type)) {
      const mediaObj = msg.voice || msg.audio || msg.document || msg.video ||
        (msg.photo && msg.photo[msg.photo.length - 1]);

      const fileId = mediaObj?.file_id;
      const mimeType = mediaObj?.mime_type || MIME_MAP[type === 'file' ? 'document' : type] || 'application/octet-stream';
      const originalName = mediaObj?.file_name || null;
      const fileName = buildFileName(type, mimeType, originalName);

      const { buffer } = await getFileBuffer(fileId);
      const uploaded = await uploadToMasterDump(buffer, fileName, mimeType);
      fileUrl = uploaded.fileUrl;
      driveFileId = uploaded.fileId;

      if (type === 'audio' && !rawContent) {
        rawContent = await transcribeAudio(buffer, mimeType);
        if (rawContent) title = rawContent.slice(0, 80);
      }
    }

    const notionPage = await createEntry({
      title,
      type,
      timestamp,
      fileUrl,
      rawContent,
      messageId,
      driveFileId,
    });

    // AI enrichment: only patch empty fields
    if (rawContent) {
      const { summary, tags } = await generateSummaryAndTags(rawContent);
      const aiPatch = {};
      if (summary) aiPatch.summary = { rich_text: [{ text: { content: summary } }] };
      if (tags.length > 0) aiPatch.tags = { multi_select: tags.map((t) => ({ name: t })) };
      if (Object.keys(aiPatch).length > 0) await patchEmptyFields(notionPage.id, aiPatch);
    }

    await sendMessage(chatId, `Saved (${type}) ✓`);
  } catch (err) {
    logger.error(`handleUpdate error for msg ${messageId}: ${err.message}`, err);
    try { await sendMessage(chatId, 'Error saving — please retry'); } catch (_) {}
  }
}

module.exports = { handleUpdate };
