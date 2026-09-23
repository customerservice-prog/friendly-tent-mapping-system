import * as THREE from 'three';

// Props belong to the read-only sample, never to the rental catalog or an
// editable customer scene. Their positions follow marketing-reception.js.
export function createMarketingDetails(tent){
  const all=new THREE.Group(),x=n=>n-tent.widthFt/2,z=n=>n-tent.lengthFt/2;
  const wood=new THREE.MeshStandardMaterial({color:'#604331',roughness:.62});
  const brass=new THREE.MeshStandardMaterial({color:'#c6a773',metalness:.62,roughness:.27});
  const dark=new THREE.MeshStandardMaterial({color:'#1c2631',roughness:.52});
  const silver=new THREE.MeshStandardMaterial({color:'#b9c4c9',metalness:.82,roughness:.25});
  const glass=new THREE.MeshPhysicalMaterial({color:'#e4f0e9',transparent:true,opacity:.68,metalness:.08,roughness:.13});
  const green=new THREE.MeshStandardMaterial({color:'#486d4d',roughness:.9});
  const bloom=new THREE.MeshStandardMaterial({color:'#f4d9d3',roughness:.78});
  function block(g,w,h,d,m,xx,yy,zz){const q=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);q.position.set(xx,yy,zz);q.castShadow=q.receiveShadow=true;g.add(q);return q;}
  function cylinder(g,r1,r2,h,m,xx,yy,zz){const q=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,12),m);q.position.set(xx,yy,zz);q.castShadow=true;g.add(q);return q;}
  function part(name,at){const group=new THREE.Group();group.name=name;group.userData.marketingAt=at;all.add(group);return group;}
  const dj=part('DJ and sound',.57);
  for(const xx of [x(16.4),x(23.6)]){
    block(dj,.08,2.7,.08,dark,xx,1.35,z(56.5));
    block(dj,.92,1.55,.73,dark,xx,2.88,z(56.5));
    for(const y of [2.55,3.06]){const q=new THREE.Mesh(new THREE.TorusGeometry(.24,.03,8,20),silver);q.position.set(xx,y,z(56.9));dj.add(q);}
  }
  block(dj,2.8,.10,1.25,dark,x(20),2.78,z(56.5));
  for(let i=0;i<12;i++)block(dj,.1,.03,.15,i%3===0?brass:silver,x(18.9+i*.2),2.85,z(56.5));
  const bar=part('Bar service',.62);
  block(bar,7.4,2.5,.14,wood,x(34.8),1.25,z(31.65));
  for(let i=0;i<7;i++){
    const xx=x(32+i*.85),yy=2.7+(i%3)*.16;
    cylinder(bar,.12,.14,.75,glass,xx,yy,z(29.85));
    cylinder(bar,.035,.035,.24,brass,xx,yy+.48,z(29.85));
  }
  const buffet=part('Buffet service',.65);
  for(const zz of [z(28.45),z(35.45)])for(const xx of [x(3.1),x(5.2),x(7.3)]){
    block(buffet,1.55,.2,1.2,silver,xx,2.63,zz);
    const dome=new THREE.Mesh(new THREE.SphereGeometry(.68,16,8,0,Math.PI*2,0,Math.PI/2),silver);
    dome.scale.set(1.12,.48,.78);dome.position.set(xx,2.78,zz);buffet.add(dome);
    cylinder(buffet,.075,.075,.22,brass,xx,3.17,zz);
  }
  const entry=part('Wedding entrance',.83);
  const front=z(58.7),left=x(15.8),right=x(24.2);
  for(const xx of [left,right]){
    cylinder(entry,.11,.11,7.2,brass,xx,3.6,front);
    cylinder(entry,.34,.4,.16,brass,xx,.08,front);
  }
  block(entry,8.45,.14,.14,brass,x(20),7.25,front);
  for(let i=0;i<18;i++){
    const xx=left+i*.49;
    const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(.35,0),green);
    leaf.scale.set(1,.7,.55);leaf.position.set(xx,7.22+Math.sin(i)*.14,front);entry.add(leaf);
    if(i%4===0){const flower=new THREE.Mesh(new THREE.IcosahedronGeometry(.24,0),bloom);flower.position.set(xx,7.48,front+.05);entry.add(flower);}
  }
  const couple=part('Sweetheart setting',.8);
  for(const xx of [x(18.8),x(21.2)]){
    cylinder(couple,.11,.11,.62,brass,xx,2.85,z(2.2));
    const flame=new THREE.Mesh(new THREE.SphereGeometry(.12,10,8),new THREE.MeshStandardMaterial({color:'#ffdb98',emissive:'#ffb65d',emissiveIntensity:1.5}));
    flame.position.set(xx,3.22,z(2.2));couple.add(flame);
  }
  return all;
}
