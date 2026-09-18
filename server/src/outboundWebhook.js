const net = require('net');

function privateIpv4(host) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a,b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224;
}

function privateIpv6(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  return h === '::' || h === '::1' || h.startsWith('fc') || h.startsWith('fd') ||
    h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb');
}

function validateWebhookUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return { ok: true, url: null };
  let parsed;
  try { parsed = new URL(raw); } catch (_) { return { ok: false, error: 'Webhook URL must be a valid URL' }; }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'Webhook URL must use HTTPS' };
  if (parsed.username || parsed.password) return { ok: false, error: 'Webhook URL cannot contain credentials' };
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, error: 'Webhook URL host is not allowed' };
  }
  const ipType = net.isIP(host);
  if ((ipType === 4 && privateIpv4(host)) || (ipType === 6 && privateIpv6(host))) {
    return { ok: false, error: 'Webhook URL cannot target a private or local IP address' };
  }
  if (parsed.port && parsed.port !== '443') return { ok: false, error: 'Webhook URL must use the standard HTTPS port' };
  parsed.hash = '';
  return { ok: true, url: parsed.toString() };
}

module.exports = { validateWebhookUrl };
