/**
 * Cache key generation utilities for Redis
 * Implements the cache key structure defined in redislayer.md Phase 0
 */

const crypto = require('crypto');
const config = require('../config');

/**
 * Recursively sorts object keys to ensure deterministic JSON stringification
 * This is critical for cache key generation - even identical configs with different
 * key ordering must produce the same hash
 * @param {*} obj - Object to sort (or primitive value)
 * @returns {*} - Sorted object or original value
 * @private
 */
function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    sorted[key] = sortObjectKeys(obj[key]);
  }

  return sorted;
}

/**
 * Generate a hash of the config object for cache key uniqueness
 * @param {Object} addonConfig - The addon configuration object
 * @returns {string} - SHA256 hash of the config (first 16 characters)
 */
function generateConfigHash(addonConfig) {
  if (!addonConfig) {
    return 'default';
  }

  // Recursively sort all keys to ensure identical configs always produce the same hash
  // This prevents cache collisions/misses due to key ordering differences
  const sortedConfig = sortObjectKeys(addonConfig);

  // Create a stable string representation
  const configString = JSON.stringify(sortedConfig);

  // Generate SHA256 hash and take first 16 characters (64 bits)
  // Increased from 12 to 16 to reduce collision probability
  // With 16 chars, collision probability is negligible until ~4 billion configs
  const hash = crypto
    .createHash('sha256')
    .update(configString)
    .digest('hex')
    .substring(0, 16);

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

/**
 * Generate cache key for raw catalog (format-agnostic)
 * This key is based only on the addon URL and catalog parameters,
 * NOT on format settings, so it can be shared across different format configs
 *
 * Format: v{CACHE_VERSION}:raw:catalog:{baseUrl}:{type}:{catalogId}:{page?}:{search?}:{genre?}
 *
 * @param {Object} params - Cache key parameters
 * @param {string} params.addonUrl - Base URL of the wrapped addon
 * @param {string} params.type - Content type (movie, series, etc.)
 * @param {string} params.catalogId - Catalog ID (top, popular, etc.)
 * @param {string} [params.page] - Page number for pagination
 * @param {string} [params.search] - Search query
 * @param {string} [params.genre] - Genre filter
 * @returns {string} - Cache key
 */
function generateRawCatalogKey(params) {
  const {
    addonUrl,
    type,
    catalogId,
    page = '',
    search = '',
    genre = ''
  } = params;

  const version = config.redis.cacheVersion;

  // Create hash of addon URL for more compact keys
  const urlHash = crypto
    .createHash('sha256')
    .update(addonUrl)
    .digest('hex')
    .substring(0, 12);

  // Build key parts, filtering out empty values
  const parts = [
    `v${version}`,
    'raw',
    'catalog',
    urlHash,
    type,
    catalogId,
    page,
    search,
    genre
  ];

  // Join parts, removing empty trailing parts
  return parts.filter(part => part !== '').join(':');
}

/**
 * Generate cache key for IMDb rating data
 * Format: v{CACHE_VERSION}:rating:imdb:{imdbId}
 *
 * @param {string} imdbId - IMDb ID (e.g., "tt1234567")
 * @returns {string} - Cache key
 */
function generateImdbRatingKey(imdbId) {
  const version = config.redis.cacheVersion;
  return `v${version}:rating:imdb:${imdbId}`;
}

/**
 * Generate cache key for MPAA rating data
 * Format: v{CACHE_VERSION}:rating:mpaa:{imdbId}
 *
 * @param {string} imdbId - IMDb ID (e.g., "tt1234567")
 * @returns {string} - Cache key
 */
function generateMpaaRatingKey(imdbId) {
  const version = config.redis.cacheVersion;
  return `v${version}:rating:mpaa:${imdbId}`;
}

/**
 * Generate cache key for TMDB data
 * Format: v{CACHE_VERSION}:data:tmdb:{imdbId}:{region}
 *
 * @param {string} imdbId - IMDb ID (e.g., "tt1234567")
 * @param {string} [region] - Region code for streaming services (default: 'US')
 * @returns {string} - Cache key
 */
function generateTmdbDataKey(imdbId, region = 'US') {
  const version = config.redis.cacheVersion;
  return `v${version}:data:tmdb:${imdbId}:${region}`;
}

/**
 * Generate cache key for OMDB data
 * Format: v{CACHE_VERSION}:data:omdb:{imdbId}
 *
 * @param {string} imdbId - IMDb ID (e.g., "tt1234567")
 * @returns {string} - Cache key
 */
function generateOmdbDataKey(imdbId) {
  const version = config.redis.cacheVersion;
  return `v${version}:data:omdb:${imdbId}`;
}

/**
 * Generate cache key for MAL (MyAnimeList) data
 * Format: v{CACHE_VERSION}:data:mal:{malId}
 *
 * @param {string|number} malId - MyAnimeList ID
 * @returns {string} - Cache key
 */
function generateMalDataKey(malId) {
  const version = config.redis.cacheVersion;
  return `v${version}:data:mal:${malId}`;
}

/**
 * Generate cache key for consolidated rating data
 * Format: v{CACHE_VERSION}:rating:consolidated:{imdbId}
 *
 * @param {string} imdbId - IMDb ID (e.g., "tt1234567")
 * @returns {string} - Cache key
 */
function generateConsolidatedRatingKey(imdbId) {
  const version = config.redis.cacheVersion;
  return `v${version}:rating:consolidated:${imdbId}`;
}

/**
 * Get TTL for raw data caches (individual ratings and metadata)
 * These are format-agnostic and can be cached longer
 * @returns {number} - TTL in seconds (24 hours)
 */
function getRawDataTTL() {
  // Raw data TTL: 24 hours (can be cached longer since format-agnostic)
  return config.redis.ttl.rawData || 86400;
}

module.exports = {
  generateConfigHash,
  generateCatalogKey,
  generateMetaKey,
  generateManifestKey,
  generateRawCatalogKey,
  generateImdbRatingKey,
  generateMpaaRatingKey,
  generateTmdbDataKey,
  generateOmdbDataKey,
  generateMalDataKey,
  generateConsolidatedRatingKey,
  isUserSpecificAddon,
  getCatalogTTL,
  getMetaTTL,
  getManifestTTL,
  getRawDataTTL
};
