/**
 * Redis cache middleware for addon endpoints
 * Implements caching for catalog, meta, and manifest endpoints
 * with X-Ratings-Cache headers and latency logging
 */

const redisService = require('../services/redisService');
const cacheKeys = require('../utils/cacheKeys');
const logger = require('../utils/logger');
const config = require('../config');

// Track in-flight background refreshes to prevent duplicate work
const refreshInProgress = new Map();

/**
 * Background refresh for catalog cache (non-blocking)
 * Fetches fresh data and updates cache without blocking the response
 */
async function refreshCatalogInBackground(req, configParam, type, id, extra, cacheKey, ttl, staleTtl) {
  // Prevent duplicate refresh for the same key
  if (refreshInProgress.has(cacheKey)) {
    logger.debug(`Background refresh already in progress for: ${cacheKey}`);
    return;
  }

  refreshInProgress.set(cacheKey, true);

  try {
    logger.debug(`Starting background refresh for catalog ${type}/${id}`);

    // Import handlers dynamically to avoid circular dependencies
    const { parseConfigFromPath } = require('../utils/configParser');
    const { createCatalogHandler } = require('../handlers/catalog');

    const addonConfig = parseConfigFromPath(configParam);
    const catalogHandler = createCatalogHandler(addonConfig);

    // Fetch fresh data
    const freshData = await catalogHandler({ type, id, extra });

    // Update cache with fresh data
    await redisService.set(cacheKey, freshData, ttl, { staleTtl });

    logger.info(`Background refresh completed for catalog ${type}/${id}`);
  } catch (error) {
    logger.warn(`Background refresh failed for catalog ${type}/${id}:`, error.message);
    // Fail gracefully - stale cache will continue to be served
  } finally {
    refreshInProgress.delete(cacheKey);
  }
}

/**
 * Background refresh for meta cache (non-blocking)
 */
async function refreshMetaInBackground(req, configParam, type, id, cacheKey, ttl, staleTtl) {
  if (refreshInProgress.has(cacheKey)) {
    logger.debug(`Background refresh already in progress for: ${cacheKey}`);
    return;
  }

  refreshInProgress.set(cacheKey, true);

  try {
    logger.debug(`Starting background refresh for meta ${type}/${id}`);

    const { parseConfigFromPath } = require('../utils/configParser');
    const { createMetaHandler } = require('../handlers/meta');

    const addonConfig = parseConfigFromPath(configParam);
    const metaHandler = createMetaHandler(addonConfig);

    const freshData = await metaHandler({ type, id });
    await redisService.set(cacheKey, freshData, ttl, { staleTtl });

    logger.info(`Background refresh completed for meta ${type}/${id}`);
  } catch (error) {
    logger.warn(`Background refresh failed for meta ${type}/${id}:`, error.message);
  } finally {
    refreshInProgress.delete(cacheKey);
  }
}

/**
 * Background refresh for manifest cache (non-blocking)
 */
