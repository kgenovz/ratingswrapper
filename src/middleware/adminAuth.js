/**
 * Admin Authentication Middleware
 * Protects admin routes with HTTP Basic Authentication
 */

const config = require('../config');
const logger = require('../utils/logger');

/**
 * Basic Auth middleware for admin routes
 * Requires ADMIN_PASSWORD env variable to be set
 */
function adminAuth(req, res, next) {
  logger.debug(`Admin auth check for: ${req.method} ${req.path}`);

  // If no password is configured, allow access (backwards compatibility)
  if (!config.adminPassword) {
    logger.warn('Admin routes are unprotected - set ADMIN_PASSWORD env variable');
    return next();
  }

  logger.debug('Admin password is configured, checking credentials');

  // Get Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    logger.debug('No auth header or not Basic auth, requesting credentials');
    // Request authentication
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide admin credentials'
    });
  }

  try {
    // Decode Basic Auth credentials
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [username, password] = credentials.split(':');

    logger.debug(`Auth attempt - username: ${username}, password length: ${password?.length || 0}`);

    // Check password (username is ignored, can be anything)
    if (password === config.adminPassword) {
      logger.info(`Admin authentication successful from IP: ${req.ip}`);
      return next();
    } else {
      logger.warn(`Failed admin authentication attempt from IP: ${req.ip}`);
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid credentials'
      });
    }
  } catch (error) {
    logger.error('Admin auth error:', error.message, error.stack);
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid authorization header'
    });
  }
}

module.exports = adminAuth;
