// Public sample only. Shared by the interactive tour and its rendered poster.
// No tenant catalog, customer design, API calls or saved data are used here.
export function marketingReception() {
  const tables=[];
  for (const x of [10,30]) for (const y of [8,22,38,52]) {
    tables.push({id:`sample-table-${x}-${y}`,kind:'table',tableId:'round-5ft',shape:'round',widthFt:5,depthFt:5,x:x-2.5,y:y-2.5,rotationDeg:0,seatCount:8,chairId:'resin-white',linenId:'linen-round-120',linenColor:'White'});
  }
  const floor=[];
  for(let x=14;x<26;x+=3) for(let y=24;y<36;y+=3) floor.push({id:`sample-floor-${x}-${y}`,kind:'dance',widthFt:3,depthFt:3,x,y});
  return {tent:{id:'pole-40x60',type:'pole',widthFt:40,lengthFt:60,installationClearanceFt:5,centerPoles:[{x:20,y:20},{x:20,y:40}]},surfaceType:'grass',anchoringMethod:'stake',objects:[...tables,...floor],lightingId:'lighting-bistro'};
}
