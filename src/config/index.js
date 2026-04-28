require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    webhookUrl: process.env.WEBHOOK_URL,
  },
  google: {
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
    privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    masterFolderId: process.env.GOOGLE_DRIVE_MASTER_FOLDER_ID,
    storiesFolderId: process.env.GOOGLE_DRIVE_STORIES_FOLDER_ID,
  },
  notion: {
    token: process.env.NOTION_TOKEN,
    databaseId: process.env.NOTION_DATABASE_ID,
    pollIntervalMs: parseInt(process.env.NOTION_POLL_INTERVAL_MS || '30000', 10),
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    enabled: process.env.OPENAI_ENABLED === 'true',
  },
};
