// Temporary diagnostic route to safely verify Stripe account configuration
// This endpoint is INTERNAL ONLY and reveals NO SECRETS
const express = require('express');
const router = express.Router();

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// GET /api/stripe/diag/account-check
// INTERNAL DIAGNOSTIC ONLY - safe to log, no secrets exposed
// Returns: { accountId, livemode, priceExists, priceAmount }
router.get('/diag/account-check', async (req, res) => {
  try {
    const stripe = stripeClient();
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    // Retrieve account info - safe call that reveals no secrets
    const account = await stripe.accounts.retrieve();
    const accountId = account.id;
    const livemode = account.settings ? true : false; // accounts.retrieve returns account object, not livemode bool
    
    // Try to retrieve the known LIVE price
    const priceId = 'price_1UGNPv2FmTqqyVfhZlTMiH1D';
    let priceExists = false;
    let priceAmount = null;
    let priceError = null;
    
    try {
      const price = await stripe.prices.retrieve(priceId);
      priceExists = true;
      priceAmount = price.unit_amount;
    } catch (priceErr) {
      priceError = priceErr.message;
    }

    res.json({
      accountId,
      expectedAccountId: 'acct_1UFIa32FmTqqyVfh',
      accountMatch: accountId === 'acct_1UFIa32FmTqqyVfh',
      priceId,
      priceExists,
      priceAmount,
      priceError: priceError || null,
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

