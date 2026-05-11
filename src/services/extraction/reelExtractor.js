/**
 * Reel extractor — runs Python reel_to_wiki.py as subprocess.
 *
 * FIX: each run gets a UUID token. Python writes {token}_output.json.
 * Node reads ONLY that token-scoped file — no shared "latest file" race.
 *
 * Serial queue prevents concurrent runs from mixing TEMP_DIR files (yt-dlp
 * doesn't namespace its download directory). Token isolates the OUTPUT only.
 */
const { spawn }       = require('child_process');
const { promises: fs } = require('fs');
const path            = require('path');
const crypto          = require('crypto');
const { patchEmptyFields, forceUpdateFields } = require('../notion/notionService');
const logger          = require('../../utils/logger');

const WIKI_DIR = path.join(process.cwd(), 'Context_extraction', 'wiki');
const SCRIPT   = path.join(process.cwd(), 'Context_extraction', 'reel_to_wiki.py');

const REEL_KINDS = new Set(['youtube', 'instagram', 'tiktok', 'twitter']);

// Serial queue — yt-dlp shares temp/ directory; only one run at a time
let _queue = Promise.resolve();
function enqueue(fn) {
  _queue = _queue.then(fn, fn);
  return _queue;
}

function isReelUrl(linkKind) {
  return REEL_KINDS.has(linkKind);
}

function spawnPython(bin, args) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(bin, args, { env: { ...process.env }, cwd: process.cwd() });
    } catch (err) {
      return reject(err);
    }
    let stderr = '';
    if (proc.stdin)  proc.stdin.on('error',  () => {});
    if (proc.stdout) proc.stdout.on('error', () => {});
    if (proc.stderr) {
      proc.stderr.on('data',  (d) => { stderr += d.toString(); });
      proc.stderr.on('error', () => {});
    }
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`reel_to_wiki.py exited ${code}: ${stderr.slice(-500)}`));
      else resolve();
    });
  });
}

function runPython(url, token) {
  const args = [SCRIPT, url, '--token', token];
  const primary  = process.platform === 'win32' ? 'python'  : 'python3';
  const fallback = process.platform === 'win32' ? 'python3' : 'python';
  return spawnPython(primary, args).catch((err) => {
    if (err.code === 'ENOENT') {
      logger.info(`reelExtractor: ${primary} not found, trying ${fallback}`);
      return spawnPython(fallback, args);
    }
    throw err;
  });
}

async function readTokenOutput(token) {
  await fs.mkdir(WIKI_DIR, { recursive: true });
  const outputPath = path.join(WIKI_DIR, `${token}_output.json`);
  try {
    const raw = await fs.readFile(outputPath, 'utf8');
    return { data: JSON.parse(raw), outputPath };
  } catch (err) {
    throw new Error(`No output file for token ${token}: ${err.message}`);
  }
}

async function _extractReel(url, notionPageId) {
  const token = crypto.randomUUID();
  logger.info(`reelExtractor: start url=${url} token=${token}`);

  try {
    await runPython(url, token);
  } catch (err) {
    if (err.code === 'ENOENT') {
      logger.warn(`reelExtractor: Python not available — skipping. Install python3+yt-dlp+ffmpeg+whisper.`);
      return null;
    }
    throw err;
  }

  const { data, outputPath } = await readTokenOutput(token);
  const { title, wiki, links = [], thumbnail } = data;

  let siteName = 'Reel';
  if (/instagram\.com/i.test(url))       siteName = 'Instagram Reel';
  else if (/youtube\.com|youtu\.be/i.test(url)) siteName = 'YouTube';
  else if (/tiktok\.com/i.test(url))     siteName = 'TikTok';
  else if (/twitter\.com|x\.com/i.test(url)) siteName = 'Twitter/X';

  const patch = {};
  if (title)      patch.og_title       = { rich_text: [{ text: { content: title.slice(0, 2000) } }] };
  if (wiki)       patch.og_description = { rich_text: [{ text: { content: wiki.slice(0, 2000) } }] };
  if (thumbnail)  patch.og_image       = { url: thumbnail };
  patch.og_site = { rich_text: [{ text: { content: siteName } }] };
  if (links.length > 0) {
    patch.reel_links = { rich_text: [{ text: { content: JSON.stringify(links).slice(0, 2000) } }] };
  }

  await forceUpdateFields(notionPageId, patch);
  await fs.unlink(outputPath).catch(() => {}); // cleanup token file

  logger.info(`reelExtractor: done token=${token} — patched ${Object.keys(patch).join(', ')}`);
  return { title, wiki, links };
}

function extractReel(url, notionPageId) {
  return enqueue(() => _extractReel(url, notionPageId));
}

module.exports = { extractReel, isReelUrl };
