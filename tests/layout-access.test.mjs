import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLayoutStore } from '../js/core/layoutStore.js';

test('read-only access rejects mutations and history changes without losing the paid scene', () => {
  let paid = true;
  const store = createLayoutStore({ tentId: 'pole-20x20', objects: [], zones: [], aisles: [] }, { canMutate: () => paid });
  store.addObject({ id: 'table', kind: 'table', x: 3, y: 4 });
  store.updateObject('table', { x: 5 });
  const saved = JSON.stringify(store.getState());
  paid = false;
  store.addObject({ id: 'extra' }); store.updateObject('table', { x: 90 });
  store.removeObject('table'); store.duplicateObject('table'); store.replaceObjects([]);
  store.setTent('frame-20x20'); store.addZone({ id: 'zone' }); store.addAisle({ id: 'aisle' }); store.reset();
  assert.equal(store.undo(), false); assert.equal(store.redo(), false);
  assert.equal(JSON.stringify(store.getState()), saved);
  paid = true;
  assert.equal(store.undo(), true); assert.equal(store.getState().objects[0].x, 3);
  paid = false; assert.equal(store.redo(), false);
  paid = true; assert.equal(store.redo(), true); assert.equal(store.getState().objects[0].x, 5);
});
