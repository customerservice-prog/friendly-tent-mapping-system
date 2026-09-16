// RentSketch Visual Engine 2.1 — supplier-informed event tent renderer
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { byId as chairById } from '../data/chairs.js';
import { byId as tableById } from '../data/tables.js';
import { byId as lightingById } from '../data/lighting.js';

let renderer,scene,camera,controls,container,root,raycaster,resizeObserver,raf,currentData,currentTent;
let callbacks={},night=false,dragging=false,dragTarget=null,dragStart=new THREE.Vector3(),dragX=0,dragY=0,dragMoved=false;
let sun,hemi,ambient,groundMat,lightRigs=[];
const plane=new THREE.Plane(new THREE.Vector3(0,1,0),0), mats={};
const EAVE_POLE=7, EAVE_FRAME=8;
function material(k,o){if(!mats[k])mats[k]=new THREE.MeshStandardMaterial(o);return mats[k];}
const vinyl=()=>material('vinyl',{color:0xfffdf5,roughness:.68,metalness:0,side:THREE.DoubleSide,transparent:true,opacity:.97});
const steel=()=>material('steel',{color:0xaab2b5,roughness:.32,metalness:.72});
const dark=()=>material('dark',{color:0x34383a,roughness:.42,metalness:.55});
const plastic=()=>material('plastic',{color:0xf7f7f2,roughness:.48,metalness:.01});
const gold=()=>material('gold',{color:0xc89b3c,roughness:.26,metalness:.7});
function box(w,h,d,m){const x=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);x.castShadow=x.receiveShadow=true;return x;}
function cyl(r,h,m,n=12){const x=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,n),m);x.castShadow=true;return x;}
function shadow(g){g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return g;}
function line(a,b,color=0x252525){return new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color}));}

function chair(id){const d=chairById(id)||{},type=d.silhouette||'folding',g=new THREE.Group(),w=d.seatWidthFt||1.5,dep=d.seatDepthFt||1.45,m=type==='chiavari'||type==='throne'?gold():plastic();
 const seat=box(w*.84,.12,dep*.72,type==='chiavari'?material('cushion',{color:0xf5efe4,roughness:.82}):m);seat.position.y=.94;g.add(seat);
 if(type==='chiavari'){[-.34,.34].forEach(x=>{const p=cyl(.035,2.0,m,8);p.position.set(x*w,1.75,-dep*.34);g.add(p);});for(let i=-2;i<=2;i++){const p=cyl(.018,1.22,m,6);p.position.set(i*w*.12,1.62,-dep*.34);g.add(p);}const top=box(w*.78,.08,.07,m);top.position.set(0,2.72,-dep*.34);g.add(top);}else{const back=box(w*.8,type==='throne'?2.7:1.18,type==='throne'?.18:.1,m);back.position.set(0,type==='throne'?2.25:1.62,-dep*.35);g.add(back);}
 const lm=type==='resin'?m:dark();[-1,1].forEach(ix=>[-1,1].forEach(iz=>{const l=cyl(.035,1.05,lm,8);l.position.set(ix*w*.34,.5,iz*dep*.29);l.rotation.z=ix*.055;l.rotation.x=iz*.055;g.add(l);}));return shadow(g);}
function linenColor(id){const s=String(id||'').toLowerCase();if(s.includes('black'))return 0x202225;if(s.includes('ivory')||s.includes('champ'))return 0xeee2c6;if(s.includes('navy'))return 0x243654;if(s.includes('red'))return 0x8d2f32;return 0xfaf8f2;}
function table(item){const g=new THREE.Group(),def=tableById(item.tableId)||{},round=item.shape==='round'||String(def.silhouette||'').includes('round'),topY=String(def.silhouette||'').includes('cocktail')?3.5:2.45,lm=new THREE.MeshStandardMaterial({color:linenColor(item.linenId),roughness:.9,side:THREE.DoubleSide}),r=round?item.widthFt/2:Math.max(item.widthFt,item.depthFt)/2;
 if(round){const skirt=new THREE.Mesh(new THREE.CylinderGeometry(r,r*.96,topY-.08,40,1,true),lm);skirt.position.y=(topY-.08)/2;g.add(skirt);const top=cyl(r,.1,lm,40);top.position.y=topY;g.add(top);}else{const skirt=box(item.widthFt,topY-.1,item.depthFt,lm);skirt.position.y=(topY-.1)/2;g.add(skirt);}
 const n=item.seatCount||0,cr=r+1.05;for(let i=0;i<n;i++){const a=i/n*Math.PI*2,c=chair(item.chairId);c.position.set(Math.cos(a)*cr,0,Math.sin(a)*cr);c.rotation.y=-a-Math.PI/2;g.add(c);}return shadow(g);}
