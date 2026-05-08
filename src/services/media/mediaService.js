const axios = require('axios');
const FormData = require('form-data');
const config = require('../../config');
const logger = require('../../utils/logger');
const { createEntry, patchEmptyFields } = require('../notion/notionService');
const { uploadToMasterDump } = require('../drive/driveService');
const intelligenceStore = require('../../utils/intelligenceStore');

const STT_URL = process.env.STT_SERVICE_URL || 'http://localhost:8000';

async function processMediaUpload(buffer, filename, mimeType, sourceUrl = null) {
  const form = new FormData();
  form.append('file', buffer, { filename, contentType: mimeType });
  form.append('level', 'L3');

  const { data } = await axios.post(`${STT_URL}/api/ingest`, form, {
    headers: form.getHeaders(),
    timeout: 600000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return data;
}

async function processMediaUrl(url) {
  const { data } = await axios.post(`${STT_URL}/api/ingest/url`, {
    url,
    level: 'L3',
  }, {
    timeout: 600000,
    maxContentLength: Infinity,
  });

  return data;
}

function buildTitle(rawContent, url, filename) {
  if (rawContent) return rawContent.slice(0, 80);
  if (url) return `Media: ${url.slice(0, 60)}`;
  if (filename) return filename.slice(0, 80);
  return 'Media Intelligence';
}

async function createMediaIntelligenceEntry({ buffer, filename, mimeType, url }) {
  const title = buildTitle(null, url, filename);
  const type = 'media_intelligence';
  const timestamp = new Date().toISOString();

  let fileUrl = null;
  let driveFileId = null;

  if (buffer && filename) {
    const uploaded = await uploadToMasterDump(buffer, filename, mimeType);
    fileUrl = uploaded.fileUrl;
    driveFileId = uploaded.fileId;
  }

  const page = await createEntry({
    title,
    type,
    timestamp,
    fileUrl,
    rawContent: 'Processing...',
    messageId: `media-${Date.now()}`,
    driveFileId,
  });

  return page;
}

async function enrichIntelligence(pageId, result) {
  const { transcript, l1_analysis, l2_analysis, l3_analysis } = result;

  const l1 = l1_analysis?.analysis || {};
  const l2 = l2_analysis?.analysis || {};
  const l3 = l3_analysis?.analysis || {};

  const patch = {};

  // L1 → summary + tags
  if (l1.summary) {
    patch.summary = { rich_text: [{ text: { content: l1.summary.slice(0, 2000) } }] };
  }
  const tags = Array.isArray(l1.key_points)
    ? l1.key_points.slice(0, 5).map((p) => (typeof p === 'string' ? p.slice(0, 40) : String(p).slice(0, 40)))
    : [];
  if (tags.length) {
    patch.tags = { multi_select: tags.map((t) => ({ name: t.toLowerCase() })) };
  }

  // Store full intelligence
  const full = {
    transcript: transcript?.text || '',
    segments: transcript?.segments || [],
    metadata: transcript?.metadata || {},
    l1: l1,
    l2: l2,
    l3: l3,
    updatedAt: new Date().toISOString(),
  };

  intelligenceStore.save(pageId, full);

  // Raw content gets transcript preview
  const preview = transcript?.text ? transcript.text.slice(0, 2000) : '';
  if (preview) {
    patch.raw_content = { rich_text: [{ text: { content: preview } }] };
  }

  if (Object.keys(patch).length) {
    await patchEmptyFields(pageId, patch);
  }

  return full;
}

module.exports = {
  processMediaUpload,
  processMediaUrl,
  createMediaIntelligenceEntry,
  enrichIntelligence,
};
