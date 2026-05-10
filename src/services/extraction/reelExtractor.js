const { spawn } = require('child_process');
const { promises: fs } = require('fs');
const path = require('path');
const { patchEmptyFields, forceUpdateFields } = require('../notion/notionService');
const logger = require('../../utils/logger');

const WIKI_DIR = path.join(process.cwd(), 'Context_extraction', 'wiki');
const SCRIPT   = path.join(process.cwd(), 'Context_extraction', 'reel_to_wiki.py');

const REEL_KINDS = new Set(['youtube', 'instagram', 'tiktok', 'twitter']);

// Serial queue — prevents concurrent runs from mixing output files in WIKI_DIR
let _queue = Promise.resolve();
function enqueue(fn) {
  _queue = _queue.then(fn, fn); // always advance queue even on error
  return _queue;
}

function isReelUrl(linkKind) {
  return REEL_KINDS.has(linkKind);
}

function spawnPython(bin, url) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(bin, [SCRIPT, url], {
        env: { ...process.env },
        cwd: process.cwd(),
      });
    } catch (err) {
      return reject(err);
    }
    let stderr = '';
    // Silence stream errors — unhandled stream 'error' events crash Node
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

function runPython(url) {
  const primaryBin = process.platform === 'win32' ? 'python' : 'python3';
  const fallbackBin = process.platform === 'win32' ? 'python3' : 'python';

  return spawnPython(primaryBin, url).catch((err) => {
    if (err.code === 'ENOENT') {
      logger.info(`reelExtractor: ${primaryBin} not found, trying ${fallbackBin}`);
      return spawnPython(fallbackBin, url);
    }
    throw err;
  });
}

async function findLatestOutputFile() {
  await fs.mkdir(WIKI_DIR, { recursive: true });
  const files = await fs.readdir(WIKI_DIR);
  const outputs = files.filter((f) => f.endsWith('_output.json')).sort().reverse();
  if (!outputs.length) throw new Error('No output JSON found after extraction');
  return path.join(WIKI_DIR, outputs[0]);
}

async function _extractReel(url, notionPageId) {
  logger.info(`reelExtractor: start ${url}`);

  try {
    await runPython(url);
  } catch (err) {
    if (err.code === 'ENOENT') {
      logger.warn(`reelExtractor: Python not available — skipping. Install python3+yt-dlp+ffmpeg+whisper.`);
      return null;
    }
    throw err;
  }

  const outputPath = await findLatestOutputFile();
  const raw = await fs.readFile(outputPath, 'utf8');
  const data = JSON.parse(raw);

  const { title, wiki, links = [], thumbnail } = data;

  // Determine platform label from URL
  let siteName = 'Reel';
  if (/instagram\.com/i.test(url)) siteName = 'Instagram Reel';
  else if (/youtube\.com|youtu\.be/i.test(url)) siteName = 'YouTube';
  else if (/tiktok\.com/i.test(url)) siteName = 'TikTok';
  else if (/twitter\.com|x\.com/i.test(url)) siteName = 'Twitter/X';

  const patch = {};

  // og_title → one-liner title (what is this reel about)
  if (title) patch.og_title = { rich_text: [{ text: { content: title.slice(0, 2000) } }] };

  // og_description → short wiki paragraph (renders as the description section on the card)
  if (wiki) patch.og_description = { rich_text: [{ text: { content: wiki.slice(0, 2000) } }] };

  // og_image → reel thumbnail
  if (thumbnail) patch.og_image = { url: thumbnail };

  // og_site → platform label (renders below title on the card)
  patch.og_site = { rich_text: [{ text: { content: siteName } }] };

  // reel_links → JSON array of {label, url} for reference chips
  if (links.length > 0) {
    patch.reel_links = { rich_text: [{ text: { content: JSON.stringify(links).slice(0, 2000) } }] };
  }

  // Force-write reel-derived fields (better quality than OG unfurl for video platforms)
  await forceUpdateFields(notionPageId, patch);
  await fs.unlink(outputPath).catch(() => {});

  logger.info(`reelExtractor: done — patched ${Object.keys(patch).join(', ')}`);
  return { title, wiki, links };
}

function extractReel(url, notionPageId) {
  return enqueue(() => _extractReel(url, notionPageId));
}

module.exports = { extractReel, isReelUrl };