function dance(item){const g=new THREE.Group(),w=item.widthFt||3,d=item.depthFt||3;baseFloor(g,w,d);return g;}
function baseFloor(g,w,d){const base=box(w,.12,d,dark());base.position.y=.06;g.add(base);const panel=3,tileMat=material('dancewood',{color:0xc69a66,roughness:.48});for(let x=-w/2;x<w/2;x+=panel)for(let z=-d/2;z<d/2;z+=panel){const pw=Math.min(panel,w-(x+w/2)),pd=Math.min(panel,d-(z+d/2)),p=box(pw-.045,.06,pd-.045,tileMat);p.position.set(x+pw/2,.15,z+pd/2);g.add(p);}}

function peakHeight(t){const w=t.widthFt;if(t.type==='pole')return EAVE_POLE+Math.max(6,Math.min(10,w*.38));return EAVE_FRAME+Math.max(3,Math.min(6,w*.18));}
function polePeakStations(t){const L=t.lengthFt,stations=(t.centerPoles||[]).map(p=>p.y-L/2);if(stations.length)return stations;return [0];}
function roofGeometry(t){const W=t.widthFt,L=t.lengthFt,e=t.type==='pole'?EAVE_POLE:EAVE_FRAME,peak=peakHeight(t),sx=Math.max(20,Math.round(W)),sz=Math.max(24,Math.round(L)),geo=new THREE.PlaneGeometry(W,L,sx,sz),a=geo.attributes.position,stations=polePeakStations(t);
 for(let i=0;i<a.count;i++){const x=a.getX(i),z=a.getY(i),cross=Math.max(0,1-Math.abs(x)/(W/2)),y0;
  if(t.type==='pole'){
   let along=0;for(const s of stations){const dz=Math.abs(z-s),influence=Math.max(0,1-dz/Math.max(8,L/(stations.length+1)));along=Math.max(along,Math.pow(influence,1.55));}
   const ridge=.34+.66*along;const tension=Math.pow(cross,.72);y0=e+(peak-e)*tension*ridge;
  }else if(t.type==='canopy'){y0=e+(peak-e)*Math.pow(cross,.82);}else{y0=e+(peak-e)*Math.pow(cross,.9);}
  // keep a crisp straight eave while preserving a tensioned high-peak membrane
  if(Math.abs(x)>W*.485)y0=e;a.setZ(i,y0);
 }
 geo.rotateX(-Math.PI/2);geo.computeVertexNormals();return geo;}
