// A visual setting is not an installation-surface answer. Unknown site details
// stay unknown in the layout and quote until the customer/provider confirms them.
export function sceneSetting(tent, surface) {
  if (tent.isSite || tent.type === 'pole') return 'backyard';
  if (surface === 'grass' || surface === 'dirt') return 'backyard';
  return 'driveway';
}

export function environmentBounds(tent) {
  const clearance = Math.max(5, tent.installationClearanceFt || 0);
  return {
    side: Math.max(36, tent.widthFt / 2 + clearance + 19),
    back: Math.max(38, tent.lengthFt / 2 + clearance + 22),
    front: Math.max(46, tent.lengthFt / 2 + 28),
    ground: Math.max(280, tent.widthFt + 200, tent.lengthFt + 200),
    driveWidth: tent.widthFt + 12,
  };
}
