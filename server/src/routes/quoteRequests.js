const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { requireTenantAccess } = require('../middleware/requireAuth');
const { syncOrderEntitlement } = require('../orderProviders/friendlyOrderProvider');

const router = express.Router();

// Fire-and-forget signed webhook delivery. A slow or failing webhook
// endpoint must never delay or fail the customer's quote request, so this
// is never awaited by the request handler below - it just logs on failure.
async function sendWebhook(tenant, eventType, data) {
    if (!tenant.webhook_url) return;
    try {
          const payload = { id: crypto.randomUUID(), type: eventType, createdAt: new Date().toISOString(), data };
          const body = JSON.stringify(payload);
          const signature = tenant.webhook_secret
            ? crypto.createHmac('sha256', tenant.webhook_secret).update(body).digest('hex')
                  : '';
          await fetch(tenant.webhook_url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-RentSketch-Signature': signature },
                  body,
          });
    } catch (err) {
          // eslint-disable-next-line no-console
      console.error('[webhook] delivery failed for tenant', tenant.slug, err.message);
    }
}

// POST /api/tenants/:slug/quote-requests
// This is the replacement for the mailto: "Request a Quote" link in
// script.js. Creates a real, persisted, structured record instead of
// depending on the customer's own email client actually sending an email.
// No auth required to SUBMIT a request - the customer submitting it is not
// a tenant user. Auth is only required to LIST or update requests below.
router.post('/:slug/quote-requests', async (req, res) => {
    const tenantResult = await db.query('SELECT * FROM tenants WHERE slug = $1', [req.params.slug]);
    const tenant = tenantResult.rows[0];
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

              const {
                    designId, customerName, customerEmail, customerPhone,
                    eventDate, guestCount, eventType, lineItems, estimateTotal, notes,
              } = req.body || {};

              if (!customerName || !customerEmail) {
                    return res.status(400).json({ error: 'customerName and customerEmail are required' });
              }

                    // A customer could otherwise pass a designId belonging to a
      // DIFFERENT tenant (or a tenant-less direct-consumer design). If that
      // were allowed through, a later status change on this quote request
      // would call syncOrderEntitlement against someone else's design,
      // which is exactly the kind of cross-tenant leak that must never
      // happen. Reject up front instead.
      if (designId) {
        const designCheck = await db.query('SELECT tenant_id FROM designs WHERE id = $1', [designId]);
        const design = designCheck.rows[0];
        if (!design || design.tenant_id !== tenant.id) {
          return res.status(400).json({ error: 'designId does not belong to this tenant' });
        }
      }

              const result = await db.query(
                    `INSERT INTO quote_requests
                          (tenant_id, design_id, customer_name, customer_email, customer_phone, event_date, guest_count, event_type, line_items, estimate_total, notes)
                               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, created_at`,
                    [tenant.id, designId || null, customerName, customerEmail, customerPhone || null, eventDate || null,
                           guestCount || null, eventType || null, JSON.stringify(lineItems || []), estimateTotal || null, notes || null]
                  );

              sendWebhook(tenant, 'quote_request.created', {
                    id: result.rows[0].id, createdAt: result.rows[0].created_at, customerName, customerEmail, eventDate, guestCount, estimateTotal,
              });

              res.status(201).json({ id: result.rows[0].id, createdAt: result.rows[0].created_at });
});

// GET /api/tenants/:slug/quote-requests
// Staff-only: requires a valid login token AND tenant membership (see
// requireTenantAccess). This is what a "Designs" dashboard reads - the
// piece that did not exist at all before this branch.
router.get('/:slug/quote-requests', requireTenantAccess, async (req, res) => {
    const result = await db.query(
          `SELECT qr.*, d.scene FROM quote_requests qr
               LEFT JOIN designs d ON d.id = qr.design_id
                    WHERE qr.tenant_id = $1 ORDER BY qr.created_at DESC`,
          [req.tenant.id]
        );
    res.json({ quoteRequests: result.rows });
});

// PATCH /api/tenants/:slug/quote-requests/:id { status, notes }
// Staff-only: lets a rental company mark a request contacted/quoted/booked.
router.patch('/:slug/quote-requests/:id', requireTenantAccess, async (req, res) => {
    const { status, notes } = req.body || {};
    const result = await db.query(
          `UPDATE quote_requests SET status = COALESCE($1, status), notes = COALESCE($2, notes)
               WHERE id = $3 AND tenant_id = $4 RETURNING *`,
          [status || null, notes || null, req.params.id, req.tenant.id]
        );
    if (!result.rows[0]) return res.status(404).json({ error: 'Quote request not found' });
    if (status) {
      await syncOrderEntitlement(result.rows[0], req.tenant);
    }
    res.json({ quoteRequest: result.rows[0] });
});

module.exports = router;
