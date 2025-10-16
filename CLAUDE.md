# Stremio Ratings Wrapper - Development Guide

## ⚠️ IMPORTANT: Deployment Information

**This project is connected to a Railway instance that automatically redeploys on every push to GitHub.**

- **Railway auto-deploys**: Every `git push` triggers a deployment
- **Service restarts**: Railway will restart the service with each push
- **Testing locally first**: Always test changes locally before pushing to avoid unnecessary deploys
- **Monitor Railway logs**: Check Railway dashboard for deployment status and runtime logs

---

## Project Overview

**Stremio Ratings Wrapper** is a production-ready Stremio addon service that wraps existing Stremio addons to inject IMDb ratings into catalog titles and episode listings. It provides a complete web UI for configuration, Stremio account integration, and automatic deployment capabilities.

### What It Does
- Wraps any Stremio addon that provides catalog or metadata
- Fetches IMDb ratings and injects them into catalog titles and episode listings
- Provides a configuration UI for customizing rating display
- Integrates with Stremio accounts to automatically replace addons
- Runs as a self-contained service with embedded ratings API

### Key Features
- URL-based configuration (no database required)
- Batch rating fetching with concurrency control
- Support for multiple ID formats (IMDb, Kitsu, MAL)
- Graceful error handling (never breaks the underlying addon)
- Smart addon detection and Cinemeta exclusion
- Emergency restore functionality

---

## Technology Stack

- **Runtime**: Node.js 18+ (CommonJS)
- **Framework**: Express.js 4.18.2
- **Core Library**: Stremio Addon SDK 1.6.10
- **HTTP Client**: Axios 1.6.0
- **Development**: Nodemon 3.0.1
- **Deployment**: Docker (18-bullseye-slim base image)
- **Package Manager**: NPM

---

## Architecture Summary

### Core Design Principles

1. **No Database**: All configuration encoded in addon URLs as base64url
2. **Modular Services**: Clear separation of concerns (config → services → handlers → routes)
3. **Embedded API**: Ratings API spawns as child process for self-contained deployment
4. **Graceful Degradation**: Rating fetch failures don't break catalog/meta endpoints
5. **Batch Processing**: Concurrent rating fetching with configurable concurrency

### Request Flow

```
User Request → Express Router → Config Parser → Addon Handler
                                                      ↓
                                              Addon Proxy Service
                                                      ↓
                                              Wrapped Addon API
                                                      ↓
                                              Metadata Enhancer
                                                      ↓
                                              Ratings Service → IMDb API
                                                      ↓
                                              Enhanced Response
```

---

## Directory Structure

```
ratings-wrapper/
├── src/
│   ├── index.js                    # Express server entry point
│   ├── config/
│   │   └── index.js               # Centralized configuration with env vars
│   ├── services/                  # Core business logic
│   │   ├── metadataEnhancer.js    # Injects ratings into catalog/episode metadata
│   │   ├── ratingsService.js      # Fetches IMDb ratings from internal API
│   │   ├── addonProxy.js          # Fetches data from wrapped addons (retry logic)
│   │   ├── stremioApi.js          # Manages Stremio account integration
│   │   └── kitsuMappingService.js # Maps anime IDs (Kitsu/MAL → IMDb)
│   ├── handlers/                  # Stremio addon handlers
│   │   ├── manifest.js            # Modifies addon manifest
│   │   ├── catalog.js             # Catalog endpoint with rating injection
│   │   └── meta.js                # Meta endpoint with episode ratings
│   ├── routes/
│   │   ├── addon.js               # Routes for wrapped addon endpoints
│   │   ├── api.js                 # Configuration UI & account management APIs
│   │   └── ratings.js             # Embedded ratings API routes
│   ├── middleware/
│   │   └── cors.js                # CORS headers for Stremio
│   ├── views/
│   │   ├── configure.js           # Main configuration UI (multi-addon)
│   │   └── configure-old.js       # Legacy single-addon UI
│   └── utils/
│       ├── configParser.js        # URL config encoding/decoding (base64url)
│       └── logger.js              # Configurable logging with levels
├── ratings-api/                   # Embedded IMDb ratings API
├── Dockerfile                     # Production Docker image
├── docker-compose.yml             # Local development setup
├── package.json                   # Dependencies and scripts
└── .env.example                   # Environment variable template
```

