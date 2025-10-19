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
          .url-display { background: #f8fafc; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; word-break: break-all; overflow-wrap: break-word; }
          .advanced-toggle { display: none; }
          .advanced-options { display: block; margin-top: 8px; }
          .section-title { font-size: 16px; font-weight: 700; margin: 6px 0 8px 0; color: #1f2937; }
          .preview { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: #111827; white-space: pre-wrap; }
          .install-btn { background: #0ea5e9; color: white; text-decoration: none; padding: 8px 14px; border-radius: 6px; display: inline-block; font-size: 13px; font-weight: 600; margin-left: 8px; }
          .copy-btn { background: #22c55e; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
          .help-text { font-size: 12px; color: #666; margin-top: 5px; }
          .login-section { background: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 8px; padding: 16px; margin-bottom: 22px; }
          .addon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-top: 12px; }
          .addon-card { background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 12px; display: flex; align-items: center; gap: 10px; transition: all 0.2s; cursor: pointer; }
          .addon-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          .addon-card.wrappable { border-color: #10b981; }
          .addon-card.not-wrappable { opacity: 0.6; cursor: not-allowed; }
          .addon-card.already-wrapped { opacity: 1.0; cursor: pointer; background: #fffbeb; border-color: #f59e0b; }
          .addon-card.already-wrapped.selected { background: #fef3c7; border-color: #d97706; }
          .addon-card.selected { background: #dbeafe; border-color: #3b82f6; }
          .addon-logo { width: 48px; height: 48px; object-fit: contain; background: #f3f4f6; border-radius: 6px; }
          .addon-info { flex: 1; min-width: 0; }
          .addon-name { font-weight: 600; font-size: 14px; color: #111827; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .addon-status { font-size: 12px; color: #6b7280; display: flex; align-items: center; gap: 4px; }
          .status-icon { font-size: 14px; }
          .status-icon.wrappable { color: #10b981; }
          .status-icon.not-wrappable { color: #ef4444; }
          .addon-checkbox { width: 18px; height: 18px; cursor: pointer; }
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
            <p class="subtitle">Discover your installed addons and wrap them with IMDb ratings automatically. Cinemeta is required and stays first for best results.</p>
            <ol class="steps">
              <li><strong>Login to Stremio</strong> to see which of your installed addons can be wrapped.</li>
              <li><strong>Select addons</strong> from your account or manually add addon URLs (Cinemeta added automatically).</li>
              <li><strong>Customize ratings display</strong> - adjust format, position, and which content gets ratings.</li>
              <li><strong>Generate & Deploy</strong> - Get install URLs or use Auto-Replace to update your account instantly.</li>
            </ol>
          </div>
          <div class="content">
            <!-- Stremio Login Section -->
            <div class="login-section">
              <h2 style="margin-bottom: 8px; color: #111827;">Log In to Stremio</h2>
              <p style="font-size: 14px; color: #374151; margin-bottom: 12px;">
                Log in to see which of your installed addons can be wrapped with ratings. You can then select them to automatically add to your configuration.
              </p>

              <div style="margin-bottom: 15px;">
                <button type="button" onclick="toggleLoginAuthMethod()" id="loginAuthMethodToggle" style="background: none; border: none; color: #4f46e5; cursor: pointer; font-size: 14px; font-weight: 600; padding: 0;">
                  Switch to Auth Token
                </button>
              </div>

              <div id="loginAuthTokenMethod" class="form-group" style="display:none;">
                <label for="loginAuthToken">Stremio Auth Token *</label>
                <input type="text" id="loginAuthToken" placeholder="Paste your auth token" style="font-family: monospace; font-size: 12px;" />
                <div class="help-text" style="margin-top:6px;">
                  <strong>Login using an authentication key</strong>
                  <ol style="margin:6px 0 0 18px;">
                    <li>Login to <a href="https://web.stremio.com/" target="_blank">https://web.stremio.com/</a> using your Stremio credentials.</li>
                    <li>Open the developer console and paste: <code>JSON.parse(localStorage.getItem("profile")).auth.key</code></li>
                    <li>Copy the printed value and paste it into the form above.</li>
                  </ol>
                </div>
                <button class="btn" onclick="loginAndFetchAddons()" id="loginWithTokenBtn" style="margin-top: 10px;"><i class="fa-solid fa-right-to-bracket" style="margin-right:6px"></i>Fetch Addons</button>
              </div>

              <div id="loginEmailPasswordMethod" class="form-group">
                <label for="loginStremioEmail">Stremio Email *</label>
                <input type="email" id="loginStremioEmail" placeholder="your@email.com" style="margin-bottom: 10px;" />

                <label for="loginStremioPassword">Stremio Password *</label>
                <input type="password" id="loginStremioPassword" placeholder="Your password" style="margin-bottom: 10px;" />

                <div class="help-text" style="margin-top:6px;">
                  <strong>Note:</strong> Facebook login is not supported. Your credentials are only used to authenticate with Stremio's API and are not stored.
                </div>

                <button class="btn" onclick="loginWithPasswordAndFetchAddons()" id="loginWithPasswordBtn" style="margin-top: 10px;"><i class="fa-solid fa-right-to-bracket" style="margin-right:6px"></i>Login & Fetch Addons</button>
              </div>

              <div id="loginStatus" style="display:none; padding: 10px; border-radius: 6px; margin-top: 12px;"></div>

              <!-- Installed Addons List -->
              <div id="installedAddonsSection" style="display:none; margin-top: 16px; padding-top: 16px; border-top: 1px solid #bae6fd;">
                <h3 style="margin-bottom: 8px;">Your Installed Addons</h3>
                <p style="font-size: 13px; color: #374151; margin-bottom: 10px;">
                  Select wrappable addons to add them to your configuration. Addons with a green checkmark can be wrapped.
                </p>
                <div id="installedAddonsList" class="addon-grid"></div>
              </div>
            </div>

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
              <label>Addons To Wrap</label>
              <div id="addonList" class="url-display" style="white-space: normal;"><em>None yet. Cinemeta will be added automatically.</em></div>
              <div class="help-text">Cinemeta will be wrapped and placed first automatically unless you're using a full metadata addon like AIO Metadata.</div>
              <div id="cinemataNotice" style="display:none; background: #dbeafe; border: 1px solid #3b82f6; border-radius: 6px; padding: 10px; margin-top: 8px; font-size: 13px; color: #1e40af;">
                <i class="fa-solid fa-info-circle" style="margin-right: 6px;"></i>
                <strong>AIO Metadata Detected:</strong> Cinemeta has been automatically removed from your configuration since AIO Metadata provides complete metadata coverage. Adding both would cause duplicate requests.
              </div>
            </div>

            <!-- Ratings Display Section -->
            <div id="advancedOptions" class="advanced-options" style="background: #f8fafc; border: 2px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-top: 22px;">
              <div class="section-title">Ratings Display</div>

              <!-- Removed global enable toggles; per-location settings now control behavior -->

              <div class="form-group" style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                <div style="margin-bottom: 10px;"><strong>Inject Ratings Into:</strong></div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  <label style="display: flex; align-items: center; margin: 0; cursor: pointer;">
                    <input type="checkbox" id="ratingLocationTitle" checked style="width: 18px; height: 18px;" />
                    <span style="margin-left: 8px;">Title/Name (space-constrained, quick glance)</span>
                  </label>
                  <div class="help-text" style="margin-left: 26px; margin-top: -4px;">Rating will be added to the title (e.g., "★ 8.5 | Movie Name")</div>

                  <label style="display: flex; align-items: center; margin: 0; cursor: pointer;">
                    <input type="checkbox" id="ratingLocationDescription" style="width: 18px; height: 18px;" />
                    <span style="margin-left: 8px;">Synopsis/Description (detailed metadata)</span>
                  </label>
                  <div class="help-text" style="margin-left: 26px; margin-top: -4px;">Rating will be added to the description with extended metadata options</div>
                </div>
              </div>

              <!-- Title Format Section (shows when title checkbox is checked) -->
              <div id="titleFormatSection" style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                <div style="font-weight: 600; margin-bottom: 10px; color: #1e40af;">Title Format Settings</div>

                <!-- Granular Control: Apply to which content types -->
                <div class="form-group" style="background: #fff; border: 1px solid #93c5fd; border-radius: 6px; padding: 10px; margin-bottom: 12px;">
                  <div style="font-weight: 600; margin-bottom: 8px; color: #1e40af;">Apply to:</div>
                  <label style="display: flex; align-items: center; margin-bottom: 6px; cursor: pointer;">
                    <input type="checkbox" id="titleEnableCatalogItems" checked style="width: 18px; height: 18px;" />
                    <span style="margin-left: 8px;">Catalog Items (Movies/Series)</span>
                  </label>
                  <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="titleEnableEpisodes" checked style="width: 18px; height: 18px;" />
                    <span style="margin-left: 8px;">Episodes</span>
                  </label>
                </div>

                <div class="form-group">
                  <label>Position</label>
                  <select id="titlePosition"><option value="prefix">Prefix (* 8.5 at start)</option><option value="suffix">Suffix (* 8.5 at end)</option></select>
                </div>
                <div class="row-2">
                  <div class="form-group">
                    <label for="titleTemplate">Template</label>
                    <input type="text" id="titleTemplate" value="★ {rating}" />
                    <div class="help-text">Use {rating} as placeholder</div>
                  </div>
                  <div class="form-group">
                    <label for="titleSeparator">Separator</label>
                    <select id="titleSeparator">
                      <option value=" | " selected>Pipe ( | )</option>
                      <option value=" - ">Dash ( - )</option>
                      <option value=", ">Comma + space ( , )</option>
                      <option value=" . ">Dot ( . )</option>
                      <option value=" • ">Bullet ( • )</option>
                      <option value=" ★ ">Star ( ★ )</option>
                      <option value=" ⭐ ">Emoji Star ( ⭐ )</option>
                      <option value=" ✨ ">Sparkles ( ✨ )</option>
                      <option value=" ">Space</option>
                    </select>
                    <div class="help-text">Choose a basic separator for titles</div>
                  </div>
                </div>
                <div class="form-group">
                  <div class="help-text" style="margin-bottom:6px;">Preview</div>
                  <div id="titlePreview" class="preview"></div>
                </div>
              </div>

              <!-- Description Format Section (shows when description checkbox is checked) -->
              <div id="descriptionFormatSection" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; margin-bottom: 16px; display: none;">
                <div style="font-weight: 600; margin-bottom: 10px; color: #15803d;">Description Format Settings</div>

                <!-- Granular Control: Apply to which content types -->
                <div class="form-group" style="background: #fff; border: 1px solid #86efac; border-radius: 6px; padding: 10px; margin-bottom: 12px;">
                  <div style="font-weight: 600; margin-bottom: 8px; color: #15803d;">Apply to:</div>
                  <label style="display: flex; align-items: center; margin-bottom: 6px; cursor: pointer;">
                    <input type="checkbox" id="descriptionEnableCatalogItems" checked style="width: 18px; height: 18px;" />
                    <span style="margin-left: 8px;">Catalog Items (Movies/Series)</span>
                  </label>
                  <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="descriptionEnableEpisodes" checked style="width: 18px; height: 18px;" />
                    <span style="margin-left: 8px;">Episodes</span>
                  </label>
                </div>

                <div class="form-group">
                  <label>Position</label>
                  <select id="descriptionPosition"><option value="prefix">Prefix (at start)</option><option value="suffix">Suffix (at end)</option></select>
                </div>
                <div class="row-2">
                  <div class="form-group">
                    <label for="descriptionTemplate">Template</label>
                    <input type="text" id="descriptionTemplate" value="{rating}/10 IMDb" />
                    <div class="help-text">Use {rating} as placeholder</div>
                  </div>
                  <div class="form-group">
                    <label for="descriptionSeparator">Separator</label>
                    <select id="descriptionSeparator">
                      <option value="\n" selected>New line (LF)</option>
                      <option value=" - ">Dash ( - )</option>
                      <option value=" | ">Pipe ( | )</option>
                      <option value=", ">Comma + space ( , )</option>
                      <option value=" . ">Dot ( . )</option>
                      <option value=" • ">Bullet ( • )</option>
                      <option value=" ★ ">Star ( ★ )</option>
                      <option value=" ⭐ ">Emoji Star ( ⭐ )</option>
                      <option value=" ✨ ">Sparkles ( ✨ )</option>
                      <option value=" ">Space</option>
                    </select>
                    <div class="help-text">New line works on Android Mobile/TV; Desktop/Web may collapse it. If you use Desktop/Web primarily, pick Bullet/Star/Pipe.</div>
                  </div>
                </div>
                <div class="form-group">
                  <div style="font-weight: 600; margin-bottom: 8px;">Extended Metadata</div>

                  <!-- IMDb Vote Count -->
                  <label style="display: flex; align-items: center; margin-bottom: 6px; cursor: pointer;">
                    <input type="checkbox" id="includeVotes" style="width: 18px; height: 18px;" />
                    <span style="margin-left: 8px;">Include IMDb vote count</span>
                  </label>
                  <div id="voteCountFormatSection" style="margin-left: 26px; margin-bottom: 10px; display: none;">
                    <label for="voteCountFormat" style="display: block; font-weight: 600; margin-bottom: 6px;">Vote Count Format</label>
                    <select id="voteCountFormat">
                      <option value="short" selected>Short (1.2M votes)</option>
                      <option value="full">Full (1,200,000 votes)</option>
                      <option value="both">Both (1,200,000 / 1.2M votes)</option>
                    </select>
                    <div class="help-text" style="margin-top: 5px;">Choose how to display vote counts</div>
                  </div>

                  <!-- Rotten Tomatoes & Metacritic Ratings -->
                  <label style="display: flex; align-items: center; margin-bottom: 6px; cursor: pointer;">
                    <input type="checkbox" id="includeRottenTomatoes" style="width: 18px; height: 18px;" />
                    <span style="margin-left: 8px;">Include Rotten Tomatoes rating</span>
                  </label>
                  <label style="display: flex; align-items: center; margin-bottom: 6px; cursor: pointer;">
                    <input type="checkbox" id="includeMetacritic" style="width: 18px; height: 18px;" />
                    <span style="margin-left: 8px;">Include Metacritic score</span>
                  </label>
                  <div id="metacriticFormatSection" style="margin-left: 26px; margin-bottom: 10px; display: none;">
                    <label for="metacriticFormat" style="display: block; font-weight: 600; margin-bottom: 6px;">Metacritic Format</label>
                    <select id="metacriticFormat">
                      <option value="score" selected>Score only (68 MC)</option>
                      <option value="outof100">Out of 100 (68/100 MC)</option>
                    </select>
                    <div class="help-text" style="margin-top: 5px;">Choose how to display Metacritic scores</div>
                  </div>

                  <!-- TMDB Rating -->
                  <label style="display: flex; align-items: center; margin-bottom: 6px; cursor: pointer;">
                    <input type="checkbox" id="includeTmdbRating" style="width: 18px; height: 18px;" />
                    <span style="margin-left: 8px;">Include TMDB rating</span>
                  </label>
                  <div id="tmdbRatingFormatSection" style="margin-left: 26px; margin-bottom: 10px; display: none;">
                    <label for="tmdbRatingFormat" style="display: block; font-weight: 600; margin-bottom: 6px;">TMDB Rating Format</label>
                    <select id="tmdbRatingFormat">
                      <option value="decimal" selected>Decimal (8.5 TMDB)</option>
                      <option value="outof10">Out of 10 (8.5/10 TMDB)</option>
                    </select>
                    <div class="help-text" style="margin-top: 5px;">Choose how to display TMDB ratings</div>
                  </div>

                  <!-- MPAA, Release Date, Streaming Services -->
                  <label style="display: flex; align-items: center; margin-bottom: 6px; cursor: pointer;">
                    <input type="checkbox" id="includeMpaa" style="width: 18px; height: 18px;" />
                    <span style="margin-left: 8px;">Include MPAA rating (e.g., "PG-13")</span>
                  </label>
                  <label style="display: flex; align-items: center; margin-bottom: 6px; cursor: pointer;">
                    <input type="checkbox" id="includeReleaseDate" style="width: 18px; height: 18px;" />
                    <span style="margin-left: 8px;">Include release date</span>
                  </label>
                  <div id="releaseDateFormatSection" style="margin-left: 26px; margin-bottom: 10px; display: none;">
                    <label for="releaseDateFormat" style="display: block; font-weight: 600; margin-bottom: 6px;">Release Date Format</label>
                    <select id="releaseDateFormat">
                      <option value="year" selected>Year only (2023)</option>
                      <option value="short">Short (Jan 15, 2023)</option>
                      <option value="full">Full (January 15, 2023)</option>
                    </select>
                    <div class="help-text" style="margin-top: 5px;">Choose how to display release dates</div>
                  </div>
                  <label style="display: flex; align-items: center; margin-bottom: 6px; cursor: pointer;">
                    <input type="checkbox" id="includeStreamingServices" style="width: 18px; height: 18px;" />
                    <span style="margin-left: 8px;">Include streaming services</span>
                  </label>
                  <div id="streamingRegionSection" style="margin-left: 26px; margin-bottom: 10px; display: none;">
                    <label for="streamingRegion" style="display: block; font-weight: 600; margin-bottom: 6px;">Streaming Region</label>
                    <select id="streamingRegion">
                      <option value="US" selected>United States (US)</option>
                      <option value="GB">United Kingdom (GB)</option>
                      <option value="CA">Canada (CA)</option>
                      <option value="AU">Australia (AU)</option>
                      <option value="DE">Germany (DE)</option>
                      <option value="FR">France (FR)</option>
                      <option value="IT">Italy (IT)</option>
                      <option value="ES">Spain (ES)</option>
                      <option value="JP">Japan (JP)</option>
                      <option value="BR">Brazil (BR)</option>
                      <option value="MX">Mexico (MX)</option>
                      <option value="IN">India (IN)</option>
                    </select>
                    <div class="help-text" style="margin-top: 5px;">Choose which region's streaming providers to display</div>
                  </div>
                  <div id="metadataOrderSection" style="margin-top: 10px; display:none;">
                    <label style="display: block; font-weight: 600; margin-bottom: 6px;">Order</label>
                    <ul id="metadataOrderList" style="list-style: none; padding: 0; margin: 0;"></ul>
                    <div class="help-text" style="margin-top: 5px;">Use arrows to arrange how metadata appears after the rating.</div>
                  </div>
                  <div style="margin-top: 10px;">
                    <label for="metadataSeparator" style="display: block; font-weight: 600; margin-bottom: 6px;">Metadata Separator</label>
                    <select id="metadataSeparator">
                      <option value=" • " selected>Bullet ( • )</option>
                      <option value=" | ">Pipe ( | )</option>
                      <option value=" - ">Dash ( - )</option>
                      <option value=", ">Comma + space ( , )</option>
                      <option value=" . ">Dot ( . )</option>
                      <option value=" ★ ">Star ( ★ )</option>
                      <option value=" ⭐ ">Emoji Star ( ⭐ )</option>
                      <option value=" ✨ ">Sparkles ( ✨ )</option>
                      <option value=" ">Space</option>
                    </select>
                    <div class="help-text" style="margin-top: 5px;">Separator between rating, vote count, MPAA rating, TMDB rating, release date, streaming services, Rotten Tomatoes, and Metacritic</div>
                  </div>
                </div>
                <div class="form-group">
                  <div class="help-text" style="margin-bottom:6px;">Preview</div>
                  <div id="descriptionPreview" class="preview"></div>
                </div>
              </div>
            </div>

            <div class="form-group" style="margin-top: 22px;"><button class="btn" onclick="generateAll()">Generate Install URLs & Enable Auto-Replace</button></div>

            <div class="result-section" id="resultSection" style="display:none;">
              <h3 style="margin-bottom: 10px;">Auto-Replace In Your Account</h3>
              <p style="font-size: 13px; color:#374151; margin-bottom: 12px;">We remove existing versions and install wrapped versions in-place. Missing ones are appended. Cinemeta is first.</p>

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

              <div style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                <h3 style="margin-bottom: 10px;">Manual Installation URLs</h3>
                <div class="help-text" style="font-size: 13px; color:#374151; margin-bottom: 10px;">
                  Recommended: use <strong>Auto Replace</strong> above to avoid duplicates and ordering issues.
                  If you prefer manual install, please ensure:
                  <ul style="margin:6px 0 0 18px;">
                    <li>Only one version of each addon exists in your library — keep the <strong>wrapped</strong> one.</li>
                    <li>Install a <strong>wrapped Cinemeta</strong> and hide/remove the original Cinemeta.</li>
                    <li>If you wrap a metadata addon (e.g., TMDB or AIO Metadata), remove the non‑wrapped Cinemeta.</li>
                  </ul>
                </div>
                <div id="manualList"></div>
              </div>
            </div>

            <!-- Emergency Restore (bottom-most) -->
            <div style="background: #fff7ed; border: 2px solid #fdba74; border-radius: 8px; padding: 16px; margin-top: 22px;">
              <h3 style="color:#9a3412; margin-bottom:8px;">Emergency Restore</h3>
              <p style="font-size: 13px; color: #7c2d12; margin-bottom: 10px;">Unwraps all wrapped addons and restores originals with clean Cinemeta. Use if Stremio is broken.</p>
              <div id="emergencyAuthInput">
                <div class="help-text" style="margin-bottom: 8px; color: #7c2d12;">Paste your auth token or <a href="#" onclick="document.querySelector('.login-section').scrollIntoView({behavior:'smooth'}); return false;" style="color: #ea580c; text-decoration: underline;">login above</a> to auto-fill.</div>
                <div style="display:flex; gap:8px; align-items: end;">
                  <div style="flex:1"><input type="text" id="emergencyAuthToken" placeholder="Paste your auth token" style="font-family: monospace;" /></div>
                  <button class="btn" onclick="emergencyRestore()"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>Emergency Restore</button>
                </div>
              </div>
              <div id="emergencyAuthReady" style="display:none;">
                <p style="font-size: 13px; color: #059669; margin-bottom: 10px; font-weight: 600;">✓ Already logged in - ready to restore</p>
                <button class="btn" onclick="emergencyRestore()"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>Emergency Restore</button>
              </div>
              <div id="emergencyStatus" style="display:none; margin-top: 10px; padding: 10px; border-radius: 6px;"></div>
            </div>

          </div>
        </div>

        <script>
          const serverUrl = '${protocol}://${host}';
          const CINEMETA_URL = 'https://v3-cinemeta.strem.io/manifest.json';
          const state = { items: [], selectedAddons: new Set() };

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
              const match = wrappedUrl.match(/\/([A-Za-z0-9_-]+)\/manifest\.json$/);
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
              if (isCinemeta) {
                // Ensure Cinemeta is visually selected and can't be deselected
                state.selectedAddons.add(CINEMETA_URL);
                card.classList.add('selected');
              } else if (state.selectedAddons.has(sanitizedUrl)) {
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
                reasonText.textContent = 'Cinemeta (always enabled)';
              } else if (isAlreadyWrapped) {
                reasonText.textContent = 'Re-wrap with new settings';
              } else {
                reasonText.textContent = addon.reason;
              }

              status.appendChild(icon);
              status.appendChild(reasonText);

              info.appendChild(name);
              info.appendChild(status);

              // Checkbox
              const checkbox = document.createElement('input');
              checkbox.type = 'checkbox';
              checkbox.className = 'addon-checkbox';
              // Enable checkbox for wrappable addons AND already-wrapped addons (except Cinemeta)
              checkbox.disabled = isCinemeta || (!addon.wrappable && !isAlreadyWrapped);

              // Auto-select already-wrapped addons
              if (isAlreadyWrapped && !isCinemeta) {
                state.selectedAddons.add(sanitizedUrl);
                card.classList.add('selected');
              }

              checkbox.checked = isCinemeta || state.selectedAddons.has(sanitizedUrl);
              if (isCinemeta) {
                checkbox.title = 'Cinemeta is always enabled';
              } else if (isAlreadyWrapped) {
                checkbox.title = 'Click to re-wrap with new settings';
              }

              // Enable toggle for both wrappable and already-wrapped addons
              if (!isCinemeta && (addon.wrappable || isAlreadyWrapped)) {
                const toggleSelection = () => {
                  if (state.selectedAddons.has(sanitizedUrl)) {
                    state.selectedAddons.delete(sanitizedUrl);
                    card.classList.remove('selected');
                    checkbox.checked = false;
                  } else {
                    state.selectedAddons.add(sanitizedUrl);
                    card.classList.add('selected');
                    checkbox.checked = true;
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

            // Add "Add Selected" button if not exists
            let addSelectedBtn = document.getElementById('addSelectedAddonsBtn');
            if (!addSelectedBtn) {
              addSelectedBtn = document.createElement('button');
              addSelectedBtn.id = 'addSelectedAddonsBtn';
              addSelectedBtn.className = 'btn';
              addSelectedBtn.style.marginTop = '12px';
              addSelectedBtn.innerHTML = '<i class="fa-solid fa-plus" style="margin-right:6px"></i>Add Selected Addons';
              addSelectedBtn.onclick = addSelectedAddons;
              document.getElementById('installedAddonsSection').appendChild(addSelectedBtn);
            }
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

            ensureCinemeta();

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

          function ensureCinemeta() {
            // Skip Cinemeta if user has a full metadata addon like AIO Metadata
            if (hasFullMetadataAddon()) {
              // Remove Cinemeta if it exists
              const cinemataIndex = state.items.findIndex(i => i.required || i.url === CINEMETA_URL);
              if (cinemataIndex !== -1) {
                state.items.splice(cinemataIndex, 1);
              }

              // Move the full metadata addon to position 0
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

              // Show notification
              const notice = document.getElementById('cinemataNotice');
              if (notice) {
                notice.style.display = 'block';
              }
              return;
            }

            // Add Cinemeta if not present and no full metadata addon
            if (!state.items.find(i => i.required)) {
              state.items.unshift({ url: CINEMETA_URL, name: 'Cinemeta with Ratings', required: true });
              // Hide notification
              const notice = document.getElementById('cinemataNotice');
              if (notice) {
                notice.style.display = 'none';
              }
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
            const rawUrl = document.getElementById('addonInputUrl').value.trim();
            const nameInput = document.getElementById('addonInputName').value.trim();
            if (!rawUrl) { alert('Enter an addon URL'); return; }

            // Sanitize URL: convert stremio:// to https://
            const url = sanitizeAddonUrl(rawUrl);

            // Prevent adding Cinemeta manually; it's enforced automatically
            if (url === CINEMETA_URL) {
              alert('Cinemeta is already included by default and cannot be added twice.');
              return;
            }
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

          function getMetadataOrder() {
            var list = document.getElementById('metadataOrderList');
            if (!list) return ['votes','mpaa','tmdb','releaseDate','rottenTomatoes','metacritic'];
            var keys = [];
            list.querySelectorAll('li').forEach(function(li){
              var k = li.getAttribute('data-key'); if (k) keys.push(k);
            });
            return keys.length ? keys : ['votes','mpaa','tmdb','releaseDate','rottenTomatoes','metacritic'];
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
            // Read checkbox states
            var includes = {
              votes: document.getElementById('includeVotes')?.checked || false,
              mpaa: document.getElementById('includeMpaa')?.checked || false,
              tmdb: document.getElementById('includeTmdbRating')?.checked || false,
              releaseDate: document.getElementById('includeReleaseDate')?.checked || false,
              streamingServices: document.getElementById('includeStreamingServices')?.checked || false,
              rottenTomatoes: document.getElementById('includeRottenTomatoes')?.checked || false,
              metacritic: document.getElementById('includeMetacritic')?.checked || false
            };
            var labels = {
              votes: 'Vote count',
              mpaa: 'MPAA rating',
              tmdb: 'TMDB rating',
              releaseDate: 'Release date',
              streamingServices: 'Streaming services',
              rottenTomatoes: 'Rotten Tomatoes',
              metacritic: 'Metacritic'
            };
            var defaultOrder = ['votes','mpaa','tmdb','releaseDate','streamingServices','rottenTomatoes','metacritic'];
            var selected = defaultOrder.filter(function(k){ return includes[k]; });
            if (selected.length === 0) {
              section.style.display = 'none';
              list.innerHTML = '';
              return;
            }
            section.style.display = 'block';
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
              var metaSep = document.getElementById('metadataSeparator')?.value || ' • ';
              var voteCountFormat = document.getElementById('voteCountFormat')?.value || 'short';
              var tmdbRatingFormat = document.getElementById('tmdbRatingFormat')?.value || 'decimal';
              var releaseDateFormat = document.getElementById('releaseDateFormat')?.value || 'year';
              var metacriticFormat = document.getElementById('metacriticFormat')?.value || 'score';

              // Replace literal backslash-n with CRLF to maximize client compatibility
              descSep = descSep.replace(/\\n/g, String.fromCharCode(13) + String.fromCharCode(10));

              var sampleRating = '8.5';
              var ratingText = descTpl.replace('{rating}', sampleRating);

              // Build metadata parts with configurable order
              var metadataParts = [ratingText];
              var order = getMetadataOrder();
              var partTexts = {};
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

              var allowed = ['votes','mpaa','tmdb','releaseDate','streamingServices','rottenTomatoes','metacritic'];
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

          function generateAll() {
            ensureCinemeta();

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
              link.href = url.replace(/^https:\\/\\//, 'stremio://');
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
