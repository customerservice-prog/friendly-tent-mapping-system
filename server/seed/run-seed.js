// Seeds Friendly Party Rental as a REAL tenant record, using the exact
// same tents/tables/chairs data currently hardcoded in js/data/tenant.js,
// js/data/tables.js, and js/data/chairs.js. This is the migration referenced
// in the brief: "Friendly should exist in the same tenant data structure"
// instead of only living inside a JS file in the frontend bundle.
//
// Run with: npm run seed:friendly (from the server/ directory, after
// DATABASE_URL is configured and schema.sql has been applied).
const db = require('../src/db');
const { hashPassword } = require('../src/auth');

const TENTS = [
  { id: 'pole-20x20', name: '20x20 Pole Tent', widthFt: 20, lengthFt: 20, pricePerDay: 250 },
  { id: 'pole-20x30', name: '20x30 Pole Tent', widthFt: 20, lengthFt: 30, pricePerDay: 350 },
  { id: 'pole-20x40', name: '20x40 Pole Tent', widthFt: 20, lengthFt: 40, pricePerDay: 450 },
  { id: 'pole-30x30', name: '30x30 Pole Tent', widthFt: 30, lengthFt: 30, pricePerDay: 575 },
  { id: 'pole-30x45', name: '30x45 Pole Tent', widthFt: 30, lengthFt: 45, pricePerDay: 700 },
  { id: 'pole-30x60', name: '30x60 Pole Tent', widthFt: 30, lengthFt: 60, pricePerDay: 850 },
  { id: 'pole-40x40', name: '40x40 Pole Tent', widthFt: 40, lengthFt: 40, pricePerDay: 1500 },
  { id: 'pole-40x60', name: '40x60 Pole Tent', widthFt: 40, lengthFt: 60, pricePerDay: 850 },
  { id: 'pole-40x80', name: '40x80 Pole Tent', widthFt: 40, lengthFt: 80, pricePerDay: 1850 },
  { id: 'pole-40x100', name: '40x100 Pole Tent', widthFt: 40, lengthFt: 100, pricePerDay: 1950 },
  { id: 'frame-20x20', name: '20x20 Frame Tent', widthFt: 20, lengthFt: 20, pricePerDay: 400 },
  { id: 'frame-20x30', name: '20x30 Frame Tent', widthFt: 20, lengthFt: 30, pricePerDay: 475 },
  { id: 'frame-20x40', name: '20x40 Frame Tent', widthFt: 20, lengthFt: 40, pricePerDay: 550 },
  { id: 'frame-30x40', name: '30x40 Frame Tent', widthFt: 30, lengthFt: 40, pricePerDay: 700 },
  { id: 'canopy-10x10', name: "10x10 Pop-Up Canopy", widthFt: 10, lengthFt: 10, pricePerDay: 100 },
  { id: 'canopy-10x20', name: "10x20 Pop-Up Canopy", widthFt: 10, lengthFt: 20, pricePerDay: 175 },
];

const TABLES = [
  { id: 'round-5ft', name: "5' Round Table", widthFt: 5, lengthFt: 5, capacity: 8, pricePerDay: 15.00 },
  { id: 'banquet-6ft', name: "6' Banquet Table", widthFt: 6, lengthFt: 2.5, capacity: 6, pricePerDay: 13.00 },
  { id: 'banquet-8ft', name: "8' Banquet Table", widthFt: 8, lengthFt: 2.5, capacity: 8, pricePerDay: 14.00 },
  { id: 'cocktail', name: 'Cocktail Table', widthFt: 2.5, lengthFt: 2.5, capacity: 0, pricePerDay: 12.00 },
  { id: 'fill-chill-4ft', name: "4' Fill & Chill Table", widthFt: 4, lengthFt: 2, capacity: 0, pricePerDay: 40.00 },
];

const CHAIRS = [
  { id: 'plastic-white', name: 'White Plastic Folding Chair', pricePerDay: 2.50 },
  { id: 'resin-white', name: 'White Resin Folding Chair', pricePerDay: 4.75 },
  { id: 'chiavari-gold', name: 'Gold Chiavari Chair', pricePerDay: 11.99 },
  { id: 'chiavari-white', name: 'White Chiavari Chair', pricePerDay: 11.99 },
  { id: 'chiavari-mahogany', name: 'Mahogany Chiavari Chair', pricePerDay: 12.00 },
  { id: 'throne-king', name: 'King Throne Chair', pricePerDay: 120.00 },
  { id: 'throne-queen-tiffany', name: 'Queen Tiffany Throne Chair', pricePerDay: 125.00 },
];

async function upsertTenant() {
  const existing = await db.query('SELECT id FROM tenants WHERE slug = $1', ['friendly']);
  if (existing.rows[0]) return existing.rows[0].id;

  const result = await db.query(
    `INSERT INTO tenants (slug, name, contact_email, phone, website, primary_color, secondary_color, tagline)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    ['friendly', 'Friendly Party Rental', 'customerservice@friendlypartyrental.com', '315-884-1498',
     'https://www.friendlypartyrental.com', '#2f7a3c', '#22592c',
     'Plan your tent, tables, and chairs for your event with Friendly Party Rental']
  );
  return result.rows[0].id;
}

async function seedProducts(tenantId) {
  let sortOrder = 0;
  for (const t of TENTS) {
    await db.query(
      `INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order)
       VALUES ($1,'tent',$2,$3,$4,$5,$6,$7)`,
      [tenantId, t.id, t.name, t.pricePerDay, t.widthFt, t.lengthFt, sortOrder++]
    );
  }
  for (const t of TABLES) {
    await db.query(
      `INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, capacity, sort_order)
       VALUES ($1,'table',$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, t.id, t.name, t.pricePerDay, t.widthFt, t.lengthFt, t.capacity, sortOrder++]
    );
  }
  for (const c of CHAIRS) {
    await db.query(
      `INSERT INTO products (tenant_id, category, external_id, name, price_per_day, sort_order)
       VALUES ($1,'chair',$2,$3,$4,$5)`,
      [tenantId, c.id, c.name, c.pricePerDay, sortOrder++]
    );
  }
}

async function seedStaffUser(tenantId) {
  // Creates one staff login so Friendly can actually sign into the
  // "Designs" dashboard. CHANGE THIS PASSWORD immediately after first
  // login - it is only here so day-one login is possible at all.
  const email = 'staff@friendlypartyrental.com';
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  let userId;
  if (existing.rows[0]) {
    userId = existing.rows[0].id;
  } else {
    const passwordHash = await hashPassword('change-me-immediately');
    const result = await db.query(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1,$2,$3) RETURNING id',
      [email, passwordHash, 'Friendly Party Rental Staff']
    );
    userId = result.rows[0].id;
  }

  await db.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, role)
     VALUES ($1,$2,'owner') ON CONFLICT (tenant_id, user_id) DO NOTHING`,
    [tenantId, userId]
  );
}

async function run() {
  const tenantId = await upsertTenant();
  await seedProducts(tenantId);
  await seedStaffUser(tenantId);
  // eslint-disable-next-line no-console
  console.log('Seeded Friendly Party Rental as tenant', tenantId);
  process.exit(0);
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
