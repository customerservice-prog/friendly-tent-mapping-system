import * as THREE from 'three';
import { structuralProfile, computePerimeterStations } from '../data/tentStructure.js';
import { crownPoints } from '../core/tent-canopy.js';

const UP=new THREE.Vector3(0,1,0);
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.78,metalness:0,...extra});
const cyl=(r,h,m,n=12)=>new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,n),m);
function tube(a,b,r,m,n=10){
  const d=new THREE.Vector3().subVectors(b,a),q=cyl(r,d.length(),m,n);
  q.position.copy(a).add(b).multiplyScalar(.5);
  q.quaternion.setFromUnitVectors(UP,d.clone().normalize());
  q.castShadow=q.receiveShadow=true;return q;
}
function box(w,h,d,m,x=0,y=0,z=0){
  const q=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);q.position.set(x,y,z);q.castShadow=q.receiveShadow=true;return q;
}
function stage(root,key){
  const g=new THREE.Group();g.name='Tent setup · '+key;g.userData.setupStage=key;g.visible=false;root.add(g);return g;
}
function lineLoop(points,color=0x2c5f39){
  const geometry=new THREE.BufferGeometry().setFromPoints(points);
  const line=new THREE.LineLoop(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity:.78}));
  line.position.y=.035;return line;
}
function worker(x,z,ry=0,shirt=0xf2a93b,pose='stand'){
  const g=new THREE.Group();g.name='Tent crew worker';g.position.set(x,0,z);g.rotation.y=ry;g.userData.pose=pose;
  const skin=mat(0xc98d67),pants=mat(0x263744),top=mat(shirt),cap=mat(0x27352d),toolMat=mat(0x6e573f),metal=mat(0x565f61,{metalness:.55,roughness:.45});
  const crouch=pose==='kneel'||pose==='stake'||pose==='ratchet',lift=pose==='lift'||pose==='carry';
  const torsoY=crouch?1.56:2,body=cyl(.34,1.25,top,10);body.position.y=torsoY;if(crouch)body.rotation.x=.22;g.add(body);
  const legs=[-.17,.17].map((dx,i)=>{const q=cyl(.10,crouch?.82:1.25,pants,8);q.position.set(dx,crouch?.48:.7,crouch?(i?-.22:.22):0);if(crouch)q.rotation.x=i?.85:-.35;g.add(q);return q;});
  const head=new THREE.Mesh(new THREE.SphereGeometry(.26,12,8),skin);head.position.y=crouch?2.28:2.82;g.add(head);
  const hat=cyl(.28,.10,cap,12);hat.position.y=crouch?2.51:3.05;g.add(hat);
  const arms=[];
  for(const sx of [-1,1]){
    const arm=cyl(.075,.9,top,8);
    arm.position.set(sx*.39,crouch?1.65:2.02,lift?.34:0);
    arm.rotation.z=sx*(lift?1.08:(crouch?.48:.23));
    if(pose==='ratchet')arm.rotation.x=-.9;
    if(pose==='stake')arm.rotation.x=-.55;
    g.add(arm);arms.push(arm);
  }
  if(pose==='stake'){
    const handle=cyl(.035,1.4,toolMat,8);handle.position.set(.18,1.22,-.35);handle.rotation.x=.42;g.add(handle);
    const hammer=box(.52,.13,.16,metal,.18,1.82,-.65);hammer.rotation.z=.08;g.add(hammer);
  }else if(pose==='ratchet'){
    const ratchet=box(.32,.14,.12,metal,0,1.38,-.55);ratchet.rotation.x=.12;g.add(ratchet);
  }else if(pose==='carry'){
    const bar=cyl(.045,2.1,metal,10);bar.rotation.z=Math.PI/2;bar.position.set(0,2.32,-.22);g.add(bar);
  }
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return g;
}
function workersFor(group,positions){
  positions.forEach((p,i)=>group.add(worker(p[0],p[1],p[2]||0,p[3]|| (i%2?0x5b8c62:0xf2a93b),p[4]||'stand')));
}
function addStake(group,x,z,angle=.14){
  const steel=mat(0x444b4d,{metalness:.65,roughness:.4});
  const s=cyl(.035,1.3,steel,8);s.position.set(x,.28,z);s.rotation.z=angle;group.add(s);return s;
}
function perimeterStakePoints(tent){
  const hw=tent.widthFt/2,hl=tent.lengthFt/2,clear=tent.installationClearanceFt||5,stations=computePerimeterStations(tent.widthFt,tent.lengthFt);
  const pts=[];
  for(const s of stations){
    const x=s.x-hw,z=s.y-hl,edgeX=Math.abs(x)>hw-.1,edgeZ=Math.abs(z)>hl-.1;
    if(edgeX&&edgeZ){pts.push([x+Math.sign(x)*clear,z]);pts.push([x,z+Math.sign(z)*clear]);}
    else pts.push([x+(edgeX?Math.sign(x)*clear:0),z+(edgeZ?Math.sign(z)*clear:0)]);
  }
  return pts;
}
function footprintGuides(group,tent){
  const hw=tent.widthFt/2,hl=tent.lengthFt/2,guideMat=new THREE.LineBasicMaterial({color:0xf0c45a,transparent:true,opacity:.9});
  const diag=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-hw,.045,-hl),new THREE.Vector3(hw,.045,hl),new THREE.Vector3(-hw,.045,hl),new THREE.Vector3(hw,.045,-hl)]);
  const lines=new THREE.LineSegments(diag,guideMat);lines.name='Diagonal squaring tape';group.add(lines);
  for(const [x,z] of [[-hw,-hl],[hw,-hl],[hw,hl],[-hw,hl]]){
    const mark=new THREE.Mesh(new THREE.RingGeometry(.22,.32,16),new THREE.MeshBasicMaterial({color:0xffd56a,side:THREE.DoubleSide}));mark.rotation.x=-Math.PI/2;mark.position.set(x,.05,z);mark.name='Corner layout mark';group.add(mark);
  }
}
function foldedTop(group,tent,source){
  const roof=source?.getObjectByName('Continuous tensioned vinyl canopy');
  const material=roof?.material?.clone?.()||new THREE.MeshStandardMaterial({color:0xfafaf8,roughness:.82});
  const bundle=box(Math.max(4,tent.widthFt*.42),.32,Math.max(2.5,tent.lengthFt*.18),material,0,.20,-tent.lengthFt*.20);
  bundle.name='Folded tent top';group.add(bundle);
  const fold2=box(Math.max(3.4,tent.widthFt*.34),.26,Math.max(2.2,tent.lengthFt*.15),material,.55,.39,-tent.lengthFt*.15);fold2.rotation.y=.05;fold2.name='Folded tent top layer';group.add(fold2);
}
function halfPulledTop(group,tent,p,source){
  const roof=source?.getObjectByName('Continuous tensioned vinyl canopy');
  const material=roof?.material?.clone?.()||new THREE.MeshStandardMaterial({color:0xfafaf8,roughness:.82,side:THREE.DoubleSide});
  material.side=THREE.DoubleSide;
  const w=tent.widthFt,d=tent.lengthFt*.58,plane=new THREE.Mesh(new THREE.PlaneGeometry(w,d,12,8),material);
  plane.rotation.x=-Math.PI/2;plane.position.set(0,.48,-tent.lengthFt*.18);plane.name='Tent top halfway pulled across frame';plane.castShadow=plane.receiveShadow=true;group.add(plane);
}
function looseRatchets(group,tent,p){
  const hw=tent.widthFt/2,hl=tent.lengthFt/2,strap=mat(0xe6d9b8,{roughness:.95}),stations=computePerimeterStations(tent.widthFt,tent.lengthFt),stakes=perimeterStakePoints(tent);
  stations.forEach((s,i)=>{
    const x=s.x-hw,z=s.y-hl,target=stakes[Math.min(i,stakes.length-1)]||[x,z];
    const a=new THREE.Vector3(x,.32,z),b=new THREE.Vector3(target[0],.10,target[1]),mid=a.clone().lerp(b,.6);mid.y=.12;
    const first=tube(a,mid,.016,strap,8),second=tube(mid,b,.016,strap,8);first.name=second.name='Loose ratchet strap';group.add(first,second);
    const ratchet=box(.22,.10,.08,mat(0x9a9c98,{metalness:.4,roughness:.5}),mid.x,mid.y+.06,mid.z);ratchet.name='Loose ratchet body';group.add(ratchet);
  });
}
function frameCrownAssembly(group,tent,p){
  const steel=mat(0xbcc3c4,{metalness:.65,roughness:.4}),crowns=crownPoints(tent),rise=p.peakHeightFt-p.eaveHeightFt;
  const use=crowns.length?crowns:[{x:0,z:0}];
  use.forEach((c,i)=>{
    const center=new THREE.Vector3(c.x,.26,c.z),crown=new THREE.Mesh(new THREE.SphereGeometry(.24,10,7),steel);crown.position.copy(center);crown.name='Frame crown fitting';group.add(crown);
    for(const a of [-1.2,-.4,.4,1.2]){
      const end=new THREE.Vector3(c.x+a*3,.18,c.z+(i%2?1:-1)*2.8);
      group.add(tube(center,end,.065,steel));
    }
  });
  group.userData.frameRise=rise;
}
function perimeterFrameOnly(group,tent,p){
  const steel=mat(0xc3c8c9,{metalness:.68,roughness:.38}),hw=tent.widthFt/2,hl=tent.lengthFt/2,y=.35;
  group.add(tube(new THREE.Vector3(-hw,y,-hl),new THREE.Vector3(hw,y,-hl),.06,steel));
  group.add(tube(new THREE.Vector3(-hw,y,hl),new THREE.Vector3(hw,y,hl),.06,steel));
  group.add(tube(new THREE.Vector3(-hw,y,-hl),new THREE.Vector3(-hw,y,hl),.06,steel));
  group.add(tube(new THREE.Vector3(hw,y,-hl),new THREE.Vector3(hw,y,hl),.06,steel));
}
function poleSideStage(group,tent,p,source,{cornersOnly=false}={}){
  const steel=mat(0xc2c7c8,{metalness:.62,roughness:.4}),hw=tent.widthFt/2,hl=tent.lengthFt/2;
  const canopy=deformedCanopy(source,p,{edgeY:p.eaveHeightFt*.78,peakY:p.peakHeightFt,opacity:.96});if(canopy)group.add(canopy);
  const stations=computePerimeterStations(tent.widthFt,tent.lengthFt);
  stations.forEach(s=>{
    const x=s.x-hw,z=s.y-hl,isCorner=Math.abs(Math.abs(x)-hw)<.1&&Math.abs(Math.abs(z)-hl)<.1;
    if(cornersOnly&&!isCorner)return;
    const pole=cyl(p.sidePoleDiameterFt/2,p.eaveHeightFt,steel,12);pole.position.set(x,p.eaveHeightFt/2,z);group.add(pole);
  });
}
function ratchetStage(group,tent,p,source){
  poleSideStage(group,tent,p,source,{cornersOnly:false});looseRatchets(group,tent,p);
}
function dropCloth(group,tent){
  const cloth=new THREE.Mesh(new THREE.PlaneGeometry(tent.widthFt+3,tent.lengthFt+3),new THREE.MeshStandardMaterial({color:0x5f7b58,roughness:1,side:THREE.DoubleSide}));
  cloth.name='Protective drop cloth';cloth.rotation.x=-Math.PI/2;cloth.position.y=.025;cloth.receiveShadow=true;group.add(cloth);return cloth;
}
function deformedCanopy(source,p,{edgeY=.18,peakY=null,opacity=.96}={}){
  const sourceRoof=source?.getObjectByName('Continuous tensioned vinyl canopy');
  if(!sourceRoof?.geometry)return null;
  const geometry=sourceRoof.geometry.clone(),pos=geometry.attributes.position,peak=Number(peakY??p.peakHeightFt),span=Math.max(.1,p.peakHeightFt-p.eaveHeightFt);
  for(let i=0;i<pos.count;i++){
    const original=pos.getY(i),n=THREE.MathUtils.clamp((original-p.eaveHeightFt)/span,0,1);
    pos.setY(i,edgeY+n*(peak-edgeY));
  }
  pos.needsUpdate=true;geometry.computeVertexNormals();
  const material=sourceRoof.material.clone();material.transparent=opacity<1;material.opacity=opacity;material.side=THREE.DoubleSide;
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Tent top during installation';mesh.castShadow=mesh.receiveShadow=true;return mesh;
}
function frameTop(group,tent,p,eaveY=.35){
  const steel=mat(0xc3c8c9,{metalness:.68,roughness:.38}),hw=tent.widthFt/2,hl=tent.lengthFt/2,peakY=eaveY+(p.peakHeightFt-p.eaveHeightFt);
  group.add(tube(new THREE.Vector3(-hw,eaveY,-hl),new THREE.Vector3(hw,eaveY,-hl),.055,steel));
  group.add(tube(new THREE.Vector3(-hw,eaveY,hl),new THREE.Vector3(hw,eaveY,hl),.055,steel));
  group.add(tube(new THREE.Vector3(-hw,eaveY,-hl),new THREE.Vector3(-hw,eaveY,hl),.055,steel));
  group.add(tube(new THREE.Vector3(hw,eaveY,-hl),new THREE.Vector3(hw,eaveY,hl),.055,steel));
  const crowns=crownPoints(tent);
  if(crowns.length){
    for(const crown of crowns){
      const top=new THREE.Vector3(crown.x,peakY,crown.z);
      const nearZ=crown.z<=0?-hl:hl;
      for(const x of [-hw,0,hw])group.add(tube(new THREE.Vector3(x,eaveY,nearZ),top,.045,steel));
    }
    for(let i=1;i<crowns.length;i++)group.add(tube(new THREE.Vector3(crowns[i-1].x,peakY,crowns[i-1].z),new THREE.Vector3(crowns[i].x,peakY,crowns[i].z),.05,steel));
  }else{
    const top=new THREE.Vector3(0,peakY,0);
    for(const x of [-hw,hw])for(const z of [-hl,hl])group.add(tube(new THREE.Vector3(x,eaveY,z),top,.05,steel));
    group.add(tube(new THREE.Vector3(-hw,eaveY,0),top,.05,steel),tube(new THREE.Vector3(hw,eaveY,0),top,.05,steel));
  }
}
function frameParts(group,tent,p){
  const steel=mat(0xbcc3c4,{metalness:.65,roughness:.4}),hw=tent.widthFt/2,hl=tent.lengthFt/2;
  const parts=[
    [new THREE.Vector3(-hw,.18,-hl-2),new THREE.Vector3(hw,.18,-hl-2)],
    [new THREE.Vector3(-hw,.18,hl+2),new THREE.Vector3(hw,.18,hl+2)],
    [new THREE.Vector3(-hw-2,.18,-hl),new THREE.Vector3(-hw-2,.18,hl)],
    [new THREE.Vector3(hw+2,.18,-hl),new THREE.Vector3(hw+2,.18,hl)]
  ];
  parts.forEach(([a,b])=>group.add(tube(a,b,.07,steel)));
  const rise=p.peakHeightFt-p.eaveHeightFt;
  for(const sign of [-1,1]){
    const q=tube(new THREE.Vector3(-4*sign,.18,-1.4),new THREE.Vector3(4*sign,.18,-1.4),.065,steel);q.rotation.y=sign*.25;group.add(q);
  }
  const crown=new THREE.Mesh(new THREE.SphereGeometry(.22,10,7),steel);crown.position.set(0,.25,0);group.add(crown);
  group.userData.frameRise=rise;
}
function frameLiftStage(group,tent,p,source,oneSide=false){
  const hw=tent.widthFt/2,hl=tent.lengthFt/2,top=new THREE.Group();top.name=oneSide?'Frame top tilted for first-side leg install':'Raised frame top';
  frameTop(top,tent,p,0);
  const canopy=deformedCanopy(source,p,{edgeY:0,peakY:p.peakHeightFt-p.eaveHeightFt,opacity:.92});if(canopy)top.add(canopy);
  if(oneSide){
    const angle=-Math.atan2(p.eaveHeightFt,Math.max(4,tent.widthFt));
    const pivot=new THREE.Group();pivot.position.set(-hw,.25,0);top.position.x=hw;pivot.add(top);pivot.rotation.z=angle;group.add(pivot);
    const raisedX=hw;
    for(const z of [-hl,hl]){const leg=cyl(p.sidePoleDiameterFt/2,p.eaveHeightFt,mat(0xc3c8c9,{metalness:.68,roughness:.38}),12);leg.position.set(raisedX,p.eaveHeightFt/2,z);group.add(leg);}
  }else{
    top.position.y=p.eaveHeightFt;group.add(top);
    for(const x of [-hw,hw])for(const z of [-hl,hl]){const leg=cyl(p.sidePoleDiameterFt/2,p.eaveHeightFt,mat(0xc3c8c9,{metalness:.68,roughness:.38}),12);leg.position.set(x,p.eaveHeightFt/2,z);group.add(leg);}
  }
}
function poleParts(group,tent,p){
  const steel=mat(0xc2c7c8,{metalness:.62,roughness:.4}),hw=tent.widthFt/2,hl=tent.lengthFt/2;
  const stations=computePerimeterStations(tent.widthFt,tent.lengthFt);
  stations.forEach((s,i)=>{
    const x=s.x-hw,z=s.y-hl,dx=Math.sign(x||1)*1.4,dz=Math.sign(z||1)*1.4;
    const q=tube(new THREE.Vector3(x+dx,.12,z+dz),new THREE.Vector3(x+dx+2.5,.12,z+dz),p.sidePoleDiameterFt/2,steel);q.rotation.y=(i%3)*.22;group.add(q);
  });
  crownPoints(tent).forEach((c,i)=>{
    const q=tube(new THREE.Vector3(c.x-3,.14,c.z+2+i*.3),new THREE.Vector3(c.x+3,.14,c.z+2+i*.3),p.centerPoleDiameterFt/2,steel,14);group.add(q);
  });
}
function poleCenterStage(group,tent,p,source,{angled=false}={}){
  const steel=mat(0xc2c7c8,{metalness:.62,roughness:.4}),crowns=crownPoints(tent),peak=angled?Math.max(5,p.peakHeightFt*.58):p.peakHeightFt,edge=angled?.25:.65;
  const canopy=deformedCanopy(source,p,{edgeY:edge,peakY:peak,opacity:.95});if(canopy)group.add(canopy);
  crowns.forEach((c,i)=>{
    const bottom=angled?new THREE.Vector3(c.x+(i%2?2.6:-2.6),0,c.z+1.5):new THREE.Vector3(c.x,0,c.z);
    const top=new THREE.Vector3(c.x,peak,c.z);group.add(tube(bottom,top,p.centerPoleDiameterFt/2,steel,16));
  });
}
function finalAnchors(group,tent,anchor){
  const pts=perimeterStakePoints(tent);
  if(anchor==='ballast'){
    const concrete=mat(0xb9b5ad);
    pts.forEach(([x,z])=>group.add(box(1.15,1.45,1.15,concrete,x,.72,z)));
  }else pts.forEach(([x,z])=>addStake(group,x,z));
}
export function createTentSetupRig(tent,anchor,sourceTent){
  const root=new THREE.Group();root.name='Worker tent installation walkthrough';root.userData.decorative=true;
  const p=structuralProfile(tent.type,tent.widthFt,tent.lengthFt),hw=tent.widthFt/2,hl=tent.lengthFt/2;
  const groups={};
  const add=(key)=>groups[key]=stage(root,key);

  const measure=add('measure');
  measure.add(lineLoop([new THREE.Vector3(-hw,0,-hl),new THREE.Vector3(hw,0,-hl),new THREE.Vector3(hw,0,hl),new THREE.Vector3(-hw,0,hl)]));
  footprintGuides(measure,tent);
  workersFor(measure,[[-hw-4,-hl-3,.45,0xf2a93b,'carry'],[hw+4,hl+3,-2.4,0x5b8c62,'kneel']]);

  const layout=add('layout');
  layout.add(lineLoop([new THREE.Vector3(-hw,0,-hl),new THREE.Vector3(hw,0,-hl),new THREE.Vector3(hw,0,hl),new THREE.Vector3(-hw,0,hl)]));
  footprintGuides(layout,tent);
  perimeterStakePoints(tent).forEach(([x,z])=>addStake(layout,x,z));
  workersFor(layout,[[-hw-4,-hl-3,.5,0xf2a93b,'stake'],[hw+4,hl+3,-2.4,0x5b8c62,'stake']]);

  if(tent.type==='pole'){
    const folded=add('pole-top-folded');dropCloth(folded,tent);foldedTop(folded,tent,sourceTent);
    workersFor(folded,[[-hw-2,-1,.3,0xf2a93b,'carry'],[hw+2,1,-2.7,0x5b8c62,'lift']]);

    const top=add('top-ground');dropCloth(top,tent);const flat=deformedCanopy(sourceTent,p,{edgeY:.12,peakY:.23});if(flat)top.add(flat);
    workersFor(top,[[-hw-2,0,.4,0xf2a93b,'kneel'],[hw+2,0,-2.6,0x5b8c62,'kneel']]);

    const loose=add('ratchets-loose');dropCloth(loose,tent);const flatLoose=deformedCanopy(sourceTent,p,{edgeY:.12,peakY:.23});if(flatLoose)loose.add(flatLoose);looseRatchets(loose,tent,p);
    workersFor(loose,[[-hw-3,-hl+2,.8,0xf2a93b,'ratchet'],[hw+3,hl-2,-2.2,0x5b8c62,'ratchet']]);

    const staged=add('poles-staged');dropCloth(staged,tent);const flat2=deformedCanopy(sourceTent,p,{edgeY:.12,peakY:.23});if(flat2)staged.add(flat2);poleParts(staged,tent,p);looseRatchets(staged,tent,p);
    workersFor(staged,[[-hw-2,-hl+2,.8,0xf2a93b,'carry'],[hw+2,hl-2,-2.2,0x5b8c62,'carry']]);

    const centerPrep=add('center-assembled');dropCloth(centerPrep,tent);const flat3=deformedCanopy(sourceTent,p,{edgeY:.12,peakY:.23});if(flat3)centerPrep.add(flat3);centerPoleAssembly(centerPrep,tent,p);looseRatchets(centerPrep,tent,p);
    workersFor(centerPrep,[[-2,2,.25,0xf2a93b,'kneel'],[3,-1,-2.3,0x5b8c62,'carry']]);

    const angled=add('center-angled');dropCloth(angled,tent);poleCenterStage(angled,tent,p,sourceTent,{angled:true});looseRatchets(angled,tent,p);
    workersFor(angled,[[-2,2,.2,0xf2a93b,'lift'],[3,-1,-2.2,0x5b8c62,'lift']]);

    const center=add('center-up');poleCenterStage(center,tent,p,sourceTent,{angled:false});looseRatchets(center,tent,p);
    workersFor(center,[[-hw+2,hl+1,.2,0xf2a93b,'stand'],[hw-2,-hl-1,-2.5,0x5b8c62,'stand']]);

    const corners=add('corner-poles');poleSideStage(corners,tent,p,sourceTent,{cornersOnly:true});looseRatchets(corners,tent,p);
    workersFor(corners,[[-hw-1,-hl-1,.7,0xf2a93b,'lift'],[hw+1,hl+1,-2.4,0x5b8c62,'lift']]);

    const sides=add('side-poles');poleSideStage(sides,tent,p,sourceTent,{cornersOnly:false});looseRatchets(sides,tent,p);
    workersFor(sides,[[-hw-1,0,.65,0xf2a93b,'lift'],[hw+1,0,-2.5,0x5b8c62,'lift']]);

    const tension=add('pole-tension');ratchetStage(tension,tent,p,sourceTent);
    workersFor(tension,[[-hw-3,0,.7,0xf2a93b,'ratchet'],[hw+3,0,-2.4,0x5b8c62,'ratchet']]);

    const anchors=add('anchors');finalAnchors(anchors,tent,anchor);
    workersFor(anchors,[[-hw-3,0,.7,0xf2a93b,'stake'],[hw+3,0,-2.4,0x5b8c62,'stake']]);
  }else{
    const parts=add('frame-parts');frameParts(parts,tent,p);frameLegsStaged(parts,tent,p);
    workersFor(parts,[[-hw-3,-hl-2,.5,0xf2a93b,'carry'],[hw+3,hl+2,-2.5,0x5b8c62,'carry']]);

    const crown=add('frame-crown');frameCrownAssembly(crown,tent,p);frameLegsStaged(crown,tent,p);
    workersFor(crown,[[-3,-2,.4,0xf2a93b,'kneel'],[3,2,-2.4,0x5b8c62,'kneel']]);

    const perimeter=add('frame-perimeter');perimeterFrameOnly(perimeter,tent,p);frameCrownAssembly(perimeter,tent,p);frameLegsStaged(perimeter,tent,p);
    workersFor(perimeter,[[-hw-2,-hl-1,.6,0xf2a93b,'carry'],[hw+2,hl+1,-2.5,0x5b8c62,'carry']]);

    const topframe=add('frame-top');frameTop(topframe,tent,p,.35);frameLegsStaged(topframe,tent,p);
    workersFor(topframe,[[-hw-2,0,.6,0xf2a93b,'kneel'],[hw+2,0,-2.4,0x5b8c62,'kneel']]);

    const folded=add('frame-top-folded');dropCloth(folded,tent);frameTop(folded,tent,p,.35);foldedTop(folded,tent,sourceTent);frameLegsStaged(folded,tent,p);
    workersFor(folded,[[-hw-2,-hl+2,.5,0xf2a93b,'carry'],[hw+2,hl-2,-2.6,0x5b8c62,'lift']]);

    const halfway=add('frame-top-half');dropCloth(halfway,tent);frameTop(halfway,tent,p,.35);halfPulledTop(halfway,tent,p,sourceTent);frameLegsStaged(halfway,tent,p);
    workersFor(halfway,[[-hw-1,-hl+1,.5,0xf2a93b,'lift'],[hw+1,-hl+1,-2.6,0x5b8c62,'lift']]);

    const covered=add('frame-covered');dropCloth(covered,tent);frameTop(covered,tent,p,.35);const canopy=deformedCanopy(sourceTent,p,{edgeY:.40,peakY:.40+(p.peakHeightFt-p.eaveHeightFt)});if(canopy)covered.add(canopy);frameLegsStaged(covered,tent,p);
    workersFor(covered,[[-hw-2,-hl+2,.5,0xf2a93b,'kneel'],[hw+2,hl-2,-2.6,0x5b8c62,'kneel']]);

    const strapped=add('frame-strapped');dropCloth(strapped,tent);frameTop(strapped,tent,p,.35);const canopy2=deformedCanopy(sourceTent,p,{edgeY:.40,peakY:.40+(p.peakHeightFt-p.eaveHeightFt)});if(canopy2)strapped.add(canopy2);topStraps(strapped,tent,p);frameLegsStaged(strapped,tent,p);
    workersFor(strapped,[[-hw-2,0,.5,0xf2a93b,'ratchet'],[hw+2,0,-2.5,0x5b8c62,'ratchet']]);

    const side=add('frame-one-side');frameLiftStage(side,tent,p,sourceTent,true);
    workersFor(side,[[-hw-2,-hl-1,.4,0xf2a93b,'lift'],[hw+1,hl+1,-2.4,0x5b8c62,'lift'],[hw+1,-hl+1,-2.4,0xf2a93b,'lift']]);

    const raised=add('frame-raised');frameLiftStage(raised,tent,p,sourceTent,false);
    workersFor(raised,[[-hw-2,0,.4,0xf2a93b,'stand'],[hw+2,0,-2.4,0x5b8c62,'stand']]);

    const anchors=add('anchors');finalAnchors(anchors,tent,anchor);
    workersFor(anchors,[[-hw-3,0,.7,0xf2a93b,anchor==='ballast'?'carry':'stake'],[hw+3,0,-2.4,0x5b8c62,anchor==='ballast'?'carry':'stake']]);
  }

  root.userData.show=function(key){
    Object.entries(groups).forEach(([name,g])=>{g.visible=name===key;});
  };
  root.userData.hide=function(){Object.values(groups).forEach(g=>g.visible=false);};
  root.userData.groups=groups;
  return root;
}

