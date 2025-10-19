# Stremio Ratings Wrapper

A production-ready Stremio addon service that wraps your existing addons to inject IMDb ratings into catalog titles and episode listings. Features a complete web UI for configuration, Stremio account integration, and automatic deployment.

## Features

- 🎯 **Multi-Addon Support**: Wrap multiple addons simultaneously (Cinemeta, AIO Metadata, custom addons, etc.)
- ⭐ **IMDb Ratings Integration**: Displays real IMDb ratings in catalog titles and episode names
- 🎨 **Flexible Rating Display**:
  - Choose between title or description injection (or both!)
  - Prefix or suffix positioning
  - Customizable templates and separators
  - Separate format controls for title vs. description
  - Granular control for catalog items vs. episodes
- 📊 **Extended Metadata** (Description only):
  - Vote count (1.2M votes, full format, or both)
  - MPAA rating (PG-13, R, TV-MA, etc.)
  - TMDB rating (8.5 TMDB or 8.5/10 TMDB)
  - Release date (year, short date, or full date)
  - Rotten Tomatoes score (83% RT)
  - Metacritic score (68 MC or 68/100 MC)
  - Streaming services (Netflix, Hulu, Disney+) - region-specific
  - **Fully customizable ordering** - drag to reorder all metadata including IMDb rating
- 🔐 **Stremio Account Integration**:
  - Auto-discover your installed addons
  - One-click addon replacement via API
  - Emergency restore functionality
  - Re-wrap already-wrapped addons to change settings
- 🎛️ **Web Configuration UI**:
  - Login with Stremio credentials or auth token
  - Visual addon selector with wrappability detection
  - Live preview of rating format
  - Generate install URLs or use auto-replace
- 🧠 **Smart Addon Detection**:
  - Automatically excludes Cinemeta when full metadata addon (AIO Metadata) is present
  - Blocks stream-only addons (Torrentio, MediaFusion, Comet, etc.)
  - Prevents duplicate requests and processing
  - Ensures proper addon ordering (metadata addons at position 0)
- 📺 **Episode Support**:
  - IMDb ratings on individual episode titles
  - Works with Kitsu and MAL anime addons via ID mapping
  - Split-cour anime support (Re:Zero S2P2, Attack on Titan S3P2, etc.)
  - Handles unreleased episodes gracefully
- 🔄 **Re-wrapping Support**:
  - Already-wrapped addons are auto-selected for easy reconfiguration
  - Change rating settings without manual unwrapping
  - Visual distinction (amber border) for wrapped addons
- 🔧 **URL-Based Config**: No database needed - all configuration encoded in addon URLs
- 🚀 **Production Ready**:
  - Configurable logging levels
  - Error handling and caching
  - Batch rating fetching with concurrency control
  - Railway deployment support
  - Auto-converts `stremio://` URLs to `https://`

## Quick Start

### 1. Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/your-template)

Or manually:
```bash
git clone https://github.com/yourusername/ratings-wrapper.git
cd ratings-wrapper
npm install
```

### 2. Configure on Railway

Set these environment variables in Railway:

**Required:**
- `EMBED_RATINGS_API` = `true` (starts the embedded IMDb ratings API)

**Optional:**
- `PORT` = `7000` (server port, Railway sets this automatically)
- `RATINGS_PORT` = `3001` (port for embedded ratings API)
- `LOG_LEVEL` = `error` (reduce log verbosity in production)
  - Use `error` or `warn` for production (less verbose)
  - Switch to `info` or `debug` when troubleshooting

### 3. Use the Web Interface

1. Navigate to your deployed URL: `https://your-app.railway.app/configure`

2. **Login to Stremio** (at the top):
   - Enter email/password OR paste your auth token
   - Click "Login & Fetch Addons"
   - See all your installed addons with wrappability indicators

3. **Select Addons to Wrap**:
   - Green checkmark = wrappable (has catalog/meta resources)
   - Amber/orange border = already wrapped (auto-selected for re-wrapping)
   - Red X = not wrappable or blocked (stream-only addons)
   - Select the addons you want to wrap

