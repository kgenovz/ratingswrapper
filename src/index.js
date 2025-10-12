/**
 * Stremio Ratings Wrapper Addon
 * Main entry point - sets up Express server
 */

const express = require('express');
const axios = require('axios');
const logger = require('./utils/logger');
const { parseConfigFromPath, encodeConfig } = require('./utils/configParser');
const { createManifestHandler } = require('./handlers/manifest');
const { createCatalogHandler } = require('./handlers/catalog');
const { createMetaHandler } = require('./handlers/meta');
const stremioApi = require('./services/stremioApi');
const kitsuMappingService = require('./services/kitsuMappingService');
const config = require('./config');

// Create Express app
const app = express();
// Trust proxy headers so req.protocol reflects X-Forwarded-Proto on Railway/Heroku
app.set('trust proxy', 1);

// Parse JSON bodies
app.use(express.json());

/**
 * Add CORS headers for all routes
 * Required for Stremio to access the addon
 */
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: config.defaults.version });
});

/**
 * Internal Ratings API routes
 * - Proxies to external provider if RATINGS_PROVIDER_URL is set
 * - Optional placeholder with RATINGS_PLACEHOLDER=true
 *
 * Wrapper defaults RATINGS_API_URL to point to these endpoints.
 */
const RATINGS_PROVIDER_URL = process.env.RATINGS_PROVIDER_URL || null;
const RATINGS_PLACEHOLDER = String(process.env.RATINGS_PLACEHOLDER || '').toLowerCase() === 'true';

async function proxyOrPlaceholder(res, providerUrl, pathSegments, placeholderValue) {
  try {
    if (RATINGS_PROVIDER_URL) {
      const url = `${RATINGS_PROVIDER_URL}${providerUrl}`;
      const response = await axios.get(url, { timeout: 8000 });
      return res.json(response.data);
    }
    if (RATINGS_PLACEHOLDER) {
      return res.json(placeholderValue);
    }
    return res.status(404).json({ error: 'No ratings provider configured' });
  } catch (e) {
    return res.status(502).json({ error: 'Ratings provider unavailable', detail: e.message });
  }
}

// Single title rating by IMDb ID
app.get('/ratings/api/rating/:imdbId', async (req, res) => {
  const { imdbId } = req.params;
  await proxyOrPlaceholder(res, `/api/rating/${encodeURIComponent(imdbId)}`, [imdbId], { rating: 8.5 });
});

// Episode rating by seriesId/season/episode
app.get('/ratings/api/episode/:seriesId/:season/:episode', async (req, res) => {
  const { seriesId, season, episode } = req.params;
  await proxyOrPlaceholder(
    res,
    `/api/episode/${encodeURIComponent(seriesId)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`,
    [seriesId, season, episode],
    { rating: 8.3, episodeId: `${seriesId}:${season}:${episode}` }
  );
});

/**
 * DEPRECATED: Old single-addon configuration page (kept for reference only)
 */