---

## Key Components

### Services Layer

#### `metadataEnhancer.js`
**Purpose**: Core logic for injecting ratings into metadata
**Key Functions**:
- `enhanceCatalogWithRatings()` - Injects ratings into catalog item titles/descriptions
- `enhanceMetaWithRatings()` - Injects ratings into title and episode listings
- `formatRating()` - Formats rating with custom template and positioning

**Rating Injection Points**:
- Catalog titles: Prefix/suffix in name or description
- Episode titles: Season:Episode format extraction from video objects
- Customizable templates: `"⭐ {rating}"` format with separators

#### `ratingsService.js`
**Purpose**: Fetches IMDb ratings from internal API
**Key Functions**:
- `getRatingsForItems()` - Batch fetches ratings with concurrency control (default: 10)
- `getRating()` - Single rating fetch with caching
- `extractImdbId()` - Extracts IMDb ID from various formats

**ID Handling**:
- Direct IMDb: `tt12345`
- Episode format: `tt12345:1:1`
- Kitsu anime: `kitsu:123`
- MAL anime: `mal:123`
- Automatic mapping for anime IDs

**Optimization**:
- Failed lookups cached to prevent redundant API calls
- Batch processing reduces API call overhead
- Configurable concurrency for rate limiting

#### `addonProxy.js`
**Purpose**: Fetches data from wrapped addons with retry logic
**Key Functions**:
- `fetchFromAddon()` - Makes HTTP requests with exponential backoff
- `fetchManifest()` - Specialized manifest fetching

**Features**:
- 3 retry attempts with exponential backoff
- Timeout handling
- Error logging and graceful degradation

#### `stremioApi.js`
**Purpose**: Manages Stremio account integration
**Key Functions**:
- `login()` - Authenticates with email/password
- `testAuth()` - Validates auth token
- `getUserAddons()` - Fetches user's installed addons
- `replaceAddon()` - Replaces single addon in user collection
- `emergencyRestore()` - Unwraps all wrapped addons

**Authentication Methods**:
1. Email/password login
2. Direct auth token (from localStorage)

#### `kitsuMappingService.js`
**Purpose**: Maps anime IDs to IMDb equivalents
**Key Functions**:
- `getImdbIdForKitsu()` - Kitsu ID → IMDb
- `getImdbIdForMal()` - MyAnimeList ID → IMDb

**External APIs**:
- Kitsu API for anime metadata
- AniList API for cross-reference mappings

### Handlers Layer

#### `manifest.js`
**Purpose**: Modifies wrapped addon manifest
**Key Modifications**:
- Adds `.ratings-wrapper` suffix to addon ID
- Updates addon name with config settings
- Preserves all original resources (catalog, meta, streams)

#### `catalog.js`
**Purpose**: Handles catalog requests with rating injection
**Flow**:
1. Parse config from URL
2. Proxy request to wrapped addon
3. Batch fetch ratings for all items
4. Inject ratings into titles/descriptions
5. Return enhanced catalog

#### `meta.js`
**Purpose**: Handles meta requests with episode ratings
**Flow**:
1. Parse config from URL
2. Proxy request to wrapped addon
3. Inject rating into main title
4. Extract episode IDs and fetch ratings
5. Inject ratings into episode titles
6. Return enhanced metadata

### Routes Layer

#### `addon.js`
**Addon Endpoints**:
- `GET /{config}/manifest.json` - Wrapped addon manifest
- `GET /{config}/catalog/:type/:id.json` - Enhanced catalog
- `GET /{config}/meta/:type/:id.json` - Enhanced metadata

