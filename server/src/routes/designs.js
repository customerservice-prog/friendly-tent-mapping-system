const express = require('express');
const db = require('../db');
const { clientIp } = require('../clientIp');
const { requireTenantAccess } = require('../middleware/requireAuth');
const projects = require('../designProjects');
const router = express.Router();
const buckets = new Map();
function limit(req, res, next) {
  const key = req.params.slug + ':' + clientIp(req), now = Date.now();
  for (const [id, value] of buckets) if (now - value.start > 3600000) buckets.delete(id);
  const value = buckets.get(key) || { start: now, count: 0 };
  value.count++; buckets.set(key, value);
  if (value.count > 120) return res.status(429).json({ error: 'Too many design saves. Please wait a moment and try again.' });
  next();
}
router.post('/:slug/designs', limit, projects.handler(req => projects.create(req, false), 201));
router.patch('/:slug/designs/:id', limit, projects.handler(req => projects.update(req, false)));
router.post('/:slug/shared-design/restore', projects.handler(projects.restoreShared));
projects.register(router, '/:slug/designs');
router.get('/:slug/designs', requireTenantAccess, async (req, res, next) => {
  try {
    const result = await db.query(`SELECT id,event_type,guest_count,estimate_total,created_at,project_name,revision,updated_at
      FROM designs WHERE tenant_id=$1 ORDER BY updated_at DESC LIMIT 50`, [req.tenant.id]);
    res.json({ designs: result.rows });
  } catch (error) { next(error); }
});
module.exports = router;
