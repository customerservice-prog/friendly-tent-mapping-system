import { equipmentAssetDescriptor } from '../data/asset-registry.js';
import { makeTabletop } from './tabletop3d.js';
// Detailed rental geometry, in feet. The existing layout store remains authoritative.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chairPositions } from '../core/seating.js';
import { byId as chairById } from '../data/chairs.js';
import { byId as tableById } from '../data/tables.js';
import { linenColorHex, byId as linenById } from '../data/linens.js';

const UP=new THREE.Vector3(0,1,0);
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.65,...extra});
function add(g,geometry,material,x=0,y=0,z=0,name='') {const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);return mesh;}
function box(g,w,h,d,m,x=0,y=0,z=0,r=.025) {return add(g,r?new RoundedBoxGeometry(w,h,d,1,r):new THREE.BoxGeometry(w,h,d),m,x,y,z);}
function rod(g,a,b,r,m,segments=8){const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);const mesh=add(g,new THREE.CylinderGeometry(r,r,delta.length(),segments),m);mesh.position.copy(from).add(to).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(UP,delta.normalize());return mesh;}
function roundPath(w,h,r,Path=THREE.Shape){const p=new Path(),x=-w/2,y=-h/2;p.moveTo(x+r,y);p.lineTo(x+w-r,y);p.quadraticCurveTo(x+w,y,x+w,y+r);p.lineTo(x+w,y+h-r);p.quadraticCurveTo(x+w,y+h,x+w-r,y+h);p.lineTo(x+r,y+h);p.quadraticCurveTo(x,y+h,x,y+h-r);p.lineTo(x,y+r);p.quadraticCurveTo(x,y,x+r,y);return p;}
function panel(g,w,h,depth,m,x,y,z,{handle=false,bend=0}={}) {
  const shape=roundPath(w,h,Math.min(.13,h/3));
  if(handle){const hole=roundPath(w*.4,.09,.04,THREE.Path);shape.holes.push(hole);}
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.018,bevelThickness:.014,curveSegments:5});
  if(bend){const p=geometry.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)+bend*Math.pow(p.getX(i)/(w/2),2));geometry.computeVertexNormals();}
  return add(g,geometry,m,x,y,z-depth/2);
}
// Consolidate small details into a handful of draws per chair/table/floor.
export function mergeParts(group) {
  group.updateMatrixWorld(true);const buckets=new Map(),originals=new Set();
  group.traverse(o=>{if(!o.isMesh)return;const geometry=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geometry.applyMatrix4(o.matrixWorld);originals.add(o.geometry);const list=buckets.get(o.material)||[];list.push(geometry);buckets.set(o.material,list);});
  group.clear();
  for(const [material,parts] of buckets){const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());const mesh=add(group,geometry,material);mesh.name=material.name || 'Equipment detail';}
  originals.forEach(g=>g.dispose());return group;
}
function curvedRod(g,points,r,material,segments=16){
  return add(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,r,8,false),material);
}
function flatRail(g,a,b,width,depth,material){
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);
  const mesh=box(g,width,delta.length(),depth,material,0,0,0,.012);
  mesh.position.copy(from).add(to).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(UP,delta.normalize());return mesh;
}
function horizontalSlab(g,shape,thickness,material,height){
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:32,steps:1});
  geometry.rotateX(Math.PI/2);return add(g,geometry,material,0,height,0);
}
function makeCrossbackChair(def){
  // The catalog photo has a solid timber seat, broad X slats and arched
  // stretchers. These are visual proportions, not additional measured specs.
  const g=new THREE.Group(),w=def.seatWidthFt||1.55,d=def.seatDepthFt||1.6,h=def.backHeightFt||2.9,seatY=1.48;
  const wood=mat(def.frameColor||'#ac7846',{map:woodMap('#faf6ed'),roughness:.57,metalness:0}),hardware=mat('#3b3326',{metalness:.45,roughness:.5});
  wood.name='Cross-back solid wood';hardware.name='Cross-back fasteners and glides';
  g.name=def.name||'Cross-Back Farmhouse Chair';g.userData.silhouette='crossback';
  horizontalSlab(g,roundPath(w,d,Math.min(w,d)*.20),.11,wood,seatY+.06);
  // Continuous rear posts bow gently with the back; four feet stay on the floor.
  for(const side of [-1,1]){
    curvedRod(g,[[side*w*.43,.035,-d*.43],[side*w*.37,seatY*.6,-d*.34],[side*w*.36,seatY,-d*.34],[side*w*.39,h*.79,-d*.40],[side*w*.42,h-.10,-d*.46]],.054,wood,22);
    curvedRod(g,[[side*w*.43,.035,d*.43],[side*w*.38,seatY*.5,d*.36],[side*w*.35,seatY-.03,d*.35]],.056,wood,14);
    curvedRod(g,[[side*w*.36,seatY*.58,-d*.34],[side*w*.36,seatY-.15,0],[side*w*.36,seatY*.58,d*.35]],.036,wood,16);
    for(const z of [-d*.34,d*.35])add(g,new THREE.CylinderGeometry(.048,.05,.024,8),hardware,side*w*.43,.012,Math.sign(z)*d*.43);
  }
  for(const z of [-d*.34,d*.35])curvedRod(g,[[-w*.36,seatY*.58,z],[0,seatY-.15,z],[w*.36,seatY*.58,z]],.038,wood,16);
  panel(g,w*.97,.25,.09,wood,0,h-.145,-d*.45,{bend:.085});
  flatRail(g,[-w*.34,seatY+.08,-d*.34],[w*.39,h-.24,-d*.44],.115,.046,wood);
  flatRail(g,[w*.34,seatY+.08,-d*.365],[-w*.39,h-.24,-d*.465],.115,.046,wood);
  const centerY=(seatY+.08+h-.24)/2;
  for(const [x,y,z] of [[0,centerY,-d*.375],[-w*.41,h-.145,-d*.38],[w*.41,h-.145,-d*.38]]){
    const screw=add(g,new THREE.SphereGeometry(.025,8,6),hardware,x,y,z);screw.scale.z=.45;
  }
  return mergeParts(g);
}
export function makeChair(def={}) {
  if(def.silhouette==='crossback')return makeCrossbackChair(def);
  const g=new THREE.Group(),w=def.seatWidthFt||1.5,d=def.seatDepthFt||1.5,h=def.backHeightFt||2.6,seatY=1.48;
  g.name=def.name || 'Chair';g.userData.silhouette=def.silhouette || 'folding';
  const gold=def.silhouette==='throne'||def.id==='chiavari-gold';
  const frame=mat(def.frameColor||'#f4f3ed',{roughness:gold?.3:.48,metalness:gold?.55:.05});frame.name='Chair frame';
  const cushion=mat(def.accentColor||def.frameColor||'#f4f3ed',{roughness:.88});cushion.name='Seat cushion';
  const feet=mat('#393c3b');feet.name='Non-marking feet';
  box(g,w,.12,d,cushion,0,seatY,0,.055);
  if(def.silhouette==='chiavari') {
    // Open spindle back, turned legs and stretchers distinguish Chiavari seating.
    for(const x of [-w*.43,w*.43]){
      rod(g,[x,0,-d*.4],[x,h,-d*.42],.038,frame);
      rod(g,[x,0,d*.42],[x,seatY,d*.4],.045,frame);
      rod(g,[x,.55,-d*.4],[x,.55,d*.4],.024,frame);
      for(const y of [.25,.65,1.1,1.85,h-.35])add(g,new THREE.SphereGeometry(.061,8,5),frame,x,y,-d*.42);
    }
    for(const y of [seatY+.14,2.02,h-.09])rod(g,[-w*.43,y,-d*.42],[w*.43,y,-d*.42],.036,frame);
    for(const x of [-w*.23,0,w*.23])rod(g,[x,2.02,-d*.42],[x,h-.09,-d*.42],.023,frame);
    rod(g,[-w*.43,.48,d*.4],[w*.43,.48,d*.4],.024,frame);
  } else if(def.silhouette==='throne') {
    const king=def.id==='throne-king',backH=h-seatY-.25,bw=w*(king?.59:.90),bz=-d*.38;
    // Both Friendly references have ivory upholstery and carved gold frames.
    // King: a narrow arched back with posts. Queen: a broad, flared scalloped back.
    const outline=(width,height)=>{
      const sh=new THREE.Shape(),hw=width/2;
      sh.moveTo(-hw*.78,0);sh.bezierCurveTo(-hw*.72,height*.30,-hw*1.03,height*.63,-hw,height*.78);
      sh.bezierCurveTo(-hw*1.12,height*.97,-hw*.64,height*1.04,0,height);
      sh.bezierCurveTo(hw*.64,height*1.04,hw*1.12,height*.97,hw,height*.78);
      sh.bezierCurveTo(hw*1.03,height*.63,hw*.72,height*.30,hw*.78,0);sh.closePath();return sh;
    };
    const relief=(shape,depth,m,x,y,z)=>add(g,new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.035,bevelThickness:.03,curveSegments:12}),m,x,y,z);
    relief(outline(bw+.28,backH),.15,frame,0,seatY,bz-.12);
    relief(outline(bw,backH-.15),.13,cushion,0,seatY+.08,bz+.025);
    const edge=outline(bw+.14,backH-.07).getPoints(70).map(p=>new THREE.Vector3(p.x,seatY+p.y+.025,bz+.14));
    add(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge,true),100,.032,6,true),frame);
    const seam=cushion;
    const rowH=.46,cols=king?3:5;
    for(let row=0;row<Math.floor((backH-.35)/rowH);row++){
      const y=seatY+.27+row*rowH,count=row%2?cols-1:cols;
      for(let j=0;j<count;j++){
        const x=(j-(count-1)/2)*bw/(cols+.4);
        add(g,new THREE.SphereGeometry(.033,8,6),frame,x,y,bz+.18);
        if(row<Math.floor((backH-.35)/rowH)-1)for(const sign of [-1,1]){
          const nx=x+sign*bw/(cols+.4)/2;if(Math.abs(nx)<bw*.41)rod(g,[x,y,bz+.165],[nx,y+rowH,bz+.165],.008,seam,5);
        }
      }
    }
    const scroll=(x,y,z,r,sign=1)=>{
      const points=[];for(let i=0;i<=36;i++){const f=i/36,a=f*Math.PI*3.1,rr=r*(1-f*.77);points.push(new THREE.Vector3(x+Math.cos(a)*rr*sign,y+Math.sin(a)*rr,z));}
      add(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),36,.026,6,false),frame);
    };
    for(const side of [-1,1]){
      const x=side*w*.45;
      rod(g,[x*.95,.10,d*.36],[x,seatY+.64,d*.34],.075,frame,12);
      rod(g,[x*.9,.10,-d*.32],[x,seatY+.65,-d*.36],.063,frame,12);
      box(g,.25,.22,d*.8,cushion,x,seatY+.53,0,.09);
      if(!king){rod(g,[x,seatY+.55,-d*.26],[x,seatY+.55,d*.32],.20,cushion,16);box(g,.17,.57,d*.66,cushion,x,seatY+.22,.01,.07);}
      if(king)for(let i=0;i<4;i++)scroll(x,seatY-.1+i*.22,d*.43,.105,side);
      rod(g,[x,seatY+.48,-d*.33],[x,seatY+.48,d*.40],.056,frame,12);
      scroll(x,seatY+.50,d*.44,.14,side);
      for(const y of [.20,.38,seatY-.25,seatY+.23])add(g,new THREE.SphereGeometry(.105,10,8),frame,x,y,d*.36);
      for(let i=0;i<5;i++)scroll(side*(bw/2+.17),seatY+.32+i*(backH-.5)/5,bz+.16,.16,side);
      if(king){rod(g,[x,seatY,-d*.4],[x,h-.28,-d*.4],.065,frame,12);for(const y of [seatY+.8,h-1,h-.38])add(g,new THREE.SphereGeometry(.105,10,8),frame,x,y,-d*.4);add(g,new THREE.ConeGeometry(.085,.3,12),frame,x,h-.15,-d*.4);}
    }
    box(g,w*.88,.24,d*.9,cushion,0,seatY+.10,.03,.1);
    box(g,w,.12,.17,frame,0,seatY-.11,d*.48,.04);
    for(const side of [-1,1]){scroll(side*w*.2,seatY-.27,d*.5,.23,side);scroll(side*bw*.25,h-.04,bz+.13,.20,side);}
    for(const side of [-1,1])for(let i=0;i<5;i++){const leaf=add(g,new THREE.SphereGeometry(.095,8,6),frame,side*(.13+i*.10),h-.09+Math.sin(i*.65)*.14,bz+.12);leaf.scale.set(.65,1.8,.5);leaf.rotation.z=side*(.3+i*.25);}
    const crest=add(g,new THREE.SphereGeometry(.13,12,8),frame,0,h+.035,bz+.13);crest.scale.y=1.35;
    for(let i=0;i<15;i++)add(g,new THREE.SphereGeometry(.024,6,4),frame,-w*.42+i*w*.84/14,seatY+.21,d*.46);
  } else {
    const resin=def.silhouette==='resin',legR=resin?.047:.035;
    // True crossing folding supports, hinge hardware and a curved back panel.
    for(const x of [-w*.42,w*.42]){
      rod(g,[x,.055,d*.5],[x,seatY+.02,-d*.35],legR,frame);
      rod(g,[x,.055,-d*.48],[x,seatY+.02,d*.35],legR,frame);
      rod(g,[x,seatY-.1,-d*.35],[x,h-.10,-d*.50],legR,frame);
      const hinge=add(g,new THREE.CylinderGeometry(.075,.075,.06,10),feet,x,.9,0);hinge.rotation.z=Math.PI/2;
    }
    rod(g,[-w*.42,.35,d*.36],[w*.42,.35,d*.36],.026,frame);
    rod(g,[-w*.42,seatY-.12,-d*.32],[w*.42,seatY-.12,-d*.32],.027,frame);
    panel(g,w*.91,resin?.32:.48,.075,frame,0,h-.24,-d*.48,{handle:!resin,bend:.075});
    if(resin)box(g,w*.88,.045,d*.89,cushion,0,seatY+.082,0,.02);
  }
  for(const x of [-w*.42,w*.42])for(const z of [-d*.43,d*.43])add(g,new THREE.CylinderGeometry(.058,.067,.065,8),feet,x,.032,z);
  return mergeParts(g);
}
function texture(draw,w=256,h=256){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;}
function woodMap(base='#d6b58c'){return texture((c,w,h)=>{c.fillStyle=base;c.fillRect(0,0,w,h);for(let i=0;i<100;i++){const y=(i*37)%h;c.strokeStyle=i%3?'rgba(89,52,20,.13)':'rgba(255,243,204,.22)';c.lineWidth=.4+(i%3)*.3;c.beginPath();c.moveTo(0,y);c.bezierCurveTo(w*.3,y+Math.sin(i)*4,w*.7,y-Math.cos(i)*5,w,y+Math.sin(i)*2);c.stroke();}},512,128);}
function fabricMaterial(color){const map=texture((c,w,h)=>{c.fillStyle='#fff';c.fillRect(0,0,w,h);for(let i=0;i<w;i+=4){c.fillStyle='rgba(65,65,65,.045)';c.fillRect(i,0,1,h);c.fillRect(0,i,w,1);}},128,128);map.repeat.set(6,6);const m=new THREE.MeshPhysicalMaterial({color:linenColorHex(color),map,roughness:.94,sheen:.65,sheenRoughness:.9,side:THREE.DoubleSide});m.name='Linen fabric';return m;}
export function tableProfile(o) {
  const definition=tableById(o.tableId),silhouette=definition?.silhouette || (o.shape==='round'?'dining-round':'banquet-rect');
  const height=silhouette==='cocktail-pedestal'?3.5:2.5,w=(silhouette==='sweetheart-half-round'?o.modelWidthFt:0)||o.widthFt||5,d=(silhouette==='sweetheart-half-round'?o.modelDepthFt:0)||o.depthFt||5;
  let drop=height-.06,sideDrop=drop,endDrop=drop;
  const linen=linenById(o.linenId),roundSize=linen?.roundSizeIn||{'linen-round-90':90,'linen-round-108':108,'linen-round-120':120}[o.linenId];
  if(roundSize)drop=Math.max(0,Math.min(drop,(roundSize/12-w)/2));
  if(o.linenId==='linen-banquet-54x120'){sideDrop=Math.min(drop,(4.5-Math.min(w,d))/2);endDrop=Math.min(drop,(10-Math.max(w,d))/2);}
  if(o.linenId==='linen-banquet-72x120'){sideDrop=Math.min(drop,(6-Math.min(w,d))/2);endDrop=Math.min(drop,(10-Math.max(w,d))/2);}
  if(linen?.clothWidthIn){sideDrop=Math.min(drop,(linen.clothWidthIn/12-Math.min(w,d))/2);endDrop=Math.min(drop,(linen.clothLengthIn/12-Math.max(w,d))/2);}
  return {silhouette,height,w,d,drop,sideDrop:Math.max(0,sideDrop),endDrop:Math.max(0,endDrop),stretch:/spandex|cocktail-cover/.test(o.linenId||'')};
}
function halfRoundShape(w,d){
  const shape=new THREE.Shape();shape.moveTo(-w/2,-d/2);shape.lineTo(w/2,-d/2);
  shape.absellipse(0,-d/2,w/2,d,0,Math.PI,false,0);shape.closePath();return shape;
}
function halfRoundPerimeter(w,d,f){
  // A straight back and a continuous elliptical arc share one closed boundary.
  // Arc sampling is parametric; the linen follows the exact tabletop silhouette.
  if(f<=.4)return {x:-w/2+w*f/.4,z:-d/2,nx:0,nz:-1};
  const a=(f-.4)/.6*Math.PI,x=Math.cos(a)*w/2,z=-d/2+Math.sin(a)*d;
  const nx=Math.cos(a)/(w/2),nz=Math.sin(a)/d,length=Math.hypot(nx,nz);
  return {x,z,nx:nx/length,nz:nz/length};
}
function halfRoundRim(g,p,material){
  const vertices=[],uv=[],indices=[],segments=100;
  for(let i=0;i<=segments;i++){
    // A 0.003-foot edge reveal prevents coplanar fighting in both WebGL and
    // static catalog renderers; the nominal planning footprint is unchanged.
    const q=halfRoundPerimeter(p.w+.006,p.d+.006,i/segments);
    for(const y of [p.height-.1,p.height]){vertices.push(q.x,y,q.z);uv.push(i/segments,y);}
    if(i<segments){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const rim=add(g,geometry,material);rim.name='Half-round silver edge';
}
function drape(g,o,p,m) {
  const round=o.shape==='round',halfRound=p.silhouette==='sweetheart-half-round',segments=round?72:80,rows=12,vertices=[],uv=[],indices=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=segments;i++){
    const t=j/rows,a=i/segments*Math.PI*2;
    let x,z,nx,nz,drop;
    if(round){nx=Math.cos(a);nz=Math.sin(a);x=nx*p.w/2;z=nz*p.d/2;drop=p.drop;}
    else if(halfRound){({x,z,nx,nz}=halfRoundPerimeter(p.w,p.d,i/segments));drop=p.drop;}
    else {const perimeter=2*(p.w+p.d),s=i/segments*perimeter;
      if(s<p.w){x=-p.w/2+s;z=-p.d/2;nx=0;nz=-1;}
      else if(s<p.w+p.d){x=p.w/2;z=-p.d/2+s-p.w;nx=1;nz=0;}
      else if(s<2*p.w+p.d){x=p.w/2-(s-p.w-p.d);z=p.d/2;nx=0;nz=1;}
      else{x=-p.w/2;z=p.d/2-(s-2*p.w-p.d);nx=-1;nz=0;}
      const atLongEdge=p.w>=p.d?nz!==0:nx!==0;drop=atLongEdge?p.sideDrop:p.endDrop;
    }
    const fold=Math.sin(a*(round?18:24)+.4)*.055*Math.pow(t,.65)+Math.sin(a*7)*.015*t;
    const inset=.04+(p.stretch?-.48*Math.sin(Math.PI*Math.max(0,(t-.06)/.94)):.04*t);
    x+=nx*(fold+inset);z+=nz*(fold+inset);
    vertices.push(x,p.height+.015-drop*t,z);uv.push(i/segments,t);
    if(i<segments&&j<rows){const k=j*(segments+1)+i;indices.push(k,k+1,k+segments+1,k+1,k+segments+2,k+segments+1);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();add(g,geometry,m,0,0,0,'Draped linen');
  if(round)add(g,new THREE.CylinderGeometry(p.w/2+.045,p.w/2+.045,.025,72),m,0,p.height+.02,0,'Linen tabletop');
  else if(halfRound)horizontalSlab(g,halfRoundShape(p.w+.09,p.d+.09),.025,m,p.height+.033);
  else box(g,p.w+.09,.025,p.d+.09,m,0,p.height+.02,0,.012);
}
function tableLegs(g,p,metal,feet){
  const long=Math.max(p.w,p.d),short=Math.min(p.w,p.d),turned=p.d>p.w;
  const position=(x,y,z)=>turned?[z,y,x]:[x,y,z];
  for(const x of [-long*.29,long*.29]){
    for(const z of [-short*.31,short*.31])rod(g,position(x,.06,z),position(x,p.height-.1,z*.82),.055,metal);
    rod(g,position(x,.22,-short*.31),position(x,.22,short*.31),.052,metal);
    rod(g,position(x,p.height-.5,0),position(x-Math.sign(x)*.8,p.height-.1,0),.035,metal);
    for(const z of [-short*.31,short*.31]){const v=position(x,.04,z);box(g,.16,.08,.16,feet,...v,.025);}
  }
}
export function makeTable(o) {
  const p=tableProfile(o),g=new THREE.Group(),wood=mat('#fff',{map:woodMap(p.silhouette==='sweetheart-half-round'?'#b77d50':'#d6b58c'),roughness:.62}),metal=mat('#6d7475',{metalness:.65,roughness:.32}),feet=mat('#303536');
  g.name=tableById(o.tableId)?.name || 'Table';g.userData={itemId:o.id,kind:'table',profile:p};
  const definition=tableById(o.tableId),visualModelId=definition?.visualModelId||definition?.id||o.tableId||'';
  const plastic=p.silhouette==='banquet-rect'&&visualModelId.split('--')[0]==='banquet-6ft',topMat=plastic?mat('#f3f1e7',{roughness:.62}):wood;
  wood.name='Wood tabletop';metal.name='Folding table supports';feet.name='Table feet';
  if(plastic){topMat.name='White plastic folding tabletop';metal.color.set('#34393a');metal.metalness=.35;metal.roughness=.5;}
  if(p.silhouette==='fillchill-tub'){
    const tub=mat('#22272a',{roughness:.74});tub.name='Fill and Chill basin';
    const legs=mat('#24292c',{metalness:.3,roughness:.6});legs.name='Black folding basin supports';
    g.userData.asset=equipmentAssetDescriptor(tableById(o.tableId)||{},'fill-chill');
    box(g,p.w,.12,p.d,tub,0,p.height-.38,0,.055);
    for(const z of [-p.d/2+.06,p.d/2-.06])box(g,p.w,.4,.12,tub,0,p.height-.2,z,.04);
    for(const x of [-p.w/2+.06,p.w/2-.06])box(g,.12,.4,p.d-.12,tub,x,p.height-.2,0,.04);
    add(g,new THREE.CylinderGeometry(.07,.07,.016,12),metal,p.w*.3,p.height-.31,0,'Basin drain');
    tableLegs(g,{...p,height:p.height-.4},legs,feet);
  } else if(p.silhouette==='sweetheart-half-round'){
    horizontalSlab(g,halfRoundShape(p.w,p.d),.1,wood,p.height);
    const rim=mat('#c5cbcb',{metalness:.72,roughness:.36,side:THREE.DoubleSide});rim.name='Silver table edge and fasteners';halfRoundRim(g,p,rim);
    // Reference: silver folding tube sets, dark hinged braces and timber apron.
    for(const x of [-p.w*.27,p.w*.27]){
      const back=-p.d*.34,front=p.d*.14;
      for(const z of [back,front]){
        const sign=z===back?-1:1,footZ=z+sign*p.d*.08;
        curvedRod(g,[[x,.055,footZ],[x,.60,footZ],[x,.95,z],[x,p.height-.12,z]],.05,metal,14);
        add(g,new THREE.CylinderGeometry(.058,.06,.085,10),feet,x,.0425,footZ);
      }
      rod(g,[x,.92,back],[x,.92,front],.044,metal);
      flatRail(g,[x,.96,(back+front)/2],[x-Math.sign(x)*p.w*.16,p.height-.14,(back+front)/2],.075,.04,feet);
    }
    box(g,p.w*.80,.26,.065,wood,0,p.height-.22,-p.d*.31,.01);
    for(const x of [-p.w*.33,0,p.w*.33])for(const z of [-p.d*.30,p.d*.12])add(g,new THREE.CylinderGeometry(.021,.021,.004,10),rim,x,p.height+.002,z);
  } else if(p.silhouette==='cocktail-pedestal'){
    add(g,new THREE.CylinderGeometry(p.w/2,p.w/2,.1,48),wood,0,p.height-.05,0);
    rod(g,[0,.08,0],[0,p.height-.1,0],.075,metal,12);
    for(const a of [0,Math.PI/2]){const foot=box(g,p.w*.85,.1,.17,metal,0,.065,0,.04);foot.rotation.y=a;}
  } else {
    if(o.shape==='round')add(g,new THREE.CylinderGeometry(p.w/2,p.w/2,.10,64),topMat,0,p.height-.05,0);
    else if(plastic){
      // Two molded top halves retain the narrow center folding seam in the photo.
      const alongX=p.w>=p.d,long=Math.max(p.w,p.d),short=Math.min(p.w,p.d);
      for(const side of [-1,1])box(g,alongX?long/2-.005:short,.13,alongX?short:long/2-.005,topMat,alongX?side*(long/4+.0025):0,p.height-.065,alongX?0:side*(long/4+.0025),.03);
      for(const sign of [-1,1])box(g,alongX?.18:.24,.10,alongX?.24:.18,metal,alongX?0:sign*short*.32,p.height-.15,alongX?sign*short*.32:0,.025);
    } else box(g,p.w,.10,p.d,topMat,0,p.height-.05,0,.045);
    tableLegs(g,p,metal,feet);
  }
  if(o.linenId){
    const fabric=fabricMaterial(o.linenColor || 'White');
    if(o.linenId==='linen-napkins'){
      // This catalog item is priced individually; represent the single selected napkin.
      const napkin=box(g,.7,.035,.5,fabric,0,p.height+.025,0,.014);napkin.rotation.y=.22;
    }else if(o.linenId==='linen-runner-9ft'){
      const alongX=p.w>=p.d,length=Math.max(p.w,p.d),width=1.1,drop=Math.max(0,(9-length)/2);
      box(g,alongX?length:width,.025,alongX?width:length,fabric,0,p.height+.025,0,.01);
      for(const side of [-1,1])box(g,alongX?.028:width,drop,alongX?width:.028,fabric,alongX?side*(length/2+.018):0,p.height-drop/2,alongX?0:side*(length/2+.018),.008);
    }else drape(g,o,p,fabric);
  }
  mergeParts(g);
  const chairDef=chairById(o.chairId)||{},positions=o.hideChairs?[]:chairPositions({...o,widthFt:p.w,depthFt:p.d,...(p.silhouette==='sweetheart-half-round'?{rotationDeg:0}:{})},chairDef);
  if(positions.length){
    const prototype=makeChair(chairDef),dummy=new THREE.Object3D();
    for(const part of prototype.children){
      const batch=new THREE.InstancedMesh(part.geometry,part.material,positions.length);batch.name=part.name;batch.userData.role='chairs';
      positions.forEach((point,i)=>{dummy.position.set(point.x,0,point.y);dummy.rotation.set(0,-point.angle-Math.PI/2,0);dummy.updateMatrix();batch.setMatrixAt(i,dummy.matrix);});
      batch.castShadow=batch.receiveShadow=true;batch.instanceMatrix.needsUpdate=true;g.add(batch);
    }
    prototype.clear();
  }
  if(o.tabletop?.length){
    const tabletopItem=p.silhouette==='sweetheart-half-round'?{...o,widthFt:p.w,depthFt:p.d,rotationDeg:0}:o;
    g.add(mergeParts(makeTabletop(tabletopItem,p.height)));
  }
  g.traverse(mesh=>{mesh.userData.itemId=o.id;});return g;
}
export function makeDanceFloor(items,tent) {
  if(!items.length)return null;
  const minX=Math.min(...items.map(o=>o.x)),minY=Math.min(...items.map(o=>o.y)),maxX=Math.max(...items.map(o=>o.x+o.widthFt)),maxY=Math.max(...items.map(o=>o.y+o.depthFt)),cx=(minX+maxX)/2,cz=(minY+maxY)/2;
  const g=new THREE.Group(),grain=woodMap(),woods=['#ae7847','#bf8c56','#c59663'].map(color=>mat(color,{map:grain,roughness:.4,metalness:.02})),rim=mat('#8d9493',{metalness:.65,roughness:.32}),base=mat('#42392f');
  woods.forEach(m=>m.name='Parquet oak');rim.name='Floor edge trim';
  const occupied=(x,y)=>items.some(o=>x>o.x+.001&&x<o.x+o.widthFt-.001&&y>o.y+.001&&y<o.y+o.depthFt-.001);
  for(const o of items){const x=o.x+o.widthFt/2-cx,z=o.y+o.depthFt/2-cz;
    box(g,o.widthFt,.10,o.depthFt,base,x,.05,z,0);
    for(let qx=0;qx<2;qx++)for(let qz=0;qz<2;qz++)for(let strip=0;strip<6;strip++){
      const turned=(qx+qz)%2,tw=o.widthFt/2,td=o.depthFt/2;
      const sx=turned?tw/6:tw,sz=turned?td:td/6;
      const px=x-o.widthFt/2+qx*tw+(turned?(strip+.5)*sx:tw/2),pz=z-o.depthFt/2+qz*td+(turned?td/2:(strip+.5)*sz);
      const plank=box(g,sx-.009,.027,sz-.009,woods[(strip+qx+qz)%3],px,.114,pz,0);
      if(turned){plank.geometry.dispose();plank.geometry=new THREE.BoxGeometry(sz-.009,.027,sx-.009);plank.rotation.y=Math.PI/2;}
    }
    for(const side of [-1,1]){
      if(!occupied(o.x+o.widthFt/2,o.y+(side<0?-.02:o.depthFt+.02)))box(g,o.widthFt+.08,.09,.12,rim,x,.06,z+side*o.depthFt/2,.02);
      if(!occupied(o.x+(side<0?-.02:o.widthFt+.02),o.y+o.depthFt/2))box(g,.12,.09,o.depthFt+.08,rim,x+side*o.widthFt/2,.06,z,.02);
    }
  }
  mergeParts(g);g.position.set(cx-tent.widthFt/2,0,cz-tent.lengthFt/2);g.name='Parquet dance floor';
  g.userData={kind:'danceGroup',itemIds:items.map(o=>o.id)};g.traverse(q=>{q.userData.kind='danceGroup';q.userData.itemIds=g.userData.itemIds;});return g;
}

export function makeStandaloneChair(item){
  const chair=makeChair(chairById(item.chairId)||{});
  chair.rotation.y=-(item.rotationDeg||0)*Math.PI/180;
  chair.userData={itemId:item.id,kind:'chair'};
  chair.traverse(part=>{part.userData.itemId=item.id;});return chair;
}
