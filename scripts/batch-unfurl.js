// Batch unfurl all link items to enrich them with OG metadata
require('dotenv').config();
const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3000';

async function batchUnfurl() {
  try {
    // Get all unprocessed items
    console.log('Fetching unprocessed items...');
    const res = await fetch(`${API_BASE}/api/desk/items?processed=false&limit=200`);
    const { items } = await res.json();
    
    console.log(`Found ${items.length} unprocessed items`);
    
    let unfurled = 0;
    let failed = 0;
    
    for (const item of items) {
      // Only process links and text
      if (item.type !== 'link' && item.type !== 'text') continue;
      
      if (!item.raw_content) continue;
      
      try {
        console.log(`Unfurling ${item.id} - ${item.raw_content.slice(0, 50)}...`);
        const unfurlRes = await fetch(`${API_BASE}/api/desk/items/${item.id}/unfurl`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_content: item.raw_content }),
        });
        
        const result = await unfurlRes.json();
        if (result.ok) {
          unfurled++;
          console.log(`  ✓ Success`);
        } else {
          console.log(`  ✗ Failed: ${result.reason}`);
          failed++;
        }
      } catch (err) {
        console.log(`  ✗ Error: ${err.message}`);
        failed++;
      }
      
      // Rate limit: wait 200ms between requests
      await new Promise(r => setTimeout(r, 200));
    }
    
    console.log(`\nDone! Unfurled: ${unfurled}, Failed: ${failed}`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

batchUnfurl();
