// Thin Postgres connection wrapper. No ORM on purpose - this is a small
// enough schema that plain SQL is easier to read and audit than an
// abstraction layer, and it is easy to swap later if the project grows.
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn('[db] DATABASE_URL is not set. The server will start but every database query will fail until it is configured.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Most managed Postgres providers (Render, Railway, Supabase, Neon)
  // require SSL but use a certificate chain the default Node trust store
  // does not recognize. Only relax verification for non-local databases.
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
