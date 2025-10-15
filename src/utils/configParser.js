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
  const config = {
    // Required: wrapped addon URL
    wrappedAddonUrl: userConfig.wrappedAddonUrl || null,

    // Optional: rating format settings
    ratingFormat: {
      position: userConfig.ratingFormat?.position || appConfig.defaults.ratingFormat.position,
      template: userConfig.ratingFormat?.template || appConfig.defaults.ratingFormat.template,
      separator: userConfig.ratingFormat?.separator || appConfig.defaults.ratingFormat.separator
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

  // Validate position
  if (!['prefix', 'suffix'].includes(config.ratingFormat.position)) {
    throw new Error('ratingFormat.position must be "prefix" or "suffix"');
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
