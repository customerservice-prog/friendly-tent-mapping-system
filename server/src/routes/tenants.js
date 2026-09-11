const express = require('express');
const db = require('../db');
const { requireTenantAccess } = require('../middleware/requireAuth');

const router = express.Router();

function publicShape(t) {
    return {
          id: t.id,
          slug: t.slug,
          name: t.name,
          logoUrl: t.logo_url,
          contactEmail: t.contact_email,
          phone: t.phone,
          website: t.website,
          tagline: t.tagline,
          primaryColor: t.primary_color,
          secondaryColor: t.secondary_color,
          showPrices: t.show_prices,
          poweredByEnabled: t.powered_by_enabled,
    };
}

// GET /api/tenants/:slug
// Public tenant lookup used by the designer frontend to load branding and
// contact info before it renders. Intentionally returns ONLY public-safe
// fields - never internal notes, membership info, or billing details.
router.get('/:slug', async (req, res) => {
    const result = await db.query('SELECT * FROM tenants WHERE slug = $1', [req.params.slug]);
    const tenant = result.rows[0];
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json(publicShape(tenant));
});

// GET /api/tenants/:slug/admin
// Staff-only: full tenant record including embed/webhook config, used by
// the business dashboard's Branding and Install pages.
router.get('/:slug/admin', requireTenantAccess, async (req, res) => {
    const t = req.tenant;
    res.json(Object.assign(publicShape(t), {
          embedKey: t.embed_key,
          allowedOrigins: t.allowed_origins,
          webhookUrl: t.webhook_url,
          hasWebhookSecret: Boolean(t.webhook_secret),
          subscriptionPlan: t.subscription_plan,
          subscriptionStatus: t.subscription_status,
    }));
});

// PATCH /api/tenants/:slug
// Staff-only: update branding/settings. This is what the dashboard's
// Branding and Install pages write to - a company never needs GitHub
// access or a deploy to change their logo, colors, or allowed domains.
router.patch('/:slug', requireTenantAccess, async (req, res) => {
    const body = req.body || {};
    const map = {
          name: 'name', logoUrl: 'logo_url', contactEmail: 'contact_email', phone: 'phone',
          website: 'website', tagline: 'tagline', primaryColor: 'primary_color',
          secondaryColor: 'secondary_color', showPrices: 'show_prices',
          poweredByEnabled: 'powered_by_enabled', allowedOrigins: 'allowed_origins',
          webhookUrl: 'webhook_url', webhookSecret: 'webhook_secret',
    };
    const sets = [];
    const values = [];
    let i = 1;
    for (const [key, value] of Object.entries(body)) {
          const column = map[key];
          if (!column) continue;
          sets.push(`${column} = $${i}`);
          values.push(column === 'allowed_origins' ? JSON.stringify(value) : value);
          i++;
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    sets.push('updated_at = now()');

               values.push(req.tenant.id);
    const result = await db.query(
          `UPDATE tenants SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
          values
        );
    res.json({ tenant: publicShape(result.rows[0]) });
});

module.exports = router;