function perimeterPositions(t){const W=t.widthFt,L=t.lengthFt,hw=W/2,hl=L/2,out=[];const spacing=10;for(let x=-hw;x<=hw+.01;x+=spacing){out.push([Math.min(x,hw),-hl],[Math.min(x,hw),hl]);}if(out[out.length-2]?.[0]!==hw)out.push([hw,-hl],[hw,hl]);for(let z=-hl+spacing;z<hl;z+=spacing)out.push([-hw,z],[hw,z]);return out;}
function tent(t,anchor){const g=new THREE.Group(),hw=t.widthFt/2,hl=t.lengthFt/2,e=t.type==='pole'?EAVE_POLE:EAVE_FRAME,roof=new THREE.Mesh(roofGeometry(t),vinyl());roof.castShadow=roof.receiveShadow=true;g.add(roof);
 const pp=perimeterPositions(t);pp.forEach(([x,z])=>{const p=cyl(.085,e,steel(),10);p.position.set(x,e/2,z);g.add(p);});
 if(t.type==='pole'){(t.centerPoles||[]).forEach(p=>{const h=peakHeight(t),cp=cyl(.12,h,steel(),12);cp.position.set(p.x-hw,h/2,p.y-hl);g.add(cp);});}
 if(t.type==='frame'){
  // visible aluminum eave frame and roof rafters; no interior center poles
  [[-hw,-hl,hw,-hl],[hw,-hl,hw,hl],[hw,hl,-hw,hl],[-hw,hl,-hw,-hl]].forEach(s=>g.add(tubeBetween(new THREE.Vector3(s[0],e,s[1]),new THREE.Vector3(s[2],e,s[3]),.055,steel())));
  for(let z=-hl;z<=hl+.01;z+=10){g.add(tubeBetween(new THREE.Vector3(-hw,e,Math.min(z,hl)),new THREE.Vector3(0,peakHeight(t),Math.min(z,hl)),.045,steel()));g.add(tubeBetween(new THREE.Vector3(0,peakHeight(t),Math.min(z,hl)),new THREE.Vector3(hw,e,Math.min(z,hl)),.045,steel()));}
 }
 // narrow white valance, not a heavy scalloped wall
 const vm=material('valance',{color:0xfffdf8,roughness:.82});[[0,-hl,t.widthFt,.42],[0,hl,t.widthFt,.42],[-hw,0,.42,t.lengthFt],[hw,0,.42,t.lengthFt]].forEach(v=>{const q=box(v[2],.42,v[3],vm);q.position.set(v[0],e-.2,v[1]);g.add(q);});
 if(anchor){const clearance=t.installationClearanceFt||5;pp.filter((_,i)=>i%2===0).forEach(([x,z])=>{const dx=Math.abs(x)>hw*.8?Math.sign(x):0,dz=Math.abs(z)>hl*.8?Math.sign(z):0;if(!dx&&!dz)return;const ox=x+dx*clearance,oz=z+dz*clearance;if(anchor==='ballast'){const b=box(1.35,.72,1.35,material('concrete',{color:0x929493,roughness:.98}));b.position.set(ox,.36,oz);g.add(b);g.add(line(new THREE.Vector3(x,e*.72,z),new THREE.Vector3(ox,.7,oz),0x222222));}else{g.add(line(new THREE.Vector3(x,e*.72,z),new THREE.Vector3(ox,.12,oz),0x202020));const st=cyl(.045,1.05,dark(),8);st.position.set(ox,.35,oz);st.rotation.z=.25;g.add(st);}});}
 return shadow(g);}
