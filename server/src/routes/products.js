const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/tenants/:slug/products
// Public catalog for the designer frontend, scoped to this tenant only -
// this is what replaces the hardcoded TENTS/TABLES/CHAIRS arrays in
// js/data/*.js once the frontend is switched over (see ROADMAP.md).
router.get('/:slug/products', async (req, res) => {
  const tenantResult = await db.query('SELECT id FROM tenants WHERE slug = $1', [req.params.slug]);
  const tenant = tenantResult.rows[0];
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  const products = await db.query(
    'SELECT * FROM products WHERE tenant_id = $1 AND active = true ORDER BY category, sort_order',
    [tenant.id]
  );
  res.json({ products: products.rows });
});

module.exports = router;
