// Friendly Party Rental — Tent inventory data
// Real sizes and per-day prices pulled from friendlypartyrental.com (Aug 2026).
// Capacity figures below are ESTIMATED PLANNING GUIDANCE derived from the
// tent's square footage using standard event-planning ratios. They are not
// engineering or safety figures. Friendly Party Rental staff should confirm
// final seating/layout for any specific event.
// Pole positions are placeholder/estimated for visual planning only, pending
// exact engineering specs from Friendly's install crew — do not treat as a
// final installation plan.

export const TENT_TYPES = {
    POLE: 'pole',
    FRAME: 'frame',
    CANOPY: 'canopy',
};

function sqft(widthFt, lengthFt) { return widthFt * lengthFt; }

// Standard planning ratios (sqft per guest) — industry rule-of-thumb, not
// Friendly-specific engineering figures:
const SQFT_PER_GUEST = {
    cocktail: 6,
    ceremonyRows: 8,
    diningRounds: 12,
    diningWithDance: 15,
};

function estimateCapacity(widthFt, lengthFt) {
    const area = sqft(widthFt, lengthFt);
    return {
          cocktail: Math.floor(area / SQFT_PER_GUEST.cocktail),
          ceremonyRows: Math.floor(area / SQFT_PER_GUEST.ceremonyRows),
          diningRounds: Math.floor(area / SQFT_PER_GUEST.diningRounds),
          diningWithDance: Math.floor(area / SQFT_PER_GUEST.diningWithDance),
    };
}

function poleLayoutFor(type, widthFt, lengthFt) {
    if (type !== TENT_TYPES.POLE) return { centerPoles: [], estimated: false };
    const poles = [];
    const bay = 10;
    const count = Math.max(1, Math.round(lengthFt / bay) - 1);
    for (let i = 1; i <= count; i++) {
          poles.push({ x: widthFt / 2, y: (lengthFt / (count + 1)) * i });
    }
    return { centerPoles: poles, estimated: true };
}

function installClearanceFt(type) {
    if (type === TENT_TYPES.POLE) return 5;
    if (type === TENT_TYPES.FRAME) return 2;
    return 2;
}

function buildTent(id, name, type, widthFt, lengthFt, pricePerDay) {
    const capacity = estimateCapacity(widthFt, lengthFt);
    const pole = poleLayoutFor(type, widthFt, lengthFt);
    return {
          id: id,
          name: name,
          type: type,
          widthFt: widthFt,
          lengthFt: lengthFt,
          pricePerDay: pricePerDay,
          capacity: capacity,
          capacityNote: 'Approximate planning capacity. Friendly Party Rental will confirm exact seating for your event.',
          centerPoles: pole.centerPoles,
          poleLayoutEstimated: pole.estimated,
          installationClearanceFt: installClearanceFt(type),
          surfaceNotes: type === TENT_TYPES.FRAME
                  ? 'Frame tents have no interior poles and can often be ballasted on hard surfaces (asphalt, concrete, decks) when staking is not possible. Friendly Party Rental will verify final installation method.'
                  : 'This tent typically requires staking and guy lines around the perimeter. Ballast options may be available for hard surfaces — Friendly Party Rental will verify final installation requirements.',
          active: true,
    };
}

export const TENTS = [
    buildTent('pole-20x20', '20x20 Pole Tent', TENT_TYPES.POLE, 20, 20, 250),
    buildTent('pole-20x30', '20x30 Pole Tent', TENT_TYPES.POLE, 20, 30, 350),
    buildTent('pole-20x40', '20x40 Pole Tent', TENT_TYPES.POLE, 20, 40, 450),
    buildTent('pole-30x30', '30x30 Pole Tent', TENT_TYPES.POLE, 30, 30, 575),
    buildTent('pole-30x45', '30x45 Pole Tent', TENT_TYPES.POLE, 30, 45, 700),
    buildTent('pole-30x60', '30x60 Pole Tent', TENT_TYPES.POLE, 30, 60, 850),
    buildTent('pole-40x40', '40x40 Pole Tent', TENT_TYPES.POLE, 40, 40, 1500),
    buildTent('pole-40x60', '40x60 Pole Tent', TENT_TYPES.POLE, 40, 60, 850),
    buildTent('pole-40x80', '40x80 Pole Tent', TENT_TYPES.POLE, 40, 80, 1850),
    buildTent('pole-40x100', '40x100 Pole Tent', TENT_TYPES.POLE, 40, 100, 1950),
    buildTent('frame-20x20', '20x20 Frame Tent', TENT_TYPES.FRAME, 20, 20, 400),
    buildTent('frame-20x30', '20x30 Frame Tent', TENT_TYPES.FRAME, 20, 30, 475),
    buildTent('frame-20x40', '20x40 Frame Tent', TENT_TYPES.FRAME, 20, 40, 550),
    buildTent('frame-30x40', '30x40 Classic Frame Tent', TENT_TYPES.FRAME, 30, 40, 700),
    buildTent('canopy-10x10', '10x10 EZ Pop-Up Canopy', TENT_TYPES.CANOPY, 10, 10, 100),
    buildTent('canopy-10x20', '10x20 EZ Pop-Up Canopy', TENT_TYPES.CANOPY, 10, 20, 175),
  ];

export function byId(id) {
    return TENTS.find(function (t) { return t.id === id; });
}
