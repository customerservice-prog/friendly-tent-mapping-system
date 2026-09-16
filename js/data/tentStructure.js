// Friendly Party Rental / RentSketch -- shared tent STRUCTURAL helpers.
// Geometry here is for visual planning. Exact installation and anchoring must
// always follow the rental company's tent model/manual and site conditions.

export const HARD_SURFACES = ['concrete', 'asphalt', 'deck'];

// Classic Series pole tents are built in approximately 20 ft longitudinal
// top sections/bays. A center pole supports the crown of each bay. This is
// intentionally NOT a 10 ft grid: that old approximation doubled the number
// of peaks and made large tents look like a row of tiny circus peaks.
// Examples: 30x60 => 3 center poles; 40x80 => 4; 40x100 => 5.
export function computeCenterPoles(type, widthFt, lengthFt) {
    if (type !== 'pole') return [];
    const count = Math.max(1, Math.round(lengthFt / 20));
    const bay = lengthFt / count;
    const poles = [];
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
