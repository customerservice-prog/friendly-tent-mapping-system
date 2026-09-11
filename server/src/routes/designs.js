const express = require('express');
const db = require('../db');

const router = express.Router();

// POST /api/tenants/:slug/designs
// Saves a snapshot of a customer's layout. Anonymous by default - no login
// required. The frontend generates and keeps its own anonymousSessionId
// (e.g. in localStorage) so a customer can be pointed back at their own
// design later without ever creating an account, matching the brief's
// "anonymous first" requirement.
router.post('/:slug/designs', async (req, res) => {
  const tenantResult = await db.query('SELECT id FROM tenants WHERE slug = $1', [req.params.slug]);
  const tenant = tenantResult.rows[0];
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  const { scene, eventType, guestCount, estimateTotal, anonymousSessionId, schemaVersion } = req.body || {};
  if (!scene) return res.status(400).json({ error: 'scene is required' });

  const result = await db.query(
    `INSERT INTO designs (tenant_id, anonymous_session_id, schema_version, event_type, guest_count, scene, estimate_total)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [tenant.id, anonymousSessionId || null, schemaVersion || 1, eventType || null, guestCount || null, scene, estimateTotal || null]
  );
  res.status(201).json({ id: result.rows[0].id });
});

module.exports = router;
