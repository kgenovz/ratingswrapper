/**
 * Configure Page JavaScript
 * Extracted from src/views/configure.js for better maintainability
 *
 * This script expects window.SERVER_URL to be set before loading
 */

// Note: serverUrl is set via inline script in HTML (passed from server)
const serverUrl = window.SERVER_URL || window.location.origin;
const CINEMETA_URL = 'https://v3-cinemeta.strem.io/manifest.json';
const state = { items: [], selectedAddons: new Set(), authToken: null };

/**
 * Generate a user ID from auth token for rate limiting
 * Creates a short hash of the auth token for privacy
 * @param {string} authToken - Stremio auth token
 * @returns {string} - User ID (first 16 chars of hash)
 */
async function generateUserId(authToken) {
  if (!authToken) return null;
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(authToken);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    // Use first 16 characters for userId (64 bits of hash)
    return hashHex.substring(0, 16);
  } catch (e) {
    console.warn('Failed to generate userId:', e);
    return null;
  }
}

/**
 * Sanitizes addon URL by converting stremio:// protocol to https://
 * @param {string} url - Addon URL
 * @returns {string} Sanitized URL
 */
function sanitizeAddonUrl(url) {
  if (!url || typeof url !== 'string') return url;
  // Case-insensitive replacement of stremio:// with https://
  if (url.toLowerCase().startsWith('stremio://')) {
    return 'https://' + url.substring(10);
  }
  return url;
}

/**
 * Extracts the original addon URL from a wrapped addon URL
 * @param {string} wrappedUrl - The wrapped addon URL
 * @returns {string|null} The original unwrapped URL, or null if extraction fails
 */
function extractOriginalUrl(wrappedUrl) {
  try {
    // Match the base64url-encoded config in the URL
    // Pattern: https://domain.com/{base64config}/manifest.json
    // Use [^/]+ to match everything between slashes (non-greedy)
    const match = wrappedUrl.match(/\/([^\/]+)\/manifest\.json/);
    if (!match) return null;

    const encodedConfig = match[1];

    // Decode base64url to JSON
    const jsonString = atob(encodedConfig.replace(/-/g, '+').replace(/_/g, '/'));
    const config = JSON.parse(jsonString);

    // Return the original wrapped addon URL
    return config.wrappedAddonUrl || null;
  } catch (e) {
    console.warn('Failed to extract original URL from:', wrappedUrl, e);
    return null;
  }
}

// Login section functions
function toggleLoginAuthMethod() {
  const tokenMethod = document.getElementById('loginAuthTokenMethod');
  const emailPasswordMethod = document.getElementById('loginEmailPasswordMethod');
  const toggle = document.getElementById('loginAuthMethodToggle');

  if (tokenMethod.style.display === 'none') {
    tokenMethod.style.display = 'block';
    emailPasswordMethod.style.display = 'none';
    toggle.textContent = 'Switch to Email/Password Login';
  } else {
    tokenMethod.style.display = 'none';
    emailPasswordMethod.style.display = 'block';
    toggle.textContent = 'Switch to Auth Token';
  }
}

