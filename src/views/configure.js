/**
 * Multi-addon configuration UI
 * Generates the HTML for the main configuration page
 */

function generateConfigureHTML(protocol, host) {
  return `
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
          input[type="text"], input[type="url"], input[type="email"], input[type="password"], select { width: 100%; padding: 10px 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 14px; }
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
          .help-text { font-size: 12px; color: #666; margin-top: 5px; }
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
              <li>Click "Generate Wrapped URLs" to get manual install links.</li>
              <li>Or test your token and use "Auto Replace All".</li>
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

                <div style="margin-bottom: 15px;">
                  <button type="button" onclick="toggleAuthMethod()" id="authMethodToggle" style="background: none; border: none; color: #4f46e5; cursor: pointer; font-size: 14px; font-weight: 600; padding: 0;">
                    Switch to Auth Token
                  </button>
                </div>

                <div id="authTokenMethod" class="form-group" style="display:none;">
                  <label for="authToken">Stremio Auth Token *</label>
                  <input type="text" id="authToken" placeholder="Paste your auth token" style="font-family: monospace; font-size: 12px;" />
                  <div class="help-text" style="margin-top:6px;">
                    <strong>Login using an authentication key</strong>
                    <ol style="margin:6px 0 0 18px;">
                      <li>Login to <a href="https://web.stremio.com/" target="_blank">https://web.stremio.com/</a> using your Stremio credentials.</li>
                      <li>Open the developer console and paste: <code>JSON.parse(localStorage.getItem("profile")).auth.key</code></li>
                      <li>Copy the printed value and paste it into the form above.</li>
                    </ol>
                  </div>
                </div>

                <div id="emailPasswordMethod" class="form-group">
                  <label for="stremioEmail">Stremio Email *</label>
                  <input type="email" id="stremioEmail" placeholder="your@email.com" style="margin-bottom: 10px;" />

                  <label for="stremioPassword">Stremio Password *</label>
                  <input type="password" id="stremioPassword" placeholder="Your password" style="margin-bottom: 10px;" />

                  <div class="help-text" style="margin-top:6px;">
                    <strong>Note:</strong> Facebook login is not supported. Your credentials are only used to authenticate with Stremio's API and are not stored.
                  </div>

                  <button class="btn" onclick="loginWithPassword()" id="loginBtn" style="margin-top: 10px;"><i class="fa-solid fa-right-to-bracket" style="margin-right:6px"></i>Login</button>
                </div>

                <button class="btn" onclick="testAuth()" id="testAuthBtn" style="margin-bottom: 10px; display:none;"><i class="fa-solid fa-key" style="margin-right:6px"></i>Test Auth Token</button>
                <div id="authStatus" style="display:none; padding: 10px; border-radius: 6px; margin-bottom: 12px;"></div>
                <button class="btn" onclick="autoReplaceAll()" id="replaceAllBtn" style="display:none;"><i class="fa-solid fa-rotate" style="margin-right:6px"></i>Auto Replace All</button>
                <div id="replaceStatus" style="display:none; padding: 12px; border-radius: 6px; margin-top: 12px;"></div>
              </div>
            </div>

            <!-- Ratings Display Section -->
            <div id="advancedOptions" class="advanced-options" style="background: #f8fafc; border: 2px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-top: 22px;">
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

            <!-- Emergency Restore (bottom-most) -->
            <div style="background: #fff7ed; border: 2px solid #fdba74; border-radius: 8px; padding: 16px; margin-top: 22px;">
              <h3 style="color:#9a3412; margin-bottom:8px;">Emergency Restore</h3>
              <p style="font-size: 13px; color: #7c2d12; margin-bottom: 10px;">If Stremio is in a broken state, reset to Cinemeta-only, then re-run configuration.</p>
              <div style="display:flex; gap:8px; align-items: end;">
                <div style="flex:1"><input type="text" id="emergencyAuthToken" placeholder="Paste your auth token" style="font-family: monospace;" /></div>
                <button class="btn" onclick="emergencyRestore()"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>Emergency Restore</button>
              </div>
              <div id="emergencyStatus" style="display:none; margin-top: 10px; padding: 10px; border-radius: 6px;"></div>
            </div>

          </div>
        </div>

        <script>
          const serverUrl = '${protocol}://${host}';
          const CINEMETA_URL = 'https://v3-cinemeta.strem.io/manifest.json';
          const state = { items: [] };

          function guessNameFromUrl(u) {
            try {
              var h = (new URL(u)).hostname.replace(/^www\\./, '');
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

          // Initialize list with Cinemeta entry (required)
          ensureCinemeta();
          renderAddonList();
        </script>
      </body>
    </html>
  `;
}

module.exports = { generateConfigureHTML };
