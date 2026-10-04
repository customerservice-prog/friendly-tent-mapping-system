import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTentSetupRig} from '../js/ui/tent-setup3d.js';

function fakeSource(tent,eave,peak){
  const g=new THREE.Group(),geo=new THREE.BufferGeometry();
  const hw=tent.widthFt/2,hl=tent.lengthFt/2;
  geo.setAttribute('position',new THREE.Float32BufferAttribute([
    -hw,eave,-hl, hw,eave,-hl, hw,eave,hl, -hw,eave,hl,
    0,peak,0
  ],3));
  geo.setIndex([0,1,4,1,2,4,2,3,4,3,0,4]);geo.computeVertexNormals();
  const roof=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0xffffff}));
  roof.name='Continuous tensioned vinyl canopy';g.add(roof);return g;
}
function finiteRig(rig){
  let meshes=0;
  rig.traverse(o=>{
    if(!o.isMesh)return;meshes++;
    const p=o.geometry?.attributes?.position?.array;
    if(p)assert.ok(Array.from(p).every(Number.isFinite),o.name||'setup mesh has finite positions');
    assert.ok(o.matrix.elements.every(Number.isFinite),o.name||'setup mesh has finite transform');
  });
  assert.ok(meshes>10,'setup rig contains physical geometry, not only labels');
}
test('Classic pole setup rig follows prestake/top/pole/center sequence',()=>{
  const tent={id:'pole-20x20',type:'pole',widthFt:20,lengthFt:20,installationClearanceFt:5,centerPoles:[{x:10,y:10}]};
  const source=fakeSource(tent,8,15.8),rig=createTentSetupRig(tent,'stake',source),groups=rig.userData.groups;
  for(const key of ['measure','layout','pole-top-folded','top-ground','ratchets-loose','poles-staged','center-assembled','center-angled','center-up','corner-poles','side-poles','pole-tension','anchors'])assert.ok(groups[key],key+' stage exists');
  assert.ok(groups.measure.children.some(o=>o.name==='Tent crew worker'),'measurement stage shows crew');
  assert.ok(groups.layout.children.some(o=>o.name==='Tent crew worker'),'pre-stake stage shows crew');
  assert.ok(groups['top-ground'].getObjectByName('Protective drop cloth'),'top is protected by a drop cloth');
  assert.ok(groups['pole-top-folded'].getObjectByName('Folded tent top'),'folded top is shown before it is opened');
  assert.ok(groups['ratchets-loose'].getObjectByName('Loose ratchet strap'),'loose ratchet stage is modeled before raising');
  assert.ok(groups['center-assembled'].getObjectByName('Center pole assembled on ground'),'center pole is assembled before lifting');
  assert.ok(groups['center-angled'].getObjectByName('Tent top during installation'),'center-pole stage visibly lifts the top');
  assert.ok(groups['corner-poles'].children.some(o=>o.isMesh),'corner poles are a distinct stage');
  assert.ok(groups['side-poles'].children.some(o=>o.isMesh),'remaining side poles are a distinct stage');
  rig.userData.show('center-angled');assert.equal(groups['center-angled'].visible,true);assert.equal(groups.layout.visible,false);
  finiteRig(rig);
});
test('Master frame setup rig builds low frame, covers it, then lifts one side before full height',()=>{
  const tent={id:'frame-20x20',type:'frame',widthFt:20,lengthFt:20,installationClearanceFt:5,centerPoles:[]};
  const source=fakeSource(tent,8,15.5),rig=createTentSetupRig(tent,'ballast',source),groups=rig.userData.groups;
  for(const key of ['measure','layout','frame-parts','frame-crown','frame-perimeter','frame-top','frame-top-folded','frame-top-half','frame-covered','frame-strapped','frame-one-side','frame-raised','anchors'])assert.ok(groups[key],key+' stage exists');
  assert.ok(groups['frame-crown'].getObjectByName('Frame crown fitting'),'frame crown and hip rafters have their own step');
  assert.ok(groups['frame-top-folded'].getObjectByName('Folded tent top'),'frame top is staged folded before pulling');
  assert.ok(groups['frame-top-half'].getObjectByName('Tent top halfway pulled across frame'),'frame top has a halfway-across state');
  assert.ok(groups['frame-covered'].getObjectByName('Protective drop cloth'),'frame top is pulled over a protected low frame');
  assert.ok(groups['frame-strapped'].getObjectByName('Tent top perimeter strap'),'top straps are visible before the frame is raised');
  assert.ok(groups['frame-one-side'].getObjectByName('Frame top tilted for first-side leg install'),'one whole side is lifted before the opposite side');
  assert.ok(groups['frame-raised'].getObjectByName('Raised frame top'),'frame reaches full height only after both sides are raised');
  finiteRig(rig);
});
