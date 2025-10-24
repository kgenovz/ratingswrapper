/**
 * Rate limiting middleware
 * Implements tiered rate limiting for anonymous and authenticated users
 */

const { checkRateLimit } = require('../services/rateLimitService');
const { extractClientIp, normalizeIp } = require('../utils/ipExtractor');
const { decodeConfig } = require('../utils/configParser');
const logger = require('../utils/logger');
const config = require('../config');
const metricsService = require('../services/metricsService');

/**
 * Determine rate limit tier based on request
 *
 * @param {Object} req - Express request object
 * @returns {Object} - { tier: string, identifier: string }
 */
function determineRateLimitTier(req) {
  // Try to extract userId from config parameter
  const encodedConfig = req.params.config;

  if (encodedConfig) {
    try {
      const userConfig = decodeConfig(encodedConfig);

      // If config has a userId, user is authenticated
      if (userConfig && userConfig.userId) {
        return {
          tier: 'authenticated',
          identifier: userConfig.userId
        };
      }
    } catch (error) {
      // If config parsing fails, treat as anonymous
      logger.debug('Failed to parse config for rate limit tier detection:', error.message);
    }
  }

  // Default to anonymous (IP-based)
  const ip = extractClientIp(req);
  const normalizedIp = normalizeIp(ip);

  return {
    tier: 'anonymous',
    identifier: normalizedIp
  };
}

/**
 * Check if route is a search route (requires stricter limits)
 *
 * @param {Object} req - Express request object
 * @returns {boolean}
 */
function isSearchRoute(req) {
  // Check if this is a catalog route with search parameter
  const path = req.path;
  const hasSearch = req.query.search || path.includes('/search.');

  return hasSearch;
}

/**
 * Create rate limiting middleware with specific limits
 *
 * @param {Object} limits - Rate limit configuration
 * @returns {Function} Express middleware
 */
function createRateLimitMiddleware(limits) {
  return async (req, res, next) => {
    // Skip rate limiting if Redis is not configured
    if (!config.redis.enabled) {
      logger.debug('Rate limiting disabled (Redis not configured)');
      return next();
    }

    try {
      // Determine tier and identifier
      const { tier, identifier } = determineRateLimitTier(req);

      // Determine if this is a search route
      const isSearch = isSearchRoute(req);

      // Select appropriate limit based on tier and route type
      let limit;
      if (isSearch) {
        // Use stricter search limits
        limit = limits.search[tier];
      } else {
        // Use standard limits
        limit = limits.standard[tier];
      }

      // Check rate limit
      const result = await checkRateLimit(identifier, tier, limit);

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', limit.burst || limit.requests);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.floor(result.reset / 1000)); // Unix timestamp in seconds

      // If rate limit exceeded, return 429
      if (!result.allowed) {
        res.setHeader('Retry-After', result.retryAfter);

        logger.warn(`Rate limit exceeded: ${tier}:${identifier} on ${req.path}`);

        // Record rate limit metric
        // Extract route type from path (catalog, meta, manifest, or other)
        const routeType = req.path.includes('/catalog/') ? 'catalog'
          : req.path.includes('/meta/') ? 'meta'
          : req.path.includes('/manifest.json') ? 'manifest'
          : 'other';

        metricsService.recordRateLimit(routeType, tier);

        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Please try again in ${result.retryAfter} seconds.`,
          retryAfter: result.retryAfter,
          tier: tier,
          limit: limit.requests + ' req/s'
        });
      }

      // Log rate limit check
      logger.debug(`Rate limit: ${tier}:${identifier} - ${result.remaining} remaining`);

      // Continue to next middleware
      next();
    } catch (error) {
      // Fail-open: If rate limiting fails, allow the request
      logger.error('Rate limit middleware error:', error.message);
      next();
    }
  };
}

/**
 * Create standard rate limiting middleware for addon routes
 * Uses default limits from config
 *
 * @returns {Function} Express middleware
 */
function createStandardRateLimiter() {
  const limits = {
    standard: {
      anonymous: {
        requests: config.rateLimit.anonymous.requestsPerSecond,
        windowSeconds: 1,
        burst: config.rateLimit.anonymous.burst
      },
      authenticated: {
        requests: config.rateLimit.authenticated.requestsPerSecond,
        windowSeconds: 1,
        burst: config.rateLimit.authenticated.burst
      }
    },
    search: {
      anonymous: {
        requests: config.rateLimit.search.anonymous.requestsPerSecond,
        windowSeconds: 1,
        burst: config.rateLimit.search.anonymous.burst
      },
      authenticated: {
        requests: config.rateLimit.search.authenticated.requestsPerSecond,
        windowSeconds: 1,
        burst: config.rateLimit.search.authenticated.burst
      }
    }
  };

  return createRateLimitMiddleware(limits);
}

module.exports = {
  createRateLimitMiddleware,
  createStandardRateLimiter,
  determineRateLimitTier,
  isSearchRoute
};
