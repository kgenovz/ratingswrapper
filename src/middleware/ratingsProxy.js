/**
 * Ratings Proxy Middleware
 * Handles proxying/placeholder logic for internal ratings API
 */

const axios = require('axios');

const RATINGS_PROVIDER_URL = process.env.RATINGS_PROVIDER_URL || null;
const RATINGS_PLACEHOLDER = String(process.env.RATINGS_PLACEHOLDER || '').toLowerCase() === 'true';
const OMDB_API_KEY = process.env.OMDB_API_KEY || null;
const EMBED_RATINGS_API = String(process.env.EMBED_RATINGS_API || 'true').toLowerCase() === 'true';
const RATINGS_PORT = process.env.RATINGS_PORT || 3001;

/**
 * Proxy request to ratings provider or return placeholder
 * @param {Response} res - Express response object
 * @param {string} providerUrl - URL path to proxy to
 * @param {Array} pathSegments - URL segments for fallback (unused but kept for compatibility)
 * @param {Object} placeholderValue - Placeholder value to return if no provider
 */
async function proxyOrPlaceholder(res, providerUrl, pathSegments, placeholderValue) {
  try {
    const providerBase = RATINGS_PROVIDER_URL || (EMBED_RATINGS_API ? `http://127.0.0.1:${RATINGS_PORT}` : null);

    if (providerBase) {
      const url = `${providerBase}${providerUrl}`;
      const response = await axios.get(url, { timeout: 8000 });
      return res.json(response.data);
    }

    // Internal provider via OMDb
    if (OMDB_API_KEY) {
      if (providerUrl.startsWith('/api/rating/')) {
        const imdbId = providerUrl.split('/').pop();
        const { data } = await axios.get('https://www.omdbapi.com/', {
          params: { i: imdbId, apikey: OMDB_API_KEY },
          timeout: 8000
        });
        if (data && data.imdbRating && data.imdbRating !== 'N/A') {
          return res.json({ rating: parseFloat(data.imdbRating) });
        }
        return res.status(404).json({ error: 'Rating not found' });
      }

      if (providerUrl.startsWith('/api/episode/')) {
        const parts = providerUrl.split('/');
        const seriesId = parts[3];
        const season = parts[4];
        const episode = parts[5];
        const { data } = await axios.get('https://www.omdbapi.com/', {
          params: { i: seriesId, Season: season, apikey: OMDB_API_KEY },
          timeout: 8000
        });
        if (data && Array.isArray(data.Episodes)) {
          const ep = data.Episodes.find(e => String(e.Episode) === String(episode));
          if (ep && ep.imdbRating && ep.imdbRating !== 'N/A') {
            return res.json({
              rating: parseFloat(ep.imdbRating),
              episodeId: `${seriesId}:${season}:${episode}`
            });
          }
        }
        return res.status(404).json({ error: 'Episode rating not found' });
      }
    }

    if (RATINGS_PLACEHOLDER) {
      return res.json(placeholderValue);
    }

    return res.status(404).json({ error: 'No ratings provider configured' });
  } catch (e) {
    return res.status(502).json({ error: 'Ratings provider unavailable', detail: e.message });
  }
}

module.exports = { proxyOrPlaceholder };
