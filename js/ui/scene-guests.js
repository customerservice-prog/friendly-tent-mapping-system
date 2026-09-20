import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { activityPositions } from '../core/party-scene.js';
import { CHAIRS } from '../data/chairs.js';

// Fully local, articulated party figures. The batches share geometry/materials;
// facial features, clothes and activities never become quote items.
export function guestPositions(tent,objects,limit=32){return activityPositions(tent,objects,CHAIRS,limit);}
const UP=new THREE.Vector3(0,1,0);
const SKIN=['#d5a080','#935e45','#e8bb96','#654333','#b67d59'];
const HAIR=['#30251e','#5e4030','#b79662','#252327','#734e35'];
const OUTFITS=['#34465b','#a66455','#7c9383','#d6bc85','#617c99','#b68695'];
function lathe(points,segments=12){return new THREE.LatheGeometry(points.map(([r,y])=>new THREE.Vector2(r,y)),segments);}
function combine(parts,colors=false){
  const geometry=mergeGeometries(parts.map(([g,color])=>{const geo=g.index?g.toNonIndexed():g.clone();if(colors){const c=new THREE.Color(color),a=new Float32Array(geo.attributes.position.count*3);for(let i=0;i<a.length;i+=3)a.set([c.r,c.g,c.b],i);geo.setAttribute('color',new THREE.BufferAttribute(a,3));}return geo;}),false);
  parts.forEach(([g])=>g.dispose());return geometry;
}
function sphere(x,y,z,sx,sy,sz){const g=new THREE.SphereGeometry(1,10,7);g.scale(sx,sy,sz);g.translate(x,y,z);return g;}
function headGeometry(){
  const head=lathe([[.12,-.42],[.20,-.36],[.275,-.22],[.31,-.04],[.30,.16],[.255,.31],[.14,.39],[0,.42]],16);head.scale(1,1,.9);
  return combine([[head],[sphere(0,-.08,.28,.074,.12,.105)],[sphere(-.30,-.02,0,.064,.12,.07)],[sphere(.30,-.02,0,.064,.12,.07)]]);
}
function faceGeometry(){
  const parts=[];
  for(const side of [-1,1]){
    parts.push([sphere(side*.122,.062,.248,.052,.025,.017),'#f4eee2']);
    parts.push([sphere(side*.122,.059,.266,.019,.022,.009),'#342f28']);
    const brow=new THREE.BoxGeometry(.105,.018,.018);brow.translate(side*.125,.145,.256);parts.push([brow,'#44382d']);
  }
  parts.push([sphere(0,-.252,.226,.103,.022,.018),'#995f55']);
  return combine(parts,true);
}
function hairGeometry(){
  // A shaped hairline: high at the forehead, lower over the ears and nape.
  const g=new THREE.SphereGeometry(1,16,9,0,Math.PI*2,0,Math.PI*.75),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    if(z>.1&&y<.08)p.setY(i,.08+z*.12);
  }
  g.computeVertexNormals();return g;
}
export function guestPose(person,index,time){
  const phase=index*1.731,t=time+phase,seated=person.seated;
  let x=person.x,z=person.z,heading=person.heading,gait=0,sway=0,lift=0;
  if(person.activity==='walk'){
    const route=person.route,period=(route.length-1)*1.25,cycle=(time+phase)%(period*2+2),reverse=cycle>period+1;
    const distance=Math.max(0,Math.min(period,reverse?period*2+1-cycle:cycle))/1.25,segment=Math.min(route.length-2,Math.floor(distance)),f=distance-segment,a=route[segment],b=route[segment+1];
    x=a.x+(b.x-a.x)*f;z=a.z+(b.z-a.z)*f;heading=Math.atan2(b.x-a.x,b.z-a.z)+(reverse?Math.PI:0);if(cycle>=period&&cycle<=period+1)heading+=Math.PI*(cycle-period);else if(cycle>=period*2+1)heading+=Math.PI*(cycle-period*2-1);
    const moving=cycle<period||(cycle>period+1&&cycle<period*2+1);gait=moving?Math.sin(time*5.4+phase):0;
  }else if(person.activity==='dance'){sway=Math.sin(t*1.9)*.16;x+=sway;z+=Math.sin(t*1.9+1)*.12;heading+=Math.sin(t*.8)*.13;lift=Math.abs(Math.sin(t*1.9))*.055;}
  const conversation=Math.sin(t*.75)*.12,gesture=(Math.sin(t*.9) + 1)*.5;
  return {x,z,heading,gait,sway,lift,headTurn:conversation,gesture,seated};
}
export function createGuests(tent,objects,{mobile=false}={}) {
  const group=new THREE.Group();group.name='Preview guests';group.userData.decorative=true;
  const people=guestPositions(tent,objects,mobile?24:40),dummy=new THREE.Object3D(),direction=new THREE.Vector3(),mid=new THREE.Vector3(),rotation=new THREE.Quaternion(),jointQ=new THREE.Quaternion(),headQ=new THREE.Quaternion();
  const common={roughness:.86};
  const definitions={
    skin:{n:10,g:new THREE.SphereGeometry(1,10,7)},limb:{n:8,g:new THREE.CylinderGeometry(.86,1,1,10)},
    torso:{n:1,g:lathe([[.39,0],[.45,.22],[.44,.47],[.56,.91],[.62,1.13],[.47,1.28],[.23,1.34]],16)},
    head:{n:1,g:headGeometry()},face:{n:1,g:faceGeometry(),m:{vertexColors:true,roughness:.75}},
    hair:{n:1,g:hairGeometry()},detail:{n:7,g:new THREE.SphereGeometry(1,10,7)},
    garment:{n:10,g:new THREE.BoxGeometry(1,1,1)},skirt:{n:1,g:new THREE.CylinderGeometry(.45,.76,1.7,14)},
    drink:{n:1,g:new THREE.CylinderGeometry(.10,.073,.30,12),m:{color:'#e8d5aa',roughness:.22,transparent:true,opacity:.78}},
  };
  const colorCache=new Map();let first=true,time=0;
  for(const [name,def] of Object.entries(definitions)){
    def.mesh=new THREE.InstancedMesh(def.g,new THREE.MeshStandardMaterial({...common,...def.m}),Math.max(1,people.length*def.n));def.mesh.name='Guests · '+name;
    def.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);def.mesh.castShadow=def.mesh.receiveShadow=true;def.mesh.frustumCulled=false;group.add(def.mesh);
  }
  function draw(){
    const cursors=Object.fromEntries(Object.keys(definitions).map(k=>[k,0]));
    people.forEach((person,index)=>{
      const pose=guestPose(person,index,time),seated=person.seated,dress=index%4===1,jacket=index%4===0;
      const height=1.06+(index%5-2)*.035,hip=seated?1.59:2.95*height,skin=SKIN[index%SKIN.length],hair=HAIR[index%HAIR.length],cloth=OUTFITS[index%OUTFITS.length],pants=jacket?cloth:index%3===0?'#b4a18c':'#3d4650';
      const top=hip+1.3*height,headY=top+.57*height,cos=Math.cos(pose.heading),sin=Math.sin(pose.heading);
      rotation.setFromAxisAngle(UP,pose.heading);headQ.setFromAxisAngle(UP,pose.headTurn);
      function part(kind,x,y,z,sx,sy,sz,color,q){
        dummy.position.set(pose.x+x*cos+z*sin,y+pose.lift,pose.z-x*sin+z*cos);dummy.quaternion.copy(rotation);if(q)dummy.quaternion.multiply(q);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();
        const def=definitions[kind],i=cursors[kind]++;def.mesh.setMatrixAt(i,dummy.matrix);
        if(first&&kind!=='face'){if(!colorCache.has(color))colorCache.set(color,new THREE.Color(color));def.mesh.setColorAt(i,colorCache.get(color));}
      }
      function limb(kind,a,b,r1,r2,color){direction.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]);const length=direction.length();mid.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);jointQ.setFromUnitVectors(UP,direction.normalize());part(kind,mid.x,mid.y,mid.z,r1,kind==='skin'?length/2+.035:length,r2,color,jointQ);}
      part('torso',0,hip-.035,0,1,height,.64,cloth);
      part('skin',0,top+.09,0,.155,.21,.16,skin);
      part('head',0,headY,.025,height,height,height,skin,headQ);
      part('face',0,headY,.025,height,height,height,'#ffffff',headQ);
      part('hair',0,headY+.035,-.015,.324*height,.405*height,.296*height,hair,headQ);
      if(index%4===1){part('detail',0,headY-.10,-.29,.30,.43,.14,hair,headQ);part('detail',0,headY+.12,-.36,.17,.19,.16,hair,headQ);}
      else if(index%4===2)part('detail',.17,headY+.25,-.20,.19,.13,.19,hair,headQ);
      // Collars, shirt opening, belt and buttons distinguish outfits at table scale.
      part('garment',0,top-.07,.245,.19,.22,.026,jacket?'#eee8d9':skin);
      for(const side of [-1,1]){jointQ.setFromAxisAngle(new THREE.Vector3(0,0,1),side*.45);part('garment',side*.18,top-.04,.258,.20,.17,.04,jacket?'#faf5e9':cloth,jointQ);}
      if(jacket){for(const side of [-1,1]){jointQ.setFromAxisAngle(new THREE.Vector3(0,0,1),side*.31);part('garment',side*.16,top-.35,.315,.11,.45,.028,'#293a50',jointQ);}}
      for(let i=0;i<3;i++)part('garment',0,top-.37-i*.23,.32,.034,.035,.02,'#d6d5ca');
      if(!dress)part('garment',0,hip+.025,.01,.81,.085,.44,'#433b33');
      if(dress&&!seated)part('skirt',0,hip-.66,0,1,1,1,cloth);
      if(dress&&seated)part('detail',0,hip-.01,.35,.58,.16,.60,cloth);
      for(const side of [-1,1]){
        const stride=pose.gait*side*.47,footZ=seated?.89:stride,footY=.13+(!seated?Math.max(0,pose.gait*side)*.1:0);
        const knee=[side*.25,seated?1.20:1.5*height,seated?.9:stride*.40],ankle=[side*.26,footY+.12,footZ];
        limb('limb',[side*.25,hip-.02,0],knee,.205,.19,dress?cloth:pants);
        limb(dress?'skin':'limb',knee,ankle,.135,.15,dress?skin:pants);
        part('detail',side*.26,footY,footZ+.12,.18,.125,.35,dress?'#765343':'#34383a');
        const shoulder=[side*.54,top-.16,0],talk=side===1?pose.gesture:1-pose.gesture;
        let elbow=[side*.65,hip+.56,seated?.43:-stride*.38],hand=[side*.46,seated?hip+.66:hip+.02,seated?1.03:-stride*.52];
        if(person.activity==='conversation'&&side===1){hand=[.47,hip+.62+talk*.28,.85+talk*.16];elbow=[.66,hip+.44,.38];}
        if(person.activity==='cocktail'){elbow=[side*.62,hip+.58,.28];hand=[side*.29,hip+.91+(side===1?talk*.28:0),.53];}
        if(person.activity==='dance'){elbow=[side*(.62+talk*.10),hip+(side===1?.89:.36)+talk*.16,.22];hand=[side*.56,hip+(side===1?1.44:.57)+talk*.18,.51];}
        limb('limb',shoulder,elbow,jacket?.175:.16,.17,cloth);
        limb('skin',elbow,hand,.12,.125,skin);
        part('skin',...hand,.11,.15,.075,skin);
        if(side===1&&person.activity==='cocktail')part('drink',hand[0]-.025,hand[1]+.15,hand[2]+.07,1,1,1,'#f0e5cf');
      }
    });
    for(const [name,def] of Object.entries(definitions)){def.mesh.count=cursors[name];def.mesh.instanceMatrix.needsUpdate=true;if(first&&def.mesh.instanceColor)def.mesh.instanceColor.needsUpdate=true;}
    first=false;
  }
  draw();group.userData.people=people;group.userData.update=dt=>{time+=dt;draw();};return group;
}
