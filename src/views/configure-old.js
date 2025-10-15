/**
 * DEPRECATED: Old single-addon configuration page
 * Kept for reference only - users should use /configure instead
 *
 * Note: This file contains the old configuration UI HTML.
 * To keep this file manageable, the full HTML is commented out.
 * If needed, it can be restored from the git history.
 */

function generateConfigureOldHTML(protocol, host) {
  // Redirect to new configure page
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="0; url=/configure">
        <title>Redirecting...</title>
      </head>
      <body>
        <p>Redirecting to new configuration page...</p>
        <p>If you are not redirected, <a href="/configure">click here</a>.</p>
      </body>
    </html>
  `;
}

module.exports = { generateConfigureOldHTML };
