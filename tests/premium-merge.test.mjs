import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { inventoryBrowser } from '../js/ui/inventory-browser.js';
import { equipmentCatalog } from '../js/data/equipment.js';
import { accessoryCatalog, accessoryItem } from '../js/data/accessories.js';
import { TABLETOP, tabletopCatalog } from '../js/data/tabletop.js';
import { summarizeEvent } from '../js/core/eventSummary.js';
import { rectFromObject } from '../js/core/geometry.js';

const products = [
  { id: 'foam', category: 'other', name: 'Foam Party Machine', price_per_day: 175 },
  { id: 'stairs', category: 'other', name: 'Stage Stairs', width_ft: 4, length_ft: 3, price_per_day: 45 },
  { id: 'plate', category: 'other', name: 'Dinner Plate', price_per_day: 1 },
  { id: 'sugar', category: 'other', name: 'Cotton Candy Floss Sugar - Grape', price_per_day: 12 },
  { id: 'upgrade', category: 'other', name: 'Photobooth 4x6 Print Upgrade', price_per_day: 50 },
];

function catalogs() {
  return {
    products,
    equipment: equipmentCatalog(products, true, new Set()),
    accessories: accessoryCatalog(products, true),
  };
}

function browserDocument(catalog, objects = []) {
  return JSDOM.fragment(inventoryBrowser(catalog, objects));
}

test('a product resolved by both catalogs has one equipment placement card', () => {
  const catalog = catalogs();
  assert.ok(catalog.equipment.some(p => p.productId === 'foam'));
  assert.ok(catalog.accessories.some(p => p.productId === 'foam'));
  const document = browserDocument(catalog);
  const foam = document.querySelectorAll('[data-id="equipment-foam"]');
  assert.equal(foam.length, 1);
  assert.equal(foam[0].dataset.role, 'equipment-card');
  assert.equal(document.querySelectorAll('[data-id="accessory-foam"]').length, 0);
});

test('a dedicated stage-stair accessory replaces its generic equipment card', () => {
  const catalog = catalogs();
  assert.equal(catalog.equipment.find(p => p.productId === 'stairs').type, 'generic');
  assert.equal(catalog.accessories.find(p => p.productId === 'stairs').accessoryType, 'stage-stair');
  const document = browserDocument(catalog);
  const stairs = document.querySelectorAll('[data-id="accessory-stairs"]');
  assert.equal(stairs.length, 1);
  assert.equal(stairs[0].dataset.role, 'accessory-card');
  assert.equal(document.querySelectorAll('[data-id="equipment-stairs"]').length, 0);
});

test('tabletop, consumables, and upgrades never reappear as duplicate floor rentals', t => {
  const previous = [...TABLETOP];
  t.after(() => TABLETOP.splice(0, TABLETOP.length, ...previous));
  TABLETOP.splice(0, TABLETOP.length, ...tabletopCatalog(products, true));
  const document = browserDocument(catalogs());
  for (const id of ['plate', 'sugar', 'upgrade']) {
    assert.equal(document.querySelectorAll(`[data-id="equipment-${id}"], [data-id="accessory-${id}"]`).length, 0, id);
  }
  const plate = document.querySelector('[data-id="plate"]');
  assert.ok(plate, 'the plate remains available through table styling');
  assert.equal(plate.dataset.role, 'inventory-open');
  assert.equal(plate.dataset.drawer, 'tables');
});

test('a saved accessory contributes one count on the shared product equipment card', () => {
  const catalog = catalogs();
  const foam = catalog.accessories.find(p => p.productId === 'foam');
  const saved = JSON.parse(JSON.stringify(accessoryItem(foam, 'saved-foam', 3, 5)));
  const document = browserDocument(catalog, [saved]);
  assert.equal(document.querySelector('[data-id="equipment-foam"] .inventory-count').textContent, '1 in layout');
  assert.equal(document.querySelectorAll('.inventory-count').length, 1);
  assert.equal(document.querySelectorAll('[data-id="accessory-foam"]').length, 0);
});

test('legacy accessories preserve identity but require price confirmation when catalog rows are missing', () => {
  const foam = catalogs().accessories.find(p => p.productId === 'foam');
  const saved = accessoryItem(foam, 'saved-foam', 3, 5);
  const summary = summarizeEvent({ objects: [saved, { ...saved, id: 'saved-foam-copy' }] }, {});
  assert.equal(summary.lines.length, 1);
  assert.equal(summary.lines[0].label, 'Foam Party Machine');
  assert.equal(summary.lines[0].productId, 'foam');
  assert.equal(summary.lines[0].qty, 2);
  assert.equal(summary.lines[0].unitPrice, null, 'saved historical prices must not become a current quote');
  assert.equal(summary.total, null);
});

test('rotated accessories use swapped footprint dimensions exactly once', () => {
  const stairs = catalogs().accessories.find(p => p.productId === 'stairs');
  const item = accessoryItem(stairs, 'stairs-item', 2, 5);
  assert.equal(item.footprintOriented, true);
  [item.widthFt, item.depthFt] = [item.depthFt, item.widthFt];
  item.rotationDeg = 90;
  assert.deepEqual(rectFromObject(item), { x: 2, y: 5, width: 3, depth: 4 });
  assert.equal(item.modelWidthFt, 4);
  assert.equal(item.modelDepthFt, 3);
});

test('legacy accessory and new equipment for the same product stay one review line', () => {
  const catalog = catalogs();
  const foamAccessory = catalog.accessories.find(p => p.productId === 'foam');
  const legacy = accessoryItem(foamAccessory, 'legacy-foam', 3, 5);
  const modernProduct = catalog.equipment.find(p => p.productId === 'foam');
  const modern = {
    id:'modern-foam',kind:'equipment',equipmentId:modernProduct.id,productId:'foam',
    name:modernProduct.name,widthFt:modernProduct.widthFt,depthFt:modernProduct.depthFt,x:8,y:5
  };
  const summary = summarizeEvent({objects:[legacy,modern]}, catalog);
  assert.equal(summary.lines.length,1);
  assert.equal(summary.lines[0].productId,'foam');
  assert.equal(summary.lines[0].qty,2);
});
