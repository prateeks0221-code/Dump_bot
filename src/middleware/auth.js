/**
 * Portal authentication middleware.
 * Reads PORTAL_SECRET from env. If not set → passthrough (dev mode).
 * Token must be sent as: X-Portal-Token header OR ?token= query param.
 */
const logger = require('../utils/logger');

const PORTAL_SECRET = process.env.PORTAL_SECRET;

if (!PORTAL_SECRET) {
  logger.warn('PORTAL_SECRET not set — portal APIs are PUBLIC. Set PORTAL_SECRET in env to enable auth.');
}

function portalAuth(req, res, next) {
  // No secret configured → open mode (local dev)
  if (!PORTAL_SECRET) return next();

  const token =
    req.headers['x-portal-token'] ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    req.query.token;

  if (token === PORTAL_SECRET) return next();

  logger.warn(`portalAuth: rejected ${req.method} ${req.path} — ip=${req.ip} ua=${req.headers['user-agent']?.slice(0, 60)}`);
  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { portalAuth };
