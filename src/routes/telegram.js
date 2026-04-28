const { Router } = require('express');
const config = require('../config');
const { handleUpdate } = require('../controllers/telegramController');
const logger = require('../utils/logger');

const router = Router();

router.post('/webhook', (req, res, next) => {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (config.telegram.webhookSecret && secret !== config.telegram.webhookSecret) {
    logger.warn('Telegram: invalid webhook secret');
    return res.sendStatus(403);
  }
  next();
}, handleUpdate);

module.exports = router;
