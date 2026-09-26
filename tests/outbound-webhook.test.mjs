import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../server/src/outboundWebhook.js', import.meta.url), 'utf8');
function fixture({ addresses = [{ address: '93.184.216.34', family: 4 }], status = 200, responseBody = '{"ok":true}', headers = {}, hangDns = false, hangResponse = false, responseError = null } = {}) {
  const calls = { dns: [], requests: [], destroyed: 0 };
  const dns = { promises: { lookup: async (host, options) => { calls.dns.push({ host, options }); return hangDns ? new Promise(() => {}) : addresses; } } };
  const https = { request(url, options, callback) {
    const req = new EventEmitter();
    req.destroy = () => { calls.destroyed++; };
    req.end = body => {
      calls.requests.push({ url, options, body });
      if (hangResponse) return;
      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = status;
        response.headers = headers;
        let destroyed = false;
        response.destroy = () => { destroyed = true; calls.destroyed++; };
        callback(response);
        if (destroyed) return;
        if (responseError) { response.emit('error', new Error(responseError)); return; }
        for (const chunk of Array.isArray(responseBody) ? responseBody : [responseBody]) {
          response.emit('data', Buffer.from(chunk));
          if (destroyed) return;
        }
        response.emit('end');
      });
    };
    return req;
  } };
  const module = { exports: {} };
  vm.runInNewContext(source, { require: name => name === 'dns' ? dns : name === 'https' ? https : require(name), module, Buffer, URL, setTimeout, clearTimeout }, { filename: 'outboundWebhook.js' });
  return { ...module.exports, calls };
}

test('webhook URL validation rejects private, encoded and IPv6 loopback destinations', () => {
  const { validateWebhookUrl, isPublicAddress } = fixture();
  for (const url of [
    'http://example.com/', 'https://user:pass@example.com/', 'https://example.com:444/',
    'https://localhost/', 'https://localhost./', 'https://api.internal/',
    'https://127.0.0.1/', 'https://2130706433/', 'https://0x7f000001/',
    'https://169.254.169.254/', 'https://10.0.0.1/', 'https://100.64.0.1/',
    'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://[::ffff:7f00:1]/',
    'https://[fd00::1]/', 'https://[fe80::1]/', 'https://[2002:7f00:1::]/',
    'https://[2001:db8::1]/', 'https://[64:ff9b::7f00:1]/',
  ]) assert.equal(validateWebhookUrl(url).ok, false, url);
  for (const address of ['192.0.2.1', '198.51.100.1', '203.0.113.1', '198.18.0.1', '224.0.0.1']) assert.equal(isPublicAddress(address), false, address);
  for (const url of ['https://example.com/hook?key=fixture#removed', 'https://93.184.216.34/', 'https://[2606:4700:4700::1111]/']) assert.equal(validateWebhookUrl(url).ok, true, url);
});

test('DNS resolving privately, partially privately, or without addresses never opens a socket', async () => {
  for (const addresses of [[], [{ address: '127.0.0.1', family: 4 }], [{ address: '::ffff:127.0.0.1', family: 6 }], [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]]) {
    const f = fixture({ addresses });
    await assert.rejects(f.postWebhook('https://customer.example/hook'), /public IP/);
    assert.equal(f.calls.requests.length, 0);
  }
});

test('delivery pins validated DNS, preserves TLS hostname and signature, and does not resolve again', async () => {
  const f = fixture();
  const response = await f.postWebhook('https://customer.example/hook?route=quote', { body: '{"event":"quote"}', headers: { 'X-RentSketch-Signature': 'fixture-hmac', 'Content-Type': 'application/json' } });
  assert.equal(response.ok, true);
  assert.equal((await response.json()).ok, true);
  assert.equal(f.calls.dns.length, 1);
  assert.equal(f.calls.dns[0].options.all, true);
  const request = f.calls.requests[0];
  assert.equal(request.url.hostname, 'customer.example');
  assert.equal(request.options.servername, 'customer.example');
  assert.equal(request.options.rejectUnauthorized, true);
  assert.equal(request.options.agent, false);
  assert.equal(request.options.headers['X-RentSketch-Signature'], 'fixture-hmac');
  assert.equal(request.options.headers['Content-Length'], Buffer.byteLength(request.body));
  // Simulate Node resolving the socket twice, including auto-select-family.
  for (const all of [false, true]) await new Promise((resolve, reject) => request.options.lookup('customer.example', { all }, (err, value, family) => {
    if (err) return reject(err);
    assert.equal(all ? value[0].address : value, '93.184.216.34');
    assert.equal(all ? value[0].family : family, 4);
    resolve();
  }));
  assert.equal(f.calls.dns.length, 1, 'no unvalidated second DNS query');
});

test('public IP literal delivery skips DNS without disabling certificate checks', async () => {
  const f = fixture();
  await f.postWebhook('https://[2606:4700:4700::1111]/hook');
  assert.equal(f.calls.dns.length, 0);
  assert.equal(f.calls.requests[0].options.rejectUnauthorized, true);
});

test('redirects, oversized headers/body, and interrupted responses fail closed', async () => {
  for (const options of [
    { status: 302, headers: { location: 'https://127.0.0.1/' } },
    { headers: { 'content-length': 65537 } },
    { responseBody: ['x'.repeat(40000), 'x'.repeat(40000)] },
    { responseError: 'broken connection' },
  ]) {
    const f = fixture(options);
    await assert.rejects(f.postWebhook('https://customer.example/hook'));
    assert.equal(f.calls.requests.length, 1, 'never follows redirect');
    assert.ok(f.calls.destroyed > 0);
  }
});

test('deadline covers DNS and hanging responses; request bodies are bounded', async () => {
  const dns = fixture({ hangDns: true });
  await assert.rejects(dns.postWebhook('https://customer.example', { timeoutMs: 10 }), /timed out/);
  assert.equal(dns.calls.requests.length, 0);
  const response = fixture({ hangResponse: true });
  await assert.rejects(response.postWebhook('https://customer.example', { timeoutMs: 10 }), /timed out/);
  assert.equal(response.calls.destroyed, 1);
  const body = fixture();
  await assert.rejects(body.postWebhook('https://customer.example', { body: 'x'.repeat(256 * 1024 + 1) }), /too large/);
  assert.equal(body.calls.dns.length, 0);
});

test('tenant notifications and access-email relay all use the guarded sender', () => {
  for (const file of ['routes/quoteRequests.js', 'routes/feedback.js', 'eventPassEmail.js']) {
    const code = fs.readFileSync(new URL('../server/src/' + file, import.meta.url), 'utf8');
    assert.match(code, /await postWebhook\(/, file);
    assert.doesNotMatch(code, /await fetch\((?:checked|config)\.url/, file);
  }
});
