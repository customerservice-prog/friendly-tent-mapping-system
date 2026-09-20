import * as THREE from 'three';

// Small, local textures and one rain draw call. Weather never changes rental data.
function canvasMap(draw, width=256, height=256) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  draw(canvas.getContext('2d'),width,height);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
}
function cloudMap() {
  return canvasMap((ctx,w,h)=>{
    for(let i=0;i<32;i++){
      const x=35+(i*53%188),y=72+(i*29%65),r=24+(i*13%31);
      const g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,'rgba(255,255,255,.5)');g.addColorStop(.55,'rgba(250,253,255,.26)');g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
  });
}
export function createWeather(tent,{mobile=false}={}) {
  const group=new THREE.Group();group.name='Sky and weather';group.userData.decorative=true;
  const glowMap=canvasMap((ctx,w)=>{
    const g=ctx.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);
    g.addColorStop(0,'rgba(255,241,183,1)');g.addColorStop(.15,'rgba(255,231,152,.6)');g.addColorStop(.4,'rgba(255,235,189,.12)');g.addColorStop(1,'rgba(255,235,189,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,w,w);
  });
  const sun=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,depthWrite:false,fog:false,toneMapped:false}));
  sun.name='Visible sun';sun.position.set(-215,55,-280);sun.scale.set(65,65,1);group.add(sun);
  const disk=new THREE.Sprite(new THREE.SpriteMaterial({map:canvasMap((ctx,w)=>{ctx.fillStyle='#fff7d5';ctx.beginPath();ctx.arc(w/2,w/2,w*.44,0,Math.PI*2);ctx.fill();}),depthWrite:false,fog:false,toneMapped:false}));
  disk.position.copy(sun.position);disk.scale.set(9,9,1);group.add(disk);
  const moon=new THREE.Sprite(new THREE.SpriteMaterial({map:canvasMap((ctx,w)=>{
    const g=ctx.createRadialGradient(w*.38,w*.35,0,w/2,w/2,w*.45);g.addColorStop(0,'#f4f1dc');g.addColorStop(1,'#aebdce');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(w/2,w/2,w*.44,0,Math.PI*2);ctx.fill();
    for(let i=0;i<24;i++){const a=i*2.399,r=(i%7)/7*w*.32,x=w/2+Math.cos(a)*r,y=w/2+Math.sin(a)*r;ctx.fillStyle='rgba(96,113,136,.18)';ctx.beginPath();ctx.arc(x,y,3+i%9,0,Math.PI*2);ctx.fill();}
  }),depthWrite:false,fog:false,toneMapped:false}));
  moon.name='Moon';moon.position.copy(sun.position);moon.scale.set(13,13,1);group.add(moon);
  const cloudTexture=cloudMap(),clouds=[];
  for(let i=0;i<10;i++){
    const a=i/10*Math.PI*2,cloud=new THREE.Sprite(new THREE.SpriteMaterial({map:cloudTexture,transparent:true,depthWrite:false,fog:false}));
    cloud.position.set(Math.cos(a)*310,38+(i%3)*18,Math.sin(a)*310);cloud.scale.set(92+i%3*18,40+i%2*15,1);cloud.userData.origin=cloud.position.clone();group.add(cloud);clouds.push(cloud);
  }
  const count=mobile?360:720,positions=new Float32Array(count*6),seeds=[];
  const spanX=tent.widthFt+65,spanZ=tent.lengthFt+65,ceiling=48;
  for(let i=0;i<count;i++)seeds.push({x:((i*0.754877666)%1-.5)*spanX,z:((i*0.569840291)%1-.5)*spanZ,phase:(i*.618033989)%1});
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const rain=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xd3e4ef,transparent:true,opacity:.5,depthWrite:false}));
  rain.name='Rain outside the canopy';rain.frustumCulled=false;group.add(rain);
  let night=false,raining=false,time=0;
  function paint(){sun.visible=disk.visible=!night&&!raining;moon.visible=night&&!raining;clouds.forEach(c=>{c.material.color.set(night?0x647b9a:raining?0x8d9ba6:0xffffff);c.material.opacity=raining?.95:night?.35:.85;});rain.visible=raining;}
  function drops(){
    seeds.forEach((s,i)=>{
      const y=((s.phase*ceiling-time*22)%ceiling+ceiling)%ceiling;
      // Exclude the entire canopy footprint, including windward streak length.
      // Decorative rain must never appear to fall through the roof or tables.
      const under=!tent.isSite&&Math.abs(s.x)<tent.widthFt/2+1.5&&Math.abs(s.z)<tent.lengthFt/2+1.5;
      const yy=under?-10:y,j=i*6;positions.set([s.x,yy,s.z,s.x-.15,yy+1.25,s.z+.06],j);
    });geometry.attributes.position.needsUpdate=true;
  }
  drops();paint();
  group.userData.setNight=value=>{night=!!value;paint();};
  group.userData.setWeather=value=>{raining=value==='rain';paint();};
  group.userData.update=dt=>{time+=dt;clouds.forEach((c,i)=>{c.position.x=c.userData.origin.x+Math.sin(time*.012+i)*8;});if(raining)drops();};
  return group;
}
