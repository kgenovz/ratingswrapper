/**
 * Redis cache middleware for addon endpoints
 * Implements caching for catalog, meta, and manifest endpoints
 * with X-Ratings-Cache headers and latency logging
 */

const redisService = require('../services/redisService');
const cacheKeys = require('../utils/cacheKeys');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Cache middleware for catalog endpoints
 * Caches catalog responses with appropriate TTL based on catalog type
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
async function catalogCacheMiddleware(req, res, next) {
  // Skip if Redis is disabled
  if (!config.redis.enabled) {
    return next();
  }

  const startTime = Date.now();
  const { config: configParam, type, id } = req.params;
  const extra = req.params.extra ? parseExtra(req.params.extra) : req.query;

  try {
    // Parse addon config from URL
    const { parseConfigFromPath } = require('../utils/configParser');
    const addonConfig = parseConfigFromPath(configParam);

    // Generate cache key
    const cacheKey = cacheKeys.generateCatalogKey({
      addonConfig,
      type,
      id,
      page: extra.skip || '',
      search: extra.search || '',
      genre: extra.genre || ''
    });

    // Determine if user-specific (would need userId in real implementation)
    const isUserSpecific = cacheKeys.isUserSpecificAddon(addonConfig);
    const ttl = cacheKeys.getCatalogTTL(id, isUserSpecific);

    // Try to get from cache
    const cached = await redisService.get(cacheKey);

    if (cached) {
      const latency = Date.now() - startTime;
      res.setHeader('X-Ratings-Cache', 'hit');
      logger.info(`Cache HIT for catalog ${type}/${id} (${latency}ms) - key: ${cacheKey}`);

      return res.json(cached);
    }

    // Cache miss - intercept response to cache it
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      const latency = Date.now() - startTime;
      res.setHeader('X-Ratings-Cache', 'miss');
      logger.info(`Cache MISS for catalog ${type}/${id} (${latency}ms) - key: ${cacheKey}`);

      // Cache the response asynchronously (don't wait)
      redisService.set(cacheKey, data, ttl).catch(err => {
        logger.warn('Failed to cache catalog response:', err.message);
      });

      return originalJson(data);
    };

    next();

  } catch (error) {
    // Fail-open: Log error and continue without cache
    const latency = Date.now() - startTime;
    res.setHeader('X-Ratings-Cache', 'bypass');
    logger.warn(`Cache error for catalog (${latency}ms):`, error.message);
    next();
  }
}

/**
 * Cache middleware for meta endpoints
 * Caches meta responses with 24h TTL
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
async function metaCacheMiddleware(req, res, next) {
  // Skip if Redis is disabled
  if (!config.redis.enabled) {
    return next();
  }

  const startTime = Date.now();
  const { config: configParam, type, id } = req.params;

  try {
    // Parse addon config from URL
    const { parseConfigFromPath } = require('../utils/configParser');
    const addonConfig = parseConfigFromPath(configParam);

    // Generate cache key
    const cacheKey = cacheKeys.generateMetaKey({
      addonConfig,
      type,
      id
    });

    const ttl = cacheKeys.getMetaTTL();

    // Try to get from cache
    const cached = await redisService.get(cacheKey);

    if (cached) {
      const latency = Date.now() - startTime;
      res.setHeader('X-Ratings-Cache', 'hit');
      logger.info(`Cache HIT for meta ${type}/${id} (${latency}ms) - key: ${cacheKey}`);

      return res.json(cached);
    }

    // Cache miss - intercept response to cache it
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      const latency = Date.now() - startTime;
      res.setHeader('X-Ratings-Cache', 'miss');
      logger.info(`Cache MISS for meta ${type}/${id} (${latency}ms) - key: ${cacheKey}`);

      // Cache the response asynchronously (don't wait)
      redisService.set(cacheKey, data, ttl).catch(err => {
        logger.warn('Failed to cache meta response:', err.message);
      });

      return originalJson(data);
    };

    next();

  } catch (error) {
    // Fail-open: Log error and continue without cache
    const latency = Date.now() - startTime;
    res.setHeader('X-Ratings-Cache', 'bypass');
    logger.warn(`Cache error for meta (${latency}ms):`, error.message);
    next();
  }
}

/**
 * Cache middleware for manifest endpoints
 * Caches manifest responses with 24h TTL
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
async function manifestCacheMiddleware(req, res, next) {
  // Skip if Redis is disabled
  if (!config.redis.enabled) {
    return next();
  }

  const startTime = Date.now();
  const { config: configParam } = req.params;

  try {
    // Parse addon config from URL
    const { parseConfigFromPath } = require('../utils/configParser');
    const addonConfig = parseConfigFromPath(configParam);

    // Generate cache key
    const cacheKey = cacheKeys.generateManifestKey({
      addonConfig
    });

    const ttl = cacheKeys.getManifestTTL();

    // Try to get from cache
    const cached = await redisService.get(cacheKey);

    if (cached) {
      const latency = Date.now() - startTime;
      res.setHeader('X-Ratings-Cache', 'hit');
      logger.info(`Cache HIT for manifest (${latency}ms) - key: ${cacheKey}`);

      // For manifest, we need to return just the manifest property
      return res.json(cached);
    }

    // Cache miss - intercept response to cache it
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      const latency = Date.now() - startTime;
      res.setHeader('X-Ratings-Cache', 'miss');
      logger.info(`Cache MISS for manifest (${latency}ms) - key: ${cacheKey}`);

      // Cache the response asynchronously (don't wait)
      redisService.set(cacheKey, data, ttl).catch(err => {
        logger.warn('Failed to cache manifest response:', err.message);
      });

      return originalJson(data);
    };

    next();

  } catch (error) {
    // Fail-open: Log error and continue without cache
    const latency = Date.now() - startTime;
    res.setHeader('X-Ratings-Cache', 'bypass');
    logger.warn(`Cache error for manifest (${latency}ms):`, error.message);
    next();
  }
}

/**
 * Parse extra parameters from path format (key=value&key2=value2)
 * @param {string} extraStr - Extra parameters string
 * @returns {Object} - Parsed extra parameters
 */
function parseExtra(extraStr) {
  const extra = {};
  if (extraStr) {
    extraStr.split('&').forEach(param => {
      const [key, value] = param.split('=');
      if (key && value) {
        extra[key] = decodeURIComponent(value);
      }
    });
  }
  return extra;
}

module.exports = {
  catalogCacheMiddleware,
  metaCacheMiddleware,
  manifestCacheMiddleware
};
