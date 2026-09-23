// Exports real RentSketch scene geometry for the offline marketing poster.
// NODE_PATH=tests/node_modules node --experimental-vm-modules scripts/export-marketing-scene.cjs
// This asset render is not a browser WebGL test.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=process.env.RENTSKETCH_SCENE_DIR||'/tmp/rentsketch-hero';fs.mkdirSync(out,{recursive:true});
 const threePath=require.resolve('three').replace('/build/three.cjs','/build/three.module.js'),THREE=await import(require('node:url').pathToFileURL(threePath));
 const dom=new JSDOM('<!doctype html><div id="scene"></div>',{pretendToBeVisual:true}),w=dom.window;
 w.HTMLCanvasElement.prototype.getContext=function(){const canvas=this,ctx={fillStyle:'',createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),fillRect(){if(!canvas._baseColor&&/^#[0-9a-f]{3,6}$/i.test(ctx.fillStyle))canvas._baseColor=ctx.fillStyle;}};return new Proxy(ctx,{get:(t,k)=>t[k]||(()=>{}),set:(t,k,v)=>(t[k]=v,true)});};w.matchMedia=()=>({matches:false});
 const container=w.document.getElementById('scene');Object.defineProperties(container,{clientWidth:{value:1440},clientHeight:{value:1000}});
 let renderer;
 class Renderer{constructor(){renderer=this;this.domElement=w.document.createElement('canvas');this.shadowMap={};}setPixelRatio(){}setSize(){}render(scene,camera){this.scene=scene;this.camera=camera;}dispose(){}}
 class Controls{constructor(camera){this.camera=camera;this.target=new THREE.Vector3();this.touches={};}addEventListener(){}update(){this.camera.lookAt(this.target);this.camera.updateMatrixWorld(true);}dispose(){}}
 class PMREM{fromScene(){return{texture:new THREE.Texture(),dispose(){}};}dispose(){}}
 const context=vm.createContext({console,document:w.document,window:w,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){},performance:{now:()=>0}}),cache=new Map();
 const overrides={WebGLRenderer:Renderer,PMREMGenerator:PMREM};
 const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const k of Object.keys(THREE))this.setExport(k,overrides[k]||THREE[k]);},{context});
 const orbit=new vm.SyntheticModule(['OrbitControls'],function(){this.setExport('OrbitControls',Controls);},{context});
 function get(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
 async function load(file){const m=get(file);if(m.status==='unlinked')await m.link((s,r)=>s==='three'?three:s.endsWith('/OrbitControls.js')?orbit:get(s.startsWith('three/addons/')?path.resolve(path.dirname(threePath),'../examples/jsm',s.slice(13)):path.resolve(path.dirname(r.identifier),s)));if(m.status!=='evaluated')await m.evaluate();return m.namespace;}
 const data=await load(path.join(root,'js/data/marketing-reception.js')),mod=await load(path.join(root,'js/ui/view3d.js'));
 const view=mod.init(container,{marketingOnly:true,registerActive:false});view.rebuild(data.marketingReception());view.setScene({motion:false,guests:false,styling:true,night:false});view.setMarketingProgress(1);
 renderer.scene.updateMatrixWorld(true);
 const groups=new Map();let meshes=0;
 renderer.scene.traverse(o=>{
  if(!o.isMesh)return;for(let parent=o;parent;parent=parent.parent)if(!parent.visible)return;
  if(Array.isArray(o.material))throw Error('Add support for multi-material mesh');
  const mat=o.material,geometry=o.geometry,pos=geometry.attributes.position,norm=geometry.attributes.normal;
  if(!pos||!norm)return;
  let g=groups.get(mat.uuid);if(!g){const col=mat.color.clone();if(mat.map?.image?._baseColor)col.multiply(new THREE.Color(mat.map.image._baseColor));g={color:col.toArray(),roughness:mat.roughness??.7,metalness:mat.metalness||0,emissive:mat.emissive?.toArray()||[0,0,0],emission:mat.emissiveIntensity||0,positions:[],normals:[],indices:[]};groups.set(mat.uuid,g);}
  const copies=o.isInstancedMesh?o.count:1;
  for(let k=0;k<copies;k++){
   const m=o.matrixWorld.clone();if(o.isInstancedMesh){const inst=new THREE.Matrix4();o.getMatrixAt(k,inst);m.multiply(inst);}const n=new THREE.Matrix3().getNormalMatrix(m),offset=g.positions.length/3;
   for(let j=0;j<pos.count;j++){g.positions.push(...new THREE.Vector3().fromBufferAttribute(pos,j).applyMatrix4(m).toArray());g.normals.push(...new THREE.Vector3().fromBufferAttribute(norm,j).applyMatrix3(n).normalize().toArray());}
   if(geometry.index){for(const j of geometry.index.array)g.indices.push(j+offset);}else for(let j=0;j<pos.count;j++)g.indices.push(j+offset);meshes++;
  }
 });
 const materials=[];let total=0;
 for(const g of groups.values()){
  const i=materials.length,count=g.positions.length/3,faces=g.indices.length/3;total+=faces;
  const header=Buffer.from(`ply\nformat binary_little_endian 1.0\nelement vertex ${count}\nproperty float x\nproperty float y\nproperty float z\nproperty float nx\nproperty float ny\nproperty float nz\nelement face ${faces}\nproperty list uchar int vertex_indices\nend_header\n`);
  const buf=Buffer.alloc(count*24+faces*13);let p=0;
  for(let v=0;v<count;v++)for(const a of [g.positions,g.normals])for(let d=0;d<3;d++){buf.writeFloatLE(a[v*3+d],p);p+=4;}
  for(let f=0;f<faces;f++){buf.writeUInt8(3,p++);for(let d=0;d<3;d++){buf.writeUInt32LE(g.indices[f*3+d],p);p+=4;}}
  const filename=`mesh-${i}.ply`;fs.writeFileSync(path.join(out,filename),Buffer.concat([header,buf]));
  materials.push({filename,color:g.color,roughness:g.roughness,metalness:g.metalness,emissive:g.emissive,emission:g.emission});
 }
 fs.writeFileSync(path.join(out,'scene.json'),JSON.stringify({materials,camera:{position:renderer.camera.position.toArray(),target:[-3.2,2.2,-10.8],fov:renderer.camera.fov},total}));
 console.log(`Exported ${total} triangles from ${meshes} model instances into ${materials.length} material batches.`);view.destroy();dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
