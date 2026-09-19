// Shared real-scale chair centers used by equipment cards, 2D and 3D.
export function chairPositions(item, chair = {}) {
  const count = Math.max(0, Math.floor(Number(item.seatCount) || 0));
  const width = Number(item.widthFt) || 5, depth = Number(item.depthFt) || 5;
  const gap = (Number(chair.seatDepthFt) || 1.5) / 2 + .35;
  const positions = [];
  if (item.shape === 'round') {
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + (Number(item.rotationDeg) || 0) * Math.PI / 180;
      positions.push({x:(width / 2 + gap) * Math.cos(angle), y:(depth / 2 + gap) * Math.sin(angle), angle});
    }
  } else {
    // Place chairs along the long edges, with one at each end when seated.
    const turned = depth > width, long = Math.max(width, depth), short = Math.min(width, depth);
    const ends = count >= 4 ? 2 : 0, sideCount = count - ends;
    for (let side = 0; side < 2; side++) {
      const n = side === 0 ? Math.ceil(sideCount / 2) : Math.floor(sideCount / 2);
      for (let i = 0; i < n; i++) positions.push({x:-long / 2 + long * (i + .5) / n, y:(side === 0 ? -1 : 1) * (short / 2 + gap), angle:side === 0 ? -Math.PI / 2 : Math.PI / 2});
    }
    if (ends) positions.push({x:-long / 2 - gap,y:0,angle:Math.PI},{x:long / 2 + gap,y:0,angle:0});
    if (turned) positions.forEach(p => {const x=p.x;p.x=-p.y;p.y=x;p.angle+=Math.PI / 2;});
  }
  return positions;
}
