# 📊 Ratings Wrapper - Monitoring Stack

This document describes how to use the Prometheus + Grafana monitoring stack to observe cache performance, request latency, and system health.

---

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Ratings wrapper application running on port 7000

### Start the Monitoring Stack

```bash
# Start Prometheus and Grafana
docker-compose -f docker-compose.monitoring.yml up -d

# View logs
docker-compose -f docker-compose.monitoring.yml logs -f

# Stop the stack
docker-compose -f docker-compose.monitoring.yml down
```

### Access the Services

- **Grafana Dashboard**: http://localhost:3000
  - Username: `admin`
  - Password: `admin`
  - Pre-configured dashboard: "Ratings Wrapper - Observability"

- **Prometheus UI**: http://localhost:9090
  - Raw metrics explorer and query interface

---

## 📈 Dashboard Panels

The "Ratings Wrapper - Observability" dashboard includes:

### 1. **Cache Hit Ratio (5m)**
- **Type**: Gauge
- **Query**: `sum(rate(catalog_requests_total{cache="hit"}[5m])) / sum(rate(catalog_requests_total[5m]))`
- **What it shows**: Percentage of requests served from cache
- **Good value**: > 70% (green)
- **Warning**: 50-70% (yellow)
- **Critical**: < 50% (red)

### 2. **Latency p95 & p50 (by route)**
- **Type**: Time series
- **Queries**:
  - p95: `histogram_quantile(0.95, sum(rate(catalog_latency_seconds_bucket[5m])) by (le, route))`
  - p50: `histogram_quantile(0.50, sum(rate(catalog_latency_seconds_bucket[5m])) by (le, route))`
- **What it shows**: 95th and 50th percentile response times by route
- **Good value**: p95 < 500ms

### 3. **Requests/sec**
- **Type**: Time series
- **Query**: `sum(rate(catalog_requests_total[1m]))`
- **What it shows**: Total request throughput

### 4. **Cache Performance (Hit vs Miss vs Stale)**
- **Type**: Stacked time series
- **Queries**:
  - Hits: `sum(rate(catalog_requests_total{cache="hit"}[5m])) by (route)`
  - Misses: `sum(rate(catalog_requests_total{cache="miss"}[5m])) by (route)`
  - Stale: `sum(rate(catalog_requests_total{cache="stale"}[5m])) by (route)`
- **What it shows**: Breakdown of cache behavior over time

### 5. **Rate Limiting (429s/sec by tier)**
- **Type**: Time series
- **Query**: `sum(rate(rate_limited_total[5m])) by (tier)`
- **What it shows**: Rate limit rejections by tier (anonymous vs authenticated)
- **Good value**: 0 or minimal spikes

### 6. **Redis Memory (MB)**
- **Type**: Gauge
- **Query**: `redis_memory_bytes / 1024 / 1024`
- **What it shows**: Current Redis memory usage
- **Thresholds**:
  - Green: < 1.7 GB
  - Yellow: 1.7-2 GB
  - Red: > 2 GB (approaching maxmemory limit)

### 7. **Redis Keys**
- **Type**: Time series
- **Query**: `redis_db0_keys`
- **What it shows**: Number of cached entries
- **Use case**: Monitor cache growth over time

### 8. **Redis Evictions (15m window)**
- **Type**: Time series
- **Query**: `increase(redis_evictions_total[15m])`
- **What it shows**: Number of keys evicted in last 15 minutes
- **Good value**: 0 or low (cache is sized correctly)
- **Warning**: > 1000 (may need to increase maxmemory)

---

## 🔍 Useful PromQL Queries

### Cache Hit Ratio (5m)
```promql
sum(rate(catalog_requests_total{cache="hit"}[5m])) / sum(rate(catalog_requests_total[5m]))
```

### Latency p95 (global)
```promql
histogram_quantile(0.95, sum(rate(catalog_latency_seconds_bucket[5m])) by (le))
```

### 429s Rate
```promql
sum(rate(rate_limited_total[5m]))
```

### Stale Serve Percentage
```promql
sum(rate(catalog_requests_total{cache="stale"}[5m])) / sum(rate(catalog_requests_total[5m]))
```

