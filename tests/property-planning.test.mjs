import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePropertyScene, summarizePropertyFit, propertyPlanningInput } from '../js/core/property-planning.js';

const tent={id:'pole-20x30',type:'pole',widthFt:20,lengthFt:30,installationClearanceFt:5};
function snapshot(overrides={}){
  return {
    backgroundPhoto:{id:'photo',url:'/photo'},
    photoSite:{id:'photo-site',isSite:true,widthFt:70,lengthFt:90},
    tent,
    photoTentPlacement:{x:25,y:25,rotationDeg:0},
    photoGeometry:[],
    surfaceType:'grass',
    objects:[],
    ...overrides,
  };
}

test('property adapter turns photo site + traced geometry into fit-engine input',()=>{
  const input=propertyPlanningInput(snapshot({photoGeometry:[
    {id:'house',type:'house',x:5,y:60,widthFt:35,depthFt:20,rotationDeg:0},
    {id:'tree',type:'tree',x:58,y:42,widthFt:5,depthFt:5,rotationDeg:0},
  ]}));
  assert.equal(input.usablePolygon.length,4);
  assert.deepEqual(input.usablePolygon[2],{x:70,y:90});
  assert.equal(input.obstacles.length,2);
  assert.equal(input.obstacles[0].type,'house');
});

test('property scene reports green when tent and rentals fit reconstructed property',()=>{
  const plan=evaluatePropertyScene(snapshot({objects:[
    {id:'table',kind:'table',x:3,y:4,widthFt:5,depthFt:5,photoPlacement:{x:30,y:35,rotationDeg:0}},
  ]}));
  assert.equal(plan.active,true);
  assert.equal(plan.tent.status,'fits');
  assert.equal(plan.overall,'fits');
  assert.equal(plan.color,'green');
  assert.equal(summarizePropertyFit(plan).kind,'fits');
});

test('property scene reports yellow when installation clearance is tight but tent itself fits',()=>{
  const plan=evaluatePropertyScene(snapshot({
    photoTentPlacement:{x:2,y:30,rotationDeg:0},
  }));
  assert.equal(plan.tent.status,'close');
  assert.equal(plan.overall,'close');
  assert.equal(plan.color,'yellow');
  assert.equal(summarizePropertyFit(plan).kind,'close');
});

test('property scene reports red when reconstructed house overlaps exact tent footprint',()=>{
  const plan=evaluatePropertyScene(snapshot({
    photoGeometry:[{id:'house',type:'house',x:30,y:35,widthFt:20,depthFt:20,rotationDeg:0}],
  }));
  assert.equal(plan.tent.status,'blocked');
  assert.equal(plan.overall,'blocked');
  assert.equal(plan.color,'red');
  assert.ok(plan.tent.collisions.some(c=>c.id==='house'));
  assert.equal(summarizePropertyFit(plan).label,'Tent blocked');
});

test('property scene maps rental photoPlacement into property coordinates',()=>{
  const plan=evaluatePropertyScene(snapshot({
    photoGeometry:[{id:'tree',type:'tree',x:50,y:20,widthFt:5,depthFt:5,rotationDeg:0}],
    objects:[{id:'chair',kind:'chair',x:1,y:1,widthFt:1.5,depthFt:1.5,photoPlacement:{x:51,y:21,rotationDeg:0}}],
  }));
  assert.equal(plan.counts.blocked,1);
  assert.equal(plan.overall,'blocked');
  assert.equal(plan.rentals[0].result.status,'blocked');
});

test('without a photo property the adapter stays inactive instead of inventing fit confidence',()=>{
  const plan=evaluatePropertyScene({...snapshot(),backgroundPhoto:null});
  assert.equal(plan.active,false);
  assert.equal(plan.overall,'unknown');
  assert.equal(summarizePropertyFit(plan).kind,'neutral');
});
