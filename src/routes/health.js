const { Router } = require('express');
const router = Router();

router.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

module.exports = router;
