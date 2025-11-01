const express = require('express');
const axios = require('axios');
const fs = require('fs');
const readline = require('readline');
const zlib = require('zlib');
const cron = require('node-cron');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 3001;

// TMDB API configuration
const TMDB_API_KEY = process.env.TMDB_API_KEY || null;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_TIMEOUT = 10000; // 10 seconds

// OMDB API configuration
const OMDB_API_KEY = process.env.OMDB_API_KEY || null;
const OMDB_BASE_URL = 'http://www.omdbapi.com';
const OMDB_TIMEOUT = 10000; // 10 seconds

// MAL API configuration
const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID || null;
const MAL_BASE_URL = 'https://api.myanimelist.net/v2';
const MAL_TIMEOUT = 10000; // 10 seconds

// Parse cron schedule from environment variable, default to 2 AM daily
const UPDATE_CRON_SCHEDULE = process.env.UPDATE_CRON_SCHEDULE || '0 2 * * *';

// Validate cron schedule format
if (!UPDATE_CRON_SCHEDULE.match(/^(\S+\s+){4}\S+$/)) {
    console.warn('Invalid cron schedule format, using default: 0 2 * * *');
    UPDATE_CRON_SCHEDULE = '0 2 * * *';
}

// Add JSON body parser for new endpoints
app.use(express.json());

// Database setup - store in data/ subdirectory for volume mounting
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, 'ratings.db');
let db;
let lastUpdated = null;
let ratingsCount = 0;
let episodesCount = 0;

// Helper functions for IMDb ID compression
function imdbToInt(imdbId) {
    return parseInt(imdbId.replace('tt', ''));
}

function intToImdb(num) {
    return 'tt' + num.toString().padStart(7, '0');
}

// Initialize database
function initDatabase() {
    try {
        db = new Database(dbPath);
        console.log('Connected to database');

        // Enable performance optimizations
        db.pragma('journal_mode = DELETE');
        db.pragma('synchronous = NORMAL');
        db.pragma('cache_size = 10000');
        db.pragma('temp_store = memory');
        db.pragma('mmap_size = 268435456'); // 256MB

        // Create optimized tables with compressed IDs
        db.exec(`CREATE TABLE IF NOT EXISTS ratings (
            imdb_id INTEGER PRIMARY KEY,
            rating REAL NOT NULL,
            votes INTEGER DEFAULT 0
        ) WITHOUT ROWID`);

        // Only store episodes that have ratings (filtered)
        db.exec(`CREATE TABLE IF NOT EXISTS episodes (
            series_id INTEGER NOT NULL,
            season INTEGER NOT NULL,
            episode INTEGER NOT NULL,
            episode_id INTEGER NOT NULL,
            PRIMARY KEY (series_id, season, episode)
        ) WITHOUT ROWID`);

        // *** NEW: Add caching and mapping tables ***
        // Table for persistent API response caching
        db.exec(`CREATE TABLE IF NOT EXISTS api_cache (
            cache_key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        ) WITHOUT ROWID`);

        // Table for Kitsu → IMDb mappings (permanent storage)
        db.exec(`CREATE TABLE IF NOT EXISTS kitsu_imdb_mappings (
            kitsu_id TEXT PRIMARY KEY,
            imdb_id TEXT NOT NULL,
            source TEXT DEFAULT 'api_discovery',
            confidence_score INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            last_verified INTEGER NOT NULL
        ) WITHOUT ROWID`);

        // Optional: Table for TMDB metadata (rich metadata caching)
        db.exec(`CREATE TABLE IF NOT EXISTS tmdb_metadata (
            imdb_id TEXT PRIMARY KEY,
            tmdb_id INTEGER,
            media_type TEXT,
            title TEXT,
            original_title TEXT,
            year INTEGER,
            tmdb_rating REAL,
            tmdb_vote_count INTEGER,
            release_date TEXT,
            first_air_date TEXT,
            genres TEXT,
            popularity REAL,
            data TEXT,
            updated_at INTEGER NOT NULL,
            ratings_cached_at INTEGER,
            streaming_providers TEXT,
            streaming_region TEXT,
            streaming_cached_at INTEGER
        ) WITHOUT ROWID`);

        // Table for MPAA ratings cache
        db.exec(`CREATE TABLE IF NOT EXISTS mpaa_ratings (
            imdb_id TEXT PRIMARY KEY,
            mpaa_rating TEXT NOT NULL,
            country TEXT DEFAULT 'US',
            updated_at INTEGER NOT NULL
        ) WITHOUT ROWID`);

        // Table for OMDB ratings cache (Rotten Tomatoes, Metacritic)
        db.exec(`CREATE TABLE IF NOT EXISTS omdb_metadata (
            imdb_id TEXT PRIMARY KEY,
            rotten_tomatoes TEXT,
            metacritic INTEGER,
            updated_at INTEGER NOT NULL,
            ratings_cached_at INTEGER
        ) WITHOUT ROWID`);

        // Table for MAL (MyAnimeList) ratings cache
        db.exec(`CREATE TABLE IF NOT EXISTS mal_metadata (
            mal_id TEXT PRIMARY KEY,
            title TEXT,
            mal_rating REAL,
            mal_votes INTEGER,
            updated_at INTEGER NOT NULL,
            ratings_cached_at INTEGER,
            imdb_id TEXT
        ) WITHOUT ROWID`);

        // Table for scraped RT/MC ratings for series (web scraping fallback)
        db.exec(`CREATE TABLE IF NOT EXISTS series_scraped_ratings (
            imdb_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,

            rt_critics_score INTEGER,
            rt_audience_score INTEGER,
            rt_url TEXT,

            mc_metascore INTEGER,
            mc_user_score INTEGER,
            mc_url TEXT,

            scrape_attempted_at INTEGER NOT NULL,
            scrape_succeeded_at INTEGER,
            scrape_failed_count INTEGER DEFAULT 0,
            cache_until INTEGER NOT NULL
        ) WITHOUT ROWID`);

        // Table for consolidated ratings (multi-source averages)
        db.exec(`CREATE TABLE IF NOT EXISTS consolidated_ratings (
            imdb_id TEXT PRIMARY KEY,

            -- Individual source ratings (nullable)
            imdb_rating REAL,
            tmdb_rating REAL,
            rotten_tomatoes INTEGER,
            metacritic INTEGER,

            -- Computed values
            consolidated_rating REAL NOT NULL,
            source_count INTEGER NOT NULL,
            color_indicator TEXT NOT NULL,

            -- Metadata
            updated_at INTEGER NOT NULL,
            ratings_cached_at INTEGER NOT NULL,

            -- Cache TTL
            cache_until INTEGER NOT NULL
        ) WITHOUT ROWID`);

        // Optimized indexes
        db.exec(`CREATE INDEX IF NOT EXISTS idx_episodes_lookup ON episodes(series_id, season, episode)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_episodes_id ON episodes(episode_id)`);

        // *** NEW: Indexes for caching tables ***
        db.exec(`CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_kitsu_mappings_imdb ON kitsu_imdb_mappings(imdb_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tmdb_metadata_imdb ON tmdb_metadata(imdb_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tmdb_metadata_title ON tmdb_metadata(title)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_mpaa_ratings_updated ON mpaa_ratings(updated_at)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_mal_metadata_mal_id ON mal_metadata(mal_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_mal_metadata_imdb_id ON mal_metadata(imdb_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_series_scraped_cache_until ON series_scraped_ratings(cache_until)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_consolidated_updated ON consolidated_ratings(updated_at)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_consolidated_cache_until ON consolidated_ratings(cache_until)`);

        console.log('✅ Database tables and indexes created');

        // Run migrations for existing databases
        runMigrations();

        return Promise.resolve();
    } catch (err) {
        return Promise.reject(err);
    }
}

