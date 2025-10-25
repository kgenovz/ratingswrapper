/**
 * Cache key generation utilities for Redis
 * Implements the cache key structure defined in redislayer.md Phase 0
 */

const crypto = require('crypto');
const config = require('../config');

/**
 * Generate a hash of the config object for cache key uniqueness
 * @param {Object} addonConfig - The addon configuration object
 * @returns {string} - SHA256 hash of the config (first 12 characters)
 */
function generateConfigHash(addonConfig) {
  if (!addonConfig) {
    return 'default';
  }

  // Create a stable string representation of the config
  // Sort keys to ensure consistent hashing
  const configString = JSON.stringify(addonConfig, Object.keys(addonConfig).sort());

  // Generate SHA256 hash and take first 12 characters for brevity
  const hash = crypto
    .createHash('sha256')
    .update(configString)
    .digest('hex')
    .substring(0, 12);

  return hash;
}

/**
 * Generate cache key for catalog endpoint
 * Format: v{CACHE_VERSION}:catalog:{configHash}:{type}:{catalogId}:{page?}:{search?}:{genre?}:{userId?}
 *
 * @param {Object} params - Cache key parameters
 * @param {Object} params.addonConfig - Addon configuration object
 * @param {string} params.type - Content type (movie, series, etc.)
 * @param {string} params.catalogId - Catalog ID (top, popular, etc.)
 * @param {string} [params.page] - Page number for pagination
 * @param {string} [params.search] - Search query
 * @param {string} [params.genre] - Genre filter
 * @param {string} [params.userId] - User ID for user-specific catalogs
 * @returns {string} - Cache key
 */
function generateCatalogKey(params) {
  const {
    addonConfig,
    type,
    catalogId,
    page = '',
    search = '',
    genre = '',
    userId = ''
  } = params;

  const configHash = generateConfigHash(addonConfig);
  const version = config.redis.cacheVersion;

  // Build key parts, filtering out empty values
  const parts = [
    `v${version}`,
    'catalog',
    configHash,
    type,
    catalogId,
    page,
    search,
    genre,
    userId
  ];

  // Join parts, removing empty trailing parts
  return parts.filter(part => part !== '').join(':');
}

/**
 * Generate cache key for meta endpoint
 * Format: v{CACHE_VERSION}:meta:{configHash}:{type}:{id}
 *
 * @param {Object} params - Cache key parameters
 * @param {Object} params.addonConfig - Addon configuration object
 * @param {string} params.type - Content type (movie, series, etc.)
 * @param {string} params.id - Content ID
 * @returns {string} - Cache key
 */
function generateMetaKey(params) {
  const { addonConfig, type, id } = params;

  const configHash = generateConfigHash(addonConfig);
  const version = config.redis.cacheVersion;

  return `v${version}:meta:${configHash}:${type}:${id}`;
}

/**
 * Generate cache key for manifest endpoint
 * Format: v{CACHE_VERSION}:manifest:{configHash}
 *
 * @param {Object} params - Cache key parameters
 * @param {Object} params.addonConfig - Addon configuration object
 * @returns {string} - Cache key
 */
function generateManifestKey(params) {
  const { addonConfig } = params;

  const configHash = generateConfigHash(addonConfig);
  const version = config.redis.cacheVersion;

  return `v${version}:manifest:${configHash}`;
}

/**
 * Determine if an addon is user-specific based on config or manifest
 * User-specific addons should include userId in cache key
 *
 * @param {Object} addonConfig - Addon configuration object
 * @param {Object} [manifest] - Addon manifest (optional)
 * @returns {boolean} - True if addon is user-specific
 */
function isUserSpecificAddon(addonConfig, manifest = null) {
  // Check if addon URL contains common patterns for user-specific addons
  const wrappedUrl = addonConfig?.wrappedAddonUrl || '';
  const userSpecificPatterns = [
    'mdblist',
    'trakt',
    'user',
    'personal',
    'collection'
  ];

  const hasUserPattern = userSpecificPatterns.some(pattern =>
    wrappedUrl.toLowerCase().includes(pattern)
  );

  // Check manifest behaviorHints if available
  const isConfigurable = manifest?.behaviorHints?.configurable === true;

  return hasUserPattern || isConfigurable;
}

/**
 * Determine TTL for catalog based on catalog type
 *
 * @param {string} catalogId - Catalog ID (top, popular, search, etc.)
 * @param {boolean} isUserSpecific - Whether addon is user-specific
 * @returns {number} - TTL in seconds
 */
function getCatalogTTL(catalogId, isUserSpecific = false) {
  const ttlConfig = config.redis.ttl.catalog;

  // User-specific catalogs always use shorter TTL
  if (isUserSpecific) {
    return ttlConfig.userSpecific;
  }

  // Determine TTL based on catalog type
  const catalogLower = catalogId.toLowerCase();

  if (catalogLower.includes('search')) {
    return ttlConfig.search;
  }

  if (catalogLower.includes('popular') ||
      catalogLower.includes('trending') ||
      catalogLower.includes('top')) {
    return ttlConfig.popular;
  }

  return ttlConfig.default;
}

/**
 * Get TTL for meta endpoint
 * @returns {number} - TTL in seconds
 */
function getMetaTTL() {
  return config.redis.ttl.meta;
}

/**
 * Get TTL for manifest endpoint
 * @returns {number} - TTL in seconds
 */
function getManifestTTL() {
  return config.redis.ttl.manifest;
}

module.exports = {
  generateConfigHash,
  generateCatalogKey,
  generateMetaKey,
  generateManifestKey,
  isUserSpecificAddon,
  getCatalogTTL,
  getMetaTTL,
  getManifestTTL
};
