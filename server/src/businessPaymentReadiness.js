const { BUSINESS_PLANS } = require('./pricing');
let cache;
function matchesPrice(price, plan, interval, production) {
  return !!price && price.active === true && price.currency === 'usd' &&
    (!production || price.livemode === true) && price.type === 'recurring' &&
    price.recurring?.interval === (interval === 'annual' ? 'year' : 'month') &&
    price.recurring?.interval_count === 1 &&
    price.unit_amount === plan[interval === 'annual' ? 'annualCents' : 'monthlyCents'];
}
async function businessPaymentReadiness(stripe) {
  if (cache && cache.until > Date.now()) return cache.value;
  const production = process.env.NODE_ENV === 'production';
  const live = /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY || '');
  const value = { available:false, paymentMode:live?'live':'test', plans:{} };
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET || (production && !live)) return value;
  try {
    const account = await stripe.accounts.retrieve();
    const correctAccount = !process.env.EVENT_PASS_STRIPE_ACCOUNT_ID || account.id === process.env.EVENT_PASS_STRIPE_ACCOUNT_ID;
    if (!account.charges_enabled || !correctAccount) return value;
    for (const plan of Object.values(BUSINESS_PLANS).filter(p => p.monthlyCents)) {
      value.plans[plan.id] = {};
      for (const interval of ['monthly','annual']) {
        const id = process.env[`STRIPE_PRICE_${plan.id.toUpperCase()}_${interval.toUpperCase()}`];
        let price;
        try { price = id ? await stripe.prices.retrieve(id) : null; } catch (_) { price = null; }
        value.plans[plan.id][interval] = matchesPrice(price, plan, interval, production);
      }
    }
    value.available = Object.values(value.plans).every(plan => plan.monthly && plan.annual);
  } catch (_) { value.available = false; }
  cache = { until:Date.now()+(value.available?60000:5000), value };
  return value;
}
module.exports = { businessPaymentReadiness, matchesPrice };
