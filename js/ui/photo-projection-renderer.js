// The shared 2D plan uses +X to the photo's right and +Z into its depth. Its
// projective camera is therefore reflected relative to Three's conventional
// right-handed camera. Three r160 accounts for reflected object matrices, but
// not reflected projection matrices, when selecting rasterizer front-face order.
// Correct that parity per draw so culling and gl_FrontFacing lighting agree.
// Shadow cameras and the ordinary model camera keep Three's normal behavior.
export function installPhotoProjectionParity(renderer){
  if(typeof renderer?.renderBufferDirect!=='function'||typeof renderer?.state?.setMaterial!=='function')return ()=>{};
  const original=renderer.renderBufferDirect;
  const wrapped=function(camera,...args){
    // Three's 2D background quad writes clip coordinates directly and does not
    // use the camera projection. Its own winding must stay unchanged.
    if(!camera?.userData?.photoProjection?.mirrored||args[2]?.name==='BackgroundMaterial'||args[2]?.userData?.photoClipSpace)return original.call(this,camera,...args);
    const state=renderer.state,setMaterial=state.setMaterial;
    state.setMaterial=function(material,frontFaceCW){return setMaterial.call(this,material,!frontFaceCW);};
    try{return original.call(this,camera,...args);}
    finally{state.setMaterial=setMaterial;}
  };
  renderer.renderBufferDirect=wrapped;
  return ()=>{if(renderer.renderBufferDirect===wrapped)renderer.renderBufferDirect=original;};
}