function tubeBetween(a,b,r,m){const d=new THREE.Vector3().subVectors(b,a),len=d.length(),x=cyl(r,len,m,8);x.position.copy(a).add(b).multiplyScalar(.5);x.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return x;}
function grass(){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#789c5d';x.fillRect(0,0,256,256);for(let i=0;i<7000;i++){const v=60+Math.random()*70;x.fillStyle=`rgba(${v*.55},${v},${v*.38},.18)`;x.fillRect(Math.random()*256,Math.random()*256,1,2);}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(14,14);return t;}
function ground(t){groundMat=new THREE.MeshStandardMaterial({color:0xffffff,map:grass(),roughness:1});const p=new THREE.Mesh(new THREE.PlaneGeometry(t.widthFt+90,t.lengthFt+90),groundMat);p.rotation.x=-Math.PI/2;p.receiveShadow=true;return p;}

function addBistro(t,visual){const rigs=[],hw=t.widthFt/2,hl=t.lengthFt/2,e=t.type==='pole'?EAVE_POLE:EAVE_FRAME,peak=peakHeight(t),runs=[];
 if(visual==='perimeter-swag'||visual==='perimeter-strand')runs.push([[-hw,e,-hl],[hw,e,-hl]],[[hw,e,-hl],[hw,e,hl]],[[hw,e,hl],[-hw,e,hl]],[[-hw,e,hl],[-hw,e,-hl]]);
 else if(t.type==='pole'){
  const stations=polePeakStations(t);stations.forEach(z=>{runs.push([[-hw,e,-hl],[0,peak,z]],[[hw,e,-hl],[0,peak,z]],[[-hw,e,hl],[0,peak,z]],[[hw,e,hl],[0,peak,z]]);});
 }else{for(let z=-hl;z<=hl+.01;z+=10)runs.push([[-hw,e,Math.min(z,hl)],[hw,e,Math.min(z,hl)]]);}
 runs.forEach(run=>{const A=new THREE.Vector3(...run[0]),B=new THREE.Vector3(...run[1]),dist=A.distanceTo(B),steps=Math.max(2,Math.round(dist)),pts=[];for(let i=0;i<=steps;i++){const q=i/steps,p=A.clone().lerp(B,q);p.y-=Math.sin(Math.PI*q)*Math.min(.55,dist*.025);pts.push(p);}root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x27231f})));
  // roughly one-foot visual spacing, with only a few real lights for performance
  for(let i=1;i<pts.length;i++){const bm=new THREE.MeshStandardMaterial({color:0xffe6ad,emissive:0xffb85a,emissiveIntensity:night?1.65:.08,roughness:.3}),b=new THREE.Mesh(new THREE.SphereGeometry(.075,8,8),bm);b.position.copy(pts[i]);b.position.y-=.08;root.add(b);let l=null;if(night&&i%6===0){l=new THREE.PointLight(0xffc06b,1.45,12,2);l.position.copy(b.position);l.position.y-=.15;root.add(l);}rigs.push({b,l});}
 });return rigs;}
