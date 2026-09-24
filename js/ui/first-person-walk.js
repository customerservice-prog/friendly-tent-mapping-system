import * as THREE from 'three';
import {
  walkPositionBlocked,
  resolveWalkStep,
  findSafeWalkStart,
  walkSpeedFtPerSecond,
} from '../core/walk-navigation.js';

/*
 * First-person walk controller for RentSketch's reconstructed venue world.
 *
 * Camera movement never mutates rental placement. All world-boundary,
 * reconstructed-property, no-place, inflatable, sliding and safe-spawn rules
 * are delegated to the shared world-space navigation core so Walk Mode uses
 * the exact same spatial contract as property fit planning.
 */
function finite(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

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
  function navigationArgs(){
    return {
      site:site(),
      photoGeometry:getObstacles?.()||[],
      items:getItems?.()||[],
      bodyRadiusFt:.85,
      blockRentalKinds:['inflatable'],
    };
  }
  function blocksWorldPosition(worldX,worldZ){
    return walkPositionBlocked({worldX,worldZ,...navigationArgs()}).blocked;
  }
  function safeStart(){
    const s=site();
    return findSafeWalkStart({
      preferredWorldPoint:{
        x:clamp(camera.position.x,-s.widthFt*.45,s.widthFt*.45),
        z:clamp(camera.position.z,-s.lengthFt*.45,s.lengthFt*.45),
      },
      ...navigationArgs(),
    });
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
    const forward=wanted('forward',['w','arrowup'])?1:0;
    const back=wanted('back',['s','arrowdown'])?1:0;
    const left=wanted('left',['a','arrowleft'])?1:0;
    const strafeRight=wanted('right',['d','arrowright'])?1:0;
    const fb=forward-back,lr=strafeRight-left;
    if(!fb&&!lr)return false;

    direction.set(-Math.sin(yaw),0,-Math.cos(yaw));
    right.crossVectors(direction,up).normalize();
    move.set(0,0,0).addScaledVector(direction,fb).addScaledVector(right,lr);
    if(move.lengthSq()>1)move.normalize();

    const elapsed=Math.max(0,Math.min(.05,finite(dt)));
    const speed=walkSpeedFtPerSecond({sprint:keys.has('shift'),mobile});
    move.multiplyScalar(speed*elapsed);

    const from={x:camera.position.x,z:camera.position.z};
    const resolved=resolveWalkStep({
      from,
      to:{x:from.x+move.x,z:from.z+move.z},
      ...navigationArgs(),
    });
    if(!resolved.moved)return false;
    camera.position.set(resolved.x,eyeHeight,resolved.z);syncRotation();onChange();return true;
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
