import test from 'node:test';
import assert from 'node:assert/strict';
import {canopyHeight,crownPoints} from '../js/core/tent-canopy.js';
import {structuralProfile,computeCenterPoles} from '../js/data/tentStructure.js';

for(const [widthFt,lengthFt] of [[20,20],[20,30],[20,40],[30,45],[30,60],[40,100]]){
  const tent={type:'pole',widthFt,lengthFt,centerPoles:computeCenterPoles('pole',widthFt,lengthFt)},p=structuralProfile(tent.type,widthFt,lengthFt);
  test(`${widthFt}×${lengthFt} tensile roof meets every support without a flat corner shelf`,()=>{
    for(const c of crownPoints(tent))assert.equal(canopyHeight(tent,p,c.x,c.z),p.peakHeightFt,'crown height remains structural data');
    for(let i=0;i<=20;i++){
      const x=-widthFt/2+widthFt*i/20,z=-lengthFt/2+lengthFt*i/20;
      assert.equal(canopyHeight(tent,p,x,-lengthFt/2),p.eaveHeightFt);
      assert.equal(canopyHeight(tent,p,x,lengthFt/2),p.eaveHeightFt);
      assert.equal(canopyHeight(tent,p,-widthFt/2,z),p.eaveHeightFt);
      assert.equal(canopyHeight(tent,p,widthFt/2,z),p.eaveHeightFt);
    }
    for(let x=-widthFt/2+.5;x<widthFt/2;x+=.7)for(let z=-lengthFt/2+.5;z<lengthFt/2;z+=.9){
      const h=canopyHeight(tent,p,x,z);assert.ok(Number.isFinite(h)&&h>p.eaveHeightFt&&h<=p.peakHeightFt,'every interior point belongs to a continuous raised membrane');
    }
  });
}
test('multiple crowns share elevated connecting fabric rather than isolated cones',()=>{
  const tent={type:'pole',widthFt:20,lengthFt:40},p=structuralProfile('pole',20,40),middle=canopyHeight(tent,p,0,0);
  assert.ok(middle>p.eaveHeightFt+(p.peakHeightFt-p.eaveHeightFt)*.8);assert.ok(middle<p.peakHeightFt);
});
test('frame and pop-up roof hips terminate at all four eaves',()=>{
  for(const type of ['frame','canopy']){
    const tent={type,widthFt:20,lengthFt:40},p=structuralProfile(type,20,40);
    assert.equal(canopyHeight(tent,p,0,0),p.peakHeightFt);assert.equal(canopyHeight(tent,p,0,20),p.eaveHeightFt);
    assert.ok(canopyHeight(tent,p,0,19)<canopyHeight(tent,p,0,11));
    assert.equal(canopyHeight(tent,p,10,0),p.eaveHeightFt);
  }
});
