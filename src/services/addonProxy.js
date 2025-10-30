/**
 * Addon Proxy Service
 * Handles fetching data from wrapped Stremio addons
 */

const axios = require('axios');
const logger = require('../utils/logger');
const appConfig = require('../config');
const redisService = require('./redisService');
const cacheKeys = require('../utils/cacheKeys');

class AddonProxyService {
  constructor() {
    this.timeout = appConfig.proxy.timeout;
    this.retries = appConfig.proxy.retries;
  }

  /**
   * Makes HTTP request to addon with retry logic
   * @param {string} url - Full URL to fetch
   * @param {number} attempt - Current retry attempt
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _fetchWithRetry(url, attempt = 1) {
    try {
      logger.debug(`Fetching: ${url} (attempt ${attempt}/${this.retries})`);

      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Stremio-Ratings-Wrapper/1.0'
        }
      });

      return response.data;

    } catch (error) {
      const statusCode = error.response?.status;

      // Don't retry 4xx errors (client errors like 404, 400, etc.) - they won't succeed on retry
      const isClientError = statusCode >= 400 && statusCode < 500;

      if (!isClientError && attempt < this.retries) {
        logger.debug(`Retry ${attempt} failed for ${url}: ${error.message}`);
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        return this._fetchWithRetry(url, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Normalizes addon URL (removes trailing slashes, ensures proper format)
   * @param {string} url - Addon base URL
   * @returns {string} Normalized URL
   * @private
   */
  _normalizeAddonUrl(url) {
    // Remove trailing slashes
    let normalized = url.replace(/\/+$/, '');

    // Remove /manifest.json if present
    normalized = normalized.replace(/\/manifest\.json$/, '');

    return normalized;
  }

  /**
   * Fetches manifest from wrapped addon
   * @param {string} addonUrl - Base URL of the wrapped addon
   * @returns {Promise<Object>} Manifest object
   */
  async fetchManifest(addonUrl) {
    try {
      const baseUrl = this._normalizeAddonUrl(addonUrl);
      const manifestUrl = `${baseUrl}/manifest.json`;

      logger.info(`Fetching manifest from: ${manifestUrl}`);

      const manifest = await this._fetchWithRetry(manifestUrl);

      // Validate manifest has required fields
      if (!manifest.id || !manifest.name || !manifest.resources) {
        throw new Error('Invalid manifest: missing required fields');
      }

      logger.debug(`Manifest fetched: ${manifest.name} (${manifest.id})`);
      return manifest;

    } catch (error) {
      logger.error(`Failed to fetch manifest from ${addonUrl}:`, error.message);
      throw new Error(`Unable to fetch manifest from wrapped addon: ${error.message}`);
    }
  }

