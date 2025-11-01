/**
 * Test script to verify dual-layer caching for series ratings
 */

const omdbService = require('./src/services/omdbService');
const config = require('./src/config');

async function testCaching() {
    console.log('\n=== Series Ratings Caching Test ===\n');
    console.log(`Redis enabled: ${config.redis.enabled}`);
    console.log(`Ratings API URL: ${config.ratingsApiUrl || 'http://localhost:3001'}\n`);

    const testCases = [
        { imdbId: 'tt17491088', title: 'The Diplomat', year: '2023' },
        { imdbId: 'tt13443470', title: 'Wednesday', year: '2022' }
    ];

    for (const test of testCases) {
        console.log(`\n--- Testing: ${test.title} (${test.imdbId}) ---`);

        // First request - should scrape and cache
        console.log('\n1. First request (should scrape and save to both caches):');
        try {
            const result1 = await omdbService.getOmdbDataByImdbId(
                test.imdbId,
                'series',
                test.title,
                test.year
            );
            console.log('   Result:', result1);
        } catch (error) {
            console.error('   Error:', error.message);
        }

        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Second request - should hit cache
        console.log('\n2. Second request (should hit Redis cache):');
        try {
            const result2 = await omdbService.getOmdbDataByImdbId(
                test.imdbId,
                'series',
                test.title,
                test.year
            );
            console.log('   Result:', result2);
        } catch (error) {
            console.error('   Error:', error.message);
        }
    }

    console.log('\n\n=== Cache Verification Complete ===\n');
    console.log('✓ Check the logs above for:');
    console.log('  - "[SERIES-RATINGS] ✓ Saved to SQLite database"');
    console.log('  - "[SERIES-RATINGS] ✓ Cached in Redis"');
    console.log('  - "[SERIES-RATINGS] Redis cache HIT" (on second request)');
    console.log('  - "[SERIES-RATINGS] SQLite cache HIT" (if Redis disabled)');
    console.log('\n');

    process.exit(0);
}

testCaching().catch(console.error);
