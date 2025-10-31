/**
 * Internal Ratings API Routes
 * Proxies to external provider if RATINGS_PROVIDER_URL is set
 * Optional placeholder with RATINGS_PLACEHOLDER=true
 *
 * Wrapper defaults RATINGS_API_URL to point to these endpoints.
 */

const express = require('express');
const { proxyOrPlaceholder } = require('../middleware/ratingsProxy');

const router = express.Router();

/**
 * Single title rating by IMDb ID
 */
router.get('/api/rating/:imdbId', async (req, res) => {
  const { imdbId } = req.params;
  await proxyOrPlaceholder(
    res,
    `/api/rating/${encodeURIComponent(imdbId)}`,
    [imdbId],
    { rating: 8.5 }
  );
});

/**
 * Episode rating by seriesId/season/episode
 */
router.get('/api/episode/:seriesId/:season/:episode', async (req, res) => {
  const { seriesId, season, episode } = req.params;
  await proxyOrPlaceholder(
    res,
    `/api/episode/${encodeURIComponent(seriesId)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`,
    [seriesId, season, episode],
    { rating: 8.3, episodeId: `${seriesId}:${season}:${episode}` }
  );
});

/**
 * MPAA rating by IMDb ID
 */
router.get('/api/mpaa-rating/:imdbId', async (req, res) => {
  const { imdbId } = req.params;
  await proxyOrPlaceholder(
    res,
    `/api/mpaa-rating/${encodeURIComponent(imdbId)}`,
    [imdbId],
    { mpaaRating: 'PG-13', mpaa_rating: 'PG-13' }
  );
});

/**
 * Admin endpoints - direct pass through to embedded ratings-api
 */
router.post('/api/admin/rebuild-database', async (req, res) => {
  const axios = require('axios');
  const EMBED_RATINGS_API = String(process.env.EMBED_RATINGS_API || 'true').toLowerCase() === 'true';
  const RATINGS_PORT = process.env.RATINGS_PORT || 3001;

  try {
    if (EMBED_RATINGS_API) {
      const url = `http://127.0.0.1:${RATINGS_PORT}/api/admin/rebuild-database`;
      const response = await axios.post(url, {}, { timeout: 10000 });
      return res.json(response.data);
    }
    return res.status(503).json({ error: 'Embedded ratings API not enabled' });
  } catch (error) {
    return res.status(502).json({
      error: 'Failed to contact ratings API',
      detail: error.message
    });
  }
});

module.exports = router;
