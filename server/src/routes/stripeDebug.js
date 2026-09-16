// Temporary diagnostic route to safely verify Stripe configuration
// This endpoint is INTERNAL ONLY and reveals NO SECRETS
const express = require('express');
const router = express.Router();

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// GET /api/stripe/diag/account-check
// Verify account ID matches expected and test all 6 prices
router.get('/diag/account-check', async (req, res) => {
  try {
    const stripe = stripeClient();
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    // Retrieve account info
    const account = await stripe.accounts.retrieve();
    const accountId = account.id;
    const expectedAccountId = 'acct_1UFIa32FmTqqyVfh';
    const accountMatch = accountId === expectedAccountId;

    // Define all 6 prices to test
    const priceIds = [
      { id: 'price_1UGNPv2FmTqqyVfhZlTMiH1D', plan: 'STARTER', interval: 'MONTHLY', expected: 4900 },
      { id: process.env.STRIPE_PRICE_STARTER_ANNUAL, plan: 'STARTER', interval: 'ANNUAL', expected: 49000 },
      { id: process.env.STRIPE_PRICE_PRO_MONTHLY, plan: 'PRO', interval: 'MONTHLY', expected: 9900 },
      { id: process.env.STRIPE_PRICE_PRO_ANNUAL, plan: 'PRO', interval: 'ANNUAL', expected: 99000 },
      { id: process.env.STRIPE_PRICE_COMMERCE_MONTHLY, plan: 'COMMERCE', interval: 'MONTHLY', expected: 19900 },
      { id: process.env.STRIPE_PRICE_COMMERCE_ANNUAL, plan: 'COMMERCE', interval: 'ANNUAL', expected: 199000 },
    ];

    const prices = {};
    for (const { id, plan, interval, expected } of priceIds) {
      const key = `${plan}_${interval}`;
      try {
        const price = await stripe.prices.retrieve(id);
        prices[key] = {
          id,
          exists: true,
          amount: price.unit_amount,
          livemode: price.livemode,
          currency: price.currency,
          match: price.unit_amount === expected && price.livemode === true,
        };
      } catch (err) {
        prices[key] = {
          id,
          exists: false,
          error: err.message,
          match: false,
        };
      }
    }

    res.json({
      accountId,
      expectedAccountId,
      accountMatch,
      allPricesMatch: Object.values(prices).every(p => p.match === true),
      prices,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Diagnostic failed',
      type: err.type || 'unknown',
      code: err.code || 'unknown',
      message: err.message,
    });
  }
});

module.exports = router;

