/**
 * Anime Mapping Service
 * Maps Kitsu and MAL IDs to IMDb IDs using the anime-lists database
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class KitsuMappingService {
  constructor() {
    this.kitsuMappings = new Map(); // kitsuId -> imdbId
    this.malMappings = new Map();   // malId -> imdbId
    this.kitsuToMal = new Map();    // kitsuId -> malId
    this.malToKitsu = new Map();    // malId -> kitsuId
    this.kitsuMeta = new Map();     // kitsuId -> { imdb_id, animePlanetId, type, thetvdb_id, themoviedb_id }
    this.splitCourMappings = new Map(); // 'kitsu:ID' or 'mal:ID' -> { episode_offset, imdb_id, imdb_season, part }
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

      // Build mappings: kitsu_id -> imdb_id AND mal_id -> imdb_id AND kitsu_id <-> mal_id
      let kitsuCount = 0;
      let malCount = 0;
      let crossMappingCount = 0;
      for (const anime of animeList) {
        if (anime.imdb_id) {
          // Map Kitsu IDs
          if (anime.kitsu_id) {
            // Store both as string and number for flexible lookups
            this.kitsuMappings.set(String(anime.kitsu_id), anime.imdb_id);
            this.kitsuMappings.set(anime.kitsu_id, anime.imdb_id);
            // Cache minimal metadata for season inference and debugging
            this.kitsuMeta.set(String(anime.kitsu_id), {
              imdb_id: anime.imdb_id,
              animePlanetId: anime["anime-planet_id"] || null,
              type: anime.type || null,
              thetvdb_id: anime.thetvdb_id || null,
              themoviedb_id: anime.themoviedb_id || null
            });
            kitsuCount++;
          }

          // Map MAL IDs
          if (anime.mal_id) {
            this.malMappings.set(String(anime.mal_id), anime.imdb_id);
            this.malMappings.set(anime.mal_id, anime.imdb_id);
            malCount++;
          }

          // Create cross-mapping between Kitsu and MAL
          if (anime.kitsu_id && anime.mal_id) {
            this.kitsuToMal.set(String(anime.kitsu_id), String(anime.mal_id));
            this.malToKitsu.set(String(anime.mal_id), String(anime.kitsu_id));
            crossMappingCount++;
          }
        }
      }

      this.loaded = true;
      logger.info(`Loaded ${kitsuCount} Kitsu and ${malCount} MAL → IMDb mappings (${crossMappingCount} cross-mapped) from ${animeList.length} total anime`);

      // Load split-cour mappings from local JSON file
      this.loadSplitCourMappings();

    } catch (error) {
      logger.error('Failed to load anime mappings:', error.message);
      this.loading = false;
      throw error;
    }

    this.loading = false;
  }

  /**
   * Loads split-cour episode offset mappings from local JSON file
   * @returns {void}
   */
  loadSplitCourMappings() {
    try {
      const mappingsPath = path.join(__dirname, '../data/split-cour-mappings.json');
      const data = fs.readFileSync(mappingsPath, 'utf8');
      const json = JSON.parse(data);

      if (json.mappings) {
        for (const [key, value] of Object.entries(json.mappings)) {
          this.splitCourMappings.set(key, value);
        }
        logger.info(`Loaded ${this.splitCourMappings.size} split-cour episode offset mappings`);
      }
    } catch (error) {
      logger.warn('Failed to load split-cour mappings (non-critical):', error.message);
      // Non-critical error, continue without split-cour support
    }
  }

  /**
   * Gets split-cour episode offset for a Kitsu or MAL ID
   * @param {string} id - Full ID in format 'kitsu:12345' or 'mal:12345'
   * @returns {Object|null} - { episode_offset, imdb_id, imdb_season, part } or null
   */
  getSplitCourOffset(id) {
    return this.splitCourMappings.get(id) || null;
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
   * Returns cached mapping metadata for a Kitsu ID
   * @param {string|number} kitsuId
   * @returns {Object|null}
   */
  getRecord(kitsuId) {
    if (!this.loaded) return null;
    return this.kitsuMeta.get(String(kitsuId)) || null;
  }

  /**
   * Attempts to infer the season number for a Kitsu ID using the anime-planet slug.
   * No network calls; purely heuristic.
   * @param {string|number} kitsuId
   * @param {string} [fallbackTitle]
   * @returns {number|null} season number if inferred; otherwise null
   */
  inferSeasonFromSlug(kitsuId, fallbackTitle = '') {
    const rec = this.getRecord(kitsuId);
    const slug = rec && rec.animePlanetId ? String(rec.animePlanetId).toLowerCase() : '';
    let season = null;

    // Heuristics in slug (no network calls)
    // Examples we want to catch:
    //  - "arcane-season-2", "title-s2", "title-season-1"
    //  - "my-hero-academia-2" (trailing number)
    //  - "attack-on-titan-2nd-season" (ordinal)
    //  - "...-final-season" (heuristic special case)

    // Special-case: "final-season" heuristic. In many cases (e.g., AoT), this maps to season 4.
    if (slug.includes('final-season')) {
      season = 4;
      logger.info(`Kitsu season inference (slug heuristic): kitsuId=${kitsuId}, slug="${slug}", matched=final-season, season=4`);
    }

    const patterns = [
      /(?:^|[-_ ])season[-_ ]*(\d+)(?:st|nd|rd|th)?/i,            // season-2, season 2, season-2nd
      /(\d+)(?:st|nd|rd|th)[-_ ]*season/i,                         // 2nd-season, 2nd season (anywhere in slug)
      /(?:^|[-_ ])s(\d+)(?:$|[-_ ])/i,                             // s2, s3 (delimited)
      /part[-_ ]?(\d+)/i,                                         // part-2, part 2
      /[-_ ](\d+)$/i                                              // word-2, word 2 (any word followed by number at end)
    ];
    for (const re of patterns) {
      const m = slug.match(re);
      if (m && m[1]) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > 0) {
          season = n;
          logger.info(`Kitsu season inference: kitsuId=${kitsuId}, slug="${slug}", pattern=${re}, season=${n}`);
          break;
        }
      }
    }

    // Weak fallback: parse from title if provided (e.g., "Season 2", "2nd Season", "Final Season")
    if (!season && fallbackTitle) {
      const t = String(fallbackTitle).toLowerCase();
      if (t.includes('final season')) {
        season = 4;
        logger.info(`Kitsu season inference (title heuristic): kitsuId=${kitsuId}, title="${fallbackTitle}", matched=final season, season=4`);
      }

      const mt = t.match(/season\s*(\d+)/i)
        || t.match(/(\d+)(?:st|nd|rd|th)\s*season/i)
        || t.match(/s(\d+)/i)
        || t.match(/part\s*(\d+)/i);
      if (mt && mt[1]) {
        const n = parseInt(mt[1], 10);
        if (Number.isFinite(n) && n > 0) {
          season = n;
          logger.info(`Kitsu season inference (title fallback): kitsuId=${kitsuId}, title="${fallbackTitle}", season=${n}`);
        }
      }
    }

    return season || null;
  }

  /**
   * Returns a season number for Kitsu content, defaulting to 1 when unknown.
   * @param {string|number} kitsuId
   * @param {string} [fallbackTitle]
   * @returns {number}
   */
  getSeasonForKitsu(kitsuId, fallbackTitle = '') {
    const inferred = this.inferSeasonFromSlug(kitsuId, fallbackTitle);
    if (inferred) {
      return inferred;
    }
    logger.info(`Kitsu season inference: no season detected for kitsuId=${kitsuId}, defaulting to 1`);
    return 1;
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
   * Extracts MAL ID from various ID formats, including Kitsu IDs
   * @param {string} id - Content ID (e.g., "mal:40028", "kitsu:12345")
   * @returns {string|null} MAL ID or null if not found
   */
  extractMalId(id) {
    if (!id) return null;

    // Direct MAL ID format: "mal:40028" or "mal-40028"
    if (id.includes('mal')) {
      const match = id.match(/mal[:-](\d+)/);
      if (match) return match[1];
    }

    // Kitsu ID format: "kitsu:12345" or "kitsu-12345" - convert to MAL
    if (id.includes('kitsu')) {
      const match = id.match(/kitsu[:-](\d+)/);
      if (match) {
        const kitsuId = match[1];
        const malId = this.kitsuToMal.get(kitsuId);
        if (malId) {
          logger.debug(`Mapped Kitsu ID ${kitsuId} to MAL ID ${malId}`);
          return malId;
        }
      }
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
