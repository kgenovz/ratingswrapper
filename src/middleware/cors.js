/**
 * CORS middleware
 * Adds necessary CORS headers for Stremio to access the addon
 */

function corsMiddleware(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
}

module.exports = corsMiddleware;
