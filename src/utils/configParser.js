/**
 * Configuration parser utility
 * Parses and validates URL-encoded configuration from request paths
 */

const logger = require('./logger');
const appConfig = require('../config');

/**
 * Encodes configuration object to URL-safe base64 string
 * @param {Object} config - Configuration object
 * @returns {string} Encoded configuration string
 */
function encodeConfig(config) {
  const jsonString = JSON.stringify(config);
  return Buffer.from(jsonString).toString('base64url');
}

/**
 * Decodes configuration from URL-safe base64 string
 * @param {string} encodedConfig - Encoded configuration string
 * @returns {Object|null} Decoded configuration object or null if invalid
 */
function decodeConfig(encodedConfig) {
  try {
    const jsonString = Buffer.from(encodedConfig, 'base64url').toString('utf-8');
    const config = JSON.parse(jsonString);

    logger.debug('Decoded config:', config);
    return config;
  } catch (error) {
    logger.error('Failed to decode config:', error.message);
    return null;
  }
}

/**
 * Sanitizes addon URL by converting stremio:// protocol to https://
 * @param {string} url - Addon URL
 * @returns {string} Sanitized URL
 */
function sanitizeAddonUrl(url) {
  if (!url || typeof url !== 'string') return url;
  // Case-insensitive replacement of stremio:// with https://
  if (url.toLowerCase().startsWith('stremio://')) {
    return 'https://' + url.substring(10);
  }
  return url;
}

/**
 * Validates and merges user config with defaults
 * @param {Object} userConfig - User-provided configuration
 * @returns {Object} Validated configuration with defaults
 */
