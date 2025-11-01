/**
 * Test script to reproduce the Railway scraper error
 */

const axios = require('axios');

const RAILWAY_URL = 'https://ratingswrapper-production-dfa6.up.railway.app';

async function testOmdbSeriesScraping() {
    console.log('Testing OMDB series scraping on Railway...\n');

    // Test case 1: The Diplomat (the one that was failing)
    console.log('Test 1: The Diplomat (tt17491088)');
    try {
        const response = await axios.get(
            `${RAILWAY_URL}/api/omdb-data/tt17491088`,
            { timeout: 30000 }
        );
        console.log('✓ Success:', response.data);
    } catch (error) {
        console.log('✗ Error:', error.response?.data || error.message);
        if (error.response?.data) {
            console.log('Full error:', JSON.stringify(error.response.data, null, 2));
        }
    }

    console.log('\n---\n');

    // Test case 2: Wednesday (known working)
    console.log('Test 2: Wednesday (tt13443470)');
    try {
        const response = await axios.get(
            `${RAILWAY_URL}/api/omdb-data/tt13443470`,
            { timeout: 30000 }
        );
        console.log('✓ Success:', response.data);
    } catch (error) {
        console.log('✗ Error:', error.response?.data || error.message);
    }

    console.log('\n---\n');

    // Test case 3: Check Railway logs endpoint (if available)
    console.log('Test 3: Checking health endpoint');
    try {
        const response = await axios.get(`${RAILWAY_URL}/health`);
        console.log('✓ Health check:', response.data);
    } catch (error) {
        console.log('✗ Health check error:', error.message);
    }
}

testOmdbSeriesScraping().catch(console.error);
