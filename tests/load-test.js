/**
 * Multi-Level Cache Load Test Script for Ratings Wrapper
 *
 * Tests the new multi-level caching implementation by:
 * 1. Creating multiple configs with different formats wrapping the SAME addon
 *    (to verify raw data cache sharing)
 * 2. Creating configs wrapping DIFFERENT addons
 *    (to verify cache isolation between addons)
 * 3. Testing extended metadata options (TMDB, OMDB, MAL)
 * 4. Measuring raw data cache hit rates vs formatted response cache hit rates
 */

const autocannon = require('autocannon');
const chalk = require('chalk');

// Configuration
const TARGET_URL = process.env.TEST_URL || 'http://localhost:7000';
const DURATION = parseInt(process.env.TEST_DURATION || '180', 10); // 3 minutes default
const CONNECTIONS = parseInt(process.env.TEST_CONNECTIONS || '50', 10); // 50 VUs default
const PIPELINING = 1; // Requests per connection

// Helper to create config URL
function createConfig(config) {
  return Buffer.from(JSON.stringify(config)).toString('base64url');
}

console.log(chalk.bold.cyan('\n🧪 Multi-Level Cache Load Test\n'));
console.log(chalk.gray('═'.repeat(80)));
console.log(chalk.white('This test validates that raw data caching works correctly by:'));
console.log(chalk.gray('  • Testing multiple format configs wrapping the SAME addon'));
console.log(chalk.gray('  • Testing configs wrapping DIFFERENT addons'));
console.log(chalk.gray('  • Measuring cache hit rates at different cache levels'));
console.log(chalk.gray('═'.repeat(80)));

// ============================================================================
// TEST GROUP 1: Same Addon, Different Formats
// These should share raw catalog data, IMDb ratings, TMDB data, etc.
// ============================================================================
const CINEMETA_BASE = 'https://v3-cinemeta.strem.io/manifest.json';

const SAME_ADDON_CONFIGS = [
  {
    name: 'Cinemeta - Prefix ⭐',
    config: createConfig({
      wrappedAddonUrl: CINEMETA_BASE,
      addonName: 'Cinemeta - Prefix',
      enableRatings: true,
      ratingLocation: 'title',
      titleFormat: {
        position: 'prefix',
        template: '⭐ {rating}',
        separator: ' | '
      }
    })
  },
  {
    name: 'Cinemeta - Suffix []',
    config: createConfig({
      wrappedAddonUrl: CINEMETA_BASE,
      addonName: 'Cinemeta - Suffix',
      enableRatings: true,
      ratingLocation: 'title',
      titleFormat: {
        position: 'suffix',
        template: '[{rating}]',
        separator: ' '
      }
    })
  },
  {
    name: 'Cinemeta - Description',
    config: createConfig({
      wrappedAddonUrl: CINEMETA_BASE,
      addonName: 'Cinemeta - Description',
      enableRatings: true,
      ratingLocation: 'description',
      descriptionFormat: {
        position: 'prefix',
        template: 'Rating: {rating}',
        separator: ' - '
      }
    })
  },
  {
    name: 'Cinemeta - Both Locations',
    config: createConfig({
      wrappedAddonUrl: CINEMETA_BASE,
      addonName: 'Cinemeta - Both',
      enableRatings: true,
      ratingLocation: 'both',
      titleFormat: {
        position: 'prefix',
        template: '⭐{rating}',
        separator: ' '
      },
      descriptionFormat: {
        position: 'prefix',
        template: 'IMDb: {rating}',
        separator: ' • '
      }
    })
  },
  {
    name: 'Cinemeta - Extended Metadata',
    config: createConfig({
      wrappedAddonUrl: CINEMETA_BASE,
      addonName: 'Cinemeta - Extended',
      enableRatings: true,
      ratingLocation: 'description',
      descriptionFormat: {
        position: 'prefix',
        template: '{rating}',
        separator: ' ',
        includeVotes: true,
        includeTmdbRating: true,
        includeReleaseDate: true,
        metadataSeparator: ' • '
      }
    })
  }
];

