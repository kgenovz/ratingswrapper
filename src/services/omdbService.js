/**
 * OMDB Service
 * Fetches Rotten Tomatoes and Metacritic ratings from The Open Movie Database (OMDB) API
 */

const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
const redisService = require('./redisService');
const cacheKeys = require('../utils/cacheKeys');

class OMDBService {
  constructor() {
    this.apiKey = config.omdbApiKey;
    this.timeout = 10000; // 10 second timeout

    // In-memory cache for OMDB lookups to reduce API calls
    this.cache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Check if OMDB API is configured
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Get OMDB data (Rotten Tomatoes + Metacritic) by IMDb ID
   * Uses ratings-api database-first caching with 1-week TTL
   *
   * @param {string} imdbId - IMDb ID (e.g., "tt0111161")
   * @returns {Promise<Object|null>} - OMDB data object or null
   */
  async getOmdbDataByImdbId(imdbId) {
    logger.info(`[OMDB-DIAG] getOmdbDataByImdbId called with: ${imdbId}`);

    try {
      if (!this.isConfigured()) {
        logger.info('[OMDB-DIAG] OMDB API key not configured, skipping OMDB data lookup');
        return null;
      }

      if (!imdbId || !imdbId.startsWith('tt')) {
        logger.info(`[OMDB-DIAG] Invalid IMDb ID for OMDB lookup: ${imdbId}`);
        return null;
      }

      // Check Redis cache if enabled
      const cacheEnabled = config.redis.enabled && config.redis.enableRawDataCache;
      logger.debug(`[OMDB-DIAG] Cache enabled: ${cacheEnabled}`);

      if (cacheEnabled) {
        const cacheKey = cacheKeys.generateOmdbDataKey(imdbId);
        const cached = await redisService.get(cacheKey);
        if (cached) {
          logger.info(`[OMDB-DIAG] Cache HIT for ${imdbId}: RT=${cached.rottenTomatoes || 'null'}, MC=${cached.metacritic || 'null'}`);
          // Track hot key usage for observability
          redisService.trackHotKey(cacheKey);
          return cached;
        }
        logger.debug(`[OMDB-DIAG] Cache MISS for ${imdbId}`);
      }

      // Check ratings-api database endpoint (has built-in caching logic)
      const ratingsApiUrl = config.ratingsApiUrl || 'http://localhost:3001';
      logger.debug(`[OMDB-DIAG] Fetching from ratings API: ${ratingsApiUrl}/api/omdb-data/${imdbId}`);

      const response = await axios.get(`${ratingsApiUrl}/api/omdb-data/${imdbId}`, {
        timeout: this.timeout,
        validateStatus: (status) => status < 500 // Accept 404 as valid response
      });

      logger.debug(`[OMDB-DIAG] Ratings API response status: ${response.status}`);

      if (response.status === 200 && response.data) {
        logger.info(`[OMDB-DIAG] ✓ OMDB data retrieved for ${imdbId}: RT=${response.data.rottenTomatoes || 'N/A'}, MC=${response.data.metacritic || 'N/A'}, source=${response.data.source || 'unknown'}`);

        // Cache the successful result
        if (cacheEnabled) {
          const cacheKey = cacheKeys.generateOmdbDataKey(imdbId);
          const ttl = cacheKeys.getRawDataTTL();
          await redisService.set(cacheKey, response.data, ttl);
          logger.debug(`[OMDB-DIAG] Cached OMDB data: ${imdbId} (TTL: ${ttl}s)`);
          // Track hot key after write
          redisService.trackHotKey(cacheKey);
        }

        return response.data;
      }

      if (response.status === 404) {
        logger.info(`[OMDB-DIAG] ✗ No OMDB data found for ${imdbId} (404 from ratings API)`);
        return null;
      }

      logger.info(`[OMDB-DIAG] ✗ Unexpected response status ${response.status} for ${imdbId}`);
      return null;

    } catch (error) {
      // Handle connection errors gracefully
      if (error.code === 'ECONNREFUSED') {
        logger.error(`[OMDB-DIAG] ✗ Could not connect to ratings API for OMDB data: ${error.message}`);
      } else {
        logger.error(`[OMDB-DIAG] ✗ Error fetching OMDB data for ${imdbId}: ${error.message}`, error.response?.data);
      }
      return null;
    }
  }

  /**
   * Get OMDB data for multiple IMDb IDs (batch operation)
   * Returns a Map of imdbId => omdbData
   *
   * @param {string[]} imdbIds - Array of IMDb IDs
   * @param {number} concurrency - Number of concurrent requests (default: 5)
   * @returns {Promise<Map<string, Object>>} - Map of IMDb ID to OMDB data
   */
  async getOmdbDataBatch(imdbIds, concurrency = 5) {
    const results = new Map();

    if (!imdbIds || imdbIds.length === 0) {
      return results;
    }

    logger.debug(`Batch fetching OMDB data for ${imdbIds.length} items (concurrency: ${concurrency})`);

    // Process in batches for concurrency control
    for (let i = 0; i < imdbIds.length; i += concurrency) {
      const batch = imdbIds.slice(i, i + concurrency);

      const batchResults = await Promise.all(
        batch.map(async (imdbId) => {
          try {
            const data = await this.getOmdbDataByImdbId(imdbId);
            return { imdbId, data };
          } catch (error) {
            logger.warn(`Error fetching OMDB data for ${imdbId}:`, error.message);
            return { imdbId, data: null };
          }
        })
      );

      // Add results to map
      for (const { imdbId, data } of batchResults) {
        if (data) {
          results.set(imdbId, data);
        }
      }
    }

    logger.debug(`OMDB batch fetch complete: ${results.size}/${imdbIds.length} succeeded`);
    return results;
  }

  /**
   * Get from in-memory cache
   * @private
   */
  _getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return undefined;

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return cached.value;
  }

  /**
   * Add to in-memory cache
   * @private
   */
  _addToCache(key, value) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheExpiry
    });
  }

  /**
   * Clear expired cache entries (cleanup)
   */
  clearExpiredCache() {
    const now = Date.now();
    let cleared = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now > cached.expiresAt) {
        this.cache.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      logger.debug(`Cleared ${cleared} expired OMDB cache entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      entries: this.cache.size,
      maxAge: this.cacheExpiry / 1000 / 60 / 60, // hours
      configured: this.isConfigured()
    };
  }
}

// Singleton instance
const omdbService = new OMDBService();

// Periodic cache cleanup (every hour)
setInterval(() => {
  omdbService.clearExpiredCache();
}, 60 * 60 * 1000);

module.exports = omdbService;
