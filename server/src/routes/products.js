const express = require('express');
const db = require('../db');
const { requireTenantAccess } = require('../middleware/requireAuth');

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

// POST /api/tenants/:slug/products
// Staff-only: create a product in this tenant's catalog. Company owners
// use this instead of asking us to edit a JS file / GitHub.
router.post('/:slug/products', requireTenantAccess, async (req, res) => {
    const {
          category, name, sku, pricePerDay, priceType, widthFt, lengthFt,
          capacity, photoUrl, externalId, sortOrder,
    } = req.body || {};
    if (!category || !name) return res.status(400).json({ error: 'category and name are required' });

              const result = await db.query(
                    `INSERT INTO products
                          (tenant_id, category, external_id, name, sku, price_per_day, price_type, width_ft, length_ft, capacity, photo_url, sort_order)
                               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
                    [req.tenant.id, category, externalId || null, name, sku || null, pricePerDay || null,
                           priceType || 'per_day', widthFt || null, lengthFt || null, capacity || null, photoUrl || null, sortOrder || 0]
                  );
    res.status(201).json({ product: result.rows[0] });
});

// PATCH /api/tenants/:slug/products/:id
// Staff-only: edit any subset of fields on one product. Column names are
// restricted to an explicit allow-list before being interpolated into SQL,
// so this cannot be used to write to an arbitrary column.
router.patch('/:slug/products/:id', requireTenantAccess, async (req, res) => {
    const fields = req.body || {};
    const allowed = [
          'category', 'name', 'sku', 'price_per_day', 'price_type', 'width_ft',
          'length_ft', 'capacity', 'photo_url', 'external_id', 'sort_order', 'active',
        ];
    const map = {
          pricePerDay: 'price_per_day', priceType: 'price_type', widthFt: 'width_ft',
          lengthFt: 'length_ft', photoUrl: 'photo_url', externalId: 'external_id', sortOrder: 'sort_order',
    };
    const sets = [];
    const values = [];
    let i = 1;
    for (const [key, value] of Object.entries(fields)) {
          const column = map[key] || key;
          if (!allowed.includes(column)) continue;
          sets.push(`${column} = $${i}`);
          values.push(value);
          i++;
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    sets.push('updated_at = now()');

               values.push(req.params.id, req.tenant.id);
    const result = await db.query(
          `UPDATE products SET ${sets.join(', ')} WHERE id = $${i} AND tenant_id = $${i + 1} RETURNING *`,
          values
        );
    if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: result.rows[0] });
});

// DELETE /api/tenants/:slug/products/:id
// Staff-only: soft-delete (sets active = false). A past design or quote
// request may still reference this product, so it is never hard-deleted.
router.delete('/:slug/products/:id', requireTenantAccess, async (req, res) => {
    const result = await db.query(
          'UPDATE products SET active = false, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING id',
          [req.params.id, req.tenant.id]
        );
    if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json({ ok: true });
});

module.exports = router;
