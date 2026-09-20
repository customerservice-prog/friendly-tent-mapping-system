import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeTable } from './equipment3d.js';
import { disposeGroup } from './scene-environment.js';
export function createTableView(host,onFailure){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;host.replaceChildren(renderer.domElement);renderer.domElement.setAttribute('aria-label','Your table in 3D. Drag to turn and pinch to zoom.');
 const scene=new THREE.Scene();scene.background=new THREE.Color('#f1efe9');
 const camera=new THREE.PerspectiveCamera(37,1,.05,150),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enablePan=false;controls.minPolarAngle=.08;controls.maxPolarAngle=Math.PI*.47;
 const ambient=new THREE.HemisphereLight('#eff7ff','#c9bfa9',2.5),key=new THREE.DirectionalLight('#fff7e5',3.5),fill=new THREE.DirectionalLight('#d6e8fa',1.4);key.position.set(-5,9,7);fill.position.set(6,4,-4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=key.shadow.camera.bottom=-10;key.shadow.camera.right=key.shadow.camera.top=10;key.shadow.bias=-.0004;key.shadow.normalBias=.025;scene.add(ambient,key,fill);
 const floor=new THREE.Mesh(new THREE.CircleGeometry(24,80),new THREE.MeshStandardMaterial({color:'#ebe7df',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.receiveShadow=true;scene.add(floor);
 const generator=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),env=generator.fromScene(room,.04);scene.environment=env.texture;room.dispose();generator.dispose();
 let model=null,current=null,dead=false,active=true,frame=0,lastSize='';
 function paint(){if(dead||!active||!host.clientWidth||!host.clientHeight)return;try{renderer.render(scene,camera);}catch(e){onFailure?.(e);}}
 function fit(){
  if(!model)return;const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());controls.target.set(0,Math.max(1,center.y*.85),0);
  const direction=new THREE.Vector3(.64,.67,.78).normalize(),right=new THREE.Vector3(direction.z,0,-direction.x).normalize(),up=new THREE.Vector3().crossVectors(direction,right),tanV=Math.tan(camera.fov*Math.PI/360),tanH=tanV*camera.aspect;let distance=4;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new THREE.Vector3(x,y,z).sub(controls.target);distance=Math.max(distance,Math.abs(p.dot(right))/tanH+p.dot(direction),Math.abs(p.dot(up))/tanV+p.dot(direction));}
  distance*=1.12;camera.position.copy(controls.target).addScaledVector(direction,distance);controls.minDistance=4;controls.maxDistance=distance*2;camera.lookAt(controls.target);controls.update();paint();
 }
 function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();fit();}
 function update(item){if(current&&JSON.stringify(current)===JSON.stringify(item))return;current=JSON.parse(JSON.stringify(item));if(model){scene.remove(model);disposeGroup(model);}model=makeTable(item);scene.add(model);renderer.shadowMap.needsUpdate=true;const size=[item.tableId,item.widthFt,item.depthFt,item.chairId,item.seatCount>0].join(':');if(size!==lastSize){lastSize=size;fit();}paint();}
 controls.addEventListener('change',paint);const observer=new ResizeObserver(resize);observer.observe(host);
 const lost=e=>{e.preventDefault();onFailure?.(new Error('3D view interrupted'));};renderer.domElement.addEventListener('webglcontextlost',lost);resize();
 return {update,fit,visible(value){active=value;if(value){resize();paint();}},destroy(){dead=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('webglcontextlost',lost);if(model)disposeGroup(model);floor.geometry.dispose();floor.material.dispose();key.shadow.dispose();env.dispose();renderer.dispose();renderer.forceContextLoss?.();host.replaceChildren();}};
}
