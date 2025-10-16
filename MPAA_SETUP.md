# MPAA Rating Integration Setup Guide

## Overview

This addon now supports fetching **MPAA/Content ratings** (like "PG-13", "R", "TV-MA") from The Movie Database (TMDB) API and injecting them into catalog descriptions alongside IMDb ratings.

## Features

- **Automatic TMDB Integration**: Fetches MPAA ratings on-demand when not in database
- **Database Caching**: Once fetched, ratings are stored permanently to minimize API calls
- **Movie & TV Support**:
  - Movies: G, PG, PG-13, R, NC-17, etc.
  - TV Shows: TV-Y, TV-G, TV-PG, TV-14, TV-MA, etc.
- **Graceful Fallback**: If MPAA data unavailable, ratings still display without MPAA
- **User Configurable**: Enable/disable via UI checkbox

## Setup Instructions

### Step 1: Get a TMDB API Key

1. Create a free TMDB account at https://www.themoviedb.org/signup
2. Go to Settings → API → https://www.themoviedb.org/settings/api
3. Request an API key (select "Developer" option)
4. Copy your API Read Access Token or API Key (v3 auth)

### Step 2: Configure Environment Variable

Add your TMDB API key to the environment:

#### For Local Development:
Create a `.env` file in the project root:

```bash
# .env
TMDB_API_KEY=your_api_key_here
```

#### For Railway Deployment:
1. Go to your Railway project dashboard
2. Navigate to Variables tab
3. Add new variable:
   - Key: `TMDB_API_KEY`
   - Value: your API key
4. Redeploy (automatic on Railway)

#### For Docker:
```bash
docker run -e TMDB_API_KEY=your_api_key_here ...
```

### Step 3: Enable MPAA Ratings in UI

1. Visit the configuration page: `http://localhost:7000/configure`
2. Select an addon to wrap
3. In the "Description" section, check **"Include MPAA rating"**
4. Configure other options as desired
5. Install the wrapped addon in Stremio

## Configuration Options

### UI Settings

| Option | Description | Example Output |
|--------|-------------|----------------|
| **Include MPAA rating** | Adds MPAA rating to description | "Rated PG-13" |
| **Include votes** | Adds vote count | "2.1M votes" |
| **Metadata separator** | Separator between metadata items | " • " (default) |

### Example Outputs

**With MPAA Enabled**:
```
8.5/10 • 2.1M votes • Rated PG-13

Two imprisoned men bond over a number of years...
```

**Without MPAA**:
```
8.5/10 • 2.1M votes

Two imprisoned men bond over a number of years...
```

## Testing

### Manual API Test

You can test the MPAA endpoint directly:

```bash
# Test with a movie (The Shawshank Redemption - PG-13)
curl http://localhost:3001/api/mpaa-rating/tt0111161

# Test with a TV show (Breaking Bad - TV-MA)
curl http://localhost:3001/api/mpaa-rating/tt0903747

# Test with another movie (The Dark Knight - PG-13)
curl http://localhost:3001/api/mpaa-rating/tt0468569
```

### Expected Response

```json
{
  "imdbId": "tt0111161",
  "mpaaRating": "R",
  "mpaa_rating": "R",
  "country": "US",
  "updatedAt": "2025-10-16T17:45:00.000Z",
  "updated_at": 1729101900000,
  "source": "tmdb"
}
```

### Check Server Logs

When the server starts, you should see:

```
🎬 TMDB Integration: ✅ ENABLED (MPAA ratings will be fetched from TMDB)
```

Or if not configured:

```
🎬 TMDB Integration: ❌ DISABLED (set TMDB_API_KEY to enable)
```

## How It Works

### Flow Diagram

