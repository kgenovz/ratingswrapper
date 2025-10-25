/**
 * Monitoring and observability routes
 * Provides /metrics (Prometheus) and /healthz endpoints
 */

const express = require('express');
const router = express.Router();
const metricsService = require('../services/metricsService');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * GET /metrics
 * Prometheus metrics endpoint
 * Returns metrics in Prometheus text format
 */
router.get('/metrics', async (req, res) => {
  try {
    // Update Redis metrics before serving (collect latest stats)
    const redisClient = require('../config/redis').getRedisClient();
    if (redisClient) {
      await metricsService.updateRedisMetrics(redisClient);
    }

    // Get metrics in Prometheus format
    const metrics = await metricsService.getMetrics();

    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics);
  } catch (error) {
    logger.error('Failed to generate metrics:', error.message);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

/**
 * GET /healthz
 * Health check endpoint
 * Tests Redis, SQLite (via ratings-api), and basic service health
 */
router.get('/healthz', async (req, res) => {
  const startTime = Date.now();
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {}
  };

  // Check Redis
  try {
    const redisClient = require('../config/redis').getRedisClient();

    if (redisClient && redisClient.status === 'ready') {
      const redisStart = Date.now();
      await redisClient.ping();
      const redisDuration = Date.now() - redisStart;

      health.checks.redis = {
        status: 'up',
        latency_ms: redisDuration
      };
    } else {
      health.checks.redis = {
        status: 'down',
        error: 'Redis client not ready'
      };
      health.status = 'degraded';
    }
  } catch (error) {
    health.checks.redis = {
      status: 'down',
      error: error.message
    };
    health.status = 'degraded';
  }

  // Check SQLite / Ratings API
  try {
    const axios = require('axios');
    const ratingsApiUrl = config.ratingsApiUrl || `http://localhost:${config.ratingsPort}`;

    const sqliteStart = Date.now();
    const response = await axios.get(`${ratingsApiUrl}/health`, {
      timeout: 5000
    });
    const sqliteDuration = Date.now() - sqliteStart;

    health.checks.ratings_api = {
      status: 'up',
      latency_ms: sqliteDuration,
      details: response.data
    };
  } catch (error) {
    health.checks.ratings_api = {
      status: 'down',
      error: error.message
    };
    health.status = 'degraded';
  }

  // Total health check duration
  health.duration_ms = Date.now() - startTime;

  // Return appropriate status code
  if (health.status === 'healthy') {
    res.status(200).json(health);
  } else {
    res.status(503).json(health);
  }
});

module.exports = router;
