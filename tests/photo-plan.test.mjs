import test from 'node:test';
import assert from 'node:assert/strict';
import {photoPlanSnapshot} from '../js/core/photo-plan.js';

const input=()=>({tent:{id:'pole-20x30',name:'Pole tent',widthFt:20,lengthFt:30,centerPoles:[{x:10,y:15}]},photoSite:{widthFt:80,lengthFt:60},backgroundPhoto:{url:'https://example.test/photo'},photoTentPlacement:{x:30,y:10,rotationDeg:90},objects:[{id:'table',kind:'table',x:2,y:3,widthFt:6,depthFt:3,rotationDeg:0},{id:'equipment',kind:'equipment',x:1,y:1,widthFt:10,depthFt:3,modelWidthFt:3,modelDepthFt:10,rotationDeg:90,footprintOriented:true,photoPlacement:{x:60,y:40,rotationDeg:30}}]});

test('photo site plan displays the same transformed and independently placed rentals',()=>{
 const data=input(),before=structuredClone(data),plan=photoPlanSnapshot(data);
 assert.equal(plan.photoSitePlan,true);assert.deepEqual(plan.tent.planningArea,{widthFt:80,lengthFt:60});
 assert.deepEqual(plan.planTentPlacement,{x:30,y:10,rotationDeg:90});
 assert.equal(plan.objects[0].x,47.5);assert.equal(plan.objects[0].y,18.5);assert.equal(plan.objects[0].rotationDeg,90);
 assert.equal(plan.objects[1].x,60);assert.equal(plan.objects[1].y,40);assert.equal(plan.objects[1].rotationDeg,30);
 assert.equal(plan.objects[1].modelWidthFt,3);assert.equal(plan.objects[1].modelDepthFt,10);
 assert.deepEqual(data,before,'render adapter does not rewrite save data');
 assert.equal(photoPlanSnapshot(plan),plan,'resize and zoom never remap coordinates twice');
});

test('site plan preserves world-space placement previews and maps legacy tent-local previews',()=>{
 const data=input(),world={objects:[{id:'pending',x:55,y:40,widthFt:3,depthFt:4}],x:55,y:40,widthFt:3,depthFt:4,photoMode:true};
 assert.equal(photoPlanSnapshot({...data,placement:world}).placement,world);
 const local={objects:[data.objects[0]],x:2,y:3,widthFt:6,depthFt:3,photoMode:false};
 const plan=photoPlanSnapshot({...data,placement:local});assert.equal(plan.placement.photoMode,true);assert.equal(plan.placement.x,47.5);assert.equal(plan.placement.y,18.5);
});

test('layouts without photos retain the existing tent plan contract',()=>{
 const data=input();delete data.backgroundPhoto;assert.equal(photoPlanSnapshot(data),data);
});

import {runPhotoPlanChecks} from '../js/core/photo-plan.js';
const checkType=(checks,type,id)=>checks.some(c=>c.type===type&&(!id||c.objectIds.includes(id)));
const worldScene=objects=>({backgroundPhoto:{url:'https://example.test/photo'},photoSite:{widthFt:80,lengthFt:60},tent:{id:'tent',name:'Tent',type:'pole',widthFt:20,lengthFt:30,installationClearanceFt:2,centerPoles:[{x:5,y:15}]},photoTentPlacement:{x:30,y:10,rotationDeg:90},objects,surfaceType:'grass'});
const rental=(id,x,y,extra={})=>({id,kind:'equipment',widthFt:2,depthFt:2,x:1,y:1,photoPlacement:{x,y,rotationDeg:0},...extra});

test('photo conflict checks follow world positions instead of stale local overlaps',()=>{
 const scene=worldScene([rental('one',5,5),rental('two',15,5)]),before=structuredClone(scene);
 assert.equal(checkType(runPhotoPlanChecks(scene),'objectOverlap'),false,'overlapping legacy x/y do not produce a false overlap');
 scene.objects[1].photoPlacement={x:5.5,y:5.5};
 assert.equal(checkType(runPhotoPlanChecks(scene),'objectOverlap'),true,'moving visible rentals together creates the warning');
 scene.objects[1].photoPlacement={x:79,y:5};
 assert.equal(checkType(runPhotoPlanChecks(scene),'tentEdgeConflict','two'),true,'world edge bounds are checked');
 assert.deepEqual(scene.objects[0],before.objects[0],'checks never rewrite object placement');
});

test('photo pole and inflatable clearance checks rotate and translate with the tent',()=>{
 // Local pole(5,15) becomes world(40,20) after tent90deg rotation.
 const scene=worldScene([rental('pole-hit',39,19),rental('old-pole',4,14),rental('inflatable',22,23,{kind:'inflatable'})]);
 let checks=runPhotoPlanChecks(scene);
 assert.equal(checkType(checks,'hardConflict','pole-hit'),true);
 assert.equal(checkType(checks,'hardConflict','old-pole'),false);
 assert.equal(checkType(checks,'hardConflict','inflatable'),true,'rotated installation clearance is protected');
 scene.objects[2].photoPlacement={x:60,y:40};
 checks=runPhotoPlanChecks(scene);assert.equal(checkType(checks,'hardConflict','inflatable'),false,'moving clear removes the old warning');
 assert.equal(checkType(runPhotoPlanChecks({...scene,surfaceType:'concrete'}),'surfaceAnchorConflict'),true);
});

test('photo overlaps use rotated polygons rather than overlapping bounding boxes',()=>{
 const scene=worldScene([rental('slender-a',15,19.5,{widthFt:10,depthFt:1,modelWidthFt:10,modelDepthFt:1,photoPlacement:{x:15,y:19.5,rotationDeg:45}}),rental('slender-b',13.6,20.9,{widthFt:10,depthFt:1,modelWidthFt:10,modelDepthFt:1,photoPlacement:{x:13.6,y:20.9,rotationDeg:45}})]);
 scene.tent={...scene.photoSite,isSite:true};
 assert.equal(checkType(runPhotoPlanChecks(scene),'objectOverlap'),false,'parallel separated diagonal rentals remain separate');
});

test('photo dance sections keep one protected floor area in their actual site location',()=>{
 const scene=worldScene([rental('floor-a',30,30,{kind:'dance',widthFt:3,depthFt:3}),rental('floor-b',33,30,{kind:'dance',widthFt:3,depthFt:3}),rental('near-floor',35,33)]);
 const checks=runPhotoPlanChecks(scene);
 assert.equal(checkType(checks,'danceFloorConflict','near-floor'),true);
 assert.equal(checkType(checks,'danceFloorConflict','floor-a'),false);
 assert.equal(checkType(checks,'objectOverlap','floor-a'),false,'adjacent floor sections are one event zone');
});
