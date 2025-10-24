/**
 * Admin routes for monitoring and management
 * Provides endpoints for hot keys tracking and system observability
 */

const express = require('express');
const router = express.Router();
const redisService = require('../services/redisService');
const { parseCacheKey } = require('../utils/keyParser');
const logger = require('../utils/logger');

/**
 * GET /admin/hotkeys
 * Returns top hot cache keys from the last N minutes
 *
 * Query params:
 * - window: Time window in minutes (default: 15)
 * - limit: Max keys to return (default: 20)
 */
router.get('/admin/hotkeys', async (req, res) => {
  try {
    const window = parseInt(req.query.window) || 15;
    const limit = parseInt(req.query.limit) || 20;

    // Validate params
    if (window < 1 || window > 120) {
      return res.status(400).json({
        error: 'Invalid window parameter',
        message: 'Window must be between 1 and 120 minutes'
      });
    }

    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        error: 'Invalid limit parameter',
        message: 'Limit must be between 1 and 100'
      });
    }

    // Get hot keys from Redis
    const hotKeys = await redisService.getHotKeys(window, limit);

    // Parse each key for readable display
    const parsedKeys = hotKeys.map(({ key, count }) => {
      const parsed = parseCacheKey(key);

      return {
        key,
        count,
        route: parsed.route,
        type: parsed.type || '',
        catalogId: parsed.catalogId || '',
        metaId: parsed.id || '',
        page: parsed.page || '',
        search: parsed.search || '',
        searchLen: parsed.searchLen || 0,
        genre: parsed.genre || '',
        configHash: parsed.configHash,
        userId: parsed.userId || '_',
        display: parsed.display
      };
    });

    res.json({
      window: `${window}m`,
      limit,
      total: parsedKeys.length,
      hotKeys: parsedKeys
    });
  } catch (error) {
    logger.error('Hot keys endpoint error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch hot keys',
      message: error.message
    });
  }
});

/**
 * GET /admin/stats
 * Returns Redis and cache statistics
 */
router.get('/admin/stats', async (req, res) => {
  try {
    const stats = await redisService.getStats();

    if (!stats) {
      return res.json({
        redis: 'unavailable',
        message: 'Redis is not configured or unavailable'
      });
    }

    // Parse Redis info strings into structured data
    const memoryMatch = stats.memory.match(/used_memory_human:([^\r\n]+)/);
    const keysMatch = stats.keyspace.match(/db0:keys=(\d+)/);
    const evictionsMatch = stats.info.match(/evicted_keys:(\d+)/);

    res.json({
      redis: 'available',
      memory: memoryMatch ? memoryMatch[1].trim() : 'unknown',
      keys: keysMatch ? parseInt(keysMatch[1], 10) : 0,
      evictions: evictionsMatch ? parseInt(evictionsMatch[1], 10) : 0,
      inflightRequests: stats.inflightRequests || 0
    });
  } catch (error) {
    logger.error('Stats endpoint error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch stats',
      message: error.message
    });
  }
});

module.exports = router;
