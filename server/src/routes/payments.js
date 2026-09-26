const express = require('express');
const router = express.Router();

// Legacy rental-deposit checkout used an anonymous customer's estimate as the
// charge authority and automatically booked the quote after payment. No current
// customer UI calls this endpoint. Keep it closed until an approved quote amount
// and customer authorization are implemented; Event Pass and business billing
// have separate, server-priced checkout flows and are unaffected.
router.post('/:slug/quote-requests/:id/checkout-session', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(410).json({
    code: 'rental_deposit_checkout_unavailable',
    error: 'Online rental deposits are not available from a layout estimate. Contact your rental company for a confirmed quote and its payment link.',
  });
});

module.exports = router;
