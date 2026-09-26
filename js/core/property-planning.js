import { evaluateTentFit, evaluateRentalFit } from './site-fit.js';
import { objectLocalDimensions } from './world-space.js';
import { rentalPhotoPlacement } from './photo-geometry.js';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rectPolygon(widthFt, lengthFt) {
  const w = Math.max(.01, finite(widthFt, 1));
  const l = Math.max(.01, finite(lengthFt, 1));
  return [{x:0,y:0},{x:w,y:0},{x:w,y:l},{x:0,y:l}];
}

function photoObstacle(g) {
  if (!g || typeof g !== 'object') return null;
  const widthFt = Math.max(.01, finite(g.widthFt, 1));
  const depthFt = Math.max(.01, finite(g.depthFt, 1));
  return {
    id: g.id || null,
    type: g.type || 'obstacle',
    kind: g.type || 'obstacle',
    x: finite(g.x),
    y: finite(g.y),
    widthFt,
    depthFt,
    rotationDeg: finite(g.rotationDeg),
  };
}

function tentPlacement(snapshot) {
  const site=snapshot?.photoSite,tent=snapshot?.tent;
  const p=snapshot?.photoTentPlacement;
  return {
    x: Number.isFinite(Number(p?.x)) ? Number(p.x) : Math.max(0,(finite(site?.widthFt)-finite(tent?.widthFt))/2),
    y: Number.isFinite(Number(p?.y)) ? Number(p.y) : Math.max(0,(finite(site?.lengthFt)-finite(tent?.lengthFt))/2),
    rotationDeg: finite(p?.rotationDeg),
  };
}

function rentalPlacement(item,snapshot) {
  // Lock the model dimensions before either photo placement or tent orientation
  // overrides the original layout angle of an older oriented accessory save.
  const local=objectLocalDimensions(item);
  item={...item,modelWidthFt:local.widthFt,modelDepthFt:local.depthFt};
  const p=item?.photoPlacement;
  if (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) {
    return {...item,x:Number(p.x),y:Number(p.y),rotationDeg:finite(p.rotationDeg,item.rotationDeg||0)};
  }
  return rentalPhotoPlacement(item,snapshot.tent,snapshot.photoSite,tentPlacement(snapshot));
}

export function propertyPlanningInput(snapshot) {
  const site=snapshot?.photoSite || snapshot?.tent;
  const usablePolygon=rectPolygon(site?.widthFt,site?.lengthFt);
  const manual=(snapshot?.photoGeometry||[]).map(photoObstacle).filter(Boolean);
  const scan=(snapshot?.scanGeometry||[]).map(photoObstacle).filter(Boolean);
  const obstacles=[...manual,...scan];
  return {site,usablePolygon,obstacles,manualObstacles:manual,scanObstacles:scan};
}

