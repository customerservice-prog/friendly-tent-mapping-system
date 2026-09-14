const express = require('express');
const db = require('../db');
const { hashPassword, signToken } = require('../auth');

const router = express.Router();

// Reserved slugs that must never be claimed by a self-signup business,
// since they are used by the platform's own demo/generic tenants or by
// future platform routes.
const RESERVED_SLUGS = ['generic', 'friendly', 'admin', 'api', 'www', 'app'];
const VALID_PLANS = ['starter', 'pro', 'commerce', 'enterprise'];
const TRIAL_DAYS = 14;

function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'business';
}

// POST /api/business/signup { businessName, contactEmail, password, plan }
// Public, unauthenticated self-onboarding. No payment step required to
// start: creates a brand-new tenant on a 14-day trial, its first user
// (role 'owner'), and returns a JWT so the new owner lands straight in the
// dashboard already logged in - same token shape as POST /api/auth/login,
// so the existing dashboard code needs no special-casing for new tenants.
router.post('/signup', async (req, res) => {
  const { businessName, contactEmail, password, plan } = req.body || {};

  if (!businessName || !contactEmail || !password) {
    return res.status(400).json({ error: 'businessName, contactEmail, and password are required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const email = String(contactEmail).toLowerCase().trim();
  const chosenPlan = VALID_PLANS.includes(plan) ? plan : 'starter';

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'An account with that email already exists. Please log in instead.' });
    }

    let baseSlug = slugify(businessName);
    if (RESERVED_SLUGS.includes(baseSlug)) baseSlug = baseSlug + '-co';
    let finalSlug = baseSlug;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const clash = await db.query('SELECT id FROM tenants WHERE slug = $1', [finalSlug]);
      if (!clash.rows[0]) break;
      suffix += 1;
      finalSlug = baseSlug + '-' + suffix;
    }

    const passwordHash = await hashPassword(password);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const userResult = await db.query(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, email, display_name',
      [email, passwordHash, businessName]
    );
    const user = userResult.rows[0];

    const tenantResult = await db.query(
      `INSERT INTO tenants (slug, name, contact_email, subscription_plan, subscription_status, trial_ends_at)
       VALUES ($1, $2, $3, $4, 'trialing', $5)
       RETURNING id, slug, name, subscription_plan, subscription_status, trial_ends_at`,
      [finalSlug, businessName, email, chosenPlan, trialEndsAt]
    );
    const tenant = tenantResult.rows[0];

    await db.query(
      'INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)',
      [tenant.id, user.id, 'owner']
    );

    const token = signToken({ userId: user.id, email: user.email, isPlatformAdmin: false });

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, displayName: user.display_name },
      tenant: {
        slug: tenant.slug,
        name: tenant.name,
        subscriptionPlan: tenant.subscription_plan,
        subscriptionStatus: tenant.subscription_status,
        trialEndsAt: tenant.trial_ends_at,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[business signup] failed', err.message);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
});

module.exports = router;