// Database migrations for schema updates
function runMigrations() {
    try {
        // Create schema_version table if it doesn't exist
        db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
        )`);

        // Get current schema version
        const currentVersion = db.prepare('SELECT MAX(version) as version FROM schema_version').get();
        const version = currentVersion?.version || 0;

        // Migration 1: Update tmdb_metadata table for existing databases
        if (version < 1) {
            console.log('Running migration 1: Updating tmdb_metadata table schema...');

            // Check if old structure exists (tmdb_key column)
            const tableInfo = db.prepare("PRAGMA table_info(tmdb_metadata)").all();
            const hasTmdbKey = tableInfo.some(col => col.name === 'tmdb_key');

            if (hasTmdbKey) {
                // Old structure exists, need to migrate
                console.log('  Detected old tmdb_metadata structure, migrating...');

                // Rename old table
                db.exec('ALTER TABLE tmdb_metadata RENAME TO tmdb_metadata_old');

                // Create new table with updated structure
                db.exec(`CREATE TABLE tmdb_metadata (
                    imdb_id TEXT PRIMARY KEY,
                    tmdb_id INTEGER,
                    media_type TEXT,
                    title TEXT,
                    original_title TEXT,
                    year INTEGER,
                    tmdb_rating REAL,
                    tmdb_vote_count INTEGER,
                    release_date TEXT,
                    first_air_date TEXT,
                    genres TEXT,
                    popularity REAL,
                    data TEXT,
                    updated_at INTEGER NOT NULL,
                    ratings_cached_at INTEGER,
                    streaming_providers TEXT,
                    streaming_region TEXT,
                    streaming_cached_at INTEGER
                ) WITHOUT ROWID`);

                // Migrate data if any exists
                const oldDataCount = db.prepare('SELECT COUNT(*) as count FROM tmdb_metadata_old').get().count;
                if (oldDataCount > 0) {
                    db.exec(`
                        INSERT INTO tmdb_metadata (imdb_id, tmdb_id, media_type, title, original_title, year, genres, popularity, data, updated_at)
                        SELECT imdb_id, tmdb_id, media_type, title, original_title, year, genres, popularity, data, updated_at
                        FROM tmdb_metadata_old
                        WHERE imdb_id IS NOT NULL
                    `);
                    console.log(`  Migrated ${oldDataCount} records from old table`);
                }

                // Drop old table
                db.exec('DROP TABLE tmdb_metadata_old');

                // Recreate index
                db.exec('CREATE INDEX IF NOT EXISTS idx_tmdb_metadata_imdb ON tmdb_metadata(imdb_id)');

                console.log('  Migration 1 completed successfully');
            }

            // Mark migration as applied
            db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(1, Date.now());
        }

        // Migration 2: Add streaming provider columns to tmdb_metadata
        if (version < 2) {
            console.log('Running migration 2: Adding streaming provider columns...');

            const tableInfo = db.prepare("PRAGMA table_info(tmdb_metadata)").all();
            const hasStreamingProviders = tableInfo.some(col => col.name === 'streaming_providers');

            if (!hasStreamingProviders) {
                console.log('  Adding streaming_providers, streaming_region, streaming_cached_at columns...');

                db.exec(`ALTER TABLE tmdb_metadata ADD COLUMN streaming_providers TEXT`);
                db.exec(`ALTER TABLE tmdb_metadata ADD COLUMN streaming_region TEXT`);
                db.exec(`ALTER TABLE tmdb_metadata ADD COLUMN streaming_cached_at INTEGER`);

                console.log('  Migration 2 completed successfully');
            }

            // Mark migration as applied
            db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(2, Date.now());
        }

        // Migration 3: Add MAL metadata table
        if (version < 3) {
            console.log('Running migration 3: Creating MAL metadata table...');

            // Check if mal_metadata table exists
            const tableExists = db.prepare(`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='mal_metadata'
            `).get();

            if (!tableExists) {
                console.log('  Creating mal_metadata table...');

                db.exec(`CREATE TABLE mal_metadata (
                    mal_id TEXT PRIMARY KEY,
                    title TEXT,
                    mal_rating REAL,
                    mal_votes INTEGER,
                    updated_at INTEGER NOT NULL,
                    ratings_cached_at INTEGER,
                    imdb_id TEXT
                ) WITHOUT ROWID`);

                // Create indexes
                db.exec('CREATE INDEX IF NOT EXISTS idx_mal_metadata_mal_id ON mal_metadata(mal_id)');
                db.exec('CREATE INDEX IF NOT EXISTS idx_mal_metadata_imdb_id ON mal_metadata(imdb_id)');

                console.log('  Migration 3 completed successfully');
            } else {
                console.log('  mal_metadata table already exists, skipping...');
            }

            // Mark migration as applied
            db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(3, Date.now());
        }

        // Migration 4: Add consolidated_ratings table
        if (version < 4) {
            console.log('Running migration 4: Creating consolidated_ratings table...');

            // Check if consolidated_ratings table exists
            const tableExists = db.prepare(`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='consolidated_ratings'
            `).get();

            if (!tableExists) {
                console.log('  Creating consolidated_ratings table...');

                db.exec(`CREATE TABLE consolidated_ratings (
                    imdb_id TEXT PRIMARY KEY,

                    -- Individual source ratings (nullable)
                    imdb_rating REAL,
                    tmdb_rating REAL,
                    rotten_tomatoes INTEGER,
                    metacritic INTEGER,

                    -- Computed values
                    consolidated_rating REAL NOT NULL,
                    source_count INTEGER NOT NULL,
                    color_indicator TEXT NOT NULL,

                    -- Metadata
                    updated_at INTEGER NOT NULL,
                    ratings_cached_at INTEGER NOT NULL,

                    -- Cache TTL
                    cache_until INTEGER NOT NULL
                ) WITHOUT ROWID`);

                // Create indexes
                db.exec('CREATE INDEX IF NOT EXISTS idx_consolidated_updated ON consolidated_ratings(updated_at)');
                db.exec('CREATE INDEX IF NOT EXISTS idx_consolidated_cache_until ON consolidated_ratings(cache_until)');

                console.log('  Migration 4 completed successfully');
            } else {
                console.log('  consolidated_ratings table already exists, skipping...');
            }

            // Mark migration as applied
            db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(4, Date.now());
        }

        console.log(`✅ Database schema version: ${Math.max(version, 4)}`);
    } catch (err) {
        console.error('Migration error:', err);
        // Don't fail startup on migration errors
    }
}

// Function to download and extract a gzipped TSV file
async function downloadAndExtract(url, filename) {
    console.log(`Downloading ${filename}...`);

    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }

    const gzipFilePath = path.join(dataDir, `${filename}.gz`);
    const tsvFilePath = path.join(dataDir, filename);

    // Download
    const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream'
    });

    const fileWriter = fs.createWriteStream(gzipFilePath);
    response.data.pipe(fileWriter);

    await new Promise((resolve, reject) => {
        fileWriter.on('finish', resolve);
        fileWriter.on('error', reject);
    });

    console.log(`Extracting ${filename}...`);

    // Extract
    const fileStream = fs.createReadStream(gzipFilePath);
    const unzipStream = zlib.createGunzip();
    const outputStream = fs.createWriteStream(tsvFilePath);

    fileStream.pipe(unzipStream).pipe(outputStream);

    await new Promise((resolve, reject) => {
        outputStream.on('finish', resolve);
        outputStream.on('error', reject);
    });

    // Clean up compressed file
    fs.unlinkSync(gzipFilePath);

    return tsvFilePath;
}

// Process ratings into database
async function processRatings(filePath) {
    console.log('Processing ratings into database...');

    return new Promise(async (resolve, reject) => {
        // Clear existing data
        db.exec("DELETE FROM ratings");

        const rl = readline.createInterface({
            input: fs.createReadStream(filePath),
            crlfDelay: Infinity
        });

        let headerSkipped = false;
        let processedLines = 0;
        const batchSize = 1000;
        let batch = [];

        // Prepare insert statement
        const stmt = db.prepare("INSERT OR REPLACE INTO ratings (imdb_id, rating, votes) VALUES (?, ?, ?)");

        for await (const line of rl) {
            if (!headerSkipped) {
                headerSkipped = true;
                continue;
            }

            const [tconst, averageRating, numVotes] = line.split('\t');
            if (tconst && averageRating && averageRating !== 'N/A') {
                batch.push([
                    imdbToInt(tconst),
                    parseFloat(averageRating),
                    parseInt(numVotes) || 0
                ]);

                // Insert in batches for performance
                if (batch.length >= batchSize) {
                    const transaction = db.transaction((rows) => {
                        for (const row of rows) stmt.run(row);
                    });
                    transaction(batch);

                    processedLines += batch.length;
                    batch = [];

                    if (processedLines % 50000 === 0) {
                        console.log(`   Processed ${processedLines.toLocaleString()} ratings...`);
                    }
                }
            }
        }

        // Insert remaining batch
        if (batch.length > 0) {
            const transaction = db.transaction((rows) => {
                for (const row of rows) stmt.run(row);
            });
            transaction(batch);
            processedLines += batch.length;
        }

        ratingsCount = processedLines;

        console.log(`Loaded ${ratingsCount.toLocaleString()} ratings into database`);

        // Clean up file
        fs.unlinkSync(filePath);
        resolve();
    });
}

// Process episodes into database (FILTERED!)
async function processEpisodes(filePath) {
    console.log('Processing episodes into database (filtered for ratings)...');

    return new Promise(async (resolve, reject) => {
        // Clear existing data
        db.exec("DELETE FROM episodes");

        const rl = readline.createInterface({
            input: fs.createReadStream(filePath),
            crlfDelay: Infinity
        });

        let headerSkipped = false;
        let processedLines = 0;
        let filteredLines = 0;
        const batchSize = 1000;
        let batch = [];

        // Prepare statements
        const stmt = db.prepare("INSERT OR REPLACE INTO episodes (series_id, season, episode, episode_id) VALUES (?, ?, ?, ?)");
        const checkRating = db.prepare("SELECT 1 FROM ratings WHERE imdb_id = ? LIMIT 1");

        for await (const line of rl) {
            if (!headerSkipped) {
                headerSkipped = true;
                continue;
            }

            const [episodeId, seriesId, seasonNum, episodeNum] = line.split('\t');

            if (episodeId && seriesId && seasonNum && episodeNum &&
                seasonNum !== '\\N' && episodeNum !== '\\N') {

                processedLines++;

                // FILTER: Only store episodes that have ratings!
                const episodeIdInt = imdbToInt(episodeId);
                const hasRating = checkRating.get(episodeIdInt);

                if (hasRating) {
                    batch.push([
                        imdbToInt(seriesId),
                        parseInt(seasonNum),
                        parseInt(episodeNum),
                        episodeIdInt
                    ]);
                    filteredLines++;

                    // Insert in batches
                    if (batch.length >= batchSize) {
                        const transaction = db.transaction((rows) => {
                            for (const row of rows) stmt.run(row);
                        });
                        transaction(batch);

                        batch = [];

                        if (filteredLines % 25000 === 0) {
                            console.log(`   Processed ${processedLines.toLocaleString()} episodes, stored ${filteredLines.toLocaleString()} with ratings...`);
                        }
                    }
                }

                if (processedLines % 100000 === 0) {
                    console.log(`   Scanned ${processedLines.toLocaleString()} episodes, found ${filteredLines.toLocaleString()} with ratings...`);
                }
            }
        }

        // Insert remaining batch
        if (batch.length > 0) {
            const transaction = db.transaction((rows) => {
                for (const row of rows) stmt.run(row);
            });
            transaction(batch);
        }

        episodesCount = filteredLines;

        console.log(`Loaded ${episodesCount.toLocaleString()} episode mappings (filtered from ${processedLines.toLocaleString()} total)`);
        console.log(`Storage efficiency: ${((episodesCount / processedLines) * 100).toFixed(1)}% of episodes stored`);

        // Clean up file
        fs.unlinkSync(filePath);
        resolve();
    });
}

// Main function to download and process all datasets
async function downloadAndProcessAllData() {
    console.log('Starting optimized IMDb data download...')

    try {
        // Download and process ratings FIRST (needed for filtering)
        const ratingsFile = await downloadAndExtract(
            'https://datasets.imdbws.com/title.ratings.tsv.gz',
            'title.ratings.tsv'
        );
        await processRatings(ratingsFile);

        // Download and process episodes (filtered against ratings)
        const episodesFile = await downloadAndExtract(
            'https://datasets.imdbws.com/title.episode.tsv.gz',
            'title.episode.tsv'
        );
        await processEpisodes(episodesFile);

        // Optimize database
        console.log('Optimizing database...');
        db.pragma('optimize');

        lastUpdated = new Date();

        const dbSize = fs.statSync(dbPath).size;
        console.log('All datasets processed and optimized!');
        console.log(`Total ratings: ${ratingsCount.toLocaleString()}`);
        console.log(`Total episodes: ${episodesCount.toLocaleString()}`);
        console.log(`Memory usage: ~${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
        console.log(`Database size: ~${Math.round(dbSize / 1024 / 1024)} MB`);
        console.log(`Compression ratio: ${((episodesCount / 7000000) * 100).toFixed(1)}% of original episode data stored`);

        return true;

    } catch (error) {
        console.error('Error processing IMDb data:', error);
        return false;
    }
}

