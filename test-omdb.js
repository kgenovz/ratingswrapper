/**
 * Test script to check OMDB API responses for movies vs series
 * Run with: node test-omdb.js
 */

const axios = require('axios');

const OMDB_API_KEY = process.env.OMDB_API_KEY;
const OMDB_BASE_URL = 'http://www.omdbapi.com';

async function testOmdb(imdbId, label) {
    try {
        console.log(`\n========================================`);
        console.log(`Testing: ${label} (${imdbId})`);
        console.log(`========================================`);

        const response = await axios.get(OMDB_BASE_URL, {
            params: {
                apikey: OMDB_API_KEY,
                i: imdbId,
                plot: 'short'
            },
            timeout: 10000
        });

        const data = response.data;

        console.log(`\nTitle: ${data.Title}`);
        console.log(`Type: ${data.Type}`);
        console.log(`Year: ${data.Year}`);
        console.log(`Response: ${data.Response}`);
        console.log(`\nRatings Array (${data.Ratings ? data.Ratings.length : 0} items):`);

        if (data.Ratings && Array.isArray(data.Ratings)) {
            data.Ratings.forEach(r => {
                console.log(`  - ${r.Source}: ${r.Value}`);
            });
        } else {
            console.log('  (No Ratings array found)');
        }

        console.log(`\nMetascore field: ${data.Metascore}`);
        console.log(`\nIMDb Rating: ${data.imdbRating}`);
        console.log(`IMDb Votes: ${data.imdbVotes}`);

        // Show what our parser would extract
        let rottenTomatoes = null;
        let metacritic = null;

        if (data.Ratings && Array.isArray(data.Ratings)) {
            const rtRating = data.Ratings.find(r => r.Source === 'Rotten Tomatoes');
            if (rtRating) {
                rottenTomatoes = rtRating.Value;
            }

            const mcRating = data.Ratings.find(r => r.Source === 'Metacritic');
            if (mcRating) {
                const match = mcRating.Value.match(/^(\d+)/);
                if (match) {
                    metacritic = parseInt(match[1]);
                }
            }
        }

        if (!metacritic && data.Metascore && data.Metascore !== 'N/A') {
            metacritic = parseInt(data.Metascore);
        }

        console.log(`\n--- PARSED RESULTS ---`);
        console.log(`Rotten Tomatoes: ${rottenTomatoes || 'NULL'}`);
        console.log(`Metacritic: ${metacritic || 'NULL'}`);

        return { rottenTomatoes, metacritic };

    } catch (error) {
        console.error(`Error testing ${label}:`, error.message);
        if (error.response) {
            console.error(`Response status: ${error.response.status}`);
            console.error(`Response data:`, error.response.data);
        }
        return null;
    }
}

async function main() {
    if (!OMDB_API_KEY) {
        console.error('ERROR: OMDB_API_KEY environment variable not set');
        console.error('Usage: OMDB_API_KEY=your_key node test-omdb.js');
        process.exit(1);
    }

    // Test a popular movie (should have RT/MC)
    await testOmdb('tt0111161', 'Movie: The Shawshank Redemption');

    // Test a popular series (should have RT/MC)
    await testOmdb('tt0903747', 'Series: Breaking Bad');

    // Test the specific series from the user's logs
    await testOmdb('tt28013708', 'Series: User\'s Example');

    // Test another popular series
    await testOmdb('tt0944947', 'Series: Game of Thrones');

    console.log('\n========================================');
    console.log('Test Complete');
    console.log('========================================\n');
}

main();