async function loginWithPasswordAndFetchAddons() {
  const email = document.getElementById('loginStremioEmail').value.trim();
  const password = document.getElementById('loginStremioPassword').value.trim();
  const statusDiv = document.getElementById('loginStatus');
  const loginBtn = document.getElementById('loginWithPasswordBtn');

  if (!email || !password) {
    alert('Please enter both email and password');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i>Logging in...';

  statusDiv.style.display = 'block';
  statusDiv.style.background = '#fff7ed';
  statusDiv.style.border = '1px solid #fdba74';
  statusDiv.innerHTML = 'Logging in to Stremio...';

  try {
    const response = await fetch(serverUrl + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const result = await response.json();

    if (result.success && result.authKey) {
      document.getElementById('loginAuthToken').value = result.authKey;
      // Also set the auth token in the Auto Replace section
      document.getElementById('authToken').value = result.authKey;
      state.authToken = result.authKey; // Store for userId generation (Phase 4)
      statusDiv.style.background = '#d1fae5';
      statusDiv.style.border = '1px solid #10b981';
      statusDiv.innerHTML = '✔ Login successful! Fetching addons...';

      // Now fetch addons
      await fetchAndDisplayAddons(result.authKey);
    } else {
      statusDiv.style.background = '#fee2e2';
      statusDiv.style.border = '1px solid #ef4444';
      statusDiv.innerHTML = '✖ ' + (result.error || 'Login failed');
    }
  } catch (e) {
    statusDiv.style.background = '#fee2e2';
    statusDiv.style.border = '1px solid #ef4444';
    statusDiv.innerHTML = '✖ Error: ' + e.message;
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket" style="margin-right:6px"></i>Login & Fetch Addons';
  }
}

async function loginAndFetchAddons() {
  const authToken = document.getElementById('loginAuthToken').value.trim();
  const statusDiv = document.getElementById('loginStatus');
  const loginBtn = document.getElementById('loginWithTokenBtn');

  if (!authToken) {
    alert('Please enter your auth token');
    return;
  }

  state.authToken = authToken; // Store for userId generation (Phase 4)
  // Also set in Auto Replace section
  document.getElementById('authToken').value = authToken;

  loginBtn.disabled = true;
  loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i>Fetching...';

  statusDiv.style.display = 'block';
  statusDiv.style.background = '#fff7ed';
  statusDiv.style.border = '1px solid #fdba74';
  statusDiv.innerHTML = 'Fetching your addons...';

  try {
    await fetchAndDisplayAddons(authToken);
  } catch (e) {
    statusDiv.style.background = '#fee2e2';
    statusDiv.style.border = '1px solid #ef4444';
    statusDiv.innerHTML = '✖ Error: ' + e.message;
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket" style="margin-right:6px"></i>Fetch Addons';
  }
}

async function fetchAndDisplayAddons(authToken) {
  const statusDiv = document.getElementById('loginStatus');

  try {
    const response = await fetch(serverUrl + '/api/get-wrappable-addons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authToken })
    });

    const result = await response.json();

    if (result.success) {
      const alreadyWrappedCount = result.addons.filter(a => a.reason === 'Already wrapped').length;
      statusDiv.style.background = '#d1fae5';
      statusDiv.style.border = '1px solid #10b981';
      statusDiv.innerHTML = '✔ Found ' + result.total + ' addons (' + result.wrappableCount + ' wrappable, ' + alreadyWrappedCount + ' already wrapped)';

      renderInstalledAddons(result.addons);
      document.getElementById('installedAddonsSection').style.display = 'block';

      // Show the replace button in the Auto Replace section and hide auth form
      updateAutoReplaceSection();
    } else {
      statusDiv.style.background = '#fee2e2';
      statusDiv.style.border = '1px solid #ef4444';
      statusDiv.innerHTML = '✖ ' + result.error;
    }
  } catch (e) {
    throw e;
  }
}

function renderInstalledAddons(addons) {
  const container = document.getElementById('installedAddonsList');
  container.innerHTML = '';

  if (!addons || addons.length === 0) {
    container.innerHTML = '<p style="color: #6b7280; font-size: 14px;">No addons found.</p>';
    return;
  }

  addons.forEach(addon => {
    const card = document.createElement('div');
    const isAlreadyWrapped = addon.reason === 'Already wrapped';

    // Sanitize addon URL before storing
    const sanitizedUrl = sanitizeAddonUrl(addon.url);

    const isCinemeta = (addon.id && String(addon.id).toLowerCase().includes('cinemeta')) ||
                       (sanitizedUrl && sanitizedUrl.includes('cinemeta')) ||
                       (sanitizedUrl === CINEMETA_URL);

    if (isAlreadyWrapped) {
      card.className = 'addon-card already-wrapped';
    } else {
      card.className = 'addon-card ' + (addon.wrappable ? 'wrappable' : 'not-wrappable');
    }

    card.dataset.addonUrl = sanitizedUrl;
    card.dataset.addonName = addon.name;

    // Auto-select Cinemeta (recommended) but allow user to uncheck
    if (isCinemeta && !state.selectedAddons.has(sanitizedUrl)) {
      state.selectedAddons.add(CINEMETA_URL);
    }

    if (state.selectedAddons.has(sanitizedUrl)) {
      card.classList.add('selected');
    }

    // Logo
    const logo = document.createElement('img');
    logo.className = 'addon-logo';
    logo.src = addon.logo || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239ca3af"%3E%3Cpath d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/%3E%3C/svg%3E';
    logo.alt = addon.name;
    logo.onerror = function() {
      this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239ca3af"%3E%3Cpath d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/%3E%3C/svg%3E';
    };

    // Info
    const info = document.createElement('div');
    info.className = 'addon-info';

    const name = document.createElement('div');
    name.className = 'addon-name';
    name.textContent = addon.name;
    name.title = addon.name;

    const status = document.createElement('div');
    status.className = 'addon-status';

    const icon = document.createElement('i');
    if (isAlreadyWrapped) {
      icon.className = 'fa-solid fa-rotate status-icon';
      icon.style.color = '#f59e0b'; // amber-500
    } else {
      icon.className = 'fa-solid ' + (addon.wrappable ? 'fa-circle-check status-icon wrappable' : 'fa-circle-xmark status-icon not-wrappable');
    }

    const reasonText = document.createElement('span');
    if (isCinemeta) {
      reasonText.textContent = 'Cinemeta (recommended)';
    } else if (isAlreadyWrapped) {
      reasonText.textContent = 'Re-wrap with new settings';
    } else {
      reasonText.textContent = addon.reason;
      // Add tooltip for non-wrappable addons to explain why
      if (!addon.wrappable) {
        reasonText.title = addon.reason;
        card.title = addon.reason;
      }
    }

    status.appendChild(icon);
    status.appendChild(reasonText);

    info.appendChild(name);
    info.appendChild(status);

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'addon-checkbox';
    // Enable checkbox for wrappable addons, already-wrapped addons, and Cinemeta
    checkbox.disabled = !addon.wrappable && !isAlreadyWrapped && !isCinemeta;

    // Auto-select already-wrapped addons and add to state.items (not Cinemeta, that's handled earlier)
    if (isAlreadyWrapped && !isCinemeta) {
      state.selectedAddons.add(sanitizedUrl);
      card.classList.add('selected');

      // Also add to state.items automatically
      const extracted = extractOriginalUrl(sanitizedUrl);
      if (extracted && !state.items.find(it => it.url === extracted)) {
        const baseName = addon.name.replace(/ with Ratings$/i, '');
        state.items.push({
          url: extracted,
          name: baseName + ' with Ratings',
          wasWrapped: true
        });
      }
    }

    // Auto-add Cinemeta to state.items if it's selected
    if (isCinemeta && state.selectedAddons.has(sanitizedUrl) && !state.items.find(it => it.url === sanitizedUrl)) {
      state.items.push({
        url: CINEMETA_URL,
        name: 'Cinemeta with Ratings',
        wasWrapped: false
      });
    }

    checkbox.checked = state.selectedAddons.has(sanitizedUrl);
    if (isCinemeta) {
      checkbox.title = 'Recommended for complete metadata coverage';
    } else if (isAlreadyWrapped) {
      checkbox.title = 'Click to re-wrap with new settings';
    }

    // Enable toggle for wrappable, already-wrapped addons, and Cinemeta
    if (addon.wrappable || isAlreadyWrapped || isCinemeta) {
      const toggleSelection = () => {
        if (state.selectedAddons.has(sanitizedUrl)) {
          // Uncheck: remove from selection and state.items
          state.selectedAddons.delete(sanitizedUrl);
          card.classList.remove('selected');
          checkbox.checked = false;

          // Remove from state.items
          let urlToRemove = sanitizedUrl;
          if (isAlreadyWrapped) {
            const extracted = extractOriginalUrl(sanitizedUrl);
            if (extracted) urlToRemove = extracted;
          }
          const itemIndex = state.items.findIndex(it => it.url === urlToRemove);
          if (itemIndex !== -1) {
            state.items.splice(itemIndex, 1);
            detectAndRecommendCinemeta();
            renderAddonList();
          }
        } else {
          // Check: add to selection and state.items
          state.selectedAddons.add(sanitizedUrl);
          card.classList.add('selected');
          checkbox.checked = true;

          // Add to state.items
          let originalUrl = sanitizedUrl;
          if (isAlreadyWrapped) {
            const extracted = extractOriginalUrl(sanitizedUrl);
            if (extracted) {
              originalUrl = extracted;
            } else {
              console.warn('Could not extract original URL from wrapped addon:', sanitizedUrl);
              return;
            }
          }

          // Check if already added
          if (!state.items.find(it => it.url === originalUrl)) {
            const baseName = addon.name.replace(/ with Ratings$/i, '');
            state.items.push({
              url: originalUrl,
              name: baseName + ' with Ratings',
              wasWrapped: isAlreadyWrapped
            });
            detectAndRecommendCinemeta();
            renderAddonList();
          }
        }
      };

      checkbox.addEventListener('change', toggleSelection);
      card.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          toggleSelection();
        }
      });
    }

    card.appendChild(logo);
    card.appendChild(info);
    card.appendChild(checkbox);

    container.appendChild(card);
  });

  // Update the addons list UI after auto-selecting
  detectAndRecommendCinemeta();
  renderAddonList();
}