// *** EXISTING API ENDPOINTS ***

// API endpoint for ratings
app.get('/api/rating/:id', (req, res) => {
    const id = req.params.id;

    if (!id || !id.startsWith('tt')) {
        return res.status(400).json({ error: 'Invalid ID. Must start with "tt"' });
    }

    const idInt = imdbToInt(id);

    try {
        const row = db.prepare("SELECT rating, votes FROM ratings WHERE imdb_id = ?").get(idInt);

        if (row) {
            return res.json({
                id,
                rating: row.rating.toFixed(1),
                votes: row.votes.toString(),
                type: 'direct'
            });
        } else {
            return res.status(404).json({ error: 'Rating not found for the specified ID' });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

// API endpoint for episode ratings
app.get('/api/episode/:seriesId/:season/:episode', (req, res) => {
    const { seriesId, season, episode } = req.params;

    if (!seriesId || !seriesId.startsWith('tt')) {
        return res.status(400).json({ error: 'Invalid series ID. Must start with "tt"' });
    }

    const seriesIdInt = imdbToInt(seriesId);

    try {
        // Look up episode IMDb ID using compressed IDs
        const episodeRow = db.prepare("SELECT episode_id FROM episodes WHERE series_id = ? AND season = ? AND episode = ?")
            .get(seriesIdInt, parseInt(season), parseInt(episode));

        if (!episodeRow) {
            return res.status(404).json({
                error: 'Episode not found',
                seriesId,
                season,
                episode
            });
        }

        // Get rating for the episode
        const ratingRow = db.prepare("SELECT rating, votes FROM ratings WHERE imdb_id = ?")
            .get(episodeRow.episode_id);

        if (ratingRow) {
            return res.json({
                seriesId,
                season: parseInt(season),
                episode: parseInt(episode),
                episodeId: intToImdb(episodeRow.episode_id),
                rating: ratingRow.rating.toFixed(1),
                votes: ratingRow.votes.toString(),
                type: 'episode'
            });
        } else {
            return res.status(404).json({
                error: 'Rating not found for episode',
                episodeId: intToImdb(episodeRow.episode_id)
            });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

// *** NEW: Episode rating by episode ID (for Cinemeta fix) ***
app.get('/api/episode/id/:episodeId', (req, res) => {
    const { episodeId } = req.params;

    if (!episodeId || !episodeId.startsWith('tt')) {
        return res.status(400).json({ error: 'Invalid episode ID. Must start with "tt"' });
    }

    const episodeIdInt = imdbToInt(episodeId);

    try {
        // Get rating for the episode directly
        const ratingRow = db.prepare("SELECT rating, votes FROM ratings WHERE imdb_id = ?")
            .get(episodeIdInt);

        if (ratingRow) {
            return res.json({
                episodeId,
                rating: ratingRow.rating.toFixed(1),
                votes: ratingRow.votes.toString(),
                type: 'episode'
            });
        } else {
            return res.status(404).json({
                error: 'Rating not found for episode ID',
                episodeId
            });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

// *** NEW: CACHING API ENDPOINTS ***

// GET /api/cache/:key - Get cached data
app.get('/api/cache/:key', (req, res) => {
    try {
        const { key } = req.params;
        const decodedKey = decodeURIComponent(key);
        const now = Date.now();

        const result = db.prepare(
            'SELECT data, timestamp FROM api_cache WHERE cache_key = ? AND expires_at > ?'
        ).get(decodedKey, now);

        if (result) {
            let parsedData;
            try {
                parsedData = JSON.parse(result.data);
            } catch (e) {
                return res.status(500).json({ error: 'Invalid cached data format' });
            }

            res.json({
                data: parsedData,
                timestamp: new Date(result.timestamp).toISOString(),
                cached: true
            });
        } else {
            res.status(404).json({ error: 'Cache miss' });
        }
    } catch (error) {
        console.error('Cache read error:', error);
        res.status(500).json({ error: 'Cache read failed' });
    }
});

// POST /api/cache - Store cached data
app.post('/api/cache', (req, res) => {
    try {
        const { key, data, timestamp } = req.body;

        if (!key || !data) {
            return res.status(400).json({ error: 'Missing key or data' });
        }

        const timestampMs = timestamp ? new Date(timestamp).getTime() : Date.now();
        const expiresAt = timestampMs + (60 * 60 * 1000); // 1 hour from timestamp

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO api_cache (cache_key, data, timestamp, expires_at) 
            VALUES (?, ?, ?, ?)
        `);

        stmt.run(key, JSON.stringify(data), timestampMs, expiresAt);

        res.json({ success: true });
    } catch (error) {
        console.error('Cache write error:', error);
        res.status(500).json({ error: 'Cache write failed' });
    }
});

// *** NEW: KITSU MAPPING API ENDPOINTS ***

// GET /api/kitsu-mapping/:kitsuId - Get Kitsu → IMDb mapping
app.get('/api/kitsu-mapping/:kitsuId', (req, res) => {
    try {
        const { kitsuId } = req.params;

        const result = db.prepare(
            'SELECT imdb_id, source, confidence_score, created_at FROM kitsu_imdb_mappings WHERE kitsu_id = ?'
        ).get(kitsuId);

        if (result) {
            res.json({
                kitsuId: kitsuId,
                imdbId: result.imdb_id,
                source: result.source,
                confidence: result.confidence_score,
                createdAt: new Date(result.created_at).toISOString()
            });
        } else {
            res.status(404).json({ error: 'Mapping not found' });
        }
    } catch (error) {
        console.error('Mapping read error:', error);
        res.status(500).json({ error: 'Mapping read failed' });
    }
});

// POST /api/kitsu-mapping - Store Kitsu → IMDb mapping
app.post('/api/kitsu-mapping', (req, res) => {
    try {
        const { kitsuId, imdbId, source = 'api_discovery', confidence = 0 } = req.body;

        if (!kitsuId || !imdbId) {
            return res.status(400).json({ error: 'Missing kitsuId or imdbId' });
        }

        const now = Date.now();

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO kitsu_imdb_mappings 
            (kitsu_id, imdb_id, source, confidence_score, created_at, last_verified) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run(kitsuId, imdbId, source, confidence, now, now);

        res.json({
            success: true,
            mapping: { kitsuId, imdbId, source }
        });
    } catch (error) {
        console.error('Mapping write error:', error);
        res.status(500).json({ error: 'Mapping write failed' });
    }
});

// *** TMDB HELPER FUNCTIONS FOR MPAA RATINGS ***

/**
 * Fetch MPAA rating from TMDB by IMDb ID
 * @param {string} imdbId - IMDb ID (e.g., "tt0111161")
 * @returns {Promise<string|null>} - MPAA rating or null
 */
async function fetchMpaaFromTmdb(imdbId) {
    if (!TMDB_API_KEY) {
        return null;
    }

    try {

        // Step 1: Find TMDB ID from IMDb ID
        const findUrl = `${TMDB_BASE_URL}/find/${imdbId}`;
        const findResponse = await axios.get(findUrl, {
            params: {
                api_key: TMDB_API_KEY,
                external_source: 'imdb_id'
            },
            timeout: TMDB_TIMEOUT
        });

        const movieResults = findResponse.data.movie_results || [];
        const tvResults = findResponse.data.tv_results || [];

        let mpaaRating = null;

        // Try movie first
        if (movieResults.length > 0) {
            const tmdbId = movieResults[0].id;
            mpaaRating = await fetchMovieCertification(tmdbId, imdbId);
        }
        // Try TV show if no movie found
        else if (tvResults.length > 0) {
            const tmdbId = tvResults[0].id;
            mpaaRating = await fetchTvCertification(tmdbId, imdbId);
        }
        else {
            // No results found - silent fallback
        }

        // Store in database if found
        if (mpaaRating) {
            try {
                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO mpaa_ratings
                    (imdb_id, mpaa_rating, country, updated_at)
                    VALUES (?, ?, ?, ?)
                `);
                stmt.run(imdbId, mpaaRating, 'US', Date.now());
                console.info(`[TMDB] Stored MPAA rating for ${imdbId}: ${mpaaRating}`);
            } catch (dbError) {
                console.error(`[TMDB] Error storing MPAA rating: ${dbError.message}`);
            }
        }

        return mpaaRating;

    } catch (error) {
        if (error.response?.status === 429) {
            console.warn(`[TMDB] Rate limit hit for ${imdbId}`);
        } else if (error.response?.status === 404) {
            console.info(`[TMDB] No data found for ${imdbId}`);
        } else {
            console.warn(`[TMDB] Error fetching ${imdbId}: ${error.message}`);
        }
        return null;
    }
}

/**
 * Get US certification for a movie
 */
async function fetchMovieCertification(tmdbId, imdbId) {
    try {
        const url = `${TMDB_BASE_URL}/movie/${tmdbId}/release_dates`;
        const response = await axios.get(url, {
            params: { api_key: TMDB_API_KEY },
            timeout: TMDB_TIMEOUT
        });

        const usReleases = response.data.results?.find(r => r.iso_3166_1 === 'US');

        if (usReleases && usReleases.release_dates) {
            const certified = usReleases.release_dates.find(
                rd => rd.certification && rd.certification.trim() !== ''
            );

            if (certified) {
                const rating = certified.certification.trim();
                return rating;
            }
        }

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Get US content rating for a TV show
 */
async function fetchTvCertification(tmdbId, imdbId) {
    try {
        const url = `${TMDB_BASE_URL}/tv/${tmdbId}/content_ratings`;
        const response = await axios.get(url, {
            params: { api_key: TMDB_API_KEY },
            timeout: TMDB_TIMEOUT
        });

        const usRating = response.data.results?.find(r => r.iso_3166_1 === 'US');

        if (usRating && usRating.rating) {
            const rating = usRating.rating.trim();
            return rating;
        }

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Fetch TMDB data (ratings, release dates, streaming providers) by IMDb ID
 * @param {string} imdbId - IMDb ID (e.g., "tt0111161")
 * @param {string} region - ISO 3166-1 country code for streaming providers (default: 'US')
 * @returns {Promise<Object|null>} - TMDB data object or null
 */
async function fetchTmdbDataByImdbId(imdbId, region = 'US') {
    if (!TMDB_API_KEY) {
        return null;
    }

    try {
        // Step 1: Find TMDB ID from IMDb ID
        const findUrl = `${TMDB_BASE_URL}/find/${imdbId}`;
        const findResponse = await axios.get(findUrl, {
            params: {
                api_key: TMDB_API_KEY,
                external_source: 'imdb_id'
            },
            timeout: TMDB_TIMEOUT
        });

        const movieResults = findResponse.data.movie_results || [];
        const tvResults = findResponse.data.tv_results || [];

        let tmdbData = null;

        // Try movie first
        if (movieResults.length > 0) {
            const movie = movieResults[0];
            tmdbData = {
                tmdbId: movie.id,
                mediaType: 'movie',
                title: movie.title,
                year: movie.release_date ? new Date(movie.release_date).getFullYear() : null,
                tmdbRating: movie.vote_average || null,
                tmdbVoteCount: movie.vote_count || null,
                releaseDate: movie.release_date || null,
                firstAirDate: null
            };
        }
        // Try TV show if no movie found
        else if (tvResults.length > 0) {
            const tv = tvResults[0];
            tmdbData = {
                tmdbId: tv.id,
                mediaType: 'tv',
                title: tv.name,
                year: tv.first_air_date ? new Date(tv.first_air_date).getFullYear() : null,
                tmdbRating: tv.vote_average || null,
                tmdbVoteCount: tv.vote_count || null,
                releaseDate: null,
                firstAirDate: tv.first_air_date || null
            };
        }

        // Step 2: Fetch streaming providers if we found TMDB data
        if (tmdbData) {
            const streamingProviders = await fetchStreamingProviders(tmdbData.tmdbId, tmdbData.mediaType, region);
            tmdbData.streamingProviders = streamingProviders;
            tmdbData.streamingRegion = region;
        }

        // Store in database if found
        if (tmdbData) {
            try {
                const now = Date.now();
                const streamingProvidersJson = tmdbData.streamingProviders ? JSON.stringify(tmdbData.streamingProviders) : null;

                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO tmdb_metadata
                    (imdb_id, tmdb_id, media_type, title, year, tmdb_rating, tmdb_vote_count,
                     release_date, first_air_date, updated_at, ratings_cached_at,
                     streaming_providers, streaming_region, streaming_cached_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                stmt.run(
                    imdbId,
                    tmdbData.tmdbId,
                    tmdbData.mediaType,
                    tmdbData.title,
                    tmdbData.year,
                    tmdbData.tmdbRating,
                    tmdbData.tmdbVoteCount,
                    tmdbData.releaseDate,
                    tmdbData.firstAirDate,
                    now,
                    tmdbData.tmdbRating ? now : null,
                    streamingProvidersJson,
                    tmdbData.streamingRegion,
                    // Store negative cache timestamp even if no providers found (to avoid repeated fetches)
                    now
                );

                console.info(`[TMDB] Stored TMDB data for ${imdbId}: ${tmdbData.title}${streamingProvidersJson ? ` (streaming: ${tmdbData.streamingProviders.join(', ')})` : ''}`);
            } catch (dbError) {
                console.error(`[TMDB] Error storing TMDB data: ${dbError.message}`);
            }
        }

        return tmdbData;

    } catch (error) {
        if (error.response?.status === 429) {
            console.warn(`[TMDB] Rate limit hit for ${imdbId}`);
        } else if (error.response?.status === 404) {
            console.info(`[TMDB] No data found for ${imdbId}`);
        } else {
            console.warn(`[TMDB] Error fetching ${imdbId}: ${error.message}`);
        }
        return null;
    }
}

/**
 * Fetch streaming providers from TMDB by TMDB ID and region
 * @param {number} tmdbId - TMDB ID
 * @param {string} mediaType - Media type ('movie' or 'tv')
 * @param {string} region - ISO 3166-1 country code (e.g., 'US', 'GB', 'CA')
 * @returns {Promise<string[]|null>} - Array of provider names or null
 */
async function fetchStreamingProviders(tmdbId, mediaType, region = 'US') {
    if (!TMDB_API_KEY) {
        return null;
    }

    try {
        const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
        const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}/watch/providers`;
        const response = await axios.get(url, {
            params: { api_key: TMDB_API_KEY },
            timeout: TMDB_TIMEOUT
        });

        // Get providers for the specified region
        const regionData = response.data.results?.[region];

        if (!regionData || !regionData.flatrate) {
            // No streaming providers for this region
            return null;
        }

        // Extract provider names from flatrate (subscription services)
        let providers = regionData.flatrate.map(p => p.provider_name);

        // Filter out "with Ads" variants - keep only the base service name
        // e.g., "Netflix Standard with Ads" is filtered out, keep only "Netflix"
        const withAdsPattern = /\b(?:with Ads?|Standard with Ads?)\s*$/i;
        providers = providers.filter(name => !withAdsPattern.test(name));

        return providers.length > 0 ? providers : null;

    } catch (error) {
        // Silent failure for streaming providers - they're optional metadata
        return null;
    }
}

// *** MPAA RATING API ENDPOINTS ***

// GET /api/mpaa-rating/:imdbId - Get MPAA rating (with TMDB fallback)
app.get('/api/mpaa-rating/:imdbId', async (req, res) => {
    try {
        const { imdbId } = req.params;
        console.info(`[MPAA] Request for: ${imdbId}`);

        // Step 1: Check database first
        const result = db.prepare(
            'SELECT mpaa_rating, country, updated_at FROM mpaa_ratings WHERE imdb_id = ?'
        ).get(imdbId);

        if (result) {
            const now = Date.now();
            const oneWeek = 7 * 24 * 60 * 60 * 1000; // 1 week
            const isStale = (now - result.updated_at) > oneWeek;

            if (!isStale) {
                const hasRating = !!(result.mpaa_rating && result.mpaa_rating.trim());
                console.info(`[MPAA] Found in database${hasRating ? '' : ' (negative cache)'}: ${hasRating ? result.mpaa_rating : 'none'}`);
                return res.json({
                    imdbId: imdbId,
                    mpaaRating: hasRating ? result.mpaa_rating : null,
                    mpaa_rating: hasRating ? result.mpaa_rating : null,
                    country: result.country,
                    updatedAt: new Date(result.updated_at).toISOString(),
                    updated_at: result.updated_at,
                    source: 'database',
                    cached: true
                });
            } else {
                console.info(`[MPAA] Cached value stale, refetching from TMDB: ${imdbId}`);
            }
        }

        // Step 2: Not in database, try TMDB
        console.info(`[MPAA] Not in database, fetching from TMDB: ${imdbId}`);
        const tmdbRating = await fetchMpaaFromTmdb(imdbId);

        if (tmdbRating) {
            console.info(`[MPAA] Fetched from TMDB: ${tmdbRating}`);
            return res.json({
                imdbId: imdbId,
                mpaaRating: tmdbRating,
                mpaa_rating: tmdbRating,
                country: 'US',
                updatedAt: new Date().toISOString(),
                updated_at: Date.now(),
                source: 'tmdb'
            });
        }

        // Step 3: Not found anywhere — store negative cache to avoid repeat fetches within TTL
        try {
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO mpaa_ratings
                (imdb_id, mpaa_rating, country, updated_at)
                VALUES (?, '', 'US', ?)
            `);
            stmt.run(imdbId, Date.now());
            console.info(`[MPAA] Negative cache stored for ${imdbId} (no MPAA rating)`);
        } catch (dbErr) {
            console.warn(`[MPAA] Failed to store negative cache for ${imdbId}: ${dbErr.message}`);
        }

        console.info(`[MPAA] Not found in database or TMDB: ${imdbId}`);
        return res.status(404).json({ error: 'MPAA rating not found' });

    } catch (error) {
        console.error(`[MPAA] Error processing ${req.params.imdbId}:`, error);
        res.status(500).json({ error: 'MPAA rating read failed' });
    }
});

// POST /api/mpaa-rating - Store MPAA rating
app.post('/api/mpaa-rating', (req, res) => {
    try {
        const { imdbId, mpaaRating, country = 'US', updatedAt } = req.body;

        if (!imdbId || !mpaaRating) {
            return res.status(400).json({ error: 'Missing imdbId or mpaaRating' });
        }

        const timestamp = updatedAt ? new Date(updatedAt).getTime() : Date.now();

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO mpaa_ratings
            (imdb_id, mpaa_rating, country, updated_at)
            VALUES (?, ?, ?, ?)
        `);

        stmt.run(imdbId, mpaaRating, country, timestamp);

        res.json({
            success: true,
            rating: { imdbId, mpaaRating, country }
        });
    } catch (error) {
        console.error('MPAA rating write error:', error);
        res.status(500).json({ error: 'MPAA rating write failed' });
    }
});

// *** TMDB DATA API ENDPOINTS ***

// GET /api/tmdb-data/:imdbId - Get TMDB data (ratings, release dates, streaming) with caching
app.get('/api/tmdb-data/:imdbId', async (req, res) => {
    try {
        const { imdbId } = req.params;
        const region = req.query.region || 'US'; // Get region from query parameter
        console.info(`[TMDB-DATA] Request for: ${imdbId} (region: ${region})`);

        if (!imdbId || !imdbId.startsWith('tt')) {
            return res.status(400).json({ error: 'Invalid IMDb ID. Must start with "tt"' });
        }

        // Step 1: Check database first
        const result = db.prepare(`
            SELECT tmdb_id, media_type, title, year, tmdb_rating, tmdb_vote_count,
                   release_date, first_air_date, updated_at, ratings_cached_at,
                   streaming_providers, streaming_region, streaming_cached_at
            FROM tmdb_metadata WHERE imdb_id = ?
        `).get(imdbId);

        if (result) {
            const now = Date.now();
            const oneWeek = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds
            const twoWeeks = 14 * 24 * 60 * 60 * 1000; // 2 weeks in milliseconds

            // Check if ratings need refresh (older than 1 week)
            const ratingsNeedRefresh = result.ratings_cached_at && (now - result.ratings_cached_at) > oneWeek;

            // Check if streaming needs refresh (older than 2 weeks OR different region)
            const streamingNeedRefresh = result.streaming_cached_at &&
                ((now - result.streaming_cached_at) > twoWeeks || result.streaming_region !== region);

            // If both are fresh, return cached data
            if (!ratingsNeedRefresh && !streamingNeedRefresh) {
                console.info(`[TMDB-DATA] Found in database (cached): ${result.title || imdbId}`);

                // Parse streaming providers from JSON
                let streamingProviders = null;
                if (result.streaming_providers) {
                    try {
                        streamingProviders = JSON.parse(result.streaming_providers);
                    } catch (e) {
                        console.warn(`[TMDB-DATA] Failed to parse streaming providers for ${imdbId}`);
                    }
                }

                return res.json({
                    imdbId,
                    tmdbId: result.tmdb_id,
                    mediaType: result.media_type,
                    title: result.title,
                    year: result.year,
                    tmdbRating: result.tmdb_rating,
                    tmdbVoteCount: result.tmdb_vote_count,
                    releaseDate: result.release_date,
                    firstAirDate: result.first_air_date,
                    streamingProviders,
                    streamingRegion: result.streaming_region,
                    updatedAt: new Date(result.updated_at).toISOString(),
                    ratingsCachedAt: result.ratings_cached_at ? new Date(result.ratings_cached_at).toISOString() : null,
                    streamingCachedAt: result.streaming_cached_at ? new Date(result.streaming_cached_at).toISOString() : null,
                    source: 'database',
                    cached: true
                });
            } else {
                console.info(`[TMDB-DATA] Data stale for ${imdbId}, will refetch from TMDB`);
            }
        }

        // Step 2: Not in database or data is stale, fetch from TMDB
        if (!TMDB_API_KEY) {
            console.warn('[TMDB-DATA] TMDB_API_KEY not configured');
            return res.status(503).json({ error: 'TMDB API not configured' });
        }

        console.info(`[TMDB-DATA] Fetching from TMDB: ${imdbId}`);
        const tmdbData = await fetchTmdbDataByImdbId(imdbId, region);

        if (tmdbData) {
            console.info(`[TMDB-DATA] Fetched from TMDB: ${tmdbData.title}`);
            return res.json({
                ...tmdbData,
                imdbId,
                source: 'tmdb',
                cached: false
            });
        }

        // Step 3: Not found anywhere
        console.info(`[TMDB-DATA] Not found in database or TMDB: ${imdbId}`);
        return res.status(404).json({ error: 'TMDB data not found' });

    } catch (error) {
        console.error(`[TMDB-DATA] Error processing ${req.params.imdbId}:`, error);
        res.status(500).json({ error: 'TMDB data fetch failed' });
    }
});

// POST /api/tmdb-data - Store TMDB data
app.post('/api/tmdb-data', (req, res) => {
    try {
        const {
            imdbId, tmdbId, mediaType, title, year,
            tmdbRating, tmdbVoteCount, releaseDate, firstAirDate
        } = req.body;

        if (!imdbId) {
            return res.status(400).json({ error: 'Missing imdbId' });
        }

        const now = Date.now();

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO tmdb_metadata
            (imdb_id, tmdb_id, media_type, title, year, tmdb_rating, tmdb_vote_count,
             release_date, first_air_date, updated_at, ratings_cached_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            imdbId,
            tmdbId || null,
            mediaType || null,
            title || null,
            year || null,
            tmdbRating || null,
            tmdbVoteCount || null,
            releaseDate || null,
            firstAirDate || null,
            now,
            tmdbRating ? now : null  // Only set ratings_cached_at if we have a rating
        );

        res.json({
            success: true,
            data: { imdbId, tmdbId, title, tmdbRating, releaseDate, firstAirDate }
        });
    } catch (error) {
        console.error('TMDB data write error:', error);
        res.status(500).json({ error: 'TMDB data write failed' });
    }
});

// *** MAL (MyAnimeList) HELPER FUNCTIONS ***

/**
 * Fetch MAL data (rating, votes) by MAL ID
 * @param {string} malId - MAL ID (e.g., "40028")
 * @returns {Promise<Object|null>} - MAL data object or null
 */
async function fetchMalDataByMalId(malId) {
    if (!MAL_CLIENT_ID) {
        return null;
    }

    try {
        const url = `${MAL_BASE_URL}/anime/${malId}`;
        const response = await axios.get(url, {
            headers: {
                'X-MAL-CLIENT-ID': MAL_CLIENT_ID
            },
            params: {
                fields: 'mean,num_scoring_users,title'
            },
            timeout: MAL_TIMEOUT
        });

        const data = response.data;

        // Use num_scoring_users (people who actually rated it)
        const voteCount = data.num_scoring_users || null;

        if (!data || !data.mean) {
            console.info(`[MAL] No rating data found for ${malId}`);
            return null;
        }

        const malData = {
            malId,
            title: data.title || null,
            malRating: data.mean || null,
            malVotes: voteCount,
            imdbId: null // Can be populated if we have a mapping
        };

        console.info(`[MAL] Retrieved data for ${malId}: title="${data.title}", mean=${data.mean}, votes=${voteCount}`);

        // Store in database if we have any data
        if (malData.malRating || malData.malVotes) {
            try {
                const now = Date.now();
                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO mal_metadata
                    (mal_id, title, mal_rating, mal_votes, updated_at, ratings_cached_at, imdb_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

                stmt.run(
                    malId,
                    malData.title,
                    malData.malRating,
                    malData.malVotes,
                    now,
                    now,
                    malData.imdbId
                );

                console.info(`[MAL] Stored MAL data for ${malId}: ${malData.title} - Rating=${malData.malRating}, Votes=${malData.malVotes}`);
            } catch (dbError) {
                console.error(`[MAL] Error storing MAL data: ${dbError.message}`);
            }
        }

        return malData;

    } catch (error) {
        if (error.response?.status === 429) {
            console.warn(`[MAL] Rate limit hit for ${malId}`);
        } else if (error.response?.status === 401) {
            console.error(`[MAL] Invalid API Client ID`);
        } else if (error.response?.status === 404) {
            console.info(`[MAL] Anime not found: ${malId}`);
        } else {
            console.warn(`[MAL] Error fetching ${malId}: ${error.message}`);
        }
        return null;
    }
}

// *** MAL DATA API ENDPOINTS ***

// GET /api/mal-data/:malId - Get MAL data (rating, votes) with caching
app.get('/api/mal-data/:malId', async (req, res) => {
    try {
        const { malId } = req.params;
        console.info(`[MAL-DATA] Request for: ${malId}`);

        if (!malId || !/^\d+$/.test(malId)) {
            return res.status(400).json({ error: 'Invalid MAL ID. Must be a numeric ID' });
        }

        // Step 1: Check database first
        const result = db.prepare(`
            SELECT mal_id, title, mal_rating, mal_votes, updated_at, ratings_cached_at, imdb_id
            FROM mal_metadata WHERE mal_id = ?
        `).get(malId);

        if (result) {
            const now = Date.now();
            const oneWeek = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

            // Check if ratings need refresh (older than 1 week)
            const ratingsNeedRefresh = result.ratings_cached_at && (now - result.ratings_cached_at) > oneWeek;

            if (!ratingsNeedRefresh) {
                console.info(`[MAL-DATA] Found in database (cached): ${result.title} - Rating=${result.mal_rating}, Votes=${result.mal_votes}`);
                return res.json({
                    malId: result.mal_id,
                    title: result.title,
                    malRating: result.mal_rating,
                    malVotes: result.mal_votes,
                    imdbId: result.imdb_id,
                    updatedAt: new Date(result.updated_at).toISOString(),
                    ratingsCachedAt: result.ratings_cached_at ? new Date(result.ratings_cached_at).toISOString() : null,
                    source: 'database',
                    cached: true
                });
            } else {
                console.info(`[MAL-DATA] Ratings stale for ${malId}, will refetch from MAL`);
            }
        }

        // Step 2: Not in database or ratings are stale, fetch from MAL
        if (!MAL_CLIENT_ID) {
            console.warn('[MAL-DATA] MAL_CLIENT_ID not configured');
            return res.status(503).json({ error: 'MAL API not configured' });
        }

        console.info(`[MAL-DATA] Fetching from MAL API: ${malId}`);
        const malData = await fetchMalDataByMalId(malId);

        if (malData && (malData.malRating || malData.malVotes)) {
            console.info(`[MAL-DATA] Fetched from MAL: ${malData.title} - Rating=${malData.malRating}, Votes=${malData.malVotes}`);
            return res.json({
                ...malData,
                source: 'mal',
                cached: false
            });
        }

        // Step 3: Not found anywhere — write negative cache entry to avoid repeated fetches
        try {
            const now = Date.now();
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO mal_metadata
                (mal_id, title, mal_rating, mal_votes, updated_at, ratings_cached_at, imdb_id)
                VALUES (?, NULL, NULL, NULL, ?, ?, NULL)
            `);
            stmt.run(malId, now, now);
            console.info(`[MAL-DATA] Negative cache stored for ${malId} (no MAL data)`);
        } catch (dbErr) {
            console.warn(`[MAL-DATA] Failed to store negative cache for ${malId}: ${dbErr.message}`);
        }

        console.info(`[MAL-DATA] Not found in database or MAL: ${malId}`);
        return res.status(404).json({ error: 'MAL data not found' });

    } catch (error) {
        console.error(`[MAL-DATA] Error processing ${req.params.malId}:`, error);
        res.status(500).json({ error: 'MAL data fetch failed' });
    }
});

// POST /api/mal-data - Store MAL data
app.post('/api/mal-data', (req, res) => {
    try {
        const {
            malId, title, malRating, malVotes, imdbId
        } = req.body;

        if (!malId) {
            return res.status(400).json({ error: 'Missing malId' });
        }

        const now = Date.now();

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO mal_metadata
            (mal_id, title, mal_rating, mal_votes, updated_at, ratings_cached_at, imdb_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            malId,
            title || null,
            malRating || null,
            malVotes || null,
            now,
            now,
            imdbId || null
        );

        console.info(`[MAL-DATA] Stored: MAL ID ${malId} - ${title} (Rating: ${malRating}, Votes: ${malVotes})`);

        res.json({
            message: 'MAL data stored successfully',
            malId,
            title,
            malRating,
            malVotes,
            imdbId
        });
    } catch (error) {
        console.error('[MAL-DATA] Error storing MAL data:', error);
        res.status(500).json({ error: 'Failed to store MAL data' });
    }
});

// *** OMDB HELPER FUNCTIONS ***

/**
 * Fetch OMDB data (Rotten Tomatoes, Metacritic) by IMDb ID
 * @param {string} imdbId - IMDb ID (e.g., "tt0111161")
 * @returns {Promise<Object|null>} - OMDB data object or null
 */
async function fetchOmdbDataByImdbId(imdbId) {
    if (!OMDB_API_KEY) {
        return null;
    }

    try {
        const url = `${OMDB_BASE_URL}`;
        const response = await axios.get(url, {
            params: {
                apikey: OMDB_API_KEY,
                i: imdbId,
                plot: 'short'
            },
            timeout: OMDB_TIMEOUT
        });

        const data = response.data;

        console.info(`[OMDB-DIAG] Raw OMDB response for ${imdbId}: Type=${data.Type}, Title=${data.Title}, Response=${data.Response}`);
        console.info(`[OMDB-DIAG] Ratings array length: ${data.Ratings ? data.Ratings.length : 0}`);
        if (data.Ratings && Array.isArray(data.Ratings)) {
            data.Ratings.forEach(r => console.info(`[OMDB-DIAG]   - ${r.Source}: ${r.Value}`));
        }
        console.info(`[OMDB-DIAG] Metascore field: ${data.Metascore}`);

        if (data.Response === 'False') {
            console.info(`[OMDB] No data found for ${imdbId}`);
            return null;
        }

        // Parse ratings from the Ratings array
        let rottenTomatoes = null;
        let metacritic = null;

        if (data.Ratings && Array.isArray(data.Ratings)) {
            const rtRating = data.Ratings.find(r => r.Source === 'Rotten Tomatoes');
            if (rtRating) {
                rottenTomatoes = rtRating.Value; // e.g., "83%"
                console.info(`[OMDB-DIAG] Found RT rating: ${rottenTomatoes}`);
            } else {
                console.info(`[OMDB-DIAG] No Rotten Tomatoes rating found in Ratings array`);
            }

            const mcRating = data.Ratings.find(r => r.Source === 'Metacritic');
            if (mcRating) {
                // Parse "68/100" to integer 68
                const match = mcRating.Value.match(/^(\d+)/);
                if (match) {
                    metacritic = parseInt(match[1]);
                    console.info(`[OMDB-DIAG] Found MC rating: ${metacritic}`);
                }
            } else {
                console.info(`[OMDB-DIAG] No Metacritic rating found in Ratings array`);
            }
        } else {
            console.info(`[OMDB-DIAG] No Ratings array in OMDB response`);
        }

        // Fallback to Metascore field if Metacritic not in Ratings array
        if (!metacritic && data.Metascore && data.Metascore !== 'N/A') {
            metacritic = parseInt(data.Metascore);
            console.info(`[OMDB-DIAG] Using Metascore fallback: ${metacritic}`);
        }

        const omdbData = {
            rottenTomatoes,
            metacritic
        };

        // Store in database if we have any data
        if (rottenTomatoes || metacritic) {
            try {
                const now = Date.now();
                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO omdb_metadata
                    (imdb_id, rotten_tomatoes, metacritic, updated_at, ratings_cached_at)
                    VALUES (?, ?, ?, ?, ?)
                `);

                stmt.run(
                    imdbId,
                    rottenTomatoes,
                    metacritic,
                    now,
                    now
                );

                console.info(`[OMDB] Stored OMDB data for ${imdbId}: RT=${rottenTomatoes}, MC=${metacritic}`);
            } catch (dbError) {
                console.error(`[OMDB] Error storing OMDB data: ${dbError.message}`);
            }
        }

        return omdbData;

    } catch (error) {
        if (error.response?.status === 429) {
            console.warn(`[OMDB] Rate limit hit for ${imdbId}`);
        } else if (error.response?.status === 401) {
            console.error(`[OMDB] Invalid API key`);
        } else {
            console.warn(`[OMDB] Error fetching ${imdbId}: ${error.message}`);
        }
        return null;
    }
}

// *** OMDB DATA API ENDPOINTS ***

// GET /api/omdb-data/:imdbId - Get OMDB data (Rotten Tomatoes, Metacritic) with caching
app.get('/api/omdb-data/:imdbId', async (req, res) => {
    try {
        const { imdbId } = req.params;
        console.info(`[OMDB-DATA] Request for: ${imdbId}`);

        if (!imdbId || !imdbId.startsWith('tt')) {
            return res.status(400).json({ error: 'Invalid IMDb ID. Must start with "tt"' });
        }

        // Step 1: Check database first
        const result = db.prepare(`
            SELECT rotten_tomatoes, metacritic, updated_at, ratings_cached_at
            FROM omdb_metadata WHERE imdb_id = ?
        `).get(imdbId);

        if (result) {
            const now = Date.now();
            const oneWeek = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

            // Check if ratings need refresh (older than 1 week)
            const ratingsNeedRefresh = result.ratings_cached_at && (now - result.ratings_cached_at) > oneWeek;

            if (!ratingsNeedRefresh) {
                console.info(`[OMDB-DATA] Found in database (cached): RT=${result.rotten_tomatoes}, MC=${result.metacritic}`);
                return res.json({
                    imdbId,
                    rottenTomatoes: result.rotten_tomatoes,
                    metacritic: result.metacritic,
                    updatedAt: new Date(result.updated_at).toISOString(),
                    ratingsCachedAt: result.ratings_cached_at ? new Date(result.ratings_cached_at).toISOString() : null,
                    source: 'database',
                    cached: true
                });
            } else {
                console.info(`[OMDB-DATA] Ratings stale for ${imdbId}, will refetch from OMDB`);
            }
        }

        // Step 2: Not in database or ratings are stale, fetch from OMDB
        if (!OMDB_API_KEY) {
            console.warn('[OMDB-DATA] OMDB_API_KEY not configured');
            return res.status(503).json({ error: 'OMDB API not configured' });
        }

        console.info(`[OMDB-DATA] Fetching from OMDB: ${imdbId}`);
        const omdbData = await fetchOmdbDataByImdbId(imdbId);

        if (omdbData && (omdbData.rottenTomatoes || omdbData.metacritic)) {
            console.info(`[OMDB-DATA] Fetched from OMDB: RT=${omdbData.rottenTomatoes}, MC=${omdbData.metacritic}`);
            return res.json({
                ...omdbData,
                imdbId,
                source: 'omdb',
                cached: false
            });
        }

        // Step 3: Not found anywhere — write negative cache entry to avoid repeated fetches
        try {
            const now = Date.now();
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO omdb_metadata
                (imdb_id, rotten_tomatoes, metacritic, updated_at, ratings_cached_at)
                VALUES (?, NULL, NULL, ?, ?)
            `);
            stmt.run(imdbId, now, now);
            console.info(`[OMDB-DATA] Negative cache stored for ${imdbId} (no OMDB data)`);
        } catch (dbErr) {
            console.warn(`[OMDB-DATA] Failed to store negative cache for ${imdbId}: ${dbErr.message}`);
        }

        console.info(`[OMDB-DATA] Not found in database or OMDB: ${imdbId}`);
        return res.status(404).json({ error: 'OMDB data not found' });

    } catch (error) {
        console.error(`[OMDB-DATA] Error processing ${req.params.imdbId}:`, error);
        res.status(500).json({ error: 'OMDB data fetch failed' });
    }
});

// POST /api/omdb-data - Store OMDB data
app.post('/api/omdb-data', (req, res) => {
    try {
        const {
            imdbId, rottenTomatoes, metacritic
        } = req.body;

        if (!imdbId) {
            return res.status(400).json({ error: 'Missing imdbId' });
        }

        const now = Date.now();

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO omdb_metadata
            (imdb_id, rotten_tomatoes, metacritic, updated_at, ratings_cached_at)
            VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(
            imdbId,
            rottenTomatoes || null,
            metacritic || null,
            now,
            now
        );

        res.json({
            success: true,
            data: { imdbId, rottenTomatoes, metacritic }
        });
    } catch (error) {
        console.error('OMDB data write error:', error);
        res.status(500).json({ error: 'OMDB data write failed' });
    }
});

// *** SERIES SCRAPED RATINGS ENDPOINTS ***

// GET /api/series-ratings/:imdbId - Get scraped series ratings from database
app.get('/api/series-ratings/:imdbId', (req, res) => {
    try {
        const { imdbId } = req.params;

        if (!imdbId || !imdbId.startsWith('tt')) {
            return res.status(400).json({ error: 'Invalid IMDb ID' });
        }

        const result = db.prepare(`
            SELECT * FROM series_scraped_ratings WHERE imdb_id = ?
        `).get(imdbId);

        if (!result) {
            return res.status(404).json({ error: 'Series ratings not found' });
        }

        // Convert column names to camelCase
        res.json({
            imdbId: result.imdb_id,
            title: result.title,
            rtCriticsScore: result.rt_critics_score,
            rtAudienceScore: result.rt_audience_score,
            rtUrl: result.rt_url,
            mcMetascore: result.mc_metascore,
            mcUserScore: result.mc_user_score,
            mcUrl: result.mc_url,
            scrapeAttemptedAt: result.scrape_attempted_at,
            scrapeSucceededAt: result.scrape_succeeded_at,
            scrapeFailedCount: result.scrape_failed_count,
            cache_until: result.cache_until
        });

    } catch (error) {
        console.error(`[SERIES-RATINGS] Error fetching ${req.params.imdbId}:`, error);
        res.status(500).json({ error: 'Database error' });
    }
});

// POST /api/series-ratings - Store scraped series ratings
app.post('/api/series-ratings', (req, res) => {
    try {
        const {
            imdbId, title,
            rtCriticsScore, rtAudienceScore, rtUrl,
            mcMetascore, mcUserScore, mcUrl,
            scrapeAttemptedAt, scrapeSucceededAt, scrapeFailedCount,
            cacheUntil
        } = req.body;

        if (!imdbId || !title) {
            return res.status(400).json({ error: 'Missing imdbId or title' });
        }

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO series_scraped_ratings
            (imdb_id, title, rt_critics_score, rt_audience_score, rt_url,
             mc_metascore, mc_user_score, mc_url,
             scrape_attempted_at, scrape_succeeded_at, scrape_failed_count, cache_until)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            imdbId, title,
            rtCriticsScore || null, rtAudienceScore || null, rtUrl || null,
            mcMetascore || null, mcUserScore || null, mcUrl || null,
            scrapeAttemptedAt, scrapeSucceededAt || null, scrapeFailedCount || 0,
            cacheUntil
        );

        console.info(`[SERIES-RATINGS] Stored ratings for ${imdbId}: RT=${rtCriticsScore}/${rtAudienceScore}, MC=${mcMetascore}/${mcUserScore}`);

        res.json({ success: true, imdbId });

    } catch (error) {
        console.error('[SERIES-RATINGS] Database write error:', error);
        res.status(500).json({ error: 'Database write failed' });
    }
});

// DELETE /api/series-ratings/:imdbId - Clear cache (set cache_until to 0)
app.delete('/api/series-ratings/:imdbId', (req, res) => {
    try {
        const { imdbId } = req.params;

        if (!imdbId || !imdbId.startsWith('tt')) {
            return res.status(400).json({ error: 'Invalid IMDb ID' });
        }

        const stmt = db.prepare(`
            UPDATE series_scraped_ratings
            SET cache_until = 0
            WHERE imdb_id = ?
        `);

        const result = stmt.run(imdbId);

        if (result.changes > 0) {
            console.info(`[SERIES-RATINGS] Cache cleared for ${imdbId}`);
            res.json({ success: true, imdbId });
        } else {
            res.status(404).json({ error: 'Series ratings not found' });
        }

    } catch (error) {
        console.error(`[SERIES-RATINGS] Error clearing cache for ${req.params.imdbId}:`, error);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/series-ratings/stats - Get series ratings statistics
app.get('/api/series-ratings/stats', (req, res) => {
    try {
        const now = Date.now();

        const stats = db.prepare(`
            SELECT
                COUNT(*) as total_entries,
                COUNT(CASE WHEN rt_critics_score IS NOT NULL THEN 1 END) as with_rt_critics,
                COUNT(CASE WHEN rt_audience_score IS NOT NULL THEN 1 END) as with_rt_audience,
                COUNT(CASE WHEN mc_metascore IS NOT NULL THEN 1 END) as with_mc_metascore,
                COUNT(CASE WHEN mc_user_score IS NOT NULL THEN 1 END) as with_mc_userscore,
                COUNT(CASE WHEN cache_until > ? THEN 1 END) as cached_valid,
                COUNT(CASE WHEN cache_until <= ? THEN 1 END) as cached_expired,
                COUNT(CASE WHEN scrape_failed_count > 0 THEN 1 END) as with_failures,
                AVG(scrape_failed_count) as avg_failed_count
            FROM series_scraped_ratings
        `).get(now, now);

        res.json({
            totalEntries: parseInt(stats.total_entries),
            withRtCritics: parseInt(stats.with_rt_critics),
            withRtAudience: parseInt(stats.with_rt_audience),
            withMcMetascore: parseInt(stats.with_mc_metascore),
            withMcUserscore: parseInt(stats.with_mc_userscore),
            cachedValid: parseInt(stats.cached_valid),
            cachedExpired: parseInt(stats.cached_expired),
            withFailures: parseInt(stats.with_failures),
            avgFailedCount: parseFloat(stats.avg_failed_count || 0).toFixed(2)
        });

    } catch (error) {
        console.error('[SERIES-RATINGS] Error fetching stats:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// *** NEW: STATS AND MAINTENANCE ENDPOINTS ***

// GET /api/stats/cache - Cache and mapping statistics
app.get('/api/stats/cache', (req, res) => {
    try {
        const now = Date.now();

        // Cache statistics
        const cacheStats = db.prepare(`
            SELECT 
                COUNT(*) as total_entries,
                COUNT(CASE WHEN expires_at > ? THEN 1 END) as active_entries,
                COUNT(CASE WHEN expires_at <= ? THEN 1 END) as expired_entries
            FROM api_cache
        `).get(now, now);

        // Mapping statistics
        const mappingStats = db.prepare(`
            SELECT 
                COUNT(*) as total_mappings,
                COUNT(CASE WHEN source = 'manual' THEN 1 END) as manual_mappings,
                COUNT(CASE WHEN source = 'tmdb' THEN 1 END) as tmdb_mappings,
                COUNT(CASE WHEN source = 'api_discovery' THEN 1 END) as api_discovery_mappings,
                COUNT(CASE WHEN source = 'imdb_fallback' THEN 1 END) as imdb_fallback_mappings
            FROM kitsu_imdb_mappings
        `).get();

        const mpaaStats = db.prepare(`
            SELECT COUNT(*) as total_mpaa_ratings FROM mpaa_ratings
        `).get();

        res.json({
            cache: {
                totalEntries: parseInt(cacheStats.total_entries),
                activeEntries: parseInt(cacheStats.active_entries),
                expiredEntries: parseInt(cacheStats.expired_entries)
            },
            mappings: {
                totalMappings: parseInt(mappingStats.total_mappings),
                manualMappings: parseInt(mappingStats.manual_mappings),
                tmdbMappings: parseInt(mappingStats.tmdb_mappings),
                apiDiscoveryMappings: parseInt(mappingStats.api_discovery_mappings),
                imdbFallbackMappings: parseInt(mappingStats.imdb_fallback_mappings)
            },
            mpaa: {
                totalRatings: parseInt(mpaaStats.total_mpaa_ratings)
            }
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Stats failed' });
    }
});

// DELETE /api/cache/cleanup - Clean expired cache entries
app.delete('/api/cache/cleanup', (req, res) => {
    try {
        const now = Date.now();
        const result = db.prepare('DELETE FROM api_cache WHERE expires_at < ?').run(now);

        res.json({
            success: true,
            deletedEntries: result.changes
        });
    } catch (error) {
        console.error('Cache cleanup error:', error);
        res.status(500).json({ error: 'Cleanup failed' });
    }
});

// Health check endpoint (enhanced)
app.get('/health', (req, res) => {
    const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

    // Get cache stats
    let cacheStats = null;
    let mappingStats = null;

    try {
        const now = Date.now();
        const cacheResult = db.prepare(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN expires_at > ? THEN 1 END) as active
            FROM api_cache
        `).get(now);

        const mappingResult = db.prepare('SELECT COUNT(*) as total FROM kitsu_imdb_mappings').get();

        cacheStats = {
            total: parseInt(cacheResult.total),
            active: parseInt(cacheResult.active)
        };

        mappingStats = {
            total: parseInt(mappingResult.total)
        };
    } catch (e) {
        // Cache stats not critical for health check
    }

    res.json({
        status: 'healthy',
        lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
        ratingsCount: ratingsCount.toLocaleString(),
        episodesCount: episodesCount.toLocaleString(),
        cacheStats,
        mappingStats,
        memoryUsage: process.memoryUsage(),
        databaseSize: `${Math.round(dbSize / 1024 / 1024)} MB`,
        optimized: true,
        dataLoaded: ratingsCount > 0 && episodesCount > 0
    });
});

// Status endpoint (enhanced)
app.get('/', (req, res) => {
    const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

    res.json({
        service: 'Enhanced IMDb Ratings API with Caching',
        status: 'active',
        cronSchedule: UPDATE_CRON_SCHEDULE,
        lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
        data: {
            ratings: ratingsCount.toLocaleString(),
            episodes: episodesCount.toLocaleString(),
            compressionRatio: `${((episodesCount / 7000000) * 100).toFixed(1)}%`
        },
        storage: {
            type: 'Enhanced SQLite with Caching (better-sqlite3)',
            size: `${Math.round(dbSize / 1024 / 1024)} MB`,
            memoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`
        },
        optimizations: [
            'Compressed IMDb IDs (integer storage)',
            'Filtered episodes (only rated content)',
            'Optimized indexes and pragmas',
            'Batch processing with transactions',
            'better-sqlite3 for performance',
            '✨ NEW: API response caching',
            '✨ NEW: Kitsu→IMDb mapping storage',
            '✨ NEW: TMDB metadata caching'
        ],
        endpoints: {
            // Existing endpoints
            movieRating: '/api/rating/:imdb_id',
            episodeRating: '/api/episode/:series_id/:season/:episode',
            episodeRatingById: '/api/episode/id/:episode_id',
            health: '/health',

            // New caching endpoints
            getCache: '/api/cache/:key',
            setCache: 'POST /api/cache',

            // New mapping endpoints
            getKitsuMapping: '/api/kitsu-mapping/:kitsu_id',
            setKitsuMapping: 'POST /api/kitsu-mapping',

            // Stats and maintenance
            cacheStats: '/api/stats/cache',
            cacheCleanup: 'DELETE /api/cache/cleanup',

            // Admin endpoints
            rebuildDatabase: 'POST /api/admin/rebuild-database'
        },
        examples: {
            movie: '/api/rating/tt0111161',
            episode: '/api/episode/tt0903747/1/1',
            episodeById: '/api/episode/id/tt0959621',
            kitsuMapping: '/api/kitsu-mapping/7936',
            cacheStats: '/api/stats/cache',
            rebuildDatabase: 'POST /api/admin/rebuild-database'
        }
    });
});

// *** ADMIN ENDPOINTS ***

/**
 * POST /api/admin/rebuild-database
 * Manually trigger IMDb database rebuild (same as cron job)
 * Downloads latest IMDb datasets and rebuilds ratings + episodes tables
 */
app.post('/api/admin/rebuild-database', async (req, res) => {
    console.log('Manual database rebuild triggered via API');

    // Return immediately so request doesn't timeout
    res.json({
        status: 'started',
        message: 'Database rebuild started. This will take 15-20 minutes. Check server logs for progress.',
        note: 'The API will remain available during rebuild (reads from current data until complete)'
    });

    // Run rebuild in background
    setTimeout(async () => {
        try {
            console.log('='.repeat(80));
            console.log('MANUAL DATABASE REBUILD STARTED');
            console.log('='.repeat(80));
            await downloadAndProcessAllData();
            console.log('='.repeat(80));
            console.log('MANUAL DATABASE REBUILD COMPLETED SUCCESSFULLY');
            console.log('='.repeat(80));
        } catch (error) {
            console.error('='.repeat(80));
            console.error('MANUAL DATABASE REBUILD FAILED');
            console.error('Error:', error.message);
            console.error('='.repeat(80));
        }
    }, 100);
});

// *** SCHEDULED MAINTENANCE ***

// Schedule cache cleanup every 6 hours
cron.schedule('0 */6 * * *', () => {
    console.log('Running scheduled cache cleanup...');
    try {
        const now = Date.now();
        const result = db.prepare('DELETE FROM api_cache WHERE expires_at < ?').run(now);
        console.log(`Cleaned up ${result.changes} expired cache entries`);
    } catch (error) {
        console.error('Scheduled cache cleanup failed:', error);
    }
});

// Initialize the server
app.listen(port, async () => {
    console.log(`IMDb Ratings API running on http://localhost:${port}`);
    console.log(`Scheduled updates: ${UPDATE_CRON_SCHEDULE}`);
    console.log(`📊 Status: http://localhost:${port}/`);
    console.log(`📈 Stats: http://localhost:${port}/api/stats/cache`);
    console.log('');

    // Initialize database
    await initDatabase();


    // Check if we already have data
    const hasData = db.prepare("SELECT COUNT(*) as count FROM ratings").get().count > 0;

    if (!hasData) {
        console.log('No data found. Starting optimized download...');
        console.log('This downloads ~400MB but stores efficiently...');
        console.log('Expected final database size: ~100-150MB');
        console.log('Estimated time: 15-20 minutes');
        console.log('');
        await downloadAndProcessAllData();
    } else {
        console.log(`Enhanced database already loaded`);

        // Get counts
        ratingsCount = db.prepare("SELECT COUNT(*) as count FROM ratings").get().count;
        console.log(`   📊 ${ratingsCount.toLocaleString()} ratings`);

        episodesCount = db.prepare("SELECT COUNT(*) as count FROM episodes").get().count;
        console.log(`   📺 ${episodesCount.toLocaleString()} episodes`);

        // Get cache stats
        try {
            const cacheCount = db.prepare("SELECT COUNT(*) as count FROM api_cache").get().count;
            const mappingCount = db.prepare("SELECT COUNT(*) as count FROM kitsu_imdb_mappings").get().count;
            console.log(`   💾 ${cacheCount} cached responses`);
            console.log(`   🎌 ${mappingCount} Kitsu mappings`);
        } catch (e) {
            console.log(`   💾 Cache tables ready`);
        }

        const dbSize = fs.statSync(dbPath).size;
        console.log(`   📁 Database: ${Math.round(dbSize / 1024 / 1024)} MB`);
    }

    // Schedule daily updates at 2 AM
    cron.schedule(UPDATE_CRON_SCHEDULE, async () => {
        console.log('Running scheduled update of optimized IMDb datasets');
        await downloadAndProcessAllData();
    });

    console.log('');
    console.log('✅ Ready to serve enhanced ratings data with caching!');
    console.log('✨ New features:');
    console.log('   - API response caching for rate limit protection');
    console.log('   - Kitsu→IMDb mapping storage for anime support');
    console.log('   - TMDB metadata caching for rich data');
    console.log('   - Automatic cache cleanup every 6 hours');
    console.log('   - Enhanced statistics and monitoring');
    console.log('');
    console.log(`🎬 TMDB Integration: ${TMDB_API_KEY ? '✅ ENABLED (MPAA ratings will be fetched from TMDB)' : '❌ DISABLED (set TMDB_API_KEY to enable)'}`);
});
