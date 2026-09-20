import * as THREE from 'three';
import { chairPositions } from '../core/seating.js';
import { byId as chairById } from '../data/chairs.js';
import { tableProfile } from './equipment3d.js';

// Preview-only styling. Every prop is attached to an existing rental table;
// it never changes the layout, seat count, quote, or catalog availability.
export function createPartyStyling(tent,objects){
  const group=new THREE.Group();group.name='Party table styling';group.userData.decorative=true;
  const materials={ceramic:new THREE.MeshStandardMaterial({color:'#f9f5e8',roughness:.32}),gold:new THREE.MeshStandardMaterial({color:'#bda175',metalness:.6,roughness:.3}),metal:new THREE.MeshStandardMaterial({color:'#bdc4c7',metalness:.85,roughness:.2}),cloth:new THREE.MeshStandardMaterial({color:'#879d8b',roughness:.95}),glass:new THREE.MeshPhysicalMaterial({color:'#e3eeeb',metalness:.08,roughness:.12,transparent:true,opacity:.43,depthWrite:false}),green:new THREE.MeshStandardMaterial({color:'#527255',roughness:.88}),flower:new THREE.MeshStandardMaterial({color:'#f3e6d7',roughness:.8}),water:new THREE.MeshStandardMaterial({color:'#bdd3c2',roughness:.3})};
  const batches={plates:{g:new THREE.CylinderGeometry(1,1,.032,28),m:materials.ceramic},rim:{g:new THREE.TorusGeometry(1,.026,6,28),m:materials.gold},cutlery:{g:new THREE.BoxGeometry(1,1,1),m:materials.metal},napkin:{g:new THREE.BoxGeometry(1,1,1),m:materials.cloth},glass:{g:new THREE.CylinderGeometry(1,.72,1,14,1,true),m:materials.glass},stem:{g:new THREE.CylinderGeometry(1,1,1,8),m:materials.glass},vase:{g:new THREE.CylinderGeometry(.22,.17,.54,16,1,true),m:materials.glass},leaves:{g:new THREE.SphereGeometry(1,8,5),m:materials.green},petals:{g:new THREE.SphereGeometry(1,8,5),m:materials.flower},water:{g:new THREE.CylinderGeometry(.18,.14,.30,12),m:materials.water}};
  Object.values(batches).forEach(b=>{b.transforms=[];});
  function put(kind,x,y,z,sx=1,sy=1,sz=1,ry=0,rx=0,rz=0){batches[kind].transforms.push({x,y,z,sx,sy,sz,rx,ry,rz});}
  function glass(x,y,z){put('stem',x,y+.07,z,.014,.13,.014);put('stem',x,y+.01,z,.10,.018,.10);put('glass',x,y+.24,z,.105,.23,.105);}
  let styled=0;
  for(const item of objects){
    if(item.kind!=='table'||Array.isArray(item.tabletop)||styled>=12)continue;
    const p=tableProfile(item);if(p.silhouette==='fillchill-tub')continue;styled++;
    const cx=item.x+item.widthFt/2-tent.widthFt/2,cz=item.y+item.depthFt/2-tent.lengthFt/2,y=p.height+.035;
    for(const seat of chairPositions(item,chairById(item.chairId)||{})){
      let x,z;
      if(item.shape==='round'){x=Math.cos(seat.angle)*(item.widthFt/2-.60);z=Math.sin(seat.angle)*(item.depthFt/2-.60);}
      else{x=Math.max(-item.widthFt/2+.60,Math.min(item.widthFt/2-.60,seat.x));z=Math.max(-item.depthFt/2+.60,Math.min(item.depthFt/2-.60,seat.y));}
      const tangent={x:-Math.sin(seat.angle),z:Math.cos(seat.angle)};
      put('plates',cx+x,y,cz+z,.38,1,.38);put('rim',cx+x,y+.018,cz+z,.38,.38,.38,0,Math.PI/2);
      put('napkin',cx+x,y+.05,cz+z,.17,.028,.43,-seat.angle-Math.PI/2);
      for(const side of [-1,1]){
        const fx=cx+x+tangent.x*.49*side,fz=cz+z+tangent.z*.49*side;
        put('cutlery',fx,y+.025,fz,.035,.015,.40,-seat.angle-Math.PI/2);
        if(side===-1)for(let n=-1;n<=1;n++)put('cutlery',fx+Math.cos(seat.angle)*.19+tangent.x*n*.022,y+.025,fz+Math.sin(seat.angle)*.19+tangent.z*n*.022,.012,.014,.10,-seat.angle-Math.PI/2);
      }
      glass(cx+x*.75+tangent.x*.40,y,cz+z*.75+tangent.z*.40);
    }
    // Low centerpieces keep guests' sightlines open across the table.
    put('vase',cx,y+.27,cz);put('water',cx,y+.17,cz);
    for(let i=0;i<5;i++){
      const a=i*2.399,fx=cx+Math.cos(a)*.25,fz=cz+Math.sin(a)*.25,fy=y+.72+(i%2)*.08;
      put('leaves',(cx+fx)/2,y+.44,(cz+fz)/2,.021,.43,.021);
      put('leaves',fx,y+.53,fz,.20,.037,.085,a,.4);
      for(let n=0;n<5;n++){const b=n*Math.PI*2/5;put('petals',fx+Math.cos(b)*.105,fy,fz+Math.sin(b)*.105,.12,.05,.085,-b);}
      put('petals',fx,fy+.025,fz,.072,.055,.072);
    }
    if(!item.seatCount)for(const a of [0,Math.PI*.7,Math.PI*1.4])glass(cx+Math.cos(a)*.68,y,cz+Math.sin(a)*.68);
  }
  const dummy=new THREE.Object3D();
  for(const [name,batch] of Object.entries(batches)){
    if(!batch.transforms.length){batch.g.dispose();continue;}
    const mesh=new THREE.InstancedMesh(batch.g,batch.m,batch.transforms.length);mesh.name='Table styling · '+name;
    batch.transforms.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.rx,p.ry,p.rz);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
    mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  }
  group.userData.tableCount=styled;return group;
}
