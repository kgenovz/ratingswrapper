# 🧩 Ratings Wrapper — Redis Caching Layer Implementation Plan

> **Note**: Login credentials are **never stored** — they're discarded immediately after the one-time auth-key exchange.

## 🏗️ Architecture Overview

This plan implements a **two-tier caching strategy**:

1. **SQLite (Data Layer)** - Already implemented in `ratings-api`
   - Stores IMDb ratings (~millions of titles)
   - Episode mappings (series → season → episode → IMDb ID)
   - TMDB metadata cache (1-2 week TTL)
   - Kitsu/MAL anime ID mappings
   - API response cache (1 hour TTL)
   - **Purpose**: Long-lived data that changes infrequently

2. **Redis (Response Layer)** - To be implemented
   - Caches fully enriched catalog/meta JSON responses
   - Shorter TTLs (1-24 hours depending on content type)
   - Gzip compression for efficient storage
   - **Purpose**: Fast response delivery, reduce computation overhead

**Key Principle**: Redis won't duplicate SQLite's work. SQLite caches raw data (ratings, mappings), while Redis caches enriched responses (catalogs with ratings already injected).

---

## Phase 0 — Prep
- [ ] Finalize **cache-key structure**:
  - **Catalog**: `v{CACHE_VERSION}:catalog:{configHash}:{type}:{catalogId}:{page?}:{search?}:{genre?}:{userId?}`
  - **Meta**: `v{CACHE_VERSION}:meta:{configHash}:{type}:{id}`
  - **Manifest**: `v{CACHE_VERSION}:manifest:{configHash}`
  - **Note**: `{configHash}` = hash of entire config object (not just addon URL)
- [ ] Mark **user-specific addons** (e.g. mdblist, user collections) to include `userId` in key.
  Detection: Check config or addon manifest `behaviorHints.configurable`.
- [ ] Choose **TTLs**
  - Popular/Trending/Top → 6 h
  - Search → 1 h
  - Meta (episodes/seasons) → 24 h
  - Manifest → 24 h
  - User-specific → 30–60 m

---

## Phase 1 — Redis Page Cache
- [ ] Add **Redis** (ioredis) + env vars (`REDIS_URL`, `CACHE_VERSION`).
- [ ] Implement **catalog-cache middleware**:
  → `GET` Redis → if miss → build catalog + `SETEX`.
- [ ] Implement **meta-cache middleware** (similar to catalog).
- [ ] Implement **manifest-cache middleware** (24h TTL).
- [ ] Add **singleflight guard** per key (prevent stampedes).
- [ ] **Gzip** JSON before storing, gunzip on read.
- [ ] Prefix keys with **`CACHE_VERSION`** → bump daily after IMDb refresh.
- [ ] **Fail-open**: on error, return original catalog unwrapped.
- [ ] Skip Redis for `/ratings/*` endpoints (already cached in SQLite).
- [ ] Add `X-Ratings-Cache` header (`hit|miss|stale|bypass`) + log latency & key.
  - ✅ *Done when:* >60 % hit rate and noticeably faster catalogs.

---

## Phase 2 — Safety & Fairness
- [ ] **Rate-limit** per IP (5 r/s, burst 10); stricter for search routes.
- [ ] **Quota tiers**:
  - Anonymous users: 5 req/s (relies on shared Redis cache)
  - Auto-install users: 10 req/s (gets user-scoped cache keys via `userId`)
- [ ] Rate limits should account for both Redis cache hits and SQLite cache hits.
- [ ] **Auth safety**: use Stremio token only; discard credentials post-exchange (✅ already true).

---

## Phase 3 — Stale-While-Revalidate (SWR)
- [ ] Serve **stale cache** immediately on expiry, refresh in background.
- [ ] Tag served stales → `X-Ratings: stale-serve`.
  - ✅ *Done when:* users never wait on cache rebuilds; origin QPS stable.

---

## Phase 4 — UX / Adoption
- [ ] Default **“Auto-Install”** CTA → manual install in accordion.
- [ ] Generate **signed user-scoped wrapper URLs** (uses `configHash`) for fair rate-limits.

---

## Phase 5 — Capacity & Observability
- [ ] Set Redis `maxmemory 2gb`, `maxmemory-policy allkeys-lru`; disable AOF/RDB.
- [ ] Add **metrics endpoint** (`/metrics`) → Prometheus / Grafana:
  - Redis: cache hits/misses, latency, mem/keys/evictions
  - SQLite: database size, cache hit rate (from ratings-api)
  - Two-tier analysis: Redis hits vs SQLite hits vs full misses
  - Rate limits: 429s per tier (anonymous vs auto-install)
- [ ] Add `/healthz` check:
  - Redis ping (connection test)
  - SQLite SELECT 1 (database accessibility)
  - Ratings-api health check
- [ ] Create simple Grafana panels:
  - Hit ratio (Redis + SQLite breakdown)
  - p95 latency (by endpoint type: catalog/meta/manifest)
  - Requests/sec (total + per tier)
  - Redis usage & evictions
  - SQLite database size trends

---

## Phase 6 — Edge Layer (Later)
- [ ] Put **Cloudflare** in front of GET routes.
  Enable Brotli + "cache everything" + respect origin TTLs.
  - **Note**: Railway provides built-in CDN - evaluate if Cloudflare is needed.
- [ ] Add `Cache-Control`:
  `public, s-maxage=21600, max-age=60, stale-while-revalidate=3600, stale-if-error=3600`

---

## Optional Enhancements
- [ ] **Precompute hotspots** (popular/trending pages) every 6 h.
- [ ] Tiny `/admin/observability` page with live Redis stats + top keys.
- [ ] **Mirror domain** toggle for instant failover.

---

✅ Result: faster catalogs, minimal DB load, transparent monitoring, and fully safe auth handling.
