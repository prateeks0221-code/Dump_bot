const { spawn } = require('child_process');
const { promises: fs } = require('fs');
const path = require('path');
const { patchEmptyFields, createWikiPage } = require('../notion/notionService');
const logger = require('../../utils/logger');

const WIKI_DIR = path.join(process.cwd(), 'Context_extraction', 'wiki');
const SCRIPT   = path.join(process.cwd(), 'Context_extraction', 'reel_to_wiki.py');

const REEL_KINDS = new Set(['youtube', 'instagram', 'tiktok', 'twitter']);

function isReelUrl(linkKind) {
  return REEL_KINDS.has(linkKind);
}

function runPython(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [SCRIPT, url], {
      env: { ...process.env },
      cwd: process.cwd(),
    });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`reel_to_wiki.py exited ${code}: ${stderr.slice(-500)}`));
      else resolve();
    });
  });
}

async function findLatestOutputFiles() {
  await fs.mkdir(WIKI_DIR, { recursive: true });
  const files = await fs.readdir(WIKI_DIR);
  const summaries = files.filter((f) => f.endsWith('_SUMMARY.txt')).sort().reverse();
  const wikis     = files.filter((f) => f.endsWith('_WIKI.md')).sort().reverse();
  if (!summaries.length || !wikis.length) throw new Error('No output files found after extraction');
  return {
    summaryPath: path.join(WIKI_DIR, summaries[0]),
    wikiPath:    path.join(WIKI_DIR, wikis[0]),
  };
}

function parseSummaryFile(content) {
  // reel_to_wiki.py writes:
  // REEL SUMMARY
  // ====...====
  // Title: <title>
  // Creator: ...
  // Source: ...
  // ====...====
  // <summary body>
  const lines = content.split('\n');
  let ogTitle = null;
  let sepCount = 0;
  const bodyLines = [];

  for (const line of lines) {
    if (line.startsWith('====')) { sepCount++; continue; }
    if (sepCount < 2) {
      const m = line.match(/^Title:\s*(.+)/);
      if (m) ogTitle = m[1].trim();
    } else {
      bodyLines.push(line);
    }
  }

  return { ogTitle, summary: bodyLines.join('\n').trim() };
}

async function extractReel(url, notionPageId) {
  logger.info(`reelExtractor: start ${url}`);

  await runPython(url);

  const { summaryPath, wikiPath } = await findLatestOutputFiles();
  const [summaryContent, wikiContent] = await Promise.all([
    fs.readFile(summaryPath, 'utf8'),
    fs.readFile(wikiPath, 'utf8'),
  ]);

  const { ogTitle, summary } = parseSummaryFile(summaryContent);

  const wikiPageId = await createWikiPage(notionPageId, ogTitle || 'Wiki', wikiContent);

  const patch = {
    source_url:   { url },
    wiki_page_id: { rich_text: [{ text: { content: wikiPageId } }] },
  };
  if (ogTitle) patch.og_title = { rich_text: [{ text: { content: ogTitle.slice(0, 2000) } }] };
  if (summary) patch.summary  = { rich_text: [{ text: { content: summary.slice(0, 2000) } }] };

  await patchEmptyFields(notionPageId, patch);

  await Promise.allSettled([fs.unlink(summaryPath), fs.unlink(wikiPath)]);

  logger.info(`reelExtractor: done — wiki ${wikiPageId}`);
  return { ogTitle, summary, wikiPageId };
}

module.exports = { extractReel, isReelUrl };