export function evaluatePropertyScene(snapshot) {
  if (!snapshot || !snapshot.backgroundPhoto || !snapshot.photoSite) {
    return {
      active:false,
      source:'no-photo-property',
      tent:null,
      rentals:[],
      counts:{fits:0,close:0,blocked:0},
      overall:'unknown',
      color:'neutral',
    };
  }
  // A stereo depth mesh is visual/spatial evidence, but it is not yet a
  // semantic collision map. Do not claim the tent "fits" merely because the
  // arbitrary planning rectangle contains it. Until at least one property
  // boundary/obstacle has been traced, keep the fit badge neutral.
  if(!(snapshot.photoGeometry||[]).length&&!(snapshot.scanGeometry||[]).length){
    return {
      active:false,
      source:snapshot.venueScan?.status==='ready'?'metric-scan-needs-boundaries':'photo-needs-boundaries',
      tent:null,
      rentals:[],
      counts:{fits:0,close:0,blocked:0},
      overall:'unknown',
      color:'neutral',
    };
  }
  if(snapshot.photoCalibration?.autoEstimated!==false){
    return {active:false,source:'photo-needs-calibration',tent:null,rentals:[],counts:{fits:0,close:0,blocked:0},overall:'unknown',color:'neutral'};
  }
  const {site,usablePolygon,obstacles,manualObstacles,scanObstacles}=propertyPlanningInput(snapshot);
  let tent=null;
  if (snapshot.tent && !snapshot.tent.isSite) {
    tent=evaluateTentFit({
      tent:snapshot.tent,
      placement:tentPlacement(snapshot),
      usablePolygon,
      obstacles,
      surfaceType:snapshot.surfaceType,
    });
  }
  const rentals=(snapshot.objects||[]).filter(item=>item && item.kind!=='dance').map(item=>{
    const placed=rentalPlacement(item,snapshot);
    const clearance=item.kind==='chair'?0.5:item.kind==='table'?1:item.kind==='inflatable'?2:['accessory','equipment'].includes(item.kind)?(Number(item.heightFt||0)>4?1.5:1):0.5;
    return {
      id:item.id,
      kind:item.kind,
      result:evaluateRentalFit({item:placed,usablePolygon,obstacles,clearanceFt:clearance}),
    };
  });
  const counts={fits:0,close:0,blocked:0};
  for(const item of rentals){
    if(item.result.status==='fits')counts.fits++;
    else if(item.result.status==='close')counts.close++;
    else counts.blocked++;
  }
  let overall='fits';
  if(tent?.status==='blocked'||counts.blocked>0)overall='blocked';
  else if(tent?.status==='close'||counts.close>0)overall='close';
  return {
    active:true,
    source:scanObstacles.length?'metric-scan-property':'photo-property',
    obstacleSources:{manual:manualObstacles.length,metricDepth:scanObstacles.length},
    site:{widthFt:site.widthFt,lengthFt:site.lengthFt},
    usablePolygon,
    obstacles,
    tent,
    tentPlacement:snapshot.tent&&!snapshot.tent.isSite?tentPlacement(snapshot):null,
    rentals,
    counts,
    overall,
    color:overall==='fits'?'green':overall==='close'?'yellow':'red',
  };
}

export function summarizePropertyFit(plan) {
  if(plan?.source==='photo-needs-calibration')return {label:'Adjust photo ground first',detail:'The photo ground is still an automatic estimate. Adjust its four corners before checking the model. Photo scale remains unverified.',kind:'neutral'};
  if(plan?.source==='photo-needs-boundaries')return {label:'Outline your usable space',detail:'A photo alone cannot establish boundaries or confirm fit. Adjust the ground and trace obstacles in Photo View; verify actual site dimensions with staff.',kind:'neutral'};
  if(!plan?.active){if(plan?.source==='metric-scan-needs-boundaries')return {label:'Trace boundaries to check fit',detail:'The Space Scan has estimated depth, but automatic obstacle boundaries are not yet reliable. Trace the house, fence or no-place areas in Photo View before using the fit result.',kind:'neutral'};return {label:'Site fit unavailable',detail:'Upload and calibrate a venue photo to check the estimated property model.',kind:'neutral'};}
  const tent=plan.tent;
  if(tent?.status==='blocked'){
    const reason=tent.reasons?.[0]?.message||'The tent placement conflicts with the reconstructed property.';
    return {label:'Tent blocked',detail:reason,kind:'blocked'};
  }
  if(tent?.status==='close'){
    const reason=tent.reasons?.[0]?.message||'The tent fits, but installation clearance is tight.';
    return {label:'Tent fit is tight',detail:reason,kind:'close'};
  }
  if(plan.counts.blocked){
    return {label:plan.counts.blocked+' rental'+(plan.counts.blocked===1?'':'s')+' blocked',detail:'One or more rentals overlap reconstructed property obstacles or extend outside the usable venue area.',kind:'blocked'};
  }
  if(plan.counts.close){
    return {label:plan.counts.close+' rental'+(plan.counts.close===1?'':'s')+' tight',detail:'The setup fits, but preferred clearance is tight around one or more rentals.',kind:'close'};
  }
  const clearance=tent?.clearanceFt||0;
  const metric=plan?.source==='metric-scan-property';
  return {label:metric?'Estimated clearance check':'Model clearance check',detail:metric?(tent?('Tent footprint and '+clearance+' ft installation clearance avoid the current depth-derived obstacles. Confirm critical clearances on site.'):'Placed rentals avoid the current depth-derived obstacles. Confirm critical clearances on site.'):(tent?('Tent footprint and '+clearance+' ft installation clearance fit this model. Verify actual measurements and site conditions.'):'Placed rentals fit this model. Verify actual measurements and site conditions.'),kind:'fits'};
}
