/**
 * Metacritic Web Scraper
 * Scrapes Metacritic ratings for TV series (movies use OMDB)
 *
 * WARNING: This scrapes public Metacritic pages. Use responsibly with rate limiting.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

const PROVIDER_NAME = 'Metacritic';
const BASE_URL = 'https://www.metacritic.com';
const TIMEOUT = 15000; // 15 seconds

// Rotating user agents
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

/**
 * Format title into Metacritic URL slug
 * @param {string} title - Series title
 * @returns {string} URL-safe slug
 */
function formatSlug(title) {
    if (!title) return '';

    return title.toLowerCase()
        .replace(/[:_]/g, '-')           // Convert : and _ to hyphens
        .replace(/['']/g, '')            // Remove apostrophes
        .replace(/\s+/g, '-')            // Spaces to hyphens
        .replace(/[^a-z0-9-]/g, '')      // Remove non-alphanumeric except hyphen
        .replace(/-+/g, '-')             // Multiple hyphens to single
        .replace(/^-|-$/g, '');          // Trim leading/trailing hyphens
}

/**
 * Build candidate URLs to try
 * Metacritic uses /tv/{slug} format
 *
 * @param {string} title - Series title
 * @param {string} year - Release year
 * @returns {string[]} Array of URLs to try
 */
function buildCandidateUrls(title, year) {
    const slug = formatSlug(title);
    const urls = [];

    // Try without year first (MC doesn't usually include year in URL)
    urls.push(`${BASE_URL}/tv/${slug}`);

    // Try with year if available
    if (year) {
        urls.push(`${BASE_URL}/tv/${slug}-${year}`);
    }

    // Try with "the" prefix removed (common variation)
    if (slug.startsWith('the-')) {
        const slugWithoutThe = slug.substring(4);
        urls.push(`${BASE_URL}/tv/${slugWithoutThe}`);
    }

    logger.debug(`[${PROVIDER_NAME}] Built ${urls.length} candidate URLs for "${title}"`);
    return urls;
}

/**
 * Parse Metacritic scores from page
 * @param {CheerioStatic} $ - Cheerio instance
 * @returns {Object|null} Scores or null
 */
function scrapeScores($) {
    let metascore = null;
    let userScore = null;

    // Try multiple selectors for Metascore (critic score)
    const metascoreSelectors = [
        '.c-siteReviewScore_background-critic_medium span',  // New layout
        '.c-productScoreInfo_scoreNumber span',               // Alternative
        'div[class*="metascore"] span',                      // Generic
        'a[class*="c-productScoreInfo"] span'                // Link version
    ];

    for (const selector of metascoreSelectors) {
        const text = $(selector).first().text().trim();
        if (/^\d+$/.test(text)) {
            metascore = parseInt(text, 10);
            if (metascore >= 0 && metascore <= 100) {
                break;
            } else {
                metascore = null;
            }
        }
    }

    // Try multiple selectors for User Score
    const userScoreSelectors = [
        '.c-siteReviewScore_background-user span',         // New layout
        'div[class*="userscore"] span',                   // Generic
        'div[data-v-4cdca868] span'                       // Vue component
    ];

    for (const selector of userScoreSelectors) {
        const text = $(selector).first().text().trim();
        // User score is 0.0-10.0, we'll store as 0-100 (multiply by 10)
        const match = text.match(/^(\d+(?:\.\d+)?)$/);
        if (match) {
            const score = parseFloat(match[1]);
            if (score >= 0 && score <= 10) {
                userScore = Math.round(score * 10); // Convert to 0-100 scale
                break;
            }
        }
    }

    // Also try parsing from JSON-LD if available
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const json = JSON.parse($(el).html());

            // Metascore from aggregateRating
            if (!metascore && json.aggregateRating?.ratingValue) {
                const val = parseInt(json.aggregateRating.ratingValue, 10);
                if (!isNaN(val) && val >= 0 && val <= 100) {
                    metascore = val;
                }
            }

            // User score from review rating
            if (!userScore && json.review?.reviewRating?.ratingValue) {
                const val = parseFloat(json.review.reviewRating.ratingValue);
                if (!isNaN(val) && val >= 0 && val <= 10) {
                    userScore = Math.round(val * 10);
                }
            }
        } catch (err) {
            // Ignore invalid JSON
        }
    });

    if (metascore !== null || userScore !== null) {
        logger.info(`[${PROVIDER_NAME}] ✓ Scraped: Metascore=${metascore}, User=${userScore ? (userScore / 10).toFixed(1) : null}`);
        return { metascore, userScore };
    }

    return null;
}

/**
 * Scrape Metacritic page for ratings
 * @param {string} html - Page HTML
 * @param {string} url - Page URL
 * @returns {Object|null} Ratings data or null
 */
function scrape(html, url) {
    try {
        const $ = cheerio.load(html);
        const scores = scrapeScores($);

        if (scores) {
            return { ...scores, url };
        }

        logger.debug(`[${PROVIDER_NAME}] No scores found on page: ${url}`);
        return null;

    } catch (err) {
        logger.error(`[${PROVIDER_NAME}] Scrape error for ${url}: ${err.message}`);
        return null;
    }
}

/**
 * Fetch and parse a single URL
 * @param {string} url - Metacritic URL to fetch
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<Object|null>} Scores or null
 */
async function tryFetch(url, retryCount = 0) {
    try {
        logger.debug(`[${PROVIDER_NAME}] Fetching: ${url}`);

        const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

        const response = await axios.get(url, {
            headers: {
                'User-Agent': userAgent,
                'Referer': BASE_URL,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'max-age=0'
            },
            timeout: TIMEOUT,
            validateStatus: (status) => status === 200 || status === 404
        });

        if (response.status === 404) {
            logger.debug(`[${PROVIDER_NAME}] 404 not found: ${url}`);
            return null;
        }

        if (response.status === 200) {
            return scrape(response.data, url);
        }

        return null;

    } catch (err) {
        // Retry on network errors (but not 404s)
        if (retryCount < 2 && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
            logger.warn(`[${PROVIDER_NAME}] Network error, retrying (${retryCount + 1}/2): ${err.message}`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            return tryFetch(url, retryCount + 1);
        }

        logger.warn(`[${PROVIDER_NAME}] Fetch error for ${url}: ${err.message}`);
        return null;
    }
}

/**
 * Get Metacritic scores for a series
 * Tries multiple URL variations to find the correct page
 *
 * @param {string} title - Series title
 * @param {string} year - Release year (optional)
 * @returns {Promise<Object|null>} Scores object or null
 */
async function scrapeMetacritic(title, year) {
    if (!title) {
        logger.warn(`[${PROVIDER_NAME}] No title provided`);
        return null;
    }

    const urls = buildCandidateUrls(title, year);

    // Try each URL until we find one that works
    for (const url of urls) {
        const result = await tryFetch(url);
        if (result) {
            return {
                metascore: result.metascore,
                userScore: result.userScore,
                url: result.url
            };
        }
    }

    logger.info(`[${PROVIDER_NAME}] No valid scores found for "${title}" (${year || 'no year'})`);
    return null;
}

module.exports = {
    scrapeMetacritic
};
