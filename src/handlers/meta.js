/**
 * Meta Handler
 * Handles meta requests - fetches from wrapped addon and enhances episodes with ratings
 * Falls back to Cinemeta if wrapped addon doesn't support meta
 */

const logger = require('../utils/logger');
const addonProxy = require('../services/addonProxy');
const metadataEnhancer = require('../services/metadataEnhancer');
const appConfig = require('../config');

/**
 * Creates meta handler function
 * @param {Object} config - User configuration from URL
 * @returns {Function} Meta handler function
 */
function createMetaHandler(config) {
  return async (args) => {
    try {
      const { type, id } = args;

      logger.info(`Handling meta request: ${type}/${id}`);

      // Try to fetch meta from wrapped addon first
      try {
        const metaResponse = await addonProxy.fetchMeta(
          config.wrappedAddonUrl,
          type,
          id
        );

        // Extract meta object
        let meta = metaResponse.meta;

        if (meta) {
          // Enhance the meta object (title and episodes)
          const enhancedMeta = await metadataEnhancer.enhanceFullMeta(meta, config);

          logger.info(`Meta response enhanced from wrapped addon: ${enhancedMeta.name}`);

          return { meta: enhancedMeta };
        }
      } catch (error) {
        logger.warn(`Wrapped addon doesn't support meta endpoint: ${error.message}`);
      }

      // Fallback to metadata provider ONLY if wrapping Cinemeta AND id is IMDb format
      const metadataProvider = config.metadataProvider || appConfig.defaults.metadataProvider;
      const isCinemeta = config.wrappedAddonUrl && config.wrappedAddonUrl.includes('v3-cinemeta.strem.io');
      const isImdbId = id.startsWith('tt');

      if (metadataProvider === 'cinemeta' && isCinemeta && isImdbId) {
        logger.info('Falling back to Cinemeta for episode metadata');

        try {
          const cinemataResponse = await addonProxy.fetchMetaFromCinemeta(type, id);
          let meta = cinemataResponse.meta;

          if (meta) {
            // Enhance the meta object with ratings
            const enhancedMeta = await metadataEnhancer.enhanceFullMeta(meta, config);

            logger.info(`Meta response enhanced from Cinemeta: ${enhancedMeta.name}`);

            // Debug: verify we have enhanced videos
            if (enhancedMeta.videos && enhancedMeta.videos.length > 0) {
              logger.debug(`Returning ${enhancedMeta.videos.length} episodes to Stremio`);
            }

            return { meta: enhancedMeta };
          }
        } catch (cinemataError) {
          logger.error(`Cinemeta fallback failed: ${cinemataError.message}`);
        }
      }

      // If wrapped addon doesn't provide meta, return null to let Stremio use other addons
      logger.info('No metadata available from wrapped addon, returning null');
      return { meta: null };

    } catch (error) {
      logger.error('Error in meta handler:', error.message);

      // Return null meta on error
      return { meta: null };
    }
  };
}

module.exports = { createMetaHandler };
