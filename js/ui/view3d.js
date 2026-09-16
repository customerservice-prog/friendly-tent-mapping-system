// RentSketch Visual Engine 2.0 — game-like event builder
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { byId as chairById } from '../data/chairs.js';
import { byId as tableById } from '../data/tables.js';
import { byId as lightingById } from '../data/lighting.js';

const EAVE=8.5;
let renderer,scene,camera,controls,container,group,raycaster,resizeObserver,raf,currentData,currentTent,selected=null;
let callbacks={},night=false,dragging=false,dragTarget=null,dragStart=new THREE.Vector3(),dragX=0,dragY=0,dragMoved=false;
let sun,hemi,ambient,groundMat,lightRigs=[];
const plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const mats={};
function mat(key,opt){if(!mats[key])mats[key]=new THREE.MeshStandardMaterial(opt);return mats[key];}
const whitePlastic=()=>mat('plastic',{color:0xf8f8f5,roughness:.5,metalness:.02});
const whiteFabric=()=>mat('fabric',{color:0xfffdf7,roughness:.86,metalness:0,side:THREE.DoubleSide,transparent:true,opacity:.94});
const steel=()=>mat('steel',{color:0x9ba5aa,roughness:.28,metalness:.72});
const darkSteel=()=>mat('darksteel',{color:0x3f474b,roughness:.38,metalness:.65});
const wood=()=>mat('wood',{color:0xb98750,roughness:.52,metalness:.02});
const gold=()=>mat('gold',{color:0xc99a32,roughness:.24,metalness:.72});
function shadow(o){o.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});return o;}
function cyl(r,h,m,segments=12){const x=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),m);x.castShadow=true;return x;}
function box(w,h,d,m){const x=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);x.castShadow=true;x.receiveShadow=true;return x;}
function roundedChair(chairId){
 const d=chairById(chairId)||{},type=d.silhouette||'folding',g=new THREE.Group(),w=d.seatWidthFt||1.5,dep=d.seatDepthFt||1.45,sh=.92;
 const fm=type==='chiavari'?gold():(type==='throne'?gold():whitePlastic());
 if(type==='chiavari'){
  const seat=cyl(w*.42,.12,mat('cushion',{color:0xf4eee2,roughness:.8}),20);seat.position.y=sh;g.add(seat);
  const legGeo=new THREE.CylinderGeometry(.025,.035,sh,8);[-1,1].forEach(ix=>[-1,1].forEach(iz=>{const l=new THREE.Mesh(legGeo,fm);l.position.set(ix*w*.34,sh/2,iz*dep*.32);g.add(l);}));
  [-.34,.34].forEach(x=>{const p=cyl(.035,2.05,fm,8);p.position.set(x*w,1.8,-dep*.34);g.add(p);});
  for(let i=-2;i<=2;i++){const p=cyl(.018,1.35,fm,6);p.position.set(i*w*.12,1.65,-dep*.34);g.add(p);}
  const top=box(w*.78,.08,.07,fm);top.position.set(0,2.8,-dep*.34);g.add(top);
 }else if(type==='throne'){
  const cushion=box(w*.72,.3,dep*.7,mat('thronec',{color:0xf7f3e8,roughness:.75}));cushion.position.y=1.1;g.add(cushion);
  const back=box(w*.8,3.1,.22,mat('thronec2',{color:0xf7f3e8,roughness:.75}));back.position.set(0,2.5,-dep*.34);g.add(back);
  const frame=box(w*.92,3.4,.1,fm);frame.position.set(0,2.5,-dep*.43);g.add(frame);
  [-1,1].forEach(s=>{const arm=box(.13,.18,dep*.58,fm);arm.position.set(s*w*.4,1.45,0);g.add(arm);});
 }else{
  const seat=box(w*.86,.12,dep*.78,fm);seat.position.y=sh;seat.geometry.translate(0,0,0);g.add(seat);
  const back=box(w*.82,1.25,.1,fm);back.position.set(0,1.65,-dep*.36);back.rotation.x=-.08;g.add(back);
  const legGeo=new THREE.CylinderGeometry(.035,.045,1.05,8);[-1,1].forEach(ix=>[-1,1].forEach(iz=>{const l=new THREE.Mesh(legGeo,type==='resin'?fm:darkSteel());l.position.set(ix*w*.35,.5,iz*dep*.31);l.rotation.z=ix*.05;l.rotation.x=iz*.05;g.add(l);}));
  if(type==='resin'){const inset=box(w*.58,.65,.06,mat('resininset',{color:0xffffff,roughness:.38}));inset.position.set(0,1.7,-dep*.415);g.add(inset);}
 }
 return shadow(g);
}
function linenColor(id){const s=String(id||'').toLowerCase();if(s.includes('black'))return 0x202225;if(s.includes('ivory')||s.includes('champ'))return 0xeee2c6;if(s.includes('navy'))return 0x243654;if(s.includes('red'))return 0x8d2f32;return 0xfaf8f2;}
function tableGroup(item){
 const g=new THREE.Group(),def=tableById(item.tableId)||{},sil=def.silhouette||'',topY=sil.includes('cocktail')?3.5:2.45,round=item.shape==='round'||sil.includes('round'),color=linenColor(item.linenId),lm=new THREE.MeshStandardMaterial({color,roughness:.88,side:THREE.DoubleSide});
 let radius;
 if(round){radius=item.widthFt/2;const cloth=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius*.98,topY-.08,40,1,true),lm);cloth.position.y=(topY-.08)/2;g.add(cloth);const top=cyl(radius,.12,lm,40);top.position.y=topY;g.add(top);}
 else{radius=Math.max(item.widthFt,item.depthFt)/2;const cloth=box(item.widthFt,topY-.1,item.depthFt,lm);cloth.position.y=(topY-.1)/2;g.add(cloth);const top=box(item.widthFt,.12,item.depthFt,lm);top.position.y=topY;g.add(top);}
 const count=item.seatCount||0,chairR=radius+1.05;
 for(let i=0;i<count;i++){const a=i/count*Math.PI*2,c=roundedChair(item.chairId);c.position.set(Math.cos(a)*chairR,0,Math.sin(a)*chairR);c.rotation.y=-a-Math.PI/2;g.add(c);}
 return shadow(g);
}
function danceGroup(item){
 const g=new THREE.Group(),w=item.widthFt||3,d=item.depthFt||3,base=box(w,.13,d,darkSteel());base.position.y=.065;g.add(base);
 const tile=.75;for(let x=-w/2+tile/2;x<w/2;x+=tile)for(let z=-d/2+tile/2;z<d/2;z+=tile){const tone=(Math.floor((x+w/2)/tile)+Math.floor((z+d/2)/tile))%2;const m=mat('wood'+tone,{color:tone?0xc99a63:0xe0b983,roughness:.45});const p=box(tile-.025,.055,tile-.025,m);p.position.set(x,.16,z);g.add(p);}return shadow(g);
}
function canopyGeometry(t){
 const W=t.widthFt,L=t.lengthFt,segX=Math.max(12,Math.round(W/2)),segZ=Math.max(16,Math.round(L/2)),geo=new THREE.PlaneGeometry(W,L,segX,segZ),p=geo.attributes.position,peak=Math.max(5,Math.min(13,W*.28));
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getY(i),nx=Math.abs(x)/(W/2),nz=Math.abs(z)/(L/2);let y;
  if(t.type==='pole'){const cross=Math.pow(Math.max(0,1-nx),.7);const bay=1-.14*Math.cos((z/L)*Math.PI*4);y=EAVE+peak*cross*bay-.45*Math.pow(nz,4);}else y=EAVE+Math.max(2.2,W*.11)*(1-nx*nx);
  p.setZ(i,y);
 }
 geo.rotateX(-Math.PI/2);geo.computeVertexNormals();return geo;
}
function addTent(t,anchor){
 const g=new THREE.Group(),hw=t.widthFt/2,hl=t.lengthFt/2,roof=new THREE.Mesh(canopyGeometry(t),whiteFabric());roof.castShadow=true;roof.receiveShadow=true;g.add(roof);
 const polePositions=[];for(let x=-hw;x<=hw+.01;x+=Math.min(10,t.widthFt)) {polePositions.push([Math.max(-hw,Math.min(hw,x)),-hl],[Math.max(-hw,Math.min(hw,x)),hl]);}for(let z=-hl+10;z<hl;z+=10){polePositions.push([-hw,z],[hw,z]);}
 polePositions.forEach(([x,z])=>{const p=cyl(.095,EAVE,steel(),10);p.position.set(x,EAVE/2,z);g.add(p);});
 (t.centerPoles||[]).forEach(p=>{const x=p.x-hw,z=p.y-hl,h=EAVE+Math.max(5,Math.min(13,t.widthFt*.28));const cp=cyl(.13,h,steel(),12);cp.position.set(x,h/2,z);g.add(cp);});
 // elegant scalloped valance
 const vm=mat('valance',{color:0xffffff,roughness:.9,side:THREE.DoubleSide});
 [[-hw,-hl,hw,-hl],[hw,-hl,hw,hl],[hw,hl,-hw,hl],[-hw,hl,-hw,-hl]].forEach(s=>{const len=Math.hypot(s[2]-s[0],s[3]-s[1]),n=Math.ceil(len/2);for(let i=0;i<n;i++){const a=i/n,b=(i+1)/n,x=(s[0]+(s[2]-s[0])*(a+b)/2),z=(s[1]+(s[3]-s[1])*(a+b)/2),piece=box(Math.abs(s[2]-s[0])?len/n:.06,.58,Math.abs(s[3]-s[1])?len/n:.06,vm);piece.position.set(x,EAVE-.29,z);g.add(piece);}});
 const out=t.installationClearanceFt||4;
 const anchors=[[-hw,-hl], [hw,-hl], [hw,hl],[-hw,hl]];
 anchors.forEach(([x,z])=>{const ox=x+(x<0?-out:out),oz=z+(z<0?-out:out);if(anchor==='ballast'){const b=box(1.25,.7,1.25,mat('concrete',{color:0x8b8e8c,roughness:.96}));b.position.set(ox,.35,oz);g.add(b);}else{const strapPts=[new THREE.Vector3(x,EAVE*.78,z),new THREE.Vector3(ox,.15,oz)],strap=new THREE.Line(new THREE.BufferGeometry().setFromPoints(strapPts),new THREE.LineBasicMaterial({color:0x252525}));g.add(strap);const stake=cyl(.055,1.15,darkSteel(),8);stake.position.set(ox,.35,oz);stake.rotation.z=.2;g.add(stake);}});
 return shadow(g);
}
function grassTexture(){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#6f9d55';x.fillRect(0,0,256,256);for(let i=0;i<5000;i++){const v=70+Math.random()*65;x.fillStyle=`rgba(${v*.55},${v},${v*.42},.22)`;x.fillRect(Math.random()*256,Math.random()*256,1,2);}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(12,12);return t;}
function addGround(t){const m=new THREE.MeshStandardMaterial({color:night?0x263a26:0xffffff,map:grassTexture(),roughness:1});groundMat=m;const p=new THREE.Mesh(new THREE.PlaneGeometry(t.widthFt+70,t.lengthFt+70),m);p.rotation.x=-Math.PI/2;p.receiveShadow=true;return p;}
function addLights(t,kind){
 const rigs=[],hw=t.widthFt/2,hl=t.lengthFt/2,y=EAVE+1.3,lines=[];if(kind==='perimeter-swag'||kind==='perimeter-strand')lines.push([[-hw,-hl],[hw,-hl]],[[hw,-hl],[hw,hl]],[[hw,hl],[-hw,hl]],[[-hw,hl],[-hw,-hl]]);else lines.push([[-hw,-hl],[hw,hl]],[[hw,-hl],[-hw,hl]]);
 lines.forEach(pair=>{const pts=[];for(let i=0;i<=24;i++){const q=i/24,sag=Math.sin(q*Math.PI)*1.2;pts.push(new THREE.Vector3(pair[0][0]+(pair[1][0]-pair[0][0])*q,y-sag,pair[0][1]+(pair[1][1]-pair[0][1])*q));}group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x29231e})));for(let i=2;i<24;i+=3){const bm=new THREE.MeshStandardMaterial({color:0xffe4a3,emissive:0xffb84a,emissiveIntensity:night?2.4:.25});const b=new THREE.Mesh(new THREE.SphereGeometry(.13,10,10),bm);b.position.copy(pts[i]);group.add(b);let l=null;if(night&&i%6===2){l=new THREE.PointLight(0xffb85c,4.5,18,1.8);l.position.copy(pts[i]);group.add(l);}rigs.push({b,l});}});return rigs;
}
function clear(){if(!group)return;while(group.children.length){const c=group.children.pop();c.traverse?.(o=>{if(o.geometry)o.geometry.dispose();});}}
function ring(item,color){const g=new THREE.Group(),m=new THREE.LineBasicMaterial({color});const w=item.widthFt+.8,d=item.depthFt+.8,pts=[new THREE.Vector3(-w/2,.08,-d/2),new THREE.Vector3(w/2,.08,-d/2),new THREE.Vector3(w/2,.08,d/2),new THREE.Vector3(-w/2,.08,d/2),new THREE.Vector3(-w/2,.08,-d/2)];g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),m));return g;}
function rebuild(data){currentData=data;currentTent=data.tent;clear();lightRigs=[];group.add(addGround(currentTent));group.add(addTent(currentTent,data.anchoringMethod));const hw=currentTent.widthFt/2,hl=currentTent.lengthFt/2;(data.objects||[]).forEach(item=>{let o;if(item.kind==='table')o=tableGroup(item);else if(item.kind==='dance')o=danceGroup(item);else return;o.position.set(item.x+item.widthFt/2-hw,0,item.y+item.depthFt/2-hl);o.userData={itemId:item.id,widthFt:item.widthFt,depthFt:item.depthFt,x:item.x,y:item.y};if(data.selectedId===item.id)o.add(ring(item,0x2d8cff));const sev=data.severityMap&&data.severityMap[item.id];if(sev)o.add(ring(item,sev==='error'?0xd64045:0xe6a12a));group.add(o);});const lo=data.lightingId?lightingById(data.lightingId):null;if(lo&&lo.visual&&lo.visual!=='none')lightRigs=addLights(currentTent,lo.visual);applyLighting();}
function applyLighting(){if(!scene)return;scene.background=new THREE.Color(night?0x101b33:0xbfdfff);ambient.intensity=night?.28:.62;hemi.intensity=night?.32:.8;sun.intensity=night?.18:2.25;if(groundMat)groundMat.color.set(night?0x34462d:0xffffff);renderer.toneMappingExposure=night?.72:1.08;lightRigs.forEach(r=>{r.b.material.emissiveIntensity=night?2.4:.25;if(r.l)r.l.intensity=night?4.5:0;});}
function frame(t){const size=Math.max(t.widthFt,t.lengthFt),dist=size*1.18;camera.position.set(dist*.78,dist*.62,dist*.82);controls.target.set(0,2.7,0);controls.minDistance=7;controls.maxDistance=size*3;controls.update();}
function selectable(o){while(o&&o!==group){if(o.userData?.itemId)return o;o=o.parent;}return null;}
function ndc(e){const r=renderer.domElement.getBoundingClientRect();return new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1));}
function down(e){if(e.button!==undefined&&e.button!==0)return;raycaster.setFromCamera(ndc(e),camera);const hits=raycaster.intersectObjects(group.children,true);let h;for(const x of hits){h=selectable(x.object);if(h)break;}if(!h)return;const p=new THREE.Vector3();if(!raycaster.ray.intersectPlane(plane,p))return;dragging=true;dragMoved=false;dragTarget=h;dragStart.copy(p);dragX=h.userData.x;dragY=h.userData.y;controls.enabled=false;}
function move(e){if(!dragging||!dragTarget)return;raycaster.setFromCamera(ndc(e),camera);const p=new THREE.Vector3();if(!raycaster.ray.intersectPlane(plane,p))return;let x=dragTarget.userData.x+p.x-dragStart.x,y=dragTarget.userData.y+p.z-dragStart.z;if(Math.abs(p.x-dragStart.x)>.08||Math.abs(p.z-dragStart.z)>.08)dragMoved=true;x=Math.max(0,Math.min(currentTent.widthFt-dragTarget.userData.widthFt,x));y=Math.max(0,Math.min(currentTent.lengthFt-dragTarget.userData.depthFt,y));dragX=x;dragY=y;dragTarget.position.set(x+dragTarget.userData.widthFt/2-currentTent.widthFt/2,0,y+dragTarget.userData.depthFt/2-currentTent.lengthFt/2);}
function up(){if(!dragging)return;dragging=false;controls.enabled=true;const t=dragTarget;dragTarget=null;if(!t)return;if(dragMoved)callbacks.onMove?.(t.userData.itemId,dragX,dragY);else callbacks.onSelect?.(t.userData.itemId);}
function resize(){if(!container||!renderer)return;const w=container.clientWidth||700,h=container.clientHeight||500;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
function loop(){raf=requestAnimationFrame(loop);controls?.update();renderer?.render(scene,camera);}
export function mount(el,data,cbs){container=el;container.innerHTML='';callbacks=cbs||{};night=false;scene=new THREE.Scene();scene.fog=new THREE.Fog(0xbfdfff,100,360);group=new THREE.Group();scene.add(group);const w=el.clientWidth||700,h=el.clientHeight||500;camera=new THREE.PerspectiveCamera(42,w/h,.1,1800);renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(w,h);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;el.appendChild(renderer.domElement);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.maxPolarAngle=Math.PI/2-.035;controls.minPolarAngle=.18;raycaster=new THREE.Raycaster();ambient=new THREE.AmbientLight(0xffffff,.62);scene.add(ambient);hemi=new THREE.HemisphereLight(0xcce7ff,0x526c3e,.8);scene.add(hemi);sun=new THREE.DirectionalLight(0xfff4df,2.25);const s=Math.max(data.tent.widthFt,data.tent.lengthFt);sun.position.set(s*.75,s*1.25,s*.55);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=sun.shadow.camera.bottom=-s;sun.shadow.camera.right=sun.shadow.camera.top=s;sun.shadow.camera.far=s*4;sun.shadow.bias=-.0004;scene.add(sun);frame(data.tent);renderer.domElement.addEventListener('pointerdown',down);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);rebuild(data);resizeObserver=new ResizeObserver(resize);resizeObserver.observe(el);loop();}
export function update(data){if(!scene)return;const changed=currentTent&&data.tent&&currentTent.id!==data.tent.id;rebuild(data);if(changed)frame(data.tent);}
export function toggleDayNight(){night=!night;applyLighting();return night;}
export function unmount(){if(raf)cancelAnimationFrame(raf);resizeObserver?.disconnect();renderer?.domElement.removeEventListener('pointerdown',down);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);clear();renderer?.dispose();if(container)container.innerHTML='';renderer=scene=camera=controls=container=group=null;}
