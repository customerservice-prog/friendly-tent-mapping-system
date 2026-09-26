const net = require('net');
const dns = require('dns').promises;
const https = require('https');

// Reject non-public destinations before opening a socket. IPv6 URL hostnames
// include brackets; normalize them before asking net.isIP about the address.
function normalizedHost(value) {
  return String(value || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}
const nonPublicV4 = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
  ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3],
]) nonPublicV4.addSubnet(address, prefix, 'ipv4');
const globalV6 = new net.BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const nonPublicV6 = new net.BlockList();
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
]) nonPublicV6.addSubnet(address, prefix, 'ipv6');

function isPublicAddress(value) {
  const address = normalizedHost(value);
  const family = net.isIP(address);
  if (family === 4) return !nonPublicV4.check(address, 'ipv4');
  // This also rejects mapped IPv4, local, link-local, multicast, and
  // translation/tunnelling ranges instead of letting them bypass IPv4 rules.
  return family === 6 && globalV6.check(address, 'ipv6') && !nonPublicV6.check(address, 'ipv6');
}

function validateWebhookUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return { ok: true, url: null };
  if (raw.length > 2048) return { ok: false, error: 'Webhook URL is too long' };
  let parsed;
  try { parsed = new URL(raw); } catch (_) { return { ok: false, error: 'Webhook URL must be a valid URL' }; }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'Webhook URL must use HTTPS' };
  if (parsed.username || parsed.password) return { ok: false, error: 'Webhook URL cannot contain credentials' };
  const host = normalizedHost(parsed.hostname);
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, error: 'Webhook URL host is not allowed' };
  }
  if (net.isIP(host) && !isPublicAddress(host)) {
    return { ok: false, error: 'Webhook URL cannot target a private or local IP address' };
  }
  if (parsed.port && parsed.port !== '443') return { ok: false, error: 'Webhook URL must use the standard HTTPS port' };
  parsed.hash = '';
  return { ok: true, url: parsed.toString() };
}

// All webhook delivery uses this transport, not fetch after a DNS check.
// Validate every DNS answer and pin the connection to one of those addresses
// through lookup(), while retaining the original hostname for TLS and Host.
// No second DNS resolution, redirects, reused sockets, or unlimited responses.
function postWebhook(value, { headers = {}, body = '', timeoutMs = 10000 } = {}) {
  const checked = validateWebhookUrl(value);
  if (!checked.ok || !checked.url) return Promise.reject(new Error(checked.error || 'Webhook URL is required'));
  if (typeof body !== 'string' || Buffer.byteLength(body) > 256 * 1024) return Promise.reject(new Error('Webhook body is too large'));
  const url = new URL(checked.url);
  const host = normalizedHost(url.hostname);
  return new Promise((resolve, reject) => {
    let request, response, settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        if (response) response.destroy();
        if (request) request.destroy();
        reject(error);
      } else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('Webhook delivery timed out')), Math.max(1, Math.min(22000, Number(timeoutMs) || 10000)));
    (async () => {
      const family = net.isIP(host);
      const addresses = family ? [{ address: host, family }] : await dns.lookup(host, { all: true, verbatim: true });
      if (settled) return;
      if (!addresses.length || addresses.some(record => !isPublicAddress(record.address))) throw new Error('Webhook DNS must resolve only to public IP addresses');
      const selected = addresses[0];
      request = https.request(url, {
        method: 'POST', agent: false, rejectUnauthorized: true,
        servername: family ? undefined : host,
        maxHeaderSize: 16 * 1024,
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
        lookup(_hostname, options, callback) {
          if (typeof options === 'function') { callback = options; options = {}; }
          if (options && options.all) callback(null, [selected]);
          else callback(null, selected.address, selected.family);
        },
      }, incoming => {
        response = incoming;
        if (settled) { incoming.destroy(); return; }
        const status = incoming.statusCode || 0;
        if (status >= 300 && status < 400) return finish(new Error('Webhook redirects are not allowed'));
        if (Number(incoming.headers['content-length'] || 0) > 64 * 1024) return finish(new Error('Webhook response is too large'));
        let bytes = 0;
        const chunks = [];
        incoming.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > 64 * 1024) return finish(new Error('Webhook response is too large'));
          chunks.push(chunk);
        });
        incoming.on('error', error => finish(error));
        incoming.on('aborted', () => finish(new Error('Webhook response was interrupted')));
        incoming.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          finish(null, { status, ok: status >= 200 && status < 300, text: async () => text, json: async () => JSON.parse(text) });
        });
      });
      request.on('error', error => finish(error));
      request.end(body);
    })().catch(error => finish(error));
  });
}

module.exports = { validateWebhookUrl, isPublicAddress, postWebhook };