#### `api.js`
**Configuration & Management Endpoints**:
- `GET /configure` - Main multi-addon configuration UI
- `GET /configure-old` - Legacy single-addon UI
- `POST /api/login` - Stremio authentication
- `POST /api/test-auth` - Validate auth token
- `POST /api/get-wrappable-addons` - Fetch user's installable addons
- `POST /api/replace-addon` - Replace single addon
- `POST /api/replace-addons` - Batch replace multiple addons
- `POST /api/emergency-restore` - Unwrap all and restore originals
- `POST /api/fetch-manifest` - Fetch manifest from URL for validation

#### `ratings.js`
**Embedded API Routes**: Proxies to embedded ratings API service

---

## Configuration System

### Environment Variables

```bash
# Server Configuration
PORT=7000                    # Main server port

# Logging
LOG_LEVEL=info              # debug | info | warn | error

# Ratings API
EMBED_RATINGS_API=true      # Start embedded API as child process
RATINGS_PORT=3001           # Embedded API port
RATINGS_API_URL=            # Override ratings API endpoint (optional)
```

### Addon Configuration Object

Encoded as base64url in addon URLs:

```javascript
{
  "wrappedAddonUrl": "https://v3-cinemeta.strem.io/manifest.json",
  "addonName": "Cinemeta with Ratings",
  "enableRatings": true,
  "enableTitleRatings": true,
  "enableEpisodeRatings": true,
  "ratingLocation": "title",        // or "description"
  "ratingFormat": {
    "position": "prefix",            // or "suffix"
    "template": "⭐ {rating}",
    "separator": " | "
  }
}
```

### URL Pattern

```
https://your-domain.com/{base64url-config}/manifest.json
```

Example:
```
https://your-domain.com/eyJ3cmFwcGVkQWRkb25VcmwiOiJodHRwczovL3YzLWNpbmVtZXRhLnN0cmVtLmlvL21hbmlmZXN0Lmpzb24ifQ/manifest.json
```

---

## Important Patterns & Conventions

### 1. Rating Injection Flow

```
Catalog/Meta Request
  → Parse Config
  → Fetch from Wrapped Addon
  → Extract IDs (imdb_id, id, video.id)
  → Batch Fetch Ratings (10 concurrent)
  → Format Ratings (template + position)
  → Inject into Titles/Descriptions
  → Return Enhanced Response
```

### 2. ID Extraction Priority

For catalog items:
1. `meta.imdb_id`
2. `meta.id` (if starts with `tt`)
3. `id` field
4. Parse from `meta.videos[0].id`

For episodes:
1. `video.id` in format `tt12345:1:1`
2. Fallback to main IMDb ID + season:episode

### 3. Smart Addon Detection

**Automatically Excludes Cinemeta When**:
- User has full metadata addons (AIO Metadata, MetaHub, etc.)
- Prevents duplicate catalogs

**Wrappability Check**:
- Fetches manifest
- Verifies `catalog` or `meta` resources exist
- Checks if already wrapped (`.ratings-wrapper` in ID)

### 4. Error Handling Strategy

**Never Break the Addon**:
- Rating fetch failures → log warning, continue without rating
- Wrapped addon errors → return error to Stremio (proper behavior)
- Malformed data → skip rating injection, return original data

**Logging Levels**:
- `error` - Critical failures (addon proxy errors)
- `warn` - Rating fetch failures, missing IDs
- `info` - Request logs, rating lookups
- `debug` - Detailed data dumps, config parsing

### 5. Batch Processing Pattern

```javascript
// Group items into batches of 10
const batches = [];
for (let i = 0; i < items.length; i += 10) {
  batches.push(items.slice(i, i + 10));
}

// Process batches sequentially, items within batch concurrently
for (const batch of batches) {
  await Promise.all(batch.map(item => processItem(item)));
}
```

### 6. Config Encoding/Decoding

```javascript
// Encoding
const config = { wrappedAddonUrl: "..." };
const encoded = base64url.encode(JSON.stringify(config));
const url = `/${encoded}/manifest.json`;

// Decoding (in request handler)
const encoded = req.params.config;
const config = JSON.parse(base64url.decode(encoded));
```

