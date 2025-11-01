/**
 * Consolidated Rating Service
 * Computes weighted averages from multiple rating sources
 * (IMDb, TMDB, Rotten Tomatoes, Metacritic)
 */

const logger = require('../utils/logger');
const redisService = require('./redisService');
const ratingsService = require('./ratingsService');
const tmdbService = require('./tmdbService');
const omdbService = require('./omdbService');
const cacheKeys = require('../utils/cacheKeys');
const appConfig = require('../config');

class ConsolidatedRatingService {
  constructor() {
    // Cache for failed lookups to avoid redundant API calls
    this.notFoundCache = new Map();
    this.cacheMaxSize = 1000;
    this.notFoundTTL = 24 * 60 * 60 * 1000; // 24 hours

    // Start periodic cleanup (every 5 minutes)
    this._startCleanupInterval();

    logger.info('Consolidated Rating Service initialized');
  }

  /**
   * Start periodic cleanup of expired not-found cache entries
   * @private
   */
  _startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this._cleanupExpiredNotFoundEntries();
    }, 5 * 60 * 1000);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Clean up expired not-found cache entries
   * @private
   */
  _cleanupExpiredNotFoundEntries() {
    const now = Date.now();
    let removedCount = 0;

    for (const [id, entry] of this.notFoundCache.entries()) {
      const ttl = this.notFoundTTL;
      if (now - entry.timestamp > ttl) {
        this.notFoundCache.delete(id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug(`Cleaned up ${removedCount} expired not-found entries`);
    }

    // Enforce max size
    if (this.notFoundCache.size > this.cacheMaxSize) {
      const toRemove = this.notFoundCache.size - this.cacheMaxSize;
      const keysArray = Array.from(this.notFoundCache.keys());
      for (let i = 0; i < toRemove; i++) {
        this.notFoundCache.delete(keysArray[i]);
      }
      logger.debug(`Evicted ${toRemove} oldest entries from not-found cache`);
    }
  }

  /**
   * Add ID to not-found cache
   * @private
   */
  _addToNotFoundCache(id) {
    this.notFoundCache.set(id, { timestamp: Date.now() });
  }

  /**
   * Check if ID is in not-found cache (respecting TTL)
   * @private
   */
  _isInNotFoundCache(id) {
    const entry = this.notFoundCache.get(id);
    if (!entry) return false;

    const now = Date.now();
    const ttl = this.notFoundTTL;

    if (now - entry.timestamp > ttl) {
      this.notFoundCache.delete(id);
      return false;
    }

    return true;
  }

  /**
   * Normalize rating to 0-10 scale
   * @private
   * @param {number} value - Rating value
   * @param {string} type - Rating type ('imdb', 'tmdb', 'rt', 'mc')
   * @returns {number} Normalized rating (0-10)
   */
  _normalizeRating(value, type) {
    if (value === null || value === undefined) return null;

    const numValue = typeof value === 'string' ? parseFloat(value) : value;

    switch (type) {
      case 'imdb':
      case 'tmdb':
        // Already 0-10 scale
        return numValue;

      case 'rt':
      case 'mc':
        // 0-100 → 0-10
        return numValue / 10;

      default:
        logger.warn(`Unknown rating type for normalization: ${type}`);
        return null;
    }
  }

  /**
   * Compute average rating from multiple sources
   * @private
   * @param {Object} sources - Object with source ratings
   * @returns {number|null} Average rating (0-10 scale) or null
   */
  _computeAverageRating(sources) {
    const normalized = [];

    // IMDb: already 0-10
    if (sources.imdb !== null && sources.imdb !== undefined) {
      const value = this._normalizeRating(sources.imdb, 'imdb');
      if (value !== null) normalized.push(value);
    }

    // TMDB: already 0-10
    if (sources.tmdb !== null && sources.tmdb !== undefined) {
      const value = this._normalizeRating(sources.tmdb, 'tmdb');
      if (value !== null) normalized.push(value);
    }

    // Rotten Tomatoes: 0-100 → 0-10
    if (sources.rottenTomatoes !== null && sources.rottenTomatoes !== undefined) {
      const value = this._normalizeRating(sources.rottenTomatoes, 'rt');
      if (value !== null) normalized.push(value);
    }

    // Metacritic: 0-100 → 0-10
    if (sources.metacritic !== null && sources.metacritic !== undefined) {
      const value = this._normalizeRating(sources.metacritic, 'mc');
      if (value !== null) normalized.push(value);
    }

    // Compute average
    if (normalized.length === 0) return null;
    const sum = normalized.reduce((a, b) => a + b, 0);
    const avg = sum / normalized.length;

    // Round to 1 decimal place
    return Math.round(avg * 10) / 10;
  }

  /**
   * Get color indicator based on rating
   * @private
   * @param {number} rating - Consolidated rating (0-10)
   * @returns {string} Color indicator ('excellent', 'great', 'good', 'okay', 'mediocre', 'poor')
   */
  _getColorIndicator(rating) {
    if (rating === null || rating === undefined) return null;

    if (rating >= 9.0) return 'excellent';  // 90%+ - Dark Green
    if (rating >= 8.0) return 'great';      // 80-89% - Light Green
    if (rating >= 7.0) return 'good';       // 70-79% - Yellow/Gold
    if (rating >= 6.0) return 'okay';       // 60-69% - Orange
    if (rating >= 5.0) return 'mediocre';   // 50-59% - Light Red
    return 'poor';                          // <50% - Dark Red
  }

  /**
   * Get consolidated rating for a single item
   * @param {string} imdbId - IMDb ID
   * @param {string} type - Content type ('movie' or 'series')
   * @param {Object} options - Additional options
   * @param {boolean} options.forceRefresh - Force refresh from APIs
   * @param {string} options.region - TMDB region for streaming data (default: 'US')
   * @returns {Object|null} Consolidated rating data or null
   */
  async getConsolidatedRating(imdbId, type = 'movie', options = {}) {
    try {
      if (!imdbId || !imdbId.startsWith('tt')) {
        logger.debug(`Invalid IMDb ID for consolidated rating: ${imdbId}`);
        return null;
      }

      // Check not-found cache first (unless forcing refresh)
      if (!options.forceRefresh && this._isInNotFoundCache(imdbId)) {
        logger.debug(`Consolidated rating not-found cache HIT: ${imdbId}`);
        return null;
      }

      // Check Redis cache
      const cacheEnabled = appConfig.redis.enabled && appConfig.redis.enableRawDataCache;
      if (cacheEnabled && !options.forceRefresh) {
        const cacheKey = cacheKeys.generateConsolidatedRatingKey(imdbId);
        const cached = await redisService.get(cacheKey);
        if (cached) {
          logger.debug(`✓ Consolidated rating cache HIT: ${imdbId} - ${cached.consolidatedRating}`);
          redisService.trackHotKey(cacheKey);
          return cached;
        }
        logger.debug(`✗ Consolidated rating cache MISS: ${imdbId}`);
      }

      // Fetch from all sources in parallel
      logger.debug(`Fetching consolidated rating from all sources: ${imdbId} (${type})`);
      const region = options.region || 'US';

      const [imdbData, tmdbData, omdbData] = await Promise.all([
        ratingsService.getRating(imdbId, type).catch(err => {
          logger.debug(`Error fetching IMDb rating for ${imdbId}: ${err.message}`);
          return null;
        }),
        tmdbService.getTmdbDataByImdbId(imdbId, region).catch(err => {
          logger.debug(`Error fetching TMDB data for ${imdbId}: ${err.message}`);
          return null;
        }),
        omdbService.getOmdbDataByImdbId(imdbId, type).catch(err => {
          logger.debug(`Error fetching OMDB data for ${imdbId}: ${err.message}`);
          return null;
        })
      ]);

      // Extract ratings from each source
      const sources = {};

      if (imdbData?.rating) {
        sources.imdb = parseFloat(imdbData.rating);
      }

      if (tmdbData?.tmdbRating) {
        sources.tmdb = parseFloat(tmdbData.tmdbRating);
      }

      // Debug OMDB data structure
      if (omdbData) {
        logger.debug(`OMDB data for ${imdbId}:`, JSON.stringify(omdbData));
      }

      if (omdbData?.rottenTomatoes) {
        // Parse percentage string (e.g., "85%" → 85)
        const rtValue = typeof omdbData.rottenTomatoes === 'string'
          ? parseInt(omdbData.rottenTomatoes.replace('%', ''))
          : parseInt(omdbData.rottenTomatoes);
        if (!isNaN(rtValue)) {
          sources.rottenTomatoes = rtValue;
          logger.debug(`Extracted RT rating: ${rtValue} from ${omdbData.rottenTomatoes}`);
        } else {
          logger.warn(`Failed to parse RT rating from: ${omdbData.rottenTomatoes}`);
        }
      } else {
        logger.debug(`No RT rating in OMDB data for ${imdbId}`);
      }

      if (omdbData?.metacritic) {
        const mcValue = typeof omdbData.metacritic === 'string'
          ? parseInt(omdbData.metacritic)
          : parseInt(omdbData.metacritic);
        if (!isNaN(mcValue)) {
          sources.metacritic = mcValue;
          logger.debug(`Extracted MC rating: ${mcValue} from ${omdbData.metacritic}`);
        } else {
          logger.warn(`Failed to parse MC rating from: ${omdbData.metacritic}`);
        }
      } else {
        logger.debug(`No MC rating in OMDB data for ${imdbId}`);
      }

      // Compute consolidated rating
      const consolidatedRating = this._computeAverageRating(sources);
      const sourceCount = Object.keys(sources).length;

      // If no sources found, cache as not-found and return null
      if (sourceCount === 0 || consolidatedRating === null) {
        logger.info(`✗ No ratings found for ${imdbId} from any source`);
        this._addToNotFoundCache(imdbId);
        return null;
      }

      const colorIndicator = this._getColorIndicator(consolidatedRating);

      const result = {
        consolidatedRating,
        sourceCount,
        sources,
        colorIndicator,
        computedAt: new Date().toISOString()
      };

      logger.info(`✓ Consolidated rating computed for ${imdbId}: ${consolidatedRating} (${sourceCount} sources: ${Object.keys(sources).join(', ')})`);

      // Cache the result in Redis
      if (cacheEnabled) {
        const cacheKey = cacheKeys.generateConsolidatedRatingKey(imdbId);
        const ttl = cacheKeys.getRawDataTTL();
        await redisService.set(cacheKey, result, ttl);
        logger.debug(`Cached consolidated rating: ${imdbId} (TTL: ${Math.floor(ttl / 3600)}h)`);
        redisService.trackHotKey(cacheKey);
      }

      return result;

    } catch (error) {
      logger.error(`Error computing consolidated rating for ${imdbId}:`, error.message);
      return null;
    }
  }

  /**
   * Get consolidated ratings for multiple items in batch
   * @param {Array} items - Array of items with {id, type} properties
   * @param {number} concurrency - Concurrent requests limit (default: 10)
   * @param {Object} options - Additional options
   * @returns {Map} Map of imdbId → consolidated rating data
   */
  async getConsolidatedRatingsBatch(items, concurrency = 10, options = {}) {
    try {
      const ratingsMap = new Map();

      // Filter out items already in not-found cache
      const itemsToFetch = items.filter(item => {
        const imdbId = item.id?.startsWith('tt') ? item.id : null;
        return imdbId && !this._isInNotFoundCache(imdbId);
      });

      const skippedCount = items.length - itemsToFetch.length;

      if (skippedCount > 0) {
        logger.info(`Skipping ${skippedCount} cached not-found items`);
      }

      if (itemsToFetch.length === 0) {
        logger.info('All items are in not-found cache, skipping fetch');
        return ratingsMap;
      }

      // Process items in batches with controlled concurrency
      logger.info(`Fetching consolidated ratings for ${itemsToFetch.length} items with concurrency limit of ${concurrency}`);

      for (let i = 0; i < itemsToFetch.length; i += concurrency) {
        const batch = itemsToFetch.slice(i, i + concurrency);
        const batchNumber = Math.floor(i / concurrency) + 1;
        const totalBatches = Math.ceil(itemsToFetch.length / concurrency);

        logger.debug(`Processing consolidated rating batch ${batchNumber}/${totalBatches} (${batch.length} items)`);

        // Process this batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (item) => {
            try {
              const imdbId = item.id?.startsWith('tt') ? item.id.split(':')[0] : item.id;
              const ratingData = await this.getConsolidatedRating(imdbId, item.type, options);
              return { id: item.id, ratingData };
            } catch (error) {
              logger.debug(`Error fetching consolidated rating for ${item.id}: ${error.message}`);
              return { id: item.id, ratingData: null };
            }
          })
        );

        // Add results to map
        batchResults.forEach(({ id, ratingData }) => {
          if (ratingData !== null) {
            ratingsMap.set(id, ratingData);
          }
        });

        // Small delay between batches to avoid overwhelming APIs
        if (i + concurrency < itemsToFetch.length) {
          const delay = batchNumber === 1 ? 300 : 50;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      logger.info(`✓ Fetched ${ratingsMap.size}/${itemsToFetch.length} consolidated ratings successfully`);
      return ratingsMap;

    } catch (error) {
      logger.error('Error in batch consolidated rating fetch:', error.message);
      return new Map();
    }
  }
}

// Export singleton instance
module.exports = new ConsolidatedRatingService();