### Cache Hit vs Miss Breakdown
```promql
sum by(cache) (rate(catalog_requests_total[5m]))
```

---

## ⚙️ Configuration

### Prometheus Configuration
- **File**: `monitoring/prometheus.yml`
- **Scrape interval**: 10 seconds
- **Target**: `host.docker.internal:7000/metrics`
- **Retention**: 30 days

### Grafana Configuration
- **Datasource**: Automatically provisioned (Prometheus)
- **Dashboard**: Auto-loaded from `monitoring/grafana/dashboards/ratings-wrapper.json`
- **Refresh**: 10 seconds

---

## 🔧 Troubleshooting

### Prometheus Can't Reach Application

**Symptom**: "Target Down" in Prometheus UI (http://localhost:9090/targets)

**Solutions**:
1. Ensure application is running on port 7000
2. On Linux/Mac: Use `host.docker.internal` in prometheus.yml
3. On Windows: May need to use host IP instead
4. Test metrics endpoint: `curl http://localhost:7000/metrics`

### No Data in Grafana

**Solutions**:
1. Check Prometheus is scraping: http://localhost:9090/targets
2. Verify datasource: Grafana → Configuration → Data Sources
3. Check queries in panel edit mode
4. Generate traffic to application to create metrics

### Dashboard Not Loading

**Solutions**:
1. Check dashboard provisioning: `docker-compose logs grafana`
2. Manually import: Grafana → Dashboards → Import → Upload `monitoring/grafana/dashboards/ratings-wrapper.json`

---

## 📊 Monitoring Best Practices

### 1. **Cache Hit Ratio**
- **Target**: > 60% on common routes
- **Action if low**: Increase TTLs or check if keys are being invalidated

### 2. **Latency**
- **Target**: p95 < 300ms
- **Action if high**: Investigate slow upstream addons or rating API

### 3. **Redis Memory**
- **Target**: Stay under 85% of maxmemory
- **Action if high**: Increase maxmemory or reduce TTLs

### 4. **Evictions**
- **Target**: Minimal or zero
- **Action if high**: Redis memory is too small, increase maxmemory

### 5. **429s**
- **Target**: Zero or minimal
- **Action if high**: Legitimate traffic spike or potential abuse

---

## 🔄 Updating the Dashboard

To modify the dashboard:

1. Edit in Grafana UI
2. Save dashboard
3. Export JSON: Dashboard → Settings → JSON Model
4. Copy JSON to `monitoring/grafana/dashboards/ratings-wrapper.json`
5. Restart Grafana to test auto-provisioning

---

## 🐳 Docker Commands

```bash
# Start monitoring stack
docker-compose -f docker-compose.monitoring.yml up -d

# View logs
docker-compose -f docker-compose.monitoring.yml logs -f prometheus
docker-compose -f docker-compose.monitoring.yml logs -f grafana

# Restart services
docker-compose -f docker-compose.monitoring.yml restart

# Stop and remove containers (keeps data volumes)
docker-compose -f docker-compose.monitoring.yml down

# Stop and remove everything including data
docker-compose -f docker-compose.monitoring.yml down -v

# Check container status
docker-compose -f docker-compose.monitoring.yml ps
```

---

## 📁 File Structure

```
ratings-wrapper/
├── docker-compose.monitoring.yml    # Docker stack definition
├── monitoring/
│   ├── prometheus.yml               # Prometheus scrape config
│   └── grafana/
│       ├── provisioning/
│       │   ├── datasources/
│       │   │   └── prometheus.yml   # Auto-configure Prometheus datasource
│       │   └── dashboards/
│       │       └── default.yml      # Dashboard provisioning config
│       └── dashboards/
│           └── ratings-wrapper.json # Pre-built dashboard
```

---

## 📝 Structured Logging (Phase 6)

### Overview

The application supports structured JSON logging with privacy-preserving request tracking and automatic log rotation.

### Enable Structured Logging

Add to your `.env` file or Railway environment variables:

```bash
# Enable JSON structured logging
LOG_FORMAT=json

# Optional: Enable file logging with rotation
LOG_TO_FILE=true
LOG_DIR=./logs
MAX_LOG_SIZE_MB=100  # Default: 100MB
```

### Log Fields

Each request is logged as a single-line JSON with complete context:

```json
{
  "ts": "2025-10-25T02:30:45.123Z",
  "level": "info",
  "route": "catalog",
  "method": "GET",
  "cache": "hit",
  "status": 200,
  "latency_ms": 45,
  "key_digest": "a1b2c3d4",
  "type": "movie",
  "catalogId": "top",
  "page": "0",
  "search_len": 0,
  "user_scope": "_",
  "ip": "127.0.0.1"
}
```

### Privacy Features

- **Cache keys hashed**: SHA1 → first 8 chars only (`key_digest`)
- **User IDs masked**: Shows `user` or `_` (anonymous)
- **No PII logged**: No auth tokens, passwords, or credentials
- **Sanitized data**: User agents truncated to 50 chars

### Log Rotation

Logs automatically rotate based on:
- **Daily files**: `ratings-wrapper-2025-10-25.log`
- **Size-based**: When file exceeds `MAX_LOG_SIZE_MB` (default 100MB)
- **Rotated files**: Timestamped automatically (e.g., `ratings-wrapper-2025-10-25-14-30-15.log`)

### Log Aggregation

JSON format is ready for:
- **Elasticsearch + Kibana** (ELK stack)
- **Grafana Loki** (works with existing Grafana setup)
- **Splunk**
- **Datadog**
- **CloudWatch Logs Insights**

Example queries:
```javascript
// Find all slow requests (>500ms)
latency_ms > 500

// Find all cache misses
cache == "miss"

// Find all catalog requests
route == "catalog"

// Correlate spike with specific key
key_digest == "a1b2c3d4"
```

---

## 🚨 Alerting (Phase 5)

### Overview

Prometheus Alertmanager monitors metrics and sends notifications when issues are detected.

### Alert Rules Configured

9 actionable, low-noise alerts covering:

**Cache Health:**
- `LowCacheHitRatio` (warning): <50% hit ratio for 10m
- `CriticalCacheHitRatio` (critical): <30% hit ratio for 10m
- `HighStaleCacheServes` (warning): >40% stale serves for 15m

**Performance:**
- `HighLatency` (warning): p95 >500ms for 10m
- `CriticalLatency` (critical): p95 >1s for 5m

**Redis Health:**
- `HighRedisMemory` (warning): >85% of 2GB for 10m
- `HighRedisEvictions` (warning): >1000 evictions in 10m
- `RedisDown` (critical): Redis not responding for 2m

**Service Health:**
- `HealthCheckFailing` (critical): Service down for 1m
- `HighRateLimiting` (warning): >5 req/sec being rate limited

### Access Alertmanager

- **Alertmanager UI**: http://localhost:9093
- **Webhook endpoint**: `POST /api/webhook/alerts`

### View Active Alerts

- **Prometheus Alerts**: http://localhost:9090/alerts
- Shows: Inactive, Pending, Firing alerts with details

### Configure Notifications

Edit `monitoring/alertmanager.yml` to enable:

**Slack:**
```yaml
slack_configs:
  - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
    channel: '#alerts'
```

**Email:**
```yaml
email_configs:
  - to: 'alerts@yourdomain.com'
    from: 'prometheus@yourdomain.com'
    smarthost: 'smtp.gmail.com:587'
    auth_username: 'your-email@gmail.com'
    auth_password: 'your-app-password'
```

**Webhook** (currently active):
- Sends to `/api/webhook/alerts`
- Logs alerts to console/files
- Extensible for Slack, Discord, etc.

---

## 🎯 Next Steps

Completed phases:
- ✅ **Phase 1**: Metrics plumbing (MVP)
- ✅ **Phase 2**: Prometheus + Grafana stack
- ✅ **Phase 3**: Hot keys tracking (`/admin/hotkeys`)
- ✅ **Phase 4**: SWR & expiry visibility
- ✅ **Phase 5**: Alerting (Alertmanager)
- ✅ **Phase 6**: Structured JSON logging

Optional enhancements:
- **Phase 7**: Admin UI for live metrics
- **Phase 8**: Pre-release checks and load testing

---

✅ **Result**: Production-grade observability with metrics, alerts, and structured logging!