/*
app.get('/configure-old', (req, res) => {
  const host = req.get('host') || `localhost:${config.port}`;
  const protocol = req.protocol;

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ratings Wrapper - Configuration</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
          }
          .header h1 {
            font-size: 32px;
            margin-bottom: 10px;
          }
          .header p {
            font-size: 16px;
            opacity: 0.9;
          }
          .content {
            padding: 30px;
          }
          .form-group {
            margin-bottom: 25px;
          }
          label {
            display: block;
            font-weight: 600;
            margin-bottom: 8px;
            color: #333;
            font-size: 14px;
          }
          input[type="text"], input[type="url"], select {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s;
          }
          input[type="text"]:focus, input[type="url"]:focus, select:focus {
            outline: none;
            border-color: #667eea;
          }
          .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
          }
          .checkbox-group {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          input[type="checkbox"] {
            width: 20px;
            height: 20px;
            cursor: pointer;
          }
          .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 14px 28px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
          }
          .btn:active {
            transform: translateY(0);
          }
          .result-section {
            display: none;
            margin-top: 30px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            border: 2px solid #e0e0e0;
          }
          .result-section.show {
            display: block;
          }
          .result-section h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 18px;
          }
          .url-display {
            background: white;
            padding: 15px;
            border-radius: 6px;
            border: 1px solid #ddd;
            word-break: break-all;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            color: #333;
            margin-bottom: 10px;
            position: relative;
          }
          .copy-btn {
            background: #28a745;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: background 0.3s;
          }
          .copy-btn:hover {
            background: #218838;
          }
          .copy-btn.copied {
            background: #5cb85c;
          }
          .install-btn {
            background: #007bff;
            color: white;
            text-decoration: none;
            padding: 10px 20px;
            border-radius: 6px;
            display: inline-block;
            font-size: 14px;
            font-weight: 600;
            margin-left: 10px;
            transition: background 0.3s;
          }
          .install-btn:hover {
            background: #0056b3;
          }
          .help-text {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
          }
          .advanced-toggle {
            background: none;
            border: none;
            color: #667eea;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 15px;
            padding: 0;
          }
          .advanced-toggle:hover {
            text-decoration: underline;
          }
          .advanced-options {
            display: none;
            margin-top: 10px;
          }
          .advanced-options.show {
            display: block;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⭐ Stremio Ratings Wrapper</h1>
            <p>Add IMDb ratings to any Stremio catalog addon</p>
          </div>

          <div class="content">
            <!-- Emergency Restore Section -->
            <div style="background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
              <h3 style="color: #856404; margin-bottom: 10px;">🚨 Stremio Broken? Emergency Restore</h3>
              <p style="font-size: 13px; color: #856404; margin-bottom: 15px;">
                If Stremio is showing "failed to fetch addons" errors, use this to restore your account to a working state.
              </p>
              <div style="display: flex; gap: 10px; align-items: flex-end;">
                <div style="flex: 1;">
                  <input
                    type="text"
                    id="emergencyAuthToken"
                    placeholder="Paste your auth token here"
                    style="width: 100%; padding: 10px; border: 2px solid #ffc107; border-radius: 6px; font-family: monospace; font-size: 12px;"
                  />
                </div>
                <button class="btn" onclick="emergencyRestore()" style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); width: auto;">
                  🔧 Emergency Restore
                </button>
              </div>
              <div id="emergencyStatus" style="display: none; margin-top: 10px; padding: 10px; border-radius: 6px;"></div>
            </div>

            <h2 style="margin-bottom: 20px; color: #333;">Quick Setup</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px;">
              <button type="button" class="btn" onclick="setupCinemeta()" style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);">
                🎬 Wrap Cinemeta (Recommended)
              </button>
              <button type="button" class="btn" onclick="setupCustom()" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                🔧 Wrap Custom Addon
              </button>
            </div>

            <div id="cinemataInfo" style="display: none; background: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #4caf50;">
              <strong>✓ Cinemeta Configuration</strong>
              <p style="margin: 5px 0 0 0; font-size: 13px;">Wrapping Cinemeta will add IMDb ratings to all movie/series titles and episode names across Stremio.</p>
            </div>

            <form id="configForm" style="display: none;">
              <div class="form-group">
                <label for="addonUrl">Stremio Addon URL *</label>
                <input
                  type="url"
                  id="addonUrl"
                  name="addonUrl"
                  placeholder="https://example-addon.com/manifest.json or https://example.com/abc123/manifest.json"
                  required
                />
                <div class="help-text">Paste the full manifest URL of the addon you want to wrap with ratings</div>
              </div>

              <div class="form-group">
                <label for="addonName">Custom Addon Name (optional)</label>
                <input
                  type="text"
                  id="addonName"
                  name="addonName"
                  placeholder="Leave empty to auto-generate from original addon"
                />
                <div class="help-text">Custom name for your wrapped addon (default: "[Original Name] with Ratings")</div>
              </div>

              <button type="button" class="advanced-toggle" onclick="toggleAdvanced()">
                ▶ Advanced Options
              </button>

              <div class="advanced-options" id="advancedOptions">
                <div class="form-group">
                  <label>Rating Position</label>
                  <select id="ratingPosition" name="ratingPosition">
                    <option value="prefix">Prefix (⭐ 8.5 Movie Name)</option>
                    <option value="suffix">Suffix (Movie Name ⭐ 8.5)</option>
                  </select>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label for="ratingTemplate">Rating Template</label>
                    <input
                      type="text"
                      id="ratingTemplate"
                      name="ratingTemplate"
                      placeholder="⭐ {rating}"
                      value="⭐ {rating}"
                    />
                    <div class="help-text">Use {rating} as placeholder</div>
                  </div>

                  <div class="form-group">
                    <label for="ratingSeparator">Separator</label>
                    <input
                      type="text"
                      id="ratingSeparator"
                      name="ratingSeparator"
                      placeholder=" "
                      value=" "
                    />
                    <div class="help-text">Space between rating and title</div>
                  </div>
                </div>

                <div class="form-group">
                  <div class="checkbox-group">
                    <input
                      type="checkbox"
                      id="enableRatings"
                      name="enableRatings"
                      checked
                    />
                    <label for="enableRatings" style="margin-bottom: 0;">Enable Rating Injection</label>
                  </div>
                </div>
              </div>

              <button type="submit" class="btn">Generate Addon URL</button>
            </form>

            <div class="result-section" id="resultSection">
              <h3>🎉 Your Wrapped Addon URL:</h3>
              <div class="url-display" id="generatedUrl"></div>
              <button class="copy-btn" onclick="copyToClipboard()">📋 Copy URL</button>
              <a href="#" class="install-btn" id="installLink" target="_blank">🚀 Install in Stremio</a>

              <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
                <h3 style="margin-bottom: 15px;">🔄 Auto-Replace Original Addon (Recommended)</h3>
                <p style="font-size: 13px; color: #666; margin-bottom: 15px;">
                  For best results, replace the original addon with this wrapped version. This prevents conflicts and ensures ratings show properly.
                </p>

                <div class="form-group" style="margin-bottom: 15px;">
                  <label for="authToken">Stremio Auth Token *</label>
                  <input
                    type="text"
                    id="authToken"
                    placeholder="Paste your auth token from web.stremio.com"
                    style="font-family: monospace; font-size: 12px;"
                  />
                  <div class="help-text">
                    Get your token: Open <a href="https://web.stremio.com" target="_blank">web.stremio.com</a>,
                    press F12, go to Console, and run: <code style="background: #f4f4f4; padding: 2px 4px;">JSON.parse(localStorage.getItem("profile")).auth.key</code>
                  </div>
                </div>

                <button class="btn" onclick="testAuth()" id="testAuthBtn" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); margin-bottom: 10px;">
                  🧪 Test Auth Token
                </button>

                <div id="authStatus" style="display: none; padding: 10px; border-radius: 6px; margin-bottom: 15px;"></div>

                <button class="btn" onclick="replaceAddon()" id="replaceBtn" style="display: none; background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);">
                  🔄 Replace Original Addon
                </button>

                <div id="replaceStatus" style="display: none; padding: 15px; border-radius: 6px; margin-top: 15px;"></div>
              </div>
            </div>
          </div>
        </div>

        <script>
          const serverUrl = window.location.origin;
          const CINEMETA_URL = 'https://v3-cinemeta.strem.io/manifest.json';

          function setupCinemeta() {
            // Pre-fill form with Cinemeta configuration
            document.getElementById('addonUrl').value = CINEMETA_URL;
            document.getElementById('addonName').value = 'Cinemeta with Ratings';
            document.getElementById('configForm').style.display = 'block';
            document.getElementById('cinemataInfo').style.display = 'block';

            // Generate URL directly
            generateAddonUrl();
          }

          function setupCustom() {
            // Show empty form for custom addon
            document.getElementById('addonUrl').value = '';
            document.getElementById('addonName').value = '';
            document.getElementById('configForm').style.display = 'block';
            document.getElementById('cinemataInfo').style.display = 'none';
            document.getElementById('resultSection').classList.remove('show');
          }

          function toggleAdvanced() {
            const advancedOptions = document.getElementById('advancedOptions');
            const toggle = document.querySelector('.advanced-toggle');

            if (advancedOptions.classList.contains('show')) {
              advancedOptions.classList.remove('show');
              toggle.textContent = '▶ Advanced Options';
            } else {
              advancedOptions.classList.add('show');
              toggle.textContent = '▼ Advanced Options';
            }
          }

          function generateAddonUrl() {
            const addonUrl = document.getElementById('addonUrl').value.trim();

            if (!addonUrl) {
              alert('Please enter an addon URL');
              return;
            }

            const addonName = document.getElementById('addonName').value.trim();
            const ratingPosition = document.getElementById('ratingPosition')?.value || 'prefix';
            const ratingTemplate = document.getElementById('ratingTemplate')?.value || '⭐ {rating}';
            const ratingSeparator = document.getElementById('ratingSeparator')?.value || ' ';
            const enableRatings = document.getElementById('enableRatings')?.checked !== false;

            // Build configuration object
            const config = {
              wrappedAddonUrl: addonUrl,
              enableRatings: enableRatings,
              ratingFormat: {
                position: ratingPosition,
                template: ratingTemplate,
                separator: ratingSeparator
              }
            };

            // Only add custom name if provided
            if (addonName) {
              config.addonName = addonName;
            }

            // Encode configuration to base64url
            // First encode to UTF-8 to handle emojis and special characters
            const jsonString = JSON.stringify(config);
            const utf8Bytes = new TextEncoder().encode(jsonString);
            let binaryString = '';
            utf8Bytes.forEach(byte => {
              binaryString += String.fromCharCode(byte);
            });

            let encoded = btoa(binaryString);
            encoded = encoded.split('+').join('-');
            encoded = encoded.split('/').join('_');
            encoded = encoded.split('=').join('');

            // Generate the addon URL
            const manifestUrl = serverUrl + '/' + encoded + '/manifest.json';

            // Display the result
            document.getElementById('generatedUrl').textContent = manifestUrl;
            document.getElementById('installLink').href = manifestUrl;
            document.getElementById('resultSection').classList.add('show');

            // Scroll to result
            document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }

          document.getElementById('configForm').addEventListener('submit', function(e) {
            e.preventDefault();
            generateAddonUrl();
          });

          function copyToClipboard() {
            const url = document.getElementById('generatedUrl').textContent;
            navigator.clipboard.writeText(url).then(() => {
              const btn = document.querySelector('.copy-btn');
              const originalText = btn.textContent;
              btn.textContent = '✓ Copied!';
              btn.classList.add('copied');

              setTimeout(() => {
                btn.textContent = originalText;
                btn.classList.remove('copied');
              }, 2000);
            });
          }

          let currentRemovePattern = '';

          async function testAuth() {
            const authToken = document.getElementById('authToken').value.trim();
            const statusDiv = document.getElementById('authStatus');
            const replaceBtn = document.getElementById('replaceBtn');

            if (!authToken) {
              alert('Please enter your auth token');
              return;
            }

            statusDiv.style.display = 'block';
            statusDiv.style.background = '#fff3cd';
            statusDiv.style.border = '1px solid #ffc107';
            statusDiv.innerHTML = '🔄 Testing auth token...';

            try {
              const response = await fetch(serverUrl + '/api/test-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ authToken })
              });

              const result = await response.json();

              if (result.success) {
                statusDiv.style.background = '#d4edda';
                statusDiv.style.border = '1px solid #28a745';
                statusDiv.innerHTML = '✅ ' + result.message + ' (' + result.addonCount + ' addons found)';
                replaceBtn.style.display = 'block';
              } else {
                statusDiv.style.background = '#f8d7da';
                statusDiv.style.border = '1px solid #dc3545';
                statusDiv.innerHTML = '❌ ' + result.error;
                replaceBtn.style.display = 'none';
              }
            } catch (error) {
              statusDiv.style.background = '#f8d7da';
              statusDiv.style.border = '1px solid #dc3545';
              statusDiv.innerHTML = '❌ Error: ' + error.message;
              replaceBtn.style.display = 'none';
            }
          }

          async function replaceAddon() {
            const authToken = document.getElementById('authToken').value.trim();
            const wrappedAddonUrl = document.getElementById('generatedUrl').textContent;
            const statusDiv = document.getElementById('replaceStatus');
            const replaceBtn = document.getElementById('replaceBtn');

            // Determine what to replace based on wrapped addon URL
            const addonUrl = document.getElementById('addonUrl').value.trim();
            let removePattern = 'cinemeta'; // Default to cinemeta

            if (!addonUrl.includes('v3-cinemeta.strem.io')) {
              // For custom addons, try to extract the pattern
              // This could be improved based on your needs
              removePattern = addonUrl;
            }

            if (!confirm('This will replace the original addon in your Stremio account. Continue?')) {
              return;
            }

            replaceBtn.disabled = true;
            replaceBtn.textContent = '🔄 Replacing...';

            statusDiv.style.display = 'block';
            statusDiv.style.background = '#fff3cd';
            statusDiv.style.border = '1px solid #ffc107';
            statusDiv.innerHTML = '🔄 Replacing addon in your Stremio account...';

            try {
              const response = await fetch(serverUrl + '/api/replace-addon', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  authToken,
                  removePattern,
                  wrappedAddonUrl
                })
              });

              const result = await response.json();

              if (result.success) {
                statusDiv.style.background = '#d4edda';
                statusDiv.style.border = '1px solid #28a745';
                statusDiv.innerHTML = '✅ ' + result.message + '<br><small>Restart Stremio to see the changes.</small>';
              } else {
                statusDiv.style.background = '#f8d7da';
                statusDiv.style.border = '1px solid #dc3545';
                statusDiv.innerHTML = '❌ ' + result.error;
              }
            } catch (error) {
              statusDiv.style.background = '#f8d7da';
              statusDiv.style.border = '1px solid #dc3545';
              statusDiv.innerHTML = '❌ Error: ' + error.message;
            } finally {
              replaceBtn.disabled = false;
              replaceBtn.textContent = '🔄 Replace Original Addon';
            }
          }

          async function emergencyRestore() {
            const authToken = document.getElementById('emergencyAuthToken').value.trim();
            const statusDiv = document.getElementById('emergencyStatus');

            if (!authToken) {
              alert('Please enter your auth token');
              return;
            }

            if (!confirm('This will reset your Stremio addons to just Cinemeta. All other addons will be removed. Continue?')) {
              return;
            }

            statusDiv.style.display = 'block';
            statusDiv.style.background = '#fff3cd';
            statusDiv.style.border = '1px solid #ffc107';
            statusDiv.innerHTML = '🔄 Restoring your Stremio account...';

            try {
              const response = await fetch(serverUrl + '/api/emergency-restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ authToken })
              });

              const result = await response.json();

              if (result.success) {
                statusDiv.style.background = '#d4edda';
                statusDiv.style.border = '1px solid #28a745';
                statusDiv.innerHTML = '✅ ' + result.message;
              } else {
                statusDiv.style.background = '#f8d7da';
                statusDiv.style.border = '1px solid #dc3545';
                statusDiv.innerHTML = '❌ ' + result.error;
              }
            } catch (error) {
              statusDiv.style.background = '#f8d7da';
              statusDiv.style.border = '1px solid #dc3545';
              statusDiv.innerHTML = '❌ Error: ' + error.message;
            }
          }
        </script>
      </body>
    </html>
  `);
});

/**
 * Multi-addon configuration helper (new UI)
 */
