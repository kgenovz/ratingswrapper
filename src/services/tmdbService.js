/**
 * TMDB Service
 * Fetches MPAA/content ratings from The Movie Database (TMDB) API
 */

const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');

class TMDBService {
  constructor() {
    this.apiKey = config.tmdbApiKey;
    this.baseUrl = 'https://api.themoviedb.org/3';
    this.timeout = 10000; // 10 second timeout

    // In-memory cache for TMDB lookups to reduce API calls
    this.cache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Check if TMDB API is configured
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Get MPAA/content rating for a title by IMDb ID
   * Returns certification like "PG-13", "R", "TV-MA", etc.
   *
   * @param {string} imdbId - IMDb ID (e.g., "tt0111161")
   * @returns {Promise<string|null>} - MPAA rating or null if not found
   */
  async getMpaaRatingByImdbId(imdbId) {
    try {
      if (!this.isConfigured()) {
        logger.debug('TMDB API key not configured, skipping MPAA lookup');
        return null;
      }

      if (!imdbId || !imdbId.startsWith('tt')) {
        logger.debug(`Invalid IMDb ID for TMDB lookup: ${imdbId}`);
        return null;
      }

      // Check cache first
      const cacheKey = `mpaa:${imdbId}`;
      const cached = this._getFromCache(cacheKey);
      if (cached !== undefined) {
        logger.debug(`TMDB cache hit for ${imdbId}: ${cached || 'null'}`);
        return cached;
      }

      logger.debug(`Fetching MPAA rating from TMDB for ${imdbId}`);

      // Step 1: Use TMDB's Find endpoint to get TMDB ID from IMDb ID
      const findUrl = `${this.baseUrl}/find/${imdbId}`;
      const findResponse = await axios.get(findUrl, {
        params: {
          api_key: this.apiKey,
          external_source: 'imdb_id'
        },
        timeout: this.timeout
      });

      // TMDB Find returns separate arrays for movies and TV shows
      const movieResults = findResponse.data.movie_results || [];
      const tvResults = findResponse.data.tv_results || [];

      let mpaaRating = null;

      // Try movie first
      if (movieResults.length > 0) {
        const tmdbId = movieResults[0].id;
        mpaaRating = await this._getMovieCertification(tmdbId, imdbId);
      }
      // Try TV show if no movie found
      else if (tvResults.length > 0) {
        const tmdbId = tvResults[0].id;
        mpaaRating = await this._getTvCertification(tmdbId, imdbId);
      }
      else {
        logger.debug(`No TMDB results found for ${imdbId}`);
      }

      // Cache the result (including null results to prevent repeated lookups)
      this._addToCache(cacheKey, mpaaRating);

      return mpaaRating;

    } catch (error) {
      // Handle rate limiting
      if (error.response?.status === 429) {
        logger.warn(`TMDB rate limit hit for ${imdbId}, caching null result`);
        this._addToCache(`mpaa:${imdbId}`, null);
        return null;
      }

      // Handle 404 (not found)
      if (error.response?.status === 404) {
        logger.debug(`TMDB: No data found for ${imdbId}`);
        this._addToCache(`mpaa:${imdbId}`, null);
        return null;
      }

      logger.warn(`Error fetching MPAA rating from TMDB for ${imdbId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get US certification for a movie
   * @private
   */
  async _getMovieCertification(tmdbId, imdbId) {
    try {
      const url = `${this.baseUrl}/movie/${tmdbId}/release_dates`;
      const response = await axios.get(url, {
        params: { api_key: this.apiKey },
        timeout: this.timeout
      });

      // Find US release dates
      const usReleases = response.data.results?.find(r => r.iso_3166_1 === 'US');

      if (usReleases && usReleases.release_dates) {
        // Look for theatrical or primary release with certification
        const certified = usReleases.release_dates.find(
          rd => rd.certification && rd.certification.trim() !== ''
        );

        if (certified) {
          const rating = certified.certification.trim();
          logger.info(`Found MPAA rating for ${imdbId}: ${rating} (movie)`);
          return rating;
        }
      }

      logger.debug(`No US certification found for movie ${imdbId} (TMDB: ${tmdbId})`);
      return null;

    } catch (error) {
      logger.debug(`Error fetching movie certification for TMDB ID ${tmdbId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get US content rating for a TV show
   * @private
   */
  async _getTvCertification(tmdbId, imdbId) {
    try {
      const url = `${this.baseUrl}/tv/${tmdbId}/content_ratings`;
      const response = await axios.get(url, {
        params: { api_key: this.apiKey },
        timeout: this.timeout
      });

      // Find US content rating
      const usRating = response.data.results?.find(r => r.iso_3166_1 === 'US');

      if (usRating && usRating.rating) {
        const rating = usRating.rating.trim();
        logger.info(`Found MPAA rating for ${imdbId}: ${rating} (TV)`);
        return rating;
      }

      logger.debug(`No US content rating found for TV show ${imdbId} (TMDB: ${tmdbId})`);
      return null;

    } catch (error) {
      logger.debug(`Error fetching TV content rating for TMDB ID ${tmdbId}: ${error.message}`);
      return null;
    }
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
      logger.debug(`Cleared ${cleared} expired TMDB cache entries`);
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
const tmdbService = new TMDBService();

// Periodic cache cleanup (every hour)
setInterval(() => {
  tmdbService.clearExpiredCache();
}, 60 * 60 * 1000);

module.exports = tmdbService;
