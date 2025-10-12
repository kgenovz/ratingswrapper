/**
 * Stremio API Service
 * Handles communication with Stremio's API for account management
 */

const https = require('https');
const logger = require('../utils/logger');

/**
 * Makes a request to the Stremio API
 * @param {string} endpoint - API endpoint (e.g., '/api/addonCollectionGet')
 * @param {string} authToken - User's authentication token
 * @param {string} method - HTTP method
 * @param {Object} data - Request data
 * @returns {Promise<Object>} API response
 */
async function stremioApiRequest(endpoint, authToken, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = `https://api.strem.io${endpoint}`;
    logger.debug(`Stremio API: ${method} ${url}`);

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Stremio-Ratings-Wrapper/1.0.0'
      }
    };

    const requestData = method === 'POST' ? {
      authKey: authToken,
      ...data
    } : null;

    const req = https.request(url, options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        logger.debug(`Stremio API Response (${res.statusCode})`);

        if (res.statusCode >= 400) {
          logger.error(`Stremio API Error ${res.statusCode}:`, responseData);
          reject(new Error(`Stremio API Error ${res.statusCode}: ${responseData}`));
          return;
        }

        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          logger.warn('Non-JSON response from Stremio API:', responseData);
          resolve(responseData);
        }
      });
    });

    req.on('error', (err) => {
      logger.error('Stremio API Request Error:', err);
      reject(err);
    });

    if (requestData) {
      const payload = JSON.stringify(requestData);
      req.write(payload);
    }

    req.end();
  });
}

/**
 * Validates a Stremio auth token format
 * @param {string} token - Auth token to validate
 * @returns {Object} Validation result
 */
function validateAuthToken(token) {
  if (!token) {
    return { valid: false, error: 'Token is empty' };
  }

  if (token.length < 30) {
    return { valid: false, error: 'Token too short - should be 40+ characters' };
  }

  if (!/^[a-zA-Z0-9+/=_-]+$/.test(token)) {
    return { valid: false, error: 'Invalid token characters' };
  }

  return { valid: true };
}

/**
 * Gets the user's current addon collection
 * @param {string} authToken - User's authentication token
 * @returns {Promise<Array>} Array of installed addons
 */
async function getAddonCollection(authToken) {
  try {
    logger.info('Fetching current addon collection from Stremio...');

    const response = await stremioApiRequest('/api/addonCollectionGet', authToken, 'POST', {
      type: 'AddonCollectionGet',
      update: true
    });

    logger.debug('API response:', JSON.stringify(response).substring(0, 500));

    if (response.error) {
      throw new Error(`Stremio API Error: ${response.error.message || response.error || 'Unknown error'}`);
    }

    if (!response.result) {
      logger.error('No result in response:', response);
      throw new Error('Invalid response from Stremio API - no result object');
    }

    const addons = response.result.addons || [];
    logger.info(`Retrieved ${addons.length} addons from Stremio account`);

    return addons;
  } catch (error) {
    logger.error('Failed to get addon collection:', error.message);
    throw error;
  }
}

/**
 * Sets the user's addon collection
 * @param {string} authToken - User's authentication token
 * @param {Array} addons - Array of addons to set
 * @returns {Promise<Object>} API response
 */
async function setAddonCollection(authToken, addons) {
  try {
    logger.info(`Setting addon collection (${addons.length} addons)...`);

    const response = await stremioApiRequest('/api/addonCollectionSet', authToken, 'POST', {
      type: 'AddonCollectionSet',
      addons: addons
    });

    if (response.error) {
      throw new Error(`Failed to set addon collection: ${response.error.message || 'Unknown error'}`);
    }

    if (!response.result) {
      throw new Error('Invalid response from Stremio API - no result object');
    }

    if (!response.result.success) {
      throw new Error(`Sync failed: ${response.result.error || 'Unknown error'}`);
    }

    logger.info('Addon collection updated successfully');
    return response;
  } catch (error) {
    logger.error('Failed to set addon collection:', error.message);
    throw error;
  }
}

/**
 * Replaces an addon in the collection
 * @param {string} authToken - User's authentication token
 * @param {Object} options - Replacement options
 * @param {string} options.removePattern - Pattern to identify addon to remove (manifest ID or transport URL)
 * @param {string} options.newAddonUrl - URL of the new addon to install
 * @param {string} options.newAddonName - Name of the new addon
 * @param {string} options.newAddonId - ID of the new addon
 * @returns {Promise<Object>} Result of the operation
 */
