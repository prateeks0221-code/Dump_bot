// Adds context-organizer fields to the Stories Notion DB.
// Usage: node scripts/setup-stories-db.js
require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB_ID = process.env.NOTION_STORIES_DB_ID;

if (!DB_ID) {
  console.error('NOTION_STORIES_DB_ID is not set in .env');
  process.exit(1);
}

const NEW_FIELDS = {
  'Context Name':       { rich_text: {} },
  'Date':               { date: {} },
  'Meta Info':          { rich_text: {} },
  'Video':              { rich_text: {} },
  'Audio':              { rich_text: {} },
  'Document':           { rich_text: {} },
  'Link':               { rich_text: {} },
  'Repos':              { rich_text: {} },
  'Context Key Points': { rich_text: {} },

  // Backend / automation fields
  'drive_folder_id':    { rich_text: {} },
  'priority': {
    select: {
      options: [
        { name: 'high',   color: 'red'    },
        { name: 'medium', color: 'yellow' },
        { name: 'low',    color: 'gray'   },
      ],
    },
  },
  'category': {
    select: {
      options: [
        { name: 'research',  color: 'blue'   },
        { name: 'project',   color: 'green'  },
        { name: 'reference', color: 'purple' },
        { name: 'personal',  color: 'pink'   },
        { name: 'ops',       color: 'orange' },
      ],
    },
  },
  'last_active':        { date: {} },
  'item_count':         { number: { format: 'number' } },
};

async function main() {
  console.log(`Fetching Stories DB schema (${DB_ID})…`);
  const db = await notion.databases.retrieve({ database_id: DB_ID });
  const existing = Object.keys(db.properties);
  console.log('Existing fields:', existing.join(', '));

  const toAdd = {};
  for (const [key, schema] of Object.entries(NEW_FIELDS)) {
    if (existing.includes(key)) {
      console.log(`  skip  ${key}`);
    } else {
      toAdd[key] = schema;
      console.log(`  + add ${key}`);
    }
  }

  if (Object.keys(toAdd).length === 0) {
    console.log('\nAll fields already present. Nothing to do.');
    return;
  }

  await notion.databases.update({ database_id: DB_ID, properties: toAdd });
  console.log('\nDone — fields added to Stories DB.');
}

main().catch((err) => { console.error(err.message); process.exit(1); });
