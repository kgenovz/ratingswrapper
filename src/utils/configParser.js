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
 * Validates and merges user config with defaults
 * @param {Object} userConfig - User-provided configuration
 * @returns {Object} Validated configuration with defaults
 */
function validateConfig(userConfig) {
  // Backwards compatibility: migrate old single ratingFormat to separate formats
  let titleFormat = userConfig.titleFormat;
  let descriptionFormat = userConfig.descriptionFormat;

  // If old config with single ratingFormat and no separate formats, use it for both
  if (userConfig.ratingFormat && !titleFormat && !descriptionFormat) {
    titleFormat = userConfig.ratingFormat;
    descriptionFormat = userConfig.ratingFormat;
  }

  const config = {
    // Required: wrapped addon URL
    wrappedAddonUrl: userConfig.wrappedAddonUrl || null,

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
      // Vote count format: 'short' (1.2M), 'full' (1,200,000), 'both' (1,200,000 / 1.2M)
      voteCountFormat: descriptionFormat?.voteCountFormat || 'short',
      // Separator between metadata parts (rating, votes, MPAA)
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
