import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../server/src/clientIp.js', import.meta.url), 'utf8');
function helper(env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(source, { module, require, URL, process: { env } });
  return module.exports;
}
const railway = { RAILWAY_ENVIRONMENT_ID: 'isolated-environment', RAILWAY_SERVICE_ID: 'isolated-service' };
const request = (headers = {}, remoteAddress = '198.51.100.10') => ({ headers, socket: { remoteAddress } });

test('direct requests ignore arbitrary XFF and X-Real-IP headers', () => {
  const { clientIp } = helper();
  for (const spoof of ['1.2.3.4', '8.8.8.8, 1.2.3.4', 'anything', ['1.2.3.4']]) {
    assert.equal(clientIp(request({ 'x-forwarded-for': spoof, 'x-real-ip': spoof })), '198.51.100.10');
  }
});

test('Railway runtime accepts only a single valid edge IP and never a forwarded chain', () => {
  const { clientIp } = helper(railway);
  assert.equal(clientIp(request({ 'x-real-ip': '203.0.113.8', 'x-forwarded-for': 'attacker, 1.2.3.4' })), '203.0.113.8');
  for (const spoof of ['1.2.3.4, 8.8.8.8', '127.0.0.1:80', 'bogus', ['1.2.3.4'], '', 'fe80::1%eth0']) {
    assert.equal(clientIp(request({ 'x-real-ip': spoof, 'x-forwarded-for': '8.8.8.8' })), '198.51.100.10');
  }
  assert.equal(helper({ RAILWAY_ENVIRONMENT_ID: 'only-one-marker' }).clientIp(request({ 'x-real-ip': '203.0.113.8' })), '198.51.100.10');
});

test('equivalent IPv6 and mapped IPv4 addresses share rate-limit buckets', () => {
  const { clientIp } = helper(railway);
  assert.equal(clientIp(request({ 'x-real-ip': '2001:DB8:0:0:0:0:0:1' })), '2001:db8::1');
  assert.equal(clientIp(request({}, '::ffff:198.51.100.10')), '198.51.100.10');
  assert.equal(clientIp(request({ 'x-real-ip': '::ffff:c633:640a' })), '198.51.100.10');
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4' } }), 'unknown');
});

function loginRoute() {
  const routes = new Map();
  const router = { post: (path, handler) => routes.set(path, handler), get() {}, use() {} };
  const dependencies = {
    express: { Router: () => router }, crypto: require('node:crypto'),
    '../clientIp': helper(), '../db': { query: async () => ({ rows: [] }) },
    '../auth': {}, '../dashboardSessions': {},
  };
  vm.runInNewContext(fs.readFileSync(new URL('../server/src/routes/auth.js', import.meta.url), 'utf8'), {
    module: { exports: {} }, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; },
    process: { env: {} }, console,
  });
  return async (email, remoteAddress, spoof) => {
    let status = 200;
    const req = { ...request({ 'x-forwarded-for': spoof }, remoteAddress), body: { email, password: 'fixture-guess' } };
    await routes.get('/login')(req, { status(value) { status = value; return this; }, json() {} });
    return status;
  };
}

test('rotating forged XFF cannot evade the real auth route IP throttle', async () => {
  const login = loginRoute();
  for (let i = 0; i < 30; i++) assert.equal(await login('guess' + i + '@example.invalid', '198.51.100.8', '203.0.113.' + i), 401);
  assert.equal(await login('guess31@example.invalid', '198.51.100.8', '8.8.8.8'), 429);
});

test('per-account login throttle still blocks attempts spread across client IPs', async () => {
  const login = loginRoute();
  for (let i = 0; i < 12; i++) assert.equal(await login('same@example.invalid', '198.51.100.' + (i + 1), ''), 401);
  assert.equal(await login('same@example.invalid', '203.0.113.9', ''), 429);
});
