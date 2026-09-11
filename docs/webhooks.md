# Webhooks

Webhooks let a rental company's own backend react to events in real time, instead of only relying on the business dashboard or the notification email. This is optional per tenant - if webhookUrl is not set, nothing is sent.

## Setup

Set webhookUrl (the endpoint that should receive events) and webhookSecret (used to sign payloads) via PATCH /api/tenants/:slug from the business dashboard's Branding page or the API directly. Both fields are staff-only to read or write.

## Events

quote_request.created fires after a customer's quote request is successfully persisted to the database. This is the only event implemented today. design.created is planned but not implemented yet - do not build against it until docs/api.md lists it as live.

## Payload shape

```
POST to your webhookUrl
Content-Type: application/json
X-RentSketch-Signature: hex-encoded HMAC-SHA256 of the raw body

{ "id": "uuid", "type": "quote_request.created", "createdAt": "2026-09-11T12:00:00.000Z", "data": { "id": "...", "customerName": "...", "customerEmail": "...", "eventDate": "...", "guestCount": 10, "estimateTotal": 450.00 } }
```

## Verifying the signature

Compute an HMAC-SHA256 of the exact raw request body using your webhookSecret as the key, hex-encode it, and compare (constant-time) to the X-RentSketch-Signature header. If they do not match, reject the request.

## Delivery guarantees

Delivery is best-effort and fire-and-forget: a slow or failing webhook endpoint never delays or fails the customer's quote request. There is currently no retry queue or delivery log - a failed delivery is only logged server-side. Treat this as at-most-once, no guaranteed delivery, until a retry system is documented here as live. Build your integration to tolerate an occasional missed event, for example by periodically polling GET /api/tenants/:slug/quote-requests as a backstop.
