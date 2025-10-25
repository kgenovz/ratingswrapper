/**
 * Load Test Script for Ratings Wrapper
 * Phase 8 - Pre-Release Load Testing
 *
 * Tests main catalog endpoints with 50-100 concurrent connections
 * Duration: 5-10 minutes
 * Monitors: p95 latency, hit ratio, throughput, errors
 */

const autocannon = require('autocannon');
const chalk = require('chalk');

// Configuration
const TARGET_URL = process.env.TEST_URL || 'http://localhost:7000';
const DURATION = parseInt(process.env.TEST_DURATION || '300', 10); // 5 minutes default
const CONNECTIONS = parseInt(process.env.TEST_CONNECTIONS || '75', 10); // 75 VUs default
const PIPELINING = 1; // Requests per connection

// Test catalog endpoints (using a real Cinemeta wrapped config)
const CINEMETA_CONFIG = Buffer.from(JSON.stringify({
  wrappedAddonUrl: 'https://v3-cinemeta.strem.io/manifest.json',
  addonName: 'Cinemeta with Ratings (Load Test)',
  enableRatings: true,
  enableTitleRatings: true,
  ratingLocation: 'title',
  ratingFormat: {
    position: 'prefix',
    template: '⭐ {rating}',
    separator: ' | '
  }
})).toString('base64url');

// Endpoints to test with weights (simulating realistic traffic)
const endpoints = [
  { path: `/${CINEMETA_CONFIG}/catalog/movie/top.json`, weight: 30 },          // Popular catalogs
  { path: `/${CINEMETA_CONFIG}/catalog/movie/popular.json`, weight: 25 },
  { path: `/${CINEMETA_CONFIG}/catalog/series/top.json`, weight: 20 },
  { path: `/${CINEMETA_CONFIG}/catalog/series/popular.json`, weight: 15 },
  { path: `/${CINEMETA_CONFIG}/meta/movie/tt0111161.json`, weight: 5 },        // Meta endpoints
  { path: `/${CINEMETA_CONFIG}/meta/series/tt0944947.json`, weight: 5 },
];

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

console.log(chalk.bold.cyan('\n🚀 Ratings Wrapper Load Test - Phase 8\n'));
console.log(chalk.gray('═'.repeat(60)));
console.log(chalk.white('Target URL:      '), chalk.yellow(TARGET_URL));
console.log(chalk.white('Duration:        '), chalk.yellow(`${DURATION} seconds (${Math.floor(DURATION / 60)} min ${DURATION % 60} sec)`));
console.log(chalk.white('Connections:     '), chalk.yellow(`${CONNECTIONS} concurrent`));
console.log(chalk.white('Test Endpoints:  '), chalk.yellow(endpoints.length));
console.log(chalk.gray('═'.repeat(60)));
console.log(chalk.white('\nEndpoint Distribution:'));
endpoints.forEach(({ path, weight }) => {
  const percentage = ((weight / 100) * 100).toFixed(0);
  console.log(chalk.gray(`  ${percentage}% - ${path.split('/').slice(-1)[0]}`));
});
console.log(chalk.gray('═'.repeat(60)));
console.log(chalk.bold.green('\n✓ Monitor the dashboard at: ') + chalk.cyan(`${TARGET_URL}/admin/observability`));
console.log(chalk.bold.yellow('⚠ Starting in 3 seconds...\n'));

setTimeout(() => {
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

    // Display results
    console.log(chalk.bold.cyan('\n\n📊 Load Test Results\n'));
    console.log(chalk.gray('═'.repeat(60)));

    // Throughput
    console.log(chalk.bold.white('\nThroughput:'));
    console.log(chalk.white('  Requests:        '), chalk.yellow(result.requests.total.toLocaleString()));
    console.log(chalk.white('  Requests/sec:    '), chalk.yellow(result.requests.average.toFixed(2)));
    console.log(chalk.white('  Bytes/sec:       '), chalk.yellow((result.throughput.average / 1024 / 1024).toFixed(2) + ' MB'));

    // Latency
    console.log(chalk.bold.white('\nLatency:'));
    console.log(chalk.white('  Mean:            '), chalk.yellow(result.latency.mean.toFixed(2) + ' ms'));
    console.log(chalk.white('  p50:             '), chalk.yellow(result.latency.p50.toFixed(2) + ' ms'));
    console.log(chalk.white('  p75:             '), chalk.yellow(result.latency.p75.toFixed(2) + ' ms'));
    console.log(chalk.white('  p90:             '), chalk.yellow(result.latency.p90.toFixed(2) + ' ms'));

    const p95Color = result.latency.p95 < 300 ? chalk.green : chalk.red;
    console.log(chalk.white('  p95:             '), p95Color(result.latency.p95.toFixed(2) + ' ms') +
      (result.latency.p95 < 300 ? chalk.green(' ✓') : chalk.red(' ✗ (target: < 300ms)')));

    console.log(chalk.white('  p99:             '), chalk.yellow(result.latency.p99.toFixed(2) + ' ms'));
    console.log(chalk.white('  Max:             '), chalk.yellow(result.latency.max.toFixed(2) + ' ms'));

    // Errors
    console.log(chalk.bold.white('\nErrors:'));
    const errorRate = (result.errors / result.requests.total * 100).toFixed(2);
    const errorColor = result.errors === 0 ? chalk.green : (result.errors < 10 ? chalk.yellow : chalk.red);
    console.log(chalk.white('  Total:           '), errorColor(result.errors + ` (${errorRate}%)`));
    console.log(chalk.white('  Timeouts:        '), chalk.yellow(result.timeouts || 0));
    console.log(chalk.white('  Non-2xx:         '), chalk.yellow(result.non2xx || 0));

    // Status codes
    if (result.statusCodeStats) {
      console.log(chalk.bold.white('\nStatus Codes:'));
      Object.entries(result.statusCodeStats).forEach(([code, count]) => {
        const color = code.startsWith('2') ? chalk.green :
                     code.startsWith('4') ? chalk.yellow : chalk.red;
        console.log(chalk.white(`  ${code}:             `), color(count.toLocaleString()));
      });
    }

    console.log(chalk.gray('\n' + '═'.repeat(60)));

    // Acceptance criteria check
    console.log(chalk.bold.cyan('\n✓ Acceptance Criteria Check:\n'));

    const p95Pass = result.latency.p95 < 300;
    const errorRatePass = errorRate < 1;

    console.log(p95Pass ? chalk.green('  ✓ p95 latency < 300ms') : chalk.red('  ✗ p95 latency >= 300ms'));
    console.log(errorRatePass ? chalk.green('  ✓ Error rate < 1%') : chalk.red('  ✗ Error rate >= 1%'));
    console.log(chalk.yellow('  ⚠ Check dashboard for hit ratio > 60%'));
    console.log(chalk.yellow('  ⚠ Check Redis for memory stability'));

    console.log(chalk.gray('\n' + '═'.repeat(60)));
    console.log(chalk.bold.white('\n💡 Next Steps:\n'));
    console.log(chalk.white('  1. Check the observability dashboard for cache hit ratio'));
    console.log(chalk.white('  2. Verify no secrets in logs (check logs/ directory)'));
    console.log(chalk.white('  3. Monitor Redis memory usage for leaks'));
    console.log(chalk.white('  4. Review hot keys to identify traffic patterns\n'));

    // Exit code based on acceptance
    process.exit(p95Pass && errorRatePass ? 0 : 1);
  });

  // Progress bar
  autocannon.track(instance, {
    renderProgressBar: true,
    renderResultsTable: false,
    renderLatencyTable: false
  });

}, 3000);
