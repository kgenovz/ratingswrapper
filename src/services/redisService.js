/**
 * Redis service wrapper with caching functionality
 * Provides get/set operations with gzip compression, fail-open error handling,
 * and singleflight guard to prevent cache stampedes
 */

const zlib = require('zlib');
const { promisify } = require('util');
const { getRedisClient, isRedisAvailable } = require('../config/redis');
const logger = require('../utils/logger');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Singleflight guard: Map of in-flight requests to prevent stampedes
// Key: cache key, Value: Promise that resolves when the value is available
const inflightRequests = new Map();

/**
 * Get value from Redis cache with decompression (backward compatible)
 *
 * @param {string} key - Cache key
 * @returns {Promise<Object|null>} - Parsed JSON object or null if not found/error
 */
async function get(key) {
  // Fail-open: If Redis is not available, return null
  if (!isRedisAvailable()) {
    logger.debug('Redis not available for GET:', key);
    return null;
  }

  try {
    const client = getRedisClient();
    const compressed = await client.getBuffer(key);

    if (!compressed) {
      logger.debug('Cache miss:', key);
      return null;
    }

    // Decompress and parse JSON
    const decompressed = await gunzip(compressed);
    const data = JSON.parse(decompressed.toString('utf-8'));

    // Handle new cache entry format (with metadata)
    if (data && typeof data === 'object' && data.data && data.timestamp) {
      logger.debug('Cache hit:', key);
      return data.data; // Return unwrapped data
    }

    // Backward compatibility: return raw data for old cache entries
    logger.debug('Cache hit (legacy format):', key);
    return data;
  } catch (error) {
    // Fail-open: Log error but don't throw
    logger.warn('Redis GET error for key', key, ':', error.message);
    return null;
  }
}

/**
 * Get value from Redis cache with SWR (Stale-While-Revalidate) support
 * Returns data and staleness status
 *
 * @param {string} key - Cache key
 * @returns {Promise<Object|null>} - { data, isStale, isFresh } or null if not found
 */
async function getWithSWR(key) {
  // Fail-open: If Redis is not available, return null
  if (!isRedisAvailable()) {
    logger.debug('Redis not available for GET:', key);
    return null;
  }

  try {
    const client = getRedisClient();
    const compressed = await client.getBuffer(key);

    if (!compressed) {
      logger.debug('Cache miss:', key);
      return null;
    }

    // Decompress and parse JSON
    const decompressed = await gunzip(compressed);
    const cacheEntry = JSON.parse(decompressed.toString('utf-8'));

    // Check if this is new format with metadata
    if (!cacheEntry || typeof cacheEntry !== 'object' || !cacheEntry.data || !cacheEntry.timestamp) {
      // Legacy format or malformed data - treat as fresh
      logger.debug('Cache hit (legacy format):', key);
      return {
        data: cacheEntry,
        isStale: false,
        isFresh: true
      };
    }

    // Calculate age and staleness
    const now = Date.now();
    const age = now - cacheEntry.timestamp;
    const freshTtl = cacheEntry.freshTtl * 1000; // Convert to milliseconds
    const isStale = age > freshTtl;
    const isFresh = !isStale;

    logger.debug(`Cache hit: ${key} - Age: ${Math.floor(age / 1000)}s, Fresh TTL: ${cacheEntry.freshTtl}s, Stale: ${isStale}`);

    return {
      data: cacheEntry.data,
      isStale,
      isFresh
    };
  } catch (error) {
    // Fail-open: Log error but don't throw
    logger.warn('Redis GET error for key', key, ':', error.message);
    return null;
  }
}

