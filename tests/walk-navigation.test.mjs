import test from 'node:test';
import assert from 'node:assert/strict';
import {
  walkBlockingObstacles,
  walkPositionBlocked,
  resolveWalkStep,
  findSafeWalkStart,
  walkSpeedFtPerSecond,
} from '../js/core/walk-navigation.js';

const site={widthFt:70,lengthFt:90};

test('walk blockers include reconstructed property geometry including no-place zones',()=>{
  const blockers=walkBlockingObstacles({
    photoGeometry:[
      {id:'house',type:'house',x:10,y:60,widthFt:30,depthFt:20},
      {id:'unsafe',type:'no-place',x:42,y:20,widthFt:8,depthFt:8},
    ],
  });
  assert.equal(blockers.length,2);
  assert.equal(blockers[0].source,'property');
  assert.equal(blockers[1].type,'no-place');
});

test('viewer is blocked by site boundary and reconstructed house',()=>{
  const house={id:'house',type:'house',x:20,y:55,widthFt:30,depthFt:20};
  const outside=walkPositionBlocked({worldX:-35,worldZ:0,site,photoGeometry:[house]});
  assert.equal(outside.blocked,true);
  assert.equal(outside.reason,'outside_site');

  // World x=0,z=20 -> layout x=35,y=65, inside the house.
  const inside=walkPositionBlocked({worldX:0,worldZ:20,site,photoGeometry:[house]});
  assert.equal(inside.blocked,true);
  assert.equal(inside.reason,'obstacle');
  assert.equal(inside.blocker.id,'house');
});

test('no-place zones block walk mode even though they are not visible walls',()=>{
  const zone={id:'pool-safety',type:'no-place',x:30,y:40,widthFt:10,depthFt:10};
  // World 0,0 maps to layout 35,45.
  const hit=walkPositionBlocked({worldX:0,worldZ:0,site,photoGeometry:[zone]});
  assert.equal(hit.blocked,true);
  assert.equal(hit.blocker.type,'no-place');
});

test('large inflatables block walk mode while tables and chairs stay passable',()=>{
  const items=[
    {id:'slide',kind:'inflatable',x:30,y:40,widthFt:12,depthFt:18},
    {id:'table',kind:'table',x:10,y:10,widthFt:5,depthFt:5},
    {id:'chair',kind:'chair',x:20,y:20,widthFt:1.5,depthFt:1.5},
  ];
  const inflatableHit=walkPositionBlocked({worldX:1,worldZ:4,site,items});
  assert.equal(inflatableHit.blocked,true);
  assert.equal(inflatableHit.blocker.id,'slide');

  const tableWorld={x:12.5-site.widthFt/2,z:12.5-site.lengthFt/2};
  const tablePass=walkPositionBlocked({worldX:tableWorld.x,worldZ:tableWorld.z,site,items});
  assert.equal(tablePass.blocked,false);
});

test('photoPlacement controls inflatable collision in reconstructed property world',()=>{
  const items=[{
    id:'bounce',
    kind:'inflatable',
    x:1,y:1,widthFt:10,depthFt:10,
    photoPlacement:{x:50,y:60,rotationDeg:0},
  }];
  const originalSpot={x:6-site.widthFt/2,z:6-site.lengthFt/2};
  const movedSpot={x:55-site.widthFt/2,z:65-site.lengthFt/2};
  assert.equal(walkPositionBlocked({worldX:originalSpot.x,worldZ:originalSpot.z,site,items}).blocked,false);
  assert.equal(walkPositionBlocked({worldX:movedSpot.x,worldZ:movedSpot.z,site,items}).blocked,true);
});

test('walk step slides along an obstacle instead of freezing movement',()=>{
  const wall={id:'wall',type:'fence',x:34,y:40,widthFt:2,depthFt:18};
  // Start just left of wall, attempt diagonal step into it.
  const start={x:-3,z:2};
  const target={x:1,z:5};
  const step=resolveWalkStep({from:start,to:target,site,photoGeometry:[wall],bodyRadiusFt:.5});
  assert.equal(step.moved,true);
  assert.equal(step.slid,true);
  assert.ok(step.x===start.x||step.z===start.z);
});

test('walk step stays put when both slide axes are blocked',()=>{
  const blockers=[
    // Blocks the target and the X-only slide path (layout x=35,y=40).
    {id:'vertical',type:'fence',x:34,y:39,widthFt:2,depthFt:9},
    // Blocks the target and the Z-only slide path (layout x=30,y=45).
    {id:'horizontal',type:'fence',x:29,y:44,widthFt:9,depthFt:2},
  ];
  const start={x:-5,z:-5};
  const target={x:0,z:0};
  const step=resolveWalkStep({from:start,to:target,site,photoGeometry:blockers,bodyRadiusFt:.5});
  assert.equal(step.blocked,true);
  assert.equal(step.moved,false);
  assert.deepEqual({x:step.x,z:step.z},start);
});

test('safe start avoids reconstructed obstacles and respects site bounds',()=>{
  const house={id:'house',type:'house',x:30,y:10,widthFt:10,depthFt:25};
  const start=findSafeWalkStart({
    preferredWorldPoint:{x:0,z:-25},
    site,
    photoGeometry:[house],
  });
  const check=walkPositionBlocked({worldX:start.x,worldZ:start.z,site,photoGeometry:[house]});
  assert.equal(check.blocked,false);
});

test('walk speeds stay in feet per second and sprint remains faster',()=>{
  assert.equal(walkSpeedFtPerSecond({mobile:false}),8.5);
  assert.equal(walkSpeedFtPerSecond({mobile:false,sprint:true}),15);
  assert.ok(walkSpeedFtPerSecond({mobile:true})<walkSpeedFtPerSecond({mobile:false}));
});


test('standing accessory rentals block walk mode while floor runners stay passable',()=>{
  const site={widthFt:50,lengthFt:60};
  const items=[
    {id:'foam',kind:'accessory',x:24,y:30,widthFt:3,depthFt:3,heightFt:2.5},
    {id:'carpet',kind:'accessory',x:10,y:10,widthFt:4,depthFt:15,heightFt:.06},
  ];
  const foam=walkPositionBlocked({worldX:0.5,worldZ:1.5,site,items});
  assert.equal(foam.blocked,true);
  assert.equal(foam.blocker.id,'foam');
  const carpetWorldX=10+2-site.widthFt/2,carpetWorldZ=10+7.5-site.lengthFt/2;
  const carpet=walkPositionBlocked({worldX:carpetWorldX,worldZ:carpetWorldZ,site,items});
  assert.equal(carpet.blocked,false,'low-profile runner should not behave like a wall');
});
