/**
 * Anime Mapping Service
 * Maps Kitsu and MAL IDs to IMDb IDs using the anime-lists database
 */

const https = require('https');
const logger = require('../utils/logger');

class KitsuMappingService {
  constructor() {
    this.kitsuMappings = new Map(); // kitsuId -> imdbId
    this.malMappings = new Map();   // malId -> imdbId
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
    logger.info('Loading anime ID mappings (Kitsu & MAL → IMDb) from anime-lists...');

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

      // Build mappings: kitsu_id -> imdb_id AND mal_id -> imdb_id
      let kitsuCount = 0;
      let malCount = 0;
      for (const anime of animeList) {
        if (anime.imdb_id) {
          // Map Kitsu IDs
          if (anime.kitsu_id) {
            // Store both as string and number for flexible lookups
            this.kitsuMappings.set(String(anime.kitsu_id), anime.imdb_id);
            this.kitsuMappings.set(anime.kitsu_id, anime.imdb_id);
            kitsuCount++;
          }

          // Map MAL IDs
          if (anime.mal_id) {
            this.malMappings.set(String(anime.mal_id), anime.imdb_id);
            this.malMappings.set(anime.mal_id, anime.imdb_id);
            malCount++;
          }
        }
      }

      this.loaded = true;
      logger.info(`Loaded ${kitsuCount} Kitsu and ${malCount} MAL → IMDb mappings (from ${animeList.length} total anime)`);

    } catch (error) {
      logger.error('Failed to load anime mappings:', error.message);
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
      logger.warn('Anime mappings not loaded yet');
      return null;
    }

    // Try both string and number formats
    const imdbId = this.kitsuMappings.get(String(kitsuId)) || this.kitsuMappings.get(kitsuId);

    if (imdbId) {
      logger.debug(`Kitsu ID ${kitsuId} → IMDb ID ${imdbId}`);
    }

    return imdbId || null;
  }

  /**
   * Gets IMDb ID for a MAL ID
   * @param {string|number} malId - MAL ID (e.g., "40028" or 40028)
   * @returns {string|null} IMDb ID or null if not found
   */
  getImdbIdFromMal(malId) {
    if (!this.loaded) {
      logger.warn('Anime mappings not loaded yet');
      return null;
    }

    // Try both string and number formats
    const imdbId = this.malMappings.get(String(malId)) || this.malMappings.get(malId);

    if (imdbId) {
      logger.debug(`MAL ID ${malId} → IMDb ID ${imdbId}`);
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
   * Extracts MAL ID from various ID formats
   * @param {string} id - Content ID (e.g., "mal:40028", "mal-40028", "40028")
   * @returns {string|null} MAL ID or null if not MAL format
   */
  extractMalId(id) {
    if (!id) return null;

    // Format: "mal:40028" or "mal-40028"
    if (id.includes('mal')) {
      const match = id.match(/mal[:-](\d+)/);
      if (match) return match[1];
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

  /**
   * Check if an ID is a MAL ID
   * @param {string} id - Content ID
   * @returns {boolean}
   */
  isMalId(id) {
    return id && (id.includes('mal') || /^mal-\d+$/.test(id));
  }
}

module.exports = new KitsuMappingService();