function validateConfig(userConfig) {
  // Supported order keys and defaults for extended metadata
  const DEFAULT_METADATA_ORDER = ['imdbRating','votes','mpaa','tmdb','releaseDate','streamingServices','rottenTomatoes','metacritic'];
  const ALLOWED_ORDER_KEYS = new Set(DEFAULT_METADATA_ORDER);
  function sanitizeOrder(order) {
    if (!Array.isArray(order)) return DEFAULT_METADATA_ORDER;
    const seen = new Set();
    const out = [];
    for (const k of order) {
      if (ALLOWED_ORDER_KEYS.has(k) && !seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
    // Append missing keys to ensure full coverage and stable behavior
    for (const k of DEFAULT_METADATA_ORDER) {
      if (!seen.has(k)) out.push(k);
    }
    return out;
  }
  // Backwards compatibility: migrate old single ratingFormat to separate formats
  let titleFormat = userConfig.titleFormat;
  let descriptionFormat = userConfig.descriptionFormat;

  // If old config with single ratingFormat and no separate formats, use it for both
  if (userConfig.ratingFormat && !titleFormat && !descriptionFormat) {
    titleFormat = userConfig.ratingFormat;
    descriptionFormat = userConfig.ratingFormat;
  }

  // Sanitize the wrapped addon URL - convert stremio:// to https://
  const sanitizedUrl = sanitizeAddonUrl(userConfig.wrappedAddonUrl);

  const config = {
    // Required: wrapped addon URL (sanitized)
    wrappedAddonUrl: sanitizedUrl || null,

    // Optional: rating format settings (legacy single format - kept for backwards compatibility)
    ratingFormat: {
      position: userConfig.ratingFormat?.position || appConfig.defaults.ratingFormat.position,
      template: userConfig.ratingFormat?.template || appConfig.defaults.ratingFormat.template,
      separator: userConfig.ratingFormat?.separator || appConfig.defaults.ratingFormat.separator
    },

    // New: separate formats for title and description
    titleFormat: {
      position: titleFormat?.position || userConfig.ratingFormat?.position || appConfig.defaults.ratingFormat.position,
      template: titleFormat?.template || userConfig.ratingFormat?.template || appConfig.defaults.ratingFormat.template,
      separator: titleFormat?.separator || userConfig.ratingFormat?.separator || appConfig.defaults.ratingFormat.separator,
      // Granular control: enable ratings for catalog items in title
      enableCatalogItems: titleFormat?.enableCatalogItems !== undefined
        ? titleFormat.enableCatalogItems
        : (userConfig.enableTitleRatings !== false), // Fallback to global flag
      // Granular control: enable ratings for episodes in title
      enableEpisodes: titleFormat?.enableEpisodes !== undefined
        ? titleFormat.enableEpisodes
        : (userConfig.enableEpisodeRatings !== false) // Fallback to global flag
    },

    descriptionFormat: {
      position: descriptionFormat?.position || userConfig.ratingFormat?.position || appConfig.defaults.ratingFormat.position,
      template: descriptionFormat?.template || userConfig.ratingFormat?.template || appConfig.defaults.ratingFormat.template,
      separator: descriptionFormat?.separator || userConfig.ratingFormat?.separator || appConfig.defaults.ratingFormat.separator,
      // Extended metadata options (only for description)
      includeVotes: descriptionFormat?.includeVotes || false,
      includeMpaa: descriptionFormat?.includeMpaa || false,
      includeYear: descriptionFormat?.includeYear || false,
      includeRuntime: descriptionFormat?.includeRuntime || false,
      // TMDB metadata options
      includeTmdbRating: descriptionFormat?.includeTmdbRating || false,
      includeReleaseDate: descriptionFormat?.includeReleaseDate || false,
      // Vote count format: 'short' (1.2M), 'full' (1,200,000), 'both' (1,200,000 / 1.2M)
      voteCountFormat: descriptionFormat?.voteCountFormat || 'short',
      // TMDB rating format: 'decimal' (8.5), 'outof10' (8.5/10)
      tmdbRatingFormat: descriptionFormat?.tmdbRatingFormat || 'decimal',
      // Release date format: 'year' (2023), 'short' (Jan 15, 2023), 'full' (January 15, 2023)
      releaseDateFormat: descriptionFormat?.releaseDateFormat || 'year',
      // OMDB metadata options
      includeRottenTomatoes: descriptionFormat?.includeRottenTomatoes || false,
      includeMetacritic: descriptionFormat?.includeMetacritic || false,
      // Metacritic format: 'score' (68), 'outof100' (68/100)
      metacriticFormat: descriptionFormat?.metacriticFormat || 'score',
      // Streaming services metadata options
      includeStreamingServices: descriptionFormat?.includeStreamingServices || false,
      streamingRegion: descriptionFormat?.streamingRegion || 'US',
      // Order of extended metadata parts (after rating)
      metadataOrder: sanitizeOrder(descriptionFormat?.metadataOrder),
      // Separator between metadata parts (rating, votes, MPAA, TMDB rating, release date, streaming)
      metadataSeparator: descriptionFormat?.metadataSeparator || ' • ',
      // Granular control: enable ratings for catalog items in description
      enableCatalogItems: descriptionFormat?.enableCatalogItems !== undefined
        ? descriptionFormat.enableCatalogItems
        : (userConfig.enableTitleRatings !== false), // Fallback to global flag
      // Granular control: enable ratings for episodes in description
      enableEpisodes: descriptionFormat?.enableEpisodes !== undefined
        ? descriptionFormat.enableEpisodes
        : (userConfig.enableEpisodeRatings !== false) // Fallback to global flag
    },

    // Optional: custom addon name
    addonName: userConfig.addonName || appConfig.defaults.addonName,

    // Optional: enable/disable rating injection (global)
    enableRatings: userConfig.enableRatings !== false, // default true

    // Optional: enable/disable title ratings (backward compatible)
    enableTitleRatings: userConfig.enableTitleRatings !== undefined
      ? userConfig.enableTitleRatings
      : (userConfig.enableRatings !== false), // fallback to enableRatings for old configs

    // Optional: enable/disable episode ratings (backward compatible)
    enableEpisodeRatings: userConfig.enableEpisodeRatings !== undefined
      ? userConfig.enableEpisodeRatings
      : (userConfig.enableRatings !== false), // fallback to enableRatings for old configs

    // Optional: rating injection location - now supports "both"
    ratingLocation: userConfig.ratingLocation || appConfig.defaults.ratingLocation || 'title',

    // Optional: metadata provider for episodes
    metadataProvider: userConfig.metadataProvider || appConfig.defaults.metadataProvider
  };

  // Validate required fields
  if (!config.wrappedAddonUrl) {
    throw new Error('wrappedAddonUrl is required in configuration');
  }

  // Validate URL format
  try {
    new URL(config.wrappedAddonUrl);
  } catch (error) {
    throw new Error('wrappedAddonUrl must be a valid URL');
  }

  // Validate position for legacy format
  if (!['prefix', 'suffix'].includes(config.ratingFormat.position)) {
    throw new Error('ratingFormat.position must be "prefix" or "suffix"');
  }

  // Validate positions for new formats
  if (!['prefix', 'suffix'].includes(config.titleFormat.position)) {
    throw new Error('titleFormat.position must be "prefix" or "suffix"');
  }
  if (!['prefix', 'suffix'].includes(config.descriptionFormat.position)) {
    throw new Error('descriptionFormat.position must be "prefix" or "suffix"');
  }

  // Validate location - now supports "both"
  if (!['title', 'description', 'both'].includes(config.ratingLocation)) {
    throw new Error('ratingLocation must be "title", "description", or "both"');
  }

  // Validate TMDB rating format
  if (!['decimal', 'outof10'].includes(config.descriptionFormat.tmdbRatingFormat)) {
    throw new Error('descriptionFormat.tmdbRatingFormat must be "decimal" or "outof10"');
  }

  // Validate release date format
  if (!['year', 'short', 'full'].includes(config.descriptionFormat.releaseDateFormat)) {
    throw new Error('descriptionFormat.releaseDateFormat must be "year", "short", or "full"');
  }

  // Validate Metacritic format
  if (!['score', 'outof100'].includes(config.descriptionFormat.metacriticFormat)) {
    throw new Error('descriptionFormat.metacriticFormat must be "score" or "outof100"');
  }

  // Validate streaming region (basic 2-letter ISO code check)
  if (config.descriptionFormat.streamingRegion &&
      !/^[A-Z]{2}$/.test(config.descriptionFormat.streamingRegion)) {
    throw new Error('descriptionFormat.streamingRegion must be a 2-letter ISO country code (e.g., "US", "GB", "CA")');
  }

  // Coerce/validate metadata order
  config.descriptionFormat.metadataOrder = sanitizeOrder(config.descriptionFormat.metadataOrder);

  return config;
}

/**
 * Parses configuration from request path parameter
 * @param {string} encodedConfig - Encoded configuration from URL
 * @returns {Object} Validated configuration object
 * @throws {Error} If configuration is invalid
 */
function parseConfigFromPath(encodedConfig) {
  if (!encodedConfig) {
    throw new Error('Configuration parameter is required');
  }

  const decoded = decodeConfig(encodedConfig);
  if (!decoded) {
    throw new Error('Invalid configuration format');
  }

  return validateConfig(decoded);
}

module.exports = {
  encodeConfig,
  decodeConfig,
  validateConfig,
  parseConfigFromPath
};
