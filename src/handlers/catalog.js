/**
 * Catalog Handler
 * Handles catalog requests - fetches from wrapped addon and enhances with ratings
 */

const logger = require('../utils/logger');
const addonProxy = require('../services/addonProxy');
const metadataEnhancer = require('../services/metadataEnhancer');

/**
 * Creates catalog handler function
 * @param {Object} config - User configuration from URL
 * @returns {Function} Catalog handler function
 */
function createCatalogHandler(config) {
  return async (args) => {
    try {
      const { type, id, extra = {} } = args;

      logger.info(`Handling catalog request: ${type}/${id}`, extra);

      // Fetch catalog from wrapped addon
      const catalogResponse = await addonProxy.fetchCatalog(
        config.wrappedAddonUrl,
        type,
        id,
        extra
      );

      // Extract metas
      let metas = catalogResponse.metas || [];

      if (metas.length === 0) {
        logger.info('Catalog is empty');
        return { metas: [] };
      }

      // Enhance metas with ratings
      const enhancedMetas = await metadataEnhancer.enhanceCatalogMetas(metas, config);

      logger.info(`Catalog response: ${enhancedMetas.length} items`);

      return { metas: enhancedMetas };

    } catch (error) {
      logger.error('Error in catalog handler:', error.message);

      // Return empty catalog on error to avoid breaking Stremio
      return { metas: [] };
    }
  };
}

module.exports = { createCatalogHandler };
