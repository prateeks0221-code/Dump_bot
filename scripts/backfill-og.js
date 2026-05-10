#!/usr/bin/env node
/**
 * Backfill script: re-unfurl all Notion items with HTML-encoded or missing og_title.
 * Run: node scripts/backfill-og.js
 */
require('dotenv').config();

const config = require('../src/config');
const { getNotion } = require('../src/services/notion/notionClient');
const { enrichLink } = require('../src/services/link/linkService');
const { forceUpdateFields } = require('../src/services/notion/notionService');
const logger = require('../src/utils/logger');

const BATCH_DELAY_MS = 400; // stay under Notion rate limit

function isDirty(text) {
  return text && (text.includes('&quot;') || text.includes('&#') || text.includes('&amp;') || text.includes('&#x'));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAllPages() {
  const notion = getNotion();
  const pages = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: config.notion.databaseId,
      sorts: [{ property: 'timestamp', direction: 'descending' }],
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return pages;
}

async function backfill() {
  console.log('Fetching all Notion pages...');
  const pages = await fetchAllPages();
  console.log(`Total pages: ${pages.length}`);

  const targets = pages.filter(p => {
    const ogTitle = p.properties?.og_title?.rich_text?.[0]?.plain_text || '';
    const linkUrl = p.properties?.link_url?.url || p.properties?.raw_content?.rich_text?.[0]?.plain_text;
    const hasDirty = isDirty(ogTitle);
    const hasMissing = !ogTitle && linkUrl;
    return (hasDirty || hasMissing) && linkUrl;
  });

  console.log(`Items to backfill: ${targets.length}\n`);

  let ok = 0, skip = 0, fail = 0;

  for (let i = 0; i < targets.length; i++) {
    const page = targets[i];
    const linkUrl = page.properties?.link_url?.url
      || page.properties?.raw_content?.rich_text?.[0]?.plain_text;

    process.stdout.write(`[${i + 1}/${targets.length}] ${linkUrl?.slice(0, 60)}... `);

    try {
      const data = await enrichLink(linkUrl);
      if (!data || !data.og_title) {
        console.log('skip (no data)');
        skip++;
        await sleep(BATCH_DELAY_MS);
        continue;
      }

      const patch = {};
      if (data.og_title) patch.og_title = { rich_text: [{ text: { content: data.og_title.slice(0, 2000) } }] };
      if (data.og_description) patch.og_description = { rich_text: [{ text: { content: data.og_description.slice(0, 2000) } }] };
      if (data.og_image) patch.og_image = { url: data.og_image };
      if (data.og_site) patch.og_site = { rich_text: [{ text: { content: data.og_site.slice(0, 200) } }] };
      if (data.link_kind) patch.link_kind = { select: { name: data.link_kind } };
      if (data.link_url) patch.link_url = { url: data.link_url };

      await forceUpdateFields(page.id, patch);
      console.log(`✓ "${data.og_title.slice(0, 50)}"`);
      ok++;
    } catch (err) {
      console.log(`✗ ${err.message.slice(0, 80)}`);
      fail++;
    }

    await sleep(BATCH_DELAY_MS);
  }

  console.log(`\nDone. ok=${ok} skip=${skip} fail=${fail}`);
}

backfill().catch(e => { console.error(e.message); process.exit(1); });
