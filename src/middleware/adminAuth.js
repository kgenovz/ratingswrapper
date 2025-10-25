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
  // If no password is configured, allow access (backwards compatibility)
  if (!config.adminPassword) {
    logger.warn('Admin routes are unprotected - set ADMIN_PASSWORD env variable');
    return next();
  }

  // Get Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
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

    // Check password (username is ignored, can be anything)
    if (password === config.adminPassword) {
      logger.debug('Admin authentication successful');
      return next();
    } else {
      logger.warn('Failed admin authentication attempt from IP:', req.ip);
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid credentials'
      });
    }
  } catch (error) {
    logger.error('Admin auth error:', error.message);
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid authorization header'
    });
  }
}

module.exports = adminAuth;
