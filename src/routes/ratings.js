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

module.exports = router;
