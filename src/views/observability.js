/**
 * Admin Observability Dashboard
 * Real-time monitoring of cache performance, latency, and system health
 */

function generateObservabilityHTML(wrapperUrl, grafanaUrl = null) {
  // Generate Grafana section HTML conditionally
  const grafanaSection = grafanaUrl ? `
          <!-- Grafana Link -->
          <div class="table-card">
            <div class="table-header">
              <div class="table-title">Advanced Monitoring</div>
            </div>
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 12px;">
              For detailed time-series graphs, custom queries, and historical data analysis, access the Grafana dashboard.
            </p>
            <a href="${grafanaUrl}" target="_blank" class="btn">
              <i class="fa-solid fa-chart-line"></i> Open Grafana Dashboard
            </a>
          </div>
  ` : `
          <!-- Grafana Not Configured -->
          <div class="table-card" style="background: #f9fafb; border: 2px dashed #d1d5db;">
            <div class="table-header">
              <div class="table-title">Advanced Monitoring</div>
            </div>
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 12px;">
              <i class="fa-solid fa-info-circle"></i> Grafana is available for local development.
              Set <code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px;">GRAFANA_URL</code>
              environment variable to enable the link in production.
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 8px;">
              For local development: <code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px;">docker-compose -f docker-compose.monitoring.yml up -d</code>
            </p>
          </div>
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Observability Dashboard - Ratings Wrapper</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
          }
          .container {
            max-width: 1400px;
            margin: 0 auto;
          }
          .header {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
          }
          .brand i {
            font-size: 28px;
            color: #667eea;
          }
          .brand h1 {
            font-size: 28px;
            color: #111827;
          }
          .subtitle {
            color: #6b7280;
            font-size: 14px;
          }
          .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 24px;
          }
          .metric-card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            transition: transform 0.2s;
          }
          .metric-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0,0,0,0.12);
          }
          .metric-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 12px;
          }
          .metric-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
          }
          .metric-icon.purple { background: #ede9fe; color: #7c3aed; }
          .metric-icon.blue { background: #dbeafe; color: #3b82f6; }
          .metric-icon.green { background: #d1fae5; color: #10b981; }
          .metric-icon.red { background: #fee2e2; color: #ef4444; }
          .metric-icon.orange { background: #fed7aa; color: #f97316; }
          .metric-icon.yellow { background: #fef3c7; color: #f59e0b; }
          .metric-label {
            font-size: 13px;
            color: #6b7280;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .metric-value {
            font-size: 32px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 4px;
          }
          .metric-subtext {
            font-size: 12px;
            color: #9ca3af;
          }
          .loading {
            color: #9ca3af;
            font-style: italic;
          }
          .error {
            color: #ef4444;
            font-size: 14px;
          }
          .table-card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            margin-bottom: 24px;
          }
          .table-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
          }
          .table-title {
            font-size: 18px;
            font-weight: 700;
            color: #111827;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          thead {
            background: #f9fafb;
          }
          th {
            text-align: left;
            padding: 12px;
            font-size: 12px;
            color: #6b7280;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid #e5e7eb;
          }
          td {
            padding: 12px;
            font-size: 13px;
            color: #374151;
            border-bottom: 1px solid #f3f4f6;
          }
          tr:hover td {
            background: #f9fafb;
          }
          .mono {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
            font-size: 12px;
          }
          .badge {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
          }
          .badge.catalog { background: #dbeafe; color: #1e40af; }
          .badge.meta { background: #d1fae5; color: #065f46; }
          .badge.manifest { background: #fef3c7; color: #92400e; }
          .btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 18px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
          }
          .btn:hover {
            background: #5a67d8;
          }
          .btn:disabled {
            background: #d1d5db;
            cursor: not-allowed;
          }
          .cache-version-section {
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            margin-bottom: 24px;
          }
          .version-info {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 16px;
          }
          .version-label {
            font-size: 14px;
            color: #6b7280;
            font-weight: 600;
          }
          .version-value {
            font-size: 24px;
            font-weight: 700;
            color: #111827;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
          }
          .last-bump {
            font-size: 12px;
            color: #9ca3af;
            margin-left: auto;
          }
          .refresh-badge {
            display: inline-block;
            padding: 4px 8px;
            background: #10b981;
            color: white;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            margin-left: 8px;
            animation: pulse 2s infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          .warning-box {
            background: #fef3c7;
            border: 1px solid #fbbf24;
            border-radius: 8px;
            padding: 12px;
            margin-top: 12px;
            font-size: 13px;
            color: #78350f;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <div class="header">
            <div class="brand">
              <i class="fa-solid fa-gauge-high"></i>
              <h1>Observability Dashboard</h1>
            </div>
            <p class="subtitle">Real-time monitoring of cache performance, request latency, and system health</p>
          </div>

          <!-- Metrics Grid -->
          <div class="metrics-grid">
            <!-- Cache Hit Ratio -->
            <div class="metric-card">
              <div class="metric-header">
                <div class="metric-icon purple">
                  <i class="fa-solid fa-bullseye"></i>
                </div>
                <span class="metric-label">Cache Hit Ratio (5m)</span>
              </div>
              <div class="metric-value" id="hitRatio">
                <span class="loading">Loading...</span>
              </div>
              <div class="metric-subtext">Higher is better (target: >60%)</div>
            </div>

            <!-- p95 Latency -->
            <div class="metric-card">
              <div class="metric-header">
                <div class="metric-icon blue">
                  <i class="fa-solid fa-clock"></i>
                </div>
                <span class="metric-label">p95 Latency (5m)</span>
              </div>
              <div class="metric-value" id="p95Latency">
                <span class="loading">Loading...</span>
              </div>
              <div class="metric-subtext">Lower is better (target: <300ms)</div>
            </div>

            <!-- Requests/sec -->
            <div class="metric-card">
              <div class="metric-header">
                <div class="metric-icon green">
                  <i class="fa-solid fa-bolt"></i>
                </div>
                <span class="metric-label">Requests/sec (1m)</span>
              </div>
              <div class="metric-value" id="reqPerSec">
                <span class="loading">Loading...</span>
              </div>
              <div class="metric-subtext">Total throughput</div>
            </div>

            <!-- Rate Limited (429s) -->
            <div class="metric-card">
              <div class="metric-header">
                <div class="metric-icon red">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <span class="metric-label">Rate Limited (5m)</span>
              </div>
              <div class="metric-value" id="rateLimited">
                <span class="loading">Loading...</span>
              </div>
              <div class="metric-subtext">Requests throttled (429s)</div>
            </div>

            <!-- Redis Memory -->
            <div class="metric-card">
              <div class="metric-header">
                <div class="metric-icon orange">
                  <i class="fa-solid fa-memory"></i>
                </div>
                <span class="metric-label">Redis Memory</span>
              </div>
              <div class="metric-value" id="redisMemory">
                <span class="loading">Loading...</span>
              </div>
              <div class="metric-subtext">Used memory (max: 2GB)</div>
            </div>

            <!-- Redis Keys -->
            <div class="metric-card">
              <div class="metric-header">
                <div class="metric-icon yellow">
                  <i class="fa-solid fa-key"></i>
                </div>
                <span class="metric-label">Redis Keys</span>
              </div>
              <div class="metric-value" id="redisKeys">
                <span class="loading">Loading...</span>
              </div>
              <div class="metric-subtext">Total cached entries</div>
            </div>

            <!-- Redis Evictions -->
            <div class="metric-card">
              <div class="metric-header">
                <div class="metric-icon red">
                  <i class="fa-solid fa-trash"></i>
                </div>
                <span class="metric-label">Redis Evictions (15m)</span>
              </div>
              <div class="metric-value" id="redisEvictions">
                <span class="loading">Loading...</span>
              </div>
              <div class="metric-subtext">Keys evicted due to memory pressure</div>
            </div>

            <!-- Stale Cache Serves -->
            <div class="metric-card">
              <div class="metric-header">
                <div class="metric-icon yellow">
                  <i class="fa-solid fa-hourglass-half"></i>
                </div>
                <span class="metric-label">Stale Serves (5m)</span>
              </div>
              <div class="metric-value" id="staleServes">
                <span class="loading">Loading...</span>
              </div>
              <div class="metric-subtext">% of requests served from stale cache</div>
            </div>
          </div>

          <!-- Cache Version Management -->
          <div class="cache-version-section">
            <div class="table-header">
              <div class="table-title">Cache Version Management</div>
            </div>
            <div class="version-info">
              <span class="version-label">Current Version:</span>
              <span class="version-value" id="cacheVersion">
                <span class="loading">Loading...</span>
              </span>
              <span class="last-bump" id="lastBump"></span>
            </div>
            <button class="btn" id="bumpBtn" onclick="bumpCacheVersion()">
              <i class="fa-solid fa-arrow-rotate-right"></i> Bump Cache Version
            </button>
            <div class="warning-box" style="display:none;" id="bumpWarning">
              <strong><i class="fa-solid fa-triangle-exclamation"></i> Warning:</strong>
              Bumping the cache version will invalidate all cached data. This is useful after IMDb database refreshes
              or when you need to force-refresh all catalogs. Current cache will be discarded and rebuilt on demand.
            </div>
          </div>

          <!-- Hot Keys Table -->
          <div class="table-card">
            <div class="table-header">
              <div class="table-title">
                Hot Keys (Last 15 minutes)
                <span class="refresh-badge">Auto-refresh</span>
              </div>
            </div>
            <div id="hotKeysTable">
              <p class="loading">Loading hot keys...</p>
            </div>
          </div>

          ${grafanaSection}
        </div>

        <script>
          const WRAPPER_URL = '${wrapperUrl}';
          let refreshInterval;

          // Fetch aggregated metrics
          async function fetchMetrics() {
            try {
              const response = await fetch('/admin/metrics-aggregate');
              if (!response.ok) throw new Error('Failed to fetch metrics');
              const data = await response.json();

              // Update hit ratio
              const hitRatio = data.hitRatio !== null
                ? (data.hitRatio * 100).toFixed(1) + '%'
                : 'N/A';
              document.getElementById('hitRatio').innerHTML = hitRatio;

              // Update p95 latency
              const p95 = data.p95Latency !== null
                ? Math.round(data.p95Latency * 1000) + 'ms'
                : 'N/A';
              document.getElementById('p95Latency').innerHTML = p95;

              // Update requests/sec
              const rps = data.requestsPerSec !== null
                ? data.requestsPerSec.toFixed(2)
                : '0.00';
              document.getElementById('reqPerSec').innerHTML = rps;

              // Update rate limited
              const rateLimited = data.rateLimitedPerSec !== null
                ? data.rateLimitedPerSec.toFixed(2)
                : '0.00';
              document.getElementById('rateLimited').innerHTML = rateLimited;

              // Update stale serves
              const staleServes = data.staleServesPercent !== null
                ? (data.staleServesPercent * 100).toFixed(1) + '%'
                : 'N/A';
              document.getElementById('staleServes').innerHTML = staleServes;

              // Update Redis evictions
              const evictions = data.redisEvictionsIncrease !== null
                ? Math.round(data.redisEvictionsIncrease)
                : '0';
              document.getElementById('redisEvictions').innerHTML = evictions;

            } catch (error) {
              console.error('Error fetching metrics:', error);
              document.getElementById('hitRatio').innerHTML = '<span class="error">Error</span>';
            }
          }

          // Fetch Redis stats
          async function fetchRedisStats() {
            try {
              const response = await fetch('/admin/stats');
              if (!response.ok) throw new Error('Failed to fetch Redis stats');
              const data = await response.json();

              // Update Redis memory (support newer fields)
              const used = data.memoryUsed || data.memory || 'N/A';
              const max = data.maxMemory || null;
              const policy = data.evictionPolicy || null;
              let memDisplay = used;
              if (max && max !== 'unknown') memDisplay += ' / ' + max;
              if (policy && policy !== 'unknown') memDisplay += ' (' + policy + ')';
              document.getElementById('redisMemory').innerHTML = memDisplay;

              // Update Redis keys
              const keys = data.keys !== undefined ? data.keys.toLocaleString() : 'N/A';
              document.getElementById('redisKeys').innerHTML = keys;

            } catch (error) {
              console.error('Error fetching Redis stats:', error);
              document.getElementById('redisMemory').innerHTML = '<span class="error">Error</span>';
            }
          }

          // Fetch cache version
          async function fetchCacheVersion() {
            try {
              const response = await fetch('/admin/cache-version');
              if (!response.ok) throw new Error('Failed to fetch cache version');
              const data = await response.json();

              document.getElementById('cacheVersion').innerHTML = data.version;

              if (data.lastBumpTime) {
                const bumpDate = new Date(data.lastBumpTime);
                const timeAgo = getTimeAgo(bumpDate);
                document.getElementById('lastBump').innerHTML =
                  \`Last bumped: \${timeAgo}\`;
              } else {
                document.getElementById('lastBump').innerHTML =
                  'No bump history';
              }

            } catch (error) {
              console.error('Error fetching cache version:', error);
              document.getElementById('cacheVersion').innerHTML =
                '<span class="error">Error</span>';
            }
          }

          // Fetch hot keys
          async function fetchHotKeys() {
            try {
              const response = await fetch('/admin/hotkeys?window=15&limit=20');
              if (!response.ok) throw new Error('Failed to fetch hot keys');
              const data = await response.json();

              if (data.hotKeys && data.hotKeys.length > 0) {
                let html = '<table><thead><tr>';
                html += '<th>Rank</th>';
                html += '<th>Count</th>';
                html += '<th>Route</th>';
                html += '<th>Type</th>';
                html += '<th>Catalog/Meta ID</th>';
                html += '<th>Page</th>';
                html += '<th>Config</th>';
                html += '<th>User</th>';
                html += '</tr></thead><tbody>';

                data.hotKeys.forEach((item, index) => {
                  html += '<tr>';
                  html += \`<td><strong>#\${index + 1}</strong></td>\`;
                  html += \`<td><strong>\${item.count.toLocaleString()}</strong></td>\`;
                  html += \`<td><span class="badge \${item.route}">\${item.route}</span></td>\`;
                  html += \`<td>\${item.type || '-'}</td>\`;
                  html += \`<td class="mono">\${item.catalogId || item.metaId || '-'}</td>\`;
                  html += \`<td>\${item.page || '-'}</td>\`;
                  html += \`<td class="mono">\${item.configHash}</td>\`;
                  html += \`<td>\${item.userId === '_' ? 'anon' : 'auth'}</td>\`;
                  html += '</tr>';
                });

                html += '</tbody></table>';
                document.getElementById('hotKeysTable').innerHTML = html;
              } else {
                document.getElementById('hotKeysTable').innerHTML =
                  '<p style="color: #9ca3af; font-size: 14px;">No hot keys data available yet. Generate some traffic to see cache activity.</p>';
              }

            } catch (error) {
              console.error('Error fetching hot keys:', error);
              document.getElementById('hotKeysTable').innerHTML =
                '<p class="error">Error loading hot keys</p>';
            }
          }

          // Bump cache version
          async function bumpCacheVersion() {
            if (!confirm('Are you sure you want to bump the cache version? This will invalidate all cached data.')) {
              return;
            }

            const btn = document.getElementById('bumpBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Bumping...';

            try {
              const response = await fetch('/admin/bump-cache-version', {
                method: 'POST'
              });

              if (!response.ok) throw new Error('Failed to bump cache version');
              const data = await response.json();

              alert(\`Cache version bumped successfully!\\nOld: \${data.oldVersion}\\nNew: \${data.newVersion}\`);

              // Refresh cache version display
              await fetchCacheVersion();

            } catch (error) {
              console.error('Error bumping cache version:', error);
              alert('Error: ' + error.message);
            } finally {
              btn.disabled = false;
              btn.innerHTML = '<i class="fa-solid fa-arrow-rotate-right"></i> Bump Cache Version';
            }
          }

          // Get time ago string
          function getTimeAgo(date) {
            const seconds = Math.floor((new Date() - date) / 1000);

            const intervals = {
              year: 31536000,
              month: 2592000,
              week: 604800,
              day: 86400,
              hour: 3600,
              minute: 60
            };

            for (const [unit, secondsInUnit] of Object.entries(intervals)) {
              const interval = Math.floor(seconds / secondsInUnit);
              if (interval >= 1) {
                return interval === 1
                  ? \`1 \${unit} ago\`
                  : \`\${interval} \${unit}s ago\`;
              }
            }

            return 'just now';
          }

          // Initialize dashboard
          async function init() {
            await Promise.all([
              fetchMetrics(),
              fetchRedisStats(),
              fetchCacheVersion(),
              fetchHotKeys()
            ]);

            // Refresh every 5 seconds
            refreshInterval = setInterval(async () => {
              await Promise.all([
                fetchMetrics(),
                fetchRedisStats(),
                fetchHotKeys()
              ]);
            }, 5000);
          }

          // Show bump warning on hover
          document.getElementById('bumpBtn').addEventListener('mouseenter', () => {
            document.getElementById('bumpWarning').style.display = 'block';
          });

          document.getElementById('bumpBtn').addEventListener('mouseleave', () => {
            document.getElementById('bumpWarning').style.display = 'none';
          });

          // Start
          init();
        </script>
      </body>
    </html>
  `;
}

module.exports = { generateObservabilityHTML };
