/**
 * Rate limiting service using Redis
 * Implements sliding window counter algorithm for distributed rate limiting
 */

const { getRedisClient, isRedisAvailable } = require('../config/redis');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Check if request is allowed under rate limit
 * Uses sliding window counter algorithm with Redis
 *
 * @param {string} identifier - Unique identifier (IP or userId)
 * @param {string} tier - Rate limit tier ('anonymous' or 'authenticated')
 * @param {Object} limit - Rate limit config { requests: number, windowSeconds: number, burst: number }
 * @returns {Promise<Object>} - { allowed: boolean, remaining: number, reset: number, retryAfter: number }
 */
async function checkRateLimit(identifier, tier, limit) {
  // If Redis is not available, allow all requests (fail-open)
  if (!isRedisAvailable()) {
    logger.debug('Redis not available, bypassing rate limit');
    return {
      allowed: true,
      remaining: limit.burst || limit.requests,
      reset: Date.now() + (limit.windowSeconds * 1000),
      retryAfter: 0
    };
  }

  try {
    const client = getRedisClient();
    const now = Date.now();
    const windowMs = limit.windowSeconds * 1000;
    const windowStart = now - windowMs;

    // Key format: ratelimit:v{version}:{tier}:{identifier}
    const version = config.redis.cacheVersion || '1';
    const key = `ratelimit:v${version}:${tier}:${identifier}`;

    // Use Redis sorted set to track requests in a sliding window
    // Score = timestamp, Member = unique request ID

    // Remove old requests outside the window
    await client.zremrangebyscore(key, 0, windowStart);

    // Count requests in current window
    const currentCount = await client.zcard(key);

    // Determine if request is allowed (check against burst limit if available)
    const maxRequests = limit.burst || limit.requests;
    const allowed = currentCount < maxRequests;

    if (allowed) {
      // Add current request to the set
      const requestId = `${now}:${Math.random()}`;
      await client.zadd(key, now, requestId);

      // Set expiration on the key (cleanup old keys)
      await client.expire(key, limit.windowSeconds * 2);
    }

    // Calculate remaining requests
    const remaining = Math.max(0, maxRequests - currentCount - (allowed ? 1 : 0));

    // Calculate reset time (when the oldest request in window expires)
    let reset = now + windowMs;
    if (currentCount > 0) {
      const oldestScore = await client.zrange(key, 0, 0, 'WITHSCORES');
      if (oldestScore && oldestScore.length >= 2) {
        const oldestTimestamp = parseInt(oldestScore[1], 10);
        reset = oldestTimestamp + windowMs;
      }
    }

    // Calculate retry-after in seconds (only if not allowed)
    const retryAfter = allowed ? 0 : Math.ceil((reset - now) / 1000);

    logger.debug(`Rate limit check: ${tier}:${identifier} - Count: ${currentCount}/${maxRequests}, Allowed: ${allowed}`);

    return {
      allowed,
      remaining,
      reset,
      retryAfter
    };
  } catch (error) {
    // Fail-open: If Redis fails, allow the request
    logger.warn('Rate limit check error:', error.message);
    return {
      allowed: true,
      remaining: limit.burst || limit.requests,
      reset: Date.now() + (limit.windowSeconds * 1000),
      retryAfter: 0
    };
  }
}

/**
 * Get current rate limit status without incrementing
 *
 * @param {string} identifier - Unique identifier (IP or userId)
 * @param {string} tier - Rate limit tier ('anonymous' or 'authenticated')
 * @param {Object} limit - Rate limit config
 * @returns {Promise<Object>} - { remaining: number, reset: number }
 */
async function getRateLimitStatus(identifier, tier, limit) {
  if (!isRedisAvailable()) {
    return {
      remaining: limit.burst || limit.requests,
      reset: Date.now() + (limit.windowSeconds * 1000)
    };
  }

  try {
    const client = getRedisClient();
    const now = Date.now();
    const windowMs = limit.windowSeconds * 1000;
    const windowStart = now - windowMs;

    const version = config.redis.cacheVersion || '1';
    const key = `ratelimit:v${version}:${tier}:${identifier}`;

    // Remove old requests
    await client.zremrangebyscore(key, 0, windowStart);

    // Count current requests
    const currentCount = await client.zcard(key);

    const maxRequests = limit.burst || limit.requests;
    const remaining = Math.max(0, maxRequests - currentCount);

    // Calculate reset time
    let reset = now + windowMs;
    if (currentCount > 0) {
      const oldestScore = await client.zrange(key, 0, 0, 'WITHSCORES');
      if (oldestScore && oldestScore.length >= 2) {
        const oldestTimestamp = parseInt(oldestScore[1], 10);
        reset = oldestTimestamp + windowMs;
      }
    }

    return { remaining, reset };
  } catch (error) {
    logger.warn('Rate limit status error:', error.message);
    return {
      remaining: limit.burst || limit.requests,
      reset: Date.now() + (limit.windowSeconds * 1000)
    };
  }
}

/**
 * Reset rate limit for an identifier (admin function)
 *
 * @param {string} identifier - Unique identifier
 * @param {string} tier - Rate limit tier
 * @returns {Promise<boolean>} - True if successful
 */
async function resetRateLimit(identifier, tier) {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const client = getRedisClient();
    const version = config.redis.cacheVersion || '1';
    const key = `ratelimit:v${version}:${tier}:${identifier}`;
    await client.del(key);
    logger.info(`Rate limit reset for ${tier}:${identifier}`);
    return true;
  } catch (error) {
    logger.warn('Rate limit reset error:', error.message);
    return false;
  }
}

/**
 * Get rate limit stats for monitoring
 *
 * @returns {Promise<Object|null>} - Stats object or null
 */
async function getRateLimitStats() {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const client = getRedisClient();

    // Scan for all rate limit keys
    const version = config.redis.cacheVersion || '1';
    const keys = await client.keys(`ratelimit:v${version}:*`);

    const stats = {
      totalKeys: keys.length,
      byTier: {
        anonymous: 0,
        authenticated: 0
      }
    };

    // Count keys by tier
    for (const key of keys) {
      if (key.includes(':anonymous:')) {
        stats.byTier.anonymous++;
      } else if (key.includes(':authenticated:')) {
        stats.byTier.authenticated++;
      }
    }

    return stats;
  } catch (error) {
    logger.warn('Rate limit stats error:', error.message);
    return null;
  }
}

module.exports = {
  checkRateLimit,
  getRateLimitStatus,
  resetRateLimit,
  getRateLimitStats
};
