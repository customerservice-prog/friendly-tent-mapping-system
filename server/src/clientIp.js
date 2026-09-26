const net = require('net');

function normalizedIp(value) {
  if (typeof value !== 'string') return null;
  const ip = value.trim();
  if (!ip || ip.includes('%')) return null;
  const family = net.isIP(ip);
  if (family === 4) return ip;
  if (family !== 6) return null;
  const canonical = new URL('http://[' + ip + ']/').hostname.slice(1, -1).toLowerCase();
  // Unify mapped IPv4 socket addresses and normal IPv4 so the same client
  // cannot acquire separate buckets through equivalent representations.
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join('.');
  }
  return canonical;
}

function clientIp(req) {
  // Railway documents X-Real-IP as the original client's address. Trust this
  // header only in its deployed runtime, never an arbitrary forwarded chain.
  // https://docs.railway.com/networking/public-networking/specs-and-limits
  if (process.env.RAILWAY_ENVIRONMENT_ID && process.env.RAILWAY_SERVICE_ID) {
    const edgeIp = normalizedIp(req.headers?.['x-real-ip']);
    if (edgeIp) return edgeIp;
  }
  return normalizedIp(req.socket?.remoteAddress) || 'unknown';
}

module.exports = { clientIp };