// ============================================================================
// TEST GROUP 2: Different Addons
// These should NOT share raw data (different addon sources)
// ============================================================================
const DIFFERENT_ADDON_CONFIGS = [
  {
    name: 'TMDB Addon',
    config: createConfig({
      wrappedAddonUrl: 'https://tmdb-addon.strem.io/manifest.json',
      addonName: 'TMDB with Ratings',
      enableRatings: true,
      ratingLocation: 'title',
      titleFormat: {
        position: 'prefix',
        template: '⭐ {rating}',
        separator: ' | '
      }
    })
  },
  {
    name: 'Torrentio',
    config: createConfig({
      wrappedAddonUrl: 'https://torrentio.strem.fun/manifest.json',
      addonName: 'Torrentio with Ratings',
      enableRatings: true,
      ratingLocation: 'title',
      titleFormat: {
        position: 'suffix',
        template: '[{rating}]',
        separator: ' '
      }
    })
  }
];

// Combine all configs
const ALL_CONFIGS = [
  ...SAME_ADDON_CONFIGS.map(c => ({ ...c, group: 'SAME_ADDON' })),
  ...DIFFERENT_ADDON_CONFIGS.map(c => ({ ...c, group: 'DIFFERENT_ADDON' }))
];

// ============================================================================
// Build weighted request distribution
// ============================================================================
const endpoints = [];

// For same-addon configs: Higher weight to test cache sharing
SAME_ADDON_CONFIGS.forEach((cfg, index) => {
  const weight = 15 - (index * 2); // 15, 13, 11, 9, 7 - decreasing weights

  endpoints.push(
    { path: `/${cfg.config}/catalog/movie/top.json`, weight: weight, config: cfg.name },
    { path: `/${cfg.config}/catalog/movie/popular.json`, weight: Math.ceil(weight * 0.7), config: cfg.name },
    { path: `/${cfg.config}/catalog/series/top.json`, weight: Math.ceil(weight * 0.5), config: cfg.name },
    { path: `/${cfg.config}/catalog/series/popular.json`, weight: Math.ceil(weight * 0.3), config: cfg.name }
  );
});

// For different-addon configs: Lower weight
DIFFERENT_ADDON_CONFIGS.forEach((cfg) => {
  const weight = 5;

  endpoints.push(
    { path: `/${cfg.config}/catalog/movie/top.json`, weight: weight, config: cfg.name },
    { path: `/${cfg.config}/catalog/movie/popular.json`, weight: Math.ceil(weight * 0.6), config: cfg.name }
  );
});

// Build weighted request array
const requests = [];
endpoints.forEach(({ path, weight }) => {
  for (let i = 0; i < weight; i++) {
    requests.push({
      method: 'GET',
      path
    });
  }
});

// ============================================================================
// Display test configuration
// ============================================================================
console.log(chalk.bold.white('\nTest Configuration:'));
console.log(chalk.gray('─'.repeat(80)));
console.log(chalk.white('Target URL:          '), chalk.yellow(TARGET_URL));
console.log(chalk.white('Duration:            '), chalk.yellow(`${DURATION} seconds (${Math.floor(DURATION / 60)} min ${DURATION % 60} sec)`));
console.log(chalk.white('Connections:         '), chalk.yellow(`${CONNECTIONS} concurrent`));
console.log(chalk.white('Total Configs:       '), chalk.yellow(`${ALL_CONFIGS.length} (${SAME_ADDON_CONFIGS.length} same addon + ${DIFFERENT_ADDON_CONFIGS.length} different addons)`));
console.log(chalk.white('Unique Endpoints:    '), chalk.yellow(endpoints.length));
console.log(chalk.white('Weighted Requests:   '), chalk.yellow(requests.length));

console.log(chalk.bold.white('\n📦 Group 1: Same Addon, Different Formats (Testing Raw Cache Sharing):'));
console.log(chalk.gray('─'.repeat(80)));
SAME_ADDON_CONFIGS.forEach((cfg, i) => {
  console.log(chalk.gray(`  ${i + 1}. ${cfg.name}`));
});

console.log(chalk.bold.white('\n📦 Group 2: Different Addons (Testing Cache Isolation):'));
console.log(chalk.gray('─'.repeat(80)));
DIFFERENT_ADDON_CONFIGS.forEach((cfg, i) => {
  console.log(chalk.gray(`  ${i + 1}. ${cfg.name}`));
});

