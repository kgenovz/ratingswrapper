/**
 * Redis client configuration and initialization
 */

const Redis = require('ioredis');
const config = require('./index');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Initialize Redis client if enabled
 * @returns {Redis|null} Redis client instance or null if disabled
 */
function initRedisClient() {
  if (!config.redis.enabled) {
    logger.info('Redis caching is disabled (REDIS_URL not configured)');
    return null;
  }

  try {
    redisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err) {
        logger.warn('Redis connection error, attempting reconnect:', err.message);
        return true;
      },
      lazyConnect: false,
      enableOfflineQueue: false, // Fail fast if Redis is unavailable
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected successfully');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
      // On ready, log memory and eviction policy for visibility
      try {
        redisClient.info('memory').then((mem) => {
          const usedMatch = mem.match(/used_memory_human:([^\r\n]+)/);
          const maxMatch = mem.match(/maxmemory_human:([^\r\n]+)/);
          const policyMatch = mem.match(/maxmemory_policy:([^\r\n]+)/);
          const used = usedMatch ? usedMatch[1].trim() : 'unknown';
          const max = maxMatch ? maxMatch[1].trim() : 'unknown';
          const policy = policyMatch ? policyMatch[1].trim() : 'unknown';
          logger.info(`Redis memory: used=${used}, max=${max}, policy=${policy}`);
          if (policy === 'noeviction') {
            logger.warn('Redis eviction policy is noeviction; cache writes may fail at maxmemory. Consider allkeys-lfu or volatile-lru.');
          }
        }).catch((e) => {
          logger.debug('Failed to read Redis memory info:', e.message);
        });
      } catch (e) {
        logger.debug('Redis memory info check skipped:', e.message);
      }
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err.message);
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });

    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis client:', error.message);
    return null;
  }
}

/**
 * Get the Redis client instance
 * @returns {Redis|null} Redis client or null if not initialized/disabled
 */
function getRedisClient() {
  return redisClient;
}

/**
 * Check if Redis is available and connected
 * @returns {boolean} True if Redis is available
 */
function isRedisAvailable() {
  return redisClient !== null && redisClient.status === 'ready';
}

/**
 * Close Redis connection gracefully
 * @returns {Promise<void>}
 */
async function closeRedis() {
  if (redisClient) {
    logger.info('Closing Redis connection...');
    await redisClient.quit();
    redisClient = null;
  }
}

module.exports = {
  initRedisClient,
  getRedisClient,
  isRedisAvailable,
  closeRedis
};
