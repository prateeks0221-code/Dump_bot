// Parse a Claude/ChatGPT chat export into Notion chunk rows.
// Usage:
//   node scripts/chatToChunks.js ./export.json [--story "Story Name"]
//   node scripts/chatToChunks.js ./notes.txt   [--story "Story Name"]
//
// JSON: array of { role, content } — only "assistant" messages are imported.
// TXT:  blank-line-separated paragraphs, each becomes one chunk.
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { Client } = require('@notionhq/client');

const notion     = new Client({ auth: process.env.NOTION_TOKEN });
const DB_ID      = process.env.NOTION_DATABASE_ID;
const STORIES_DB = process.env.NOTION_STORIES_DB_ID;

const args      = process.argv.slice(2);
const filePath  = args.find((a) => !a.startsWith('--'));
const storyIdx  = args.indexOf('--story');
const storyFlag = storyIdx !== -1 ? args[storyIdx + 1] : null;

if (!filePath) {
  console.error('Usage: node scripts/chatToChunks.js <file.json|file.txt> [--story "Name"]');
  process.exit(1);
}

function parseInput(fp) {
  const raw = fs.readFileSync(path.resolve(fp), 'utf8');
  const ext = path.extname(fp).toLowerCase();

  if (ext === '.json') {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('JSON must be an array of { role, content }');
    return data
      .filter((m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim())
      .map((m) => m.content.trim());
  }

  return raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

async function resolveStory(name) {
  if (!STORIES_DB || !name) return null;
  const res = await notion.databases.query({
    database_id: STORIES_DB,
    filter: { property: 'Name', title: { equals: name } },
    page_size: 1,
  });
  return res.results[0]?.id || null;
}

async function createChunk(text, storyId, index) {
  const title = text.slice(0, 80) + (text.length > 80 ? '…' : '');
  const props = {
    title:       { title: [{ text: { content: title } }] },
    type:        { select: { name: 'text' } },
    timestamp:   { date: { start: new Date().toISOString() } },
    raw_content: { rich_text: [{ text: { content: text.slice(0, 2000) } }] },
    processed:   { checkbox: false },
  };
  if (storyId) props.Story = { relation: [{ id: storyId }] };

  const page = await notion.pages.create({ parent: { database_id: DB_ID }, properties: props });
  console.log(`  [${index + 1}] created ${page.id} — "${title}"`);
  return page;
}

async function main() {
  const chunks = parseInput(filePath);
  console.log(`\nParsed ${chunks.length} chunks from ${filePath}`);

  let storyId = null;
  if (storyFlag) {
    storyId = await resolveStory(storyFlag);
    if (storyId) console.log(`Story: "${storyFlag}" → ${storyId}`);
    else console.warn(`Warning: story "${storyFlag}" not found — chunks will be unassigned`);
  }

  console.log('\nCreating Notion rows…');
  for (let i = 0; i < chunks.length; i++) {
    try {
      await createChunk(chunks[i], storyId, i);
    } catch (err) {
      console.error(`  [${i + 1}] failed: ${err.message}`);
    }
  }

  console.log(`\nDone — ${chunks.length} chunks processed.\n`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
