/**
 * API Routes
 * Handles Stremio account management, authentication, and addon management
 */

const express = require('express');
const axios = require('axios');
const logger = require('../utils/logger');
const stremioApi = require('../services/stremioApi');
const { parseConfigFromPath } = require('../utils/configParser');
const { generateConfigureHTML } = require('../views/configure');
const { generateConfigureOldHTML } = require('../views/configure-old');
const config = require('../config');

const router = express.Router();

/**
 * Configuration pages
 */
router.get('/configure', (req, res) => {
  const host = req.get('host') || `localhost:${config.port}`;
  const protocol = req.protocol;
  res.send(generateConfigureHTML(protocol, host));
});

router.get('/configure-old', (req, res) => {
  const host = req.get('host') || `localhost:${config.port}`;
  const protocol = req.protocol;
  res.send(generateConfigureOldHTML(protocol, host));
});

/**
 * API: Get current addon collection (for debugging)
 */
router.post('/get-addons', async (req, res) => {
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
router.post('/emergency-restore', async (req, res) => {
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
 * API: Login with username and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    logger.info('Attempting login with email/password...');

    // Call Stremio login API
    const response = await axios.post('https://api.strem.io/api/login', {
      authKey: null,
      email: email,
      password: password
    });

    if (response.data && response.data.result && response.data.result.authKey) {
      const authKey = response.data.result.authKey;

      res.json({
        success: true,
        authKey: authKey,
        message: 'Login successful!'
      });
    } else {
      res.json({
        success: false,
        error: 'Invalid credentials or unexpected response'
      });
    }

  } catch (error) {
    logger.error('Login failed:', error.message);
    res.json({
      success: false,
      error: error.response?.data?.error || error.message
    });
  }
});

/**
 * API: Test Stremio authentication
 */
router.post('/test-auth', async (req, res) => {
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
router.post('/fetch-manifest', async (req, res) => {
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
router.post('/replace-addon', async (req, res) => {
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
router.post('/replace-addons', async (req, res) => {
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
 * API: Get wrappable addons from user's Stremio account
 */
router.post('/get-wrappable-addons', async (req, res) => {
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

    logger.info('Fetching wrappable addons...');

    // Get user's installed addons
    const addons = await stremioApi.getAddonCollection(authToken);
    logger.info(`Retrieved ${addons.length} addons from account`);

    // Check each addon to see if it's wrappable
    const https = require('https');
    const http = require('http');

    const addonResults = await Promise.all(addons.map(async (addon) => {
      const manifestUrl = addon.transportUrl;
      const addonInfo = {
        name: addon.manifest?.name || 'Unknown Addon',
        url: manifestUrl,
        logo: addon.manifest?.logo || null,
        id: addon.manifest?.id || null,
        wrappable: false,
        reason: ''
      };

      // Skip if no URL
      if (!manifestUrl) {
        addonInfo.reason = 'No manifest URL';
        return addonInfo;
      }

      // Skip if it's already a wrapped addon from this service
      // Check manifest ID for .ratings-wrapper suffix
      if (addon.manifest?.id?.includes('.ratings-wrapper')) {
        addonInfo.reason = 'Already wrapped';
        return addonInfo;
      }

      // Check if URL points to a ratings wrapper service
      // Pattern: the URL contains a base64url-encoded config followed by /manifest.json
      // Example: https://ratingswrapper-production.up.railway.app/{base64config}/manifest.json
      try {
        const url = new URL(manifestUrl);
        // Check if the path matches our wrapper pattern (base64url string followed by /manifest.json)
        if (/^\/[A-Za-z0-9_-]{50,}\/manifest\.json$/.test(url.pathname)) {
          // This looks like a wrapped addon - verify by checking the hostname
          if (url.hostname.includes('ratingswrapper') ||
              url.hostname === 'localhost' ||
              url.hostname === '127.0.0.1') {
            addonInfo.reason = 'Already wrapped';
            return addonInfo;
          }
        }
      } catch (e) {
        // Invalid URL, continue with normal checks
      }

      try {
        // Fetch the manifest to check resources
        const manifestData = await new Promise((resolve, reject) => {
          const protocol = manifestUrl.startsWith('https') ? https : http;
          const timeout = setTimeout(() => {
            reject(new Error('Timeout'));
          }, 5000);

          protocol.get(manifestUrl, (resp) => {
            let data = '';
            resp.on('data', chunk => data += chunk);
            resp.on('end', () => {
              clearTimeout(timeout);
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(new Error('Invalid JSON'));
              }
            });
          }).on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });

        // Check if addon has catalog or meta resources
        const resources = manifestData.resources || [];
        const hasCatalog = resources.includes('catalog');
        const hasMeta = resources.includes('meta');

        if (hasCatalog || hasMeta) {
          addonInfo.wrappable = true;
          addonInfo.reason = `Has ${resources.filter(r => r === 'catalog' || r === 'meta').join(' and ')}`;
        } else {
          addonInfo.reason = `Missing catalog/meta (has: ${resources.join(', ') || 'none'})`;
        }

      } catch (error) {
        addonInfo.reason = `Error: ${error.message}`;
        logger.debug(`Failed to check addon ${addonInfo.name}:`, error.message);
      }

      return addonInfo;
    }));

    // Sort addons: wrappable first, then already-wrapped, then non-wrappable
    const sortedAddons = addonResults.sort((a, b) => {
      // Wrappable addons first
      if (a.wrappable && !b.wrappable && b.reason !== 'Already wrapped') return -1;
      if (b.wrappable && !a.wrappable && a.reason !== 'Already wrapped') return 1;

      // Already wrapped addons last
      if (a.reason === 'Already wrapped' && b.reason !== 'Already wrapped') return 1;
      if (b.reason === 'Already wrapped' && a.reason !== 'Already wrapped') return -1;

      return 0;
    });

    res.json({
      success: true,
      addons: sortedAddons,
      total: sortedAddons.length,
      wrappableCount: sortedAddons.filter(a => a.wrappable).length
    });

  } catch (error) {
    logger.error('Get wrappable addons failed:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
