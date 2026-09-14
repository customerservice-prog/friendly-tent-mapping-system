// Express app wiring: middleware + route mounting.
// Split from index.js so the server can be started (src/index.js) or
// imported in tests without binding a port.
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const tenantsRoutes = require('./routes/tenants');
const productsRoutes = require('./routes/products');
const designsRoutes = require('./routes/designs');
const quoteRequestsRoutes = require('./routes/quoteRequests');
const visualLibraryRoutes = require('./routes/visualLibrary');
const paymentsRoutes = require('./routes/payments');
const stripeWebhookRoutes = require('./routes/stripeWebhook');
const consumerEventPassRoutes = require('./routes/consumerEventPass');
const businessSignupRoutes = require('./routes/businessSignup');

const app = express();

// Restrict cross-origin requests to known frontend origins. Falls back to
// allowing all origins only if ALLOWED_ORIGINS was never configured, so
// local development still works without extra setup.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));

// Stripe webhook needs the exact raw request body for signature
// verification, so it is mounted BEFORE express.json() below, with its
// own raw body parser scoped to just this one path.
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookRoutes);

app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantsRoutes);
app.use('/api/tenants', productsRoutes);
app.use('/api/tenants', designsRoutes);
app.use('/api/tenants', quoteRequestsRoutes);
app.use('/api/tenants', paymentsRoutes);
app.use('/api/business', businessSignupRoutes);
app.use('/api/visual-library', visualLibraryRoutes);
app.use('/api/consumer', consumerEventPassRoutes);

// Basic fallback error handler so an unexpected error returns JSON instead
// of leaking a stack trace to the client.
app.use((err, req, res, next) => {
    // eslint-disable-next-line no-console
          console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
