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
        <link rel="stylesheet" href="/css/configure.css" />
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
                    <input type="checkbox" id="ratingLocationDescription" checked style="width: 18px; height: 18px;" />
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
              <div id="descriptionFormatSection" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
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
                    <label style="display: block; font-weight: 600; margin-bottom: 6px;">Metadata Order</label>
                    <ul id="metadataOrderList" style="list-style: none; padding: 0; margin: 0;"></ul>
                    <div class="help-text" style="margin-top: 5px;">Use arrows to arrange the order of all metadata elements. IMDb rating can now be moved anywhere in the list.</div>
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

              <!-- Auto Install (Primary CTA) -->
              <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 4px 16px rgba(79, 70, 229, 0.3);" id="autoInstallSection">
                <h3 style="color: white; margin: 0 0 8px 0; font-size: 18px; display: flex; align-items: center; gap: 8px;">
                  <i class="fa-solid fa-bolt"></i>
                  Recommended: Auto Install
                </h3>
                <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin-bottom: 12px;">
                  Instantly replace all your addons with wrapped versions. No manual work, no duplicates, perfect ordering.
                </p>
                <button class="btn" onclick="autoReplaceAll()" id="replaceAllBtn" style="display:none; background: white; color: #4f46e5; font-size: 16px; padding: 14px 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"><i class="fa-solid fa-wand-magic-sparkles" style="margin-right:8px"></i>Auto Install</button>
                <div id="replaceStatus" style="display:none; padding: 12px; border-radius: 6px; margin-top: 12px; background: white;"></div>
              </div>

              <!-- Manual Install (Accordion) -->
              <div style="margin-top: 20px; border: 2px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <button onclick="toggleManualInstall()" id="manualInstallToggle" style="width: 100%; background: #f9fafb; border: none; padding: 16px; text-align: left; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-size: 15px; font-weight: 600; color: #374151;">
                  <span><i class="fa-solid fa-link" style="margin-right: 8px; color: #6b7280;"></i>Manual Installation URLs</span>
                  <i class="fa-solid fa-chevron-down" id="manualInstallChevron" style="color: #9ca3af; transition: transform 0.2s;"></i>
                </button>
                <div id="manualInstallContent" style="display: none; padding: 16px; background: white; border-top: 1px solid #e5e7eb;">
                  <div class="help-text" style="font-size: 13px; color:#374151; margin-bottom: 10px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; padding: 10px;">
                    <strong>⚠️ Not Recommended:</strong> Use <strong>Auto Install</strong> above to avoid duplicates and ordering issues. If you prefer manual install, please ensure:
                    <ul style="margin:6px 0 0 18px;">
                      <li>Only one version of each addon exists in your library — keep the <strong>wrapped</strong> one.</li>
                      <li>Install a <strong>wrapped Cinemeta</strong> and hide/remove the original Cinemeta.</li>
                      <li>If you wrap a metadata addon (e.g., TMDB or AIO Metadata), remove the non‑wrapped Cinemeta.</li>
                    </ul>
                  </div>
                  <div id="manualList"></div>
                </div>
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
          // Set server URL for external JavaScript
          window.SERVER_URL = '${protocol}://${host}';
        </script>
        <script src="/js/configure.js"></script>
      </body>
    </html>
  `;
}

module.exports = { generateConfigureHTML };
