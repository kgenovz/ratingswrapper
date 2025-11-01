/**
 * Manifest Handler
 * Handles the manifest endpoint - fetches wrapped addon manifest and modifies it
 */

const logger = require('../utils/logger');
const addonProxy = require('../services/addonProxy');
const appConfig = require('../config');

/**
 * Creates manifest handler function
 * @param {Object} config - User configuration from URL
 * @returns {Function} Manifest handler function
 */
function createManifestHandler(config) {
  return async () => {
    try {
      logger.info('Handling manifest request');

      // Fetch the wrapped addon's manifest
      const wrappedManifest = await addonProxy.fetchManifest(config.wrappedAddonUrl);

      logger.debug('Wrapped addon resources:', wrappedManifest.resources);

      // Determine which resources we can support
      const supportedResources = [];
      if (wrappedManifest.resources.includes('catalog')) {
        supportedResources.push('catalog');
      }
      // Only add meta if the wrapped addon actually has it
      // (Adding meta when wrapped addon doesn't have it causes conflicts with Cinemeta)
      if (wrappedManifest.resources.includes('meta')) {
        supportedResources.push('meta');
      }

      logger.info(`Wrapper will support resources: ${supportedResources.join(', ')}`);

      // Create our wrapper manifest based on the wrapped addon
      const wrapperManifest = {
        // Required fields
        id: `${wrappedManifest.id}.ratings-wrapper`,
        name: config.addonName || `${wrappedManifest.name} (with Ratings)`,
        description: wrappedManifest.description
          ? `${wrappedManifest.description}\n\nEnhanced metadata by Ratings Wrapper.`
          : 'Catalog addon with enhanced metadata.',
        version: appConfig.defaults.version,
        resources: supportedResources,
        types: wrappedManifest.types || ['movie', 'series'],
        catalogs: wrappedManifest.catalogs || []
      };

      // Add optional fields only if they exist
      if (wrappedManifest.background) {
        wrapperManifest.background = wrappedManifest.background;
      }
      if (wrappedManifest.logo) {
        wrapperManifest.logo = wrappedManifest.logo;
      }
      if (wrappedManifest.contactEmail) {
        wrapperManifest.contactEmail = wrappedManifest.contactEmail;
      }

      // Add behavior hints
      wrapperManifest.behaviorHints = {
        ...wrappedManifest.behaviorHints,
        p2p: false,
        // This tells Stremio to prefer our addon over others for the same content
        configurable: true,
        configurationRequired: false
      };

      // Validate we have catalogs to wrap
      if (!wrapperManifest.catalogs || wrapperManifest.catalogs.length === 0) {
        throw new Error('Wrapped addon has no catalogs to proxy');
      }

      logger.info(`Manifest created: ${wrapperManifest.name}`);
      logger.debug(`Supporting ${wrapperManifest.catalogs.length} catalogs`);

      return { manifest: wrapperManifest };

    } catch (error) {
      logger.error('Error in manifest handler:', error.message);
      throw error;
    }
  };
}

module.exports = { createManifestHandler };
