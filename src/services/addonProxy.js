/**
 * Addon Proxy Service
 * Handles fetching data from wrapped Stremio addons
 */

const axios = require('axios');
const logger = require('../utils/logger');
const appConfig = require('../config');

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
      if (attempt < this.retries) {
        logger.warn(`Retry ${attempt} failed for ${url}:`, error.message);
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
   * Fetches catalog from wrapped addon
   * @param {string} addonUrl - Base URL of the wrapped addon
   * @param {string} type - Content type (movie, series, etc.)
   * @param {string} id - Catalog ID
   * @param {Object} extra - Extra parameters (skip, search, genre, etc.)
   * @returns {Promise<Object>} Catalog response with metas array
   */
  async fetchCatalog(addonUrl, type, id, extra = {}) {
    try {
      const baseUrl = this._normalizeAddonUrl(addonUrl);

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

      // Validate response has metas array
      if (!catalogResponse.metas || !Array.isArray(catalogResponse.metas)) {
        logger.error(`Invalid catalog response structure. Keys: ${Object.keys(catalogResponse).join(', ')}`);
        throw new Error('Invalid catalog response: missing metas array');
      }

      logger.debug(`Catalog fetched: ${catalogResponse.metas.length} items`);
      return catalogResponse;

    } catch (error) {
      logger.error(`Failed to fetch catalog ${type}/${id}:`, error.message);
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
        throw new Error('Invalid meta response: missing meta object');
      }

      return metaResponse;

    } catch (error) {
      logger.error(`Failed to fetch meta ${type}/${id}:`, error.message);
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
        throw new Error('Invalid Cinemeta response: missing meta object');
      }

      logger.debug(`Cinemeta returned meta for: ${metaResponse.meta.name}`);
      return metaResponse;

    } catch (error) {
      logger.error(`Failed to fetch meta from Cinemeta ${type}/${id}:`, error.message);
      throw new Error(`Unable to fetch meta from Cinemeta: ${error.message}`);
    }
  }
}

module.exports = new AddonProxyService();
