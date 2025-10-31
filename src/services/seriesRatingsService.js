/**
 * Series Ratings Service
 * Main integration layer for RT/MC scraping with 2-tier caching
 *
 * Cache Strategy:
 * Layer 1: Redis (fast, 24h TTL)
 * Layer 2: SQLite (persistent, 7d TTL for found data, 24h for not-found)
 * Layer 3: Web scraping (slow, rate limited)
 */

const axios = require('axios');
const logger = require('../utils/logger');
const redisService = require('./redisService');
const cacheKeys = require('../utils/cacheKeys');
const rateLimiter = require('./scrapingRateLimiter');
const { scrapeRottenTomatoes } = require('./rottenTomatoesScraper');
const { scrapeMetacritic } = require('./metacriticScraper');
const config = require('../config');

// TTL constants (in seconds)
const CACHE_TTL = {
    REDIS: 24 * 60 * 60,           // 24 hours in Redis
    FOUND: 7 * 24 * 60 * 60,       // 7 days for found data (SQLite)
    NOT_FOUND: 24 * 60 * 60,       // 24 hours for 404s (SQLite)
    ERROR: 60 * 60                 // 1 hour for scrape errors (SQLite)
};

class SeriesRatingsService {
    constructor() {
        this.ratingsApiUrl = config.ratingsApiUrl || 'http://localhost:3001';
    }

    /**
     * Get series ratings with 2-tier caching
     *
     * @param {string} imdbId - IMDb ID (e.g., "tt0903747")
     * @param {string} title - Series title
     * @param {string} year - Release year (optional)
     * @param {boolean} forceRefresh - Skip cache and re-scrape
     * @returns {Promise<Object|null>} Ratings object or null
     */
    async getSeriesRatings(imdbId, title, year = null, forceRefresh = false) {
        if (!imdbId || !title) {
            logger.warn('[SERIES-RATINGS] Missing imdbId or title');
            return null;
        }

        logger.debug(`[SERIES-RATINGS] Request for ${imdbId} "${title}" (${year || 'no year'}) forceRefresh=${forceRefresh}`);

        // Layer 1: Check Redis cache (unless forcing refresh)
        if (!forceRefresh && config.redis.enabled) {
            const version = config.redis.cacheVersion || '1';
            const cacheKey = `v${version}:series-ratings:${imdbId}`;
            const cached = await redisService.get(cacheKey);

            if (cached) {
                logger.info(`[SERIES-RATINGS] Redis cache HIT for ${imdbId}`);
                return cached;
            }
            logger.debug(`[SERIES-RATINGS] Redis cache MISS for ${imdbId}`);
        }

        // Layer 2: Check SQLite database (unless forcing refresh)
        if (!forceRefresh) {
            const dbRecord = await this.getFromDatabase(imdbId);

            if (dbRecord && dbRecord.isValid) {
                logger.info(`[SERIES-RATINGS] SQLite cache HIT for ${imdbId} (expires: ${new Date(dbRecord.cache_until).toISOString()})`);

                // Populate Redis cache
                if (config.redis.enabled) {
                    await this.cacheInRedis(imdbId, dbRecord);
                }

                return dbRecord;
            }

            if (dbRecord) {
                logger.debug(`[SERIES-RATINGS] SQLite cache EXPIRED for ${imdbId}`);
            } else {
                logger.debug(`[SERIES-RATINGS] SQLite cache MISS for ${imdbId}`);
            }
        }

        // Layer 3: Scrape from web
        logger.info(`[SERIES-RATINGS] Scraping for ${imdbId} "${title}"`);
        const scraped = await this.scrapeRatings(imdbId, title, year);

        // Store in both cache layers
        await this.saveToDatabase(imdbId, title, scraped);

        if (config.redis.enabled) {
            await this.cacheInRedis(imdbId, scraped);
        }

        return scraped;
    }

    /**
     * Get record from SQLite database
     * @param {string} imdbId - IMDb ID
     * @returns {Promise<Object|null>} Database record or null
     */
    async getFromDatabase(imdbId) {
        try {
            const response = await axios.get(`${this.ratingsApiUrl}/api/series-ratings/${imdbId}`, {
                timeout: 5000,
                validateStatus: (status) => status === 200 || status === 404
            });

            if (response.status === 404) {
                return null;
            }

            const data = response.data;
            const now = Date.now();

            // Check if cache is still valid
            if (data.cache_until && data.cache_until > now) {
                return {
                    ...data,
                    isValid: true
                };
            }

            // Cache expired
            return {
                ...data,
                isValid: false
            };

        } catch (error) {
            logger.error(`[SERIES-RATINGS] Error fetching from database: ${error.message}`);
            return null;
        }
    }