async function replaceAddon(authToken, options) {
  try {
    const { removePattern, newAddonUrl, newAddonName, newAddonId } = options;

    // Get current addons
    let addons = await getAddonCollection(authToken);
    const originalCount = addons.length;
    logger.info(`Current addon count: ${originalCount}`);

    // Log first few addons for debugging
    if (addons.length > 0) {
      logger.debug('Sample addon:', JSON.stringify({
        id: addons[0].manifest?.id,
        url: addons[0].transportUrl,
        name: addons[0].manifest?.name
      }));
    }

    // Remove the old addon(s)
    logger.info(`Removing addon matching pattern: ${removePattern}`);
    addons = addons.filter(addon => {
      const manifestId = addon.manifest?.id || '';
      const transportUrl = addon.transportUrl || '';

      // Check if this addon matches the pattern
      if (removePattern === 'cinemeta') {
        // Special case for Cinemeta - match multiple possible patterns
        const shouldKeep = !manifestId.includes('cinemeta') &&
                          !transportUrl.includes('v3-cinemeta.strem.io') &&
                          !transportUrl.includes('cinemeta');

        if (!shouldKeep) {
          logger.info(`Removing: ${manifestId} / ${transportUrl}`);
        }

        return shouldKeep;
      } else {
        // General case - match by ID or URL
        const shouldKeep = manifestId !== removePattern && transportUrl !== removePattern;

        if (!shouldKeep) {
          logger.info(`Removing: ${manifestId} / ${transportUrl}`);
        }

        return shouldKeep;
      }
    });

    const removedCount = originalCount - addons.length;
    logger.info(`Removed ${removedCount} addon(s), ${addons.length} remaining`);

    // Fetch the full manifest from the wrapped addon URL
    logger.info(`Fetching manifest from: ${newAddonUrl}`);
    const https = require('https');
    const http = require('http');

    const manifestData = await new Promise((resolve, reject) => {
      const protocol = newAddonUrl.startsWith('https') ? https : http;
      protocol.get(newAddonUrl, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse manifest: ${e.message}`));
          }
        });
      }).on('error', reject);
    });

    logger.info(`Fetched manifest: ${manifestData.id} - ${manifestData.name}`);

    // Add the new addon at the FIRST position (index 0)
    // This is important for Cinemeta replacement - it needs to be first
    logger.info(`Adding new addon at first position: ${manifestData.name}`);
    addons.unshift({
      transportUrl: newAddonUrl,
      transportName: 'http',
      manifest: manifestData
    });

    // Set the new collection
    await setAddonCollection(authToken, addons);

    return {
      success: true,
      message: `Successfully replaced addon! Removed ${removedCount} old addon(s) and installed ${newAddonName}`,
      removedCount,
      totalAddons: addons.length
    };

  } catch (error) {
    logger.error('Failed to replace addon:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Replaces multiple addons in one operation, preserving positions.
 * - Cinemeta (if provided) is forced to index 0.
 * - For each provided item, if a matching addon exists, it gets replaced in-place.
 * - If a provided addon does not exist, it is appended to the end.
 * @param {string} authToken
 * @param {Array<{removePattern:string, wrappedAddonUrl:string, name?:string}>} items
 * @returns {Promise<Object>} result summary
 */
async function replaceAddonsBatch(authToken, items) {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('No items provided for replacement');
    }

    // Get current addons
    const originalAddons = await getAddonCollection(authToken);

    // Helper: match function
    function isMatch(addon, pattern) {
      const manifestId = addon.manifest?.id || '';
      const url = addon.transportUrl || '';
      if (pattern === 'cinemeta') {
        return manifestId.includes('cinemeta') || url.includes('cinemeta');
      }
      return manifestId === pattern || url === pattern;
    }

    // Fetch manifests for all wrapped addon URLs
    const https = require('https');
    const http = require('http');
    async function fetchManifest(url) {
      return new Promise((resolve, reject) => {
        const p = url.startsWith('https') ? https : http;
        p.get(url, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Failed to parse manifest from ${url}: ${e.message}`));
            }
          });
        }).on('error', reject);
      });
    }

    const manifests = {};
    for (const it of items) {
      manifests[it.wrappedAddonUrl] = await fetchManifest(it.wrappedAddonUrl);
    }

    // Identify if we have a Cinemeta item
    const cineIndex = items.findIndex(i => i.removePattern === 'cinemeta');
    const cinemetaItem = cineIndex >= 0 ? items[cineIndex] : null;

    // Build new collection
    const newAddons = [];
    const used = new Set(); // URLs used/injected

    // 1) Force Cinemeta first if provided
    if (cinemetaItem) {
      newAddons.push({
        transportUrl: cinemetaItem.wrappedAddonUrl,
        transportName: 'http',
        manifest: manifests[cinemetaItem.wrappedAddonUrl]
      });
      used.add(cinemetaItem.wrappedAddonUrl);
    }

    // 2) Replace in-place across original list, skipping any existing Cinemeta
    for (const addon of originalAddons) {
      const isCine = isMatch(addon, 'cinemeta');
      if (isCine) continue; // drop existing Cinemeta entirely

      const matchItem = items.find(i => i.removePattern !== 'cinemeta' && isMatch(addon, i.removePattern));
      if (matchItem) {
        const url = matchItem.wrappedAddonUrl;
        if (!used.has(url)) {
          newAddons.push({ transportUrl: url, transportName: 'http', manifest: manifests[url] });
          used.add(url);
        } else {
          // Already injected (avoid duplicates); fall back to keeping original
          newAddons.push(addon);
        }
      } else {
        newAddons.push(addon);
      }
    }

    // 3) Append any remaining wrapped addons not present originally
    for (const it of items) {
      const url = it.wrappedAddonUrl;
      if (!used.has(url)) {
        newAddons.push({ transportUrl: url, transportName: 'http', manifest: manifests[url] });
        used.add(url);
      }
    }

    // Sync back
    await setAddonCollection(authToken, newAddons);

    return {
      success: true,
      message: `Batch replace complete. Installed ${items.length} wrapped addon(s). Cinemeta ${cinemetaItem ? 'enforced first' : 'not provided'}.`,
      totalAddons: newAddons.length
    };
  } catch (error) {
    logger.error('Failed batch replace:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  stremioApiRequest,
  validateAuthToken,
  getAddonCollection,
  setAddonCollection,
  replaceAddon,
  replaceAddonsBatch
};
