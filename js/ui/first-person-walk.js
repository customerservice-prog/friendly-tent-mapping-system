import * as THREE from 'three';

/*
 * First-person walk controller for RentSketch's reconstructed venue world.
 *
 * Camera movement is separate from rental placement. Walking can never mutate
 * tent/table/chair coordinates. Collision here is intentionally conservative:
 * traced property geometry and large inflatables block the viewer, while chairs
 * and tables stay passable so a customer cannot become trapped in a dense layout.
 */
function finite(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

function pointInRotatedRect(x,z,item,padding=0){
  const w=Math.max(.1,finite(item?.widthFt,1))+padding*2;
  const d=Math.max(.1,finite(item?.depthFt??item?.lengthFt,1))+padding*2;
  const cx=finite(item?.x)+Math.max(.1,finite(item?.widthFt,1))/2;
  const cz=finite(item?.y)+Math.max(.1,finite(item?.depthFt??item?.lengthFt,1))/2;
  const a=-finite(item?.rotationDeg)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const dx=x-cx,dz=z-cz,rx=dx*c-dz*s,rz=dx*s+dz*c;
  return Math.abs(rx)<=w/2&&Math.abs(rz)<=d/2;
}

function button(label,dir){
  const b=document.createElement('button');
  b.type='button';b.className='walk-pad-btn walk-'+dir;b.textContent=label;
  b.setAttribute('aria-label',({forward:'Walk forward',back:'Walk backward',left:'Strafe left',right:'Strafe right'})[dir]||label);
  b.dataset.walkDir=dir;return b;
}

export function createFirstPersonWalk({
  camera,
  controls,
  domElement,
  container,
  getSite,
  getObstacles,
  getItems,
  mobile=false,
  eyeHeight=5.6,
  onChange=()=>{},
  onMode=()=>{},
}={}){
  let active=false,yaw=0,pitch=0,drag=null,pad=null;
  const keys=new Set(),pressedDirections=new Set(),up=new THREE.Vector3(0,1,0);
  const direction=new THREE.Vector3(),right=new THREE.Vector3(),move=new THREE.Vector3();
  const euler=new THREE.Euler(0,0,0,'YXZ');

  function site(){
    const s=getSite?.()||{};
    return {widthFt:Math.max(8,finite(s.widthFt,50)),lengthFt:Math.max(8,finite(s.lengthFt,60))};
  }
  function blocksWorldPosition(worldX,worldZ){
    const s=site(),lx=worldX+s.widthFt/2,lz=worldZ+s.lengthFt/2,padFt=.85;
    if(lx<padFt||lz<padFt||lx>s.widthFt-padFt||lz>s.lengthFt-padFt)return true;
    for(const g of getObstacles?.()||[]){
      if(!g||g.type==='no-place')continue;
      if(pointInRotatedRect(lx,lz,g,padFt))return true;
    }
    for(const item of getItems?.()||[]){
      if(item?.kind!=='inflatable')continue;
      if(pointInRotatedRect(lx,lz,item,1))return true;
    }
    return false;
  }
  function safeStart(){
    const s=site(),candidates=[
      {x:clamp(camera.position.x,-s.widthFt*.45,s.widthFt*.45),z:clamp(camera.position.z,-s.lengthFt*.45,s.lengthFt*.45)},
      {x:0,z:-s.lengthFt*.34},{x:-s.widthFt*.22,z:-s.lengthFt*.18},{x:s.widthFt*.22,z:-s.lengthFt*.18},{x:0,z:0}
    ];
    return candidates.find(p=>!blocksWorldPosition(p.x,p.z))||{x:0,z:-s.lengthFt*.4};
  }
  function syncRotation(){
    camera.rotation.order='YXZ';camera.rotation.x=pitch;camera.rotation.y=yaw;camera.rotation.z=0;camera.updateMatrixWorld(true);
  }
  function addPad(){
    if(pad||!mobile||!container)return;
    pad=document.createElement('div');pad.className='walk-pad';pad.setAttribute('aria-label','Walk controls');
    pad.append(button('↑','forward'),button('←','left'),button('↓','back'),button('→','right'));
    const start=e=>{const b=e.target.closest?.('[data-walk-dir]');if(!b)return;e.preventDefault();pressedDirections.add(b.dataset.walkDir);b.classList.add('is-pressed');};
    const stop=e=>{const b=e.target.closest?.('[data-walk-dir]');if(!b)return;e.preventDefault();pressedDirections.delete(b.dataset.walkDir);b.classList.remove('is-pressed');};
    pad.addEventListener('pointerdown',start);pad.addEventListener('pointerup',stop);pad.addEventListener('pointercancel',stop);pad.addEventListener('pointerleave',stop);
    container.appendChild(pad);
  }
  function removePad(){pad?.remove();pad=null;pressedDirections.clear();}

  function enter(){
    if(active)return true;
    active=true;keys.clear();pressedDirections.clear();
    euler.setFromQuaternion(camera.quaternion,'YXZ');pitch=clamp(euler.x,-1.25,1.25);yaw=euler.y;
    const p=safeStart();camera.position.set(p.x,eyeHeight,p.z);
    camera.fov=mobile?62:58;camera.updateProjectionMatrix();
    controls.enabled=false;controls.enableRotate=false;controls.enablePan=false;controls.enableZoom=false;
    domElement.style.cursor='crosshair';domElement.classList.add('walk-mode-canvas');
    addPad();syncRotation();onMode(true);onChange();return true;
  }
  function exit(){
    if(!active)return false;
    active=false;keys.clear();pressedDirections.clear();drag=null;removePad();
    domElement.style.cursor='grab';domElement.classList.remove('walk-mode-canvas');
    controls.enabled=true;controls.enableRotate=true;controls.enablePan=true;controls.enableZoom=true;
    camera.getWorldDirection(direction);direction.y=0;if(direction.lengthSq()<1e-5)direction.set(0,0,-1);direction.normalize();
    controls.target.copy(camera.position).addScaledVector(direction,12);controls.target.y=Math.max(2.5,eyeHeight*.55);controls.update();
    onMode(false);onChange();return true;
  }
  function isActive(){return active;}

  function keyDown(e){
    if(!active||e.ctrlKey||e.metaKey||e.altKey)return;
    const k=String(e.key||'').toLowerCase();
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(k)){keys.add(k);e.preventDefault();}
    if(k==='escape'){exit();e.preventDefault();}
  }
  function keyUp(e){keys.delete(String(e.key||'').toLowerCase());}
  function pointerDown(e){
    if(!active||e.target.closest?.('.walk-pad'))return;
    if(e.button!==undefined&&e.button!==0)return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY};
    domElement.setPointerCapture?.(e.pointerId);e.preventDefault();e.stopImmediatePropagation();
  }
  function pointerMove(e){
    if(!active||!drag||drag.id!==e.pointerId)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
    yaw-=dx*(mobile?.006:.0042);pitch=clamp(pitch-dy*(mobile?.005:.0036),-1.28,1.28);
    syncRotation();onChange();e.preventDefault();e.stopImmediatePropagation();
  }
  function pointerUp(e){
    if(!active||!drag||drag.id!==e.pointerId)return;
    drag=null;try{domElement.releasePointerCapture?.(e.pointerId);}catch{}
    e.preventDefault();e.stopImmediatePropagation();
  }

  window.addEventListener('keydown',keyDown,{passive:false});
  window.addEventListener('keyup',keyUp);
  domElement.addEventListener('pointerdown',pointerDown,true);
  domElement.addEventListener('pointermove',pointerMove,true);
  domElement.addEventListener('pointerup',pointerUp,true);
  domElement.addEventListener('pointercancel',pointerUp,true);

  function wanted(name,keysFor){
    return pressedDirections.has(name)||keysFor.some(k=>keys.has(k));
  }
  function update(dt){
    if(!active)return false;
    const forward= wanted('forward',['w','arrowup'])?1:0;
    const back= wanted('back',['s','arrowdown'])?1:0;
    const left= wanted('left',['a','arrowleft'])?1:0;
    const strafeRight= wanted('right',['d','arrowright'])?1:0;
    const fb=forward-back,lr=strafeRight-left;
    if(!fb&&!lr)return false;
    direction.set(-Math.sin(yaw),0,-Math.cos(yaw));
    right.crossVectors(direction,up).normalize();
    move.set(0,0,0).addScaledVector(direction,fb).addScaledVector(right,lr);
    if(move.lengthSq()>1)move.normalize();
    const speed=(keys.has('shift')?15:8.5)*Math.max(0,Math.min(.05,finite(dt)));
    move.multiplyScalar(speed);
    const ox=camera.position.x,oz=camera.position.z;
    let nx=ox+move.x,nz=oz+move.z;
    // Slide along obstacles instead of making the camera feel stuck.
    if(blocksWorldPosition(nx,nz)){
      if(!blocksWorldPosition(nx,oz))nz=oz;
      else if(!blocksWorldPosition(ox,nz))nx=ox;
      else {nx=ox;nz=oz;}
    }
    if(nx===ox&&nz===oz)return false;
    camera.position.set(nx,eyeHeight,nz);syncRotation();onChange();return true;
  }

  function destroy(){
    exit();
    window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);
    domElement.removeEventListener('pointerdown',pointerDown,true);domElement.removeEventListener('pointermove',pointerMove,true);
    domElement.removeEventListener('pointerup',pointerUp,true);domElement.removeEventListener('pointercancel',pointerUp,true);
    removePad();
  }
  return {enter,exit,isActive,update,destroy,blocksWorldPosition};
}
