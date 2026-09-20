// Coordinates stay in feet and use the same table/chair envelopes as the editor.
// Suggestions never change the customer's selected tent or force excess seats in.
export function tablePositions(tent, table, chair = {}, obstacles = []) {
  const width = table.diameterFt || table.widthFt;
  const depth = table.diameterFt || table.depthFt;
  const chairSpace = table.seatsDefault ? Math.max(chair.seatWidthFt || 1.5, chair.seatDepthFt || 1.5) + .35 : 0;
  const cellW = width + chairSpace * 2 + .5;
  const cellD = depth + chairSpace * 2 + .5;
  const cols = Math.floor(tent.widthFt / cellW), rows = Math.floor(tent.lengthFt / cellD);
  const positions = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const cx = tent.widthFt * (col + .5) / cols;
    const cy = tent.lengthFt * (row + .5) / rows;
    const envelope = { x: cx - width / 2 - chairSpace, y: cy - depth / 2 - chairSpace, w: width + chairSpace * 2, d: depth + chairSpace * 2 };
    if (obstacles.some(o => envelope.x < o.x + o.widthFt + .5 && envelope.x + envelope.w > o.x - .5 && envelope.y < o.y + o.depthFt + .5 && envelope.y + envelope.d > o.y - .5)) continue;
    if ((tent.centerPoles || []).some(p => p.x > envelope.x - .4 && p.x < envelope.x + envelope.w + .4 && p.y > envelope.y - .4 && p.y < envelope.y + envelope.d + .4)) continue;
    positions.push({ x: cx - width / 2, y: cy - depth / 2 });
  }
  return positions;
}

export function dancePositions(tent, sideFt, sectionFt = 3, obstacles = []) {
  const side = Math.ceil(sideFt / sectionFt) * sectionFt;
  if (side > tent.widthFt - 2 || side > tent.lengthFt - 2) return [];
  // Try corners; keep center poles out of the dance floor.
  const corners = [[tent.widthFt-side-1,tent.lengthFt-side-1],[1,tent.lengthFt-side-1],[tent.widthFt-side-1,1],[1,1]];
  const origin = corners.find(([x,y]) => !obstacles.some(o=>x<o.x+o.widthFt+2&&x+side>o.x-2&&y<o.y+o.depthFt+2&&y+side>o.y-2) && !(tent.centerPoles || []).some(p => p.x >= x-.5 && p.x <= x+side+.5 && p.y >= y-.5 && p.y <= y+side+.5));
  if (!origin) return [];
  const positions = [];
  for (let y=0;y<side;y+=sectionFt) for (let x=0;x<side;x+=sectionFt) positions.push({ x:origin[0]+x, y:origin[1]+y });
  return positions;
}
