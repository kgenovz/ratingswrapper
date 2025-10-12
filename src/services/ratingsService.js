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
    // Default to localhost:3001 where imdb-ratings-api runs
    this.ratingsApiUrl = process.env.RATINGS_API_URL || 'http://localhost:3001';
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

      logger.debug(`No rating found for ${imdbId}`);
      return null;

    } catch (error) {
      logger.error(`Error fetching rating for ${id}:`, error.message);
      return null;
    }
  }

  /**
   * Fetches ratings for multiple content items in batch
   * @param {Array<Object>} items - Array of {id, type} objects
   * @returns {Promise<Map<string, number>>} Map of ID to rating
   */
  async getRatingsBatch(items) {
    try {
      const ratingsMap = new Map();

      // Process all items in parallel
      await Promise.all(
        items.map(async (item) => {
          const rating = await this.getRating(item.id, item.type);
          if (rating !== null) {
            ratingsMap.set(item.id, rating);
          }
        })
      );

      logger.debug(`Fetched ${ratingsMap.size} ratings for ${items.length} items`);
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
