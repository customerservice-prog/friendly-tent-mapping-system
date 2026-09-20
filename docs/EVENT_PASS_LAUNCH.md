# Event Pass launch

Launch offer: **$9.99 once for one event and 30 days**. An optional renewal of
the same paid event is **$4.99 for 30 more days**. Neither purchase is a
subscription. Prices come from `server/src/pricing.js`; the preview and
Checkout read the same server offer. Rental equipment and its delivery/tax
are separate. Confirmed Friendly bookings include one layout through seven
days after the event, without a design fee.

Friendly and direct RentSketch customers see the exact product in a five-minute
free preview. A visible countdown shares one deadline across products and
reloads, backed by `consumer_previews` (migration `013_preview_limit.sql`).
Expiry retains the scene and offers purchase, included booking access and
saved-event recovery. Paid and included saved events keep their verified access.
The anonymous browser identifier is not proof of a person's identity: clearing
all site storage or using a different browser can create another preview.
Paid design/save/quote access still requires its server-verified entitlement.

Customers with a Friendly booking enter their first name and order number at
`/my-event/?tenant=friendly&mode=order`. The signed integration matches the name
on that exact order, allowing case, spacing and accent differences, then returns
a signed access URL to open that booking's designer immediately in the same tab.
This form does not require, check, queue or send email. The first-name/order match
is the booking-access credential; preserve the request limits and live order
eligibility checks. Unmatched, unpaid, canceled or expired bookings receive a
clear decline. Repeated matches reopen the same layout (migration `012`).

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

The customer receives an **Open my event** email and can copy the same private
access link from the paid designer. The signed credential stays in the URL
fragment and is removed from the address after restoration. It never appears in
Review → Share. Editing always checks the saved entitlement and expiration;
requesting another email does not buy or restart an access period.

`/my-event/` and **Already paid? Open my event** request recovery using the email
confirmed by Stripe or on an already claimed qualifying Friendly booking. Pending checkouts
and unknown email addresses receive the same generic response. Email delivery
uses a transactional `event_pass_emails` queue, one receipt row per payment,
bounded retries, a worker lease, and per-recipient recovery limits. A receipt is
queued in the same transaction as the access grant. Worker retries use the same
mail message ID; an SMTP acceptance followed by a lost response can still result
in a duplicate message, without granting duplicate access.

The existing signed Friendly integration relays the emails through Friendly’s
configured SMTP service. Deploy its `event_pass.access_email` / `email_check`
actions before this API. Keep `FRIENDLY_RENTSKETCH_WEBHOOK_URL` and
`FRIENDLY_RENTSKETCH_WEBHOOK_SECRET` configured. The no-send endpoint
`GET /api/consumer/event-pass/email-status` checks SMTP readiness. Checkout
stops before creating a new session when access email is unavailable. The
existing Resend mailer remains a fallback when no Friendly relay is configured.

Free access supports looking at one rental in 2D/3D. Full layout mutations,
imports, demo starters, review/export actions and automatic saves require a
verified active pass. Both Friendly and direct save APIs reject new or updated
furnished designs without access. A bare rental checkpoint remains allowed so
Checkout can restore the exact preview. Quotes require ownership and active
access. These controls do not prevent screenshots or copying public renderer
assets. Other tenants retain their existing policy.

Migration `011_event_pass_access_email.sql` snapshots each new purchase’s term.
New initial passes receive 30 days; existing checkouts without a stored term
retain the 30 days sold when they were opened. Renewal remains an optional
$4.99 for 30 additional days, with no automatic charge.

## Verification

`npm --prefix tests run test:event-pass` runs the actual frontend modules in
jsdom and the actual API routes with a temporary PGlite database and fake
Stripe. It covers exact previews, duplicate clicks, iframe checkout, cancellation,
empty-tent restoration, unpaid/forged success, ownership, rollback, duplicate
fulfillment, delayed payments, term preservation, expiry, unpaid save/quote bypasses,
recovery, email failure/retry, renewal, included booking access, and preview
countdown/expiry without reload resets. It creates no production records.

These checks do not establish GPU/mobile appearance or a completed real card
payment. Report those separately from code, API and deployment checks.

## Price decision

$9.99 is the launch price, not a claim that willingness to pay has been proven.
Consider testing $19.99 after real purchases and reviewing pass purchases,
checkout abandonment, support requests and Friendly rental bookings together.
At $19.99, roughly half as many purchases produce similar gross pass revenue;
that comparison excludes fees, refunds and any change in rental revenue.
