const express = require('express');

const router = express.Router();

// Master visual library: every visual look RentSketch's 2D/3D designer
// already knows how to draw, grouped by product category. A tenant product
// does not invent its own visual - it points at one of these ids via
// products.visual_model_id. This keeps the definition of what a Gold
// Chiavari Chair looks like in ONE place, shared by every tenant, instead
// of re-implemented per business. Kept in sync by hand for now with the
// renderer data in js/data/chairs.js, tables.js, tents.js, danceFloor.js,
// lighting.js and linens.js - see docs/ROADMAP.md for the follow-up to load
// both from one shared source instead of two copies.
const VISUAL_LIBRARY = [
  { id: 'plastic-white', category: 'chair', name: 'White Plastic Folding Chair', silhouette: 'folding' },
  { id: 'resin-white', category: 'chair', name: 'White Resin Folding Chair', silhouette: 'resin' },
  { id: 'chiavari-gold', category: 'chair', name: 'Gold Chiavari Chair', silhouette: 'chiavari' },
  { id: 'chiavari-white', category: 'chair', name: 'White Chiavari Chair', silhouette: 'chiavari' },
  { id: 'chiavari-mahogany', category: 'chair', name: 'Mahogany Chiavari Chair', silhouette: 'chiavari' },
  { id: 'throne-king', category: 'chair', name: 'King Throne Chair', silhouette: 'throne' },
  { id: 'throne-queen-tiffany', category: 'chair', name: 'Queen Tiffany Throne Chair', silhouette: 'throne' },
  { id: 'round-5ft', category: 'table', name: "5 Foot Round Table", silhouette: 'dining-round' },
  { id: 'banquet-6ft', category: 'table', name: "6 Foot Banquet Table", silhouette: 'banquet-rect' },
  { id: 'banquet-8ft', category: 'table', name: "8 Foot Banquet Table", silhouette: 'banquet-rect' },
  { id: 'cocktail', category: 'table', name: 'Cocktail Table', silhouette: 'cocktail-pedestal' },
  { id: 'fill-chill-4ft', category: 'table', name: "4 Foot Fill and Chill Table", silhouette: 'fillchill-tub' },
  { id: 'pole-20x20', category: 'tent', name: '20x20 Pole Tent', silhouette: 'pole-tent' },
  { id: 'pole-20x30', category: 'tent', name: '20x30 Pole Tent', silhouette: 'pole-tent' },
  { id: 'pole-20x40', category: 'tent', name: '20x40 Pole Tent', silhouette: 'pole-tent' },
  { id: 'pole-30x30', category: 'tent', name: '30x30 Pole Tent', silhouette: 'pole-tent' },
  { id: 'pole-30x45', category: 'tent', name: '30x45 Pole Tent', silhouette: 'pole-tent' },
  { id: 'pole-30x60', category: 'tent', name: '30x60 Pole Tent', silhouette: 'pole-tent' },
  { id: 'pole-40x40', category: 'tent', name: '40x40 Pole Tent', silhouette: 'pole-tent' },
  { id: 'pole-40x60', category: 'tent', name: '40x60 Pole Tent', silhouette: 'pole-tent' },
  { id: 'pole-40x80', category: 'tent', name: '40x80 Pole Tent', silhouette: 'pole-tent' },
  { id: 'pole-40x100', category: 'tent', name: '40x100 Pole Tent', silhouette: 'pole-tent' },
  { id: 'frame-20x20', category: 'tent', name: '20x20 Frame Tent', silhouette: 'frame-tent' },
  { id: 'frame-20x30', category: 'tent', name: '20x30 Frame Tent', silhouette: 'frame-tent' },
  { id: 'frame-20x40', category: 'tent', name: '20x40 Frame Tent', silhouette: 'frame-tent' },
  { id: 'frame-30x40', category: 'tent', name: '30x40 Classic Frame Tent', silhouette: 'frame-tent' },
  { id: 'canopy-10x10', category: 'tent', name: '10x10 EZ Pop-Up Canopy', silhouette: 'canopy-tent' },
  { id: 'canopy-10x20', category: 'tent', name: '10x20 EZ Pop-Up Canopy', silhouette: 'canopy-tent' },
  { id: 'dance-floor', category: 'dance-floor', name: 'Dance Floor (any size)', silhouette: 'dance-floor-grid' },
  { id: 'stage-section', category: 'stage', name: 'Stage Section', silhouette: 'stage-deck' },
  { id: 'lighting-tent', category: 'lighting', name: 'Tent Lighting', silhouette: 'grid-canopy' },
  { id: 'lighting-bistro', category: 'lighting', name: 'Bistro String Lights', silhouette: 'perimeter-swag' },
  { id: 'lighting-uplighting-12', category: 'lighting', name: 'Uplighting Package', silhouette: 'uplight-ring' },
  { id: 'lighting-uplight-single', category: 'lighting', name: 'Wireless LED Uplight', silhouette: 'uplight-single' },
  { id: 'lighting-chandelier', category: 'lighting', name: 'Crystal Chandelier', silhouette: 'chandelier' },
  { id: 'lighting-custom-300', category: 'lighting', name: 'Custom Lighting 300ft', silhouette: 'perimeter-strand' },
  { id: 'linen-skirt-round', category: 'linen', name: 'Round Table Linen', silhouette: 'skirt-round' },
  { id: 'linen-skirt-rect', category: 'linen', name: 'Rectangular Table Linen', silhouette: 'skirt-rect' },
  { id: 'linen-runner', category: 'linen', name: 'Table Runner', silhouette: 'runner' },
  ];

// GET /api/visual-library
// Public: every business creating or editing a product uses this to pick
// which existing RentSketch visual their real-world item should render as.
// Optional ?category= filter (chair, table, tent, dance-floor, stage,
// lighting, linen).
router.get('/', function (req, res) {
    const category = req.query.category;
    const items = category
      ? VISUAL_LIBRARY.filter(function (item) { return item.category === category; })
          : VISUAL_LIBRARY;
    res.json({ visuals: items });
});

module.exports = router;