app.get('/configure', (req, res) => {
  const host = req.get('host') || `localhost:${config.port}`;
  const protocol = req.protocol;
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ratings Wrapper - Multi Addon Config</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9; min-height: 100vh; padding: 20px; }
          .container { max-width: 960px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); overflow: hidden; }
          .header { background: #eef2ff; color: #111827; padding: 24px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          .brand { background: #4f46e5; color: #ffffff; padding: 16px 18px; border-radius: 10px; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 12px rgba(79,70,229,0.15); }
          .brand h1 { font-size: 28px; margin: 0; line-height: 1.2; }
          .brand .icon { font-size: 22px; opacity: 0.95; }
          .brand .tag { background: rgba(255,255,255,0.15); color: #fff; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-left: auto; }
          .header h2 { font-size: 18px; margin: 14px 0 6px 0; color: #111827; }
          .subtitle { color: #374151; font-size: 14px; margin-bottom: 8px; }
          .steps { margin: 6px 0 0 18px; color: #4b5563; font-size: 13px; }
          .steps li { margin: 2px 0; }
          .content { padding: 24px; }
          .form-group { margin-bottom: 18px; }
          label { display: block; font-weight: 600; margin-bottom: 6px; color: #333; font-size: 14px; }
          input[type="text"], input[type="url"], select { width: 100%; padding: 10px 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 14px; }
          .btn { background: #4f46e5; color: white; border: none; padding: 12px 22px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }
          .btn:hover { background: #4338ca; }
          .row { display: grid; grid-template-columns: 2fr 1fr auto; gap: 10px; align-items: end; }
          .row-2 { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 10px; align-items: start; }
          .url-display { background: #f8fafc; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
          .advanced-toggle { display: none; }
          .advanced-options { display: block; margin-top: 8px; }
          .section-title { font-size: 16px; font-weight: 700; margin: 6px 0 8px 0; color: #1f2937; }
          .preview { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: #111827; }
          .install-btn { background: #0ea5e9; color: white; text-decoration: none; padding: 8px 14px; border-radius: 6px; display: inline-block; font-size: 13px; font-weight: 600; margin-left: 8px; }
          .copy-btn { background: #22c55e; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="brand">
              <i class="fa-solid fa-star icon"></i>
              <h1>Stremio Ratings Wrapper</h1>
              <span class="tag">IMDb Ratings</span>
            </div>
            <h2>Wrap Cinemeta and multiple addons</h2>
            <p class="subtitle">Generate installation URLs or auto‑replace your installed addons. Cinemeta is required and stays first for best results.</p>
            <ol class="steps">
              <li>Add configured addon URLs (Cinemeta is added automatically).</li>
              <li>Optionally tweak rating format for all wrapped addons.</li>
              <li>Click “Generate Wrapped URLs” to get manual install links.</li>
              <li>Or test your token and use “Auto Replace All”.</li>
            </ol>
          </div>
          <div class="content">
            <h2 style="margin-bottom: 10px; color: #111827;">Add Addons</h2>
            <div class="row form-group">
              <div>
                <label for="addonInputUrl">Configured Addon URL</label>
                <input type="url" id="addonInputUrl" placeholder="https://example.com/manifest.json" />
              </div>
              <div>
                <label for="addonInputName">Custom Name (optional)</label>
                <input type="text" id="addonInputName" placeholder="Defaults to: [Original] with Ratings" />
              </div>
              <div>
                <button type="button" class="btn" onclick="addAddon()"><i class="fa-solid fa-plus" style="margin-right:6px"></i>Add</button>
              </div>
            </div>

            <!-- Emergency Restore (bottom) -->
            <div style="background: #fff7ed; border: 2px solid #fdba74; border-radius: 8px; padding: 16px; margin-top: 22px;">
              <h3 style="color:#9a3412; margin-bottom:8px;">Emergency Restore</h3>
              <p style="font-size: 13px; color: #7c2d12; margin-bottom: 10px;">If Stremio is in a broken state, reset to Cinemeta-only, then re-run configuration.</p>
              <div style="display:flex; gap:8px; align-items: end;">
                <div style="flex:1"><input type="text" id="emergencyAuthToken" placeholder="Paste your auth token" style="font-family: monospace;" /></div>
                <button class="btn" onclick="emergencyRestore()"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>Emergency Restore</button>
              </div>
              <div id="emergencyStatus" style="display:none; margin-top: 10px; padding: 10px; border-radius: 6px;"></div>
            </div>

            <div id="advancedOptions" class="advanced-options">
              <div class="section-title">Ratings Display</div>
              <div class="form-group">
                <label>Rating Position</label>
                <select id="ratingPosition"><option value="prefix">Prefix (★ 8.5 Movie)</option><option value="suffix">Suffix (Movie ★ 8.5)</option></select>
              </div>
              <div class="row-2">
                <div class="form-group">
                  <label for="ratingTemplate">Rating Template</label>
                  <input type="text" id="ratingTemplate" value="★ {rating}" />
                  <div class="help-text">Use {rating} as placeholder</div>
                </div>
                <div class="form-group">
                  <label for="ratingSeparator">Separator</label>
                  <input type="text" id="ratingSeparator" value=" | " />
                  <div class="help-text">Default: space + | + space</div>
                </div>
              </div>
              <div class="form-group"><label class="checkbox-group"><input type="checkbox" id="enableRatings" checked /> Enable rating injection</label></div>
              <div class="form-group">
                <div class="help-text" style="margin-bottom:6px;">Preview</div>
                <div id="ratingPreview" class="preview"></div>
              </div>
            </div>

            <div class="form-group">
              <label>Addons To Wrap (Cinemeta required)</label>
              <div id="addonList" class="url-display" style="white-space: normal;"><em>None yet. Cinemeta will be added automatically.</em></div>
              <div class="help-text">Cinemeta will be wrapped and placed first automatically.</div>
            </div>

            <div class="form-group"><button class="btn" onclick="generateAll()">Generate Wrapped URLs</button></div>

            <div class="result-section" id="resultSection" style="display:none;">
              <h3 style="margin-bottom: 10px;">Manual Installation URLs</h3>
              <div id="manualList"></div>
              <div style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                <h3 style="margin-bottom: 10px;">Auto-Replace In Your Account</h3>
                <p style="font-size: 13px; color:#374151;">We remove existing versions and install wrapped versions in-place. Missing ones are appended. Cinemeta is first.</p>
                <div class="form-group">
                  <label for="authToken">Stremio Auth Token *</label>
                  <input type="text" id="authToken" placeholder="Paste your auth token" style="font-family: monospace; font-size: 12px;" />
                  <div class="help-text" style="margin-top:6px;">
                    <strong>Login using an authentication key</strong>
                    <ol style="margin:6px 0 0 18px;">
                      <li>Login to <a href="https://web.stremio.com/" target="_blank">https://web.stremio.com/</a> using your Stremio credentials.</li>
                      <li>Open the developer console and paste: <code>JSON.parse(localStorage.getItem("profile")).auth.key</code></li>
                      <li>Copy the printed value and paste it into the form below.</li>
                    </ol>
                  </div>
                </div>
                <button class="btn" onclick="testAuth()" id="testAuthBtn" style="margin-bottom: 10px;"><i class="fa-solid fa-key" style="margin-right:6px"></i>Test Auth Token</button>
                <div id="authStatus" style="display:none; padding: 10px; border-radius: 6px; margin-bottom: 12px;"></div>
                <button class="btn" onclick="autoReplaceAll()" id="replaceAllBtn" style="display:none;"><i class="fa-solid fa-rotate" style="margin-right:6px"></i>Auto Replace All</button>
                <div id="replaceStatus" style="display:none; padding: 12px; border-radius: 6px; margin-top: 12px;"></div>
              </div>
            </div>

          </div>
        </div>

        <script>
          const serverUrl = '${protocol}://${host}';
          const CINEMETA_URL = 'https://v3-cinemeta.strem.io/manifest.json';
          const state = { items: [] };

          function guessNameFromUrl(u) {
            try {
              var h = (new URL(u)).hostname.replace(/^www\./, '');
              var base = h.split('.')[0];
              if (!base) return 'Addon';
              return base.charAt(0).toUpperCase() + base.slice(1);
            } catch (e) {
              return 'Addon';
            }
          }

          function makeExpandableRow(it, idx) {
            var row = document.createElement('div');
            row.style.borderBottom = '1px dashed #e5e7eb';
            row.style.padding = '8px 0';

            var header = document.createElement('div');
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.cursor = 'pointer';

            var idxSpan = document.createElement('span');
            idxSpan.textContent = (idx + 1) + '. ';
            header.appendChild(idxSpan);
            if (it.required) {
              var lock = document.createElement('i');
              lock.className = 'fa-solid fa-lock';
              lock.style.color = '#6b7280';
              lock.style.marginRight = '6px';
              header.appendChild(lock);
            }

            var title = document.createElement('strong');
            var displayName = it.name || guessNameFromUrl(it.url);
            title.textContent = ' ' + displayName;
            header.appendChild(title);

            var flex = document.createElement('div');
            flex.style.flex = '1';
            header.appendChild(flex);

            var chevron = document.createElement('i');
            chevron.className = 'fa-solid fa-chevron-right';
            chevron.style.color = '#6b7280';
            chevron.style.marginRight = '8px';
            header.appendChild(chevron);

            if (!it.required) {
              var btn = document.createElement('button');
              btn.textContent = 'Remove';
              btn.style.marginLeft = '8px';
              btn.addEventListener('click', function(ev){ ev.stopPropagation(); removeAddon(idx); });
              header.appendChild(btn);
            }

            var details = document.createElement('div');
            details.style.display = 'none';
            details.style.marginTop = '6px';

            var orig = document.createElement('div');
            var origLbl = document.createElement('span');
            origLbl.style.color = '#374151';
            origLbl.textContent = 'Original: ';
            var origCode = document.createElement('code');
            origCode.textContent = it.url;
            orig.appendChild(origLbl);
            orig.appendChild(origCode);
            details.appendChild(orig);

            // Wrapped URLs are intentionally not shown here; they appear in the manual installation list.

            header.addEventListener('click', function(){
              var open = details.style.display === 'block';
              details.style.display = open ? 'none' : 'block';
              chevron.className = open ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down';
            });

            row.appendChild(header);
            row.appendChild(details);
            return row;
          }

          function ensureCinemeta() {
            if (!state.items.find(i => i.required)) {
              state.items.unshift({ url: CINEMETA_URL, name: 'Cinemeta with Ratings', required: true });
            }
          }

          function renderAddonList() {
            const list = document.getElementById('addonList');
            list.innerHTML = '';
            if (!state.items.length) {
              list.innerHTML = '<em>None yet. Cinemeta will be added automatically.</em>';
              return;
            }
            state.items.forEach(function(it, idx){
              list.appendChild(makeExpandableRow(it, idx));
            });
          }

          async function addAddon() {
            const url = document.getElementById('addonInputUrl').value.trim();
            const nameInput = document.getElementById('addonInputName').value.trim();
            if (!url) { alert('Enter an addon URL'); return; }
            ensureCinemeta();

            // Try to fetch manifest name (best-effort)
            let resolvedName = nameInput || undefined;
            try {
              const resp = await fetch(serverUrl + '/api/fetch-manifest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
              });
              const result = await resp.json();
              if (result && result.success && result.manifest && result.manifest.name) {
                if (!resolvedName) {
                  resolvedName = result.manifest.name + ' with Ratings';
                }
              }
            } catch (e) {
              // ignore errors; fallback to URL only
            }

            state.items.push({ url: url, name: resolvedName });
            document.getElementById('addonInputUrl').value = '';
            document.getElementById('addonInputName').value = '';
            renderAddonList();
          }

          function removeAddon(idx) {
            const it = state.items[idx];
            if (it.required) return;
            state.items.splice(idx, 1);
            renderAddonList();
          }

          function toggleAdvanced() {
            const advancedOptions = document.getElementById('advancedOptions');
            const toggle = document.querySelector('.advanced-toggle');
            if (advancedOptions.classList.contains('show')) { advancedOptions.classList.remove('show'); toggle.textContent = 'Advanced Options'; }
            else { advancedOptions.classList.add('show'); toggle.textContent = 'Hide Advanced'; }
          }

          function encodeConfig(obj) {
            const jsonString = JSON.stringify(obj);
            const utf8Bytes = new TextEncoder().encode(jsonString);
            let binaryString = '';
            utf8Bytes.forEach(b => binaryString += String.fromCharCode(b));
            return btoa(binaryString).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
          }

          function updateRatingPreview() {
            var pos = document.getElementById('ratingPosition')?.value || 'prefix';
            var tpl = document.getElementById('ratingTemplate')?.value || '★ {rating}';
            var sep = document.getElementById('ratingSeparator')?.value || ' | ';
            var enabled = document.getElementById('enableRatings')?.checked !== false;
            var sampleTitle = 'Example Title';
            var sampleRating = '8.5';
            var ratingText = tpl.split('{rating}').join(sampleRating);
            var result = sampleTitle;
            if (enabled) {
              if (pos === 'prefix') result = ratingText + sep + sampleTitle;
              else result = sampleTitle + sep + ratingText;
            }
            var prev = document.getElementById('ratingPreview');
            if (prev) prev.textContent = result;
          }

          function generateAll() {
            ensureCinemeta();
            const ratingPosition = document.getElementById('ratingPosition')?.value || 'prefix';
            const ratingTemplate = document.getElementById('ratingTemplate')?.value || '★ {rating}';
            const ratingSeparator = document.getElementById('ratingSeparator')?.value || ' | ';
            const enableRatings = document.getElementById('enableRatings')?.checked !== false;

            state.items = state.items.map(it => {
              const config = { wrappedAddonUrl: it.url, enableRatings, ratingFormat: { position: ratingPosition, template: ratingTemplate, separator: ratingSeparator } };
              if (it.name) config.addonName = it.name;
              const encoded = encodeConfig(config);
              const wrapped = serverUrl + '/' + encoded + '/manifest.json';
              return { ...it, wrappedUrl: wrapped };
            });
            renderAddonList();
            renderManualList();
            document.getElementById('resultSection').style.display = 'block';
            document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }

          // Wire up live preview
          (function(){
            var rp = document.getElementById('ratingPosition');
            var rt = document.getElementById('ratingTemplate');
            var rs = document.getElementById('ratingSeparator');
            var en = document.getElementById('enableRatings');
            if (rp) rp.addEventListener('change', updateRatingPreview);
            if (rt) rt.addEventListener('input', updateRatingPreview);
            if (rs) rs.addEventListener('input', updateRatingPreview);
            if (en) en.addEventListener('change', updateRatingPreview);
            updateRatingPreview();
          })();

          function renderManualList() {
            const container = document.getElementById('manualList');
            container.innerHTML = '';
            if (!state.items.length) { container.innerHTML = '<em>No wrapped URLs yet.</em>'; return; }
            state.items.forEach((it, idx) => {
              const url = it.wrappedUrl || '(generate first)';
              const box = document.createElement('div');
              box.className = 'url-display';
              const titleDiv = document.createElement('div');
              const strong = document.createElement('strong');
              strong.textContent = (idx + 1) + '. ' + (it.name || 'Wrapped Addon') + (it.required ? ' (Cinemeta)' : '');
              titleDiv.appendChild(strong);
              const urlDiv = document.createElement('div');
              urlDiv.textContent = url;
              const actions = document.createElement('div');
              actions.style.marginTop = '6px';
              const copyBtn = document.createElement('button');
              copyBtn.className = 'copy-btn';
              const copyIcon = document.createElement('i');
              copyIcon.className = 'fa-solid fa-copy';
              copyIcon.style.marginRight = '6px';
              copyBtn.appendChild(copyIcon);
              copyBtn.appendChild(document.createTextNode('Copy'));
              copyBtn.addEventListener('click', () => navigator.clipboard.writeText(url));
              const link = document.createElement('a');
              link.className = 'install-btn';
              link.href = url;
              link.target = '_blank';
              const plug = document.createElement('i');
              plug.className = 'fa-solid fa-plug';
              plug.style.marginRight = '6px';
              link.appendChild(plug);
              link.appendChild(document.createTextNode('Install'));
              actions.appendChild(copyBtn);
              actions.appendChild(document.createTextNode(' '));
              actions.appendChild(link);
              box.appendChild(titleDiv);
              box.appendChild(urlDiv);
              box.appendChild(actions);
              container.appendChild(box);
            });
          }

          async function testAuth() {
            const authToken = document.getElementById('authToken').value.trim();
            const statusDiv = document.getElementById('authStatus');
            const replaceAllBtn = document.getElementById('replaceAllBtn');
            if (!authToken) { alert('Enter your auth token'); return; }
            statusDiv.style.display = 'block'; statusDiv.style.background = '#fff7ed'; statusDiv.style.border = '1px solid #fdba74'; statusDiv.innerHTML = 'Testing auth token...';
            try {
              const response = await fetch(serverUrl + '/api/test-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authToken }) });
              const result = await response.json();
              if (result.success) { statusDiv.style.background = '#d1fae5'; statusDiv.style.border = '1px solid #10b981'; statusDiv.innerHTML = '✔ ' + result.message + ' (' + result.addonCount + ' addons found)'; replaceAllBtn.style.display = 'inline-block'; }
              else { statusDiv.style.background = '#fee2e2'; statusDiv.style.border = '1px solid #ef4444'; statusDiv.innerHTML = '✖ ' + result.error; replaceAllBtn.style.display = 'none'; }
            } catch (e) { statusDiv.style.background = '#fee2e2'; statusDiv.style.border = '1px solid #ef4444'; statusDiv.innerHTML = '✖ Error: ' + e.message; replaceAllBtn.style.display = 'none'; }
          }

          async function autoReplaceAll() {
            const authToken = document.getElementById('authToken').value.trim();
            const statusDiv = document.getElementById('replaceStatus');
            const btn = document.getElementById('replaceAllBtn');
            if (!authToken) { alert('Enter your auth token'); return; }
            if (!state.items.length) { alert('Add at least one addon'); return; }
            const items = state.items.map(it => ({ removePattern: it.required ? 'cinemeta' : it.url, wrappedAddonUrl: it.wrappedUrl }));
            btn.disabled = true; btn.textContent = 'Replacing...';
            statusDiv.style.display = 'block'; statusDiv.style.background = '#fff7ed'; statusDiv.style.border = '1px solid #fdba74'; statusDiv.innerHTML = 'Replacing addons in your account...';
            try {
              const response = await fetch(serverUrl + '/api/replace-addons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authToken, items }) });
              const result = await response.json();
              if (result.success) { statusDiv.style.background = '#d1fae5'; statusDiv.style.border = '1px solid #10b981'; statusDiv.innerHTML = '✔ ' + result.message + '<br><small>Restart Stremio to see the changes.</small>'; }
              else { statusDiv.style.background = '#fee2e2'; statusDiv.style.border = '1px solid #ef4444'; statusDiv.innerHTML = '✖ ' + result.error; }
            } catch (e) { statusDiv.style.background = '#fee2e2'; statusDiv.style.border = '1px solid #ef4444'; statusDiv.innerHTML = '✖ Error: ' + e.message; }
            finally { btn.disabled = false; btn.textContent = 'Auto Replace All'; }
          }

          async function emergencyRestore() {
            const authToken = document.getElementById('emergencyAuthToken').value.trim();
            const statusDiv = document.getElementById('emergencyStatus');
            if (!authToken) { alert('Please enter your auth token'); return; }
            if (!confirm('This will reset your addons to just Cinemeta. Continue?')) { return; }
            statusDiv.style.display = 'block'; statusDiv.style.background = '#fff7ed'; statusDiv.style.border = '1px solid #fdba74'; statusDiv.innerHTML = 'Restoring your Stremio account...';
            try {
              const response = await fetch(serverUrl + '/api/emergency-restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authToken }) });
              const result = await response.json();
              if (result.success) { statusDiv.style.background = '#d1fae5'; statusDiv.style.border = '1px solid #10b981'; statusDiv.innerHTML = '✔ ' + result.message; }
              else { statusDiv.style.background = '#fee2e2'; statusDiv.style.border = '1px solid #ef4444'; statusDiv.innerHTML = '✖ ' + result.error; }
            } catch (e) { statusDiv.style.background = '#fee2e2'; statusDiv.style.border = '1px solid #ef4444'; statusDiv.innerHTML = '✖ Error: ' + e.message; }
          }

          // Initialize list with Cinemeta entry (required)
          ensureCinemeta();
          renderAddonList();
        </script>
      </body>
    </html>
  `);
});

/**
 * Main addon endpoint
 * Serves the manifest for the wrapped addon
 */
app.get('/:config/manifest.json', async (req, res) => {
  try {
    logger.info(`Manifest request received from ${req.ip}`);
    const userConfig = parseConfigFromPath(req.params.config);

    // Call the manifest handler directly
    const manifestHandler = createManifestHandler(userConfig);
    const result = await manifestHandler();

    logger.info('Manifest generated successfully:', JSON.stringify(result.manifest).substring(0, 200));
    res.setHeader('Content-Type', 'application/json');
    res.json(result.manifest);

  } catch (error) {
    logger.error('Error serving manifest:', error.message, error.stack);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Catalog endpoint - with extra parameters
 */
app.get('/:config/catalog/:type/:id/:extra.json', async (req, res) => {
  try {
    const userConfig = parseConfigFromPath(req.params.config);
    const { type, id } = req.params;

    // Parse extra parameters from path (format: key=value&key2=value2)
    const extra = {};
    if (req.params.extra) {
      req.params.extra.split('&').forEach(param => {
        const [key, value] = param.split('=');
        if (key && value) {
          extra[key] = decodeURIComponent(value);
        }
      });
    }

    logger.info(`Catalog request: ${type}/${id} with extra:`, JSON.stringify(extra));

    // Call the catalog handler directly
    const catalogHandler = createCatalogHandler(userConfig);
    const result = await catalogHandler({ type, id, extra });

    res.json(result);

  } catch (error) {
    logger.error('Error serving catalog:', error.message);
    res.status(500).json({ metas: [] });
  }
});

/**
 * Catalog endpoint - without extra parameters
 */
app.get('/:config/catalog/:type/:id.json', async (req, res) => {
  try {
    const userConfig = parseConfigFromPath(req.params.config);
    const { type, id } = req.params;

    // Parse extra parameters from query string (fallback)
    const extra = req.query;

    logger.info(`Catalog request: ${type}/${id}`);

    // Call the catalog handler directly
    const catalogHandler = createCatalogHandler(userConfig);
    const result = await catalogHandler({ type, id, extra });

    res.json(result);

  } catch (error) {
    logger.error('Error serving catalog:', error.message);
    res.status(500).json({ metas: [] });
  }
});

/**
 * Meta endpoint
 */
app.get('/:config/meta/:type/:id.json', async (req, res) => {
  try {
    logger.info(`🔍 META REQUEST from ${req.ip} - ${req.params.type}/${req.params.id}`);
    logger.info(`User-Agent: ${req.headers['user-agent']}`);

    const userConfig = parseConfigFromPath(req.params.config);
    const { type, id } = req.params;

    // Call the meta handler directly
    const metaHandler = createMetaHandler(userConfig);
    const result = await metaHandler({ type, id });

    logger.info(`✅ Meta response sent with ${result.meta?.videos?.length || 0} episodes`);

    // Debug: Log the first video to verify structure
    if (result.meta?.videos && result.meta.videos.length > 0) {
      logger.debug('Sample video:', JSON.stringify(result.meta.videos[0]));
    }

    // Ensure proper Content-Type
    res.setHeader('Content-Type', 'application/json');
    res.json(result);

  } catch (error) {
    logger.error('❌ Error serving meta:', error.message, error.stack);
    res.status(500).json({ meta: null });
  }
});

/**
 * API: Get current addon collection (for debugging)
 */
app.post('/api/get-addons', async (req, res) => {
  try {
    const { authToken } = req.body;

    if (!authToken) {
      return res.status(400).json({ error: 'Auth token required' });
    }

    logger.info('Getting addon collection for debugging...');

    const addons = await stremioApi.getAddonCollection(authToken);

    res.json({
      success: true,
      addons: addons,
      count: addons.length
    });

  } catch (error) {
    logger.error('Get addons failed:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * API: Emergency restore - sets a minimal working addon collection
 */
app.post('/api/emergency-restore', async (req, res) => {
  try {
    const { authToken } = req.body;

    if (!authToken) {
      return res.status(400).json({ error: 'Auth token required' });
    }

    logger.warn('Emergency restore requested!');

    // Get current addons
    let addons = await stremioApi.getAddonCollection(authToken);
    logger.info(`Retrieved ${addons.length} addons from account`);

    // Remove any existing Cinemeta instances
    addons = addons.filter(addon => {
      const manifestId = addon.manifest?.id || '';
      const transportUrl = addon.transportUrl || '';
      return !manifestId.includes('cinemeta') &&
             !transportUrl.includes('v3-cinemeta.strem.io') &&
             !transportUrl.includes('cinemeta');
    });

    logger.info(`After removing Cinemeta: ${addons.length} addons remain`);

    // Add clean Cinemeta at the top (first position)
    addons.unshift({
      transportUrl: 'https://v3-cinemeta.strem.io/manifest.json',
      transportName: 'http',
      manifest: {
        id: 'org.stremio.cinemeta',
        name: 'Cinemeta',
        version: '1.0.0'
      }
    });

    logger.info(`Setting ${addons.length} addons with Cinemeta at position 0`);
    await stremioApi.setAddonCollection(authToken, addons);

    res.json({
      success: true,
      message: `Emergency restore complete! Restored ${addons.length} addons with clean Cinemeta at top. Restart Stremio.`
    });

  } catch (error) {
    logger.error('Emergency restore failed:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * API: Test Stremio authentication
 */
app.post('/api/test-auth', async (req, res) => {
  try {
    const { authToken } = req.body;

    if (!authToken) {
      return res.status(400).json({ error: 'Auth token required' });
    }

    const validation = stremioApi.validateAuthToken(authToken);
    if (!validation.valid) {
      return res.json({
        success: false,
        error: `Invalid token format: ${validation.error}`
      });
    }

    logger.info('Testing Stremio auth token...');

    const addons = await stremioApi.getAddonCollection(authToken);

    res.json({
      success: true,
      message: 'Auth token is valid!',
      addonCount: addons.length
    });

  } catch (error) {
    logger.error('Auth test failed:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * API: Fetch an addon manifest from a URL (used by multi-config UI)
 */
app.post('/api/fetch-manifest', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'url required' });
    }

    const https = require('https');
    const http = require('http');
    const client = url.startsWith('https') ? https : http;

    const data = await new Promise((resolve, reject) => {
      const req2 = client.get(url, (resp) => {
        let body = '';
        resp.on('data', (chunk) => body += chunk);
        resp.on('end', () => resolve(body));
      });
      req2.on('error', reject);
      req2.setTimeout(8000, () => { req2.destroy(new Error('Timeout fetching manifest')); });
    });

    let manifest;
    try {
      manifest = JSON.parse(data);
    } catch (e) {
      return res.json({ success: false, error: 'Invalid JSON from manifest' });
    }

    return res.json({ success: true, manifest: manifest });
  } catch (error) {
    logger.error('Fetch manifest failed:', error.message);
    res.json({ success: false, error: error.message });
  }
});

/**
 * API: Replace addon in Stremio account
 */
app.post('/api/replace-addon', async (req, res) => {
  try {
    const { authToken, removePattern, wrappedAddonUrl } = req.body;

    if (!authToken) {
      return res.status(400).json({ error: 'Auth token required' });
    }

    if (!removePattern || !wrappedAddonUrl) {
      return res.status(400).json({ error: 'removePattern and wrappedAddonUrl required' });
    }

    logger.info(`Replacing addon: ${removePattern} with ${wrappedAddonUrl}`);

    const validation = stremioApi.validateAuthToken(authToken);
    if (!validation.valid) {
      return res.json({
        success: false,
        error: `Invalid token: ${validation.error}`
      });
    }

    // Parse the config from the wrapped addon URL to get the addon name
    const configMatch = wrappedAddonUrl.match(/\/([^/]+)\/manifest\.json$/);
    let addonName = 'Wrapped Addon';
    let addonId = 'ratings-wrapper';

    if (configMatch) {
      try {
        const encodedConfig = configMatch[1];
        const decodedConfig = parseConfigFromPath(encodedConfig);
        addonName = decodedConfig.addonName || 'Ratings Wrapper';
        addonId = `${removePattern}.ratings-wrapper`;
      } catch (e) {
        logger.warn('Could not parse config from URL:', e.message);
      }
    }

    const result = await stremioApi.replaceAddon(authToken, {
      removePattern,
      newAddonUrl: wrappedAddonUrl,
      newAddonName: addonName,
      newAddonId: addonId
    });

    res.json(result);

  } catch (error) {
    logger.error('Replace addon failed:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * API: Replace multiple addons at once
 */
app.post('/api/replace-addons', async (req, res) => {
  try {
    const { authToken, items } = req.body || {};
    if (!authToken) {
      return res.status(400).json({ error: 'Auth token required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array required' });
    }

    const validation = stremioApi.validateAuthToken(authToken);
    if (!validation.valid) {
      return res.json({ success: false, error: `Invalid token: ${validation.error}` });
    }

    // Ensure wrapped URLs are present
    for (const it of items) {
      if (!it.removePattern || !it.wrappedAddonUrl) {
        return res.status(400).json({ error: 'Each item requires removePattern and wrappedAddonUrl' });
      }
    }

    const result = await stremioApi.replaceAddonsBatch(authToken, items);
    res.json(result);
  } catch (error) {
    logger.error('Replace addons batch failed:', error.message);
    res.json({ success: false, error: error.message });
  }
});

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.redirect('/configure');
});

/**
 * Start server
 */
const PORT = config.port;

app.listen(PORT, async () => {
  logger.info(`🚀 Stremio Ratings Wrapper running on port ${PORT}`);
  logger.info(`📝 Configuration helper: http://localhost:${PORT}/configure`);
  logger.info(`💚 Health check: http://localhost:${PORT}/health`);

  // Load Kitsu → IMDb mappings in background
  try {
    await kitsuMappingService.loadMappings();
  } catch (error) {
    logger.error('Failed to load Kitsu mappings (Kitsu addon support will be limited)');
  }
});
