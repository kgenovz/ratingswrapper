/**
 * Kitsu Mapping Service
 * Maps Kitsu IDs to IMDb IDs using the anime-lists database
 */

const https = require('https');
const logger = require('../utils/logger');

class KitsuMappingService {
  constructor() {
    this.mappings = new Map(); // kitsuId -> imdbId
    this.loaded = false;
    this.loading = false;
  }

  /**
   * Loads the anime mapping database from GitHub
   * @returns {Promise<void>}
   */
  async loadMappings() {
    if (this.loaded || this.loading) {
      return;
    }

    this.loading = true;
    logger.info('Loading Kitsu → IMDb mappings from anime-lists...');

    try {
      const url = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json';

      const data = await new Promise((resolve, reject) => {
        https.get(url, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(body));
        }).on('error', reject);
      });

      const animeList = JSON.parse(data);

      // Build mapping: kitsu_id -> imdb_id
      let mappedCount = 0;
      for (const anime of animeList) {
        if (anime.kitsu_id && anime.imdb_id) {
          // Store both as string and number for flexible lookups
          this.mappings.set(String(anime.kitsu_id), anime.imdb_id);
          this.mappings.set(anime.kitsu_id, anime.imdb_id);
          mappedCount++;
        }
      }

      this.loaded = true;
      logger.info(`Loaded ${mappedCount} Kitsu → IMDb mappings (from ${animeList.length} total anime)`);

    } catch (error) {
      logger.error('Failed to load Kitsu mappings:', error.message);
      this.loading = false;
      throw error;
    }

    this.loading = false;
  }

  /**
   * Gets IMDb ID for a Kitsu ID
   * @param {string|number} kitsuId - Kitsu ID (e.g., "31" or 31)
   * @returns {string|null} IMDb ID or null if not found
   */
  getImdbId(kitsuId) {
    if (!this.loaded) {
      logger.warn('Kitsu mappings not loaded yet');
      return null;
    }

    // Try both string and number formats
    const imdbId = this.mappings.get(String(kitsuId)) || this.mappings.get(kitsuId);

    if (imdbId) {
      logger.debug(`Kitsu ID ${kitsuId} → IMDb ID ${imdbId}`);
    }

    return imdbId || null;
  }

  /**
   * Extracts Kitsu ID from various ID formats
   * @param {string} id - Content ID (e.g., "kitsu:31", "kitsu-31", "31")
   * @returns {string|null} Kitsu ID or null if not Kitsu format
   */
  extractKitsuId(id) {
    if (!id) return null;

    // Format: "kitsu:31" or "kitsu-31"
    if (id.includes('kitsu')) {
      const match = id.match(/kitsu[:-](\d+)/);
      if (match) return match[1];
    }

    // Format: just a number (when we know it's from Kitsu addon)
    if (/^\d+$/.test(id)) {
      return id;
    }

    return null;
  }

  /**
   * Check if an ID is a Kitsu ID
   * @param {string} id - Content ID
   * @returns {boolean}
   */
  isKitsuId(id) {
    return id && (id.includes('kitsu') || /^kitsu-\d+$/.test(id));
  }
}

module.exports = new KitsuMappingService();
