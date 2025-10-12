/**
 * Centralized configuration management
 * All application-wide settings and defaults
 */

const config = {
  // Server configuration
  port: process.env.PORT || 7000,

  // Default addon settings
  defaults: {
    addonName: 'Ratings Wrapper',
    addonDescription: 'Wraps Stremio addons to inject IMDb ratings into catalog titles',
    version: '1.0.0',

    // Rating display format
    ratingFormat: {
      position: 'prefix', // 'prefix' | 'suffix'
      template: '⭐ {rating}', // {rating} will be replaced with actual rating
      separator: ' | ' // separator between rating and title
    },

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
    timeout: 10000, // 10 seconds
    retries: 3
  },

  // Logging
  logging: {
    enabled: true,
    level: process.env.LOG_LEVEL || 'info' // 'debug' | 'info' | 'warn' | 'error'
  }
};

module.exports = config;
