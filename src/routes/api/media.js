const express = require('express');
const multer = require('multer');
const logger = require('../../utils/logger');
const intelligenceStore = require('../../utils/intelligenceStore');
const {
  processMediaUpload,
  processMediaUrl,
  createMediaIntelligenceEntry,
  enrichIntelligence,
} = require('../../services/media/mediaService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

// POST /api/media/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const notionPage = await createMediaIntelligenceEntry({
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
    });

    // Process in background so we can return immediately
    res.status(202).json({ ok: true, pageId: notionPage.id, status: 'processing' });

    // Background processing
    processMediaUpload(file.buffer, file.originalname, file.mimetype)
      .then((result) => enrichIntelligence(notionPage.id, result))
      .then(() => logger.info(`Media intelligence complete for ${notionPage.id}`))
      .catch((err) => {
        logger.error(`Background media processing failed for ${notionPage.id}: ${err.message}`);
      });
  } catch (err) {
    logger.error(`POST /api/media/upload error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/media/ingest
router.post('/ingest', express.json(), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const notionPage = await createMediaIntelligenceEntry({ url });

    res.status(202).json({ ok: true, pageId: notionPage.id, status: 'processing' });

    processMediaUrl(url)
      .then((result) => enrichIntelligence(notionPage.id, result))
      .then(() => logger.info(`URL intelligence complete for ${notionPage.id}`))
      .catch((err) => {
        logger.error(`Background URL processing failed for ${notionPage.id}: ${err.message}`);
      });
  } catch (err) {
    logger.error(`POST /api/media/ingest error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/media/intelligence/:pageId
router.get('/intelligence/:pageId', async (req, res) => {
  try {
    const data = intelligenceStore.load(req.params.pageId);
    if (!data) return res.status(404).json({ error: 'Intelligence not found' });
    res.json(data);
  } catch (err) {
    logger.error(`GET intelligence error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