function updateAutoReplaceSection() {
  const authToken = document.getElementById('authToken').value.trim();
  if (authToken) {
    // Hide the login forms
    document.getElementById('authTokenMethod').style.display = 'none';
    document.getElementById('emailPasswordMethod').style.display = 'none';
    document.getElementById('authMethodToggle').style.display = 'none';
    document.getElementById('testAuthBtn').style.display = 'none';

    // Show the replace button directly
    document.getElementById('replaceAllBtn').style.display = 'inline-block';

    // Update the intro text to indicate user is already logged in
    const replaceSection = document.getElementById('replaceAllBtn').parentElement;
    let alreadyLoggedInMsg = document.getElementById('alreadyLoggedInMsg');
    if (!alreadyLoggedInMsg) {
      alreadyLoggedInMsg = document.createElement('p');
      alreadyLoggedInMsg.id = 'alreadyLoggedInMsg';
      alreadyLoggedInMsg.style.cssText = 'font-size: 13px; color: #059669; margin-bottom: 12px; font-weight: 600;';
      alreadyLoggedInMsg.innerHTML = '✓ Already logged in - ready to auto-replace';
      replaceSection.insertBefore(alreadyLoggedInMsg, document.getElementById('replaceAllBtn'));
    }

    // Also update Emergency Restore section
    document.getElementById('emergencyAuthToken').value = authToken;
    document.getElementById('emergencyAuthInput').style.display = 'none';
    document.getElementById('emergencyAuthReady').style.display = 'block';
  }
}

async function addSelectedAddons() {
  if (state.selectedAddons.size === 0) {
    alert('Please select at least one addon');
    return;
  }

  detectAndRecommendCinemeta();

  // Get the addon details from the displayed list (wrappable OR already-wrapped)
  const addonCards = document.querySelectorAll('.addon-card.selected:not(.not-wrappable)');
  let addedCount = 0;

  for (const card of addonCards) {
    const rawUrl = card.dataset.addonUrl;
    if (!rawUrl) continue;

    // Sanitize URL: convert stremio:// to https://
    let url = sanitizeAddonUrl(rawUrl);

    // Check if this is an already-wrapped addon
    const isWrapped = card.classList.contains('already-wrapped');
    let originalUrl = url;

    if (isWrapped) {
      // Extract the original URL from the wrapped config
      const extracted = extractOriginalUrl(url);
      if (extracted) {
        originalUrl = extracted;
        console.log('Unwrapping addon:', url, '->', originalUrl);
      } else {
        console.warn('Could not extract original URL from wrapped addon:', url);
        alert('Warning: Could not extract original URL from ' + card.dataset.addonName + '. Skipping.');
        continue;
      }
    }

    // Check if already added (by original URL)
    if (state.items.find(it => it.url === originalUrl)) {
      continue;
    }

    // Try to fetch manifest name
    let resolvedName = undefined;
    try {
      const resp = await fetch(serverUrl + '/api/fetch-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: originalUrl })
      });
      const result = await resp.json();
      if (result && result.success && result.manifest && result.manifest.name) {
        resolvedName = result.manifest.name + ' with Ratings';
      }
    } catch (e) {
      // Use the name from the card if manifest fetch fails
      const baseName = card.dataset.addonName.replace(/ with Ratings$/i, '');
      resolvedName = baseName + ' with Ratings';
    }

    state.items.push({
      url: originalUrl,
      name: resolvedName,
      wasWrapped: isWrapped
    });
    addedCount++;
  }

  if (addedCount > 0) {
    renderAddonList();
    alert('Added ' + addedCount + ' addon(s) to your configuration');

    // Clear selections
    state.selectedAddons.clear();
    document.querySelectorAll('.addon-card.selected').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.addon-checkbox:checked').forEach(cb => cb.checked = false);
  } else {
    alert('All selected addons are already in your configuration');
  }
}

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

