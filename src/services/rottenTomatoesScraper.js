/**
 * Rotten Tomatoes Web Scraper
 * Scrapes RT ratings for TV series (movies use OMDB)
 *
 * WARNING: This scrapes public RT pages. Use responsibly with rate limiting.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

const PROVIDER_NAME = 'Rotten Tomatoes';
const BASE_URL = 'https://www.rottentomatoes.com';
const TIMEOUT = 15000; // 15 seconds

// Rotating user agents to appear more human
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

/**
 * Format title into RT URL slug
 * @param {string} title - Series title
 * @returns {string} URL-safe slug
 */
function formatSlug(title) {
    if (!title) return '';

    return title.toLowerCase()
        .replace(/[:_]/g, ' ')           // Convert : and _ to spaces
        .replace(/['']/g, '')            // Remove apostrophes
        .replace(/\s+/g, '_')            // Spaces to underscores
        .replace(/[^a-z0-9_]/g, '')      // Remove non-alphanumeric except underscore
        .replace(/_+/g, '_')             // Multiple underscores to single
        .replace(/^_|_$/g, '');          // Trim leading/trailing underscores
}

/**
 * Build candidate URLs to try
 * RT sometimes appends year or disambiguators like "_2"
 *
 * @param {string} title - Series title
 * @param {string} year - Release year
 * @returns {string[]} Array of URLs to try
 */
function buildCandidateUrls(title, year) {
    const slug = formatSlug(title);
    const urls = [];

    // Try with year first (most reliable)
    if (year) {
        urls.push(`${BASE_URL}/tv/${slug}_${year}`);
    }

    // Try without year
    urls.push(`${BASE_URL}/tv/${slug}`);

    // Try with year and disambiguator
    if (year) {
        urls.push(`${BASE_URL}/tv/${slug}_${year}_2`);
    }

    logger.debug(`[${PROVIDER_NAME}] Built ${urls.length} candidate URLs for "${title}"`);
    return urls;
}

/**
 * Parse RT ratings from JSON-LD structured data
 * @param {CheerioStatic} $ - Cheerio instance
 * @returns {Object|null} Ratings or null
 */
function parseJsonLd($) {
    let criticsScore = null;
    let audienceScore = null;

    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const json = JSON.parse($(el).html());

            // Critics score (Tomatometer)
            if (json.aggregateRating?.ratingValue) {
                const val = parseInt(json.aggregateRating.ratingValue.toString().replace('%', ''), 10);
                if (!isNaN(val) && val >= 0 && val <= 100) {
                    criticsScore = val;
                }
            }

            // Audience score
            if (json.audience?.audienceScore) {
                const val = parseInt(json.audience.audienceScore.toString().replace('%', ''), 10);
                if (!isNaN(val) && val >= 0 && val <= 100) {
                    audienceScore = val;
                }
            }
        } catch (err) {
            // Ignore invalid JSON
        }
    });

    if (criticsScore !== null || audienceScore !== null) {
        return { criticsScore, audienceScore };
    }

    return null;
}

/**
 * Parse RT ratings from DOM elements (fallback method)
 * @param {CheerioStatic} $ - Cheerio instance
 * @returns {Object|null} Ratings or null
 */
function scrapeDom($) {
    let criticsScore = null;
    let audienceScore = null;

    // Try RT's custom elements
    const criticText = $('rt-text[slot="criticsScore"]').first().text().trim();
    const userText = $('rt-text[slot="audienceScore"]').first().text().trim();

    if (/^\d+$/.test(criticText)) {
        criticsScore = parseInt(criticText, 10);
    }

    if (/^\d+$/.test(userText)) {
        audienceScore = parseInt(userText, 10);
    }

    if (criticsScore !== null || audienceScore !== null) {
        return { criticsScore, audienceScore };
    }

    return null;
}

/**
 * Scrape RT page for ratings
 * @param {string} html - Page HTML
 * @param {string} url - Page URL
 * @returns {Object|null} Ratings data or null
 */
function scrape(html, url) {
    try {
        const $ = cheerio.load(html);

        // Try both parsing methods
        const jsonLdData = parseJsonLd($);
        const domData = scrapeDom($);

        // Prefer JSON-LD, fallback to DOM scraping
        const criticsScore = jsonLdData?.criticsScore ?? domData?.criticsScore ?? null;
        const audienceScore = jsonLdData?.audienceScore ?? domData?.audienceScore ?? null;

        if (criticsScore !== null || audienceScore !== null) {
            logger.info(`[${PROVIDER_NAME}] ✓ Scraped: Critics=${criticsScore}%, Audience=${audienceScore}%`);
            return { criticsScore, audienceScore, url };
        }

        logger.debug(`[${PROVIDER_NAME}] No ratings found on page: ${url}`);
        return null;

    } catch (err) {
        logger.error(`[${PROVIDER_NAME}] Scrape error for ${url}: ${err.message}`);
        return null;
    }
}

/**
 * Fetch and parse a single URL
 * @param {string} url - RT URL to fetch
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<Object|null>} Ratings or null
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
                'Upgrade-Insecure-Requests': '1'
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
 * Get RT ratings for a series
 * Tries multiple URL variations to find the correct page
 *
 * @param {string} title - Series title
 * @param {string} year - Release year (optional)
 * @returns {Promise<Object|null>} Ratings object or null
 */
async function scrapeRottenTomatoes(title, year) {
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
                criticsScore: result.criticsScore,
                audienceScore: result.audienceScore,
                url: result.url
            };
        }
    }

    logger.info(`[${PROVIDER_NAME}] No valid ratings found for "${title}" (${year || 'no year'})`);
    return null;
}

module.exports = {
    scrapeRottenTomatoes
};
