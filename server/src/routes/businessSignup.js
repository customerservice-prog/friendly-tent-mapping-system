const express = require('express');
const db = require('../db');
const { hashPassword, signToken } = require('../auth');
const { randomBytes } = require('crypto');

const router = express.Router();

// Reserved slugs that must never be claimed by a self-signup business,
// since they are used by the platform's own demo/generic tenants or by
// future platform routes.
const RESERVED_SLUGS = ['generic', 'friendly', 'admin', 'api', 'www', 'app'];
const VALID_PLANS = ['starter', 'pro', 'commerce'];
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

  if (typeof businessName !== 'string' || !businessName.trim() || businessName.trim().length > 120) {
    return res.status(400).json({ error: 'Enter a business name of 120 characters or fewer.' });
  }
  if (typeof contactEmail !== 'string' || contactEmail.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Use a password of at least 8 characters and no more than 72 UTF-8 bytes.' });
  }
  if (plan && !VALID_PLANS.includes(plan)) {
    return res.status(400).json({ error: 'Choose Starter, Pro, or Business.' });
  }

  const email = String(contactEmail).toLowerCase().trim();
  const chosenPlan = VALID_PLANS.includes(plan) ? plan : 'starter';

  let client;
  try {
    const existing = await db.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'An account with that email already exists. Please log in instead.' });
    }

    let baseSlug = slugify(businessName);
    if (RESERVED_SLUGS.includes(baseSlug)) baseSlug = baseSlug + '-co';
    const passwordHash = await hashPassword(password);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    client = await db.pool.connect();
    await client.query('BEGIN');
    const userResult = await client.query(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, email, display_name',
      [email, passwordHash, businessName.trim()]
    );
    const user = userResult.rows[0];

    let tenant;
    for (let attempt = 0; attempt < 5 && !tenant; attempt++) {
      const finalSlug = attempt ? baseSlug + '-' + randomBytes(4).toString('hex') : baseSlug;
      const tenantResult = await client.query(
        `INSERT INTO tenants (slug, name, contact_email, subscription_plan, subscription_status, trial_ends_at, customer_access)
         VALUES ($1, $2, $3, $4, 'trialing', $5, 'free') ON CONFLICT(slug) DO NOTHING
         RETURNING id, slug, name, subscription_plan, subscription_status, trial_ends_at`,
        [finalSlug, businessName.trim(), email, chosenPlan, trialEndsAt]
      );
      tenant = tenantResult.rows[0];
    }
    if (!tenant) throw new Error('Could not allocate a workspace');

    await client.query(
      'INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)',
      [tenant.id, user.id, 'owner']
    );

    const token = signToken({ userId: user.id, email: user.email, isPlatformAdmin: false });
    await client.query('COMMIT');

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
    if (client) await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'An account with that email already exists. Please log in instead.' });
    // eslint-disable-next-line no-console
    console.error('[business signup] failed', err.message);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
