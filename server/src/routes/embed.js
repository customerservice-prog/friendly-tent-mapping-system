const express = require('express');
const db = require('../db');

const router = express.Router();

function normalizeOrigin(value) {
  try { return new URL(value).origin.toLowerCase(); } catch (_) { return ''; }
}

function parseOrigins(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(normalizeOrigin).filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(normalizeOrigin).filter(Boolean);
  } catch (_) {}
  return String(value).split(/[\n,]/).map(normalizeOrigin).filter(Boolean);
}

// Public handshake used by embed/v1.js before it creates the designer iframe.
// The embed key is intentionally public; the security boundary is the key +
// tenant-configured allowed parent origin. This prevents a copied snippet from
// silently rendering a tenant-branded designer on an unapproved website.
router.post('/validate', async (req, res) => {
  const { tenant: slug, embedKey, parentOrigin } = req.body || {};
  if (!slug || !embedKey || !parentOrigin) {
    return res.status(400).json({ ok: false, error: 'tenant, embedKey and parentOrigin are required' });
  }

  const result = await db.query(
    `SELECT id, slug, name, embed_key, allowed_origins, subscription_status, trial_ends_at
       FROM tenants WHERE slug = $1`,
    [slug]
  );
  const tenant = result.rows[0];
  if (!tenant) return res.status(404).json({ ok: false, error: 'Tenant not found' });
  if (!tenant.embed_key || tenant.embed_key !== embedKey) {
    return res.status(403).json({ ok: false, error: 'Invalid embed key' });
  }

  const origin = normalizeOrigin(parentOrigin);
  const allowed = parseOrigins(tenant.allowed_origins);
  if (!origin || (allowed.length && !allowed.includes(origin))) {
    return res.status(403).json({ ok: false, error: 'This website is not approved for this RentSketch tenant' });
  }

  // Internal/comped and active/trialing tenants remain usable. Do not make the
  // embed loader responsible for billing decisions beyond obvious expiry.
  if (tenant.subscription_status === 'expired' || tenant.subscription_status === 'canceled') {
    return res.status(402).json({ ok: false, error: 'RentSketch subscription is not active' });
  }
  if (tenant.subscription_status === 'trialing' && tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date()) {
    return res.status(402).json({ ok: false, error: 'RentSketch trial has expired' });
  }

  res.json({ ok: true, tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name }, parentOrigin: origin });
});

module.exports = router;
