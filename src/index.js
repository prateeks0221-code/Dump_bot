require('dotenv').config();
const express = require('express');
const config = require('./config');
const logger = require('./utils/logger');
const telegramRoutes = require('./routes/telegram');
const healthRoutes = require('./routes/health');
const deskRoutes = require('./routes/desk');
const deskApiRoutes = require('./routes/api/desk');
const storiesApiRoutes = require('./routes/api/stories');
const wallApiRoutes = require('./routes/api/wall');
const { setWebhook } = require('./services/telegram/telegramClient');
const { startPoller } = require('./services/notion/notionPoller');
const searchApiRoutes = require('./routes/api/search');
const { startIndexer } = require('./services/search/searchIndex');

const { portalAuth } = require('./middleware/auth');

const app = express();

app.use(express.json());
app.use(express.static('public'));

// Public routes — no auth
app.use('/telegram', telegramRoutes);  // Telegram webhook must stay public
app.use('/desk', deskRoutes);          // SPA shell
app.use('/', healthRoutes);            // /health for Railway

// Protected routes — require PORTAL_SECRET token
app.use('/api/desk', portalAuth, deskApiRoutes);
app.use('/api/stories', portalAuth, storiesApiRoutes);
app.use('/api/wall', portalAuth, wallApiRoutes);
app.use('/api/search', portalAuth, searchApiRoutes);

app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, err);
  res.status(500).json({ error: 'Internal server error' });
});

async function bootstrap() {
  if (!config.telegram.token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  if (!config.notion.token) throw new Error('NOTION_TOKEN is required');
  if (!config.google.clientEmail) throw new Error('GOOGLE_CLIENT_EMAIL is required');

  app.listen(config.port, () => logger.info(`Server listening on port ${config.port}`));

  if (config.telegram.webhookUrl) {
    const webhookEndpoint = `${config.telegram.webhookUrl}/telegram/webhook`;
    await setWebhook(webhookEndpoint, config.telegram.webhookSecret);
    logger.info(`Telegram webhook set → ${webhookEndpoint}`);
  }

  startPoller();
  startIndexer(); // build search index in background
}

bootstrap().catch((err) => {
  logger.error(`Bootstrap failed: ${err.message}`);
  process.exit(1);
});
