// Export production meshes for rasterize-equipment.py. This offline asset renderer
// checks geometry, not WebGL materials, shadows or the full event scene.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),dom=new JSDOM('<!doctype html><body></body>');
global.document=dom.window.document;
(async()=>{
 const threePath=require.resolve('three').replace('/build/three.cjs','/build/three.module.js'),THREE=await import(require('node:url').pathToFileURL(threePath));
 const context=vm.createContext({console,document:{createElement(tag){if(tag==='canvas')return{width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})};return dom.window.document.createElement(tag);}}}),cache=new Map();
 const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const key of Object.keys(THREE))this.setExport(key,THREE[key]);},{context});
 function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
 async function load(file){const m=moduleFor(file);if(m.status==='unlinked')await m.link((s,ref)=>s==='three'?three:moduleFor(s.startsWith('three/addons/')?path.resolve(path.dirname(threePath),'../examples/jsm',s.slice(13)):path.resolve(path.dirname(ref.identifier),s)));return m;}
 const equipment=await load(path.join(root,'js/ui/equipment3d.js'));await equipment.evaluate();
 const chairDefs=(await load(path.join(root,'js/data/chairs.js'))).namespace.CHAIRS,tableDefs=(await load(path.join(root,'js/data/tables.js'))).namespace.TABLES;
 const view=await load(path.join(root,'js/ui/view3d.js'));await view.evaluate();
 const objects=chairDefs.map(d=>[d.id,equipment.namespace.makeChair(d)]);
 for(const t of tableDefs)objects.push([t.id,equipment.namespace.makeTable({id:t.id,tableId:t.id,shape:t.shape,widthFt:t.diameterFt||t.widthFt,depthFt:t.diameterFt||t.depthFt,seatCount:0})]);
 objects.push(['round-linen',equipment.namespace.makeTable({id:'linen',tableId:'round-5ft',shape:'round',widthFt:5,depthFt:5,seatCount:0,linenId:'linen-round-120',linenColor:'White'})]);
 objects.push(['cocktail-linen',equipment.namespace.makeTable({id:'cocktail',tableId:'cocktail',shape:'round',widthFt:2.5,depthFt:2.5,seatCount:0,linenId:'linen-cocktail-cover',linenColor:'White'})]);
 const sections=Array.from({length:4},(_,i)=>({id:'d'+i,x:(i%2)*3,y:Math.floor(i/2)*3,widthFt:3,depthFt:3}));
 objects.push(['dance-floor',equipment.namespace.makeDanceFloor(sections,{widthFt:6,lengthFt:6})]);
 for(const id of ['lighting-bistro','lighting-chandelier','lighting-uplight-single'])objects.push([id,view.namespace.makeLighting({type:'frame',widthFt:8,lengthFt:8},id)]);
 for(const [id,object] of objects){
  object.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(object),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),radius=size.length();
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,Math.max(100,radius*10));camera.position.copy(center).add(new THREE.Vector3(1.1,.8,1.4).multiplyScalar(radius));camera.lookAt(center);camera.updateMatrixWorld(true);
  const corners=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  const width=Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x)),height=Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y));
  const extent=Math.max(height,width*.75)*.58;camera.left=-extent*4/3;camera.right=extent*4/3;camera.top=extent;camera.bottom=-extent;camera.updateProjectionMatrix();
  const faces=[];
  object.traverse(o=>{
   if(!o.isMesh)return;
   const geometry=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
   geometry.applyMatrix4(o.matrixWorld);
   const pos=geometry.attributes.position,norm=geometry.attributes.normal,normalMatrix=new THREE.Matrix3().getNormalMatrix(camera.matrixWorldInverse);
   const color=o.material.name==='Wood tabletop'?'b99165':o.material.color.getHexString();
   for(let i=0;i<pos.count;i+=3){const triangle=[];
    for(let j=0;j<3;j++){
     const v=new THREE.Vector3().fromBufferAttribute(pos,i+j).applyMatrix4(camera.matrixWorldInverse);
     const n=new THREE.Vector3().fromBufferAttribute(norm,i+j).applyMatrix3(normalMatrix).normalize();
     triangle.push([v.x/extent*.75,v.y/extent,-v.z,n.x,n.y,n.z]);
    }
    faces.push({v:triangle,color});
   }
   geometry.dispose();
  });
  const output=process.env.RENTSKETCH_PREVIEW_DIR || '/tmp/rentsketch-models';fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,id+'.json'),JSON.stringify(faces));
  console.log(id+': '+faces.length+' triangles');
 }
 dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