4. **Customize Rating Display**:
   - Enable ratings in title and/or description
   - Enable for catalog items and/or episodes separately
   - Choose injection location (title, description, or both)
   - Set position (prefix or suffix) for each location
   - Customize template and separator for each location
   - Add extended metadata (votes, MPAA, TMDB, RT, MC, streaming, etc.)
   - **Drag to reorder** all metadata elements including IMDb rating
   - See live preview

5. **Generate & Deploy**:
   - Click "Generate Install URLs & Enable Auto-Replace"
   - Use **Auto-Replace** to update your Stremio account instantly
   - Or manually copy/install the generated URLs

## Architecture

```
src/
├── config/                      # Application configuration
│   └── index.js                 # Centralized config with defaults
├── data/                        # Static data files
│   └── split-cour-mappings.json # Anime split-cour episode mappings
├── services/                    # Business logic
│   ├── addonProxy.js            # Fetches data from wrapped addons
│   ├── ratingsService.js        # Fetches IMDb ratings from API
│   ├── metadataEnhancer.js      # Injects ratings into metadata
│   ├── stremioApi.js            # Stremio account management
│   └── kitsuMappingService.js   # Anime ID mapping (Kitsu/MAL → IMDb)
├── handlers/                    # Stremio addon handlers
│   ├── manifest.js              # Manifest endpoint
│   ├── catalog.js               # Catalog endpoint with rating injection
│   └── meta.js                  # Meta endpoint with episode ratings
├── routes/                      # HTTP routes
│   └── api.js                   # Configuration & account management APIs
├── middleware/                  # Express middleware
│   └── requestLogger.js         # Request logging
├── views/                       # HTML views
│   ├── configure.js             # Main configuration UI
│   └── configure-old.js         # Legacy single-addon UI
├── utils/                       # Utilities
│   ├── configParser.js          # URL config encoding/decoding
│   └── logger.js                # Configurable logging
└── index.js                     # Express server entry point
```

## Configuration Options

### URL-Encoded Config Format

Each wrapped addon has a base64url-encoded configuration in its URL:

```
https://your-app.railway.app/{base64url-config}/manifest.json
```

### Configuration Object

```javascript
{
  "wrappedAddonUrl": "https://v3-cinemeta.strem.io/manifest.json",
  "addonName": "Cinemeta with Ratings",
  "enableRatings": true,           // Global enable/disable
  "ratingLocation": "both",        // "title", "description", or "both"

  // Title-specific format
  "titleFormat": {
    "position": "prefix",          // "prefix" or "suffix"
    "template": "⭐ {rating}",      // {rating} placeholder
    "separator": " | ",            // Between rating and title
    "enableCatalogItems": true,    // Show on catalog items
    "enableEpisodes": true         // Show on episode titles
  },

  // Description-specific format
  "descriptionFormat": {
    "position": "prefix",          // "prefix" or "suffix"
    "template": "{rating}/10",     // {rating} placeholder
    "separator": "\n",             // Between metadata and description
    "metadataSeparator": " • ",    // Between metadata parts
    "enableCatalogItems": true,    // Show on catalog items
    "enableEpisodes": true,        // Show on episodes

    // Extended metadata options
    "includeVotes": true,
    "voteCountFormat": "short",    // "short", "full", or "both"
    "includeMpaa": true,
    "includeTmdbRating": true,
    "tmdbRatingFormat": "decimal", // "decimal" or "outof10"
    "includeReleaseDate": true,
    "releaseDateFormat": "short",  // "year", "short", or "full"
    "includeRottenTomatoes": true,
    "includeMetacritic": true,
    "metacriticFormat": "score",   // "score" or "outof100"
    "includeStreamingServices": true,
    "streamingRegion": "US",       // 2-letter ISO country code

    // Metadata ordering (drag to reorder in UI)
    "metadataOrder": ["imdbRating", "votes", "mpaa", "tmdb", "releaseDate", "streamingServices", "rottenTomatoes", "metacritic"]
  }
}
```

