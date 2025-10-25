/**
 * IP address extraction utility
 * Handles proxy headers (X-Forwarded-For, X-Real-IP) to get the real client IP
 */

/**
 * Extract client IP address from request
 * Handles various proxy headers and fallbacks
 *
 * @param {Object} req - Express request object
 * @returns {string} - Client IP address
 */
function extractClientIp(req) {
  // Check X-Forwarded-For header (Cloudflare, proxies)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
    // The first IP is the original client
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    if (ips.length > 0 && ips[0]) {
      return ips[0];
    }
  }

  // Check X-Real-IP header (nginx, some proxies)
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }

  // Check CF-Connecting-IP (Cloudflare specific)
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fallback to req.ip (Express)
  if (req.ip) {
    // Remove IPv6 prefix if present (::ffff:192.168.1.1 -> 192.168.1.1)
    return req.ip.replace(/^::ffff:/, '');
  }

  // Final fallback to socket address
  if (req.socket && req.socket.remoteAddress) {
    return req.socket.remoteAddress.replace(/^::ffff:/, '');
  }

  // Extreme fallback
  return 'unknown';
}

/**
 * Normalize IP address for consistent rate limiting
 * IPv6 addresses are left as-is, IPv4 are cleaned up
 *
 * @param {string} ip - IP address
 * @returns {string} - Normalized IP address
 */
function normalizeIp(ip) {
  if (!ip || ip === 'unknown') {
    return 'unknown';
  }

  // Remove IPv6 prefix
  ip = ip.replace(/^::ffff:/, '');

  // Normalize localhost
  if (ip === '::1' || ip === '127.0.0.1') {
    return 'localhost';
  }

  return ip;
}

module.exports = {
  extractClientIp,
  normalizeIp
};
