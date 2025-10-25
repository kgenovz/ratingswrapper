/**
 * Request logging utility
 * Provides structured, privacy-preserving logs for each request
 * Format: JSON with ts, route, cache, status, latency_ms, key_digest, etc.
 */

const crypto = require('crypto');
const logger = require('./logger');

/**
 * Generate a short digest of a cache key for logging (privacy-preserving)
 * Only logs first 8 characters of SHA1 hash
 * @param {string} key - Cache key to hash
 * @returns {string} - Short digest (8 chars)
 */
function generateKeyDigest(key) {
  if (!key) return null;

  const hash = crypto.createHash('sha1').update(key).digest('hex');
  return hash.slice(0, 8);
}

/**
 * Mask user IDs and tokens for privacy
 * @param {string} value - Value to mask
 * @returns {string} - Masked value (first 4 + last 4 chars)
 */
function maskSensitiveValue(value) {
  if (!value || value.length <= 8) return '****';

  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

/**
 * Extract request metadata for structured logging
 * @param {Object} req - Express request object
 * @param {Object} additionalData - Additional data to include in log
 * @returns {Object} - Structured log data
 */
function extractRequestMetadata(req, additionalData = {}) {
  const {
    route,
    cache,
    latency_ms,
    cacheKey,
    status,
    type,
    catalogId,
    metaId,
    page,
    search,
    userId
  } = additionalData;

  return {
    ts: new Date().toISOString(),
    route: route || req.path,
    method: req.method,
    cache: cache || 'none',
    status: status || 200,
    latency_ms: latency_ms || 0,
    key_digest: cacheKey ? generateKeyDigest(cacheKey) : null,
    type: type || null,
    catalogId: catalogId || null,
    metaId: metaId || null,
    page: page || null,
    search_len: search ? search.length : 0,
    user_scope: userId ? 'user' : '_',
    ip: req.ip || req.connection?.remoteAddress || null,
    user_agent: req.get('user-agent') ? req.get('user-agent').slice(0, 50) : null
  };
}

/**
 * Log a request with structured JSON format
 * @param {Object} req - Express request object
 * @param {Object} metadata - Additional metadata
 */
function logRequest(req, metadata = {}) {
  const logData = extractRequestMetadata(req, metadata);

  // Remove null values for cleaner logs
  Object.keys(logData).forEach(key => {
    if (logData[key] === null || logData[key] === undefined) {
      delete logData[key];
    }
  });

  // Log as JSON string for easy parsing
  logger.info(JSON.stringify(logData));
}

/**
 * Express middleware for automatic request logging
 * Logs all requests with latency and response status
 */
function requestLoggingMiddleware(req, res, next) {
  const startTime = Date.now();

  // Capture original end function
  const originalEnd = res.end;

  // Override res.end to log when response completes
  res.end = function(...args) {
    const latency_ms = Date.now() - startTime;

    // Extract route type from path
    const pathParts = req.path.split('/').filter(Boolean);
    let route = 'other';

    if (pathParts.includes('catalog')) {
      route = 'catalog';
    } else if (pathParts.includes('meta')) {
      route = 'meta';
    } else if (pathParts.includes('manifest.json')) {
      route = 'manifest';
    } else if (req.path.startsWith('/api')) {
      route = 'api';
    } else if (req.path.startsWith('/admin')) {
      route = 'admin';
    } else if (req.path === '/metrics') {
      route = 'metrics';
    } else if (req.path === '/healthz') {
      route = 'healthz';
    }

    // Get cache status from header if available
    const cache = res.getHeader('X-Ratings-Cache') || 'none';

    logRequest(req, {
      route,
      cache,
      latency_ms,
      status: res.statusCode
    });

    // Call original end
    return originalEnd.apply(res, args);
  };

  next();
}

module.exports = {
  logRequest,
  generateKeyDigest,
  maskSensitiveValue,
  extractRequestMetadata,
  requestLoggingMiddleware
};
