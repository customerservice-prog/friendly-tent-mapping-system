import { equipmentOperationProfile } from '../data/asset-registry.js';

// The renderer's existing animation clock pauses for hidden tabs, reduced motion,
// placement and scene motion-off. This controller never starts its own RAF/timer.
export function attachEquipmentOperation(root,type,item={},animate=null,{effects=[],reset=null}={}){
  const profile=equipmentOperationProfile(type),supported=profile.supported&&typeof animate==='function';
  let running=supported&&item.operationState!=='off',elapsed=0,lastTime=null;
  const status={...profile,supported,state:running?'running':'off',previewOnly:true};
  root.userData.operation=status;root.userData.animated=supported;
  function visibility(){for(const effect of effects)effect.visible=running;}
  root.userData.setOperating=value=>{
    const next=supported&&(value===true||value==='running');
    if(next===running)return false;
    running=next;status.state=running?'running':'off';lastTime=null;visibility();
    if(!running)reset?.();return true;
  };
  if(supported){
    root.userData.update=time=>{
      const dt=lastTime==null?0:Math.max(0,Math.min(.15,Number(time)-lastTime));lastTime=Number(time);
      if(!running||!Number.isFinite(dt))return false;
      for(let node=root;node;node=node.parent)if(node.visible===false)return false;
      elapsed+=dt;animate(elapsed);return true;
    };
    animate(0);
  }else delete root.userData.update;
  visibility();if(!running)reset?.();return root;
}