```
User requests catalog
  ↓
Catalog item has IMDb ID (e.g., tt0111161)
  ↓
If MPAA enabled in config:
  ↓
Check ratings API: /api/mpaa-rating/tt0111161
  ↓
  ├─ Found in database? → Return cached rating
  │
  └─ Not in database?
      ↓
     Fetch from TMDB API
      ↓
      ├─ Find TMDB ID by IMDb ID
      ├─ Get certification/content rating
      ├─ Store in database for future requests
      └─ Return rating
```

### Database Storage

MPAA ratings are cached in the `mpaa_ratings` table:

```sql
CREATE TABLE mpaa_ratings (
  imdb_id TEXT PRIMARY KEY,
  mpaa_rating TEXT NOT NULL,
  country TEXT DEFAULT 'US',
  updated_at INTEGER NOT NULL
)
```

Once fetched, they're stored permanently and won't require additional API calls.

## API Rate Limits

- **TMDB Free Tier**: 50 requests per second
- **Caching Strategy**: First request fetches from TMDB, subsequent requests use database
- **Error Handling**: Rate limit errors (429) are caught and cached as null to prevent retries

## Troubleshooting

### MPAA ratings not appearing

1. **Check TMDB API key is set**:
   ```bash
   echo $TMDB_API_KEY
   ```

2. **Check server logs** for TMDB integration status

3. **Verify checkbox is enabled** in configure UI

4. **Test API endpoint directly** (see Testing section above)

5. **Check catalog item has IMDb ID**:
   - MPAA ratings require IMDb ID
   - Some addons may not provide IMDb IDs

### "TMDB Integration: DISABLED" message

- The `TMDB_API_KEY` environment variable is not set
- Set it and restart the server

### Getting 404 errors

- Some titles may not have MPAA ratings in TMDB database
- This is expected behavior - the system gracefully handles missing data
- Ratings will still display without MPAA

## Database Statistics

Check current MPAA rating cache size:

```bash
curl http://localhost:3001/api/stats/cache
```

Response:
```json
{
  "cache": { ... },
  "mappings": { ... },
  "mpaa": {
    "totalRatings": 42  // Number of cached MPAA ratings
  }
}
```

## Examples

### Configuration Object

```javascript
{
  "wrappedAddonUrl": "https://v3-cinemeta.strem.io/manifest.json",
  "addonName": "Cinemeta with Ratings",
  "enableRatings": true,
  "ratingLocation": "description",
  "descriptionFormat": {
    "position": "prefix",
    "template": "{rating}/10",
    "separator": "\n",
    "includeVotes": true,
    "includeMpaa": true,      // ← Enable MPAA ratings
    "metadataSeparator": " • "
  }
}
```

### Catalog Item Enhancement

**Before**:
```json
{
  "id": "tt0111161",
  "name": "The Shawshank Redemption",
  "description": "Two imprisoned men bond..."
}
```

**After** (with MPAA enabled):
```json
{
  "id": "tt0111161",
  "name": "The Shawshank Redemption",
  "description": "8.9/10 • 2.8M votes • Rated R\n\nTwo imprisoned men bond..."
}
```

## Production Deployment

### Railway

1. Add `TMDB_API_KEY` to Railway variables
2. Push to GitHub (auto-deploys)
3. Check logs for "✅ ENABLED" message

### Docker

```dockerfile
# In docker-compose.yml
environment:
  - TMDB_API_KEY=${TMDB_API_KEY}
```

```bash
# Run with env file
docker-compose --env-file .env up
```

## Future Enhancements

Potential improvements:

- [ ] Batch MPAA fetching for catalogs
- [ ] Support for other countries (currently US only)
- [ ] MPAA rating icons/emojis
- [ ] Configurable MPAA format template
- [ ] Episode-level ratings (for TV shows)

## Support

- **GitHub Issues**: Report issues at your repository
- **TMDB Documentation**: https://developers.themoviedb.org/3
- **Stremio Docs**: https://github.com/Stremio/stremio-addon-sdk

---

**Note**: MPAA ratings are provided by TMDB and may not be available for all titles. The system gracefully handles missing data and will continue to show IMDb ratings even if MPAA data is unavailable.
