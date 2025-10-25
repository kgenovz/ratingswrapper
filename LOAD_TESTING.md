# Load Testing Guide - Phase 8

## Overview

This guide covers Phase 8 pre-release load testing for the Ratings Wrapper service.

**Acceptance Criteria:**
- ✅ Stable p95 latency < 300ms
- ✅ Cache hit ratio > 60% on common routes
- ✅ No memory leaks or creep
- ✅ Error rate < 1%
- ✅ No secrets in logs or metrics

**Recent Updates (Rate Limiting Architecture):**
- ✅ **Singleflight protection** prevents cache stampedes
- ✅ **Cache-first architecture** - rate limiting applied AFTER cache
- ✅ **Cache hits bypass rate limits** - 60-90% reduction in rate limited requests
- ✅ **Concurrent request coalescing** - multiple requests for same resource wait for first one

## Quick Start

### 1. Testing Against Railway (Production)

```bash
# 5-minute test with 75 concurrent connections
TEST_URL=https://your-railway-domain.up.railway.app npm run load-test

# Short 1-minute test
TEST_URL=https://your-railway-domain.up.railway.app TEST_DURATION=60 npm run load-test
```

### 2. Testing Locally

```bash
# Make sure local server is running first
npm run dev

# In another terminal, run load test
npm run load-test:local

# Or short version
TEST_URL=http://localhost:7000 TEST_DURATION=60 npm run load-test
```

## Configuration Options

All options are set via environment variables:

```bash
TEST_URL=<target-url>           # Default: http://localhost:7000
TEST_DURATION=<seconds>         # Default: 300 (5 minutes)
TEST_CONNECTIONS=<number>       # Default: 75 (concurrent users)
```

## Test Endpoints

The load test simulates realistic traffic across these endpoints:

- **30%** - `/catalog/movie/top.json` (Popular movies)
- **25%** - `/catalog/movie/popular.json` (Trending movies)
- **20%** - `/catalog/series/top.json` (Popular series)
- **15%** - `/catalog/series/popular.json` (Trending series)
- **5%** - `/meta/movie/tt0111161.json` (Movie metadata)
- **5%** - `/meta/series/tt0944947.json` (Series metadata)

## Monitoring During Tests

### Real-Time Dashboard

Open the observability dashboard while tests are running:

```
https://your-railway-domain.up.railway.app/admin/observability
```

**What to watch:**
1. **Cache Hit Ratio** - Should quickly climb to >60% as cache warms up
2. **p95 Latency** - Should drop below 300ms after cache is warm
3. **Requests/sec** - Should match test load (~25-50 req/s)
4. **Redis Memory** - Should stabilize (no continuous growth)
5. **Hot Keys** - Verify popular catalogs appear in top 20

### Grafana (Advanced)

For detailed time-series analysis:

```bash
# Local Grafana
http://localhost:3002

# Production (if configured)
$GRAFANA_URL
```

**Key Panels:**
- Cache hit ratio over time
- Latency percentiles (p50, p95, p99)
- Request rate by route
- Redis memory usage trends
- Evictions (should be minimal)

## Expected Results

### Cache Cold (First 30 seconds)
- Hit ratio: 0-20%
- p95 latency: 500-2000ms (fetching from wrapped addons)
- Lots of cache misses

### Cache Warm (After 1-2 minutes)
- Hit ratio: 60-90%
- p95 latency: 50-200ms (serving from cache)
- Minimal cache misses

### Steady State (3-5 minutes)
- Hit ratio: 70-95%
- p95 latency: <100ms
- Stale serves: 5-15% (SWR working)
- Redis memory: stable

## Post-Test Verification

### 1. Check Logs for Secrets

```bash
# Check recent logs
grep -i "password\|token\|secret\|auth" logs/*.log

# Should only see:
# - Masked tokens (e.g., "****")
# - Config hashes (first 6 chars)
# - No full credentials
```

### 2. Verify Metrics Privacy

```bash
# Check Prometheus metrics
curl http://localhost:7000/metrics | grep -i "password\|token\|email"

# Should return nothing sensitive
```

### 3. Check Redis Memory

```bash
# Via admin API
curl http://localhost:7000/admin/stats

# Look for:
# - Memory stable (not continuously growing)
# - Keys count reasonable (<10,000)
# - Evictions low (<1000)
```

### 4. Review Hot Keys

```bash
# Check hot keys
curl http://localhost:7000/admin/hotkeys?window=15&limit=20

# Verify:
# - Config hashes are truncated (6 chars)
# - User IDs shown as "_" (anonymous) or "auth"
# - No full URLs or tokens in keys
```

## Troubleshooting

### High Latency (p95 > 300ms)

**Causes:**
- Cold cache (wait 2-3 minutes)
- Wrapped addon is slow
- Network issues
- Redis not connected

**Solutions:**
```bash
# Check cache status
curl -I http://localhost:7000/<config>/catalog/movie/top.json | grep X-Ratings-Cache

# Should show "hit" after warmup
```

### Low Hit Ratio (<60%)

**Causes:**
- Cache TTLs too short
- High variety of requests
- Redis evicting too aggressively

**Solutions:**
```bash
# Check Redis evictions
curl http://localhost:7000/admin/stats | jq .evictions

# If high, increase Redis maxmemory
```

### Memory Leak

**Symptoms:**
- Redis memory continuously growing
- No plateau after 5 minutes

**Solutions:**
```bash
# Check Redis keys growth
watch -n 5 'curl -s http://localhost:7000/admin/stats | jq .keys'

# Should stabilize around 2,000-5,000 keys
```

## Example Test Run

