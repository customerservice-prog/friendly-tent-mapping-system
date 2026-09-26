const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
(async()=>{
  const source=fs.readFileSync(path.join(root,'js/core/photo-geometry.js'),'utf8');
  const context=vm.createContext({console,Math,Number,String,Object,Array,Date,Set,Map});
  const mod=new vm.SourceTextModule(source,{context,identifier:'photo-geometry.js'});
  await mod.link(()=>{throw new Error('photo-geometry.js must stay dependency-free');});await mod.evaluate();
  const g=mod.namespace,site={widthFt:70,lengthFt:90},cal=g.defaultPhotoCalibration(site);
  assert.deepEqual(g.defaultPhotoCalibration(site,null),cal,'ordinary3D scenes explicitly store backgroundPhoto:null');
  assert.deepEqual(g.normalizePhotoCalibration(null,site,null),g.normalizePhotoCalibration(null,site),'empty-photo3D and photo removal preserve the estimated camera without throwing');
  for(const [x,y] of [[0,0],[70,0],[70,90],[0,90],[35,45],[10,72],[62,15]]){
    const p=g.worldToPhoto(x,y,site,cal),w=g.photoToWorld(p.x,p.y,site,cal,{clampToGround:false});
    assert.ok(w, 'inverse exists');
    assert.ok(Math.abs(w.x-x)<.03&&Math.abs(w.y-y)<.03,'photo/world round trip '+x+','+y+' -> '+JSON.stringify(w));
  }
  const outside=g.photoToWorld(-2,3,site,cal,{clampToGround:true});
  assert.ok(outside.x>=0&&outside.x<=70&&outside.y>=0&&outside.y<=90,'clamped inverse stays inside site');
  const item={id:'table',x:12,y:20,widthFt:5,depthFt:5,rotationDeg:30};
  const poly=g.objectPhotoPolygon(item,site,cal);assert.equal(poly.length,4);poly.forEach(p=>{assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));});
  const normalized=g.normalizePhotoGeometry([{type:'house',x:12,y:3,widthFt:24,depthFt:8},{type:'no-place',x:1,y:2,widthFt:5,depthFt:6},{type:'bogus',x:2,y:2,widthFt:2,depthFt:2}],site);
  assert.equal(normalized.length,3);assert.equal(normalized[0].heightFt,12);assert.equal(normalized[1].heightFt,.2);assert.equal(normalized[2].type,'obstacle');
  const cam=g.photoCameraEstimate(site,cal);assert.equal(cam.position.length,3);assert.equal(cam.target.length,3);assert.ok(cam.position[1]>5);assert.ok(cam.fov>=30&&cam.fov<=60);assert.ok(cam.confidence>=.25&&cam.confidence<=.92);
  // Regress the actual visual defect: old corners silently implied a high
  // overhead camera despite storing an eye-level-looking horizon value.
  const yard={widthFt:50,lengthFt:60},photo={widthPx:1600,heightPx:1000},eye=g.defaultPhotoCalibration(yard,photo);
  const projection=g.photoProjection(yard,eye,1200,750,1600,1000,photo);
  assert.ok(Math.abs(projection.center[1]-5.5)<1e-7,'starting camera is physically eye level');
  assert.ok(Math.abs(projection.center[2]+38)<1e-7,'starting camera distance is coherent with the plane');
  assert.ok(Math.abs(g.photoGroundHorizon(yard,eye)-eye.horizonY)<1e-9,'displayed horizon is the actual ground vanishing line');
  const old={version:1,autoEstimated:false,horizonY:.34,frontLeft:{x:.055,y:.955},frontRight:{x:.945,y:.955},backLeft:{x:.278,y:.47},backRight:{x:.722,y:.47}};
  assert.ok(g.photoProjection(yard,old,1200,750,1600,1000,photo).center[1]>20,'legacy screenshot failure really used an overhead camera');
  const fy=1/(2*Math.tan(Math.PI/6)),fx=fy/1.6,pitch=Math.atan((.5-.46)/fy),cp=Math.cos(pitch),sp=Math.sin(pitch);
  for(const [x,z,y] of [[15,20,0],[35,40,0],[25,30,14],[20,20,7],[40,10,4]]){
    const v=[x-25,y,z-30,1],m=projection.matrix,dot=row=>row.reduce((sum,a,i)=>sum+a*v[i],0),den=dot(m.slice(12,16));
    const actual={x:(dot(m.slice(0,4))/den+1)/2,y:(1-dot(m.slice(4,8))/den)/2};
    const depth=cp*(z+8)+sp*(5.5-y),expected={x:.5+fx*(x-25)/depth,y:.5+fy*(cp*(5.5-y)-sp*(z+8))/depth};
    assert.ok(Math.abs(actual.x-expected.x)<1e-8&&Math.abs(actual.y-expected.y)<1e-8,'height as well as ground agrees with the eye-level pinhole camera');
  }
  for(const imageAspect of [.3,.5625,.75,1.5,2.5]){
    const portrait=g.defaultPhotoCalibration(yard,{widthPx:imageAspect*1000,heightPx:1000});
    assert.ok(g.photoCalibrationValidity(portrait).valid,'visible reference works at aspect '+imageAspect);
    const normalized=g.normalizePhotoCalibration(portrait,yard),p=g.photoProjection(yard,normalized,1000,1000/imageAspect,imageAspect*1000,1000);
    assert.ok(Math.abs(p.center[1]-5.5)<1e-6,'portrait/landscape retain physical eye-height');
    for(const key of ['frontLeft','frontRight','backLeft','backRight'])assert.ok(portrait[key].x>=0&&portrait[key].x<=1,'reference handles are visible');
  }
  const saved={...eye,reference:{...eye.reference,widthFt:24,lengthFt:30},fovDeg:56,autoEstimated:false,scaleConfirmed:true,calibratedAt:'2026-09-26T00:00:00.000Z'};
  const reopened=g.normalizePhotoCalibration(JSON.parse(JSON.stringify(saved)),yard);
  assert.deepEqual(JSON.parse(JSON.stringify(reopened)),JSON.parse(JSON.stringify(saved)),'new reference, lens and measurement flags survive JSON persistence and normalization');
  assert.equal(g.normalizePhotoCalibration({...old,autoEstimated:true},yard).version,2,'old automatic guesses migrate');
  assert.equal(g.normalizePhotoCalibration(old,yard).version,1,'manual legacy marks are preserved');
  const manual=g.normalizePhotoCalibration({...cal,frontLeft:{x:.1,y:.92},backRight:{x:.69,y:.5},autoEstimated:false},site);
  const center=g.worldToPhoto(35,45,site,manual);assert.ok(center.x>.2&&center.x<.8&&center.y>.3&&center.y<.9);
  const rotated=g.rentalPhotoPlacement({x:0,y:0,widthFt:4,depthFt:4,rotationDeg:15},{widthFt:20,lengthFt:30},site,{x:25,y:25,rotationDeg:90});
  assert.equal(rotated.x,46);assert.equal(rotated.y,30);assert.equal(rotated.rotationDeg,105,'parent rotation rotates both location and orientation');
  const detached=g.rentalPhotoPlacement({x:0,y:0,widthFt:4,depthFt:4,photoPlacement:{x:4,y:8,rotationDeg:10}},{widthFt:20,lengthFt:30},site,{x:25,y:25,rotationDeg:90});
  assert.equal(detached.x,4);assert.equal(detached.y,8);assert.equal(detached.rotationDeg,10,'independently moved rentals stay detached from the tent');
  console.log('PASS photo spatial geometry: perspective round-trip, rotated footprints, geometry normalization, clamping and 3D camera estimate.');
})().catch(e=>{console.error(e);process.exitCode=1;});
