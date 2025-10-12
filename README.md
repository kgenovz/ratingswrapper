# Stremio Ratings Wrapper

A Stremio addon wrapper that injects IMDb ratings directly into catalog title metadata. Wraps any existing Stremio catalog addon and enhances it with ratings displayed in the title.

## Features

- ✨ **Transparent Wrapper**: Works with any Stremio catalog addon
- ⭐ **Rating Injection**: Displays IMDb ratings in catalog titles
- 🎨 **Configurable Format**: Customize rating display (prefix/suffix, custom templates)
- 🔧 **URL-Based Config**: No database needed - configuration encoded in URL
- 📦 **Placeholder Ratings**: Built-in placeholder system (easily replaceable with your ratings API)
- 🏗️ **Proper Architecture**: Separation of concerns, service layer, extensible design

## Architecture

```
src/
├── config/              # Application configuration
├── services/            # Business logic
│   ├── addonProxy.js    # Fetches data from wrapped addons
│   ├── ratingsService.js # Ratings fetching (placeholder → your API)
│   └── metadataEnhancer.js # Injects ratings into metadata
├── handlers/            # Stremio addon handlers
│   ├── manifest.js      # Manifest endpoint
│   └── catalog.js       # Catalog endpoint
├── utils/               # Utilities
│   ├── configParser.js  # URL config encoding/decoding
│   └── logger.js        # Logging
└── index.js             # Main entry point
```

## Installation

1. Clone and install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Usage

### Quick Start (Web UI)

1. Start the server:
```bash
npm start
```

2. Open your browser and go to:
```
http://localhost:7000/configure
```

3. Paste your addon URL into the form (e.g., `https://my-addon.com/manifest.json`)

4. (Optional) Customize the addon name and rating format

5. Click **Generate Addon URL**

6. Click **Install in Stremio** or copy the generated URL

That's it! Your addon is now wrapped with ratings.

### Advanced Usage (Manual Configuration)

If you prefer to manually create configuration URLs:

1. Create a configuration object:
```json
{
  "wrappedAddonUrl": "https://your-addon.com/manifest.json",
  "addonName": "My Addon with Ratings",
  "enableRatings": true,
  "ratingFormat": {
    "position": "prefix",
    "template": "⭐ {rating}",
    "separator": " "
  }
}
```

2. Encode to base64url:
```javascript
const config = { /* your config */ };
const encoded = Buffer.from(JSON.stringify(config)).toString('base64url');
```

3. Your addon URL:
```
http://localhost:7000/{encoded}/manifest.json
```

## Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `wrappedAddonUrl` | string | ✅ | - | Base URL of the addon to wrap |
| `addonName` | string | ❌ | "Ratings Wrapper" | Custom name for wrapped addon |
| `enableRatings` | boolean | ❌ | `true` | Enable/disable rating injection |
| `ratingFormat.position` | string | ❌ | `"prefix"` | "prefix" or "suffix" |
| `ratingFormat.template` | string | ❌ | `"⭐ {rating}"` | Template with `{rating}` placeholder |
| `ratingFormat.separator` | string | ❌ | `" "` | Separator between rating and title |

## Examples

### Example 1: Prefix Ratings
```json
{
  "wrappedAddonUrl": "https://addon.example.com/manifest.json",
  "ratingFormat": {
    "position": "prefix",
    "template": "⭐ {rating}"
  }
}
```
Result: `⭐ 8.5 The Shawshank Redemption`

### Example 2: Suffix Ratings with Custom Format
```json
{
  "wrappedAddonUrl": "https://addon.example.com/manifest.json",
  "ratingFormat": {
    "position": "suffix",
    "template": "[{rating}/10]",
    "separator": " "
  }
}
```
Result: `The Shawshank Redemption [8.5/10]`

### Example 3: Minimal Config
```json
{
  "wrappedAddonUrl": "https://addon.example.com/manifest.json"
}
```
Uses all defaults.

## Integrating Your Ratings Addon

The placeholder ratings in `src/services/ratingsService.js` can be easily replaced with your actual ratings API:

1. Update the `getRating()` method to call your ratings addon
2. Implement batch fetching in `getRatingsBatch()` for better performance
3. Add caching if needed

Example integration:
```javascript
async getRating(id, type) {
  const imdbId = extractImdbId(id);
  if (!imdbId) return null;

  // Replace with your ratings API call
  const response = await axios.get(`https://your-ratings-api.com/rating/${imdbId}`);
  return response.data.rating;
}
```

## API Endpoints

- `GET /` - Configuration helper page
- `GET /configure` - Configuration instructions
- `GET /health` - Health check
- `GET /:config/manifest.json` - Addon manifest
- `GET /:config/catalog/:type/:id.json` - Catalog endpoint

## Environment Variables

- `PORT` - Server port (default: 7000)
- `LOG_LEVEL` - Logging level: debug, info, warn, error (default: info)

## Development

The project follows best practices:
- **Separation of Concerns**: Clear layers (config, services, handlers, utils)
- **Single Responsibility**: Each module has one clear purpose
- **Dependency Injection**: Easy to swap ratings sources
- **Extensibility**: Simple to add features (caching, meta endpoint, etc.)

## Future Enhancements

- [ ] Meta endpoint wrapping (inject ratings into full meta objects)
- [ ] Caching layer for ratings and proxied data
- [ ] Support for multiple wrapped addons simultaneously
- [ ] Admin UI for configuration
- [ ] Custom rating providers/sources

## License

MIT
