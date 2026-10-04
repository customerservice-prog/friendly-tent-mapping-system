import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),context=vm.createContext({console}),cache=new Map();
const threeModule=new vm.SyntheticModule(Object.keys(THREE),function(){for(const key of Object.keys(THREE))this.setExport(key,THREE[key]);},{context});
function load(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
const rigModule=load(path.join(root,'js/ui/tent-setup3d.js'));
await rigModule.link((s,ref)=>s==='three'?threeModule:load(path.resolve(path.dirname(ref.identifier),s)));
await rigModule.evaluate();const {createTentSetupRig}=rigModule.namespace;
import {tentSetupSteps,setupFrame} from '../js/core/tent-setup-timeline.js';
import {structuralProfile} from '../js/data/tentStructure.js';
import {canopyHeight} from '../js/core/tent-canopy.js';
function source(tent){
  const group=new THREE.Group(),geo=new THREE.PlaneGeometry(tent.widthFt,tent.lengthFt,24,24).rotateX(-Math.PI/2),pos=geo.attributes.position,p=structuralProfile(tent.type,tent.widthFt,tent.lengthFt);
  for(let i=0;i<pos.count;i++)pos.setY(i,canopyHeight(tent,p,pos.getX(i),pos.getZ(i)));geo.computeVertexNormals();
  const roof=new THREE.Mesh(geo,new THREE.MeshStandardMaterial());roof.name='Continuous tensioned vinyl canopy';group.add(roof);return group;
}
function at(rig,id,fraction=1){const s=rig.userData.steps.find(s=>s.id===id);return rig.userData.update(s.start+s.seconds*fraction);}
function signature(rig){return Array.from(rig.getObjectByName('Fabric following the lifted supports').geometry.attributes.position.array);}
test('pole sequence includes corner support before center lifts and cloth removal before uprighting',()=>{
  const ids=tentSetupSteps({type:'pole'}).map(s=>s.id);
  for(const [a,b] of [['anchors','top'],['straps','corners'],['corners','center-angle'],['center-angle','cloth-away'],['cloth-away','center-up'],['sides','tension'],['tension','check']])assert.ok(ids.indexOf(a)<ids.indexOf(b));
  const steps=tentSetupSteps({type:'pole'});assert.ok(steps.at(-1).end>=80);assert.equal(setupFrame(steps,Infinity).time,steps.at(-1).end);assert.equal(setupFrame(steps,999).done,true);
});
test('real pole lengths are preserved, intermediate geometry moves, and seeking is deterministic',()=>{
  const tent={type:'pole',widthFt:30,lengthFt:60},real=source(tent),original=Array.from(real.children[0].geometry.attributes.position.array),rig=createTentSetupRig(tent,'stake',real);
  at(rig,'corners');assert.ok(rig.userData.supports.slice(0,4).every(s=>Math.abs(s.top.y-7)<.01));
  const samples=[];
  for(const phase of ['corners','center-angle','center-up','sides'])for(const frac of [.15,.4,.8,1]){
    at(rig,phase,frac);samples.push(signature(rig));
    for(const s of rig.userData.supports)assert.ok(Math.abs(s.top.distanceTo(s.bottom)-7)<.001,'side poles never shrink');
    for(const s of rig.userData.centers)assert.ok(Math.abs(s.top.distanceTo(s.bottom)-rig.userData.profile.peakHeightFt)<.001,'center poles never telescope');
  }
  assert.notDeepEqual(samples[0],samples[1]);at(rig,'center-angle',.45);const mid=signature(rig);at(rig,'tension');at(rig,'center-angle',.45);assert.deepEqual(signature(rig),mid);
  at(rig,'tension');const final=signature(rig);assert.ok(final.every((v,i)=>Math.abs(v-original[i])<.001),'completed cloth matches event tent');
  assert.deepEqual(Array.from(real.children[0].geometry.attributes.position.array),original,'event roof is never changed');
  assert.notEqual(rig.getObjectByName('Fabric following the lifted supports').geometry,real.children[0].geometry);
});
test('frame lifts its first side above ground and preserves every beam length during the second lift',()=>{
  const tent={type:'frame',widthFt:20,lengthFt:30},rig=createTentSetupRig(tent,'ballast',source(tent)),lengths=[];
  for(const phase of ['frame-first','frame-second'])for(const f of [0,.25,.5,.75,1]){
    at(rig,phase,f);const beam=rig.getObjectByName('Assembled roof tubing'),matrix=new THREE.Matrix4(),scale=new THREE.Vector3(),sample=[];
    for(let i=0;i<beam.count;i++){beam.getMatrixAt(i,matrix);scale.setFromMatrixScale(matrix);sample.push(scale.y);}
    if(lengths.length)for(let i=0;i<sample.length;i++)assert.ok(Math.abs(sample[i]-lengths[i])<.001);else lengths.push(...sample);
    assert.ok(rig.userData.supports.every(s=>s.top.y>=.27));
  }
  at(rig,'frame-first');assert.ok(rig.userData.supports.filter(s=>s.top.x>0).every(s=>s.top.y>6.8));
  at(rig,'frame-second');assert.ok(rig.userData.supports.every(s=>Math.abs(s.top.y-7)<.01));
});
test('all inventory styles remain finite at arbitrary seeks with bounded geometry and adult crew',()=>{
  for(const type of ['pole','frame','canopy'])for(const [widthFt,lengthFt] of [[10,20],[20,20],[30,45],[40,100]]){
    const tent={type,widthFt,lengthFt},rig=createTentSetupRig(tent,'stake',source(tent));
    for(const f of [.0,.11,.35,.58,.79,1,.3]){
      rig.userData.update(rig.userData.duration*f);rig.updateMatrixWorld(true);let draws=0;
      rig.traverse(o=>{if(!o.isMesh)return;draws++;assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));assert.ok(o.matrixWorld.elements.every(Number.isFinite));if(o.isInstancedMesh)assert.ok(Array.from(o.instanceMatrix.array).every(Number.isFinite));});
      assert.ok(draws<180,`${type}: ${draws} draw calls`);
    }
    const crew=rig.userData.crew;crew.userData.pose(0,new THREE.Vector3(),new THREE.Vector3(0,0,1),'walk',0);const bounds=new THREE.Box3().setFromObject(crew.userData.workers[0].person);assert.ok(bounds.max.y>5&&bounds.max.y<6.5);
  }
});
test('walls follow the selected panels and own their geometry and material',()=>{
  const tent={type:'pole',widthFt:20,lengthFt:20},real=source(tent),walls=new THREE.Group(),panel=new THREE.Group();walls.name='Sidewalls';panel.add(new THREE.Mesh(new THREE.BoxGeometry(10,6,.04),new THREE.MeshStandardMaterial()));walls.add(panel);real.add(walls);
  const rig=createTentSetupRig(tent,'stake',real,{sidewalls:true}),copies=rig.getObjectByName('Selected sidewalls being clipped');
  assert.equal(copies.children.length,1);at(rig,'walls',.5);assert.ok(copies.children[0].scale.y>0&&copies.children[0].scale.y<1);assert.equal(panel.scale.y,1);assert.notEqual(copies.children[0].children[0].geometry,panel.children[0].geometry);assert.notEqual(copies.children[0].children[0].material,panel.children[0].material);
});
