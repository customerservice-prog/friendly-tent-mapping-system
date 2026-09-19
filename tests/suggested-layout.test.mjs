import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tablePositions, dancePositions } from '../js/core/suggested-layout.js';
import { sceneSetting, environmentBounds } from '../js/ui/scene-setting.js';
const pole={type:'pole',widthFt:20,lengthFt:20,centerPoles:[{x:10,y:10}],installationClearanceFt:5};
const round={diameterFt:5,seatsDefault:8};
test('20×20 suggestions fit four rounds and keep their chair envelopes clear of the center pole',()=>{
  const positions=tablePositions(pole,round);
  assert.equal(positions.length,4);
  for(const p of positions){assert.ok(p.x>=1.85&&p.y>=1.85&&p.x+6.85<=20&&p.y+6.85<=20);assert.ok(Math.hypot(p.x+2.5-10,p.y+2.5-10)>4.7);}
});
test('dance floor cannot overlap poles or force seating beyond the tent',()=>{
  assert.equal(dancePositions(pole,12).length,0);
  assert.equal(dancePositions(pole,24).length,0);
  const floor=dancePositions(pole,6).map(p=>({...p,widthFt:3,depthFt:3}));
  assert.equal(floor.length,4);
  const seats=tablePositions(pole,round,{},floor);
  assert.ok(seats.length<4&&seats.length>0);
  for(const p of seats)for(const d of floor)assert.ok(p.x+6.85<=d.x-.5||p.x-1.85>=d.x+3.5||p.y+6.85<=d.y-.5||p.y-1.85>=d.y+3.5);
});
test('visual setting follows tent type without asserting an unknown installation surface',()=>{
  const frame={...pole,type:'frame',centerPoles:[]};
  assert.equal(sceneSetting(pole,'notSure'),'backyard');
  assert.equal(sceneSetting(frame,'notSure'),'driveway');
  assert.equal(sceneSetting(frame,'grass'),'backyard');
  assert.equal(sceneSetting(pole,'concrete'),'backyard');
  for(const tent of [pole,{...pole,widthFt:40,lengthFt:100}]){const b=environmentBounds(tent);assert.ok(b.side>tent.widthFt/2+tent.installationClearanceFt);assert.ok(b.back>tent.lengthFt/2+tent.installationClearanceFt);}
});
