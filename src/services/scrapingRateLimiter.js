/**
 * Scraping Rate Limiter
 * Prevents excessive requests to RT/MC that could trigger rate limiting
 *
 * Strategy:
 * - Max 1 request per second per source
 * - Max 3 concurrent requests per source
 * - Queue requests if limits exceeded
 * - Random delays (1-3 sec) between requests to appear human
 */

const logger = require('../utils/logger');

class ScrapingRateLimiter {
    constructor() {
        // Rate limiting config per source
        this.limits = {
            'rottentomatoes': {
                maxConcurrent: 3,
                minDelayMs: 1000,  // 1 second between requests
                maxDelayMs: 3000,  // Up to 3 seconds (random)
                lastRequestTime: 0,
                activeRequests: 0,
                queue: []
            },
            'metacritic': {
                maxConcurrent: 3,
                minDelayMs: 1000,
                maxDelayMs: 3000,
                lastRequestTime: 0,
                activeRequests: 0,
                queue: []
            }
        };

        this.maxQueueSize = 50; // Fail fast if queue gets too large
    }

    /**
     * Get random delay in milliseconds
     * @param {number} min - Minimum delay
     * @param {number} max - Maximum delay
     * @returns {number} Random delay
     */
    getRandomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Wait for rate limit to pass
     * @param {string} source - Source name (rottentomatoes or metacritic)
     * @returns {Promise<void>}
     */
    async waitForRateLimit(source) {
        const limit = this.limits[source];
        const now = Date.now();
        const timeSinceLastRequest = now - limit.lastRequestTime;

        // Calculate required delay
        const requiredDelay = this.getRandomDelay(limit.minDelayMs, limit.maxDelayMs);

        if (timeSinceLastRequest < requiredDelay) {
            const waitTime = requiredDelay - timeSinceLastRequest;
            logger.debug(`[RATE-LIMITER] ${source}: Waiting ${waitTime}ms before next request`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        limit.lastRequestTime = Date.now();
    }

    /**
     * Execute a scraping function with rate limiting
     * @param {string} source - Source name (rottentomatoes or metacritic)
     * @param {Function} fn - Async function to execute
     * @returns {Promise<any>} Result from function
     */
    async execute(source, fn) {
        if (!this.limits[source]) {
            throw new Error(`Unknown scraping source: ${source}`);
        }

        const limit = this.limits[source];

        // Check queue size
        if (limit.queue.length >= this.maxQueueSize) {
            logger.error(`[RATE-LIMITER] ${source}: Queue full (${this.maxQueueSize}), rejecting request`);
            throw new Error(`Rate limiter queue full for ${source}`);
        }

        // Wait if at concurrent limit
        while (limit.activeRequests >= limit.maxConcurrent) {
            logger.debug(`[RATE-LIMITER] ${source}: At concurrent limit (${limit.activeRequests}/${limit.maxConcurrent}), waiting...`);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Increment active requests
        limit.activeRequests++;
        logger.debug(`[RATE-LIMITER] ${source}: Active requests: ${limit.activeRequests}/${limit.maxConcurrent}`);

        try {
            // Wait for rate limit
            await this.waitForRateLimit(source);

            // Execute the scraping function
            const result = await fn();

            return result;

        } finally {
            // Decrement active requests
            limit.activeRequests--;
            logger.debug(`[RATE-LIMITER] ${source}: Request completed. Active: ${limit.activeRequests}/${limit.maxConcurrent}`);
        }
    }

    /**
     * Get rate limiter stats for monitoring
     * @returns {Object} Stats object
     */
    getStats() {
        const stats = {};

        for (const [source, limit] of Object.entries(this.limits)) {
            stats[source] = {
                activeRequests: limit.activeRequests,
                maxConcurrent: limit.maxConcurrent,
                queueSize: limit.queue.length,
                maxQueueSize: this.maxQueueSize,
                minDelayMs: limit.minDelayMs,
                maxDelayMs: limit.maxDelayMs,
                lastRequestTime: limit.lastRequestTime
            };
        }

        return stats;
    }
}

// Singleton instance
const rateLimiter = new ScrapingRateLimiter();

module.exports = rateLimiter;