  /**
   * Fetches catalog from wrapped addon with optional caching
   * @param {string} addonUrl - Base URL of the wrapped addon
   * @param {string} type - Content type (movie, series, etc.)
   * @param {string} id - Catalog ID
   * @param {Object} extra - Extra parameters (skip, search, genre, etc.)
   * @returns {Promise<Object>} Catalog response with metas array
   */
  async fetchCatalog(addonUrl, type, id, extra = {}) {
    try {
      const baseUrl = this._normalizeAddonUrl(addonUrl);

      // Check if raw data caching is enabled
      const cacheEnabled = appConfig.redis.enabled && appConfig.redis.enableRawDataCache;

      if (cacheEnabled) {
        // Generate cache key based on addon URL and catalog parameters (format-agnostic)
        const cacheKey = cacheKeys.generateRawCatalogKey({
          addonUrl: baseUrl,
          type,
          catalogId: id,
          page: extra.skip || '',
          search: extra.search || '',
          genre: extra.genre || ''
        });

        // Try to get from cache first
        const cached = await redisService.get(cacheKey);
        if (cached) {
          logger.info(`Raw catalog cache HIT: ${cacheKey}`);
          // Track hot key usage for observability
          redisService.trackHotKey(cacheKey);
          return cached;
        }

        logger.debug(`Raw catalog cache MISS: ${cacheKey}`);
      }

      // Build catalog URL with extra parameters
      let catalogUrl = `${baseUrl}/catalog/${type}/${id}`;

      // Add extra parameters if present
      const extraParams = Object.entries(extra)
        .filter(([_, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');

      if (extraParams) {
        catalogUrl += `/${extraParams}`;
      }

      catalogUrl += '.json';

      logger.info(`Fetching catalog: ${catalogUrl}`);

      const catalogResponse = await this._fetchWithRetry(catalogUrl);

      // Log the response structure for debugging
      logger.debug(`Catalog response keys: ${Object.keys(catalogResponse).join(', ')}`);
      logger.debug(`Full response: ${JSON.stringify(catalogResponse).substring(0, 500)}`);

      // Normalize catalog response - support both 'metas' and 'metasDetailed' formats
      if (catalogResponse.metasDetailed && Array.isArray(catalogResponse.metasDetailed)) {
        logger.debug(`Normalizing metasDetailed to metas format (${catalogResponse.metasDetailed.length} items)`);
        catalogResponse.metas = catalogResponse.metasDetailed;
      }

      // Validate response has metas array
      if (!catalogResponse.metas || !Array.isArray(catalogResponse.metas)) {
        logger.warn(`Catalog ${type}/${id} returned unexpected format. Keys: ${Object.keys(catalogResponse).join(', ')}. Returning empty catalog.`);
        catalogResponse.metas = [];
      }

      logger.debug(`Catalog fetched: ${catalogResponse.metas.length} items`);

      // Cache the raw catalog response if caching is enabled
      if (cacheEnabled) {
        const cacheKey = cacheKeys.generateRawCatalogKey({
          addonUrl: baseUrl,
          type,
          catalogId: id,
          page: extra.skip || '',
          search: extra.search || '',
          genre: extra.genre || ''
        });

        const ttl = cacheKeys.getCatalogTTL(id);
        await redisService.set(cacheKey, catalogResponse, ttl);
        logger.debug(`Cached raw catalog: ${cacheKey} (TTL: ${ttl}s)`);
        // Track hot key after write
        redisService.trackHotKey(cacheKey);
      }

      return catalogResponse;

    } catch (error) {
      const statusCode = error.response?.status;
      const logLevel = (statusCode === 404 || statusCode === 500) ? 'debug' : 'error';
      logger[logLevel](`Failed to fetch catalog ${type}/${id}: ${error.message}`);
      throw new Error(`Unable to fetch catalog: ${error.message}`);
    }
  }

  /**
   * Fetch meta object from addon
   * @param {string} addonUrl - Base URL of the addon
   * @param {string} type - Content type
   * @param {string} id - Content ID
   * @returns {Promise<Object>} Meta object
   */
  async fetchMeta(addonUrl, type, id) {
    try {
      const baseUrl = this._normalizeAddonUrl(addonUrl);
      const metaUrl = `${baseUrl}/meta/${type}/${id}.json`;

      logger.info(`Fetching meta: ${metaUrl}`);

      const metaResponse = await this._fetchWithRetry(metaUrl);

      if (!metaResponse.meta) {
        // Addon returned 200 but with invalid response - doesn't support this ID format
        logger.debug(`Meta ${type}/${id} returned invalid response (missing meta object) - addon likely doesn't support this ID format`);
        throw new Error('Invalid meta response: missing meta object');
      }

      return metaResponse;

    } catch (error) {
      const statusCode = error.response?.status;
      const isInvalidResponse = error.message.includes('Invalid meta response');
      // Expected failures: 404, 500, or invalid response structure (addon doesn't support ID format)
      const logLevel = (statusCode === 404 || statusCode === 500 || isInvalidResponse) ? 'debug' : 'error';
      logger[logLevel](`Failed to fetch meta ${type}/${id}: ${error.message}`);
      throw new Error(`Unable to fetch meta: ${error.message}`);
    }
  }

  /**
   * Fetch meta from Cinemeta (fallback metadata provider)
   * @param {string} type - Content type
   * @param {string} id - Content ID (IMDb ID)
   * @returns {Promise<Object>} Meta object
   */
  async fetchMetaFromCinemeta(type, id) {
    try {
      const cinemataUrl = appConfig.metadataProviders.cinemeta;
      const metaUrl = `${cinemataUrl}/meta/${type}/${id}.json`;

      logger.info(`Fetching meta from Cinemeta: ${metaUrl}`);

      const metaResponse = await this._fetchWithRetry(metaUrl);

      if (!metaResponse.meta) {
        logger.debug(`Cinemeta ${type}/${id} returned invalid response (missing meta object)`);
        throw new Error('Invalid Cinemeta response: missing meta object');
      }

      logger.debug(`Cinemeta returned meta for: ${metaResponse.meta.name}`);
      return metaResponse;

    } catch (error) {
      const statusCode = error.response?.status;
      const isInvalidResponse = error.message.includes('Invalid') && error.message.includes('response');
      const logLevel = (statusCode === 404 || statusCode === 500 || isInvalidResponse) ? 'debug' : 'error';
      logger[logLevel](`Failed to fetch meta from Cinemeta ${type}/${id}: ${error.message}`);
      throw new Error(`Unable to fetch meta from Cinemeta: ${error.message}`);
    }
  }
}

module.exports = new AddonProxyService();
