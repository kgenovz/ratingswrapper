/**
 * Ratings Service
 * Handles fetching ratings for content from IMDb Ratings API
 */

const https = require('https');
const http = require('http');
const logger = require('../utils/logger');
const redisService = require('./redisService');
const cacheKeys = require('../utils/cacheKeys');
const appConfig = require('../config');

/**
 * Extracts IMDb ID from various ID formats
 * @param {string} id - Content ID (e.g., "tt1234567", "movie:tt1234567", "tt1234567:1:1")
 * @returns {string|null} IMDb ID or null if not found
 */
function extractImdbId(id) {
  if (!id) return null;

  // Handle different ID formats:
  // 1. "tt1234567" - direct IMDb ID
  // 2. "movie:tt1234567" - type prefix
  // 3. "tt1234567:1:1" - episode format (series:season:episode)

  // First check if it starts with tt (episode format or direct IMDb)
  if (id.startsWith('tt')) {
    // Extract just the IMDb ID part (before any colon)
    const imdbId = id.split(':')[0];
    if (/^tt\d+$/.test(imdbId)) {
      return imdbId;
    }
  }

  // Handle type prefix format (e.g., "movie:tt1234567")
  if (id.includes(':')) {
    const parts = id.split(':');
    for (const part of parts) {
      if (/^tt\d+$/.test(part)) {
        return part;
      }
    }
  }

  // Direct IMDb ID
  if (/^tt\d+$/.test(id)) {
    return id;
  }

  return null;
}

class RatingsService {
  constructor() {
    // Default to internal ratings routes on the same server
    const port = process.env.PORT || 7000;
    this.ratingsApiUrl = process.env.RATINGS_API_URL || `http://127.0.0.1:${port}/ratings`;

    // Cache for failed lookups to avoid retrying non-existent episodes
    // Format: Map<id, { timestamp, isEpisode }>
    this.notFoundCache = new Map();
    this.cacheMaxSize = 1000;

    // TTL for not-found cache entries (in milliseconds)
    this.notFoundTTL = {
      episode: 30 * 60 * 1000, // 30 minutes for episodes (might be added later)
      default: 24 * 60 * 60 * 1000 // 24 hours for movies/series (unlikely to change)
    };

    // Start periodic cleanup (every 5 minutes)
    this._startCleanupInterval();

    logger.info(`Ratings API configured: ${this.ratingsApiUrl}`);
  }

