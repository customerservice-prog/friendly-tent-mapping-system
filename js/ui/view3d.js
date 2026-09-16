import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let renderer,scene,camera,controls,root,container,ro,raf,state,isNight=false;
let ambient,hemi,sun;
const mats={};
const EAVE=7;
function mat(k,o){return mats[k]||(mats[k]=new THREE.MeshStandardMaterial(o));}
function box(w,h,d,m){const q=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);q.castShadow=q.receiveShadow=true;return q;}
function cyl(r,h,m,n=12){const q=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,n),m);q.castShadow=true;return q;}
function tube(a,b,r,m){const d=new THREE.Vector3().subVectors(b,a),q=cyl(r,d.length(),m,8);q.position.copy(a).add(b).multiplyScalar(.5);q.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return q;}
const vinyl=()=>mat('vinyl',{color:0xfffefa,roughness:.8,metalness:0,side:THREE.DoubleSide});
const steel=()=>mat('steel',{color:0xaeb5b8,roughness:.3,metalness:.62});
const dark=()=>mat('dark',{color:0x343638,roughness:.5,metalness:.35});
const plastic=()=>mat('plastic',{color:0xf7f7f4,roughness:.55});
const wood=()=>mat('wood',{color:0xb7834f,roughness:.56});

function peakHeight(t){
  // Supplier Classic Series: 7 ft eave; 30-wide approx 16'10 overall,
  // 40-wide approx 16'10 overall with a 10 ft pitch.
  if(t.type!=='pole') return EAVE+Math.max(4,Math.min(10,t.widthFt*.25));
  return t.widthFt>=40?16.85:(t.widthFt>=30?16.85:EAVE+7.5);
}
function peakStations(t){
  const L=t.lengthFt;
  if(t.type!=='pole') return [{x:0,z:0}];
  const fromData=(t.centerPoles||[]).map(p=>({x:(p.x??t.widthFt/2)-t.widthFt/2,z:(p.y??L/2)-L/2}));
  if(fromData.length)return fromData;
  const count=Math.max(1,Math.round(L/20)),bay=L/count,out=[];
  for(let i=0;i<count;i++)out.push({x:0,z:-L/2+bay*(i+.5)});
  return out;
}
function roofMesh(t){
  const W=t.widthFt,L=t.lengthFt,H=peakHeight(t),ps=peakStations(t),bay=L/ps.length;
  const g=new THREE.PlaneGeometry(W,L,Math.max(40,Math.round(W*1.5)),Math.max(60,Math.round(L*1.5))),a=g.attributes.position;
  for(let i=0;i<a.count;i++){
    const x=a.getX(i),z=a.getY(i),nx=Math.min(1,Math.abs(x)/(W/2));
    let y;
    if(t.type==='pole'){
      let nearest=ps[0],dz=Infinity;
      for(const p of ps){const d=Math.abs(z-p.z);if(d<dz){dz=d;nearest=p;}}
      // Real tension top: every 20-ft bay rises smoothly to one center pole.
      // The eave stays straight; fabric sweeps inward/upward rather than
      // forming the old repeated pyramids and wire-frame-looking ridges.
      const longitudinal=Math.max(0,1-dz/(bay*.72));
      const cross=Math.pow(Math.max(0,1-nx),.72);
      const crown=.32+.68*Math.pow(longitudinal,.72);
      y=EAVE+(H-EAVE)*cross*crown;
      // subtle membrane sag between center-pole bays
      y-=Math.sin(Math.min(1,dz/(bay*.5))*Math.PI)*.18*cross;
    }else{
      y=EAVE+(H-EAVE)*Math.pow(Math.max(0,1-nx),.86);
    }
    if(nx>.985)y=EAVE;
    a.setZ(i,y);
  }
  g.rotateX(-Math.PI/2);g.computeVertexNormals();
  const q=new THREE.Mesh(g,vinyl());q.castShadow=q.receiveShadow=true;return q;
}
function perimeter(t){
  const W=t.widthFt,L=t.lengthFt,hw=W/2,hl=L/2,p=[];
  for(let x=-hw;x<=hw+.01;x+=10)p.push([Math.min(x,hw),-hl],[Math.min(x,hw),hl]);
  for(let z=-hl+10;z<hl;z+=10)p.push([-hw,z],[hw,z]);
  return p;
}
function addValance(g,t){
  const hw=t.widthFt/2,hl=t.lengthFt/2,m=mat('valance',{color:0xfffefa,roughness:.86});
  const sides=[[0,-hl,t.widthFt,.08],[0,hl,t.widthFt,.08],[-hw,0,.08,t.lengthFt],[hw,0,.08,t.lengthFt]];
  sides.forEach(v=>{const q=box(v[2],.48,v[3],m);q.position.set(v[0],EAVE-.24,v[1]);g.add(q);});
}
function tent(t,anchor){
  const g=new THREE.Group(),H=peakHeight(t),pp=perimeter(t),ps=peakStations(t),hw=t.widthFt/2,hl=t.lengthFt/2;
  g.add(roofMesh(t));
  pp.forEach(([x,z])=>{const p=cyl(.07,EAVE,steel(),10);p.position.set(x,EAVE/2,z);g.add(p);});
  if(t.type==='pole')ps.forEach(p=>{const q=cyl(.105,H,steel(),12);q.position.set(p.x,H/2,p.z);g.add(q);});
  if(t.type==='frame')for(let z=-hl;z<=hl+.01;z+=10){const zz=Math.min(z,hl);g.add(tube(new THREE.Vector3(-hw,EAVE,zz),new THREE.Vector3(0,H,zz),.045,steel()));g.add(tube(new THREE.Vector3(0,H,zz),new THREE.Vector3(hw,EAVE,zz),.045,steel()));}
  addValance(g,t);
  const clearance=t.installationClearanceFt||5;
  // Guy lines belong outside the tent and run from side-pole/eave points to stakes.
  // Do not draw structural-looking lines across the roof.
  pp.forEach(([x,z],i)=>{if(i%2)return;const sideX=Math.abs(x)>hw*.9,sideZ=Math.abs(z)>hl*.9;if(!sideX&&!sideZ)return;const dx=sideX?Math.sign(x):0,dz=sideZ?Math.sign(z):0,ox=x+dx*clearance,oz=z+dz*clearance;if(anchor==='ballast'){const b=box(1.25,.68,1.25,mat('concrete',{color:0x909392,roughness:1}));b.position.set(ox,.34,oz);g.add(b);g.add(tube(new THREE.Vector3(x,EAVE*.72,z),new THREE.Vector3(ox,.68,oz),.018,dark()));}else if(anchor){g.add(tube(new THREE.Vector3(x,EAVE*.72,z),new THREE.Vector3(ox,.12,oz),.018,dark()));const s=cyl(.04,.75,dark(),8);s.position.set(ox,.3,oz);g.add(s);}});
  return g;
}
function chair(){const g=new THREE.Group(),m=plastic();const seat=box(1.2,.1,1.1,m);seat.position.y=.92;g.add(seat);const back=box(1.18,1.08,.08,m);back.position.set(0,1.62,-.5);g.add(back);[-.45,.45].forEach(x=>[-.4,.4].forEach(z=>{const l=cyl(.025,1,dark(),8);l.position.set(x,.48,z);g.add(l);}));return g;}
function table(o){const g=new THREE.Group(),round=o.shape==='round'||Math.abs((o.widthFt||0)-(o.depthFt||0))<.2,w=o.widthFt||5,d=o.depthFt||5,h=2.45,cloth=new THREE.MeshStandardMaterial({color:0xfaf8f2,roughness:.92,side:THREE.DoubleSide});if(round){const r=w/2,s=new THREE.Mesh(new THREE.CylinderGeometry(r,r*.96,h,36,1,true),cloth);s.position.y=h/2;g.add(s);const top=cyl(r,.07,cloth,36);top.position.y=h;g.add(top);}else{const q=box(w,h,d,cloth);q.position.y=h/2;g.add(q);}const n=o.seatCount||0,rr=Math.max(w,d)/2+1.05;for(let i=0;i<n;i++){const a=i/n*Math.PI*2,c=chair();c.position.set(Math.cos(a)*rr,0,Math.sin(a)*rr);c.rotation.y=-a-Math.PI/2;g.add(c);}return g;}
function dance(o){const g=new THREE.Group(),w=o.widthFt||18,d=o.depthFt||18,b=box(w,.12,d,dark());b.position.y=.06;g.add(b);for(let x=-w/2;x<w/2;x+=3)for(let z=-d/2;z<d/2;z+=3){const pw=Math.min(3,w-(x+w/2)),pd=Math.min(3,d-(z+d/2)),p=box(pw-.04,.055,pd-.04,wood());p.position.set(x+pw/2,.15,z+pd/2);g.add(p);}return g;}
function ground(t){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.fillStyle='#739654';x.fillRect(0,0,128,128);for(let i=0;i<2200;i++){x.fillStyle=`rgba(35,75,30,${Math.random()*.15})`;x.fillRect(Math.random()*128,Math.random()*128,1,2);}const tx=new THREE.CanvasTexture(c);tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.repeat.set(18,18);const p=new THREE.Mesh(new THREE.PlaneGeometry(t.widthFt+110,t.lengthFt+110),new THREE.MeshStandardMaterial({map:tx,roughness:1}));p.rotation.x=-Math.PI/2;p.receiveShadow=true;return p;}
function lighting(t){
  if(!state.lightingId||state.lightingId==='lighting-none')return;
  const hw=t.widthFt/2,hl=t.lengthFt/2,ps=peakStations(t),runs=[];
  // Bistro lights are INSIDE the canopy. Keep them below the vinyl so the
  // exterior reads as a clean white tent instead of a black wire cage.
  if(t.type==='pole')ps.forEach(p=>runs.push([new THREE.Vector3(-hw+1,EAVE-.45,p.z),new THREE.Vector3(hw-1,EAVE-.45,p.z)]));
  else for(let z=-hl+5;z<hl;z+=10)runs.push([new THREE.Vector3(-hw+1,EAVE-.45,z),new THREE.Vector3(hw-1,EAVE-.45,z)]);
  runs.forEach(([A,B])=>{const n=Math.max(8,Math.round(A.distanceTo(B))),pts=[];for(let i=0;i<=n;i++){const q=i/n,p=A.clone().lerp(B,q);p.y-=Math.sin(Math.PI*q)*.3;pts.push(p);}root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x3b342c})));for(let i=1;i<n;i+=2){const bm=new THREE.MeshStandardMaterial({color:0xffdda0,emissive:0xffad42,emissiveIntensity:isNight?2:.12}),b=new THREE.Mesh(new THREE.SphereGeometry(.075,8,8),bm);b.position.copy(pts[i]);root.add(b);if(isNight&&i%6===1){const l=new THREE.PointLight(0xffb55c,1.2,12,2);l.position.copy(b.position);root.add(l);}}});
}
function clear(){while(root&&root.children.length)root.remove(root.children[0]);}
function rebuild(d){state=d;clear();const t=d?.tent;if(!t)return;root.add(ground(t));root.add(tent(t,d.anchoringMethod));const hw=t.widthFt/2,hl=t.lengthFt/2;(d.objects||[]).forEach(o=>{const q=o.kind==='table'?table(o):o.kind==='dance'?dance(o):null;if(!q)return;q.position.set(o.x+o.widthFt/2-hw,0,o.y+o.depthFt/2-hl);root.add(q);});lighting(t);applyLight();}
function applyLight(){if(!scene)return;scene.background=new THREE.Color(isNight?0x17243a:0xcfe8f5);scene.fog.color.copy(scene.background);ambient.intensity=isNight?.18:.46;hemi.intensity=isNight?.28:1.05;sun.intensity=isNight?.08:2.25;renderer.toneMappingExposure=isNight?.9:1.05;}
function frame(t){const s=Math.max(t.widthFt,t.lengthFt),d=s*.95;camera.position.set(d*.78,d*.48,d*.9);controls.target.set(0,4,0);controls.minDistance=8;controls.maxDistance=s*3;controls.update();}
function resize(){if(!renderer||!container)return;const w=Math.max(320,container.clientWidth),h=Math.max(360,container.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
function loop(){raf=requestAnimationFrame(loop);controls?.update();renderer?.render(scene,camera);}
export function mount(el,data){unmount();container=el;container.innerHTML='';isNight=false;scene=new THREE.Scene();scene.fog=new THREE.Fog(0xcfe8f5,150,450);root=new THREE.Group();scene.add(root);const w=Math.max(320,el.clientWidth),h=Math.max(360,el.clientHeight);camera=new THREE.PerspectiveCamera(38,w/h,.1,2000);renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.setSize(w,h);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;el.appendChild(renderer.domElement);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.maxPolarAngle=Math.PI/2-.04;ambient=new THREE.AmbientLight(0xffffff,.46);hemi=new THREE.HemisphereLight(0xd9efff,0x52683d,1.05);sun=new THREE.DirectionalLight(0xfff1dc,2.25);const s=Math.max(data.tent.widthFt,data.tent.lengthFt);sun.position.set(s*.7,s*1.15,s*.55);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=sun.shadow.camera.bottom=-s;sun.shadow.camera.right=sun.shadow.camera.top=s;sun.shadow.camera.far=s*4;scene.add(ambient,hemi,sun);frame(data.tent);rebuild(data);ro=new ResizeObserver(resize);ro.observe(el);loop();}
export function update(data){if(!scene)return;const changed=state?.tent?.id!==data?.tent?.id;rebuild(data);if(changed&&data.tent)frame(data.tent);}
export function toggleDayNight(){isNight=!isNight;rebuild(state);return isNight;}
export function unmount(){if(raf)cancelAnimationFrame(raf);raf=0;ro?.disconnect();ro=null;controls?.dispose();renderer?.dispose();if(container)container.innerHTML='';renderer=scene=camera=controls=root=container=null;}
