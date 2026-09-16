#!/usr/bin/env node
/**
 * Pre-deploy migration runner.
 * Executes all .sql files in migrations/ directory in alphabetical order.
 * Used as the pre-deploy hook to ensure the database schema is up-to-date.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const migrationsDir = path.join(__dirname, 'migrations');

  try {
    // Read all migration files, sorted alphabetically to ensure order.
    const files = fs
      .readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration(s) to apply.`);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        console.log(`Applying ${file}...`);
        await pool.query(sql);
        console.log(`✓ ${file} applied successfully.`);
      } catch (err) {
        console.error(`✗ Failed to apply ${file}:`);
        console.error(err.message);
        process.exit(1);
      }
    }

    console.log('All migrations applied successfully.');
    await pool.end();
  } catch (err) {
    console.error('Migration runner error:', err.message);
    process.exit(1);
  }
})();

