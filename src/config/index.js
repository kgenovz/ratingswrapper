/**
 * Centralized configuration management
 * All application-wide settings and defaults
 */

const config = {
  // Server configuration
  port: process.env.PORT || 7000,

  // External API keys
  tmdbApiKey: process.env.TMDB_API_KEY || null,
  omdbApiKey: process.env.OMDB_API_KEY || null,

  // Ratings API configuration
  ratingsApiUrl: process.env.RATINGS_API_URL || 'http://localhost:3001',

  // Default addon settings
  defaults: {
    addonName: 'Ratings Wrapper',
    addonDescription: 'Wraps Stremio addons to inject IMDb ratings into catalog titles',
    version: '1.0.0',

    // Rating injection settings
    enableRatings: true, // Global enable/disable
    enableTitleRatings: true, // Enable ratings on catalog titles (movies/series)
    enableEpisodeRatings: true, // Enable ratings on episode titles

    // Rating display format
    ratingFormat: {
      position: 'prefix', // 'prefix' | 'suffix'
      template: '⭐ {rating}', // {rating} will be replaced with actual rating
      separator: ' | ' // separator between rating and title
    },

    // Rating injection location
    ratingLocation: 'title', // 'title' | 'description' - where to inject ratings

    // Metadata provider for episode data (when wrapped addon doesn't provide meta)
    metadataProvider: 'cinemeta' // 'cinemeta' | 'tmdb' | 'none'
  },

  // Metadata provider URLs
  metadataProviders: {
    cinemeta: 'https://v3-cinemeta.strem.io',
    // TMDB will be added later
    tmdb: null
  },

  // Addon proxy settings
  proxy: {
    timeout: 20000, // 20 seconds (increased for slow TMDB addons)
    retries: 3
  },

  // Logging
  logging: {
    enabled: true,
    level: process.env.LOG_LEVEL || 'info' // 'debug' | 'info' | 'warn' | 'error'
  },

  // Redis configuration
  redis: {
    url: process.env.REDIS_URL || null,
    enabled: !!process.env.REDIS_URL,
    cacheVersion: process.env.CACHE_VERSION || '1',
    // TTL settings (in seconds)
    ttl: {
      catalog: {
        popular: 6 * 60 * 60,      // 6 hours for popular/trending/top
        search: 1 * 60 * 60,        // 1 hour for search results
        userSpecific: 30 * 60,      // 30 minutes for user-specific catalogs
        default: 6 * 60 * 60        // 6 hours default
      },
      meta: 24 * 60 * 60,           // 24 hours for meta (episodes/seasons)
      manifest: 24 * 60 * 60        // 24 hours for manifest
    }
  },

  // Rate limiting configuration (Phase 2)
  rateLimit: {
    enabled: !!process.env.REDIS_URL, // Rate limiting requires Redis
    // Anonymous users (identified by IP)
    anonymous: {
      requestsPerSecond: parseInt(process.env.RATE_LIMIT_ANONYMOUS_RPS || '5', 10),
      burst: parseInt(process.env.RATE_LIMIT_ANONYMOUS_BURST || '10', 10)
    },
    // Authenticated users (identified by userId in config)
    authenticated: {
      requestsPerSecond: parseInt(process.env.RATE_LIMIT_AUTHENTICATED_RPS || '10', 10),
      burst: parseInt(process.env.RATE_LIMIT_AUTHENTICATED_BURST || '20', 10)
    },
    // Search routes (stricter limits)
    search: {
      anonymous: {
        requestsPerSecond: parseInt(process.env.RATE_LIMIT_SEARCH_ANONYMOUS_RPS || '2', 10),
        burst: parseInt(process.env.RATE_LIMIT_SEARCH_ANONYMOUS_BURST || '5', 10)
      },
      authenticated: {
        requestsPerSecond: parseInt(process.env.RATE_LIMIT_SEARCH_AUTHENTICATED_RPS || '5', 10),
        burst: parseInt(process.env.RATE_LIMIT_SEARCH_AUTHENTICATED_BURST || '10', 10)
      }
    }
  }
};

module.exports = config;
