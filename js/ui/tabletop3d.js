import * as THREE from 'three';
import { tabletopPlacements } from '../data/tabletop.js';
import { linenColorHex } from '../data/linens.js';
// Shared with the event renderer and the isolated table view. Nothing decorative
// is added unless the corresponding product is selected in the layout store.
export function makeTabletop(item,height){
 const root=new THREE.Group();root.name='Selected tabletop rentals';
 const ceramic=new THREE.MeshStandardMaterial({color:'#fffdf5',roughness:.25}),silver=new THREE.MeshStandardMaterial({color:'#b6c1c7',metalness:.85,roughness:.24}),gold=new THREE.MeshStandardMaterial({color:'#c6a060',metalness:.75,roughness:.24}),glass=new THREE.MeshPhysicalMaterial({color:'#d7eef0',transparent:true,opacity:.42,roughness:.08,metalness:.05,side:THREE.DoubleSide}),leaf=new THREE.MeshStandardMaterial({color:'#61836b',roughness:.85});
 const sphere=new THREE.SphereGeometry(1,12,8),cloths=new Map();
 const mesh=(host,geo,mat,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;host.add(m);return m;};
 const box=(g,w,h,d,m,x=0,y=0,z=0)=>mesh(g,new THREE.BoxGeometry(w,h,d),m,x,y,z);
 const cyl=(g,r,h,m,x=0,y=0,z=0,rt=r)=>mesh(g,new THREE.CylinderGeometry(rt,r,h,28),m,x,y,z);
 for(const pos of tabletopPlacements(item)){
  const p=pos.product,g=new THREE.Group(),metal=/gold/i.test(p.name)?gold:silver;root.add(g);g.name=p.name;g.userData.productId=p.productId;g.position.set(pos.x,height+.06+pos.layer,pos.z);g.rotation.y=-pos.angle-Math.PI/2;
  if(['plate','charger','bowl'].includes(p.type)){
   const r=p.type==='charger'?.53:/salad|bread/i.test(p.name)?.30:.43,m=p.type==='charger'?metal:ceramic;
   const points=p.type==='bowl'?[[0,0],[.21,0],[r,.22],[r-.03,.23],[.20,.03],[0,.03]]:[[0,0],[r*.7,0],[r,.055],[r,.075],[r*.7,.035],[0,.035]];
   mesh(g,new THREE.LatheGeometry(points.map(a=>new THREE.Vector2(...a)),32),m);
   if(p.type==='charger')for(let i=0;i<24;i++)cyl(g,.017,.023,metal,Math.cos(i*Math.PI/12)*r*.92,.08,Math.sin(i*Math.PI/12)*r*.92);
  }else if(p.type==='glass'){
   const stem=/wine|goblet|flute|martini/i.test(p.name),flute=/flute/i.test(p.name),mug=/mug/i.test(p.name),r=flute?.09:.14;
   if(stem){cyl(g,.14,.018,glass,0,.009);cyl(g,.017,.22,glass,0,.12);}
   const y=stem?.23:0,h=flute?.43:mug?.3:.32;
   const points=[[.045,0],[r*.8,.015],[r,h],[r-.012,h],[r*.8-.012,.03],[.045,.02]];
   mesh(g,new THREE.LatheGeometry(points.map(a=>new THREE.Vector2(...a)),28),glass,0,y);
   if(mug){const handle=mesh(g,new THREE.TorusGeometry(.095,.019,8,16),glass,r+.055,.17);handle.rotation.y=Math.PI/2;}
  }else if(['fork','knife','spoon','utensil'].includes(p.type)){
   box(g,.045,.018,.40,metal,0,.012,.1);
   if(p.type==='fork'){box(g,.15,.018,.12,metal,0,.012,-.15);for(const x of [-.065,-.022,.022,.065])box(g,.015,.018,.15,metal,x,.012,-.27);}
   else if(p.type==='knife')box(g,.10,.025,.30,metal,.03,.02,-.22);
   else{const head=mesh(g,sphere,metal,0,.025,-.23);head.scale.set(.095,.025,.145);}
  }else if(p.type==='napkin'||p.type==='runner'){
   if(!cloths.has(pos.color))cloths.set(pos.color,new THREE.MeshStandardMaterial({color:linenColorHex(pos.color),roughness:.96,side:THREE.DoubleSide}));const cloth=cloths.get(pos.color);
   if(p.type==='napkin'){box(g,.46,.025,.59,cloth);box(g,.13,.008,.57,cloth,.11,.018);}
   else{g.rotation.y=0;const alongX=item.widthFt>=item.depthFt,len=Math.max(item.widthFt,item.depthFt);box(g,alongX?len:.96,.02,alongX?.96:len,cloth);const drop=Math.max(0,Math.min(height,(9-len)/2));for(const side of [-1,1])box(g,alongX?.018:.96,drop,alongX?.96:.018,cloth,alongX?side*len/2:0,-drop/2,alongX?0:side*len/2);}
  }else if(p.type==='centerpiece'){
   if(/lantern/i.test(p.name)){box(g,.45,.035,.45,metal,0,.02);box(g,.45,.06,.45,metal,0,.73);for(const x of [-.21,.21])for(const z of [-.21,.21])box(g,.025,.72,.025,metal,x,.37,z);box(g,.39,.65,.39,glass,0,.35);cyl(g,.10,.38,ceramic,0,.21);}
   else{cyl(g,.16,.35,glass,0,.175,0,.21);for(let i=0;i<13;i++){const a=i*2.4,r=.12+(i%3)*.09;const l=mesh(g,sphere,leaf,Math.cos(a)*r,.38+(i%3)*.08,Math.sin(a)*r);l.scale.set(.19,.07,.13);l.rotation.z=a;const f=mesh(g,sphere,ceramic,Math.cos(a)*r*.8,.51+(i%3)*.07,Math.sin(a)*r*.8);f.scale.set(.115,.09,.115);}}
  }else if(p.type==='candle'){
   cyl(g,.23,.04,gold,0,.02);cyl(g,.035,.7,gold,0,.38);const branches=/candelabra/i.test(p.name)?5:1;for(let i=0;i<branches;i++){const a=i*Math.PI/2,r=i?.30:0,x=Math.cos(a)*r,z=Math.sin(a)*r;cyl(g,.055,.34,ceramic,x,.86,z);if(i){const arm=box(g,.035,.035,.36,gold,x/2,.66,z/2);arm.rotation.y=-a+Math.PI/2;}}
  }else if(p.type==='number'){cyl(g,.15,.025,gold,0,.02);cyl(g,.012,.65,gold,0,.34);box(g,.42,.28,.02,ceramic,0,.72);}
  else if(p.type==='pitcher'){cyl(g,.21,.47,glass,0,.24,0,.18);const handle=mesh(g,new THREE.TorusGeometry(.16,.025,8,20),glass,.24,.27);handle.scale.y=1.2;}
  else if(p.type==='stand'){cyl(g,.21,.05,metal,0,.025);cyl(g,.05,.34,metal,0,.21);cyl(g,.48,.045,metal,0,.4);if(/tier|level/i.test(p.name)){cyl(g,.04,.5,metal,0,.65);cyl(g,.33,.035,metal,0,.72);cyl(g,.23,.035,metal,0,.96);}}
  else if(p.type==='fountain'){const chocolate=new THREE.MeshStandardMaterial({color:'#6a3d25',roughness:.28});cyl(g,.36,.25,metal,0,.125);for(let i=0;i<3;i++)cyl(g,.31-i*.08,.16,chocolate,0,.34+i*.24,0,.1);}
  else if(p.type==='dispenser'){cyl(g,.35,.08,metal,0,.04);cyl(g,.31,.86,/coffee/i.test(p.name)?metal:glass,0,.5);cyl(g,.35,.07,metal,0,.96);box(g,.12,.12,.18,silver,0,.2,.36);}
  else if(p.type==='condiment'){for(const x of [-.12,.12]){cyl(g,.085,.2,glass,x,.1);cyl(g,.08,.04,silver,x,.22);}}
  else{box(g,1.25,.12,.80,silver,0,.15);box(g,1.10,p.type==='chafer'?.36:.14,.65,p.type==='chafer'?silver:ceramic,0,p.type==='chafer'?.38:.24);if(p.type==='chafer'){for(const x of [-.5,.5])box(g,.04,.18,.5,silver,x,.05);box(g,.18,.045,.05,silver,0,.6);}}
 }
 return root;
}
