import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../js/core/layoutStore.js',import.meta.url),'utf8');
const {createLayoutStore}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('photo tent, rental movement and obstacles share an ordered undo timeline',()=>{
 let context={photoTentPlacement:null,photoGeometry:[]};let editable=true;
 const store=createLayoutStore({tentId:'pole-20x20',objects:[{id:'table',x:2,y:3,photoPlacement:{x:22,y:23}}],zones:[],aisles:[]},{captureContext:()=>context,restoreContext:value=>{context=value;},canMutate:()=>editable});
 store.commitContext({...context,photoTentPlacement:{x:12,y:14,rotationDeg:30}});
 store.updateObject('table',{photoPlacement:{x:27,y:29}});
 const obstacle={id:'tree1',type:'tree',x:8,y:8,widthFt:4,depthFt:4};
 store.commitContext({...context,photoGeometry:[obstacle]});
 obstacle.x=99;assert.equal(context.photoGeometry[0].x,8,'history clones incoming geometry');
 assert.ok(store.undo());assert.deepEqual(context.photoGeometry,[]);assert.deepEqual(store.getState().objects[0].photoPlacement,{x:27,y:29});
 assert.ok(store.undo());assert.deepEqual(store.getState().objects[0].photoPlacement,{x:22,y:23});assert.equal(context.photoTentPlacement.rotationDeg,30);
 assert.ok(store.undo());assert.equal(context.photoTentPlacement,null);assert.equal(store.canUndo(),false);
 assert.ok(store.redo());assert.equal(context.photoTentPlacement.x,12);assert.ok(store.redo());assert.deepEqual(store.getState().objects[0].photoPlacement,{x:27,y:29});assert.ok(store.redo());assert.equal(context.photoGeometry.length,1);
 editable=false;const before=JSON.stringify({context,layout:store.getState()});assert.equal(store.commitContext({...context,photoTentPlacement:{x:90,y:90}}),false);assert.equal(store.undo(),false);store.updateObject('table',{x:99});assert.equal(JSON.stringify({context,layout:store.getState()}),before,'context and legacy edits preserve permission guard');
 editable=true;context={photoTentPlacement:{x:3,y:5,rotationDeg:0},photoGeometry:[]};store.reset({tentId:'pole-20x20',objects:[],zones:[],aisles:[]});assert.equal(store.canUndo(),false,'restored design starts a fresh history');assert.equal(store.canRedo(),false);
 store.commitContext({...context,photoGeometry:[{id:'restored-obstacle',x:1}]});store.undo();assert.deepEqual(context,{photoTentPlacement:{x:3,y:5,rotationDeg:0},photoGeometry:[]},'restored context is the baseline');
});

test('unchanged or cancelled photo placement does not create history',()=>{
 let context={photoTentPlacement:{x:10,y:11,rotationDeg:0},photoGeometry:[]};
 const store=createLayoutStore(null,{captureContext:()=>context,restoreContext:value=>{context=value;}});
 store.commitContext(JSON.parse(JSON.stringify(context)));assert.equal(store.canUndo(),false);
 const cancelledPreview={...context.photoTentPlacement,x:99};assert.equal(cancelledPreview.x,99);assert.equal(store.canUndo(),false);assert.equal(context.photoTentPlacement.x,10,'pointer-cancelled preview is not committed');
});
