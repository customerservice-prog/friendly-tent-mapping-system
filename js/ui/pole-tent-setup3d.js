import * as THREE from 'three';
import { structuralProfile, computePerimeterStations } from '../data/tentStructure.js';
import { crownPoints } from '../core/tent-canopy.js';
import { setupSteps, sampleSetup, stagger, ease, clamp01 } from '../core/tent-setup-timeline.js?v=20261003-detailed-install-v2';

// Temporary installation model: the customer's finished tent is never deformed.
// All temporary geometries/materials are owned here and released on stop/replay.
export function createPoleTentSetup(root,tent){
  const group=new THREE.Group();group.name='Pole tent installation walkthrough';
  group.position.copy(root.position);group.quaternion.copy(root.quaternion);group.scale.copy(root.scale);
  const profile=structuralProfile(tent.type,tent.widthFt,tent.lengthFt);
  const hw=tent.widthFt/2,hl=tent.lengthFt/2,edge=profile.eaveHeightFt,peak=profile.peakHeightFt;
  const materials=[],geometries=[];
  const mat=(color)=>{const m=new THREE.MeshStandardMaterial({color,roughness:.85});materials.push(m);return m;};
  const steel=mat(0xbcc2c6),dark=mat(0x343d39),vinyl=mat(0xfffdf4),green=mat(0x355748),skin=mat(0xba8567),vest=mat(0xf0ad32),pants=mat(0x263444);
  vinyl.side=THREE.DoubleSide;
  const mesh=(geometry,material,parent=group)=>{geometries.push(geometry);const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  const box=(w,h,d,m,parent)=>mesh(new THREE.BoxGeometry(w,h,d),m,parent);
  const cylinder=(radius,length,m,parent)=>mesh(new THREE.CylinderGeometry(radius,radius,length,10),m,parent);
  const UP=new THREE.Vector3(0,1,0),a=new THREE.Vector3(),b=new THREE.Vector3(),direction=new THREE.Vector3();
  function between(object,from,to){direction.copy(to).sub(from);object.position.copy(from).add(to).multiplyScalar(.5);object.scale.y=Math.max(.001,direction.length());object.quaternion.setFromUnitVectors(UP,direction.normalize());}

  const guideMaterial=new THREE.LineBasicMaterial({color:0xf0c85c,transparent:true,opacity:.92});materials.push(guideMaterial);
  const guidePoints=[
    new THREE.Vector3(-hw,.045,-hl),new THREE.Vector3(hw,.045,-hl),
    new THREE.Vector3(hw,.045,-hl),new THREE.Vector3(hw,.045,hl),
    new THREE.Vector3(hw,.045,hl),new THREE.Vector3(-hw,.045,hl),
    new THREE.Vector3(-hw,.045,hl),new THREE.Vector3(-hw,.045,-hl),
    new THREE.Vector3(-hw,.05,-hl),new THREE.Vector3(hw,.05,hl),
    new THREE.Vector3(hw,.05,-hl),new THREE.Vector3(-hw,.05,hl)
  ];
  const guideGeometry=new THREE.BufferGeometry().setFromPoints(guidePoints);geometries.push(guideGeometry);
  const layoutGuide=new THREE.LineSegments(guideGeometry,guideMaterial);layoutGuide.name='Tent footprint and diagonal squaring guides';group.add(layoutGuide);

  const tarp=box(tent.widthFt+2,.025,tent.lengthFt+2,green);tarp.position.y=.02;
  const originalRoof=root.getObjectByName('Continuous tensioned vinyl canopy');
  const roof=mesh(originalRoof.geometry.clone(),vinyl);roof.name='Canopy lifted by installation poles';
  roof.frustumCulled=false;
  const positions=roof.geometry.attributes.position,original=positions.array.slice();
  const crowns=crownPoints(tent).sort((a,b)=>a.z-b.z);
  const stations=computePerimeterStations(tent.widthFt,tent.lengthFt).map(p=>({x:p.x-hw,z:p.y-hl}));
  const corners=stations.filter(p=>Math.abs(p.x)>hw-.1&&Math.abs(p.z)>hl-.1);
  const sides=stations.filter(p=>!corners.includes(p));
  const makePole=(point,height,center=false)=>{
    const body=cylinder(center?profile.centerPoleDiameterFt/2:profile.sidePoleDiameterFt/2,1,steel);
    const tip=new THREE.Vector3(point.x,.12,point.z),foot=new THREE.Vector3();
    const outward=center?new THREE.Vector3(1,0,0):new THREE.Vector3(point.x/hw,0,point.z/hl).normalize();
    return {point,height,body,tip,foot,outward,center};
  };
  const cornerPoles=corners.map(p=>makePole(p,edge)),sidePoles=sides.map(p=>makePole(p,edge)),centerPoles=crowns.map(p=>makePole(p,peak,true));
  const allPoles=[...cornerPoles,...sidePoles,...centerPoles];
  const anchors=[];
  const clearance=Number(tent.installationClearanceFt)||profile.stakeClearanceFt;
  for(const point of stations){
    const xEdge=Math.abs(point.x)>hw-.1,zEdge=Math.abs(point.z)>hl-.1;
    const targets=xEdge&&zEdge?[[point.x+Math.sign(point.x)*clearance,point.z],[point.x,point.z+Math.sign(point.z)*clearance]]:[[point.x+(xEdge?Math.sign(point.x)*clearance:0),point.z+(zEdge?Math.sign(point.z)*clearance:0)]];
    for(const [x,z] of targets){
      const stake=cylinder(.04,.8,dark),strap=cylinder(.024,1,vinyl),ratchet=box(.2,.14,.1,steel);
      const pole=allPoles.find(p=>!p.center&&p.point===point);
      anchors.push({x,z,stake,strap,ratchet,pole});
    }
  }
  // Keep the selected wall geometry, sharing only immutable geometry/materials.
  const originalWalls=root.getObjectByName('Sidewalls'),walls=originalWalls?.clone(true);
  if(walls){group.add(walls);walls.visible=false;}
  const steps=setupSteps(!!walls?.children.length);
  function worker(){
    const person=new THREE.Group();group.add(person);
    const torso=box(.95,1.6,.5,vest,person);torso.position.y=3.45;
    const head=mesh(new THREE.SphereGeometry(.34,12,8),skin,person);head.position.y=4.65;
    const cap=mesh(new THREE.SphereGeometry(.37,12,8,0,Math.PI*2,0,Math.PI/2),dark,person);cap.position.y=4.75;
    const limbs=[];
    for(const side of [-1,1]){
      const arm=new THREE.Group();arm.position.set(side*.59,4.03,0);person.add(arm);
      const sleeve=cylinder(.13,.85,vest,arm);sleeve.position.y=-.42;
      const forearm=cylinder(.11,.75,skin,arm);forearm.position.set(0,-1.1,.08);limbs.push(arm);
      const leg=new THREE.Group();leg.position.set(side*.25,2.65,0);person.add(leg);
      const trouser=cylinder(.19,2.3,pants,leg);trouser.position.y=-1.15;
      const boot=box(.36,.35,.65,dark,leg);boot.position.set(0,-2.48,.13);limbs.push(leg);
    }
    const hammer=new THREE.Group();person.add(hammer);hammer.position.set(.55,2.65,-.34);
    const hammerHandle=cylinder(.045,1.25,dark,hammer);hammerHandle.rotation.z=.5;
    const hammerHead=box(.48,.16,.18,steel,hammer);hammerHead.position.set(.29,.45,0);hammerHead.rotation.z=.5;
    const ratchetTool=box(.38,.16,.13,steel,person);ratchetTool.position.set(0,2.45,-.58);
    const tapeMeasure=cylinder(.22,.13,green,person);tapeMeasure.rotation.z=Math.PI/2;tapeMeasure.position.set(.36,2.55,-.45);
    hammer.visible=ratchetTool.visible=tapeMeasure.visible=false;
    person.scale.setScalar(1.12);
    return {person,limbs,torso,tools:{hammer,ratchet:ratchetTool,tape:tapeMeasure}};
  }
  const crew=[worker(),worker()];
  const heights=new Float32Array(cornerPoles.length);
  const samples=[];
  // Static vertex weights avoid searching all poles every animation frame.
  for(let i=0;i<positions.count;i++){
    const x=original[i*3],z=original[i*3+2];
    let right=crowns.findIndex(p=>p.z>=z);if(right<0)right=crowns.length-1;
    const left=Math.max(0,right-1),span=(crowns[right]?.z||0)-(crowns[left]?.z||0);
    samples.push({u:clamp01((x+hw)/(2*hw)),v:clamp01((z+hl)/(2*hl)),left,right,blend:span?clamp01((z-crowns[left].z)/span):0,cross:Math.pow(clamp01(1-Math.abs(x)/hw),.55)});
  }
  function movePole(pole,lift,tension,laid){
    pole.body.visible=laid>0;
    const height=.13+(pole.height-.13)*lift;
    // A pole retains its full length; its foot walks inward as its tip rises.
    pole.tip.set(pole.point.x,height,pole.point.z);
    const lean=(pole.center?1:.97)+tension*(pole.center?0:.03);
    pole.tip.y=.13+(height-.13)*lean;
    const run=Math.sqrt(Math.max(0,(pole.height-.08)**2-(pole.tip.y-.08)**2));
    pole.foot.copy(pole.tip).addScaledVector(pole.outward,run);pole.foot.y=.08;
    between(pole.body,pole.foot,pole.tip);
  }
  let lastTarget=new THREE.Vector3(-hw-4,0,-hl-4),target=lastTarget.clone(),lastJob='';
  function update(seconds,reverse=false){
    const sampled=sampleSetup(seconds,steps,reverse),p=sampled.progress,tension=ease(p.tension||0),laid=ease(p.layout||0),staged=ease(p.poles||0);
    const cornerLift=cornerPoles.map((pole,i)=>stagger(p.corners||0,i,cornerPoles.length));
    const centerLift=centerPoles.map((pole,i)=>stagger(p.centers||0,i,centerPoles.length));
    const sideLift=sidePoles.map((pole,i)=>stagger(p.sides||0,i,sidePoles.length));
    cornerPoles.forEach((pole,i)=>{movePole(pole,cornerLift[i],tension,staged);heights[i]=pole.tip.y;});
    centerPoles.forEach((pole,i)=>movePole(pole,centerLift[i],tension,staged));
    sidePoles.forEach((pole,i)=>movePole(pole,sideLift[i],tension,staged));
    layoutGuide.visible=(p.measure||0)>0&&(p.layout||0)<.02;
    roof.visible=laid>0;roof.scale.x=Math.max(.035,laid);
    tarp.visible=(p.tension||0)<.95&&laid>0;
    for(let i=0;i<positions.count;i++){
      const s=samples[i];let base=0;
      corners.forEach((c,n)=>{base+=heights[n]*(c.x<0?1-s.u:s.u)*(c.z<0?1-s.v:s.v);});
      // Unsupported cloth sags between the four corner supports.
      const sag=(Math.sin(Math.PI*s.u)+Math.sin(Math.PI*s.v))*.9*(1-(p.sides||0));
      base=Math.max(.12,base-sag);
      base+=(edge-base)*ease(p.sides||0);
      const raised=(centerLift[s.left]||0)*(1-s.blend)+(centerLift[s.right]||0)*s.blend;
      let y=base+(original[i*3+1]-base)*raised*s.cross;
      y+=(original[i*3+1]-y)*tension;
      positions.setY(i,Math.max(.12,y));
    }
    positions.needsUpdate=true;roof.geometry.computeVertexNormals();
    anchors.forEach((anchor,i)=>{
      const stakeProgress=stagger(p.anchors||0,i,anchors.length),strapProgress=stagger(p.ratchets||0,i,anchors.length);
      anchor.stake.visible=stakeProgress>0;anchor.strap.visible=anchor.ratchet.visible=strapProgress>0;
      anchor.stake.position.set(anchor.x,.08+(1-stakeProgress)*.75,anchor.z);
      a.copy(anchor.pole.tip);b.set(anchor.x,.12,anchor.z);
      between(anchor.strap,a,b);anchor.ratchet.position.copy(a).lerp(b,.58);
    });
    if(walls){walls.visible=(p.walls||0)>0;walls.scale.y=Math.max(.001,ease(p.walls||0));}
    const phase=sampled.step.id;
    const jobs=phase==='measure'?corners:phase==='anchors'||phase==='ratchets'||phase==='tension'?anchors:phase==='poles'?[...cornerPoles,...centerPoles,...sidePoles]:phase==='centerPrep'?centerPoles:phase==='corners'?cornerPoles:phase==='centers'?centerPoles:phase==='sides'?sidePoles:[];
    const phaseProgress=p[phase]||0,jobIndex=Math.min(jobs.length-1,Math.floor(phaseProgress*Math.max(1,jobs.length)));
    const job=jobs[jobIndex],jobKey=phase+':'+jobIndex;
    if(jobKey!==lastJob){lastTarget.copy(target);if(job?.point)target.set(job.point.x,0,job.point.z);else if(job)target.set(job.x,0,job.z);else target.set(-hw-2,0,-hl+2);lastJob=jobKey;}
    const fraction=phaseProgress* Math.max(1,jobs.length)%1,travel=ease(Math.min(1,(reverse?1-fraction:fraction)*3));
    crew.forEach((w,i)=>{
      w.person.visible=!sampled.done;
      w.person.position.copy(lastTarget).lerp(target,travel);w.person.position.x+=i?1.4:-1.4;w.person.position.z+=1.25;
      w.person.lookAt(target.x,0,target.z);
      const work=travel>=.99,beat=Math.sin(seconds*7+i*.6),lifting=['corners','centers','sides'].includes(phase);
      w.limbs[0].rotation.x=work?(lifting?-1.65:-.7+beat*.25):beat*.35;
      w.limbs[2].rotation.x=work?(lifting?-1.65:-.7-beat*.25):-beat*.35;
      w.limbs[1].rotation.x=work?0:-beat*.25;w.limbs[3].rotation.x=work?0:beat*.25;
      w.torso.rotation.x=work&&['anchors','ratchets','tension'].includes(phase)?.25:0;
      Object.values(w.tools).forEach(tool=>{tool.visible=false;});
      if(work&&phase==='anchors')w.tools.hammer.visible=true;
      if(work&&['ratchets','tension'].includes(phase))w.tools.ratchet.visible=true;
      if(phase==='measure')w.tools.tape.visible=true;
    });
    return sampled;
  }
  root.parent.add(group);
  const wasVisible=root.visible;root.visible=false;
  return {group,steps,update,dispose(){root.visible=wasVisible;group.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
