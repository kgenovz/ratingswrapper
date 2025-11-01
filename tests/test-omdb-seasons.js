/**
 * Test script to check OMDB season-level ratings
 * Run with: OMDB_API_KEY=key node test-omdb-seasons.js
 */

const axios = require('axios');

const OMDB_API_KEY = process.env.OMDB_API_KEY || 'a0da4838';
const OMDB_BASE_URL = 'http://www.omdbapi.com';

async function getSeriesInfo(imdbId) {
    const response = await axios.get(OMDB_BASE_URL, {
        params: {
            apikey: OMDB_API_KEY,
            i: imdbId,
            plot: 'short'
        }
    });
    return response.data;
}

async function getSeasonInfo(imdbId, seasonNumber) {
    const response = await axios.get(OMDB_BASE_URL, {
        params: {
            apikey: OMDB_API_KEY,
            i: imdbId,
            Season: seasonNumber
        }
    });
    return response.data;
}

async function testSeasonRatings(imdbId, seriesName) {
    try {
        console.log(`\n========================================`);
        console.log(`Testing: ${seriesName} (${imdbId})`);
        console.log(`========================================`);

        // Get series info to find total seasons
        const seriesInfo = await getSeriesInfo(imdbId);
        console.log(`\nSeries: ${seriesInfo.Title}`);
        console.log(`Total Seasons: ${seriesInfo.totalSeasons}`);

        // Show series-level ratings
        console.log(`\nSeries-Level Ratings:`);
        if (seriesInfo.Ratings && Array.isArray(seriesInfo.Ratings)) {
            seriesInfo.Ratings.forEach(r => {
                console.log(`  - ${r.Source}: ${r.Value}`);
            });
        } else {
            console.log('  (None)');
        }

        // Try fetching season 1 to see what data is available
        console.log(`\n--- Season 1 Data ---`);
        const season1 = await getSeasonInfo(imdbId, 1);
        console.log(`Title: ${season1.Title}`);
        console.log(`Season: ${season1.Season}`);
        console.log(`Total Episodes: ${season1.totalSeasons || season1.Episodes?.length || 'unknown'}`);

        if (season1.Ratings && Array.isArray(season1.Ratings)) {
            console.log(`\nSeason 1 Ratings (${season1.Ratings.length} sources):`);
            season1.Ratings.forEach(r => {
                console.log(`  - ${r.Source}: ${r.Value}`);
            });
        } else {
            console.log('\nSeason 1 Ratings: None');
        }

        // Check if episodes have individual data
        if (season1.Episodes && season1.Episodes.length > 0) {
            console.log(`\nFirst Episode Info:`);
            const ep = season1.Episodes[0];
            console.log(`  Title: ${ep.Title}`);
            console.log(`  Episode: ${ep.Episode}`);
            console.log(`  IMDb Rating: ${ep.imdbRating}`);
            console.log(`  IMDb ID: ${ep.imdbID}`);
        }

        // Try season 2 as well
        if (seriesInfo.totalSeasons >= 2) {
            console.log(`\n--- Season 2 Data ---`);
            const season2 = await getSeasonInfo(imdbId, 2);
            if (season2.Ratings && Array.isArray(season2.Ratings)) {
                console.log(`Season 2 Ratings (${season2.Ratings.length} sources):`);
                season2.Ratings.forEach(r => {
                    console.log(`  - ${r.Source}: ${r.Value}`);
                });
            } else {
                console.log('Season 2 Ratings: None');
            }
        }

        return seriesInfo;

    } catch (error) {
        console.error(`Error testing ${seriesName}:`, error.message);
        if (error.response) {
            console.error(`Response status: ${error.response.status}`);
        }
        return null;
    }
}

async function main() {
    // Test Breaking Bad (has some RT data at series level)
    await testSeasonRatings('tt0903747', 'Breaking Bad');

    // Test Game of Thrones (no RT/MC at series level)
    await testSeasonRatings('tt0944947', 'Game of Thrones');

    // Test user's example
    await testSeasonRatings('tt28013708', 'Task (2025)');

    console.log('\n========================================');
    console.log('Test Complete');
    console.log('========================================\n');
}

main();
