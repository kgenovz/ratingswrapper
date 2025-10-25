# 📊 Ratings Wrapper — Observability Dashboard To-Do

> Goal: See cache health, latency, throughput, and failures at a glance so you can tune TTLs, spot spikes, and stay ahead of issues.

---

## Phase 1 — Metrics Plumbing (MVP) ✅ COMPLETED
- [x] **Expose `/metrics`** (Prometheus format) with:
  - [x] `catalog_requests_total{route,cache}` (cache=hit|miss|stale|hit-singleflight|bypass|none)
  - [x] `catalog_latency_seconds_bucket{route,cache}` (Histogram)
  - [x] `rate_limited_total{route}` (Counter for 429s)
  - [x] `redis_memory_bytes`, `redis_db0_keys`, `redis_evictions_total` (Gauges)
- [x] **Instrument catalog route**:
  - [x] Set `X-Ratings-Cache` header from cache middleware.
  - [x] Record latency on every request.
  - [x] Increment rate-limit counter on 429s.
- [x] **Add `/healthz`**:
  - [x] `PING` Redis
  - [x] `SELECT 1` SQLite (via ratings-api health endpoint)
  - [x] Return HTTP 200 + timings JSON
- **Acceptance:** `curl /metrics` shows counters/histograms; `/healthz` returns 200 and timings.

### Implementation Details
- **Files Created**:
  - `src/services/metricsService.js` - Prometheus metrics service with prom-client
  - `src/routes/monitoring.js` - `/metrics` and `/healthz` endpoints
- **Files Modified**:
  - `src/index.js` - Integrated monitoring routes
  - `src/middleware/cache.js` - Added metrics recording for all requests
  - `src/middleware/rateLimit.js` - Added 429 metrics recording
  - `package.json` - Added `prom-client@^15.1.0` dependency
- **Features**:
  - **Prometheus Metrics**:
    - `catalog_requests_total` - Counter with route and cache status labels
    - `catalog_latency_seconds` - Histogram with buckets from 5ms to 10s
    - `rate_limited_total` - Counter for 429 responses by tier (anonymous/authenticated)
    - `redis_memory_bytes` - Gauge for Redis memory usage
    - `redis_db0_keys` - Gauge for Redis key count
    - `redis_evictions_total` - Counter for cache evictions
  - **Health Check**: Tests Redis ping and ratings-api health, returns 200/503 with latency timings
  - **Default Metrics**: Process CPU, memory, and Node.js metrics via prom-client

---

## Phase 2 — Prometheus + Grafana (Quick Docker Stack) ✅ COMPLETED
- [x] `docker-compose.monitoring.yml` for **Prometheus** and **Grafana**
- [x] `prometheus.yml` scraping your app every 10s
- [x] Grafana data source (Prometheus) and a minimal **"Ratings Wrapper"** dashboard with panels:
  - [x] **Cache Hit Ratio** (5m): `sum(rate(catalog_requests_total{cache="hit"}[5m])) / sum(rate(catalog_requests_total[5m]))`
  - [x] **Latency p95**: `histogram_quantile(0.95, sum(rate(catalog_latency_seconds_bucket[5m])) by (le))`
  - [x] **Requests/sec**: `sum(rate(catalog_requests_total[1m]))`
  - [x] **429s/sec**: `sum(rate(rate_limited_total[5m]))`
  - [x] **Redis Memory (MB)**: `redis_memory_bytes / 1024 / 1024`
  - [x] **Redis Keys**: `redis_db0_keys`
  - [x] **Redis Evictions (15m)**: `increase(redis_evictions_total[15m])`
- **Acceptance:** Dashboard loads; panels show live values and update.

### Implementation Details
- **Files Created**:
  - `docker-compose.monitoring.yml` - Prometheus and Grafana stack
  - `monitoring/prometheus.yml` - Prometheus scrape config (10s interval)
  - `monitoring/grafana/provisioning/datasources/prometheus.yml` - Auto-provision Prometheus datasource
  - `monitoring/grafana/provisioning/dashboards/default.yml` - Auto-provision dashboards
  - `monitoring/grafana/dashboards/ratings-wrapper.json` - Main observability dashboard
  - `MONITORING.md` - Setup and usage documentation
- **Features**:
  - **Docker Services**:
    - Prometheus: Scrapes app on `:7000/metrics` every 10s
    - Grafana: Accessible on `:3002` (admin/admin)
  - **Dashboard Panels**:
    - Cache Hit Ratio gauge with color thresholds (red <50%, yellow 50-70%, green >70%)
    - Latency graph showing p95 and p50 by route
    - Requests/sec timeseries
    - Rate limiting 429s by tier
    - Redis memory, keys, and evictions panels
  - **Auto-Provisioning**: Dashboard loads automatically on Grafana startup
  - **Persistence**: Grafana data stored in `./monitoring/grafana-data`

