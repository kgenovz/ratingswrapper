/**
 * CORS middleware
 * Adds necessary CORS headers for Stremio to access the addon
 * Exempts admin routes from strict CSP
 */

function corsMiddleware(req, res, next) {
  // Skip strict headers for admin routes, configure pages, and API
  const isAdminRoute = req.path.startsWith('/admin');
  const isConfigRoute = req.path.startsWith('/configure');
  const isApiRoute = req.path.startsWith('/api');
  const isMonitoringRoute = req.path === '/metrics' || req.path === '/healthz';

  if (isAdminRoute || isConfigRoute || isApiRoute || isMonitoringRoute) {
    // Allow normal web page rendering for admin/config pages
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  } else {
    // Strict CORS for addon endpoints (required by Stremio)
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  }

  next();
}

module.exports = corsMiddleware;
