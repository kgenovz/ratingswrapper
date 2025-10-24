/**
 * Utility to parse cache keys into readable components
 * Used by hot keys tracking to display key information
 */

/**
 * Parse a cache key into its components
 *
 * Cache key formats:
 * - Catalog: v{VERSION}:catalog:{configHash}:{type}:{catalogId}:{page}:{search}:{genre}:{userId}
 * - Meta: v{VERSION}:meta:{configHash}:{type}:{id}
 * - Manifest: v{VERSION}:manifest:{configHash}
 *
 * @param {string} key - Cache key to parse
 * @returns {Object} Parsed key components
 */
function parseCacheKey(key) {
  const parts = key.split(':');

  // Extract version
  const version = parts[0] || '';

  // Extract route type (catalog, meta, manifest)
  const route = parts[1] || 'unknown';

  // Extract config hash (first 6 chars)
  const configHash = parts[2] ? parts[2].substring(0, 6) : '';

  // Parse based on route type
  if (route === 'catalog') {
    return {
      version,
      route,
      configHash,
      type: parts[3] || '',
      catalogId: parts[4] || '',
      page: parts[5] || '',
      search: parts[6] || '',
      searchLen: parts[6] ? parts[6].length : 0,
      genre: parts[7] || '',
      userId: parts[8] || '_', // '_' means anonymous
      display: formatCatalogKey(parts)
    };
  } else if (route === 'meta') {
    return {
      version,
      route,
      configHash,
      type: parts[3] || '',
      id: parts[4] || '',
      userId: parts[5] || '_',
      display: formatMetaKey(parts)
    };
  } else if (route === 'manifest') {
    return {
      version,
      route,
      configHash,
      userId: parts[3] || '_',
      display: formatManifestKey(parts)
    };
  }

  // Unknown format
  return {
    version,
    route,
    configHash,
    display: key
  };
}

/**
 * Format catalog key for display
 * @param {Array} parts - Key parts
 * @returns {string} Formatted display string
 */
function formatCatalogKey(parts) {
  const type = parts[3] || '';
  const catalogId = parts[4] || '';
  const page = parts[5] || '';
  const search = parts[6] || '';
  const genre = parts[7] || '';
  const userId = parts[8] || '_';

  let display = `catalog/${type}/${catalogId}`;

  const extras = [];
  if (page) extras.push(`page=${page}`);
  if (search) extras.push(`search=${search.substring(0, 20)}${search.length > 20 ? '...' : ''}`);
  if (genre) extras.push(`genre=${genre}`);
  if (userId && userId !== '_') extras.push(`user=${userId.substring(0, 6)}`);

  if (extras.length > 0) {
    display += ` [${extras.join(', ')}]`;
  }

  return display;
}

/**
 * Format meta key for display
 * @param {Array} parts - Key parts
 * @returns {string} Formatted display string
 */
function formatMetaKey(parts) {
  const type = parts[3] || '';
  const id = parts[4] || '';
  const userId = parts[5] || '_';

  let display = `meta/${type}/${id}`;

  if (userId && userId !== '_') {
    display += ` [user=${userId.substring(0, 6)}]`;
  }

  return display;
}

/**
 * Format manifest key for display
 * @param {Array} parts - Key parts
 * @returns {string} Formatted display string
 */
function formatManifestKey(parts) {
  const userId = parts[3] || '_';

  let display = 'manifest';

  if (userId && userId !== '_') {
    display += ` [user=${userId.substring(0, 6)}]`;
  }

  return display;
}

module.exports = {
  parseCacheKey
};
