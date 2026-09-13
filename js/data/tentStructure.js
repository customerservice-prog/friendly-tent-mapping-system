// Friendly Party Rental / RentSketch -- shared tent STRUCTURAL helpers.
// Single source of truth for pole layout, installation clearance, and
// anchoring-method resolution so the recommendation engine (js/data/tents.js)
// and the live designer (script.js, driven by the tenant catalog in
// js/data/tenant.js) never drift on tent structural geometry.
//
// NOTE: pole spacing and installation clearance distances below are
// ESTIMATED PLANNING VALUES pending verified engineering specs from the
// rental company's install crew. They are NOT final engineering figures.
// See js/data/tents.js header for the same caveat.

// Surface ids (from the guided wizard) that are NOT soft ground -- ground
// stakes are not usable on these, so anchoring must fall back to ballast
// (or be confirmed unavailable) instead.
export const HARD_SURFACES = ['concrete', 'asphalt', 'deck'];

// Interior support poles for POLE-type tents only. Frame and canopy tents
// have no interior poles (their support structure is a perimeter frame),
// so this always returns an empty array for those types -- callers should
// never assume every tent has poles.
export function computeCenterPoles(type, widthFt, lengthFt) {
    if (type !== 'pole') return [];
    const bay = 10;
    const count = Math.max(1, Math.round(lengthFt / bay) - 1);
    const poles = [];
    for (let i = 1; i <= count; i++) {
          poles.push({ x: widthFt / 2, y: (lengthFt / (count + 1)) * i });
    }
    return poles;
}

// How far (in feet) a tent's real installation footprint extends beyond its
// nominal covered footprint -- stakes, guy lines, or ballast for a pole tent
// typically need more room than a frame tent's low-profile perimeter anchors.
export function installationClearanceFt(type) {
    if (type === 'pole') return 5;
    if (type === 'frame') return 2;
    return 2;
}

// Resolves which anchoring hardware should be visualized for a given tent
// type + confirmed site surface. Returns null when the surface hasn't been
// confirmed yet ('notSure' or missing) so we never draw hardware the tenant
// hasn't actually configured for that site.
export function resolveAnchoringMethod(tentType, surfaceType) {
    if (!surfaceType || surfaceType === 'notSure') return null;
    return HARD_SURFACES.indexOf(surfaceType) !== -1 ? 'ballast' : 'stake';
}