---

## API Endpoints Reference

### Addon Endpoints (Stremio)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/{config}/manifest.json` | Wrapped addon manifest |
| GET | `/{config}/catalog/:type/:id.json` | Enhanced catalog with ratings |
| GET | `/{config}/meta/:type/:id.json` | Enhanced metadata with episode ratings |

### Configuration UI

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Redirects to `/configure` |
| GET | `/configure` | Main multi-addon configuration UI |
| GET | `/configure-old` | Legacy single-addon UI |

### Account Management

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/login` | `{ email, password }` | Authenticate with Stremio |
| POST | `/api/test-auth` | `{ authToken }` | Validate auth token |
| POST | `/api/get-wrappable-addons` | `{ authToken, wrapperUrl }` | Get user's installable addons |
| POST | `/api/replace-addon` | `{ authToken, originalUrl, wrappedUrl }` | Replace single addon |
| POST | `/api/replace-addons` | `{ authToken, replacements[] }` | Batch replace addons |
| POST | `/api/emergency-restore` | `{ authToken, wrapperDomain }` | Unwrap all wrapped addons |

### Utility

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/fetch-manifest` | `{ addonUrl }` | Fetch and validate manifest |
| GET | `/health` | - | Health check endpoint |

---

## Common Development Tasks

### Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Start development server
npm run dev
```

### Testing

```bash
# Manual testing with curl
curl http://localhost:7000/health

# Test catalog endpoint
curl http://localhost:7000/{config}/catalog/movie/top.json

# Test manifest
curl http://localhost:7000/{config}/manifest.json
```

### Deployment

```bash
# Build Docker image
docker build -t ratings-wrapper .

# Run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f
```

### Debugging

**Enable Debug Logging**:
```bash
LOG_LEVEL=debug npm run dev
```

**Common Issues**:
1. **No ratings appearing**: Check `LOG_LEVEL=debug` for ID extraction logs
2. **Addon not wrapping**: Verify manifest has `catalog` or `meta` resources
3. **Authentication failing**: Test auth token with `/api/test-auth`
4. **Rate limiting**: Adjust concurrency in `ratingsService.js`

---

## Recent Development Context

### Latest Commits (as of Oct 2025)
- `6a560f2` - Clean up verbose debug logging
- `c2e0f5d` - Add debug logging for config values in catalog enhancement
- `796cbc4` - Fix movie/series title rating enhancement (use `imdb_id` field)
- `7813400` - Add detailed INFO-level logging for rating lookup diagnosis
- `f09b2a9` - Fix rating lookup mismatch for TMDB addon catalog items

### Recent Focus Areas
- Improving rating lookup reliability for TMDB addon
- Adding comprehensive logging for debugging
- Handling edge cases in ID extraction
- Supporting `imdb_id` field in catalog items

---

## Code Conventions

### File Organization
- **Services**: Business logic, no HTTP concerns
- **Handlers**: Stremio addon endpoint logic
- **Routes**: Express routing, HTTP layer
- **Utils**: Pure functions, no side effects

### Error Handling
```javascript
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  logger.error('Operation failed:', error.message);
  // Graceful degradation: return fallback or original data
  return fallbackData;
}
```

### Logging
```javascript
const logger = require('./utils/logger');

logger.debug('Detailed data:', { data });
logger.info('Operation completed');
logger.warn('Non-critical issue:', message);
logger.error('Critical failure:', error.message);
```

### Config Access
```javascript
const config = require('./config');

const port = config.port;
const logLevel = config.logLevel;
const ratingsApiUrl = config.ratingsApiUrl;
```

---

## Useful Snippets

### Creating a Test Config URL

```javascript
const configParser = require('./src/utils/configParser');

const config = {
  wrappedAddonUrl: 'https://v3-cinemeta.strem.io/manifest.json',
  addonName: 'Test Addon',
  enableRatings: true,
  enableTitleRatings: true,
  ratingLocation: 'title',
  ratingFormat: {
    position: 'prefix',
    template: '⭐ {rating}',
    separator: ' | '
  }
};