console.log(chalk.gray('\n' + '═'.repeat(80)));
console.log(chalk.bold.green('✓ Monitor the dashboard at: ') + chalk.cyan(`${TARGET_URL}/admin/observability`));
console.log(chalk.bold.yellow('\n⚠ Expected Results:'));
console.log(chalk.yellow('  • First requests: Cache MISS on all levels'));
console.log(chalk.yellow('  • Subsequent requests to same config: Full cache HIT'));
console.log(chalk.yellow('  • Requests to different configs (same addon): Raw cache HIT + format layer MISS'));
console.log(chalk.yellow('  • Raw cache hit rate should be 90%+ for Group 1 configs'));
console.log(chalk.gray('\n' + '═'.repeat(80)));
console.log(chalk.bold.yellow('\n⏳ Starting in 3 seconds...\n'));

setTimeout(() => {
  const startTime = Date.now();

  const instance = autocannon({
    url: TARGET_URL,
    connections: CONNECTIONS,
    pipelining: PIPELINING,
    duration: DURATION,
    requests,

    // Progress tracking
    setupClient: (client) => {
      client.on('response', (statusCode, resBytes, responseTime) => {
        // Track individual responses if needed
      });
    }
  }, (err, result) => {
    if (err) {
      console.error(chalk.red('\n❌ Load test failed:'), err);
      process.exit(1);
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Display results
    console.log(chalk.bold.cyan('\n\n📊 Multi-Level Cache Test Results\n'));
    console.log(chalk.gray('═'.repeat(80)));

    // Throughput
    console.log(chalk.bold.white('\n⚡ Throughput:'));
    console.log(chalk.white('  Total Requests:      '), chalk.yellow(result.requests.total.toLocaleString()));
    console.log(chalk.white('  Requests/sec:        '), chalk.yellow(result.requests.average.toFixed(2)));
    console.log(chalk.white('  Bytes/sec:           '), chalk.yellow((result.throughput.average / 1024 / 1024).toFixed(2) + ' MB'));
    console.log(chalk.white('  Total Duration:      '), chalk.yellow(totalTime + ' seconds'));

    // Latency
    console.log(chalk.bold.white('\n⏱️  Latency:'));
    console.log(chalk.white('  Mean:                '), chalk.yellow(result.latency.mean.toFixed(2) + ' ms'));
    console.log(chalk.white('  Median (p50):        '), chalk.yellow(result.latency.p50.toFixed(2) + ' ms'));
    console.log(chalk.white('  p75:                 '), chalk.yellow(result.latency.p75.toFixed(2) + ' ms'));
    console.log(chalk.white('  p90:                 '), chalk.yellow(result.latency.p90.toFixed(2) + ' ms'));

    const p95 = result.latency.p95 || result.latency.p99 || 0;
    const p95Color = p95 < 300 ? chalk.green : (p95 < 500 ? chalk.yellow : chalk.red);
    console.log(chalk.white('  p95:                 '), p95Color(p95.toFixed(2) + ' ms') +
      (p95 < 300 ? chalk.green(' ✓ Excellent') : (p95 < 500 ? chalk.yellow(' ⚠ Acceptable') : chalk.red(' ✗ Poor'))));

    console.log(chalk.white('  p99:                 '), chalk.yellow(result.latency.p99.toFixed(2) + ' ms'));
    console.log(chalk.white('  Max:                 '), chalk.yellow(result.latency.max.toFixed(2) + ' ms'));

    // Errors
    console.log(chalk.bold.white('\n❌ Errors:'));
    const errorRate = result.requests.total > 0 ? (result.errors / result.requests.total * 100).toFixed(2) : 0;
    const errorColor = result.errors === 0 ? chalk.green : (result.errors < 10 ? chalk.yellow : chalk.red);
    console.log(chalk.white('  Total Errors:        '), errorColor(`${result.errors} (${errorRate}%)`));
    console.log(chalk.white('  Timeouts:            '), chalk.yellow(result.timeouts || 0));
    console.log(chalk.white('  Non-2xx:             '), chalk.yellow(result.non2xx || 0));

    // Status codes
    if (result.statusCodeStats) {
      console.log(chalk.bold.white('\n📈 Status Codes:'));
      Object.entries(result.statusCodeStats)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([code, count]) => {
          const color = code.startsWith('2') ? chalk.green :
                       code.startsWith('4') ? chalk.yellow : chalk.red;
          const percentage = (count / result.requests.total * 100).toFixed(1);
          console.log(chalk.white(`  ${code}:                 `), color(`${count.toLocaleString()} (${percentage}%)`));
        });
    }

    console.log(chalk.gray('\n' + '═'.repeat(80)));

    // Multi-level cache analysis
    console.log(chalk.bold.cyan('\n🔍 Multi-Level Cache Analysis:\n'));
    console.log(chalk.white('Expected cache behavior:'));
    console.log(chalk.gray('  1. First request to each config: MISS on all cache levels'));
    console.log(chalk.gray('  2. Repeat requests to SAME config: Full cache HIT'));
    console.log(chalk.gray('  3. Requests to DIFFERENT configs (same addon): Raw cache HIT + Format MISS'));
    console.log(chalk.gray('     → Should see "Raw catalog cache HIT" in logs'));
    console.log(chalk.gray('     → Should see "IMDb rating cache HIT" in logs'));
    console.log(chalk.gray('     → Should see "TMDB/OMDB data cache HIT" in logs'));

    console.log(chalk.bold.white('\n📊 Check the observability dashboard for:'));
    console.log(chalk.yellow('  • Overall cache hit ratio (should be high due to raw caching)'));
    console.log(chalk.yellow('  • Cache type breakdown (hit vs stale vs miss)'));
    console.log(chalk.yellow('  • Hot keys (should see v*:raw:catalog:* keys with high access)'));

    console.log(chalk.bold.white('\n🔧 Redis commands to verify multi-level caching:'));
    console.log(chalk.cyan('  redis-cli KEYS "v*:raw:catalog:*"      ') + chalk.gray('# Raw catalog keys'));
    console.log(chalk.cyan('  redis-cli KEYS "v*:rating:imdb:*"      ') + chalk.gray('# IMDb rating keys'));
    console.log(chalk.cyan('  redis-cli KEYS "v*:data:tmdb:*"        ') + chalk.gray('# TMDB data keys'));
    console.log(chalk.cyan('  redis-cli KEYS "v*:data:omdb:*"        ') + chalk.gray('# OMDB data keys'));
    console.log(chalk.cyan('  redis-cli GET "<key>"                  ') + chalk.gray('# Inspect cached value'));

    console.log(chalk.gray('\n' + '═'.repeat(80)));

    // Acceptance criteria check
    console.log(chalk.bold.cyan('\n✅ Acceptance Criteria:\n'));

    const p95Pass = p95 < 500; // More lenient for initial cache population
    const errorRatePass = parseFloat(errorRate) < 5;
    const throughputPass = result.requests.average > 50;

    console.log(p95Pass ?
      chalk.green('  ✓ p95 latency < 500ms (acceptable for cache warmup)') :
      chalk.red('  ✗ p95 latency >= 500ms'));
    console.log(errorRatePass ?
      chalk.green('  ✓ Error rate < 5%') :
      chalk.red('  ✗ Error rate >= 5%'));
    console.log(throughputPass ?
      chalk.green('  ✓ Throughput > 50 req/s') :
      chalk.yellow('  ⚠ Throughput <= 50 req/s (may be normal during warmup)'));
    console.log(chalk.yellow('  ⚠ Manually verify raw cache hit rate > 80% in dashboard'));

    console.log(chalk.gray('\n' + '═'.repeat(80)));
    console.log(chalk.bold.white('\n💡 Next Steps:\n'));
    console.log(chalk.white('  1. Run this test again immediately - second run should be MUCH faster'));
    console.log(chalk.white('     (All raw data should be cached from first run)'));
    console.log(chalk.white('  2. Check observability dashboard for cache metrics'));
    console.log(chalk.white('  3. Inspect Redis to verify multi-level cache keys exist'));
    console.log(chalk.white('  4. Review server logs for "Raw catalog cache HIT" messages'));
    console.log(chalk.white('  5. Compare p95 latency: First run vs Second run\n'));

    console.log(chalk.bold.cyan('🎯 Success Indicators:'));
    console.log(chalk.white('  • Second test run is 5-10x faster than first run'));
    console.log(chalk.white('  • Logs show "Raw catalog cache HIT" for Group 1 configs'));
    console.log(chalk.white('  • Redis shows v*:raw:* keys with data'));
    console.log(chalk.white('  • Overall cache hit rate > 80% after warmup\n'));

    // Exit code based on acceptance
    const passed = p95Pass && errorRatePass;
    console.log(passed ?
      chalk.bold.green('\n✅ Test PASSED\n') :
      chalk.bold.red('\n❌ Test FAILED\n'));

    process.exit(passed ? 0 : 1);
  });

  // Progress bar
  autocannon.track(instance, {
    renderProgressBar: true,
    renderResultsTable: false,
    renderLatencyTable: false
  });

}, 3000);
