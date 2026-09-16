// RentSketch parametric tent definitions.
// 1 scene unit = 1 foot. Structural data is explicitly marked estimated until
// manufacturer/inventory documentation verifies the installation specification.

function node(id, x, z, heightFt, role) {
  return { id, x, z, heightFt, diameterIn: role === 'center' ? 2.5 : 2, role };
}

function perimeterNodes(widthFt, lengthFt, eaveHeightFt, spacingFt) {
  const out = [], seen = new Set();
  function add(x,z,role='side') {
    const key=x.toFixed(3)+','+z.toFixed(3); if(seen.has(key)) return; seen.add(key);
    out.push(node('side-'+out.length,x,z,eaveHeightFt,role));
  }
  for(let x=0;x<=widthFt+.01;x+=spacingFt) add(Math.min(x,widthFt),0,(x===0||x>=widthFt)?'corner':'side');
  for(let x=0;x<=widthFt+.01;x+=spacingFt) add(Math.min(x,widthFt),lengthFt,(x===0||x>=widthFt)?'corner':'side');
  for(let z=spacingFt;z<lengthFt-.01;z+=spacingFt){add(0,z,'side');add(widthFt,z,'side');}
  return out;
}

// Commercial pole-tent center poles sit on the longitudinal bay grid, not at
// half-bay centers.  This matters visually: a 40x80 is three major peaks at
// 20/40/60, while a 20x20 is one peak at 10.  Keep this parametric until an
// inventory-specific manufacturer model overrides it.
function centerNodes(type,widthFt,lengthFt,peakHeightFt) {
  if(type!=='pole') return [];
  const out=[];
  if(widthFt>=40){
    for(let z=20;z<lengthFt-.01;z+=20) out.push(node('center-'+out.length,widthFt/2,z,peakHeightFt,'center'));
  } else {
    // Narrow pole tents use a center line with approximately 20 ft bays.
    if(lengthFt<=20) out.push(node('center-0',widthFt/2,lengthFt/2,peakHeightFt,'center'));
    else for(let z=10;z<lengthFt-.01;z+=20) out.push(node('center-'+out.length,widthFt/2,z,peakHeightFt,'center'));
  }
  return out;
}

function peakHeight(type,widthFt){
  if(type!=='pole') return 7+Math.max(4,widthFt*.24);
  if(widthFt<=20)return 10;
  if(widthFt<30)return 14.5;
  // Do not create the exaggerated 20+ ft pyramids that made the visualizer
  // look unlike a rental pole tent. Inventory-specific verified dimensions
  // can replace this estimate later.
  return widthFt>=40?16.85:14.5;
}

export function createTentDefinition(catalogTent) {
  const type=catalogTent.type==='canopy'?'pop_up':catalogTent.type;
  const widthFt=catalogTent.widthFt,lengthFt=catalogTent.lengthFt,eaveHeightFt=7;
  const peak=peakHeight(type,widthFt);
  const sidePoles=perimeterNodes(widthFt,lengthFt,eaveHeightFt,10);
  const centerPoles=centerNodes(type,widthFt,lengthFt,peak);
  const clearanceFt=type==='pole'?5:2;
  const stakes=[],guyLines=[];
  if(type==='pole') sidePoles.forEach((p,i)=>{
    const dx=p.x===0?-clearanceFt:p.x===widthFt?clearanceFt:0;
    const dz=p.z===0?-clearanceFt:p.z===lengthFt?clearanceFt:0;
    const s={id:'stake-'+i,x:p.x+dx,z:p.z+dz,linkedPoleId:p.id}; stakes.push(s);
    guyLines.push({id:'guy-'+i,startPoleId:p.id,endStakeId:s.id,hasRatchet:true});
  });
  return {
    id:catalogTent.id,type,widthFt,lengthFt,eaveHeightFt,
    centerPoles,sidePoles,stakes,guyLines,
    roof:{segmentsPerFoot:1.5,curvature:1.7},
    installationClearanceFt:clearanceFt,
    installationFootprint:{x:-clearanceFt,z:-clearanceFt,widthFt:widthFt+clearanceFt*2,lengthFt:lengthFt+clearanceFt*2},
    manufacturer:catalogTent.manufacturer||null,model:catalogTent.model||null,
    installationDataStatus:catalogTent.installationDataStatus||'estimated'
  };
}

export function validateTentDefinition(t){
  const errors=[];
  ['widthFt','lengthFt','eaveHeightFt'].forEach(k=>{if(!Number.isFinite(t[k])||t[k]<=0)errors.push(k+' must be positive and finite');});
  [...t.centerPoles,...t.sidePoles].forEach(p=>{if(!Number.isFinite(p.x)||!Number.isFinite(p.z)||!Number.isFinite(p.heightFt))errors.push('invalid pole '+p.id);});
  if(t.type==='pole'&&t.centerPoles.length===0)errors.push('pole tent requires center support');
  return {ok:errors.length===0,errors};
}
