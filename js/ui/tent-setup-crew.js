import * as THREE from 'three';
const UP=new THREE.Vector3(0,1,0);
function material(color){return new THREE.MeshStandardMaterial({color,roughness:.85});}
// Shared geometry keeps the articulated crew small. All coordinates are feet.
export function createSetupCrew(count=4){
  const root=new THREE.Group();root.name='Installation crew';
  const cylinder=new THREE.CylinderGeometry(1,1,1,8),sphere=new THREE.SphereGeometry(1,10,8),cube=new THREE.BoxGeometry(1,1,1);
  const navy=material(0x243943),orange=material(0xeaa344),green=material(0x557b6e),shoe=material(0x252d2b),skin=[material(0xb67450),material(0x774d38),material(0xdca67c)],stripe=material(0xe8e6bd),steel=material(0x778383);
  function mesh(geo,mat,scale,position,parent){const m=new THREE.Mesh(geo,mat);m.scale.set(...scale);m.position.set(...position);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
  const workers=Array.from({length:count},(_,i)=>{
    const person=new THREE.Group();person.name='Crew member '+(i+1);root.add(person);
    const body=new THREE.Group();person.add(body);const shirt=i%2?green:orange;
    mesh(cube,shirt,[1.02,1.48,.56],[0,3.53,0],body);
    for(const x of [-.3,.3])mesh(cube,stripe,[.09,1.35,.015],[x,3.53,.29],body);
    mesh(cylinder,skin[i%3],[.15,.27,.15],[0,4.36,0],body);
    mesh(sphere,skin[i%3],[.35,.44,.34],[0,4.84,0],body);
    mesh(sphere,navy,[.37,.19,.36],[0,5.17,0],body);
    mesh(cube,navy,[.53,.055,.27],[0,5.12,.31],body);
    const limbs=[];
    for(const side of [-1,1]){
      const arm=new THREE.Group();arm.position.set(side*.62,4.1,0);body.add(arm);
      mesh(cylinder,shirt,[.16,.84,.16],[0,-.42,0],arm);
      const forearm=new THREE.Group();forearm.position.y=-.84;arm.add(forearm);
      mesh(cylinder,skin[i%3],[.125,.83,.125],[0,-.415,0],forearm);
      mesh(sphere,skin[i%3],[.14,.18,.13],[0,-.88,0],forearm);
      const leg=new THREE.Group();leg.position.set(side*.28,2.85,0);person.add(leg);
      mesh(cylinder,navy,[.22,1.3,.22],[0,-.65,0],leg);
      const shin=new THREE.Group();shin.position.y=-1.3;leg.add(shin);
      mesh(cylinder,navy,[.18,1.25,.18],[0,-.625,0],shin);
      mesh(cube,shoe,[.4,.26,.69],[0,-1.4,.14],shin);
      limbs.push({arm,forearm,leg,shin,side});
    }
    const tool=new THREE.Group();tool.name='Stake driver';person.add(tool);
    mesh(cube,orange,[.42,.65,.44],[0,.52,0],tool);mesh(cylinder,steel,[.07,.8,.07],[0,-.2,0],tool);
    mesh(cube,navy,[.95,.10,.10],[0,.72,0],tool);
    return {person,body,limbs,tool};
  });
  function pose(i,position,target,action='walk',phase=0){
    const w=workers[i],cycle=phase*Math.PI*8,walking=action==='walk',kneeling=action==='ratchet'||action==='connect';
    w.person.position.copy(position);w.person.rotation.y=Math.atan2(target.x-position.x,target.z-position.z);
    w.body.rotation.x=kneeling?.3:action==='pull'?.12:0;
    w.body.position.y=kneeling?-.8:walking?Math.abs(Math.sin(cycle))*.07:0;
    for(const l of w.limbs){
      l.leg.rotation.x=walking?Math.sin(cycle+l.side)*.38:kneeling?l.side*.55:0;
      l.shin.rotation.x=kneeling?-.8:Math.min(0,-Math.sin(cycle+l.side)*.35)*(walking?1:0);
      l.arm.rotation.x=walking?Math.sin(cycle-l.side)*.38:action==='lift'?-2.1:action==='pull'?-1.1:kneeling?-.65:-1.05;
      l.arm.rotation.z=action==='lift'?l.side*-.16:0;
      l.forearm.rotation.x=walking?-.12:action==='lift'?-.25:kneeling?-.6-Math.sin(cycle)*.3:-.8;
      l.leg.position.y=kneeling?2.05:2.85;
    }
    w.tool.visible=action==='drive';w.tool.position.set(0,2.25+Math.sin(cycle*6)*.035,1.0);
  }
  root.userData={workers,pose};return root;
}