```bash
$ TEST_URL=https://ratings-wrapper.up.railway.app npm run load-test

🚀 Ratings Wrapper Load Test - Phase 8

════════════════════════════════════════════════════════════
Target URL:       https://ratings-wrapper.up.railway.app
Duration:         300 seconds (5 min 0 sec)
Connections:      75 concurrent
Test Endpoints:   6
════════════════════════════════════════════════════════════

Endpoint Distribution:
  30% - top.json
  25% - popular.json
  20% - top.json
  15% - popular.json
  5% - tt0111161.json
  5% - tt0944947.json
════════════════════════════════════════════════════════════

✓ Monitor the dashboard at: https://ratings-wrapper.up.railway.app/admin/observability
⚠ Starting in 3 seconds...

Running 5m test @ https://ratings-wrapper.up.railway.app
75 connections

┌─────────┬──────┬──────┬───────┬──────┬─────────┬─────────┬────────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%  │ Avg     │ Stdev   │ Max    │
├─────────┼──────┼──────┼───────┼──────┼─────────┼─────────┼────────┤
│ Latency │ 45ms │ 68ms │ 250ms │ 320ms│ 89.5ms  │ 62.3ms  │ 450ms  │
└─────────┴──────┴──────┴───────┴──────┴─────────┴─────────┴────────┘
┌───────────┬─────────┬─────────┬─────────┬─────────┬──────────┬─────────┬─────────┐
│ Stat      │ 1%      │ 2.5%    │ 50%     │ 97.5%   │ Avg      │ Stdev   │ Min     │
├───────────┼─────────┼─────────┼─────────┼─────────┼──────────┼─────────┼─────────┤
│ Req/Sec   │ 800     │ 800     │ 850     │ 900     │ 845.2    │ 28.4    │ 798     │
├───────────┼─────────┼─────────┼─────────┼─────────┼──────────┼─────────┼─────────┤
│ Bytes/Sec │ 2.5 MB  │ 2.5 MB  │ 2.7 MB  │ 2.8 MB  │ 2.65 MB  │ 89 kB   │ 2.5 MB  │
└───────────┴─────────┴─────────┴─────────┴─────────┴──────────┴─────────┴─────────┘

📊 Load Test Results

════════════════════════════════════════════════════════════

Throughput:
  Requests:         253,560
  Requests/sec:     845.20
  Bytes/sec:        2.65 MB

Latency:
  Mean:             89.50 ms
  p50:              68.00 ms
  p75:              125.00 ms
  p90:              180.00 ms
  p95:              245.00 ms ✓
  p99:              320.00 ms
  Max:              450.00 ms

Errors:
  Total:            0 (0.00%)
  Timeouts:         0
  Non-2xx:          0

Status Codes:
  200:              253,560

════════════════════════════════════════════════════════════

✓ Acceptance Criteria Check:

  ✓ p95 latency < 300ms
  ✓ Error rate < 1%
  ⚠ Check dashboard for hit ratio > 60%
  ⚠ Check Redis for memory stability

════════════════════════════════════════════════════════════

💡 Next Steps:

  1. Check the observability dashboard for cache hit ratio
  2. Verify no secrets in logs (check logs/ directory)
  3. Monitor Redis memory usage for leaks
  4. Review hot keys to identify traffic patterns
```

## Performance Benchmarks

### Local Testing (no network latency)
- **p95:** 50-150ms
- **Hit ratio:** 80-95%
- **Throughput:** 1,000-2,000 req/s

### Railway Production (with network)
- **p95:** 100-250ms
- **Hit ratio:** 70-90%
- **Throughput:** 500-1,000 req/s

### Rate Limiting

**Important:** As of the latest update, rate limiting is applied AFTER cache checking:
- **Cache hits bypass rate limiting** (fresh, stale, or singleflight)
- **Only cache misses are rate limited**
- This reduces rate limiting by 60-90% with a warm cache

**Default Rate Limits:**
- **Anonymous:** 5 req/s per IP (burst: 10)
- **Authenticated:** 10 req/s per userId (burst: 20)

**For Load Testing with Cold Cache:**

If you're testing with a cold cache or high concurrent connections, you may hit rate limits on cache misses:

```bash
# Method 1: Increase rate limits temporarily
export RATE_LIMIT_ANONYMOUS_RPS=100
export RATE_LIMIT_ANONYMOUS_BURST=200
npm run load-test

# Method 2: Test against warm cache (pre-warm first)
# Run once to warm cache, then run load test
curl http://localhost:7000/<config>/catalog/movie/top.json
npm run load-test
```

**Understanding the Metrics:**

- **14,756 rate limited in 5 min** = Cold cache, all requests hitting backend
- **<100 rate limited in 5 min** = Warm cache (60%+ hit ratio)
- If you see high rate limiting with warm cache, check cache hit ratio in dashboard

## Success Criteria

✅ **PASS** if:
- p95 latency < 300ms (after warmup)
- Error rate < 1%
- Hit ratio > 60% (visible in dashboard)
- Redis memory stable (no continuous growth)
- No secrets in logs/metrics

❌ **FAIL** if:
- p95 > 300ms consistently
- Error rate > 1%
- Memory continuously growing
- Credentials visible in logs
- High evictions (>1000 in 10 minutes)

## Next Steps After Testing

1. **Document results** in GitHub issue or PR
2. **Tune TTLs** if needed (based on hit ratio)
3. **Adjust Redis memory** if evictions are high
4. **Update Grafana alerts** based on observed patterns
5. **Test on actual devices** (Android TV, mobile)
6. **Deploy to production** if all checks pass! 🚀
