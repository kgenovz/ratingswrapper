/**
 * Stremio Ratings Wrapper Addon
 * Main entry point - sets up Express server
 */

const express = require('express');
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
 * Configuration helper endpoint
 * Interactive UI for creating wrapper addon URLs
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
          const serverUrl = '${protocol}://${host}';
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
