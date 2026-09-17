const app = require('./app');
const bootstrapPlatformAdmin = require('./bootstrapPlatformAdmin');
const syncFriendlyCatalog = require('./friendlyCatalogSync');

const port = process.env.PORT || 4000;

(async () => {
  try {
    await bootstrapPlatformAdmin();
    app.listen(port, () => {
      console.log(`RentSketch server listening on port ${port}`);
      // Keep startup/health checks fast. Catalog sync is non-fatal and runs
      // after the API is listening. It is idempotent and refreshes prices/photos.
      syncFriendlyCatalog().catch(err => console.error('[catalog-sync] failed:', err.message));
    });
  } catch (err) {
    console.error('[startup] Failed to initialize RentSketch:', err);
    process.exit(1);
  }
})();
