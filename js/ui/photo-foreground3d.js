import * as THREE from 'three';
import {normalizePhotoComposition} from '../core/photo-composition.js';

// A fixed-view cutout of actual photo pixels. It has no depth or world geometry.
// Its clip-space quad is transparent outside user-traced image polygons.
export function createPhotoForegroundLayer(){
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),maskCanvas=document.createElement('canvas'),maskCtx=maskCanvas.getContext('2d');
  let texture=null,key='';
  const material=new THREE.ShaderMaterial({name:'Photo foreground pixels',uniforms:{map:{value:null}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:'uniform sampler2D map; varying vec2 vUv; void main(){gl_FragColor=texture2D(map,vUv);\n#include <colorspace_fragment>\n}',transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
  material.userData.photoClipSpace=true;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);mesh.name='Manually traced photo foreground';mesh.frustumCulled=false;mesh.renderOrder=100000;mesh.visible=false;
  mesh.userData={source:'manual-image-mask',geometryInferred:false};
  function update({sourceCanvas,rect,imageWidth,composition,sourceKey='',visible=true}){
    if(!ctx||!maskCtx){mesh.visible=false;return;}
    const masks=normalizePhotoComposition(composition).foregroundMasks.filter(mask=>mask.enabled);mesh.visible=!!visible&&masks.length>0;
    if(!mesh.visible||!sourceCanvas||!rect)return;
    const width=sourceCanvas.width,height=sourceCanvas.height,nextKey=JSON.stringify([width,height,rect,sourceKey,masks]);
    if(nextKey===key)return;key=nextKey;
    if(canvas.width!==width||canvas.height!==height||!texture){
      texture?.dispose();canvas.width=maskCanvas.width=width;canvas.height=maskCanvas.height=height;
      texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;material.uniforms.map.value=texture;
    }
    maskCtx.clearRect(0,0,width,height);
    for(const mask of masks){
      maskCtx.save();maskCtx.filter=mask.featherPx?'blur('+(mask.featherPx*rect.width/Math.max(1,imageWidth)).toFixed(3)+'px)':'none';maskCtx.fillStyle='#fff';maskCtx.beginPath();
      mask.points.forEach((p,i)=>{const x=rect.x+p.x*rect.width,y=rect.y+p.y*rect.height;if(i)maskCtx.lineTo(x,y);else maskCtx.moveTo(x,y);});maskCtx.closePath();maskCtx.fill();maskCtx.restore();
    }
    ctx.clearRect(0,0,width,height);ctx.globalCompositeOperation='source-over';ctx.drawImage(sourceCanvas,0,0);ctx.globalCompositeOperation='destination-in';ctx.drawImage(maskCanvas,0,0);ctx.globalCompositeOperation='source-over';texture.needsUpdate=true;
    mesh.userData.maskCount=masks.length;
  }
  return {mesh,update,hide(){mesh.visible=false;},invalidate(){key='';},dispose(){texture?.dispose();mesh.geometry.dispose();material.dispose();}};
}
