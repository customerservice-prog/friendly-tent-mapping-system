// Friendly Party Rental / RentSketch -- shared tent STRUCTURAL helpers.
// Geometry here is for visual planning. Exact installation and anchoring must
// always follow the rental company's tent model/manual and site conditions.

export const HARD_SURFACES = ['concrete', 'asphalt', 'deck'];

// Visual center-pole layout for Friendly's pole tents.
// IMPORTANT: large 40-ft-wide tents are NOT modeled as one crown every 20 ft.
// The supplied 40x80 reference has three center poles on the longitudinal
// centerline, at approximately 20, 40 and 60 ft. This creates two high end
// crowns plus a middle crown and the long saddle-shaped membrane between them.
// 20-ft-wide sectional tents continue to use the familiar 20-ft bay rhythm.
export function computeCenterPoles(type, widthFt, lengthFt) {
    if (type !== 'pole') return [];
    const poles = [];

    if (widthFt >= 40 && lengthFt >= 40) {
        // Keep the first/last crown about 20 ft in from the ends and continue
        // at 20-ft spacing. Example: 40x80 => 20,40,60 (3 poles).
        for (let y = 20; y <= lengthFt - 20 + 0.01; y += 20) {
            poles.push({ x: widthFt / 2, y });
        }
        return poles.length ? poles : [{ x: widthFt / 2, y: lengthFt / 2 }];
    }

    // Narrower sectional pole tents: one crown per ~20-ft longitudinal bay.
    const count = Math.max(1, Math.round(lengthFt / 20));
    const bay = lengthFt / count;
    for (let i = 0; i < count; i++) {
        poles.push({ x: widthFt / 2, y: bay * (i + 0.5) });
    }
    return poles;
}

export function installationClearanceFt(type) {
    if (type === 'pole') return 5;
    if (type === 'frame') return 2;
    return 2;
}

export function resolveAnchoringMethod(tentType, surfaceType) {
    if (!surfaceType || surfaceType === 'notSure') return null;
    return HARD_SURFACES.indexOf(surfaceType) !== -1 ? 'ballast' : 'stake';
}
