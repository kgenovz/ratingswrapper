/**
 * Stremio Ratings Wrapper Addon
 * Main entry point - sets up Express server
 */

const express = require('express');
const { spawn } = require('child_process');
const logger = require('./utils/logger');
const kitsuMappingService = require('./services/kitsuMappingService');
const config = require('./config');
const corsMiddleware = require('./middleware/cors');
const ratingsRouter = require('./routes/ratings');
const apiRouter = require('./routes/api');
const addonRouter = require('./routes/addon');
const monitoringRouter = require('./routes/monitoring');
const adminRouter = require('./routes/admin');
const { initRedisClient } = require('./config/redis');

// Create Express app
const app = express();

// Trust proxy headers so req.protocol reflects X-Forwarded-Proto on Railway/Heroku
app.set('trust proxy', 1);

// Parse JSON bodies
app.use(express.json());

// Add CORS headers for all routes (required for Stremio to access the addon)
app.use(corsMiddleware);

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: config.defaults.version });
});

/**
 * Root endpoint - redirect to configuration
 */
app.get('/', (req, res) => {
  res.redirect('/configure');
});

/**
 * Mount route modules
 */
app.use('/', monitoringRouter);       // Monitoring routes (/metrics, /healthz)
app.use('/', adminRouter);            // Admin routes (/admin/hotkeys, /admin/stats)
app.use('/ratings', ratingsRouter);   // Internal ratings API routes
app.use('/api', apiRouter);           // API routes (auth, replace-addon, etc.)
app.use('/', apiRouter);              // Configuration pages (/configure, /configure-old)
app.use('/', addonRouter);            // Addon routes (manifest, catalog, meta)

/**
 * Start server
 */
const PORT = config.port;
const EMBED_RATINGS_API = String(process.env.EMBED_RATINGS_API || 'true').toLowerCase() === 'true';
const RATINGS_PORT = process.env.RATINGS_PORT || 3001;

app.listen(PORT, async () => {
  logger.info(`🚀 Stremio Ratings Wrapper running on port ${PORT}`);
  logger.info(`📝 Configuration helper: http://localhost:${PORT}/configure`);
  logger.info(`💚 Health check: http://localhost:${PORT}/health`);
  logger.info(`📊 Metrics endpoint: http://localhost:${PORT}/metrics`);
  logger.info(`🏥 Health check (detailed): http://localhost:${PORT}/healthz`);
  logger.info(`🔥 Hot keys tracking: http://localhost:${PORT}/admin/hotkeys`);

  // Initialize Redis client if enabled
  if (config.redis.enabled) {
    try {
      initRedisClient();
      logger.info(`🗄️  Redis caching enabled (version: ${config.redis.cacheVersion})`);
    } catch (error) {
      logger.warn('Failed to initialize Redis client:', error.message);
      logger.warn('Continuing without Redis caching (fail-open)');
    }
  } else {
    logger.info('Redis caching is disabled');
  }

  // Load Kitsu → IMDb mappings in background
  try {
    await kitsuMappingService.loadMappings();
  } catch (error) {
    logger.error('Failed to load Kitsu mappings (Kitsu addon support will be limited)');
  }

  if (EMBED_RATINGS_API) {
    try {
      logger.info(`Starting embedded ratings API on port ${RATINGS_PORT}...`);
      const ratingsApiPath = require('path').join(__dirname, '..', 'imdb-ratings-api', 'ratings-api-server.js');
      const child = spawn(process.execPath, [ratingsApiPath], {
        env: { ...process.env, PORT: String(RATINGS_PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      child.stdout.on('data', (d) => logger.info('[ratings-api]', d.toString().trim()));
      child.stderr.on('data', (d) => logger.error('[ratings-api]', d.toString().trim()));
      child.on('exit', (code) => logger.warn(`Embedded ratings API exited with code ${code}`));
    } catch (e) {
      logger.error('Failed to start embedded ratings API:', e.message);
    }
  }
});
