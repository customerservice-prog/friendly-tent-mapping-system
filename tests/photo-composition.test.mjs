import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePhotoComposition,foregroundMaskValidity,foregroundMaskAt,photoLightingPosition,DEFAULT_PHOTO_LIGHTING} from '../js/core/photo-composition.js';
const points=[{x:.1,y:.2},{x:.7,y:.15},{x:.6,y:.65},{x:.4,y:.45},{x:.1,y:.8}];
test('manual foreground accepts concave outlines and rejects unsafe/collapsed input',()=>{
 assert.equal(foregroundMaskValidity(points).valid,true);
 for(const invalid of [[],[{x:0,y:0},{x:1,y:1}],Array(4).fill({x:.5,y:.5}),[{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}],[{x:0,y:0},{x:1,y:0},{x:2,y:0}],[{x:0,y:0},{x:NaN,y:0},{x:.5,y:.5}]])assert.equal(foregroundMaskValidity(invalid).valid,false);
});
test('source image points and lighting survive save and reopen with explicit manual metadata',()=>{
 const original=normalizePhotoComposition({foregroundMasks:[{id:'bush',label:'Lawn bush',points,featherPx:2.5,enabled:true}],lighting:{azimuthDeg:45,elevationDeg:25,intensity:3.3,ambient:.8,shadowSoftness:4,shadowOpacity:.32}});
 assert.equal(original.version,1);assert.deepEqual(normalizePhotoComposition(JSON.parse(JSON.stringify(original))),original);
 assert.equal(foregroundMaskAt(original,{x:.2,y:.3})?.id,'bush');assert.equal(foregroundMaskAt(original,{x:.8,y:.3}),null);
 assert.equal(foregroundMaskAt({...original,foregroundMasks:[{...original.foregroundMasks[0],enabled:false}]},{x:.2,y:.3}),null);
 assert.equal(original.foregroundMasks[0].points[0].x,.1,'points are fractions, not CSS pixels');
});
test('composition is bounded, detached from input, and never stores invalid masks',()=>{
 const input={foregroundMasks:[{id:'bad',points:[]},{id:'bush',points}],lighting:{azimuthDeg:900,elevationDeg:-1,intensity:99,ambient:99,shadowSoftness:99,shadowOpacity:99}},result=normalizePhotoComposition(input);
 assert.equal(result.foregroundMasks.length,1);assert.equal(result.lighting.azimuthDeg,360);assert.equal(result.lighting.elevationDeg,10);assert.equal(result.lighting.shadowOpacity,.65);assert.equal(result.lighting.shadowSoftness,6);
 result.foregroundMasks[0].points[0].x=.4;assert.equal(points[0].x,.1);assert.deepEqual(normalizePhotoComposition(null).lighting,DEFAULT_PHOTO_LIGHTING);
});
test('manual sun direction follows the documented photo plan axes',()=>{
 for(const [azimuth,expectedX,expectedZ] of [[0,0,-1],[90,1,0],[180,0,1],[270,-1,0]]){
  const position=photoLightingPosition({azimuthDeg:azimuth,elevationDeg:45},10),horizontal=Math.sqrt(50);
  assert.ok(Math.abs(position.x-expectedX*horizontal)<1e-8);assert.ok(Math.abs(position.z-expectedZ*horizontal)<1e-8);assert.ok(Math.abs(position.y-horizontal)<1e-8);
 }
});
