// Shared overhead chair drawing. The back is at +Y, away from the table.
export function chairPlanSvg(silhouette='folding') {
  const frame='var(--chair-frame,#f4f3ed)',cushion='var(--chair-accent,#f4f3ed)';
  const seat=`<rect x="13" y="8" width="74" height="67" rx="14" fill="${frame}" stroke="#3e493e" stroke-opacity=".45" stroke-width="2.5"/><rect x="19" y="13" width="62" height="53" rx="11" fill="${cushion}" stroke="#fff" stroke-opacity=".5" stroke-width="2"/><path d="M24 19H76" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>`;
  let back;
  if(silhouette==='chiavari')back=`<path d="M13 57V90M87 57V90M14 82Q50 98 86 82" fill="none" stroke="${frame}" stroke-width="7"/><path d="M14 86Q50 100 86 86" fill="none" stroke="#43513d" stroke-opacity=".55" stroke-width="2"/>${[23,37,50,63,77].map(x=>`<circle cx="${x}" cy="${85+Math.sin(x/100*Math.PI)*4}" r="3.2" fill="${frame}" stroke="#43513d" stroke-opacity=".4"/>`).join('')}`;
  else if(silhouette==='throne')back=`<path d="M9 75V30M91 75V30" stroke="${frame}" stroke-width="11" stroke-linecap="round"/><path d="M8 86Q50 106 92 86L87 70Q50 84 13 70Z" fill="${frame}" stroke="#6e582d" stroke-width="2"/><path d="M19 78Q50 91 81 78" fill="none" stroke="${cushion}" stroke-width="5"/>`;
  else back=`<path d="M16 67V91M84 67V91" stroke="${frame}" stroke-width="7"/><path d="M10 76Q50 88 90 76L86 91Q50 101 14 91Z" fill="${frame}" stroke="#425044" stroke-opacity=".55" stroke-width="2.5"/>${silhouette==='resin'?'':'<path d="M36 88Q50 91 64 88" fill="none" stroke="#637567" stroke-opacity=".5" stroke-width="3"/>'}`;
  return `<svg viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="none">${seat}${back}</svg>`;
}