function ring(item,color){const g=new THREE.Group(),w=item.widthFt+.8,d=item.depthFt+.8,pts=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2],[-w/2,-d/2]].map(p=>new THREE.Vector3(p[0],.08,p[1]));g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color})));return g;}
function clear(){if(!root)return;while(root.children.length){const c=root.children.pop();c.traverse?.(o=>o.geometry?.dispose());}}
function rebuild(data){currentData=data;currentTent=data.tent;clear();lightRigs=[];root.add(ground(currentTent));root.add(tent(currentTent,data.anchoringMethod));const hw=currentTent.widthFt/2,hl=currentTent.lengthFt/2;(data.objects||[]).forEach(item=>{let o=item.kind==='table'?table(item):item.kind==='dance'?dance(item):null;if(!o)return;o.position.set(item.x+item.widthFt/2-hw,0,item.y+item.depthFt/2-hl);o.userData={itemId:item.id,widthFt:item.widthFt,depthFt:item.depthFt,x:item.x,y:item.y};if(data.selectedId===item.id)o.add(ring(item,0x2d8cff));const sev=data.severityMap?.[item.id];if(sev)o.add(ring(item,sev==='error'?0xd64045:0xe6a12a));root.add(o);});const lo=data.lightingId?lightingById(data.lightingId):null;if(lo?.visual&&lo.visual!=='none')lightRigs=addBistro(currentTent,lo.visual);applyLighting();}
function applyLighting(){if(!scene)return;scene.background=new THREE.Color(night?0x17243a:0xd9ecf8);scene.fog.color.copy(scene.background);ambient.intensity=night?.16:.42;hemi.intensity=night?.24:1.05;sun.intensity=night?.08:2.0;if(groundMat)groundMat.color.set(night?0x52634a:0xffffff);renderer.toneMappingExposure=night?.9:1.02;lightRigs.forEach(r=>{r.b.material.emissiveIntensity=night?1.65:.08;if(r.l)r.l.intensity=night?1.45:0;});}
function frame(t){const s=Math.max(t.widthFt,t.lengthFt),dist=s*1.15;camera.position.set(dist*.8,dist*.62,dist*.88);controls.target.set(0,3,0);controls.minDistance=7;controls.maxDistance=s*3;controls.update();}
function selectable(o){while(o&&o!==root){if(o.userData?.itemId)return o;o=o.parent;}return null;}
function ndc(e){const r=renderer.domElement.getBoundingClientRect();return new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1));}
function down(e){if(e.button!==undefined&&e.button!==0)return;raycaster.setFromCamera(ndc(e),camera);const hits=raycaster.intersectObjects(root.children,true);let h;for(const x of hits){h=selectable(x.object);if(h)break;}if(!h)return;const p=new THREE.Vector3();if(!raycaster.ray.intersectPlane(plane,p))return;dragging=true;dragMoved=false;dragTarget=h;dragStart.copy(p);dragX=h.userData.x;dragY=h.userData.y;controls.enabled=false;}
function move(e){if(!dragging||!dragTarget)return;raycaster.setFromCamera(ndc(e),camera);const p=new THREE.Vector3();if(!raycaster.ray.intersectPlane(plane,p))return;let x=dragTarget.userData.x+p.x-dragStart.x,y=dragTarget.userData.y+p.z-dragStart.z;if(Math.abs(p.x-dragStart.x)>.08||Math.abs(p.z-dragStart.z)>.08)dragMoved=true;x=Math.max(0,Math.min(currentTent.widthFt-dragTarget.userData.widthFt,x));y=Math.max(0,Math.min(currentTent.lengthFt-dragTarget.userData.depthFt,y));dragX=x;dragY=y;dragTarget.position.set(x+dragTarget.userData.widthFt/2-currentTent.widthFt/2,0,y+dragTarget.userData.depthFt/2-currentTent.lengthFt/2);}
function up(){if(!dragging)return;dragging=false;controls.enabled=true;const t=dragTarget;dragTarget=null;if(!t)return;if(dragMoved)callbacks.onMove?.(t.userData.itemId,dragX,dragY);else callbacks.onSelect?.(t.userData.itemId);}
function resize(){if(!container||!renderer)return;const w=container.clientWidth||700,h=container.clientHeight||500;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
function loop(){raf=requestAnimationFrame(loop);controls?.update();renderer?.render(scene,camera);}
export function mount(el,data,cbs){container=el;container.innerHTML='';callbacks=cbs||{};night=false;scene=new THREE.Scene();scene.fog=new THREE.Fog(0xd9ecf8,110,380);root=new THREE.Group();scene.add(root);const w=el.clientWidth||700,h=el.clientHeight||500;camera=new THREE.PerspectiveCamera(40,w/h,.1,1800);renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(w,h);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;el.appendChild(renderer.domElement);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.maxPolarAngle=Math.PI/2-.035;controls.minPolarAngle=.15;raycaster=new THREE.Raycaster();ambient=new THREE.AmbientLight(0xffffff,.42);scene.add(ambient);hemi=new THREE.HemisphereLight(0xd8edff,0x526c3e,1.05);scene.add(hemi);sun=new THREE.DirectionalLight(0xfff3dd,2);const s=Math.max(data.tent.widthFt,data.tent.lengthFt);sun.position.set(s*.75,s*1.2,s*.6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=sun.shadow.camera.bottom=-s;sun.shadow.camera.right=sun.shadow.camera.top=s;sun.shadow.camera.far=s*4;sun.shadow.bias=-.00035;scene.add(sun);frame(data.tent);renderer.domElement.addEventListener('pointerdown',down);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);rebuild(data);resizeObserver=new ResizeObserver(resize);resizeObserver.observe(el);loop();}
export function update(data){if(!scene)return;const changed=currentTent&&data.tent&&currentTent.id!==data.tent.id;rebuild(data);if(changed)frame(data.tent);}
export function toggleDayNight(){night=!night;rebuild(currentData);return night;}
export function unmount(){if(raf)cancelAnimationFrame(raf);resizeObserver?.disconnect();renderer?.domElement.removeEventListener('pointerdown',down);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);clear();renderer?.dispose();if(container)container.innerHTML='';renderer=scene=camera=controls=container=root=null;}