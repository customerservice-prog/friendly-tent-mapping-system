# Event Pass launch

Launch offer: **$9.99 once for one event and 30 days**. An optional renewal of
the same paid event is **$4.99 for 30 more days**. Neither purchase is a
subscription. Prices come from `server/src/pricing.js`; the preview and
Checkout read the same server offer. Rental equipment and its delivery/tax
are separate. No rental credit or included-order benefit is advertised.

Friendly and direct RentSketch customers see the exact product for free.
Choosing **Design My Event** shows the price and included features. Before
Checkout opens, the current scene is saved using the existing autosave ID.
Hosted Checkout opens outside the Friendly iframe. Both payment and cancel
returns restore the saved scene; an empty tent is a valid saved scene.

## Deployment controls

- `EVENT_PASS_ENABLED=true` enables the offer for `friendly` and `generic`.
  Other tenants retain their existing customer experience.
- `EVENT_PASS_STRIPE_ACCOUNT_ID` must be the intended RentSketch Stripe
  account. Readiness checks its ability to take charges and the existing
  payment/access tables. Production refuses test-mode keys.
- Keep the existing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and
  `JWT_SECRET` in Railway variables. Do not put secret values in git.
- The existing webhook must receive `checkout.session.completed` and
  `checkout.session.async_payment_succeeded`. Preserve subscription events.
- To turn off new pass requirements, set `EVENT_PASS_ENABLED=false`.
  Existing paid designs and payment fulfillment remain recoverable.

The landing page verifies the Checkout Session with Stripe; a success URL
alone grants nothing. Webhook and landing-page fulfillment lock the existing
payment ledger row in a transaction, validate amount/currency/design, and
create one entitlement. Failures roll back and remain retryable.

The customer can copy a **private edit link** for another device. The opaque
Checkout reference is kept in its fragment, stripped from the current address
after restoration, and never included in Review → Share. Legacy emailed
recovery tokens still work. No email-delivery promise depends on a missing
mail provider.

## Verification

`npm --prefix tests run test:event-pass` runs the actual frontend modules in
jsdom and the actual API routes with a temporary PGlite database and fake
Stripe. It covers exact previews, duplicate clicks, iframe checkout, cancellation,
empty-tent restoration, unpaid/forged success, ownership, rollback, duplicate
fulfillment, delayed payments and renewal. It creates no production records.

These checks do not establish GPU/mobile appearance or a completed real card
payment. Report those separately from code, API and deployment checks.

## Price decision

$9.99 is the launch price, not a claim that willingness to pay has been proven.
Consider testing $19.99 after real purchases and reviewing pass purchases,
checkout abandonment, support requests and Friendly rental bookings together.
At $19.99, roughly half as many purchases produce similar gross pass revenue;
that comparison excludes fees, refunds and any change in rental revenue.