  /**
   * Start periodic cleanup of expired not-found cache entries
   * @private
   */
  _startCleanupInterval() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this._cleanupExpiredNotFoundEntries();
    }, 5 * 60 * 1000);

    // Don't keep the process alive for this interval
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
      const ttl = entry.isEpisode ? this.notFoundTTL.episode : this.notFoundTTL.default;
      const age = now - entry.timestamp;

      if (age > ttl) {
        this.notFoundCache.delete(id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug(`Cleaned up ${removedCount} expired not-found cache entries (${this.notFoundCache.size} remaining)`);
    }
  }

  /**
   * Check if an ID is in the not-found cache and still valid (not expired)
   * @param {string} id - ID to check
   * @returns {boolean} True if cached and not expired
   * @private
   */
  _isInNotFoundCache(id) {
    const entry = this.notFoundCache.get(id);
    if (!entry) {
      return false;
    }

    // Check if entry has expired
    const now = Date.now();
    const ttl = entry.isEpisode ? this.notFoundTTL.episode : this.notFoundTTL.default;
    const age = now - entry.timestamp;

    if (age > ttl) {
      // Entry expired, remove it
      this.notFoundCache.delete(id);
      logger.debug(`Not-found cache entry expired for ${id} (age: ${Math.floor(age / 1000 / 60)}m)`);
      return false;
    }

    return true;
  }

  /**
   * Makes HTTP request to ratings API
   * @param {string} endpoint - API endpoint
   * @returns {Promise<Object>} API response
   * @private
   */
  async _fetchFromApi(endpoint) {
    return new Promise((resolve, reject) => {
      const url = `${this.ratingsApiUrl}${endpoint}`;
      const protocol = url.startsWith('https') ? https : http;

      protocol.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 404) {
            resolve(null); // Rating not found
            return;
          }
          if (res.statusCode >= 400) {
            reject(new Error(`API Error ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${e.message}`));
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Fetches rating for a single content item with Redis caching
   * @param {string} id - Content ID (IMDb ID or prefixed ID)
   * @param {string} type - Content type (movie, series, etc.)
   * @returns {Promise<Object|null>} Rating object {rating, votes} or null if not found
   */
  async getRating(id, type) {
    try {
      // Validate ID exists
      if (!id) {
        logger.debug('No ID provided for rating lookup');
        return null;
      }

      // Check cache for known not-found items (with TTL expiry)
      if (this._isInNotFoundCache(id)) {
        logger.debug(`Skipping cached not-found item: ${id}`);
        return null;
      }

      // Check if this is an episode ID in format: tt12345:1:1 (series:season:episode)
      if (id.includes(':') && id.startsWith('tt')) {
        const parts = id.split(':');
        if (parts.length === 3) {
          const [seriesId, season, episode] = parts;

          // For episodes, we don't cache (too many unique IDs)
          // Use the episode endpoint to get the actual episode IMDb ID
          logger.debug(`Fetching episode rating: ${seriesId} S${season}E${episode} (ID: ${id})`);

          try {
            const response = await this._fetchFromApi(`/api/episode/${seriesId}/${season}/${episode}`);

            if (response && response.rating) {
              const ratingData = {
                rating: parseFloat(response.rating),
                votes: response.votes ? parseInt(response.votes) : null,
                voteCount: response.votes ? parseInt(response.votes) : null
              };
              logger.debug(`✓ Episode rating found for ${id}: ${ratingData.rating} (${ratingData.votes} votes, episode IMDb: ${response.episodeId || 'N/A'})`);
              return ratingData;
            }

            // Response was null or no rating field
            logger.info(`✗ Episode rating not found for ${id} (${seriesId} S${season}E${episode}) - API returned ${response ? 'empty response' : 'null'}`);
            this._addToNotFoundCache(id, true);
            return null;
          } catch (episodeError) {
            // Enhanced error logging for episodes
            if (episodeError.message.includes('404')) {
              logger.info(`✗ Episode not in database: ${id} (${seriesId} S${season}E${episode}) - 404 Not Found`);
            } else if (episodeError.message.includes('502')) {
              logger.info(`✗ Episode API unavailable: ${id} (${seriesId} S${season}E${episode}) - 502 Bad Gateway (not caching)`);
              return null; // Don't cache 502 errors
            } else {
              logger.warn(`✗ Episode lookup failed for ${id} (${seriesId} S${season}E${episode}): ${episodeError.message}`);
            }
            this._addToNotFoundCache(id, true);
            return null;
          }
        }
      }

      // Regular movie/series rating
      const imdbId = extractImdbId(id);

      if (!imdbId) {
        logger.debug(`No valid IMDb ID found for: ${id}`);
        return null;
      }

      logger.debug(`Fetching ${type || 'content'} rating for IMDb ID: ${imdbId}`);

      // Check Redis cache if enabled
      const cacheEnabled = appConfig.redis.enabled && appConfig.redis.enableRawDataCache;
      if (cacheEnabled) {
        const cacheKey = cacheKeys.generateImdbRatingKey(imdbId);
        const cached = await redisService.get(cacheKey);
        if (cached) {
          logger.debug(`✓ IMDb rating cache HIT: ${imdbId} - ${cached.rating}`);
          // Track hot key usage for observability
          redisService.trackHotKey(cacheKey);
          return cached;
        }
        logger.debug(`✗ IMDb rating cache MISS: ${imdbId}`);
      }

      // Call the IMDb Ratings API
      const response = await this._fetchFromApi(`/api/rating/${imdbId}`);

      if (response && response.rating) {
        const ratingData = {
          rating: parseFloat(response.rating),
          votes: response.votes ? parseInt(response.votes) : null,
          voteCount: response.votes ? parseInt(response.votes) : null
        };
        logger.debug(`✓ Rating found for ${imdbId}: ${ratingData.rating}/10 (${ratingData.votes?.toLocaleString() || 'N/A'} votes)`);

        // Cache the successful result
        if (cacheEnabled) {
          const cacheKey = cacheKeys.generateImdbRatingKey(imdbId);
          const ttl = cacheKeys.getRawDataTTL();
          await redisService.set(cacheKey, ratingData, ttl);
          logger.debug(`Cached IMDb rating: ${imdbId} (TTL: ${Math.floor(ttl / 3600)}h)`);
          // Track hot key after write
          redisService.trackHotKey(cacheKey);
        }

        return ratingData;
      }

      // Cache the not-found result (movie/series)
      logger.info(`✗ Rating not found for ${imdbId} (${type || 'content'}) - API returned ${response ? 'empty response' : 'null'}`);
      this._addToNotFoundCache(id, false);
      return null;

    } catch (error) {
      // Handle different error types appropriately
      if (error.message.includes('404')) {
        // Cache 404 errors (episode doesn't exist in IMDb)
        const isEpisode = id.includes(':') && id.startsWith('tt');
        this._addToNotFoundCache(id, isEpisode);
        logger.debug(`Rating not found for ${id} (404 - cached)`);
      } else if (error.message.includes('502')) {
        // 502 errors usually mean episode not released yet or temporary API issue
        // Don't cache these, just log as debug to reduce noise
        logger.debug(`Episode not available yet or API issue for ${id} (502)`);
      } else {
        // Log other errors as errors
        logger.error(`Error fetching rating for ${id}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Add an ID to the not-found cache with size limit
   * @param {string} id - ID to cache
   * @param {boolean} isEpisode - Whether this is an episode ID (affects TTL)
   * @private
   */
  _addToNotFoundCache(id, isEpisode = false) {
    // Implement simple LRU-style cache
    if (this.notFoundCache.size >= this.cacheMaxSize) {
      // Remove oldest entry (first item in map)
      const firstKey = this.notFoundCache.keys().next().value;
      this.notFoundCache.delete(firstKey);
    }

    const entry = {
      timestamp: Date.now(),
      isEpisode
    };

    this.notFoundCache.set(id, entry);

    const ttl = isEpisode ? this.notFoundTTL.episode : this.notFoundTTL.default;
    logger.debug(`Added ${id} to not-found cache (isEpisode: ${isEpisode}, TTL: ${Math.floor(ttl / 1000 / 60)}m)`);
  }

  /**
   * Fetches ratings for multiple content items in batch with concurrency control
   * @param {Array<Object>} items - Array of {id, type} objects
   * @param {number} concurrency - Maximum number of concurrent requests (default: 10)
   * @returns {Promise<Map<string, Object>>} Map of ID to rating object {rating, votes}
   */
  async getRatingsBatch(items, concurrency = 10) {
    try {
      const ratingsMap = new Map();

      // Filter out items already in not-found cache (respecting TTL)
      const itemsToFetch = items.filter(item => !this._isInNotFoundCache(item.id));
      const skippedCount = items.length - itemsToFetch.length;

      if (skippedCount > 0) {
        logger.info(`Skipping ${skippedCount} cached not-found items`);
      }

      if (itemsToFetch.length === 0) {
        logger.info('All items are in not-found cache, skipping fetch');
        return ratingsMap;
      }

      // Process items in batches with controlled concurrency
      logger.info(`Fetching ratings for ${itemsToFetch.length} items with concurrency limit of ${concurrency}`);

      for (let i = 0; i < itemsToFetch.length; i += concurrency) {
        const batch = itemsToFetch.slice(i, i + concurrency);
        const batchNumber = Math.floor(i / concurrency) + 1;
        const totalBatches = Math.ceil(itemsToFetch.length / concurrency);

        logger.debug(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`);

        // Process this batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (item) => {
            try {
              const ratingData = await this.getRating(item.id, item.type);
              return { id: item.id, ratingData };
            } catch (error) {
              logger.debug(`Error fetching rating for ${item.id}: ${error.message}`);
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

        // Small delay between batches - only needed on first batch for warmup
        if (i + concurrency < itemsToFetch.length) {
          const delay = batchNumber === 1 ? 300 : 50;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      logger.info(`Fetched ${ratingsMap.size} ratings for ${itemsToFetch.length} items (${skippedCount} cached not-found)`);
      return ratingsMap;

    } catch (error) {
      logger.error('Error fetching batch ratings:', error.message);
      return new Map();
    }
  }

  /**
   * Fetches MPAA rating for a specific IMDb ID with Redis caching
   * @param {string} imdbId - IMDb ID (e.g., "tt1234567")
   * @returns {Promise<string|null>} MPAA rating or null if not found
   */
  async getMpaaRating(imdbId) {
    try {
      if (!imdbId || !imdbId.startsWith('tt')) {
        logger.debug(`Invalid IMDb ID for MPAA lookup: ${imdbId}`);
        return null;
      }

      // Check Redis cache if enabled
      const cacheEnabled = appConfig.redis.enabled && appConfig.redis.enableRawDataCache;
      if (cacheEnabled) {
        const cacheKey = cacheKeys.generateMpaaRatingKey(imdbId);
        const cached = await redisService.get(cacheKey);
        if (cached) {
          logger.debug(`MPAA rating cache HIT: ${imdbId}`);
          // Track hot key usage for observability
          redisService.trackHotKey(cacheKey);
          return cached;
        }
        logger.debug(`MPAA rating cache MISS: ${imdbId}`);
      }

      const response = await this._fetchFromApi(`/api/mpaa-rating/${imdbId}`);

      if (response && (response.mpaaRating || response.mpaa_rating)) {
        const mpaa = response.mpaaRating || response.mpaa_rating;
        logger.debug(`MPAA rating for ${imdbId}: ${mpaa}`);

        // Cache the successful result
        if (cacheEnabled) {
          const cacheKey = cacheKeys.generateMpaaRatingKey(imdbId);
          const ttl = cacheKeys.getRawDataTTL();
          await redisService.set(cacheKey, mpaa, ttl);
          logger.debug(`Cached MPAA rating: ${imdbId} (TTL: ${ttl}s)`);
          // Track hot key after write
          redisService.trackHotKey(cacheKey);
        }

        return mpaa;
      }

      logger.debug(`No MPAA rating found for ${imdbId}`);
      return null;

    } catch (error) {
      logger.debug(`Error fetching MPAA rating for ${imdbId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetches MPAA ratings for multiple IMDb IDs in batch with concurrency control and rate limiting
   * This prevents overwhelming the TMDB API on initial catalog load
   * @param {Array<string>} imdbIds - Array of IMDb IDs (e.g., ["tt1234567", "tt7654321"])
   * @param {number} concurrency - Maximum number of concurrent requests (default: 5 for TMDB)
   * @param {number} delayMs - Delay between batches in ms (default: 200ms for rate limiting)
   * @returns {Promise<Map<string, string>>} Map of IMDb ID to MPAA rating
   */
  async getMpaaRatingsBatch(imdbIds, concurrency = 5, delayMs = 200) {
    try {
      const mpaaMap = new Map();

      // Filter out invalid IDs
      const validIds = imdbIds.filter(id => id && id.startsWith('tt'));

      if (validIds.length === 0) {
        logger.debug('No valid IMDb IDs for MPAA batch lookup');
        return mpaaMap;
      }

      logger.info(`Fetching MPAA ratings for ${validIds.length} items with concurrency limit of ${concurrency}`);

      // Process items in batches with controlled concurrency
      for (let i = 0; i < validIds.length; i += concurrency) {
        const batch = validIds.slice(i, i + concurrency);
        const batchNumber = Math.floor(i / concurrency) + 1;
        const totalBatches = Math.ceil(validIds.length / concurrency);

        logger.debug(`Processing MPAA batch ${batchNumber}/${totalBatches} (${batch.length} items)`);

        // Process this batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (imdbId) => {
            try {
              const mpaaRating = await this.getMpaaRating(imdbId);
              return { imdbId, mpaaRating };
            } catch (error) {
              logger.debug(`Error fetching MPAA rating for ${imdbId}: ${error.message}`);
              return { imdbId, mpaaRating: null };
            }
          })
        );

        // Add results to map
        batchResults.forEach(({ imdbId, mpaaRating }) => {
          if (mpaaRating !== null) {
            mpaaMap.set(imdbId, mpaaRating);
          }
        });

        // Add delay between batches to respect TMDB rate limits
        if (i + concurrency < validIds.length) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      logger.info(`Fetched ${mpaaMap.size} MPAA ratings for ${validIds.length} items`);
      return mpaaMap;

    } catch (error) {
      logger.error('Error fetching batch MPAA ratings:', error.message);
      return new Map();
    }
  }

  /**
   * Set custom ratings API endpoint
   * @param {string} apiUrl - URL to ratings addon/API
   */
  setRatingsApiUrl(apiUrl) {
    this.ratingsApiUrl = apiUrl;
    logger.info(`Ratings API URL set to: ${apiUrl}`);
  }
}

module.exports = new RatingsService();
