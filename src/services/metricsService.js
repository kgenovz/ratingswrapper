const promClient = require('prom-client');

/**
 * Metrics Service
 *
 * Provides Prometheus metrics for monitoring cache performance,
 * request latency, rate limiting, and system health.
 */

// Create a registry
const register = new promClient.Registry();

// Add default metrics (process CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom metrics

/**
 * Counter: Total catalog/meta/manifest requests
 * Labels: route (catalog/meta/manifest), cache (hit/miss/stale/hit-singleflight/bypass/none)
 */
const catalogRequestsTotal = new promClient.Counter({
  name: 'catalog_requests_total',
  help: 'Total number of catalog/meta/manifest requests',
  labelNames: ['route', 'cache'],
  registers: [register]
});

/**
 * Histogram: Request latency in seconds
 * Labels: route (catalog/meta/manifest), cache (hit/miss/stale/hit-singleflight/bypass/none)
 * Buckets: 0.005s to 10s (5ms to 10 seconds)
 */
const catalogLatencySeconds = new promClient.Histogram({
  name: 'catalog_latency_seconds',
  help: 'Latency of catalog/meta/manifest requests in seconds',
  labelNames: ['route', 'cache'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register]
});

/**
 * Counter: Total rate-limited requests (429 responses)
 * Labels: route, tier (anonymous/authenticated)
 */
const rateLimitedTotal = new promClient.Counter({
  name: 'rate_limited_total',
  help: 'Total number of rate-limited requests (HTTP 429)',
  labelNames: ['route', 'tier'],
  registers: [register]
});

/**
 * Gauge: Redis memory usage in bytes
 */
const redisMemoryBytes = new promClient.Gauge({
  name: 'redis_memory_bytes',
  help: 'Redis memory usage in bytes',
  registers: [register]
});

/**
 * Gauge: Redis db0 key count
 */
const redisDb0Keys = new promClient.Gauge({
  name: 'redis_db0_keys',
  help: 'Number of keys in Redis db0',
  registers: [register]
});

/**
 * Counter: Redis evictions
 */
const redisEvictionsTotal = new promClient.Counter({
  name: 'redis_evictions_total',
  help: 'Total number of Redis key evictions',
  registers: [register]
});

/**
 * Record a request with latency
 * @param {string} route - catalog, meta, or manifest
 * @param {string} cacheStatus - hit, miss, stale, hit-singleflight, bypass, or none
 * @param {number} latencyMs - Request latency in milliseconds
 */
function recordRequest(route, cacheStatus, latencyMs) {
  catalogRequestsTotal.inc({ route, cache: cacheStatus });
  catalogLatencySeconds.observe({ route, cache: cacheStatus }, latencyMs / 1000);
}

/**
 * Record a rate-limited request
 * @param {string} route - The route that was rate-limited
 * @param {string} tier - anonymous or authenticated
 */
function recordRateLimit(route, tier) {
  rateLimitedTotal.inc({ route, tier });
}

/**
 * Update Redis metrics from INFO command
 * @param {object} redisClient - ioredis client instance
 */
async function updateRedisMetrics(redisClient) {
  try {
    if (!redisClient || redisClient.status !== 'ready') {
      return;
    }

    const info = await redisClient.info('memory');
    const stats = await redisClient.info('stats');
    const keyspace = await redisClient.info('keyspace');

    // Parse memory usage
    const memoryMatch = info.match(/used_memory:(\d+)/);
    if (memoryMatch) {
      redisMemoryBytes.set(parseInt(memoryMatch[1], 10));
    }

    // Parse evictions
    const evictionsMatch = stats.match(/evicted_keys:(\d+)/);
    if (evictionsMatch) {
      // Counter should only increment, so we need to track the delta
      const currentEvictions = parseInt(evictionsMatch[1], 10);
      const lastEvictions = redisEvictionsTotal['lastValue'] || 0;

      if (currentEvictions > lastEvictions) {
        redisEvictionsTotal.inc(currentEvictions - lastEvictions);
      }

      redisEvictionsTotal['lastValue'] = currentEvictions;
    }

    // Parse db0 keys
    const keysMatch = keyspace.match(/db0:keys=(\d+)/);
    if (keysMatch) {
      redisDb0Keys.set(parseInt(keysMatch[1], 10));
    }
  } catch (error) {
    // Fail silently - metrics collection shouldn't break the app
    console.error('Failed to update Redis metrics:', error.message);
  }
}

/**
 * Get metrics in Prometheus format
 * @returns {Promise<string>} Metrics text
 */
async function getMetrics() {
  return register.metrics();
}

/**
 * Get metrics registry (for advanced usage)
 * @returns {Registry} Prometheus registry
 */
function getRegistry() {
  return register;
}

module.exports = {
  recordRequest,
  recordRateLimit,
  updateRedisMetrics,
  getMetrics,
  getRegistry
};
