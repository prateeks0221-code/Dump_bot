const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = path.join(process.cwd(), 'data', 'intelligence');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getPath(pageId) {
  ensureDir();
  return path.join(DATA_DIR, `${pageId}.json`);
}

function save(pageId, data) {
  try {
    fs.writeFileSync(getPath(pageId), JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    logger.error(`intelligenceStore save failed: ${err.message}`);
    return false;
  }
}

function load(pageId) {
  try {
    const p = getPath(pageId);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (err) {
    logger.error(`intelligenceStore load failed: ${err.message}`);
    return null;
  }
}

function remove(pageId) {
  try {
    const p = getPath(pageId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return true;
  } catch (err) {
    logger.error(`intelligenceStore remove failed: ${err.message}`);
    return false;
  }
}

module.exports = { save, load, remove };