/**
 * Set value in Redis cache with compression
 *
 * @param {string} key - Cache key
 * @param {Object} value - Value to cache (will be JSON stringified)
 * @param {number} ttl - Time to live in seconds
 * @param {Object} options - Optional settings { staleTtl: number }
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
async function set(key, value, ttl, options = {}) {
  // Fail-open: If Redis is not available, return false but don't throw
  if (!isRedisAvailable()) {
    logger.debug('Redis not available for SET:', key);
    return false;
  }

  try {
    const client = getRedisClient();

    // Wrap value with metadata for SWR support
    const cacheEntry = {
      data: value,
      timestamp: Date.now(),
      freshTtl: ttl
    };

    // JSON stringify and compress
    const json = JSON.stringify(cacheEntry);
    const compressed = await gzip(Buffer.from(json, 'utf-8'));

    // Calculate total TTL (fresh + stale period)
    const staleTtl = options.staleTtl || ttl; // Default: stale period = fresh period
    const totalTtl = ttl + staleTtl;

    // Set with expiration (extended for stale period)
    await client.setex(key, totalTtl, compressed);

    logger.debug('Cache set:', key, 'Fresh TTL:', ttl, 'Total TTL:', totalTtl);
    return true;
  } catch (error) {
    // Fail-open: Log error but don't throw
    logger.warn('Redis SET error for key', key, ':', error.message);
    return false;
  }
}

/**
 * Delete value from Redis cache
 *
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
async function del(key) {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const client = getRedisClient();
    await client.del(key);
    logger.debug('Cache deleted:', key);
    return true;
  } catch (error) {
    logger.warn('Redis DEL error for key', key, ':', error.message);
    return false;
  }
}

/**
 * Get or compute value with singleflight guard
 * Prevents cache stampedes by ensuring only one request computes the value
 * while others wait for the result
 *
 * @param {string} key - Cache key
 * @param {Function} computeFn - Async function to compute value if not in cache
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<Object>} - Cached or computed value
 */
async function getOrCompute(key, computeFn, ttl) {
  // Try to get from cache first
  const cached = await get(key);
  if (cached !== null) {
    return { value: cached, fromCache: true };
  }

  // Check if there's already an in-flight request for this key
  if (inflightRequests.has(key)) {
    logger.debug('Singleflight: Waiting for in-flight request:', key);
    const value = await inflightRequests.get(key);
    return { value, fromCache: false, singleflight: true };
  }

  // Create a new in-flight request
  const promise = (async () => {
    try {
      logger.debug('Singleflight: Computing value for:', key);
      const value = await computeFn();

      // Store in cache
      await set(key, value, ttl);

      return value;
    } finally {
      // Always remove from in-flight map when done
      inflightRequests.delete(key);
    }
  })();

  // Store the promise in the in-flight map
  inflightRequests.set(key, promise);

  const value = await promise;
  return { value, fromCache: false };
}

/**
 * Check if a key exists in cache
 *
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} - True if key exists
 */
async function exists(key) {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const client = getRedisClient();
    const result = await client.exists(key);
    return result === 1;
  } catch (error) {
    logger.warn('Redis EXISTS error for key', key, ':', error.message);
    return false;
  }
}

/**
 * Get cache statistics
 * @returns {Promise<Object|null>} - Redis info or null if unavailable
 */
async function getStats() {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const client = getRedisClient();
    const info = await client.info('stats');
    const keyspace = await client.info('keyspace');
    const memory = await client.info('memory');

    return {
      info,
      keyspace,
      memory,
      inflightRequests: inflightRequests.size
    };
  } catch (error) {
    logger.warn('Redis STATS error:', error.message);
    return null;
  }
}

/**
 * Flush all keys from Redis (use with caution!)
 * @returns {Promise<boolean>} - True if successful
 */
async function flushAll() {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const client = getRedisClient();
    await client.flushall();
    logger.info('Redis cache flushed');
    return true;
  } catch (error) {
    logger.error('Redis FLUSHALL error:', error.message);
    return false;
  }
}

module.exports = {
  get,
  getWithSWR,
  set,
  del,
  getOrCompute,
  exists,
  getStats,
  flushAll
};
