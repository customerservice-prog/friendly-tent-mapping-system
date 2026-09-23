// Public marketing sample only. Shared by the homepage wedding build,
// the interactive demo and rendered marketing poster. No tenant catalog,
// customer design, API calls, orders, quote requests or saved data are used.

function tent() {
  return {
    id:'pole-40x60',
    type:'pole',
    widthFt:40,
    lengthFt:60,
    installationClearanceFt:5,
    centerPoles:[{x:20,y:20},{x:20,y:40}]
  };
}

function guestTable(id,x,y,seats=8,styled=true,hideChairs=false) {
  return {
    id,
    kind:'table',
    tableId:'round-5ft',
    shape:'round',
    widthFt:5,
    depthFt:5,
    x:x-2.5,
    y:y-2.5,
    rotationDeg:0,
    seatCount:seats,
    chairId:'chiavari-gold',
    linenId:styled?'linen-round-120':null,
    linenColor:styled?'Ivory':null,
    hideChairs
  };
}

function banquet(id,x,y,width=6,opts={}) {
  const tableId=width===8?'banquet-8ft':'banquet-6ft';
  return {
    id,
    kind:'table',
    tableId,
    shape:'rect',
    widthFt:width,
    depthFt:2.5,
    x,
    y,
    rotationDeg:opts.rotationDeg||0,
    seatCount:opts.seatCount||0,
    chairId:opts.chairId||'chiavari-gold',
    linenId:opts.linenId===undefined?(width===8?'linen-banquet-72x120':'linen-banquet-54x120'):opts.linenId,
    linenColor:opts.linenColor||'Ivory'
  };
}

function cocktail(id,x,y,color='Ivory') {
  return {
    id,
    kind:'table',
    tableId:'cocktail',
    shape:'round',
    widthFt:2.5,
    depthFt:2.5,
    x,
    y,
    rotationDeg:0,
    seatCount:0,
    chairId:'chiavari-gold',
    linenId:'linen-cocktail-cover',
    linenColor:color
  };
}

function danceFloor() {
  const floor=[];
  for(let x=14;x<26;x+=3) for(let y=24;y<36;y+=3) {
    floor.push({id:`wedding-floor-${x}-${y}`,kind:'dance',widthFt:3,depthFt:3,x,y});
  }
  return floor;
}

function guestTables(seats=8,styled=true,hideChairs=false) {
  const tables=[];
  for (const x of [8,32]) for (const y of [10,22,38,50]) {
    tables.push(guestTable(`wedding-table-${x}-${y}`,x,y,seats,styled,hideChairs));
  }
  return tables;
}

function serviceAreas(styled=true) {
  return [
    banquet('wedding-sweetheart',17,2.2,6,{
      seatCount:2,
      chairId:'chiavari-gold',
      linenColor:styled?'Champagne':'Ivory',
      linenId:styled?'linen-banquet-54x120':null
    }),
    banquet('wedding-dj',17,55.2,6,{
      seatCount:0,
      linenColor:'Black',
      linenId:styled?'linen-spandex-6ft':null
    }),
    banquet('wedding-buffet-a',1.2,27.2,8,{
      seatCount:0,
      linenColor:'White',
      linenId:styled?'linen-banquet-72x120':null
    }),
    banquet('wedding-buffet-b',1.2,34.2,8,{
      seatCount:0,
      linenColor:'White',
      linenId:styled?'linen-banquet-72x120':null
    }),
    banquet('wedding-bar',30.8,29.4,8,{
      seatCount:0,
      linenColor:'Black',
      linenId:styled?'linen-spandex-8ft':null
    }),
    cocktail('wedding-cocktail-a',2.2,48.2,styled?'Gold':'White'),
    cocktail('wedding-cocktail-b',35.3,48.2,styled?'Gold':'White')
  ];
}

function scene(objects,lightingId='lighting-none') {
  return {
    tent:tent(),
    surfaceType:'grass',
    anchoringMethod:'stake',
    objects,
    lightingId
  };
}

export function marketingReception() {
  return scene([
    ...guestTables(8,true),
    ...serviceAreas(true),
    ...danceFloor()
  ],'lighting-bistro');
}

// Stages are intentionally presentation-only. Each scene is a complete
// immutable snapshot that can be passed directly into the real 3D renderer.
export function marketingWeddingBuildStages() {
  const bareTables=guestTables(8,false,true);
  const seatedTables=guestTables(8,false,false);
  const dressedTables=guestTables(8,true);
  const serviceBare=serviceAreas(false);
  const serviceDressed=serviceAreas(true);
  const floor=danceFloor();

  return [
    {
      key:'space',
      label:'Empty event space',
      detail:'Start with the footprint',
      scene:scene([]),
      camera:'outside',
      styling:false,
      night:false,
      animate:[]
    },
    {
      key:'tent',
      label:'Build the 40 × 60 tent',
      detail:'Tent structure',
      scene:scene([]),
      camera:'outside',
      styling:false,
      night:false,
      animate:[],
      tentBuild:true
    },
    {
      key:'tables',
      label:'Place eight guest tables',
      detail:'Reception seating plan',
      scene:scene(bareTables),
      camera:'outside',
      styling:false,
      night:false,
      animate:bareTables.map(x=>x.id)
    },
    {
      key:'chairs',
      label:'Seat the reception',
      detail:'64 Gold Chiavari chairs',
      scene:scene(seatedTables),
      camera:'outside',
      styling:false,
      night:false,
      animate:seatedTables.map(x=>x.id),
      chairReveal:true
    },
    {
      key:'sweetheart',
      label:'Add the sweetheart table',
      detail:'Head table + service areas',
      scene:scene([...seatedTables,...serviceBare]),
      camera:'outside',
      styling:false,
      night:false,
      animate:serviceBare.map(x=>x.id)
    },
    {
      key:'dance',
      label:'Build the dance floor',
      detail:'12 × 12 dance floor',
      scene:scene([...seatedTables,...serviceBare,...floor]),
      camera:'outside',
      styling:false,
      night:false,
      animate:floor.map(x=>x.id)
    },
    {
      key:'style',
      label:'Dress the wedding',
      detail:'Linens + centerpieces',
      scene:scene([...dressedTables,...serviceDressed,...floor]),
      camera:'outside',
      styling:true,
      night:false,
      animate:[]
    },
    {
      key:'lighting',
      label:'Hang the bistro lights',
      detail:'Reception lighting',
      scene:scene([...dressedTables,...serviceDressed,...floor],'lighting-bistro'),
      camera:'outside',
      styling:true,
      night:false,
      animate:[]
    },
    {
      key:'reception',
      label:'Step inside the finished reception',
      detail:'Same layout · now in 3D',
      scene:marketingReception(),
      camera:'reception',
      styling:true,
      night:false,
      animate:[],
      cameraTransition:true
    },
    {
      key:'evening',
      label:'Wedding ready',
      detail:'Evening reception preview',
      scene:marketingReception(),
      camera:'reception',
      styling:true,
      night:true,
      animate:[],
      cameraTransition:false
    }
  ];
}
