/**
 * MAL (MyAnimeList) Service
 * Fetches MAL ratings and vote counts from MyAnimeList API v2
 */

const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');

class MALService {
  constructor() {
    this.clientId = config.malClientId;
    this.timeout = 10000; // 10 second timeout

    // In-memory cache for MAL lookups to reduce API calls
    this.cache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Check if MAL API is configured
   */
  isConfigured() {
    return !!this.clientId;
  }

  /**
   * Get MAL data (rating + vote count) by MAL ID
   * Uses ratings-api database-first caching with 1-week TTL
   *
   * @param {string|number} malId - MAL ID (e.g., "40028" or 40028)
   * @returns {Promise<Object|null>} - MAL data object or null
   */
  async getMalDataByMalId(malId) {
    try {
      if (!this.isConfigured()) {
        logger.debug('MAL API Client ID not configured, skipping MAL data lookup');
        return null;
      }

      if (!malId) {
        logger.debug(`Invalid MAL ID: ${malId}`);
        return null;
      }

      // Normalize MAL ID to string
      const normalizedMalId = String(malId);

      // Check ratings-api database endpoint (has built-in caching logic)
      const ratingsApiUrl = config.ratingsApiUrl || 'http://localhost:3001';
      const response = await axios.get(`${ratingsApiUrl}/api/mal-data/${normalizedMalId}`, {
        timeout: this.timeout,
        validateStatus: (status) => status < 500 // Accept 404 as valid response
      });

      if (response.status === 200 && response.data) {
        logger.debug(`MAL data retrieved for ${normalizedMalId}: ${response.data.title || 'Unknown'} - Rating: ${response.data.malRating || 'N/A'}, Votes: ${response.data.malVotes || 'N/A'}`);
        return response.data;
      }

      if (response.status === 404) {
        logger.debug(`No MAL data found for ${normalizedMalId}`);
        return null;
      }

      return null;

    } catch (error) {
      // Handle connection errors gracefully
      if (error.code === 'ECONNREFUSED') {
        logger.warn(`Could not connect to ratings API for MAL data: ${error.message}`);
      } else {
        logger.warn(`Error fetching MAL data for ${malId}: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Get MAL data for multiple MAL IDs (batch operation)
   * Returns a Map of malId => malData
   *
   * @param {Array<string|number>} malIds - Array of MAL IDs
   * @param {number} concurrency - Number of concurrent requests (default: 3 for MAL API)
   * @returns {Promise<Map<string, Object>>} - Map of MAL ID to MAL data
   */
  async getMalDataBatch(malIds, concurrency = 3) {
    const results = new Map();

    if (!malIds || malIds.length === 0) {
      return results;
    }

    logger.debug(`Batch fetching MAL data for ${malIds.length} items (concurrency: ${concurrency})`);

    // Process in batches for concurrency control
    for (let i = 0; i < malIds.length; i += concurrency) {
      const batch = malIds.slice(i, i + concurrency);

      const batchResults = await Promise.all(
        batch.map(async (malId) => {
          try {
            const data = await this.getMalDataByMalId(malId);
            return { malId: String(malId), data };
          } catch (error) {
            logger.warn(`Error fetching MAL data for ${malId}:`, error.message);
            return { malId: String(malId), data: null };
          }
        })
      );

      // Add results to map
      for (const { malId, data } of batchResults) {
        if (data) {
          results.set(malId, data);
        }
      }

      // Add delay between batches to respect MAL rate limits (200ms)
      if (i + concurrency < malIds.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    logger.debug(`MAL batch fetch complete: ${results.size}/${malIds.length} succeeded`);
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
      logger.debug(`Cleared ${cleared} expired MAL cache entries`);
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
const malService = new MALService();

// Periodic cache cleanup (every hour)
setInterval(() => {
  malService.clearExpiredCache();
}, 60 * 60 * 1000);

module.exports = malService;
