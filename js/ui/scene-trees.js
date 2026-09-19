import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Native, deterministic broadleaf trees. Leaves have real edges and gaps rather
// than an opaque ball canopy. Repeated sprays share geometry and one draw call.
function random(seed){return()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;}
const UP=new THREE.Vector3(0,1,0);
function barkTexture(){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
  const ctx=canvas.getContext('2d'),rand=random(77);
  ctx.fillStyle='#8c8270';ctx.fillRect(0,0,128,256);
  for(let i=0;i<180;i++){
    const x=rand()*128,y=rand()*256;
    ctx.strokeStyle=i%3?'rgba(52,45,33,.28)':'rgba(214,199,163,.28)';ctx.lineWidth=.4+rand()*1.7;
    ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+rand()*3,y+8,x-rand()*3,y+18,x+rand()*2,y+30+rand()*24);ctx.stroke();
  }
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(2,2);return map;
}
function leafSpray(){
  const positions=[],colors=[],rand=random(31),transform=new THREE.Object3D();
  // Twenty pointed leaves with a shallow central fold (two triangles each).
  // Branchlets differ in scale and tilt, avoiding the old faceted green blobs.
  const outline=[new THREE.Vector3(0,0,0),new THREE.Vector3(-.23,-.065,.35),new THREE.Vector3(0,.015,.82),new THREE.Vector3(.23,-.065,.35)];
  for(let i=0;i<20;i++){
    const angle=i*2.399963,reach=.15+rand()*.75;
    transform.position.set(Math.cos(angle)*reach,(rand()-.5)*.55,Math.sin(angle)*reach);
    transform.rotation.set((rand()-.5)*1.2,angle,(rand()-.5)*.7);transform.scale.setScalar(.8+rand()*.45);transform.updateMatrix();
    const points=outline.map(p=>p.clone().applyMatrix4(transform.matrix));
    const color=new THREE.Color(['#bbc797','#a7bd83','#c7ce9c','#94ae70'][i%4]);
    for(const indices of [[0,1,2],[0,2,3]])for(const n of indices){positions.push(...points[n].toArray());colors.push(color.r,color.g,color.b);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();return geometry;
}
export function createTree({height=24,spread=7,seed=19}={}){
  const rand=random(seed),group=new THREE.Group(),wood=[],tips=[];
  group.name='Branching broadleaf tree';group.userData={decorative:true,height,seed};
  function limb(a,b,r0,r1,sides=7){
    const delta=b.clone().sub(a),geometry=new THREE.CylinderGeometry(r1,r0,delta.length(),sides,1,true);
    const matrix=new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(UP,delta.normalize()),new THREE.Vector3(1,1,1));
    geometry.applyMatrix4(matrix);wood.push(geometry);
  }
  const lean=(rand()-.5)*1.4;
  const trunk=[new THREE.Vector3(0,0,0),new THREE.Vector3(lean*.25,height*.23,.12),new THREE.Vector3(lean*.65,height*.44,-.18),new THREE.Vector3(lean,height*.67,.28),new THREE.Vector3(lean+.35,height*.85,.12)];
  const radii=[.52,.35,.24,.14,.045];
  for(let i=0;i<trunk.length-1;i++)limb(trunk[i],trunk[i+1],radii[i],radii[i+1],10);
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5;limb(new THREE.Vector3(0,.55,0),new THREE.Vector3(Math.cos(a)*1.35,.035,Math.sin(a)*1.35),.23,.035,7);
  }
  for(let i=0;i<7;i++){
    const angle=i*2.399963+rand()*.35,level=i%3,base=trunk[1].clone().lerp(trunk[3],.2+level*.24);
    const reach=spread*(.64+rand()*.2),end=new THREE.Vector3(Math.cos(angle)*reach,height*(.56+level*.1)+rand()*1.3,Math.sin(angle)*reach);
    const elbow=base.clone().lerp(end,.55);elbow.y-=.45;
    limb(base,elbow,.17-level*.018,.085);limb(elbow,end,.085,.025);
    for(let j=0;j<3;j++){
      const a=angle+(j-1)*.55,tip=end.clone().add(new THREE.Vector3(Math.cos(a)*1.05,.7+rand()*.9,Math.sin(a)*1.05));
      limb(end,tip,.03,.007,5);tips.push(tip);
    }
  }
  tips.push(trunk[4].clone(),trunk[4].clone().add(new THREE.Vector3(-1,-.8,.8)),trunk[4].clone().add(new THREE.Vector3(1,-.4,-.6)));
  const woodMap=barkTexture(),bark=new THREE.MeshStandardMaterial({color:'#b9ac94',map:woodMap,bumpMap:woodMap,bumpScale:.045,roughness:1});
  const branches=new THREE.Mesh(mergeGeometries(wood),bark);wood.forEach(g=>g.dispose());branches.name='Tapered trunk, roots and branches';branches.castShadow=branches.receiveShadow=true;group.add(branches);
  const spraysPerTip=6,count=tips.length*spraysPerTip;
  const foliage=new THREE.InstancedMesh(leafSpray(),new THREE.MeshStandardMaterial({color:'#a6b487',vertexColors:true,roughness:.9,side:THREE.DoubleSide}),count);
  const dummy=new THREE.Object3D();let index=0;
  for(let i=0;i<count;i++){
    // Fill an irregular crown rather than making isolated balls at branch tips.
    const a=rand()*Math.PI*2,v=rand()*2-1,r=Math.cbrt(rand()),radial=Math.sqrt(1-v*v);
    const lobe=1+.08*Math.sin(a*3+seed)+.06*Math.cos(a*5);
    dummy.position.set(Math.cos(a)*spread*radial*r*lobe+lean*.4,height*.72+v*r*height*.235,Math.sin(a)*spread*.88*radial*r*lobe);
    dummy.rotation.set((rand()-.5)*1.3,rand()*Math.PI*2,(rand()-.5)*1.1);dummy.scale.setScalar(1.05+rand()*.4);dummy.updateMatrix();foliage.setMatrixAt(index,dummy.matrix);
    foliage.setColorAt(index,new THREE.Color(['#acc293','#c3cf9b','#91ac80','#d1d4a2'][index%4]));index++;
  }
  foliage.name='Individual broadleaf sprays';foliage.castShadow=foliage.receiveShadow=true;foliage.instanceMatrix.needsUpdate=true;foliage.instanceColor.needsUpdate=true;group.add(foliage);
  group.userData.leafCount=count*20;
  return group;
}
export function createBoundaryTrees(bounds){
  const group=new THREE.Group();group.name='Backyard boundary trees';
  const positions=[[-bounds.side-7,-bounds.back+8],[-bounds.side-8,6],[bounds.side+8,-bounds.back+10],[bounds.side+9,4],[-bounds.side+5,-bounds.back-12],[bounds.side*.2,-bounds.back-15]];
  positions.forEach(([x,z],i)=>{
    const tree=createTree({height:22+(i%3)*2.1,spread:6.4+(i%2)*.8,seed:19+i*41});tree.position.set(x,0,z);tree.rotation.y=i*1.7;group.add(tree);
  });
  return group;
}