const encoded = configParser.encodeConfig(config);
console.log(`http://localhost:7000/${encoded}/manifest.json`);
```

### Testing Rating Fetch

```javascript
const ratingsService = require('./src/services/ratingsService');

const rating = await ratingsService.getRating('tt0111161');
console.log('Rating:', rating); // { imdbRating: '9.3', ... }
```

### Fetching from Wrapped Addon

```javascript
const addonProxy = require('./src/services/addonProxy');

const response = await addonProxy.fetchFromAddon(
  'https://v3-cinemeta.strem.io/catalog/movie/top.json'
);
console.log('Catalog:', response.metas);
```

---

## Architecture Decisions

### Why No Database?
- Simplifies deployment (stateless service)
- No migration or backup concerns
- Config versioning through URL changes
- Horizontal scaling without shared state

### Why Embedded Ratings API?
- Self-contained deployment (single Docker image)
- No external service dependencies
- Simplified local development
- Easy to replace with external API if needed

### Why Batch Processing?
- Reduces API call overhead
- Prevents rate limiting issues
- Improves response times for large catalogs
- Configurable concurrency for different APIs

### Why Smart Cinemeta Exclusion?
- Prevents duplicate catalogs in Stremio
- Users with full metadata addons don't need Cinemeta
- Reduces clutter in addon list
- Can be overridden in UI if desired

---

## External Dependencies

### Stremio APIs
- **Addon SDK**: Core addon protocol implementation
- **API v1**: User authentication and addon management
- **Cinemeta**: Default metadata addon for wrapping

### Third-Party APIs
- **IMDb Ratings API**: Internal ratings-api service
- **Kitsu API**: Anime metadata and mapping
- **AniList API**: Anime ID cross-references

### Known Limitations
- Rating API requires IMDb IDs (no TMDB direct support)
- Kitsu/MAL mapping may miss some anime titles
- Large catalogs (>100 items) may have slower response times
- Stremio API rate limiting on batch operations

---

## Future Enhancements (Potential)

1. **Caching Layer**: Redis for rating caching
2. **TMDB Direct Support**: Native TMDB rating injection
3. **Custom Rating Sources**: Support for other rating providers
4. **Advanced Templates**: Conditional formatting, multiple ratings
5. **Analytics**: Track most-wrapped addons, popular ratings
6. **Admin UI**: Service monitoring, cache management

---

## Quick Reference

### Important Files for Common Tasks

| Task | Files to Check |
|------|----------------|
| Rating not appearing | `metadataEnhancer.js`, `ratingsService.js` |
| Addon proxy issues | `addonProxy.js` |
| Config parsing errors | `configParser.js` |
| Authentication problems | `stremioApi.js`, `api.js` |
| ID mapping for anime | `kitsuMappingService.js` |
| Catalog enhancement | `catalog.js`, `metadataEnhancer.js` |
| Episode ratings | `meta.js`, `metadataEnhancer.js` |
| Logging issues | `logger.js`, `config/index.js` |

### Key Environment Variables by Use Case

**Development**:
```bash
PORT=7000
LOG_LEVEL=debug
EMBED_RATINGS_API=true
```

**Production**:
```bash
PORT=7000
LOG_LEVEL=warn
EMBED_RATINGS_API=true
RATINGS_API_URL=https://external-ratings-api.com
```

**Testing**:
```bash
PORT=7000
LOG_LEVEL=info
EMBED_RATINGS_API=false
RATINGS_API_URL=http://localhost:3001
```

---

## Contact & Resources

- **Repository**: Current working directory
- **Stremio Docs**: https://github.com/Stremio/stremio-addon-sdk
- **Docker Hub**: (if published)
- **Issues**: GitHub Issues (if public repo)

---

*This document is generated to help Claude Code quickly understand the codebase structure and functionality. It should be updated when significant architectural changes occur.*