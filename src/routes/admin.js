/**
 * Admin routes for monitoring and management
 * Provides endpoints for hot keys tracking and system observability
 */

const express = require('express');
const router = express.Router();
const redisService = require('../services/redisService');
const { parseCacheKey } = require('../utils/keyParser');
const logger = require('../utils/logger');
const config = require('../config');
const { generateObservabilityHTML } = require('../views/observability');
const metricsService = require('../services/metricsService');
const fs = require('fs').promises;
const path = require('path');
const adminAuth = require('../middleware/adminAuth');

// Apply authentication middleware only to /admin/* routes
router.use('/admin', adminAuth);

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
    const maxMemoryMatch = stats.memory.match(/maxmemory_human:([^\r\n]+)/);
    const maxMemoryBytesMatch = stats.memory.match(/maxmemory:(\d+)/);
    const policyMatch = stats.memory.match(/maxmemory_policy:([^\r\n]+)/);
    const keysMatch = stats.keyspace.match(/db0:keys=(\d+)/);
    const evictionsMatch = stats.info.match(/evicted_keys:(\d+)/);

    res.json({
      redis: 'available',
      memoryUsed: memoryMatch ? memoryMatch[1].trim() : 'unknown',
      // Back-compat field for UI expecting `memory`
      memory: memoryMatch ? memoryMatch[1].trim() : 'unknown',
      maxMemory: maxMemoryMatch ? maxMemoryMatch[1].trim() : 'unknown',
      maxMemoryBytes: maxMemoryBytesMatch ? parseInt(maxMemoryBytesMatch[1], 10) : null,
      evictionPolicy: policyMatch ? policyMatch[1].trim() : 'unknown',
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

/**
 * GET /admin/observability
 * Serves the observability dashboard HTML page
 */
router.get('/admin/observability', (req, res) => {
  try {
    const protocol = req.protocol;
    const host = req.get('host');
    const wrapperUrl = `${protocol}://${host}`;
    const grafanaUrl = config.grafanaUrl; // null if not configured

    const html = generateObservabilityHTML(wrapperUrl, grafanaUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    logger.error('Observability page error:', error.message);
    res.status(500).send('Error loading observability dashboard');
  }
});

/**
 * GET /admin/metrics-aggregate
 * Returns aggregated metrics from Prometheus registry
 * Used by the observability dashboard for real-time stats
 */
router.get('/admin/metrics-aggregate', async (req, res) => {
  try {
    const registry = metricsService.getRegistry();
    const metrics = await registry.getMetricsAsJSON();

    // Helper to get metric value
    const getMetricValue = (name, labels = {}) => {
      const metric = metrics.find(m => m.name === name);
      if (!metric) return null;

      if (metric.type === 'counter' || metric.type === 'gauge') {
        if (Object.keys(labels).length === 0) {
          // Return sum of all values
          return metric.values.reduce((sum, v) => sum + v.value, 0);
        } else {
          // Find matching label
          const value = metric.values.find(v =>
            Object.entries(labels).every(([key, val]) => v.labels[key] === val)
          );
          return value ? value.value : null;
        }
      }

      return null;
    };

    // Helper to calculate rate (delta per second over 5m window)
    const calculateRate = (metricName, labels = {}, windowSeconds = 300) => {
      const value = getMetricValue(metricName, labels);
      if (value === null) return null;
      // For rate calculation, we'd need historical data
      // For now, just return the raw counter value
      return value;
    };

    // Helper to get histogram quantile
    const getHistogramQuantile = (name, quantile) => {
      const metric = metrics.find(m => m.name === name);
      if (!metric || metric.type !== 'histogram') return null;

      // Get all bucket values
      const buckets = metric.values
        .filter(v => v.labels.le !== undefined)
        .sort((a, b) => parseFloat(a.labels.le) - parseFloat(b.labels.le));

      if (buckets.length === 0) return null;

      // Get total count and sum
      const countMetric = metric.values.find(v => v.metricName && v.metricName.endsWith('_count'));
      const sumMetric = metric.values.find(v => v.metricName && v.metricName.endsWith('_sum'));

      const count = countMetric ? countMetric.value : buckets[buckets.length - 1].value;
      const sum = sumMetric ? sumMetric.value : 0;

      if (count === 0) return 0;

      // Find the bucket that contains our quantile
      const targetRank = quantile * count;
      let prevBucket = null;
      let prevCount = 0;

      for (const bucket of buckets) {
        if (bucket.value >= targetRank) {
          if (!prevBucket) return 0;

          // Linear interpolation
          const bucketStart = parseFloat(prevBucket.labels.le);
          const bucketEnd = parseFloat(bucket.labels.le);
          const bucketCount = bucket.value - prevCount;
          const rank = targetRank - prevCount;

          if (bucketCount === 0) return bucketStart;

          return bucketStart + (bucketEnd - bucketStart) * (rank / bucketCount);
        }
        prevBucket = bucket;
        prevCount = bucket.value;
      }

      // If we're here, return the last bucket's upper bound
      return parseFloat(buckets[buckets.length - 1].labels.le);
    };

    // Calculate aggregated metrics
    const result = {
      // Cache hit ratio (5m)
      hitRatio: null,
      // p95 latency (5m)
      p95Latency: null,
      // Requests/sec (1m)
      requestsPerSec: null,
      // Rate limited/sec (5m)
      rateLimitedPerSec: null,
      // Stale serves % (5m)
      staleServesPercent: null,
      // Redis evictions increase (15m)
      redisEvictionsIncrease: null
    };

    // Get total requests and hits
    const totalRequests = getMetricValue('catalog_requests_total');
    const hitRequests = getMetricValue('catalog_requests_total', { cache: 'hit' });
    const staleRequests = getMetricValue('catalog_requests_total', { cache: 'stale' });

    if (totalRequests && totalRequests > 0) {
      result.hitRatio = hitRequests / totalRequests;
      result.staleServesPercent = staleRequests / totalRequests;
    }

    // Get p95 latency from histogram
    result.p95Latency = getHistogramQuantile('catalog_latency_seconds', 0.95);

    // Get requests/sec (approximate from total)
    // Note: This is cumulative, so we'd need rate() for accurate per-second
    // For now, show total
    result.requestsPerSec = totalRequests || 0;

    // Get rate limited
    const rateLimited = getMetricValue('rate_limited_total');
    result.rateLimitedPerSec = rateLimited || 0;

    // Get Redis evictions
    const evictions = getMetricValue('redis_evictions_total');
    result.redisEvictionsIncrease = evictions || 0;

    res.json(result);
  } catch (error) {
    logger.error('Metrics aggregate endpoint error:', error.message);
    res.status(500).json({
      error: 'Failed to aggregate metrics',
      message: error.message
    });
  }
});

/**
 * GET /admin/cache-version
 * Returns current cache version and last bump time
 */
router.get('/admin/cache-version', async (req, res) => {
  try {
    const version = config.cacheVersion || '1';

    // Try to read bump history from file
    let lastBumpTime = null;
    try {
      const historyPath = path.join(process.cwd(), '.cache-version-history.json');
      const historyData = await fs.readFile(historyPath, 'utf8');
      const history = JSON.parse(historyData);
      lastBumpTime = history.lastBumpTime || null;
    } catch (error) {
      // File doesn't exist yet, that's okay
    }

    res.json({
      version,
      lastBumpTime
    });
  } catch (error) {
    logger.error('Cache version endpoint error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch cache version',
      message: error.message
    });
  }
});

/**
 * GET /admin/flush-cache
 * Shows confirmation page with button to flush cache
 */
router.get('/admin/flush-cache', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Flush Cache - Ratings Wrapper</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            max-width: 600px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          h1 {
            color: #dc2626;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 12px;
          }
          h1 i { font-size: 32px; }
          .warning {
            background: #fee2e2;
            border-left: 4px solid #dc2626;
            padding: 16px;
            margin-bottom: 24px;
            border-radius: 4px;
          }
          .warning strong { color: #991b1b; display: block; margin-bottom: 8px; }
          .warning ul { margin-left: 20px; color: #7f1d1d; }
          .warning li { margin: 4px 0; }
          .btn {
            background: #dc2626;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-right: 12px;
          }
          .btn:hover { background: #b91c1c; transform: translateY(-2px); }
          .btn:disabled { background: #d1d5db; cursor: not-allowed; }
          .btn-secondary {
            background: #6b7280;
          }
          .btn-secondary:hover { background: #4b5563; }
          .result {
            margin-top: 20px;
            padding: 16px;
            border-radius: 8px;
            display: none;
          }
          .result.success { background: #d1fae5; color: #065f46; border-left: 4px solid #059669; }
          .result.error { background: #fee2e2; color: #991b1b; border-left: 4px solid #dc2626; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1><i class="fa-solid fa-triangle-exclamation"></i> Flush Redis Cache</h1>

          <div class="warning">
            <strong>⚠️ WARNING: This is a destructive action!</strong>
            <p>Flushing the cache will immediately delete ALL Redis keys:</p>
            <ul>
              <li>All cached catalogs and metadata</li>
              <li>All IMDb ratings and MPAA data</li>
              <li>All series ratings (RT/MC)</li>
              <li>All rate limiting counters</li>
              <li>Old unversioned keys (series-ratings:*, ratelimit:v1:*)</li>
            </ul>
            <p style="margin-top: 12px;">The cache will rebuild from scratch on the next requests. Use this to clear stuck cache entries or after fixing cache key bugs.</p>
          </div>

          <button class="btn" id="flushBtn" onclick="flushCache()">
            <i class="fa-solid fa-trash"></i> Yes, Flush All Cache
          </button>
          <button class="btn btn-secondary" onclick="window.location.href='/admin/observability'">
            <i class="fa-solid fa-arrow-left"></i> Cancel
          </button>

          <div class="result" id="result"></div>
        </div>

        <script>
          async function flushCache() {
            if (!confirm('Are you ABSOLUTELY SURE you want to delete all Redis keys?\\n\\nThis cannot be undone!')) {
              return;
            }

            const btn = document.getElementById('flushBtn');
            const result = document.getElementById('result');

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Flushing...';
            result.style.display = 'none';

            try {
              const response = await fetch('/admin/flush-cache', {
                method: 'POST'
              });

              const data = await response.json();

              if (response.ok && data.success) {
                result.className = 'result success';
                result.innerHTML = '<strong><i class="fa-solid fa-check-circle"></i> Success!</strong><p>' + data.message + '</p>';
                result.style.display = 'block';

                setTimeout(() => {
                  window.location.href = '/admin/observability';
                }, 2000);
              } else {
                throw new Error(data.error || 'Failed to flush cache');
              }

            } catch (error) {
              console.error('Error flushing cache:', error);
              result.className = 'result error';
              result.innerHTML = '<strong><i class="fa-solid fa-times-circle"></i> Error!</strong><p>' + error.message + '</p>';
              result.style.display = 'block';
              btn.disabled = false;
              btn.innerHTML = '<i class="fa-solid fa-trash"></i> Yes, Flush All Cache';
            }
          }
        </script>
      </body>
    </html>
  `);
});

/**
 * POST /admin/flush-cache
 * Flushes entire Redis cache database (nuclear option)
 * Use this to immediately clear all cached data including old unversioned keys
 */
router.post('/admin/flush-cache', async (req, res) => {
  try {
    logger.warn('FLUSH CACHE requested - deleting all Redis keys');

    const success = await redisService.flushAll();

    if (success) {
      logger.info('✓ Redis cache flushed successfully');
      res.json({
        success: true,
        message: 'All Redis cache cleared. Cache will rebuild on next requests.'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Redis unavailable or flush failed'
      });
    }
  } catch (error) {
    logger.error('Flush cache error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to flush cache',
      message: error.message
    });
  }
});

/**
 * POST /admin/bump-cache-version
 * Increments the cache version and updates the .env file
 */
router.post('/admin/bump-cache-version', async (req, res) => {
  try {
    const oldVersion = config.cacheVersion || '1';
    const newVersion = String(parseInt(oldVersion, 10) + 1);

    // Update .env file
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';

    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch (error) {
      // .env doesn't exist, create it
      envContent = '';
    }

    // Update or add CACHE_VERSION
    const versionRegex = /^CACHE_VERSION=.*$/m;
    if (versionRegex.test(envContent)) {
      envContent = envContent.replace(versionRegex, `CACHE_VERSION=${newVersion}`);
    } else {
      envContent += `\nCACHE_VERSION=${newVersion}\n`;
    }

    await fs.writeFile(envPath, envContent, 'utf8');

    // Update in-memory config
    config.cacheVersion = newVersion;
    process.env.CACHE_VERSION = newVersion;

    // Save bump history
    const historyPath = path.join(process.cwd(), '.cache-version-history.json');
    const history = {
      version: newVersion,
      lastBumpTime: new Date().toISOString(),
      previousVersion: oldVersion
    };
    await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf8');

    logger.info(`Cache version bumped: ${oldVersion} → ${newVersion}`);

    res.json({
      success: true,
      oldVersion,
      newVersion,
      message: 'Cache version bumped successfully. All cached data will be invalidated.'
    });
  } catch (error) {
    logger.error('Bump cache version error:', error.message);
    res.status(500).json({
      error: 'Failed to bump cache version',
      message: error.message
    });
  }
});

module.exports = router;
