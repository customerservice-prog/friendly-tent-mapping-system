const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/tenants/:slug
// Public tenant lookup used by the designer frontend to load branding and
// contact info before it renders. Intentionally returns ONLY public-safe
// fields - never internal notes, membership info, or billing details.
router.get('/:slug', async (req, res) => {
  const result = await db.query('SELECT * FROM tenants WHERE slug = $1', [req.params.slug]);
  const tenant = result.rows[0];
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  res.json({
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    logoUrl: tenant.logo_url,
    contactEmail: tenant.contact_email,
    phone: tenant.phone,
    website: tenant.website,
    tagline: tenant.tagline,
    primaryColor: tenant.primary_color,
    secondaryColor: tenant.secondary_color,
    showPrices: tenant.show_prices,
  });
});

module.exports = router;
