import * as THREE from 'three';
import { structuralProfile, computePerimeterStations } from '../data/tentStructure.js';
import { canopyHeight, crownPoints } from '../core/tent-canopy.js';
import { tentSetupSteps, setupFrame, phaseProgress, smooth, stagger, clamp01 } from '../core/tent-setup-timeline.js';
import { createSetupCrew } from './tent-setup-crew.js';

const UP=new THREE.Vector3(0,1,0),V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.8,...extra});
const mix=THREE.MathUtils.lerp;
export function createTentSetupRig(tent,anchor,sourceTent,{sidewalls=false}={}){
  const root=new THREE.Group();root.name='Continuous tent installation';root.userData.decorative=true;
  const p=structuralProfile(tent.type,tent.widthFt,tent.lengthFt),w=tent.widthFt,l=tent.lengthFt,hw=w/2,hl=l/2;
  const pole=tent.type==='pole',popup=tent.type==='canopy',ballast=anchor==='ballast'&&!pole;
  const steps=tentSetupSteps(tent,{sidewalls,anchor:ballast?'ballast':'stake'});
  const steel=material(0xbec6cb,{metalness:.55,roughness:.4}),wood=material(0xba976b),black=material(0x364240),strapMat=material(0xe6bf68),vinyl=material(0xfbfaf4,{side:THREE.DoubleSide,roughness:.88});
  const unitCylinder=new THREE.CylinderGeometry(1,1,1,8),unitBox=new THREE.BoxGeometry(1,1,1),unitSphere=new THREE.SphereGeometry(1,8,6);
  const dummy=new THREE.Object3D(),direction=V();
  function batch(name,geometry,mat,count){const q=new THREE.InstancedMesh(geometry,mat,Math.max(1,count));q.name=name;q.castShadow=q.receiveShadow=true;q.frustumCulled=false;q.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(q);return q;}
  function instance(q,i,position,scale,rotation=null){dummy.position.copy(position);dummy.scale.copy(scale);dummy.quaternion.identity();if(rotation)dummy.quaternion.copy(rotation);dummy.updateMatrix();q.setMatrixAt(i,dummy.matrix);}
  function segment(q,i,a,b,r){direction.subVectors(b,a);dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.scale.set(r,Math.max(.0001,direction.length()),r);dummy.quaternion.setFromUnitVectors(UP,direction.normalize());dummy.updateMatrix();q.setMatrixAt(i,dummy.matrix);}
  function commit(...meshes){meshes.forEach(q=>q.instanceMatrix.needsUpdate=true);}
  // Add the exact corners even for non-10-foot inventory sizes (e.g. 30 x 45).
  const corners=[{x:-hw,z:-hl},{x:hw,z:-hl},{x:hw,z:hl},{x:-hw,z:hl}];
  const seen=new Set(),stations=[];
  for(const s of [...corners,...computePerimeterStations(w,l).map(s=>({x:s.x-hw,z:s.y-hl}))]){
    const key=s.x+':'+s.z;if(seen.has(key))continue;seen.add(key);
    stations.push({...s,corner:Math.abs(s.x)===hw&&Math.abs(s.z)===hl});
  }
  const remaining=stations.filter(s=>!s.corner).sort((a,b)=>Math.atan2(a.z/hl,a.x/hw)-Math.atan2(b.z/hl,b.x/hw));
  const sideStations=[...corners.map(s=>({...s,corner:true})),...remaining];
  const crowns=crownPoints(tent),clear=Number(tent.installationClearanceFt)||p.stakeClearanceFt;
  const anchors=[];
  sideStations.forEach((s,station)=>{
    const dx=Math.abs(s.x)===hw?Math.sign(s.x):0,dz=Math.abs(s.z)===hl?Math.sign(s.z):0;
    if(pole&&s.corner){anchors.push({x:s.x+dx*clear,z:s.z,station},{x:s.x,z:s.z+dz*clear,station},{x:s.x+dx*clear*.707,z:s.z+dz*clear*.707,station});}
    else anchors.push({x:s.x+dx*(ballast?.85:clear),z:s.z+dz*(ballast?.85:clear),station});
  });
  const sidePoles=batch('Full length side poles',unitCylinder,pole?wood:steel,sideStations.length);
  const centerPoles=batch('Full length center poles',unitCylinder,steel,crowns.length);
  const feet=batch('Pole foot plates',unitCylinder,black,sideStations.length+crowns.length);
  const stakes=batch(ballast?'Ballast at frame anchors':'Perimeter stakes',ballast?unitBox:unitCylinder,ballast?material(0xb4b1a6):steel,anchors.length);
  const heads=batch('Anchor heads',unitSphere,steel,anchors.length);
  const buckles=batch('Ratchet buckles',unitBox,steel,anchors.length);
  const handles=batch('Moving ratchet handles',unitBox,black,anchors.length);
  const straps=batch('Slack to taut anchor straps',unitCylinder,strapMat,anchors.length*6);
  const coils=batch('Secured strap tails',unitBox,strapMat,anchors.length);
  const supports=sideStations.map(()=>({bottom:V(),top:V(),raised:0})),centers=crowns.map(()=>({bottom:V(),top:V(),raised:0}));

  const cloth=new THREE.Mesh(new THREE.PlaneGeometry(w+4,l+4),material(0x6b8265,{side:THREE.DoubleSide}));cloth.name='Protective drop cloth';cloth.rotation.x=-Math.PI/2;cloth.receiveShadow=true;root.add(cloth);
  const clothRoll=new THREE.Mesh(unitCylinder,material(0x566f51));clothRoll.name='Rolling ground cloth';clothRoll.rotation.z=Math.PI/2;root.add(clothRoll);
  const sourceRoof=sourceTent?.getObjectByName('Continuous tensioned vinyl canopy');
  const geo=sourceRoof?.geometry.clone()||new THREE.PlaneGeometry(w,l,Math.ceil(w),Math.ceil(l)).rotateX(-Math.PI/2);
  const roof=new THREE.Mesh(geo,vinyl);roof.name='Fabric following the lifted supports';roof.castShadow=roof.receiveShadow=true;roof.frustumCulled=false;root.add(roof);
  const rest=new Float32Array(geo.attributes.position.array),pos=geo.attributes.position;
  if(!sourceRoof)for(let i=0;i<pos.count;i++)rest[i*3+1]=canopyHeight(tent,p,rest[i*3],rest[i*3+2]);
  // Delicate panel lines are updated with the same deformation as the fabric.
  const seamRest=[],seamVertices=[];
  for(let x=-hw+10;x<hw;x+=10)for(let z=-hl;z<hl;z+=1){seamRest.push([x,z],[x,Math.min(hl,z+1)]);seamVertices.push(0,0,0,0,0,0);}
  for(let z=-hl+10;z<hl;z+=10)for(let x=-hw;x<hw;x+=1){seamRest.push([x,z],[Math.min(hw,x+1),z]);seamVertices.push(0,0,0,0,0,0);}
  const seamsGeo=new THREE.BufferGeometry();seamsGeo.setAttribute('position',new THREE.Float32BufferAttribute(seamVertices,3));
  const seams=new THREE.LineSegments(seamsGeo,new THREE.LineBasicMaterial({color:0xd6d2c8,transparent:true,opacity:.38}));seams.frustumCulled=false;root.add(seams);
  const foldedTop=new THREE.Mesh(unitCylinder,vinyl);foldedTop.name='Unrolling tent top';foldedTop.rotation.z=Math.PI/2;root.add(foldedTop);

  const markPts=[...corners,corners[0]].map(s=>V(s.x,.05,s.z));
  const markGeo=new THREE.BufferGeometry().setFromPoints(markPts);
  const marks=new THREE.Line(markGeo,new THREE.LineDashedMaterial({color:0xf0d68e,dashSize:1,gapSize:.65}));marks.computeLineDistances();root.add(marks);
  const tapeGeo=new THREE.BufferGeometry().setFromPoints([V(-hw,.07,-hl),V(hw,.07,hl),V(hw,.07,-hl),V(-hw,.07,hl)]);
  const tape=new THREE.LineSegments(tapeGeo,new THREE.LineBasicMaterial({color:0xeac96c}));root.add(tape);
  const cases=new THREE.Group();cases.name='Staged tent bags & tools';root.add(cases);
  for(let i=0;i<3;i++){const bag=new THREE.Mesh(new THREE.BoxGeometry(2.4,.7,1.3),material(0x40594b));bag.position.set(-hw-5,.35,-hl+2+i*1.8);bag.castShadow=true;cases.add(bag);}
  const cones=batch('Work area markers',new THREE.ConeGeometry(.3,.85,8),material(0xe89b3f),4);
  corners.forEach((c,i)=>instance(cones,i,V(c.x+Math.sign(c.x)*(clear+2.5),.425,c.z+Math.sign(c.z)*(clear+2.5)),V(1,1,1)));commit(cones);

  // A single rigid roof frame rotates about its supported side during the lifts.
  const beams=[];
  if(!pole){
    const rise=p.peakHeightFt-p.eaveHeightFt,hip=Math.min(hw,hl),a=-hl+hip,b=hl-hip;
    const beam=(from,to)=>{if(from.distanceTo(to)>.01)beams.push({a:from,b:to});};
    const ridgeZ=[...new Set([a,b,0,...Array.from({length:Math.ceil((b-a)/10)},(_,i)=>a+i*10)])].filter(z=>z>=a&&z<=b).sort((x,y)=>x-y);
    ridgeZ.forEach(z=>{beam(V(-hw,0,z),V(0,rise,z));beam(V(hw,0,z),V(0,rise,z));});
    beam(V(0,rise,a),V(0,rise,b));
    for(const sign of [-1,1])for(const sx of [-1,1])beam(V(sx*hw,0,sign*hl),V(0,rise,sign<0?a:b));
    for(let i=0;i<sideStations.length;i++){
      const s=sideStations[i];
      const next=sideStations.filter(n=>n!==s&&((s.z===n.z&&Math.abs(s.z)===hl&&n.x>s.x)||(s.x===n.x&&Math.abs(s.x)===hw&&n.z>s.z))).sort((a,b)=>Math.hypot(a.x-s.x,a.z-s.z)-Math.hypot(b.x-s.x,b.z-s.z))[0];
      if(next)beam(V(s.x,0,s.z),V(next.x,0,next.z));
    }
  }
  const frameBeams=batch('Assembled roof tubing',unitCylinder,steel,beams.length);
  const fittings=batch('Frame connection fittings',unitSphere,steel,beams.length*2);
  const braces=batch('Folding scissor braces',unitCylinder,steel,popup?sideStations.length*2:0);
  const frameState={angle:0,y:.28,expand:1};
  function framePoint(point){
    const x=point.x*frameState.expand,y=point.y,z=point.z*frameState.expand;
    return V(-hw*frameState.expand+(x+hw*frameState.expand)*Math.cos(frameState.angle)-y*Math.sin(frameState.angle),frameState.y+(x+hw*frameState.expand)*Math.sin(frameState.angle)+y*Math.cos(frameState.angle),z);
  }
  // Clone all owned resources: disposing the walkthrough never disposes the
  // real event's fabric textures, geometry or sidewall materials.
  const wallGroup=new THREE.Group();wallGroup.name='Selected sidewalls being clipped';root.add(wallGroup);
  const originalWalls=sourceTent?.getObjectByName('Sidewalls');
  for(const panel of originalWalls?.children||[]){const copy=panel.clone(true);copy.traverse(o=>{if(o.geometry)o.geometry=o.geometry.clone();if(o.material){const clone=m=>{const c=m.clone();for(const k of Object.keys(c))if(c[k]?.isTexture)c[k]=c[k].clone();return c;};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);}});wallGroup.add(copy);}
  const valance=new THREE.Group();valance.name='Finished sewn valance';root.add(valance);
  sourceTent?.getObjectByName('Thin sewn valance')?.traverse(o=>{if(o.isMesh){const copy=new THREE.Mesh(o.geometry.clone(),vinyl);copy.position.copy(o.position);copy.quaternion.copy(o.quaternion);copy.scale.copy(o.scale);copy.castShadow=true;valance.add(copy);}});
  const crew=createSetupCrew(4);root.add(crew);
  const focus=new THREE.Mesh(new THREE.RingGeometry(.8,1.02,32),new THREE.MeshBasicMaterial({color:0xe6b255,side:THREE.DoubleSide,transparent:true,opacity:.8,depthWrite:false}));focus.rotation.x=-Math.PI/2;focus.position.y=.045;root.add(focus);
  const phase=(id,t)=>phaseProgress(steps,id,t);
  let cachedTime=-1;
  function update(time){
    const f=setupFrame(steps,time),t=f.time;if(t===cachedTime)return f;cachedTime=t;
    const P=id=>phase(id,t),clothIn=smooth(P('cloth')),topIn=smooth(P('top')),clothOut=pole?smooth(P('cloth-away')):smooth(P(popup?'frame-raise':'frame-first'));
    const tension=smooth(P('tension')),anchorIn=P('anchors'),strapIn=pole?P('straps'):anchorIn;
    const sideIn=P('sides'),cornerIn=P('corners'),centerIn=P('center-angle'),centerUp=P('center-up');
    marks.visible=P('top')<1;tape.visible=f.step.id==='layout';cases.visible=P('check')<.8;
    cloth.visible=clothIn>0&&clothOut<1;cloth.scale.set(1,Math.max(.001,clothIn*(1-clothOut)),1);
    cloth.position.set(pole?0:-w-2,.03,-(l+4)/2+(l+4)*clothIn*(1-clothOut)/2);
    clothRoll.visible=cloth.visible;clothRoll.scale.set(.24*(1+clothOut),(w+4),.24*(1+clothOut));clothRoll.position.set(cloth.position.x,.27,-(l+4)/2+(l+4)*clothIn*(1-clothOut));
    frameState.expand=popup?mix(.15,1,smooth(P('expand'))):1;
    const first=smooth(P('frame-first')),second=smooth(P('frame-second'));
    frameState.angle=popup?0:Math.asin(Math.min(.7,(p.eaveHeightFt-.28)/w))*first*(1-second);
    frameState.y=popup?mix(.7,p.eaveHeightFt,smooth(P('frame-raise'))):mix(.28,p.eaveHeightFt,second);
    for(let i=0;i<sideStations.length;i++){
      const s=sideStations[i],support=supports[i],n=V(Math.abs(s.x)===hw?Math.sign(s.x):0,0,Math.abs(s.z)===hl?Math.sign(s.z):0).normalize();
      let raised;
      if(pole){
        raised=s.corner?stagger(cornerIn,i,4):stagger(sideIn,i-4,remaining.length);
        const angle=raised*Math.PI/2;
        support.top.set(s.x,.13+(p.eaveHeightFt-.13)*Math.sin(angle),s.z);
        const dx=Math.sqrt(Math.max(0,p.eaveHeightFt**2-support.top.y**2));
        support.bottom.copy(support.top).addScaledVector(n,dx);support.bottom.y=0;
      }else{
        raised=popup?smooth(P('frame-raise')):(s.x>0?first:second);
        const top=framePoint(V(s.x,0,s.z));support.top.copy(top);
        support.bottom.set(top.x,Math.max(0,top.y-p.eaveHeightFt),top.z);
        if(top.y<p.eaveHeightFt){const dx=Math.sqrt(Math.max(0,p.eaveHeightFt**2-top.y**2));support.bottom.addScaledVector(n,dx);support.bottom.y=0;}
      }
      support.raised=raised;
      segment(sidePoles,i,support.bottom,support.top,p.sidePoleDiameterFt/2);
      instance(feet,i,support.bottom,V(.16,.05,.16));
    }
    sidePoles.visible=pole?P('straps')>0:P(popup?'expand':'frame-first')>0;
    for(let i=0;i<crowns.length;i++){
      const c=crowns[i],support=centers[i],raised=stagger(centerIn,i,crowns.length),upright=stagger(centerUp,i,crowns.length);
      // Fixed physical length; the peak and foot follow a circular lift.
      const angle=mix(Math.PI/2-.008,.38,raised)*(1-upright),h=p.peakHeightFt;
      support.top.set(c.x,Math.cos(angle)*h,c.z);support.bottom.set(c.x-Math.sin(angle)*h,0,c.z);support.raised=raised;
      segment(centerPoles,i,support.bottom,support.top,p.centerPoleDiameterFt/2);
      instance(feet,sideStations.length+i,support.bottom,V(.2,.05,.2));
    }
    centerPoles.visible=pole&&P('center-angle')>0;feet.visible=sidePoles.visible;commit(sidePoles,centerPoles,feet);
    const connected=P('frame-connect'),partsIn=P('frame-parts');
    beams.forEach((beam,i)=>{
      const q=popup?1:stagger(connected,i,beams.length,.5),mid=beam.a.clone().add(beam.b).multiplyScalar(.5),delta=beam.b.clone().sub(beam.a),length=delta.length();
      // Each complete-length tube is lifted from a ground staging position to
      // its connection. The roof assembly is then lifted as a rigid unit.
      const flat=V(delta.x,0,delta.z).normalize().multiplyScalar(length/2);
      const a0=V(mid.x,.16,mid.z).sub(flat),b0=V(mid.x,.16,mid.z).add(flat);
      const a=a0.lerp(framePoint(beam.a),q),b=b0.lerp(framePoint(beam.b),q);
      segment(frameBeams,i,a,b,.064);instance(fittings,2*i,a,V(.115,.115,.115).multiplyScalar(q));instance(fittings,2*i+1,b,V(.115,.115,.115).multiplyScalar(q));
    });
    frameBeams.visible=!pole&&(popup?P('expand')>0:partsIn>0);fittings.visible=frameBeams.visible;commit(frameBeams,fittings);
    braces.visible=popup&&P('expand')>0;
    if(popup){
      sideStations.forEach((s,i)=>{
        const next=sideStations[(i+1)%sideStations.length],a=framePoint(V(s.x,-.7,s.z)),b=framePoint(V(next.x,-.7,next.z));
        segment(braces,2*i,a.clone().add(V(0,-1,0)),b,.035);segment(braces,2*i+1,a,b.clone().add(V(0,-1,0)),.035);
      });commit(braces);
    }
    function fabricPoint(x,z,finalY){
      let y=.14;
      if(pole){
        const edgeFade=clamp01(Math.max(Math.abs(x)/hw,Math.abs(z)/hl));
        // Individual supports lift their neighboring fabric. The unfinished
        // perimeter keeps a visible drape between completed pole positions.
        for(let i=0;i<supports.length;i++){
          const s=supports[i],dist=Math.hypot((x-s.top.x)/Math.max(7,w*.32),(z-s.top.z)/Math.max(7,l*.18));
          y=Math.max(y,.14+(s.top.y-.14)*Math.max(0,1-dist*.64)*edgeFade);
        }
        for(const c of centers){const dist=Math.hypot((x-c.top.x)/hw,(z-c.top.z)/Math.max(hw,10));y=Math.max(y,.14+(c.top.y-.14)*Math.max(0,1-dist*.7));}
        const allUp=Math.min(...supports.map(s=>s.raised),...centers.map(c=>clamp01((c.top.y-p.peakHeightFt*.92)/(p.peakHeightFt*.08))));
        y=mix(y,finalY,allUp);
        y-=Math.sin(Math.PI*clamp01((x+hw)/w))*Math.sin(Math.PI*clamp01((z+hl)/l))*(1-tension)*allUp*.85;
      }else{
        const final=framePoint(V(x,finalY-p.eaveHeightFt,z));
        return V(final.x,final.y+.035+Math.sin(z*1.6)*.11*(1-topIn),mix(-hl,final.z,topIn));
      }
      return V(x,y+.08*Math.sin(z*2.1+x)*topIn*(1-topIn),mix(-hl,z,topIn));
    }
    roof.visible=topIn>0;seams.visible=roof.visible;
    for(let i=0;i<pos.count;i++){const v=fabricPoint(rest[3*i],rest[3*i+2],rest[3*i+1]);pos.setXYZ(i,v.x,v.y,v.z);}
    pos.needsUpdate=true;geo.computeVertexNormals();
    const seamPos=seamsGeo.attributes.position;
    seamRest.forEach(([x,z],i)=>{const v=fabricPoint(x,z,canopyHeight(tent,p,x,z));seamPos.setXYZ(i,v.x,v.y+.025,v.z);});seamPos.needsUpdate=true;
    foldedTop.visible=topIn>0&&topIn<1;foldedTop.scale.set(.22,w,.22);foldedTop.position.set(0,pole?.42:Math.max(.45,frameState.y+.35),mix(-hl,hl,topIn));
    const activeAnchor=Math.min(anchors.length-1,Math.floor((f.step.id==='tension'?P('tension'):anchorIn)*anchors.length));
    const strapStart=pole?P('straps'):anchorIn;
    anchors.forEach((a,i)=>{
      const placed=stagger(anchorIn,i,anchors.length,.6),s=supports[a.station],top=s.top.clone();
      const bottom=V(a.x,ballast?1.45:.26,a.z);
      instance(stakes,i,V(a.x,ballast?.75:(.72-.7*placed),a.z),ballast?V(1.1,1.5,1.1).multiplyScalar(placed):V(.037,1.5,.037).multiplyScalar(placed));
      instance(heads,i,V(a.x,ballast?1.5:1.48-.7*placed,a.z),V(.075,.05,.075).multiplyScalar(ballast?0:placed));
      const attached=stagger(strapStart,i,anchors.length,.75),tight=stagger(P('tension'),i,anchors.length,.4);
      const buckle=bottom.clone().lerp(top,.14);
      instance(buckles,i,buckle,V(.17,.12,.24).multiplyScalar(attached));
      const handle=buckle.clone().add(V(0,.17+(i===activeAnchor&&f.step.id==='tension'?Math.sin(t*14)*.09:0),0));
      instance(handles,i,handle,V(.10,.05,.3).multiplyScalar(attached));
      const curve=[];
      for(let k=0;k<=6;k++){const amount=k/6,v=bottom.clone().lerp(top,amount);v.y=Math.max(.10,v.y-Math.sin(Math.PI*amount)*.9*(1-tight));curve.push(v);}
      for(let k=0;k<6;k++)segment(straps,i*6+k,curve[k],curve[k+1],.028*attached);
      instance(coils,i,buckle.clone().add(V(.12,-.16,0)),V(.12,.24,.10).multiplyScalar(tight));
    });
    stakes.visible=heads.visible=anchorIn>0;buckles.visible=handles.visible=straps.visible=coils.visible=strapIn>0;commit(stakes,heads,buckles,handles,straps,coils);
    valance.visible=tension>0;valance.scale.y=Math.max(.001,tension);valance.position.y=p.eaveHeightFt*(1-tension);
    const wallIn=P('walls');wallGroup.children.forEach((panel,i)=>{const v=stagger(wallIn,i,wallGroup.children.length);panel.visible=v>0;panel.scale.y=Math.max(.001,v);panel.position.y=(p.eaveHeightFt-.35)*(1-v);});
    // Pose follows the work position. Walking occupies the approach portion of
    // every stage, with articulated lifting, driving and ratcheting afterward.
    const id=f.step.id;
    function targetFor(stepIndex,i,local){
      const id=steps[Math.max(0,stepIndex)].id,side=i%2?1:-1,front=i<2?-1:1;
      if(id==='anchors'||id==='straps'||id==='tension'){
        const travel=clamp01(local)*Math.ceil(anchors.length/4),visit=Math.floor(travel),blend=smooth((travel-visit)/.45);
        const at=index=>{const a=anchors[Math.min(anchors.length-1,Math.max(0,index)*4+i)],s=sideStations[a.station],normal=V(a.x-s.x,0,a.z-s.z).normalize();return {position:V(a.x,0,a.z).addScaledVector(normal,1.3),target:V(a.x,0,a.z)};};
        const previous=at(Math.max(0,visit-1)),current=at(visit);
        return {position:previous.position.lerp(current.position,blend),target:current.target,action:blend<1&&visit>0?'walk':id==='anchors'&&!ballast?'drive':'ratchet'};
      }
      if(id==='center-angle'||id==='center-up'){
        const c=centers[Math.min(centers.length-1,Math.floor(local*Math.max(1,centers.length)))];
        if(c){return {position:c.bottom.clone().add(V(side*1.0,0,front*.8)),target:c.top.clone(),action:'lift'};}
      }
      if(id==='corners'||id==='sides'){
        const list=id==='corners'?sideStations.slice(0,4):remaining,index=(Math.floor(local*Math.ceil(list.length/4))*4+i)%Math.max(1,list.length),s=list[index]||corners[i];
        return {position:V(s.x+(Math.abs(s.x)===hw?Math.sign(s.x)*1.1:0),0,s.z+(Math.abs(s.z)===hl?Math.sign(s.z)*1.1:0)),target:V(s.x,3,s.z),action:'lift'};
      }
      if(id.startsWith('frame-')&&id!=='frame-parts'&&id!=='frame-connect'||id==='expand'){
        const x=id==='frame-first'?hw:id==='frame-second'?-hw:side*hw,point=framePoint(V(x,0,(i/3-.5)*l*.85));
        return {position:V(point.x+Math.sign(x)*1.3,0,point.z),target:point,action:'lift'};
      }
      if(id==='cloth'||id==='cloth-away'||id==='top')return {position:V((pole||id==='top'?0:-w-2)+side*(hw+1.3),0,mix(-hl,hl,local)*.9),target:V(0,1,mix(-hl,hl,local)),action:'pull'};
      if(id==='frame-connect')return {position:V(side*(hw+1.2),0,front*hl*(1-local*.4)),target:V(0,1,0),action:'connect'};
      const a=local*Math.PI*.5+i*Math.PI/2;
      return {position:V(Math.cos(a)*(hw+clear+1),0,Math.sin(a)*(hl+clear+1)),target:V(0,1,0),action:'walk'};
    }
    for(let i=0;i<4;i++){
      const target=targetFor(f.index,i,f.local),previous=targetFor(f.index-1,i,1),approach=smooth(f.local/.25);
      const position=previous.position.clone().lerp(target.position,approach);
      crew.userData.pose(i,position,approach<1?target.position:target.target,approach<1?'walk':target.action,t*.33+i*.2);
    }
    const focusTask=targetFor(f.index,0,f.local);focus.visible=['anchors','corners','center-angle','center-up','sides','tension','frame-connect'].includes(id);focus.position.copy(focusTask.target);focus.position.y=.045;
    root.userData.focus=focusTask.target.clone();
    root.userData.supports=supports;root.userData.centers=centers;root.userData.frame=f;
    return f;
  }
  root.userData.setCutaway=value=>{vinyl.transparent=!!value;vinyl.opacity=value?.3:1;vinyl.depthWrite=!value;vinyl.needsUpdate=true;};
  root.userData.update=update;root.userData.steps=steps;root.userData.duration=steps.at(-1).end;
  root.userData.crew=crew;root.userData.profile=p;root.userData.framePoint=framePoint;root.userData.anchors=anchors;
  root.userData.hide=()=>{root.visible=false;};
  update(0);return root;
}
