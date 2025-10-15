# Stremio Ratings Wrapper

A production-ready Stremio addon service that wraps your existing addons to inject IMDb ratings into catalog titles and episode listings. Features a complete web UI for configuration, Stremio account integration, and automatic deployment.

## Features

- 🎯 **Multi-Addon Support**: Wrap multiple addons simultaneously (Cinemeta, AIO Metadata, custom addons, etc.)
- ⭐ **IMDb Ratings Integration**: Displays real IMDb ratings in catalog titles and episode names
- 🎨 **Flexible Rating Display**:
  - Choose between title or description injection
  - Prefix or suffix positioning
  - Customizable templates and separators
  - Separate controls for catalog titles vs. episodes
- 🔐 **Stremio Account Integration**:
  - Auto-discover your installed addons
  - One-click addon replacement via API
  - Emergency restore functionality
- 🎛️ **Web Configuration UI**:
  - Login with Stremio credentials or auth token
  - Visual addon selector with wrappability detection
  - Live preview of rating format
  - Generate install URLs or use auto-replace
- 🧠 **Smart Addon Detection**:
  - Automatically excludes Cinemeta when full metadata addon (AIO Metadata) is present
  - Prevents duplicate requests and processing
  - Ensures proper addon ordering (metadata addons at position 0)
- 📺 **Episode Support**:
  - IMDb ratings on individual episode titles
  - Works with Kitsu and MAL anime addons via ID mapping
  - Handles unreleased episodes gracefully
- 🔧 **URL-Based Config**: No database needed - all configuration encoded in addon URLs
- 🚀 **Production Ready**:
  - Configurable logging levels
  - Error handling and caching
  - Batch rating fetching with concurrency control
  - Railway deployment support

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
   - Grey checkmark = already wrapped
   - Red X = not wrappable
   - Select the addons you want to wrap

4. **Customize Rating Display**:
   - Enable/disable ratings for catalog titles vs. episodes
   - Choose injection location (title or description)
   - Set position (prefix or suffix)
   - Customize template and separator
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
  "enableTitleRatings": true,      // Catalog titles (movies/series)
  "enableEpisodeRatings": true,    // Episode titles
  "ratingLocation": "title",       // "title" or "description"
  "ratingFormat": {
    "position": "prefix",          // "prefix" or "suffix"
    "template": "⭐ {rating}",      // {rating} placeholder
    "separator": " | "             // Between rating and title
  }
}
```

### Configuration Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wrappedAddonUrl` | string | **Required** | URL of the addon to wrap |
| `addonName` | string | Auto-detected | Custom name for wrapped addon |
| `enableRatings` | boolean | `true` | Global rating toggle |
| `enableTitleRatings` | boolean | `true` | Show ratings on catalog titles |
| `enableEpisodeRatings` | boolean | `true` | Show ratings on episode titles |
| `ratingLocation` | string | `"title"` | Inject into "title" or "description" |
| `ratingFormat.position` | string | `"prefix"` | "prefix" or "suffix" |
| `ratingFormat.template` | string | `"⭐ {rating}"` | Template with `{rating}` placeholder |
| `ratingFormat.separator` | string | `" | "` | Separator between rating and title |

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
- `POST /api/emergency-restore` - Reset to Cinemeta-only
- `POST /api/fetch-manifest` - Fetch manifest from URL

### Utility
- `GET /` - Landing page
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

### Example 1: Prefix Ratings on Titles
```json
{
  "wrappedAddonUrl": "https://v3-cinemeta.strem.io/manifest.json",
  "enableTitleRatings": true,
  "enableEpisodeRatings": true,
  "ratingLocation": "title",
  "ratingFormat": {
    "position": "prefix",
    "template": "⭐ {rating}",
    "separator": " | "
  }
}
```
**Result**: `⭐ 8.5 | The Shawshank Redemption`

### Example 2: Suffix Ratings in Description
```json
{
  "wrappedAddonUrl": "https://v3-cinemeta.strem.io/manifest.json",
  "ratingLocation": "description",
  "ratingFormat": {
    "position": "suffix",
    "template": "[IMDb: {rating}/10]",
    "separator": " "
  }
}
```
**Result**: Description text with ` [IMDb: 8.5/10]` appended

### Example 3: Episode Ratings Only
```json
{
  "wrappedAddonUrl": "https://v3-cinemeta.strem.io/manifest.json",
  "enableTitleRatings": false,
  "enableEpisodeRatings": true,
  "ratingFormat": {
    "position": "prefix",
    "template": "★ {rating}",
    "separator": " "
  }
}
```
**Result**: Only episodes show ratings, catalog titles unchanged

### Example 4: Multiple Addons
Use the web UI to wrap multiple addons at once. The system will:
- Automatically place Cinemeta (or AIO Metadata) first
- Remove duplicates
- Handle addon ordering correctly

## Smart Features

### Automatic Cinemeta Handling

When you add a full metadata addon like **AIO Metadata**, **MetaHub**, or **Midnight Ignite**:
- Cinemeta is automatically excluded (prevents duplicate requests)
- The full metadata addon is positioned first (same as Cinemeta would be)
- A blue notice banner explains the change

### Anime Support

Automatically maps Kitsu and MyAnimeList IDs to IMDb:
- Detects `kitsu:12345` and `mal:12345` format IDs
- Uses built-in mapping for popular anime
- Preserves episode numbering

### Episode Rating Format

Episode ratings use the format: `tt12345:season:episode`
- Example: `tt0944947:1:1` (Game of Thrones S01E01)
- Works with Cinemeta, Kitsu, MAL, and TMDB addons
- Handles unreleased episodes gracefully (no errors logged)

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

### Adding a New Ratings Source

To integrate a different ratings API, modify `src/services/ratingsService.js`:

```javascript
async getRating(id, type) {
  const imdbId = extractImdbId(id);
  if (!imdbId) return null;

  // Replace with your API
  const response = await fetch(`https://your-api.com/rating/${imdbId}`);
  const data = await response.json();

  return data.rating; // Return numeric rating
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

## License

MIT

## Contributing

Contributions welcome! Please open an issue first to discuss proposed changes.

## Credits

Built with:
- [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk)
- [Express](https://expressjs.com/)
- [IMDb Ratings API](https://github.com/yourusername/imdb-ratings-api)
