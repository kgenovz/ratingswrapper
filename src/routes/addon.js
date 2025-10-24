/**
 * Addon Routes
 * Handles Stremio addon endpoints: manifest, catalog, and meta
 */

const express = require('express');
const logger = require('../utils/logger');
const { parseConfigFromPath } = require('../utils/configParser');
const { createManifestHandler } = require('../handlers/manifest');
const { createCatalogHandler } = require('../handlers/catalog');
const { createMetaHandler } = require('../handlers/meta');
const { catalogCacheMiddleware, metaCacheMiddleware, manifestCacheMiddleware } = require('../middleware/cache');
const { createStandardRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Apply rate limiting to all addon routes
const rateLimiter = createStandardRateLimiter();
router.use(rateLimiter);

/**
 * Main addon endpoint - Manifest
 * Serves the manifest for the wrapped addon
 */
router.get('/:config/manifest.json', manifestCacheMiddleware, async (req, res) => {
  try {
    logger.info(`Manifest request received from ${req.ip}`);
    const userConfig = parseConfigFromPath(req.params.config);

    // Call the manifest handler directly
    const manifestHandler = createManifestHandler(userConfig);
    const result = await manifestHandler();

    logger.info('Manifest generated successfully:', JSON.stringify(result.manifest).substring(0, 200));
    res.setHeader('Content-Type', 'application/json');
    res.json(result.manifest);

  } catch (error) {
    logger.error('Error serving manifest:', error.message, error.stack);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Catalog endpoint - with extra parameters
 */
router.get('/:config/catalog/:type/:id/:extra.json', catalogCacheMiddleware, async (req, res) => {
  try {
    const userConfig = parseConfigFromPath(req.params.config);
    const { type, id } = req.params;

    // Parse extra parameters from path (format: key=value&key2=value2)
    const extra = {};
    if (req.params.extra) {
      req.params.extra.split('&').forEach(param => {
        const [key, value] = param.split('=');
        if (key && value) {
          extra[key] = decodeURIComponent(value);
        }
      });
    }

    logger.info(`Catalog request: ${type}/${id} with extra:`, JSON.stringify(extra));

    // Call the catalog handler directly
    const catalogHandler = createCatalogHandler(userConfig);
    const result = await catalogHandler({ type, id, extra });

    res.json(result);

  } catch (error) {
    logger.error('Error serving catalog:', error.message);
    res.status(500).json({ metas: [] });
  }
});

/**
 * Catalog endpoint - without extra parameters
 */
router.get('/:config/catalog/:type/:id.json', catalogCacheMiddleware, async (req, res) => {
  try {
    const userConfig = parseConfigFromPath(req.params.config);
    const { type, id } = req.params;

    // Parse extra parameters from query string (fallback)
    const extra = req.query;

    logger.info(`Catalog request: ${type}/${id}`);

    // Call the catalog handler directly
    const catalogHandler = createCatalogHandler(userConfig);
    const result = await catalogHandler({ type, id, extra });

    res.json(result);

  } catch (error) {
    logger.error('Error serving catalog:', error.message);
    res.status(500).json({ metas: [] });
  }
});

/**
 * Meta endpoint
 */
router.get('/:config/meta/:type/:id.json', metaCacheMiddleware, async (req, res) => {
  try {
    logger.info(`🔍 META REQUEST from ${req.ip} - ${req.params.type}/${req.params.id}`);
    logger.info(`User-Agent: ${req.headers['user-agent']}`);

    const userConfig = parseConfigFromPath(req.params.config);
    const { type, id } = req.params;

    // Call the meta handler directly
    const metaHandler = createMetaHandler(userConfig);
    const result = await metaHandler({ type, id });

    // Ensure proper Content-Type
    res.setHeader('Content-Type', 'application/json');
    res.json(result);

  } catch (error) {
    logger.error('❌ Error serving meta:', error.message, error.stack);
    res.status(500).json({ meta: null });
  }
});

module.exports = router;
