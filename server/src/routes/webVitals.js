const { clientIp } = require('../clientIp');
const express = require('express');
const db = require('../db');

const router = express.Router();
const buckets = new Map();
const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?rentsketch\.com$/i;

function finiteMetric(value, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= max ? number : null;
}

function parseBody(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (_) { return null; }
  }
  return req.body && typeof req.body === 'object' ? req.body : null;
}

function rateLimited(req) {
  const now = Date.now();
  const ip = clientIp(req);
  const bucket = buckets.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
  if (bucket.until < now) { bucket.count = 0; bucket.until = now + 15 * 60 * 1000; }
  bucket.count += 1;
  buckets.set(ip, bucket);
  if (buckets.size > 5000) {
    for (const [key, value] of buckets) if (value.until < now) buckets.delete(key);
  }
  return bucket.count > 240;
}

router.post('/', express.text({ type: 'text/plain', limit: '8kb' }), async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  const origin = String(req.headers.origin || '');
  if (origin && !ALLOWED_ORIGIN.test(origin)) return res.status(403).json({ error: 'Origin not allowed' });
  if (rateLimited(req)) return res.status(429).json({ error: 'Too many performance reports' });

  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Invalid performance report' });

  const pagePath = String(body.path || '').trim();
  if (!/^\/[A-Za-z0-9_~!$&'()*+,;=:@%./-]{0,255}$/.test(pagePath) || pagePath.includes('?') || pagePath.includes('#')) {
    return res.status(400).json({ error: 'Invalid page path' });
  }

  const navigationType = ['navigate', 'reload', 'back_forward', 'prerender'].includes(body.navigationType)
    ? body.navigationType : null;
  const deviceClass = ['phone', 'tablet', 'desktop'].includes(body.deviceClass)
    ? body.deviceClass : 'desktop';

  const collectorVersion = Number.isInteger(body.version) && body.version >= 1 && body.version <= 100 ? body.version : 1;
  const metrics = body.metrics && typeof body.metrics === 'object' ? body.metrics : {};
  const lcp = finiteMetric(metrics.lcp, 120000);
  const cls = finiteMetric(metrics.cls, 10);
  const inp = finiteMetric(metrics.inp, 120000);
  const fcp = finiteMetric(metrics.fcp, 120000);
  const ttfb = finiteMetric(metrics.ttfb, 120000);
  if ([lcp, cls, inp, fcp, ttfb].every(value => value === null)) {
    return res.status(400).json({ error: 'No valid Web Vitals supplied' });
  }

  try {
    await db.query(
      `INSERT INTO web_vitals(path,navigation_type,device_class,lcp_ms,cls,inp_ms,fcp_ms,ttfb_ms,collector_version)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [pagePath, navigationType, deviceClass, lcp, cls, inp, fcp, ttfb, collectorVersion]
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
