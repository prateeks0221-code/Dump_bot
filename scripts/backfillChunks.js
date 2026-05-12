// Backfill reel extraction for existing chunks missing wiki_page_id.
// Usage: node scripts/backfillChunks.js [--dry-run]
require('dotenv').config();
const { Client } = require('@notionhq/client');
const { extractReel } = require('../src/services/extraction/reelExtractor');

const notion  = new Client({ auth: process.env.NOTION_TOKEN });
const DB_ID   = process.env.NOTION_DATABASE_ID;
const DRY_RUN = process.argv.includes('--dry-run');
const REEL_KINDS = ['youtube', 'instagram', 'tiktok', 'twitter'];
const DELAY_MS = 3000;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function prop(page, key, type) {
  const p = page.properties[key];
  if (!p) return null;
  if (type === 'rich_text') return p.rich_text?.[0]?.plain_text || null;
  if (type === 'select')    return p.select?.name || null;
  if (type === 'url')       return p.url || null;
  return null;
}

async function main() {
  console.log(`\nBackfill chunks — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  const res = await notion.databases.query({
    database_id: DB_ID,
    filter: {
      and: [
        { property: 'link_kind',    select:    { is_not_empty: true } },
        { property: 'wiki_page_id', rich_text: { is_empty: true } },
      ],
    },
    page_size: 100,
  });

  const candidates = res.results.filter((p) =>
    REEL_KINDS.includes(prop(p, 'link_kind', 'select'))
  );

  console.log(`Found ${candidates.length} chunks to backfill.\n`);
  if (candidates.length === 0) return;

  for (let i = 0; i < candidates.length; i++) {
    const page     = candidates[i];
    const title    = page.properties?.Title?.title?.[0]?.plain_text || page.id;
    const url      = prop(page, 'source_url', 'url') || prop(page, 'link_url', 'url');
    const linkKind = prop(page, 'link_kind', 'select');

    console.log(`[${i + 1}/${candidates.length}] ${linkKind} — ${title}`);
    console.log(`  url: ${url || '(none)'}`);

    if (!url)   { console.log('  skip — no URL\n'); continue; }
    if (DRY_RUN){ console.log('  (dry-run, skipping)\n'); continue; }

    try {
      const result = await extractReel(url, page.id);
      console.log(`  ✓ wiki page ${result.wikiPageId}\n`);
    } catch (err) {
      console.error(`  ✗ ${err.message}\n`);
    }

    if (i < candidates.length - 1) await sleep(DELAY_MS);
  }

  console.log('Done.\n');
}

main().catch((err) => { console.error(err.message); process.exit(1); });
