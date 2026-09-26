import test from 'node:test';
import assert from 'node:assert/strict';
import { rectFromObject } from '../js/core/geometry.js';
import { objectGroundFootprint, objectLocalDimensions } from '../js/core/world-space.js';
import { evaluateRentalFit } from '../js/core/site-fit.js';
import { evaluatePropertyScene } from '../js/core/property-planning.js';
import { walkBlockingObstacles, walkPositionBlocked } from '../js/core/walk-navigation.js';

const site={widthFt:50,lengthFt:50};
const bounds=points=>({
  x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),
  width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),
  depth:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y)),
});
function closeRect(actual,expected){
  for(const key of ['x','y','width','depth'])assert.ok(Math.abs(actual[key]-expected[key])<1e-8,`${key}: ${actual[key]} != ${expected[key]}`);
}
const legacyAccessory={id:'legacy-bar',kind:'accessory',x:4,y:6,widthFt:10,depthFt:3,heightFt:4,rotationDeg:90};
const modernEquipment={...legacyAccessory,id:'modern-equipment',kind:'equipment',modelWidthFt:3,modelDepthFt:10,footprintOriented:true};

for(const item of [legacyAccessory,modernEquipment]){
  test(`${item.kind} rotated footprint agrees across 2D collision, fit and walk`,()=>{
    const saved=structuredClone(item),visible={x:4,y:6,width:10,depth:3};
    closeRect(rectFromObject(item),visible);
    closeRect(bounds(objectGroundFootprint(item)),visible);
    closeRect(bounds(objectGroundFootprint(item,.5)),{x:3.5,y:5.5,width:11,depth:4});
    const tightArea=[{x:3.9,y:5.9},{x:14.1,y:5.9},{x:14.1,y:9.1},{x:3.9,y:9.1}];
    assert.equal(evaluateRentalFit({item,usablePolygon:tightArea,clearanceFt:0}).status,'fits');
    assert.equal(evaluateRentalFit({item,obstacles:[{id:'post',x:4.2,y:6.2,widthFt:.4,depthFt:.4}],clearanceFt:0}).status,'blocked');
    const blockers=walkBlockingObstacles({items:[item]});
    assert.equal(blockers.length,1);closeRect(bounds(blockers[0].polygon),visible);
    const hit=(x,y)=>walkPositionBlocked({worldX:x-25,worldZ:y-25,site,items:[item],bodyRadiusFt:0}).blocked;
    assert.equal(hit(4.5,7.5),true,'visible end of the rental blocks walking');
    assert.equal(hit(8,3),false,'space outside the visible rental stays passable');
    assert.deepEqual(item,saved,'footprint queries never mutate saved objects');
  });
}

test('new accessory model dimensions and 270-degree saves use the same oriented footprint',()=>{
  const item={...modernEquipment,kind:'accessory',rotationDeg:270};
  closeRect(bounds(objectGroundFootprint(item)),{x:4,y:6,width:10,depth:3});
  assert.deepEqual(objectLocalDimensions(item),{widthFt:3,depthFt:10});
});

test('unflagged legacy object kinds retain their original rotation contract',()=>{
  const table={...legacyAccessory,kind:'table'};
  const expected={x:7.5,y:2.5,width:3,depth:10};
  closeRect(rectFromObject(table),expected);
  closeRect(bounds(objectGroundFootprint(table)),expected);
});

test('photo rotation preserves the original local dimensions of a legacy accessory',()=>{
  const item={...legacyAccessory,photoPlacement:{x:20,y:20,rotationDeg:0}};
  // Photo x/y retain the existing stored-box center contract. They are not a new
  // normalized world transform; only the independent angle is applied here.
  const expected={x:23.5,y:16.5,width:3,depth:10};
  closeRect(bounds(walkBlockingObstacles({items:[item]})[0].polygon),expected);
  const result=evaluatePropertyScene({backgroundPhoto:'photo',photoSite:site,tent:{...site,isSite:true},objects:[item],photoGeometry:[]});
  closeRect(bounds(result.rentals[0].result.footprint),expected);
  const check=(x,y)=>walkPositionBlocked({worldX:x-25,worldZ:y-25,site,items:[item],bodyRadiusFt:0}).blocked;
  assert.equal(check(25,17),true);
  assert.equal(check(21,21),false);
});