    /**
     * Scrape RT and MC ratings
     * @param {string} imdbId - IMDb ID
     * @param {string} title - Series title
     * @param {string} year - Release year
     * @returns {Promise<Object>} Scraped ratings
     */
    async scrapeRatings(imdbId, title, year) {
        const result = {
            imdbId,
            title,
            rtCriticsScore: null,
            rtAudienceScore: null,
            rtUrl: null,
            mcMetascore: null,
            mcUserScore: null,
            mcUrl: null,
            scrapeAttemptedAt: Date.now(),
            scrapeSucceededAt: null,
            scrapeFailedCount: 0
        };

        // Scrape Rotten Tomatoes (with rate limiting)
        try {
            const rtData = await rateLimiter.execute('rottentomatoes', async () => {
                return await scrapeRottenTomatoes(title, year);
            });

            if (rtData) {
                result.rtCriticsScore = rtData.criticsScore;
                result.rtAudienceScore = rtData.audienceScore;
                result.rtUrl = rtData.url;
                logger.info(`[SERIES-RATINGS] ✓ RT scraped: ${imdbId} → Critics=${rtData.criticsScore}%, Audience=${rtData.audienceScore}%`);
            } else {
                logger.info(`[SERIES-RATINGS] ✗ RT not found: ${imdbId}`);
            }
        } catch (error) {
            logger.error(`[SERIES-RATINGS] RT scrape failed for ${imdbId}: ${error.message}`);
            result.scrapeFailedCount++;
        }

        // Scrape Metacritic (with rate limiting)
        try {
            const mcData = await rateLimiter.execute('metacritic', async () => {
                return await scrapeMetacritic(title, year);
            });

            if (mcData) {
                result.mcMetascore = mcData.metascore;
                result.mcUserScore = mcData.userScore;
                result.mcUrl = mcData.url;
                logger.info(`[SERIES-RATINGS] ✓ MC scraped: ${imdbId} → Metascore=${mcData.metascore}, User=${mcData.userScore ? (mcData.userScore / 10).toFixed(1) : null}`);
            } else {
                logger.info(`[SERIES-RATINGS] ✗ MC not found: ${imdbId}`);
            }
        } catch (error) {
            logger.error(`[SERIES-RATINGS] MC scrape failed for ${imdbId}: ${error.message}`);
            result.scrapeFailedCount++;
        }

        // Mark as succeeded if we got any data
        if (result.rtCriticsScore || result.rtAudienceScore || result.mcMetascore || result.mcUserScore) {
            result.scrapeSucceededAt = Date.now();
        }

        return result;
    }

    /**
     * Save scraped ratings to SQLite database
     * @param {string} imdbId - IMDb ID
     * @param {string} title - Series title
     * @param {Object} data - Scraped ratings data
     * @returns {Promise<void>}
     */
    async saveToDatabase(imdbId, title, data) {
        try {
            // Calculate cache_until based on success/failure
            let cacheDuration;
            if (data.scrapeSucceededAt) {
                cacheDuration = CACHE_TTL.FOUND * 1000; // 7 days
            } else if (data.scrapeFailedCount > 0) {
                cacheDuration = CACHE_TTL.ERROR * 1000; // 1 hour
            } else {
                cacheDuration = CACHE_TTL.NOT_FOUND * 1000; // 24 hours
            }

            const payload = {
                imdbId,
                title,
                rtCriticsScore: data.rtCriticsScore,
                rtAudienceScore: data.rtAudienceScore,
                rtUrl: data.rtUrl,
                mcMetascore: data.mcMetascore,
                mcUserScore: data.mcUserScore,
                mcUrl: data.mcUrl,
                scrapeAttemptedAt: data.scrapeAttemptedAt,
                scrapeSucceededAt: data.scrapeSucceededAt,
                scrapeFailedCount: data.scrapeFailedCount,
                cacheUntil: Date.now() + cacheDuration
            };

            await axios.post(`${this.ratingsApiUrl}/api/series-ratings`, payload, {
                timeout: 5000
            });

            logger.info(`[SERIES-RATINGS] ✓ Saved to SQLite database: ${imdbId} (cache until: ${new Date(payload.cacheUntil).toISOString()})`);

        } catch (error) {
            logger.error(`[SERIES-RATINGS] Error saving to database: ${error.message}`);
        }
    }

    /**
     * Cache ratings in Redis
     * @param {string} imdbId - IMDb ID
     * @param {Object} data - Ratings data
     * @returns {Promise<void>}
     */
    async cacheInRedis(imdbId, data) {
        try {
            const version = config.redis.cacheVersion || '1';
            const cacheKey = `v${version}:series-ratings:${imdbId}`;
            await redisService.set(cacheKey, data, CACHE_TTL.REDIS);
            logger.info(`[SERIES-RATINGS] ✓ Cached in Redis: ${imdbId} (TTL: ${CACHE_TTL.REDIS}s)`);
        } catch (error) {
            logger.warn(`[SERIES-RATINGS] Redis cache write failed: ${error.message}`);
        }
    }

    /**
     * Clear cache for a specific series (force refresh)
     * @param {string} imdbId - IMDb ID
     * @returns {Promise<void>}
     */
    async clearCache(imdbId) {
        logger.info(`[SERIES-RATINGS] Clearing cache for ${imdbId}`);

        // Clear Redis
        if (config.redis.enabled) {
            const version = config.redis.cacheVersion || '1';
            const cacheKey = `v${version}:series-ratings:${imdbId}`;
            await redisService.del(cacheKey);
        }

        // Clear SQLite (by setting cache_until to 0)
        try {
            await axios.delete(`${this.ratingsApiUrl}/api/series-ratings/${imdbId}`, {
                timeout: 5000
            });
        } catch (error) {
            logger.warn(`[SERIES-RATINGS] Error clearing database cache: ${error.message}`);
        }
    }

    /**
     * Get service statistics
     * @returns {Promise<Object>} Statistics object
     */
    async getStats() {
        try {
            const response = await axios.get(`${this.ratingsApiUrl}/api/series-ratings/stats`, {
                timeout: 5000
            });

            return response.data;
        } catch (error) {
            logger.error(`[SERIES-RATINGS] Error fetching stats: ${error.message}`);
            return {
                totalEntries: 0,
                withRtScores: 0,
                withMcScores: 0,
                error: error.message
            };
        }
    }
}

// Singleton instance
const seriesRatingsService = new SeriesRatingsService();

module.exports = seriesRatingsService;