## API Endpoints

### Addon Endpoints
- `GET /{config}/manifest.json` - Wrapped addon manifest
- `GET /{config}/catalog/:type/:id.json` - Catalog with ratings
- `GET /{config}/meta/:type/:id.json` - Meta with episode ratings

### Configuration & Management
- `GET /configure` - Main configuration UI
- `GET /configure-old` - Legacy single-addon UI
- `POST /api/login` - Login with Stremio credentials
- `POST /api/test-auth` - Test auth token validity
- `POST /api/get-wrappable-addons` - Get user's wrappable addons
- `POST /api/replace-addon` - Replace single addon in account
- `POST /api/replace-addons` - Batch replace multiple addons
- `POST /api/emergency-restore` - Unwrap all and restore originals
- `POST /api/fetch-manifest` - Fetch manifest from URL

### Utility
- `GET /` - Landing page (redirects to /configure)
- `GET /health` - Health check

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `7000` | Server port |
| `LOG_LEVEL` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `EMBED_RATINGS_API` | `true` | Start embedded IMDb ratings API server |
| `RATINGS_PORT` | `3001` | Port for embedded ratings API (when `EMBED_RATINGS_API=true`) |
| `RATINGS_API_URL` | `http://127.0.0.1:{PORT}/ratings` | IMDb ratings API endpoint (override if using external API) |

### Log Level Guide

- **Production**: Use `error` or `warn` to reduce log verbosity
- **Debugging**: Switch to `info` or `debug` for detailed logs
- **Development**: Use `info` for balanced visibility

To change log level on Railway:
1. Go to your project settings
2. Add/update `LOG_LEVEL` environment variable
3. Set to `error`, `warn`, `info`, or `debug`
4. Redeploy (or wait for auto-deploy)

## Examples

### Example 1: Title Only with Prefix
```json
{
  "wrappedAddonUrl": "https://v3-cinemeta.strem.io/manifest.json",
  "ratingLocation": "title",
  "titleFormat": {
    "position": "prefix",
    "template": "⭐ {rating}",
    "separator": " | "
  }
}
```
**Result**: `⭐ 8.5 | The Shawshank Redemption`

### Example 2: Description with Extended Metadata
```json
{
  "wrappedAddonUrl": "https://v3-cinemeta.strem.io/manifest.json",
  "ratingLocation": "description",
  "descriptionFormat": {
    "position": "prefix",
    "template": "{rating}/10 IMDb",
    "separator": "\n",
    "metadataSeparator": " • ",
    "includeVotes": true,
    "includeMpaa": true,
    "includeRottenTomatoes": true,
    "includeMetacritic": true,
    "metadataOrder": ["imdbRating", "votes", "mpaa", "rottenTomatoes", "metacritic"]
  }
}
```
**Result**:
```
8.5/10 IMDb • 2.8M votes • R • 91% RT • 82 MC
An epic tale of adventure and discovery...
```

### Example 3: Both Title and Description
```json
{
  "wrappedAddonUrl": "https://v3-cinemeta.strem.io/manifest.json",
  "ratingLocation": "both",
  "titleFormat": {
    "position": "prefix",
    "template": "⭐ {rating}",
    "separator": " "
  },
  "descriptionFormat": {
    "position": "prefix",
    "template": "{rating}/10",
    "separator": "\n",
    "includeMpaa": true,
    "includeReleaseDate": true
  }
}
```
**Result**:
- Title: `⭐ 8.5 The Shawshank Redemption`
- Description: `8.5/10 • R • 1994` followed by description text

### Example 4: Re-wrapping Existing Addon
When you see an already-wrapped addon (amber border):
1. It's automatically selected
2. Adjust any settings you want to change
3. Click "Generate URLs & Auto-Replace"
4. The system extracts the original URL and re-wraps with new settings

