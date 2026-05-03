require('dotenv').config();
const express = require('express');
const config = require('./config');
const logger = require('./utils/logger');
const telegramRoutes = require('./routes/telegram');
const healthRoutes = require('./routes/health');
const deskRoutes = require('./routes/desk');
const deskApiRoutes = require('./routes/api/desk');
const storiesApiRoutes = require('./routes/api/stories');
const { setWebhook } = require('./services/telegram/telegramClient');
const { startPoller } = require('./services/notion/notionPoller');

const app = express();

app.use(express.json());
app.use(express.static('public'));
app.use('/telegram', telegramRoutes);
app.use('/desk', deskRoutes);
app.use('/api/desk', deskApiRoutes);
app.use('/api/stories', storiesApiRoutes);
app.use('/', healthRoutes);

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
}

bootstrap().catch((err) => {
  logger.error(`Bootstrap failed: ${err.message}`);
  process.exit(1);
});
