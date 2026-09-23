const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '..');
const pg = new PGlite();
let server;
const db = { query: (sql, args) => pg.query(sql, args) };

function loadRoute() {
  const file = path.join(root, 'server/src/routes/webVitals.js');
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module: mod,
    exports: mod.exports,
    require: id => {
      if (id === 'express') return express;
      if (id === '../db') return db;
      throw new Error('Unexpected dependency ' + id);
    },
    console,
    Number,
    String,
    Date,
    Map,
    JSON,
    RegExp,
    Object,
    Promise,
    setTimeout,
    clearTimeout,
  }, { filename: file });
  return mod.exports;
}

(async () => {
  await pg.exec(fs.readFileSync(path.join(root, 'server/migrations/014_web_vitals.sql'), 'utf8'));

  const app = express();
  app.use('/api/analytics/web-vitals', loadRoute());
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;

  async function post(body, origin = 'https://rentsketch.com') {
    const response = await fetch(base + '/api/analytics/web-vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8', Origin: origin },
      body: JSON.stringify(body),
    });
    let parsed = null;
    const text = await response.text();
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
    return { status: response.status, body: parsed };
  }

  const valid = {
    version: 2,
    path: '/party-rental-software/',
    navigationType: 'navigate',
    deviceClass: 'phone',
    metrics: { lcp: 1840.4, cls: 0.0213, inp: 112, fcp: 830.2, ttfb: 92.5 },
    email: 'must-not-be-stored@example.invalid',
    designId: 'must-not-be-stored',
  };
  assert.equal((await post(valid)).status, 204);

  const row = (await pg.query('SELECT * FROM web_vitals')).rows[0];
  assert.equal(row.path, '/party-rental-software/');
  assert.equal(row.collector_version, 2);
  assert.equal(row.navigation_type, 'navigate');
  assert.equal(row.device_class, 'phone');
  assert.equal(Number(row.lcp_ms), 1840.4);
  assert.equal(Number(row.cls), 0.0213);
  assert.equal(Number(row.inp_ms), 112);
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'email'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'design_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'ip'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'session_id'), false);

  assert.equal((await post({ ...valid, path: '/designer/?recoveryToken=private' })).status, 400);
  assert.equal((await post({ ...valid, path: '/event-pass/#private' })).status, 400);
  assert.equal((await post({ ...valid, metrics: {} })).status, 400);
  assert.equal((await post(valid, 'https://evil.example')).status, 403);

  assert.equal((await post({
    path: '/',
    navigationType: 'something-else',
    deviceClass: 'watch',
    metrics: { lcp: 999999999, cls: 99, inp: -1, fcp: 900, ttfb: 100 }
  })).status, 204);
  const fallback = (await pg.query('SELECT * FROM web_vitals ORDER BY id DESC LIMIT 1')).rows[0];
  assert.equal(fallback.navigation_type, null);
  assert.equal(fallback.device_class, 'desktop');
  assert.equal(fallback.lcp_ms, null);
  assert.equal(fallback.cls, null);
  assert.equal(fallback.inp_ms, null);
  assert.equal(Number(fallback.fcp_ms), 900);

  console.log('PASS Web Vitals API: sanitized one-row telemetry, strict origins/paths, bounded metrics, no PII fields.');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  if (server) {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  await pg.close();
});
