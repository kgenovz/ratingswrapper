/**
 * Ratings Service
 * Handles fetching ratings for content from IMDb Ratings API
 */

const https = require('https');
const http = require('http');
const logger = require('../utils/logger');

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
    this.notFoundCache = new Map();
    this.cacheMaxSize = 1000;

    logger.info(`Ratings API configured: ${this.ratingsApiUrl}`);
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
   * Fetches rating for a single content item
   * @param {string} id - Content ID (IMDb ID or prefixed ID)
   * @param {string} type - Content type (movie, series, etc.)
   * @returns {Promise<number|null>} Rating or null if not found
   */
  async getRating(id, type) {
    try {
      // Validate ID exists
      if (!id) {
        logger.debug('No ID provided for rating lookup');
        return null;
      }

      // Check cache for known not-found items
      if (this.notFoundCache.has(id)) {
        logger.debug(`Skipping cached not-found item: ${id}`);
        return null;
      }

      // Check if this is an episode ID in format: tt12345:1:1 (series:season:episode)
      if (id.includes(':') && id.startsWith('tt')) {
        const parts = id.split(':');
        if (parts.length === 3) {
          const [seriesId, season, episode] = parts;

          // Use the episode endpoint to get the actual episode IMDb ID
          logger.debug(`Fetching episode rating: ${seriesId} S${season}E${episode}`);
          const response = await this._fetchFromApi(`/api/episode/${seriesId}/${season}/${episode}`);

          if (response && response.rating) {
            const rating = parseFloat(response.rating);
            logger.debug(`Episode rating for ${id}: ${rating} (episode ID: ${response.episodeId})`);
            return rating;
          }

          // Cache the not-found result
          this._addToNotFoundCache(id);
          logger.debug(`No episode rating found for ${id}`);
          return null;
        }
      }

      // Regular movie/series rating
      const imdbId = extractImdbId(id);

      if (!imdbId) {
        logger.debug(`No valid IMDb ID found for: ${id}`);
        return null;
      }

      // Call the IMDb Ratings API
      const response = await this._fetchFromApi(`/api/rating/${imdbId}`);

      if (response && response.rating) {
        const rating = parseFloat(response.rating);
        logger.debug(`Rating for ${imdbId}: ${rating}`);
        return rating;
      }

      // Cache the not-found result
      this._addToNotFoundCache(id);
      logger.debug(`No rating found for ${imdbId}`);
      return null;

    } catch (error) {
      // Handle different error types appropriately
      if (error.message.includes('404')) {
        // Cache 404 errors (episode doesn't exist in IMDb)
        this._addToNotFoundCache(id);
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
   * @private
   */
  _addToNotFoundCache(id) {
    // Implement simple LRU-style cache
    if (this.notFoundCache.size >= this.cacheMaxSize) {
      // Remove oldest entry (first item in map)
      const firstKey = this.notFoundCache.keys().next().value;
      this.notFoundCache.delete(firstKey);
    }
    this.notFoundCache.set(id, Date.now());
  }

  /**
   * Fetches ratings for multiple content items in batch with concurrency control
   * @param {Array<Object>} items - Array of {id, type} objects
   * @param {number} concurrency - Maximum number of concurrent requests (default: 10)
   * @returns {Promise<Map<string, number>>} Map of ID to rating
   */
  async getRatingsBatch(items, concurrency = 10) {
    try {
      const ratingsMap = new Map();

      // Filter out items already in not-found cache
      const itemsToFetch = items.filter(item => !this.notFoundCache.has(item.id));
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
              const rating = await this.getRating(item.id, item.type);
              return { id: item.id, rating };
            } catch (error) {
              logger.debug(`Error fetching rating for ${item.id}: ${error.message}`);
              return { id: item.id, rating: null };
            }
          })
        );

        // Add results to map
        batchResults.forEach(({ id, rating }) => {
          if (rating !== null) {
            ratingsMap.set(id, rating);
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
   * Set custom ratings API endpoint
   * @param {string} apiUrl - URL to ratings addon/API
   */
  setRatingsApiUrl(apiUrl) {
    this.ratingsApiUrl = apiUrl;
    logger.info(`Ratings API URL set to: ${apiUrl}`);
  }
}

module.exports = new RatingsService();
