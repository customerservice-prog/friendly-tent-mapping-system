const app = require('./app');
const bootstrapPlatformAdmin = require('./bootstrapPlatformAdmin');

const port = process.env.PORT || 4000;

(async () => {
  try {
    await bootstrapPlatformAdmin();
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`RentSketch server listening on port ${port}`);
    });
  } catch (err) {
    console.error('[startup] Failed to initialize RentSketch:', err);
    process.exit(1);
  }
})();
