import test from 'node:test';
import assert from 'node:assert/strict';
import {installPhotoProjectionParity} from '../js/ui/photo-projection-renderer.js';

test('photo projection reverses raster front-face parity only for photo camera draws',()=>{
  const calls=[],material={},state={setMaterial(m,clockwise){calls.push({m,clockwise});}},originalSet=state.setMaterial;
  const renderer={state,renderBufferDirect(camera,reflection=false){state.setMaterial(material,reflection);return 'draw';}},originalDraw=renderer.renderBufferDirect;
  const restore=installPhotoProjectionParity(renderer),photo={userData:{photoProjection:{mirrored:true}}},model={userData:{}},shadow={isOrthographicCamera:true};
  assert.equal(renderer.renderBufferDirect(photo),'draw');assert.equal(calls.at(-1).clockwise,true,'front-sided surfaces are culled using reflected projection parity');
  renderer.renderBufferDirect(photo,true);assert.equal(calls.at(-1).clockwise,false,'an already reflected mesh cancels camera reflection');
  assert.equal(state.setMaterial,originalSet,'no state wrapper leaks beyond the draw');
  renderer.renderBufferDirect(shadow);assert.equal(calls.at(-1).clockwise,false,'shadow map projection is unchanged');
  renderer.renderBufferDirect(model);assert.equal(calls.at(-1).clockwise,false,'Photo to model returns to normal parity');
  restore();assert.equal(renderer.renderBufferDirect,originalDraw);
});
test('a failed photo draw restores the renderer state',()=>{
  const state={setMaterial(){}},original=state.setMaterial,renderer={state,renderBufferDirect(){throw new Error('draw failed');}};
  installPhotoProjectionParity(renderer);assert.throws(()=>renderer.renderBufferDirect({userData:{photoProjection:{mirrored:true}}}),/draw failed/);assert.equal(state.setMaterial,original);
});

test('fullscreen photograph background keeps its own clip-space winding',()=>{
  const calls=[],state={setMaterial(m,cw){calls.push(cw);}},renderer={state,renderBufferDirect(camera,scene,geometry,material){state.setMaterial(material,false);}};
  installPhotoProjectionParity(renderer);renderer.renderBufferDirect({userData:{photoProjection:{mirrored:true}}},null,null,{name:'BackgroundMaterial'});assert.equal(calls.at(-1),false);
});

test('manual foreground clip-space pixels keep winding while rental geometry is mirrored',()=>{
 const calls=[],state={setMaterial(m,cw){calls.push(cw);}},renderer={state,renderBufferDirect(camera,scene,geometry,material){state.setMaterial(material,false);}};
 installPhotoProjectionParity(renderer);const photo={userData:{photoProjection:{mirrored:true}}};
 renderer.renderBufferDirect(photo,null,null,{userData:{photoClipSpace:true}});assert.equal(calls.at(-1),false);
 renderer.renderBufferDirect(photo,null,null,{name:'Rental fabric'});assert.equal(calls.at(-1),true);
});
