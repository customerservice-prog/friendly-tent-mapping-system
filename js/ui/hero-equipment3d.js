import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HERO_EQUIPMENT_TYPES, equipmentAssetDescriptor } from '../data/asset-registry.js';
import { attachEquipmentOperation } from './equipment-operation.js';


// Merge in the group's own coordinate system, so a translated/scaled rotor or
// cannon head is not transformed twice when its parent supplies SKU dimensions.
function mergeParts(group){
  group.updateWorldMatrix(true,true);const inverse=group.matrixWorld.clone().invert(),buckets=new Map(),originals=new Set();
  group.traverse(o=>{if(!o.isMesh)return;const geometry=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geometry.applyMatrix4(inverse.clone().multiply(o.matrixWorld));originals.add(o.geometry);const parts=buckets.get(o.material)||[];parts.push(geometry);buckets.set(o.material,parts);});
  group.clear();for(const [material,parts] of buckets){const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=!material.transparent;mesh.receiveShadow=true;group.add(mesh);}originals.forEach(g=>g.dispose());return group;
}

// Detailed local models informed by the catalog photos recorded in the registry.
// Geometry uses a unit physical envelope; the supplied SKU dimensions set scale.
export function createHeroEquipment(product,item={}, {mobile=false}={}){
  const type=product.type;if(!HERO_EQUIPMENT_TYPES.includes(type))return null;
  const width=Number(product.widthFt)||2,depth=Number(product.depthFt)||2,height=Number(product.heightFt)||2;
  const root=new THREE.Group(),model=new THREE.Group(),body=new THREE.Group();root.add(model);model.add(body);body.name='Equipment body';
  root.name=product.name||type;root.userData.asset=equipmentAssetDescriptor(product,type);
  const white=new THREE.MeshStandardMaterial({color:0xf3f1e9,roughness:.76}),dark=new THREE.MeshStandardMaterial({color:0x20262b,roughness:.59}),rubber=new THREE.MeshStandardMaterial({color:0x141a1e,roughness:.96});
  const steel=new THREE.MeshStandardMaterial({color:0xd5dadd,roughness:.36,metalness:.62}),chrome=new THREE.MeshStandardMaterial({color:0xe3e8ea,roughness:.18,metalness:.93});
  const yellow=new THREE.MeshStandardMaterial({color:0xf0bf23,roughness:.35,metalness:.12}),navy=new THREE.MeshStandardMaterial({color:0x223b68,roughness:.77}),red=new THREE.MeshStandardMaterial({color:0xc91d2f,roughness:.44,metalness:.14}),blue=new THREE.MeshStandardMaterial({color:0x2c91bd,roughness:.48,metalness:.12}),pink=new THREE.MeshStandardMaterial({color:0xe697bd,roughness:.52});
  const glass=new THREE.MeshPhysicalMaterial({color:0xe8f6fa,roughness:.08,metalness:0,transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide});
  const UP=new THREE.Vector3(0,1,0),effects=[];let animate=null,reset=null;
  function add(g,m,x=0,y=0,z=0,host=body,name=''){const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;host.add(mesh);return mesh;}
  function box(w,h,d,m,x=0,y=0,z=0,host=body,r=.008){return add(new RoundedBoxGeometry(w,h,d,1,Math.min(r,w*.15,h*.15,d*.15)),m,x,y,z,host);}
  function cyl(rt,rb,h,m,x=0,y=0,z=0,host=body,n=32){return add(new THREE.CylinderGeometry(rt,rb,h,n),m,x,y,z,host);}
  function rod(a,b,r,m,host=body){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av),q=cyl(r,r,delta.length(),m,0,0,0,host,10);q.position.copy(av).add(bv).multiplyScalar(.5);q.quaternion.setFromUnitVectors(UP,delta.normalize());return q;}
  function ring(r,t,m,x,y,z,host=body){return add(new THREE.TorusGeometry(r,t,6,mobile?32:56),m,x,y,z,host);}
  function curve(points,r,m,host=body){return add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,r,6,false),m,0,0,0,host);}
  function lathe(points,m,x=0,y=0,z=0,host=body){return add(new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),mobile?32:48),m,x,y,z,host);}
  function control(x,y,z,material=dark){const q=cyl(.017,.017,.013,material,x,y,z);q.rotation.x=Math.PI/2;return q;}
  function feet(xs=[-.34,.34],zs=[-.31,.31]){for(const x of xs)for(const z of zs)cyl(.036,.040,.04,rubber,x,.02,z);}
  function vents(x,y,z,side=false,count=7){for(let i=0;i<count;i++){const q=box(side?.01:.16,.009,side?.13:.01,dark,x,y+i*.023,z);q.name='Vent slot';}}
  function glassPanel(w,h,x,y,z,rotation=0){const q=add(new THREE.PlaneGeometry(w,h),glass,x,y,z);q.rotation.y=rotation;q.castShadow=false;}
  function supportFrame(w,d,low,high){for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])box(.018,high-low,.018,steel,x,(high+low)/2,z);}
  if(type==='foam-machine'){
    // The actual catalog shows a yellow cannon on a tripod, not a fan or cart.
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3+Math.PI/6,x=Math.cos(a)*.43,z=Math.sin(a)*.43;rod([0,.19,0],[x,.025,z],.027,dark);rod([0,.10,0],[x*.65,.095,z*.65],.011,steel);cyl(.036,.04,.04,rubber,x,.02,z);}
    cyl(.027,.035,.58,dark,0,.40,0);cyl(.039,.039,.07,dark,0,.43,0);control(.045,.44,.035);
    cyl(.032,.032,.21,yellow,0,.68,0);box(.18,.055,.13,yellow,0,.76,0);
    const head=new THREE.Group();head.position.set(0,1-.285*width/height,0);head.scale.y=width/height;model.add(head);
    const shell=lathe([[.20,-.33],[.245,-.30],[.245,.12],[.18,.34],[.161,.34],[.224,.10],[.224,-.30],[.20,-.33]],yellow,0,0,0,head);shell.rotation.x=Math.PI/2;
    const mouth=ring(.171,.012,yellow,0,0,.34,head);const inner=add(new THREE.CircleGeometry(.159,32),new THREE.MeshStandardMaterial({color:0x554828,roughness:.83,side:THREE.DoubleSide}),0,0,.315,head);
    const meshGrid=new THREE.Group();head.add(meshGrid);for(let n=-4;n<=4;n++){const x=n*.034,len=Math.sqrt(Math.max(0,.151*.151-x*x));rod([x,-len,.32],[x,len,.32],.0015,steel,meshGrid);}
    rod([-.13,.20,-.12],[-.13,.285,-.12],.017,dark,head);rod([.13,.20,-.12],[.13,.285,-.12],.017,dark,head);rod([-.13,.285,-.12],[.13,.285,-.12],.017,dark,head);
    for(const x of [-.225,.225]){const bolt=cyl(.022,.022,.016,dark,x,-.09,0,head,12);bolt.rotation.z=Math.PI/2;}
    curve([[.13,.75,-.28],[.23,.50,-.32],[.28,.1,-.32],[.34,.025,-.18]],.008,steel);curve([[-.1,.73,-.25],[-.13,.30,-.13],[-.17,.03,.18],[-.34,.015,.32]],.006,dark);
    mergeParts(head);
    const count=mobile?84:150,geometry=new THREE.IcosahedronGeometry(.027,1),foam=new THREE.MeshStandardMaterial({color:0xf9ffff,roughness:.98,transparent:true,opacity:.86,depthWrite:false});
    const particles=new THREE.InstancedMesh(geometry,foam,count);particles.name='Foam operating preview';particles.userData.effect=true;particles.frustumCulled=false;model.add(particles);effects.push(particles);const dummy=new THREE.Object3D();
    animate=t=>{for(let i=0;i<count;i++){const u=(t*.56+i/count)%1,angle=i*2.39996,spread=.025+u*.36;dummy.position.set(Math.sin(angle)*spread,head.position.y+u*.15-u*u*.58, .355+u*1.8);dummy.rotation.set(angle,u*3,angle*.4);dummy.scale.setScalar(.35+Math.sin(Math.PI*u)*1.6);dummy.updateMatrix();particles.setMatrixAt(i,dummy.matrix);}particles.instanceMatrix.needsUpdate=true;};
  }else if(type==='fan'){
    lathe([[0,0],[.38,0],[.41,.018],[.39,.045],[.30,.055],[.04,.068]],dark);cyl(.025,.034,.61,dark,0,.365,0);cyl(.038,.038,.04,steel,0,.41,0);
    const head=new THREE.Group();head.position.set(0,1-.47*width/height,0);head.scale.set(2,2*width/height,1);model.add(head);const cage=new THREE.Group();head.add(cage);
    const radius=.235;for(const front of [-1,1])for(let i=1;i<=14;i++){const r=radius*i/14,z=front*.072*Math.sqrt(Math.max(0,1-r*r/(radius*radius)));ring(r,.0018,chrome,0,0,z,cage);}
    for(let i=0;i<16;i++){const a=i*Math.PI/8;rod([0,0,.079],[Math.cos(a)*radius,Math.sin(a)*radius,0],.0019,chrome,cage);rod([0,0,-.079],[Math.cos(a)*radius,Math.sin(a)*radius,0],.0019,steel,cage);}
    const motor=cyl(.064,.064,.12,dark,0,0,-.08,cage);motor.rotation.x=Math.PI/2;
    const rotor=new THREE.Group();head.add(rotor);rotor.name='Fan rotor';
    for(let i=0;i<3;i++){const shape=new THREE.Shape();shape.moveTo(.02,.015);shape.bezierCurveTo(.05,.03,.08,.12,.055,.207);shape.bezierCurveTo(.012,.22,-.047,.194,-.049,.156);shape.bezierCurveTo(-.04,.087,-.025,.026,.02,.015);const blade=add(new THREE.ExtrudeGeometry(shape,{depth:.005,bevelEnabled:false,curveSegments:10}),steel,0,0,0,rotor);blade.rotation.z=i*Math.PI*2/3;}
    mergeParts(rotor);const hub=cyl(.043,.043,.020,chrome,0,0,.079,cage);hub.rotation.x=Math.PI/2;mergeParts(cage);
    animate=t=>{rotor.rotation.z=t*14;};
  }else if(type==='cooler'){
    feet([-.33,.33],[-.31,.31]);box(.88,.72,.84,navy,0,.40,0,body,.06);box(.94,.092,.92,white,0,.806,0,body,.025);box(.88,.016,.86,dark,0,.751,0);
    for(const x of [-1,1]){box(.02,.17,.27,navy,x*.448,.59,0);curve([[x*.46,.65,-.12],[x*.487,.55,-.12],[x*.487,.55,.12],[x*.46,.65,.12]],.019,dark);}
    for(const x of [-.32,.32]){box(.07,.055,.035,steel,x,.76,-.437);box(.042,.028,.012,dark,x,.784,.465);}
    for(const x of [-.30,0,.30])box(.06,.025,.008,navy,x,.105,.427);control(.27,.18,.425,white);
    box(.27,.16,.018,navy,0,.62,.433);box(.19,.02,.022,white,0,.645,.444);
  }else if(type==='fill-chill'){
    for(const x of [-.37,.37])for(const z of [-.34,.34]){rod([x,.035,z],[x,.80,z],.018,dark);cyl(.022,.025,.04,rubber,x,.02,z);}
    for(const x of [-.37,.37]){rod([x,.24,-.34],[x,.24,.34],.012,dark);rod([x,.28,-.30],[x,.71,.22],.012,steel);}
    box(.96,.05,.94,dark,0,.82,0,body,.025);
    for(const x of [-.46,.46])box(.06,.16,.92,dark,x,.90,0,body,.02);for(const z of [-.44,.44])box(.91,.16,.06,dark,0,.90,z,body,.02);
    const drain=cyl(.026,.026,.006,rubber,.1,.849,0);ring(.025,.004,steel,.1,.851,0).rotation.x=Math.PI/2;
  }else if(type==='stanchion'){
    lathe([[0,0],[.45,0],[.48,.018],[.47,.045],[.36,.070],[.07,.083]],dark);cyl(.049,.053,.81,dark,0,.485,0);
    cyl(.071,.071,.075,dark,0,.917,0);cyl(.066,.066,.012,rubber,0,.963,0);box(.012,.043,.071,rubber,.075,.925,0);box(.13,.026,.035,dark,.112,.938,0);
    for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5])box(.015,.05,.015,steel,Math.cos(a)*.065,.916,Math.sin(a)*.065);
  }else if(type==='podium'){
    box(.72,.06,.76,dark,0,.03,0,body,.04);box(.56,.03,.58,dark,0,.075,0);box(.23,.63,.29,dark,0,.402,0,body,.018);
    const top=new THREE.Group();top.position.set(0,.756,0);top.rotation.x=-.09;model.add(top);box(.91,.055,.71,dark,0,0,0,top,.025);box(.78,.008,.55,rubber,0,.033,0,top);box(.78,.03,.025,dark,0,.05,.25,top);mergeParts(top);
    curve([[-.31,.80,-.22],[-.31,.91,-.23],[-.20,.955,-.19],[-.04,.989,-.08]],.007,dark);const mic=cyl(.011,.011,.035,dark,-.03,.991,-.072);mic.rotation.z=-.9;
  }else if(type==='cotton-candy'){
    feet([-.26,.26],[-.25,.25]);box(.61,.43,.67,pink,0,.255,0,body,.022);box(.57,.16,.05,dark,0,.23,.343);box(.13,.097,.012,white,-.145,.24,.374);for(const x of [.06,.19])box(.042,.063,.022,red,x,.225,.375);
    vents(.311,.21,0,true,6);vents(-.311,.21,0,true,6);for(const x of [-.31,.31])box(.017,.14,.027,steel,x,.46,.15);
    lathe([[0,.47],[.31,.47],[.42,.51],[.47,.66],[.48,.89],[.465,.91],[.45,.89],[.44,.68],[.40,.55],[.29,.505],[0,.505]],steel);ring(.467,.011,chrome,0,.902,0).rotation.x=Math.PI/2;
    const spinner=new THREE.Group();model.add(spinner);spinner.position.y=.59;spinner.name='Cotton candy spinner';cyl(.10,.12,.12,steel,0,0,0,spinner);for(let i=0;i<8;i++){const a=i*Math.PI/4;box(.026,.055,.02,dark,Math.cos(a)*.10,.015,Math.sin(a)*.10,spinner);}mergeParts(spinner);animate=t=>{spinner.rotation.y=t*18;};
  }else if(type==='popcorn'){
    feet([-.40,.40],[-.35,.35]);box(.92,.065,.86,steel,0,.073,0);box(.88,.18,.82,steel,0,.18,0);box(.97,.18,.90,red,0,.90,0,body,.018);box(.74,.045,.67,red,0,.98,0);
    supportFrame(.86,.78,.21,.82);glassPanel(.82,.59,0,.52,.398);glassPanel(.82,.59,0,.52,-.398);glassPanel(.73,.59,-.439,.52,0,Math.PI/2);glassPanel(.73,.59,.439,.52,0,Math.PI/2);
    for(const x of [-.11,.11])control(x,.906,.457,rubber);box(.52,.03,.025,steel,0,.33,.432);box(.72,.09,.04,steel,0,.258,.435);for(const y of [.40,.70])box(.035,.055,.025,steel,-.40,y,.421);
    cyl(.027,.027,.30,steel,0,.665,0);lathe([[0,.46],[.14,.46],[.20,.49],[.205,.65],[.22,.66],[.22,.68],[.18,.68]],steel);
    const lid=cyl(.23,.23,.014,steel,0,.679,0);rod([-.20,.58,0],[-.36,.58,.06],.012,steel);const handle=cyl(.025,.025,.075,red,-.37,.58,.065);handle.rotation.z=Math.PI/2;
    const kernelMat=new THREE.MeshStandardMaterial({color:0xf4d395,roughness:1});for(let i=0;i<(mobile?40:80);i++){const x=Math.sin(i*2.41)*.36,z=Math.cos(i*1.37)*.32,y=.285+(i%5)*.012;const q=add(new THREE.IcosahedronGeometry(.027,0),kernelMat,x,y,z);q.scale.set(1.1,.8,1.3);}
    const pops=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.016,0),kernelMat,6);pops.name='Kettle agitation';pops.userData.effect=true;model.add(pops);effects.push(pops);const dummy=new THREE.Object3D();animate=t=>{for(let i=0;i<6;i++){const u=(t*.5+i/6)%1;dummy.position.set(Math.sin(i*2.4)*.14,.69+Math.sin(Math.PI*u)*.08,Math.cos(i*2.4)*.12);dummy.updateMatrix();pops.setMatrixAt(i,dummy.matrix);}pops.instanceMatrix.needsUpdate=true;};
  }else if(type==='snow-cone'){
    feet([-.40,.40],[-.35,.35]);box(.91,.072,.88,blue,0,.07,0);box(.85,.022,.81,steel,0,.12,0);supportFrame(.86,.78,.13,.66);box(.91,.06,.88,steel,0,.67,0);
    glassPanel(.82,.51,0,.395,.398);glassPanel(.82,.51,0,.395,-.398);glassPanel(.73,.51,-.439,.395,0,Math.PI/2);glassPanel(.73,.51,.439,.395,0,Math.PI/2);
    box(.40,.28,.45,blue,-.21,.825,-.07);box(.25,.08,.02,steel,-.21,.83,.165);box(.042,.035,.015,red,-.25,.83,.18);vents(-.414,.756,-.07,true,5);
    lathe([[.07,.69],[.16,.76],[.20,.93],[.20,.955],[.183,.955],[.183,.935],[.14,.78],[.07,.73]],steel,.13,0,-.03);
    box(.49,.025,.035,steel,.17,.987,-.035);box(.1,.035,.06,dark,.35,.98,-.035);const platen=cyl(.178,.178,.015,steel,.13,.957,-.03);control(.30,.078,.448,steel);
    const shaved=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.010,0),white,mobile?16:28);shaved.userData.effect=true;shaved.name='Shaved ice operating preview';model.add(shaved);effects.push(shaved);const dummy=new THREE.Object3D();animate=t=>{for(let i=0;i<shaved.count;i++){const u=(t*.55+i/shaved.count)%1;dummy.position.set(.13+Math.sin(i*2.4)*.10,.64-u*.46,-.03+Math.cos(i*2.4)*.10);dummy.updateMatrix();shaved.setMatrixAt(i,dummy.matrix);}shaved.instanceMatrix.needsUpdate=true;};
  }
  mergeParts(body);
  model.scale.set(width,height,depth);root.userData.physicalEnvelope={widthFt:width,depthFt:depth,heightFt:height};
  root.traverse(o=>{if(o.isMesh)o.userData.itemId=item.id;});
  attachEquipmentOperation(root,type,item,animate,{effects,reset});return root;
}