---

## Phase 3 — Hot Keys & Traffic Composition ✅ COMPLETED
- [x] **Track hot cache keys** (last 15 min):
  - [x] On each served request, `ZINCRBY hotkeys:<yyyy-mm-ddThh:mm> key 1` (expire each `hotkeys:*` in 30–60 min)
  - [x] `/admin/hotkeys?window=15m` endpoint: returns top 20 `{key,count}`
  - [x] Parse key into fields for display (route, type, catalogId, page, searchLen, configHash[0:6], user/_)
- [x] Grafana table panel: Top 20 keys by count (via simple JSON API datasource or Prometheus if you export as metrics)
- **Acceptance:** You can identify noisy catalogs/searches quickly.

### Implementation Details
- **Files Created**:
  - `src/routes/admin.js` - Admin endpoints for hot keys and stats
  - `src/utils/keyParser.js` - Cache key parser for human-readable display
- **Files Modified**:
  - `src/index.js` - Integrated admin routes
  - `src/services/redisService.js` - Added hot key tracking with sorted sets
  - `src/middleware/cache.js` - Track hot keys on every cache hit/miss/stale
- **Features**:
  - **Hot Key Tracking**:
    - Uses Redis sorted sets with time-windowed keys (`hotkeys:2025-01-24T10:15`)
    - Increments counter on every served request (hit, miss, or stale)
    - Automatic expiration after 60 minutes
    - Aggregates across multiple time windows for queried duration
  - **Admin Endpoints**:
    - `GET /admin/hotkeys?window=15&limit=20` - Top hot keys with parsed fields
    - `GET /admin/stats` - Redis memory, keys, evictions summary
  - **Key Parsing**: Extracts route, type, catalog ID, page, search query length, config hash (first 6 chars), and user scope
  - **Validation**: Window (1-120m) and limit (1-100) parameter validation

---

## Phase 4 — SWR & Expiry Visibility ✅ COMPLETED
- [x] Distinguish **stale-serve** in metrics (`cache="stale"`)
- [x] Grafana stat: `% stale serves` = `sum(rate(catalog_requests_total{cache="stale"}[5m])) / sum(rate(catalog_requests_total[5m]))`
- [x] Panel: **Miss vs Hit vs Stale** stacked area over time
- **Acceptance:** You can see when TTLs are too short/long (spikes in stale or miss).

### Implementation Details
- **Files Modified**:
  - `monitoring/grafana/dashboards/ratings-wrapper.json` - Added Phase 4 panels
- **Features**:
  - **% Stale Serves Gauge**: Shows percentage of requests served from stale cache (5m window)
    - Green: <10% stale (healthy - most content is fresh)
    - Yellow: 10-30% stale (acceptable - background refreshes working)
    - Orange: >30% stale (may need TTL adjustment)
  - **Stacked Area Chart**: Visualizes cache state distribution over time
    - Bottom to top: Hit (green) → Stale (yellow) → Miss (red)
    - Shows traffic composition and identifies TTL tuning opportunities
    - Mean and Last values in legend for quick analysis
  - **Panel Layout**: Reorganized top row to fit new gauge (4+4+8+8 columns)
- **Benefits**:
  - Quickly identify if TTLs are too short (high stale %)
  - Visual representation of SWR effectiveness
  - Easy correlation between stale serves and traffic patterns
  - Helps optimize fresh/stale period balance

---

## Phase 5 — Alerting (Actionable, Low-Noise) ✅ COMPLETED
- [x] Prometheus alert rules:
  - [x] **Low Hit Ratio**: hit ratio < 0.50 for 10m (warn), < 0.30 for 10m (crit)
  - [x] **Latency**: p95 > 0.5s for 10m (warn), > 1.0s for 5m (crit)
  - [x] **Redis Memory**: > 85% of `maxmemory` for 10m
  - [x] **Evictions**: `increase(redis_evictions_total[10m]) > 1000`
  - [x] **429s Spike**: `sum(rate(rate_limited_total[5m])) > 5`
  - [x] **Healthz Failing**: `/healthz` != 200 for 3 consecutive scrapes
- [x] Hook to your notifier (email/Slack/Webhook)
- **Acceptance:** A synthetic spike (load test) triggers alerts appropriately.

