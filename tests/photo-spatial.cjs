const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
(async()=>{
  const source=fs.readFileSync(path.join(root,'js/core/photo-geometry.js'),'utf8');
  const context=vm.createContext({console,Math,Number,String,Object,Array,Date,Set,Map});
  const mod=new vm.SourceTextModule(source,{context,identifier:'photo-geometry.js'});
  await mod.link(()=>{throw new Error('photo-geometry.js must stay dependency-free');});await mod.evaluate();
  const g=mod.namespace,site={widthFt:70,lengthFt:90},cal=g.defaultPhotoCalibration(site);
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
  const manual=g.normalizePhotoCalibration({...cal,frontLeft:{x:.1,y:.92},backRight:{x:.69,y:.5},autoEstimated:false},site);
  const center=g.worldToPhoto(35,45,site,manual);assert.ok(center.x>.2&&center.x<.8&&center.y>.3&&center.y<.9);
  console.log('PASS photo spatial geometry: perspective round-trip, rotated footprints, geometry normalization, clamping and 3D camera estimate.');
})().catch(e=>{console.error(e);process.exitCode=1;});
