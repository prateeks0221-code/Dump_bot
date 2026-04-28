// Run once to add desk-required fields to the Notion DB
// Usage: node scripts/setup-notion-fields.js
require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB_ID = process.env.NOTION_DATABASE_ID;

const NEW_FIELDS = {
  link_kind: {
    select: {
      options: [
        { name: 'twitter',     color: 'blue'    },
        { name: 'github',      color: 'green'   },
        { name: 'youtube',     color: 'red'     },
        { name: 'reddit',      color: 'orange'  },
        { name: 'linkedin',    color: 'blue'    },
        { name: 'article',     color: 'purple'  },
        { name: 'producthunt', color: 'pink'    },
        { name: 'notion',      color: 'gray'    },
        { name: 'figma',       color: 'purple'  },
        { name: 'gdoc',        color: 'blue'    },
        { name: 'markdown',    color: 'brown'   },
        { name: 'link',        color: 'yellow'  },
      ],
    },
  },
  link_url:       { url: {} },
  og_title:       { rich_text: {} },
  og_description: { rich_text: {} },
  og_image:       { url: {} },
  og_site:        { rich_text: {} },
  // future wall routing
  wall: {
    select: {
      options: [
        { name: 'people', color: 'purple' },
        { name: 'market', color: 'green'  },
        { name: 'tech',   color: 'blue'   },
        { name: 'ideas',  color: 'yellow' },
        { name: 'ops',    color: 'orange' },
      ],
    },
  },
  position_x: { number: { format: 'number' } },
  position_y: { number: { format: 'number' } },
};

async function main() {
  console.log('Fetching existing DB schema…');
  const db = await notion.databases.retrieve({ database_id: DB_ID });
  const existing = Object.keys(db.properties);
  console.log('Existing fields:', existing.join(', '));

  const toAdd = {};
  for (const [key, schema] of Object.entries(NEW_FIELDS)) {
    if (existing.includes(key)) {
      console.log(`  skip  ${key} (already exists)`);
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
  console.log('\nDone — fields added to Notion DB.');
}

main().catch((err) => { console.error(err.message); process.exit(1); });
