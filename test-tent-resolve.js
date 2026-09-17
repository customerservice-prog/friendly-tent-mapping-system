// Quick syntax check and resolution test
import { TENTS } from './js/data/tents.js';

function norm(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function dims(v) { var m = String(v || '').toLowerCase().match(/(10|20|30|40)\s*[x×-]\s*(10|20|30|40|45|60|80|100)/); return m ? (m[1] + 'x' + m[2]) : ''; }

function resolveTentDeepLink(name, slug, catalog) {
  var wantedType = /frame/i.test(name + ' ' + slug) ? 'frame' : (/pop|canopy/i.test(name + ' ' + slug) ? 'canopy' : (/pole/i.test(name + ' ' + slug) ? 'pole' : ''));
  var wantedDims = dims(name) || dims(slug);
  
  // Exact match: normalized name or slug against canonical catalog
  var exact = catalog.find(function (t) { 
    return norm(t.name) === norm(name) || norm(t.id) === norm(slug) || t.id === slug;
  });
  if (exact) return exact;
  
  // Fallback: match by dimensions + type
  var fallback = catalog.find(function (t) { 
    return (!wantedDims || (t.widthFt + 'x' + t.lengthFt) === wantedDims) && (!wantedType || t.type === wantedType);
  });
  return fallback || null;
}

// Test cases
var tests = [
  { name: '20x20 Pole Tent', slug: '20x20-pole-tent', expected: 'pole-20x20' },
  { name: '20x30 Pole Tent', slug: '20x30-pole-tent', expected: 'pole-20x30' },
  { name: '30x40 Frame Tent', slug: '30x40-frame-tent', expected: 'frame-30x40' },
  { name: '10x10 Pop-Up Canopy', slug: '10x10-canopy', expected: 'canopy-10x10' },
];

console.log('Testing tent resolution...\n');
tests.forEach(function(test) {
  var result = resolveTentDeepLink(test.name, test.slug, TENTS);
  var pass = result && result.id === test.expected;
  console.log((pass ? '✓' : '✗'), test.name, 
    '→', (result ? result.id : 'NOT FOUND'),
    (pass ? '' : '(expected ' + test.expected + ')'));
});