function hasFullMetadataAddon() {
  // Check if any addon provides full metadata (AIO Metadata, etc.)
  return state.items.some(item => {
    const url = item.url.toLowerCase();
    return url.includes('aiometadata') ||
           url.includes('aio-metadata') ||
           url.includes('metahub') ||
           url.includes('midnightignite');
  });
}

function detectAndRecommendCinemeta() {
  // Check if user has a full metadata addon (for informational notice)
  const hasFullMetadata = hasFullMetadataAddon();

  // Show/hide informational notice about AIO Metadata
  const notice = document.getElementById('cinemataNotice');
  if (notice) {
    notice.style.display = hasFullMetadata ? 'block' : 'none';
  }

  // Move full metadata addon to position 0 if it exists and isn't already first
  if (hasFullMetadata) {
    const fullMetadataIndex = state.items.findIndex(item => {
      const url = item.url.toLowerCase();
      return url.includes('aiometadata') || url.includes('aio-metadata') ||
             url.includes('metahub') || url.includes('midnightignite');
    });

    if (fullMetadataIndex > 0) {
      // Remove from current position and add to beginning
      const [fullMetadataAddon] = state.items.splice(fullMetadataIndex, 1);
      state.items.unshift(fullMetadataAddon);
    }
  }
}

function renderAddonList() {
  const list = document.getElementById('addonList');
  list.innerHTML = '';
  if (!state.items.length) {
    list.innerHTML = '<em>Add addons from your account or paste URLs below.</em>';
    return;
  }
  state.items.forEach(function(it, idx){
    list.appendChild(makeExpandableRow(it, idx));
  });
}

