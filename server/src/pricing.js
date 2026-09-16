// Single source of truth for RentSketch pricing. All amounts are USD cents.
const BUSINESS_PLANS = Object.freeze({
  starter: { id: 'starter', name: 'Starter', monthlyCents: 4900, annualCents: 49000 },
  pro: { id: 'pro', name: 'Pro', monthlyCents: 9900, annualCents: 99000 },
  commerce: { id: 'commerce', name: 'Business', monthlyCents: 19900, annualCents: 199000 },
  enterprise: { id: 'enterprise', name: 'Enterprise', monthlyCents: null, annualCents: null },
});

module.exports = {
  EVENT_PASS_CENTS: 999,
  EVENT_PASS_DURATION_DAYS: 30,
  EVENT_PASS_RENEWAL_CENTS: 499,
  EVENT_PASS_RENEWAL_DURATION_DAYS: 30,
  BUSINESS_TRIAL_DAYS: 14,
  BUSINESS_PLANS,
  PLATFORM_FEE_PERCENT: 0,
};
