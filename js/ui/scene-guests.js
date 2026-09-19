import * as THREE from 'three';
import { chairPositions } from '../core/seating.js';
import { byId as chairById } from '../data/chairs.js';

// Decorative scale figures. No layout objects, catalog products or quote rows.
// All people share four instanced meshes, including animated arms and legs.
export function guestPositions(tent,objects,limit=32) {
  const seats=[];
  for(const item of objects){
    if(item.kind!=='table'||!item.seatCount)continue;
    for(const p of chairPositions(item,chairById(item.chairId)||{})){
      if(seats.length>=limit)break;
      seats.push({x:item.x+item.widthFt/2-tent.widthFt/2+p.x,z:item.y+item.depthFt/2-tent.lengthFt/2+p.y,heading:-p.angle-Math.PI/2,seated:true});
    }
  }
  // Walk along the open foreground, beyond the complete stake envelope.
  const front=tent.lengthFt/2+Math.max(5,tent.installationClearanceFt||0)+4;
  seats.push({x:-5,z:front,heading:Math.PI/2,seated:false},{x:5,z:front+2.3,heading:-Math.PI/2,seated:false});
  return seats;
}
export function createGuests(tent,objects,{mobile=false}={}) {
  const group=new THREE.Group();group.name='Preview guests';group.userData.decorative=true;
  const people=guestPositions(tent,objects,mobile?24:40),dummy=new THREE.Object3D();
  const skin=['#d6a078','#9c6249','#edc3a2','#633b2c'],shirts=['#c1d8dd','#f6eddb','#667d72','#ad6c55','#546986','#c9a6ac'],trousers=['#39434e','#b6a590','#5b6356'],hair=['#30281f','#654833','#ac8a54','#242329'];
  const categories={skin:{count:people.length*7,geometry:new THREE.SphereGeometry(1,10,7)},cloth:{count:people.length*7,geometry:new THREE.CylinderGeometry(1,1,1,8)},body:{count:people.length,geometry:new THREE.SphereGeometry(1,12,8)},detail:{count:people.length*3,geometry:new THREE.SphereGeometry(1,10,6)}};
  for(const cat of Object.values(categories)){cat.mesh=new THREE.InstancedMesh(cat.geometry,new THREE.MeshStandardMaterial({roughness:.88}),cat.count);cat.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);cat.mesh.castShadow=cat.mesh.receiveShadow=true;cat.mesh.frustumCulled=false;group.add(cat.mesh);}
  let time=0;
  function draw(){
    const cursors={skin:0,cloth:0,body:0,detail:0};
    people.forEach((person,index)=>{
      const t=time+index*.83,seated=person.seated,cycle=Math.sin(t*3.5),walk=seated?0:Math.sin(t*.16)*6;
      const heading=seated?person.heading:(Math.cos(t*.16)>=0?Math.PI/2:-Math.PI/2),cos=Math.cos(heading),sin=Math.sin(heading);
      const origin=new THREE.Vector3(person.x+walk,0,person.z),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),heading);
      const heightScale=1+(index%5)*.035;
      const skinColor=skin[index%skin.length],shirt=shirts[index%shirts.length],pants=trousers[index%trousers.length];
      function part(kind,x,y,z,sx,sy,sz,color,q){
        dummy.position.set(origin.x+x*cos+z*sin,y*heightScale,origin.z-x*sin+z*cos);dummy.quaternion.copy(rotation);if(q)dummy.quaternion.multiply(q);dummy.scale.set(sx,sy*heightScale,sz);dummy.updateMatrix();
        const cat=categories[kind],i=cursors[kind]++;cat.mesh.setMatrixAt(i,dummy.matrix);cat.mesh.setColorAt(i,new THREE.Color(color));
      }
      function limb(a,b,r,color){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av),mid=av.add(bv).multiplyScalar(.5);part('cloth',mid.x,mid.y,mid.z,r,delta.length(),r,color,new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));}
      const hip=seated?1.65:2.8,bob=seated?Math.sin(t*1.2)*.025:Math.abs(cycle)*.045;
      part('body',0,hip+.66+bob,0,.64,.85,.36,shirt);
      part('skin',0,hip+1.56+bob,0,.17,.25,.17,skinColor);
      part('skin',Math.sin(t*.6)*.03,hip+1.94+bob,.04,.32,.41,.3,skinColor);
      part('detail',0,hip+2.13+bob,-.04,.33,.27,.3,hair[index%hair.length]);
      for(const side of [-1,1]){
        const stride=seated?0:cycle*side*.44,footZ=seated?.7:stride;
        const knee=[side*.28,seated?.93:1.42,seated?.85:stride*.45],ankle=[side*.28,.22,footZ];
        limb([side*.28,hip,0],knee,.19,pants);limb(knee,ankle,.15,pants);
        part('detail',side*.28,.16,footZ+.12,.2,.14,.38,'#373c3b');
        const shoulder=[side*.58,hip+1.08,0],elbow=[side*.65,hip+.48,seated?.38:-stride*.5],hand=[side*.52,hip+(seated?.43:-.08),seated?.76:-stride];
        limb(shoulder,elbow,.17,shirt);
        const fore=new THREE.Vector3(...hand).sub(new THREE.Vector3(...elbow)),mid=new THREE.Vector3(...elbow).add(new THREE.Vector3(...hand)).multiplyScalar(.5);
        part('skin',mid.x,mid.y,mid.z,.13,fore.length()/2+.05,.13,skinColor,new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),fore.normalize()));
        part('skin',...hand,.13,.16,.12,skinColor);
      }
    });
    for(const [name,cat] of Object.entries(categories)){cat.mesh.count=cursors[name];cat.mesh.instanceMatrix.needsUpdate=true;cat.mesh.instanceColor.needsUpdate=true;}
  }
  draw();group.userData.people=people;group.userData.update=dt=>{time+=dt;draw();};return group;
}