async function addAddon() {
  const rawUrl = document.getElementById('addonInputUrl').value.trim();
  const nameInput = document.getElementById('addonInputName').value.trim();
  if (!rawUrl) { alert('Enter an addon URL'); return; }

  // Sanitize URL: convert stremio:// to https://
  const url = sanitizeAddonUrl(rawUrl);

  // Blocklist: Stream-only addons that should not be wrapped
  const STREAM_ADDON_BLOCKLIST = [
    'mediafusion.elfhosted.com',
    'torrentio.strem.fun',
    'torbox.app',
    'sootio.elfhosted.com',
    'nuviostreams.hayd.uk',
    'jackettio.elfhosted.com',
    'comet.elfhosted.com'
  ];

  // Check if addon URL contains any blocklisted domain
  const isBlocklisted = STREAM_ADDON_BLOCKLIST.some(function(domain) {
    return url.toLowerCase().includes(domain.toLowerCase());
  });

  if (isBlocklisted) {
    alert('This addon cannot be wrapped. Stream-only addons (Torrentio, MediaFusion, etc.) do not benefit from rating injection and would cause unnecessary overhead.');
    return;
  }

  detectAndRecommendCinemeta();

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

function getMetadataOrder() {
  var list = document.getElementById('metadataOrderList');
  if (!list) return ['imdbRating','votes','mpaa','tmdb','malRating','malVotes','releaseDate','streamingServices','rottenTomatoes','metacritic'];
  var keys = [];
  list.querySelectorAll('li').forEach(function(li){
    var k = li.getAttribute('data-key'); if (k) keys.push(k);
  });
  return keys.length ? keys : ['imdbRating','votes','mpaa','tmdb','malRating','malVotes','releaseDate','streamingServices','rottenTomatoes','metacritic'];
}

function createOrderItem(key, label) {
  var li = document.createElement('li');
  li.setAttribute('data-key', key);
  li.style.display = 'flex';
  li.style.alignItems = 'center';
  li.style.justifyContent = 'space-between';
  li.style.padding = '4px 0';
  var text = document.createElement('span');
  text.textContent = label;
  var actions = document.createElement('span');
  var up = document.createElement('button');
  up.type = 'button'; up.className = 'btn'; up.style.padding = '2px 6px'; up.textContent = '▲';
  up.onclick = function(){ moveOrderItem(key, 'up'); };
  var down = document.createElement('button');
  down.type = 'button'; down.className = 'btn'; down.style.padding = '2px 6px'; down.style.marginLeft = '4px'; down.textContent = '▼';
  down.onclick = function(){ moveOrderItem(key, 'down'); };
  actions.appendChild(up); actions.appendChild(down);
  li.appendChild(text); li.appendChild(actions);
  return li;
}

function renderMetadataOrderList() {
  var section = document.getElementById('metadataOrderSection');
  var list = document.getElementById('metadataOrderList');
  if (!section || !list) return;

  // Always show the order section (IMDb rating is always included)
  section.style.display = 'block';

  // Read checkbox states (IMDb rating is always true since it's the main feature)
  var includes = {
    imdbRating: true, // Always included
    votes: document.getElementById('includeVotes')?.checked || false,
    mpaa: document.getElementById('includeMpaa')?.checked || false,
    tmdb: document.getElementById('includeTmdbRating')?.checked || false,
    releaseDate: document.getElementById('includeReleaseDate')?.checked || false,
    streamingServices: document.getElementById('includeStreamingServices')?.checked || false,
    rottenTomatoes: document.getElementById('includeRottenTomatoes')?.checked || false,
    metacritic: document.getElementById('includeMetacritic')?.checked || false,
    malRating: document.getElementById('includeMalRating')?.checked || false,
    malVotes: document.getElementById('includeMalVotes')?.checked || false
  };
  var labels = {
    imdbRating: 'IMDb rating',
    votes: 'Vote count',
    mpaa: 'MPAA rating',
    tmdb: 'TMDB rating',
    releaseDate: 'Release date',
    streamingServices: 'Streaming services',
    rottenTomatoes: 'Rotten Tomatoes',
    metacritic: 'Metacritic',
    malRating: 'MAL rating',
    malVotes: 'MAL votes'
  };
  var defaultOrder = ['imdbRating','votes','mpaa','tmdb','malRating','malVotes','releaseDate','streamingServices','rottenTomatoes','metacritic'];
  var selected = defaultOrder.filter(function(k){ return includes[k]; });

  // Keep existing order where possible
  var current = getMetadataOrder();
  var desired = current.filter(function(k){ return includes[k]; });
  // Append newly included keys at the end in default order
  selected.forEach(function(k){ if (desired.indexOf(k) === -1) desired.push(k); });
  // Rebuild list
  list.innerHTML = '';
  desired.forEach(function(k){ list.appendChild(createOrderItem(k, labels[k])); });
}

function moveOrderItem(key, dir) {
  var list = document.getElementById('metadataOrderList');
  if (!list) return;
  var items = Array.from(list.children);
  var idx = items.findIndex(function(li){ return li.getAttribute('data-key') === key; });
  if (idx === -1) return;
  if (dir === 'up' && idx > 0) {
    list.insertBefore(items[idx], items[idx - 1]);
  } else if (dir === 'down' && idx < items.length - 1) {
    list.insertBefore(items[idx + 1], items[idx]);
  }
  updateRatingPreview();
}

function updateRatingPreview() {
  var enableTitleLocation = document.getElementById('ratingLocationTitle')?.checked || false;
  var enableDescriptionLocation = document.getElementById('ratingLocationDescription')?.checked || false;

  // Show/hide format sections based on checkbox states
  var titleSection = document.getElementById('titleFormatSection');
  var descSection = document.getElementById('descriptionFormatSection');

  if (titleSection) {
    titleSection.style.display = enableTitleLocation ? 'block' : 'none';
  }
  if (descSection) {
    descSection.style.display = enableDescriptionLocation ? 'block' : 'none';
  }

  // Show/hide vote count format dropdown based on includeVotes checkbox
  var includeVotes = document.getElementById('includeVotes')?.checked || false;
  var voteCountFormatSection = document.getElementById('voteCountFormatSection');
  if (voteCountFormatSection) {
    voteCountFormatSection.style.display = includeVotes ? 'block' : 'none';
  }

  // Show/hide TMDB rating format dropdown based on includeTmdbRating checkbox
  var includeTmdbRating = document.getElementById('includeTmdbRating')?.checked || false;
  var tmdbRatingFormatSection = document.getElementById('tmdbRatingFormatSection');
  if (tmdbRatingFormatSection) {
    tmdbRatingFormatSection.style.display = includeTmdbRating ? 'block' : 'none';
  }

  // Show/hide release date format dropdown based on includeReleaseDate checkbox
  var includeReleaseDate = document.getElementById('includeReleaseDate')?.checked || false;
  var releaseDateFormatSection = document.getElementById('releaseDateFormatSection');
  if (releaseDateFormatSection) {
    releaseDateFormatSection.style.display = includeReleaseDate ? 'block' : 'none';
  }

  // Show/hide Metacritic format dropdown based on includeMetacritic checkbox
  var includeMetacritic = document.getElementById('includeMetacritic')?.checked || false;
  var metacriticFormatSection = document.getElementById('metacriticFormatSection');
  if (metacriticFormatSection) {
    metacriticFormatSection.style.display = includeMetacritic ? 'block' : 'none';
  }

  // Show/hide MAL rating format dropdown based on includeMalRating checkbox
  var includeMalRating = document.getElementById('includeMalRating')?.checked || false;
  var malRatingFormatSection = document.getElementById('malRatingFormatSection');
  if (malRatingFormatSection) {
    malRatingFormatSection.style.display = includeMalRating ? 'block' : 'none';
  }

  // Show/hide MAL votes format dropdown based on includeMalVotes checkbox
  var includeMalVotes = document.getElementById('includeMalVotes')?.checked || false;
  var malVoteFormatSection = document.getElementById('malVoteFormatSection');
  if (malVoteFormatSection) {
    malVoteFormatSection.style.display = includeMalVotes ? 'block' : 'none';
  }

  // Show/hide streaming region dropdown based on includeStreamingServices checkbox
  var includeStreamingServices = document.getElementById('includeStreamingServices')?.checked || false;
  var streamingRegionSection = document.getElementById('streamingRegionSection');
  if (streamingRegionSection) {
    streamingRegionSection.style.display = includeStreamingServices ? 'block' : 'none';
  }

  // Rebuild ordering list when toggles change
  renderMetadataOrderList();

  // Update title preview
  if (enableTitleLocation) {
    var titlePos = document.getElementById('titlePosition')?.value || 'prefix';
    var titleTpl = document.getElementById('titleTemplate')?.value || '★ {rating}';
    var titleSep = document.getElementById('titleSeparator')?.value || ' | ';
    var sampleRating = '8.5';
    var ratingText = titleTpl.replace('{rating}', sampleRating);
    var sampleTitle = 'Example Movie Title';

    var titleResult = titlePos === 'prefix'
      ? ratingText + titleSep + sampleTitle
      : sampleTitle + titleSep + ratingText;

    var titlePrev = document.getElementById('titlePreview');
    if (titlePrev) {
      titlePrev.textContent = titleResult;
      titlePrev.style.opacity = '1';
    }
  }

  // Update description preview
  if (enableDescriptionLocation) {
    var descPos = document.getElementById('descriptionPosition')?.value || 'prefix';
    var descTpl = document.getElementById('descriptionTemplate')?.value || '{rating}/10 IMDb';
    var descSep = document.getElementById('descriptionSeparator')?.value || '\\n';
    var includeVotes = document.getElementById('includeVotes')?.checked || false;
    var includeMpaa = document.getElementById('includeMpaa')?.checked || false;
    var includeTmdbRating = document.getElementById('includeTmdbRating')?.checked || false;
    var includeReleaseDate = document.getElementById('includeReleaseDate')?.checked || false;
    var includeStreamingServices = document.getElementById('includeStreamingServices')?.checked || false;
    var includeRottenTomatoes = document.getElementById('includeRottenTomatoes')?.checked || false;
    var includeMetacritic = document.getElementById('includeMetacritic')?.checked || false;
    var includeMalRating = document.getElementById('includeMalRating')?.checked || false;
    var includeMalVotes = document.getElementById('includeMalVotes')?.checked || false;
    var metaSep = document.getElementById('metadataSeparator')?.value || ' • ';
    var voteCountFormat = document.getElementById('voteCountFormat')?.value || 'short';
    var tmdbRatingFormat = document.getElementById('tmdbRatingFormat')?.value || 'decimal';
    var malRatingFormat = document.getElementById('malRatingFormat')?.value || 'decimal';
    var malVoteFormat = document.getElementById('malVoteFormat')?.value || 'short';
    var releaseDateFormat = document.getElementById('releaseDateFormat')?.value || 'year';
    var metacriticFormat = document.getElementById('metacriticFormat')?.value || 'score';

    // Replace literal backslash-n with CRLF to maximize client compatibility
    descSep = descSep.replace(/\\n/g, String.fromCharCode(13) + String.fromCharCode(10));

    var sampleRating = '8.5';
    var ratingText = descTpl.replace('{rating}', sampleRating);

    // Build metadata parts with configurable order
    var order = getMetadataOrder();
    var partTexts = {};

    // IMDb rating is always included
    partTexts.imdbRating = ratingText;

    if (includeVotes) {
      var voteText = '';
      if (voteCountFormat === 'short') voteText = '1.2M votes';
      else if (voteCountFormat === 'full') voteText = '1,200,000 votes';
      else if (voteCountFormat === 'both') voteText = '1,200,000 / 1.2M votes';
      partTexts.votes = voteText;
    }
    if (includeMpaa) partTexts.mpaa = 'PG-13';
    if (includeTmdbRating) {
      var tmdbText = tmdbRatingFormat === 'decimal' ? '8.5 TMDB' : '8.5/10 TMDB';
      partTexts.tmdb = tmdbText;
    }
    if (includeReleaseDate) {
      var dateText = releaseDateFormat === 'year' ? '2023'
        : (releaseDateFormat === 'short' ? 'Jan 15, 2023' : 'January 15, 2023');
      partTexts.releaseDate = dateText;
    }
    if (includeStreamingServices) partTexts.streamingServices = 'Netflix, Hulu, Disney+';
    if (includeRottenTomatoes) partTexts.rottenTomatoes = '83% RT';
    if (includeMetacritic) {
      var mcText = metacriticFormat === 'score' ? '68 MC' : '68/100 MC';
      partTexts.metacritic = mcText;
    }
    if (includeMalRating) {
      var malText = malRatingFormat === 'decimal' ? '8.5 MAL' : '8.5/10 MAL';
      partTexts.malRating = malText;
    }
    if (includeMalVotes) {
      var malVotesText = malVoteFormat === 'short' ? '1.2M MAL votes' : '1,200,000 MAL votes';
      partTexts.malVotes = malVotesText;
    }

    // Build final metadata array in the specified order
    var metadataParts = [];
    var allowed = ['imdbRating','votes','mpaa','tmdb','releaseDate','streamingServices','rottenTomatoes','metacritic','malRating','malVotes'];
    order.forEach(function(k){ if (allowed.indexOf(k) !== -1 && partTexts[k]) metadataParts.push(partTexts[k]); });
    // Append any parts not in the order list
    allowed.forEach(function(k){ if (order.indexOf(k) === -1 && partTexts[k]) metadataParts.push(partTexts[k]); });

    var metadataLine = metadataParts.join(metaSep);
    var sampleDescription = 'An epic tale of adventure and discovery...';

    var descResult = descPos === 'prefix'
      ? metadataLine + descSep + sampleDescription
      : sampleDescription + descSep + metadataLine;

    var descPrev = document.getElementById('descriptionPreview');
    if (descPrev) {
      descPrev.textContent = descResult;
      descPrev.style.opacity = '1';
    }
  }
}

async function generateAll() {
  detectAndRecommendCinemeta();

  // Get location checkboxes
  const enableTitleLocation = document.getElementById('ratingLocationTitle')?.checked || false;
  const enableDescLocation = document.getElementById('ratingLocationDescription')?.checked || false;

  // Determine ratingLocation value
  let ratingLocation = 'title'; // default
  if (enableTitleLocation && enableDescLocation) {
    ratingLocation = 'both';
  } else if (enableDescLocation) {
    ratingLocation = 'description';
  } else if (enableTitleLocation) {
    ratingLocation = 'title';
  }

  // Generate userId from auth token for signed URLs (Phase 4)
  const userId = state.authToken ? await generateUserId(state.authToken) : null;

  // Get title format settings
  const titlePosition = document.getElementById('titlePosition')?.value || 'prefix';
  const titleTemplate = document.getElementById('titleTemplate')?.value || '★ {rating}';
  const titleSeparator = document.getElementById('titleSeparator')?.value || ' | ';

  // Get description format settings
  const descriptionPosition = document.getElementById('descriptionPosition')?.value || 'prefix';
  const descriptionTemplate = document.getElementById('descriptionTemplate')?.value || '{rating}/10 IMDb';
  let descriptionSeparator = document.getElementById('descriptionSeparator')?.value || '\\n';
  // Replace literal backslash-n with CRLF for storage to maximize client compatibility
  descriptionSeparator = descriptionSeparator.replace(/\\n/g, String.fromCharCode(13) + String.fromCharCode(10));

  // Get extended metadata options
  const includeVotes = document.getElementById('includeVotes')?.checked || false;
  const includeMpaa = document.getElementById('includeMpaa')?.checked || false;
  const includeTmdbRating = document.getElementById('includeTmdbRating')?.checked || false;
  const includeReleaseDate = document.getElementById('includeReleaseDate')?.checked || false;
  const includeStreamingServices = document.getElementById('includeStreamingServices')?.checked || false;
  const streamingRegion = document.getElementById('streamingRegion')?.value || 'US';
  const metadataSeparator = document.getElementById('metadataSeparator')?.value || ' • ';
  const voteCountFormat = document.getElementById('voteCountFormat')?.value || 'short';
  const tmdbRatingFormat = document.getElementById('tmdbRatingFormat')?.value || 'decimal';
  const releaseDateFormat = document.getElementById('releaseDateFormat')?.value || 'year';
  const includeRottenTomatoes = document.getElementById('includeRottenTomatoes')?.checked || false;
  const includeMetacritic = document.getElementById('includeMetacritic')?.checked || false;
  const metacriticFormat = document.getElementById('metacriticFormat')?.value || 'score';
  const includeMalRating = document.getElementById('includeMalRating')?.checked || false;
  const includeMalVotes = document.getElementById('includeMalVotes')?.checked || false;
  const malRatingFormat = document.getElementById('malRatingFormat')?.value || 'decimal';
  const malVoteFormat = document.getElementById('malVoteFormat')?.value || 'short';
  const metadataOrder = getMetadataOrder();

  // Global enable toggles removed; per-location settings control behavior
  if (!enableTitleLocation && !enableDescLocation) {
    alert('Warning: Neither title nor description location is selected. Please select at least one location.');
    return;
  }

  state.items = state.items.map(it => {
    const config = {
      wrappedAddonUrl: it.url,
      enableRatings: true, // Inferred from granular settings; keep global flag for compatibility
      ratingLocation: ratingLocation,
      // User ID for authenticated rate limiting (Phase 4)
      ...(userId && { userId }),
      // Separate formats for title and description
      titleFormat: {
        position: titlePosition,
        template: titleTemplate,
        separator: titleSeparator,
        // Granular control: catalog items and episodes for title
        enableCatalogItems: document.getElementById('titleEnableCatalogItems')?.checked !== false,
        enableEpisodes: document.getElementById('titleEnableEpisodes')?.checked !== false
      },
      descriptionFormat: {
        position: descriptionPosition,
        template: descriptionTemplate,
        separator: descriptionSeparator,
        includeVotes: includeVotes,
        includeMpaa: includeMpaa,
        includeTmdbRating: includeTmdbRating,
        includeReleaseDate: includeReleaseDate,
        includeStreamingServices: includeStreamingServices,
        streamingRegion: streamingRegion,
        includeRottenTomatoes: includeRottenTomatoes,
        includeMetacritic: includeMetacritic,
        metacriticFormat: metacriticFormat,
        includeMalRating: includeMalRating,
        includeMalVotes: includeMalVotes,
        malRatingFormat: malRatingFormat,
        malVoteFormat: malVoteFormat,
        metadataSeparator: metadataSeparator,
        voteCountFormat: voteCountFormat,
        tmdbRatingFormat: tmdbRatingFormat,
        releaseDateFormat: releaseDateFormat,
        metacriticFormat: metacriticFormat,
        metadataOrder: metadataOrder,
        // Granular control: catalog items and episodes for description
        enableCatalogItems: document.getElementById('descriptionEnableCatalogItems')?.checked !== false,
        enableEpisodes: document.getElementById('descriptionEnableEpisodes')?.checked !== false
      }
    };
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
  // Location checkboxes
  var locTitle = document.getElementById('ratingLocationTitle');
  var locDesc = document.getElementById('ratingLocationDescription');

  // Title format fields
  var titlePos = document.getElementById('titlePosition');
  var titleTpl = document.getElementById('titleTemplate');
  var titleSep = document.getElementById('titleSeparator');

  // Description format fields
  var descPos = document.getElementById('descriptionPosition');
  var descTpl = document.getElementById('descriptionTemplate');
  var descSep = document.getElementById('descriptionSeparator');
  var includeVotes = document.getElementById('includeVotes');
  var includeMpaa = document.getElementById('includeMpaa');
  var includeTmdbRating = document.getElementById('includeTmdbRating');
  var includeReleaseDate = document.getElementById('includeReleaseDate');
  var includeStreamingServices = document.getElementById('includeStreamingServices');
  var streamingRegion = document.getElementById('streamingRegion');
  var includeRottenTomatoes = document.getElementById('includeRottenTomatoes');
  var includeMetacritic = document.getElementById('includeMetacritic');
  var metacriticFormat = document.getElementById('metacriticFormat');
  var includeMalRating = document.getElementById('includeMalRating');
  var includeMalVotes = document.getElementById('includeMalVotes');
  var malRatingFormat = document.getElementById('malRatingFormat');
  var malVoteFormat = document.getElementById('malVoteFormat');
  var metaSep = document.getElementById('metadataSeparator');
  var voteCountFormat = document.getElementById('voteCountFormat');
  var tmdbRatingFormat = document.getElementById('tmdbRatingFormat');
  var releaseDateFormat = document.getElementById('releaseDateFormat');
  var metacriticFormat = document.getElementById('metacriticFormat');

  // Attach event listeners
  if (locTitle) locTitle.addEventListener('change', updateRatingPreview);
  if (locDesc) locDesc.addEventListener('change', updateRatingPreview);

  if (titlePos) titlePos.addEventListener('change', updateRatingPreview);
  if (titleTpl) titleTpl.addEventListener('input', updateRatingPreview);
  if (titleSep) titleSep.addEventListener('change', updateRatingPreview);

  if (descPos) descPos.addEventListener('change', updateRatingPreview);
  if (descTpl) descTpl.addEventListener('input', updateRatingPreview);
  if (descSep) descSep.addEventListener('change', updateRatingPreview);
  if (includeVotes) includeVotes.addEventListener('change', updateRatingPreview);
  if (includeMpaa) includeMpaa.addEventListener('change', updateRatingPreview);
  if (includeTmdbRating) includeTmdbRating.addEventListener('change', updateRatingPreview);
  if (includeReleaseDate) includeReleaseDate.addEventListener('change', updateRatingPreview);
  if (includeStreamingServices) includeStreamingServices.addEventListener('change', updateRatingPreview);
  if (streamingRegion) streamingRegion.addEventListener('change', updateRatingPreview);
  if (includeRottenTomatoes) includeRottenTomatoes.addEventListener('change', updateRatingPreview);
  if (includeMetacritic) includeMetacritic.addEventListener('change', updateRatingPreview);
  if (metacriticFormat) metacriticFormat.addEventListener('change', updateRatingPreview);
  if (includeMalRating) includeMalRating.addEventListener('change', updateRatingPreview);
  if (includeMalVotes) includeMalVotes.addEventListener('change', updateRatingPreview);
  if (malRatingFormat) malRatingFormat.addEventListener('change', updateRatingPreview);
  if (malVoteFormat) malVoteFormat.addEventListener('change', updateRatingPreview);
  if (metaSep) metaSep.addEventListener('change', updateRatingPreview);
  if (voteCountFormat) voteCountFormat.addEventListener('change', updateRatingPreview);
  if (tmdbRatingFormat) tmdbRatingFormat.addEventListener('change', updateRatingPreview);
  if (releaseDateFormat) releaseDateFormat.addEventListener('change', updateRatingPreview);
  if (metacriticFormat) metacriticFormat.addEventListener('change', updateRatingPreview);

  // Initial update
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
    const copyTextSpan = document.createElement('span');
    copyTextSpan.textContent = 'Copy';
    copyBtn.appendChild(copyTextSpan);
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(url);
      // Visual feedback: change icon and text
      copyIcon.className = 'fa-solid fa-check';
      copyBtn.style.background = '#059669';
      copyTextSpan.textContent = 'Copied!';
      // Reset after 2 seconds
      setTimeout(() => {
        copyIcon.className = 'fa-solid fa-copy';
        copyBtn.style.background = '#22c55e';
        copyTextSpan.textContent = 'Copy';
      }, 2000);
    });
    const link = document.createElement('a');
    link.className = 'install-btn';
    // Convert https:// to stremio:// for deeplink
    link.href = url.replace(/^https:\/\//, 'stremio://');
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

function toggleManualInstall() {
  const content = document.getElementById('manualInstallContent');
  const chevron = document.getElementById('manualInstallChevron');

  if (content.style.display === 'none') {
    content.style.display = 'block';
    chevron.style.transform = 'rotate(180deg)';
  } else {
    content.style.display = 'none';
    chevron.style.transform = 'rotate(0deg)';
  }
}

function toggleAuthMethod() {
  const tokenMethod = document.getElementById('authTokenMethod');
  const emailPasswordMethod = document.getElementById('emailPasswordMethod');
  const toggle = document.getElementById('authMethodToggle');
  const testAuthBtn = document.getElementById('testAuthBtn');

  if (tokenMethod.style.display === 'none') {
    tokenMethod.style.display = 'block';
    emailPasswordMethod.style.display = 'none';
    toggle.textContent = 'Switch to Email/Password Login';
    testAuthBtn.style.display = 'inline-block';
  } else {
    tokenMethod.style.display = 'none';
    emailPasswordMethod.style.display = 'block';
    toggle.textContent = 'Switch to Auth Token';
    testAuthBtn.style.display = 'none';
  }
}

async function loginWithPassword() {
  const email = document.getElementById('stremioEmail').value.trim();
  const password = document.getElementById('stremioPassword').value.trim();
  const statusDiv = document.getElementById('authStatus');
  const loginBtn = document.getElementById('loginBtn');
  const replaceAllBtn = document.getElementById('replaceAllBtn');

  if (!email || !password) {
    alert('Please enter both email and password');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i>Logging in...';

  statusDiv.style.display = 'block';
  statusDiv.style.background = '#fff7ed';
  statusDiv.style.border = '1px solid #fdba74';
  statusDiv.innerHTML = 'Logging in to Stremio...';

  try {
    const response = await fetch(serverUrl + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const result = await response.json();

    if (result.success && result.authKey) {
      document.getElementById('authToken').value = result.authKey;
      state.authToken = result.authKey; // Store for userId generation (Phase 4)
      statusDiv.style.background = '#d1fae5';
      statusDiv.style.border = '1px solid #10b981';
      statusDiv.innerHTML = '✔ ' + result.message;

      // Auto-test the token
      const testResponse = await fetch(serverUrl + '/api/test-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken: result.authKey })
      });

      const testResult = await testResponse.json();
      if (testResult.success) {
        statusDiv.innerHTML = '✔ Login successful! Found ' + testResult.addonCount + ' addons.';
        replaceAllBtn.style.display = 'inline-block';
      }
    } else {
      statusDiv.style.background = '#fee2e2';
      statusDiv.style.border = '1px solid #ef4444';
      statusDiv.innerHTML = '✖ ' + (result.error || 'Login failed');
      replaceAllBtn.style.display = 'none';
    }
  } catch (e) {
    statusDiv.style.background = '#fee2e2';
    statusDiv.style.border = '1px solid #ef4444';
    statusDiv.innerHTML = '✖ Error: ' + e.message;
    replaceAllBtn.style.display = 'none';
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket" style="margin-right:6px"></i>Login';
  }
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

// Initialize page
renderAddonList();