async function refreshManifestInBackground(req, configParam, cacheKey, ttl, staleTtl) {
  if (refreshInProgress.has(cacheKey)) {
    logger.debug(`Background refresh already in progress for: ${cacheKey}`);
    return;
  }

  refreshInProgress.set(cacheKey, true);

  try {
    logger.debug(`Starting background refresh for manifest`);

    const { parseConfigFromPath } = require('../utils/configParser');
    const { createManifestHandler } = require('../handlers/manifest');

    const addonConfig = parseConfigFromPath(configParam);
    const manifestHandler = createManifestHandler(addonConfig);

    const result = await manifestHandler();
    await redisService.set(cacheKey, result.manifest, ttl, { staleTtl });

    logger.info(`Background refresh completed for manifest`);
  } catch (error) {
    logger.warn(`Background refresh failed for manifest:`, error.message);
  } finally {
    refreshInProgress.delete(cacheKey);
  }
}

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
    const staleTtl = ttl; // Stale period = fresh period (e.g., 6h fresh + 6h stale = 12h total)

    // Try to get from cache with SWR support
    const cacheResult = await redisService.getWithSWR(cacheKey);

    if (cacheResult) {
      const { data, isStale, isFresh } = cacheResult;
      const latency = Date.now() - startTime;

      if (isStale) {
        // Serve stale content immediately
        res.setHeader('X-Ratings-Cache', 'stale');
        logger.info(`Cache STALE for catalog ${type}/${id} (${latency}ms) - triggering background refresh - key: ${cacheKey}`);

        // Trigger background refresh (non-blocking)
        refreshCatalogInBackground(req, configParam, type, id, extra, cacheKey, ttl, staleTtl);

        return res.json(data);
      } else {
        // Serve fresh content
        res.setHeader('X-Ratings-Cache', 'hit');
        logger.info(`Cache HIT for catalog ${type}/${id} (${latency}ms) - key: ${cacheKey}`);

        return res.json(data);
      }
    }

    // Cache miss - intercept response to cache it
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      const latency = Date.now() - startTime;
      res.setHeader('X-Ratings-Cache', 'miss');
      logger.info(`Cache MISS for catalog ${type}/${id} (${latency}ms) - key: ${cacheKey}`);

      // Cache the response asynchronously (don't wait)
      redisService.set(cacheKey, data, ttl, { staleTtl }).catch(err => {
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
    const staleTtl = ttl; // Stale period = fresh period (24h fresh + 24h stale = 48h total)

    // Try to get from cache with SWR support
    const cacheResult = await redisService.getWithSWR(cacheKey);

    if (cacheResult) {
      const { data, isStale, isFresh } = cacheResult;
      const latency = Date.now() - startTime;

      if (isStale) {
        // Serve stale content immediately
        res.setHeader('X-Ratings-Cache', 'stale');
        logger.info(`Cache STALE for meta ${type}/${id} (${latency}ms) - triggering background refresh - key: ${cacheKey}`);

        // Trigger background refresh (non-blocking)
        refreshMetaInBackground(req, configParam, type, id, cacheKey, ttl, staleTtl);

        return res.json(data);
      } else {
        // Serve fresh content
        res.setHeader('X-Ratings-Cache', 'hit');
        logger.info(`Cache HIT for meta ${type}/${id} (${latency}ms) - key: ${cacheKey}`);

        return res.json(data);
      }
    }

    // Cache miss - intercept response to cache it
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      const latency = Date.now() - startTime;
      res.setHeader('X-Ratings-Cache', 'miss');
      logger.info(`Cache MISS for meta ${type}/${id} (${latency}ms) - key: ${cacheKey}`);

      // Cache the response asynchronously (don't wait)
      redisService.set(cacheKey, data, ttl, { staleTtl }).catch(err => {
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
    const staleTtl = ttl; // Stale period = fresh period (24h fresh + 24h stale = 48h total)

    // Try to get from cache with SWR support
    const cacheResult = await redisService.getWithSWR(cacheKey);

    if (cacheResult) {
      const { data, isStale, isFresh } = cacheResult;
      const latency = Date.now() - startTime;

      if (isStale) {
        // Serve stale content immediately
        res.setHeader('X-Ratings-Cache', 'stale');
        logger.info(`Cache STALE for manifest (${latency}ms) - triggering background refresh - key: ${cacheKey}`);

        // Trigger background refresh (non-blocking)
        refreshManifestInBackground(req, configParam, cacheKey, ttl, staleTtl);

        return res.json(data);
      } else {
        // Serve fresh content
        res.setHeader('X-Ratings-Cache', 'hit');
        logger.info(`Cache HIT for manifest (${latency}ms) - key: ${cacheKey}`);

        return res.json(data);
      }
    }

    // Cache miss - intercept response to cache it
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      const latency = Date.now() - startTime;
      res.setHeader('X-Ratings-Cache', 'miss');
      logger.info(`Cache MISS for manifest (${latency}ms) - key: ${cacheKey}`);

      // Cache the response asynchronously (don't wait)
      redisService.set(cacheKey, data, ttl, { staleTtl }).catch(err => {
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
