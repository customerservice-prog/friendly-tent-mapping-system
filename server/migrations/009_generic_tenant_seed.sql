-- Seeds the public "generic" RentSketch tenant for the public demo designer.
-- This tenant serves as the default catalog when no specific tenant is loaded.
-- Safe to re-run: uses INSERT ... ON CONFLICT.

-- Insert the generic tenant if it does not exist.
INSERT INTO tenants (
  id, slug, name, contact_email, phone, website,
  primary_color, secondary_color, tagline, show_prices,
  subscription_plan, subscription_status
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'generic',
  'RentSketch Demo',
  'demo@rentsketch.com',
  '(555) 000-0000',
  'https://rentsketch.com',
  '#2f6fed',
  '#0b1b3a',
  'Plan your perfect event with RentSketch',
  true,
  'trial',
  'trialing'
)
ON CONFLICT (slug) DO NOTHING;

-- Insert generic catalog: tents, tables, chairs (same as Friendly demo data).
-- All use ON CONFLICT to make this migration idempotent.

-- Tents
INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'pole-20x20', '20x20 Pole Tent', 250.00, 20, 20, 0, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'pole-20x20');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'pole-20x30', '20x30 Pole Tent', 350.00, 20, 30, 1, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'pole-20x30');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'pole-20x40', '20x40 Pole Tent', 450.00, 20, 40, 2, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'pole-20x40');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'pole-30x30', '30x30 Pole Tent', 575.00, 30, 30, 3, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'pole-30x30');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'pole-30x45', '30x45 Pole Tent', 700.00, 30, 45, 4, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'pole-30x45');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'pole-30x60', '30x60 Pole Tent', 850.00, 30, 60, 5, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'pole-30x60');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'pole-40x40', '40x40 Pole Tent', 1500.00, 40, 40, 6, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'pole-40x40');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'pole-40x60', '40x60 Pole Tent', 850.00, 40, 60, 7, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'pole-40x60');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'pole-40x80', '40x80 Pole Tent', 1850.00, 40, 80, 8, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'pole-40x80');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'pole-40x100', '40x100 Pole Tent', 1950.00, 40, 100, 9, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'pole-40x100');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'frame-20x20', '20x20 Frame Tent', 400.00, 20, 20, 10, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'frame-20x20');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'frame-20x30', '20x30 Frame Tent', 475.00, 20, 30, 11, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'frame-20x30');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'frame-20x40', '20x40 Frame Tent', 550.00, 20, 40, 12, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'frame-20x40');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'frame-30x40', '30x40 Frame Tent', 700.00, 30, 40, 13, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'frame-30x40');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'canopy-10x10', '10x10 Pop-Up Canopy', 100.00, 10, 10, 14, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'canopy-10x10');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'tent', 'canopy-10x20', '10x20 Pop-Up Canopy', 175.00, 10, 20, 15, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'canopy-10x20');

-- Tables
INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, capacity, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'table', 'round-5ft', '5'' Round Table', 15.00, 5, 5, 8, 16, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'round-5ft');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, capacity, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'table', 'banquet-6ft', '6'' Banquet Table', 13.00, 6, 2.5, 6, 17, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'banquet-6ft');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, capacity, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'table', 'banquet-8ft', '8'' Banquet Table', 14.00, 8, 2.5, 8, 18, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'banquet-8ft');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, capacity, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'table', 'cocktail', 'Cocktail Table', 12.00, 2.5, 2.5, 0, 19, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'cocktail');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, width_ft, length_ft, capacity, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'table', 'fill-chill-4ft', '4'' Fill & Chill Table', 40.00, 4, 2, 0, 20, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'fill-chill-4ft');

-- Chairs
INSERT INTO products (tenant_id, category, external_id, name, price_per_day, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'chair', 'plastic-white', 'White Plastic Folding Chair', 2.50, 21, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'plastic-white');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'chair', 'resin-white', 'White Resin Folding Chair', 4.75, 22, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'resin-white');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'chair', 'chiavari-gold', 'Gold Chiavari Chair', 11.99, 23, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'chiavari-gold');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'chair', 'chiavari-white', 'White Chiavari Chair', 11.99, 24, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'chiavari-white');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'chair', 'chiavari-mahogany', 'Mahogany Chiavari Chair', 12.00, 25, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'chiavari-mahogany');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'chair', 'throne-king', 'King Throne Chair', 120.00, 26, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'throne-king');

INSERT INTO products (tenant_id, category, external_id, name, price_per_day, sort_order, active)
SELECT '00000000-0000-0000-0000-000000000001', 'chair', 'throne-queen-tiffany', 'Queen Tiffany Throne Chair', 125.00, 27, true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND external_id = 'throne-queen-tiffany');