## Smart Features

### Automatic Cinemeta Handling

When you add a full metadata addon like **AIO Metadata**, **MetaHub**, or **Midnight Ignite**:
- Cinemeta is automatically excluded (prevents duplicate requests)
- The full metadata addon is positioned first (same as Cinemeta would be)
- A blue notice banner explains the change

### Stream Addon Blocking

Stream-only addons are automatically blocked from wrapping:
- Torrentio, MediaFusion, Comet, Jackettio, Sootio, NuvioStreams, Torbox
- These addons only provide streaming links, not catalog/metadata
- Wrapping them would cause unnecessary overhead
- Shows clear "Stream-only addon (not wrappable)" message

### Anime Support

Automatically maps Kitsu and MyAnimeList IDs to IMDb:
- Detects `kitsu:12345` and `mal:12345` format IDs
- Uses anime-lists database for accurate mapping
- Preserves episode numbering
- **Split-cour support**: Handles anime split into parts
  - Re:Zero Season 2 Part 2 (episodes map to S2E14-25)
  - Attack on Titan Season 3 Part 2 (episodes map to S3E13-22)
  - Attack on Titan Final Season Part 2 (episodes map to S4E17-28)

### Episode Rating Format

Episode ratings use the format: `tt12345:season:episode`
- Example: `tt0944947:1:1` (Game of Thrones S01E01)
- Works with Cinemeta, Kitsu, MAL, and TMDB addons
- Handles unreleased episodes gracefully (no errors logged)

### URL Protocol Conversion

Automatically converts `stremio://` deeplink URLs to `https://`:
- Works in both manual input and account-fetched addons
- Transparent to users
- Ensures proper API communication

## Development

### Local Setup
```bash
npm install
npm run dev  # Auto-reload on changes
```

### Code Style
- **Separation of Concerns**: Clear layers (config → services → handlers → routes)
- **Single Responsibility**: Each module has one clear purpose
- **Error Handling**: Graceful degradation, never breaks the addon
- **Logging**: Contextual logging with configurable levels
- **Caching**: Not-found cache to avoid redundant API calls

### Adding Split-Cour Anime Mappings

Edit `src/data/split-cour-mappings.json`:

```json
{
  "mappings": {
    "kitsu:43247": {
      "title": "Re:Zero Season 2 Part 2",
      "imdb_id": "tt5607976",
      "imdb_season": 2,
      "part": 2,
      "episode_offset": 13,
      "notes": "Part 1 has episodes 1-13, Part 2 has episodes 1-12 (mapped to IMDb 14-25)"
    }
  }
}
```

## Troubleshooting

### Logs Too Verbose?
Set `LOG_LEVEL=error` on Railway to only see errors.

### Need to Debug?
1. Change `LOG_LEVEL=info` or `LOG_LEVEL=debug` on Railway
2. Check logs in Railway dashboard
3. Switch back to `error` when done

### Addon Not Working?
1. Check the addon has `catalog` or `meta` resources
2. Verify the wrapped addon URL is accessible
3. Check Railway logs for errors
4. Use Emergency Restore if Stremio is broken

### Duplicate Requests?
Make sure you're not wrapping both Cinemeta and AIO Metadata - the system should auto-detect and exclude Cinemeta.

### Anime Episodes Wrong Season/Offset?
For split-cour anime, add mappings to `src/data/split-cour-mappings.json`. See the file for examples.

## License

MIT

## Contributing

Contributions welcome! Please open an issue first to discuss proposed changes.

## Credits

Built with:
- [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk)
- [Express](https://expressjs.com/)
- [anime-lists](https://github.com/Fribb/anime-lists) - Anime ID mappings

### Platform Notes: Separator Display

- **Android Mobile/TV**: Line breaks work correctly (CRLF/LF)
- **Desktop/Web**: Many views collapse line breaks; use visible separators (Bullet •, Pipe |) for consistent display
- The UI preview shows multi-line format, but actual Stremio client rendering may vary by platform