### Implementation Details
- **Files Created**:
  - `monitoring/alert-rules.yml` - Prometheus alert rules with 9 alerts
  - `monitoring/alertmanager.yml` - Alertmanager configuration with webhook/email/Slack support
  - `src/routes/webhook.js` - Webhook endpoint to receive alerts from Alertmanager
- **Files Modified**:
  - `monitoring/prometheus.yml` - Added alertmanager config and rule_files
  - `docker-compose.monitoring.yml` - Added Alertmanager service
  - `src/index.js` - Integrated webhook router
- **Alert Rules**:
  - **LowCacheHitRatio** (warning): <50% hit ratio for 10m
  - **CriticalCacheHitRatio** (critical): <30% hit ratio for 10m
  - **HighLatency** (warning): p95 >500ms for 10m
  - **CriticalLatency** (critical): p95 >1s for 5m
  - **HighRedisMemory** (warning): >85% of 2GB for 10m
  - **HighRedisEvictions** (warning): >1000 evictions in 10m
  - **HighRateLimiting** (warning): >5 req/sec being rate limited for 5m
  - **HealthCheckFailing** (critical): Service down for 1m
  - **RedisDown** (critical): Redis not responding for 2m
  - **HighStaleCacheServes** (warning): >40% stale serves for 15m (SWR-specific)
- **Features**:
  - **Alertmanager**: Routes alerts based on severity (critical vs warning)
  - **Notification Channels**:
    - Webhook to `/api/webhook/alerts` (logs alerts, extensible for Slack/Discord)
    - Email support (commented, ready to configure)
    - Slack support (commented, ready to configure)
  - **Alert Grouping**: Groups by alertname, severity, and component
  - **Inhibition Rules**: Suppresses warning alerts when critical alerts for same component are firing
  - **Repeat Intervals**: 1h for critical, 4h for warnings
- **Benefits**:
  - Proactive issue detection before users are impacted
  - Actionable alerts with clear severity levels
  - Low noise through grouping, inhibition, and sensible thresholds
  - Extensible notification system (webhook can forward to any service)

---

## Phase 6 — Logs that Help (Without PII)
- [ ] Structured logs per request (JSON):
  - [ ] `ts, route, cache, status, latency_ms, key_digest, type, catalogId, page, search_len, user_scope`
  - [ ] **Mask** any tokens/user IDs; only log a short digest of keys (`sha1(key).slice(0,8)`)
- [ ] Rotate logs (size/time-based)
- **Acceptance:** A single log line is enough to correlate a spike with a key/cause.

---

## Phase 7 — Mini Admin Page (Nice-to-Have)
- [ ] `/admin/observability` (auth-protected):
  - [ ] Cards: Hit ratio (5m), p95 latency, req/s, 429s, Redis mem/keys/evictions
  - [ ] Table: Top 20 hot keys (last 15m) with parsed fields
  - [ ] Button: `Bump CACHE_VERSION` (POST) (optional) — shows current version and last bump time
- **Acceptance:** You can tune TTLs or bump version with confidence during traffic.

---

## Phase 8 — Pre-Release Checks
- [ ] **Load Test** 50–100 VUs for 5–10 min on main catalogs; observe dashboard
- [ ] **Device Matrix** sanity checks (Windows, Android TV/Firestick, mobile)
- [ ] Confirm **no secrets** in logs or metrics; config hashes OK, tokens masked
- **Acceptance:** Stable p95 < 300ms, hit ratio > 60% on common routes, no memory creep.

---

## Optional Panels (Add when ready)
- [ ] **Per-Route Latency** breakdown (catalog vs search vs episodes)
- [ ] **Miss Reasons** (add tags in middleware if you classify: cold, expired, bypass, error)
- [ ] **SWR Refresh Duration** (timer around background rebuilds)

---

### Quick PromQL Snippets (copy/paste)
- **Hit Ratio (5m):**
  - `sum(rate(catalog_requests_total{cache="hit"}[5m])) / sum(rate(catalog_requests_total[5m]))`
- **Latency p95 (global):**
  - `histogram_quantile(0.95, sum(rate(catalog_latency_seconds_bucket[5m])) by (le))`
- **429s rate:**
  - `sum(rate(rate_limited_total[5m]))`
- **Stale %:**
  - `sum(rate(catalog_requests_total{cache="stale"}[5m])) / sum(rate(catalog_requests_total[5m]))`

---

✅ **Outcome:** A lightweight, copy-and-pasteable dashboard showing whether caching is working, how fast users feel it, where the traffic is going, and when you need to tweak TTLs — without storing any user credentials or sensitive data.
