// A small, read-only overhead drawing of the same public scene used by view3d.
// It runs on phones and when WebGL is unavailable; no tenant data is loaded.
export function drawMarketingPlan(canvas, scene, progress) {
  const width=canvas.width,height=canvas.height,ctx=canvas.getContext('2d');
  if(!ctx)return;
  const p=Math.max(0,Math.min(1,progress));
  ctx.clearRect(0,0,width,height);
  const bg=ctx.createLinearGradient(0,0,width,height);
  bg.addColorStop(0,'#192f2c');bg.addColorStop(1,'#0d242d');
  ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
  const scale=Math.min(width/70,height/49),left=(width-60*scale)/2,top=(height-40*scale)/2;
  ctx.save();ctx.translate(left,top);ctx.scale(scale,scale);
  ctx.fillStyle='#345c50';ctx.fillRect(-5,-4,70,48);
  ctx.strokeStyle='rgba(221,242,225,.11)';ctx.lineWidth=.075;
  for(let x=-5;x<=65;x+=2){ctx.beginPath();ctx.moveTo(x,-4);ctx.lineTo(x,44);ctx.stroke();}
  for(let y=-4;y<=44;y+=2){ctx.beginPath();ctx.moveTo(-5,y);ctx.lineTo(65,y);ctx.stroke();}
  if(p>.035){
    const k=Math.min(1,(p-.035)/.065);
    ctx.globalAlpha=k;ctx.fillStyle='#eee9df';ctx.fillRect(0,0,60,40);
    ctx.strokeStyle='#5a80b5';ctx.lineWidth=.42;ctx.setLineDash([.9,.45]);ctx.strokeRect(0,0,60,40);ctx.setLineDash([]);
    ctx.fillStyle='#254a75';ctx.font='600 1.05px system-ui,sans-serif';ctx.fillText('40′ × 60′ POLE TENT',1,2);
    ctx.globalAlpha=1;
  }
  if(p>.12){
    ctx.globalAlpha=Math.min(1,(p-.12)/.10);ctx.fillStyle='#5b7685';
    for(const x of [0,10,20,30,40,50,60])for(const y of [0,40]){ctx.beginPath();ctx.arc(x,y,.26,0,Math.PI*2);ctx.fill();}
    for(const x of [20,40]){ctx.beginPath();ctx.arc(x,20,.55,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;
  }
  const round=scene.objects.filter(o=>o.id.startsWith('wedding-table-'));
  const floor=scene.objects.filter(o=>o.kind==='dance');
  if(p>.49){
    ctx.globalAlpha=Math.min(1,(p-.49)/.07);
    floor.forEach(o=>{
      ctx.fillStyle=(o.x+o.y)%2?'#b98050':'#d6a775';ctx.fillRect(o.y,o.x,o.depthFt,o.widthFt);
      ctx.strokeStyle='#926849';ctx.lineWidth=.08;ctx.strokeRect(o.y,o.x,o.depthFt,o.widthFt);
    });ctx.globalAlpha=1;
  }
  function table(o,i){
    const first=o.id.startsWith('wedding-table-')?.26+i*.013:o.id==='wedding-sweetheart'?.45:o.id==='wedding-dj'?.57:o.id==='wedding-bar'?.62:o.id.startsWith('wedding-buffet-')?.65:.69;
    if(p<=first)return;ctx.globalAlpha=Math.min(1,(p-first)/.035);
    const x=o.y+o.depthFt/2,y=o.x+o.widthFt/2;
    if(o.shape==='round'){
      ctx.fillStyle=p>.74?'#f9f8f2':'#bb9972';ctx.strokeStyle='#b9b9aa';ctx.lineWidth=.13;
      ctx.beginPath();ctx.arc(x,y,o.widthFt/2,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(o.seatCount&&p>.39){
        ctx.fillStyle='#fffaf0';ctx.strokeStyle='#b9a36b';ctx.lineWidth=.13;
        const c=Math.min(1,(p-.39)/.09);ctx.globalAlpha*=c;
        for(let n=0;n<o.seatCount;n++){
          const a=n*Math.PI*2/o.seatCount,xx=x+Math.cos(a)*3.4,yy=y+Math.sin(a)*3.4;
          ctx.beginPath();ctx.arc(xx,yy,.54,0,Math.PI*2);ctx.fill();ctx.stroke();
        }
        ctx.globalAlpha=1;
      }
      if(p>.79){
        ctx.globalAlpha=Math.min(1,(p-.79)/.07);ctx.fillStyle='#698b6a';
        ctx.beginPath();ctx.arc(x,y,.46,0,Math.PI*2);ctx.fill();
        for(let n=0;n<5;n++){const a=n*Math.PI*2/5;ctx.fillStyle='#eedfd9';ctx.beginPath();ctx.arc(x+Math.cos(a)*.72,y+Math.sin(a)*.72,.25,0,Math.PI*2);ctx.fill();}
      }
    }else{
      ctx.fillStyle=p>.74?'#fffdf5':'#aa8159';ctx.strokeStyle='#a8ada2';ctx.lineWidth=.14;
      ctx.fillRect(o.y,o.x,o.depthFt,o.widthFt);ctx.strokeRect(o.y,o.x,o.depthFt,o.widthFt);
      if(o.id==='wedding-sweetheart'&&p>.48){ctx.fillStyle='#fffaf0';for(const dy of [-1.5,1.5]){ctx.beginPath();ctx.arc(o.y+o.depthFt+1.2,y+dy,.58,0,Math.PI*2);ctx.fill();}}
    }
    ctx.globalAlpha=1;
  }
  round.forEach(table);
  scene.objects.filter(o=>o.kind==='table'&&!o.id.startsWith('wedding-table-')).forEach((o,i)=>table(o,i));
  if(p>.86){
    ctx.globalAlpha=Math.min(1,(p-.86)/.055);ctx.strokeStyle='#e4bd70';ctx.lineWidth=.13;ctx.setLineDash([.3,.28]);
    for(const y of [4,36]){ctx.beginPath();ctx.moveTo(2,y);ctx.lineTo(58,y);ctx.stroke();}
    ctx.setLineDash([]);ctx.globalAlpha=1;
  }
  if(p>.55){
    ctx.font='700 1.25px system-ui,sans-serif';ctx.textAlign='center';ctx.fillStyle='#274455';
    const label=(value,x,y,start)=>{if(p>start)ctx.fillText(value,x,y);};
    label('DANCE FLOOR',30,20,.55);label('SWEETHEART',3.4,20,.48);
    label('DJ',56,20,.6);label('BAR',33.4,35,.65);label('BUFFET',30,5,.68);
  }
  ctx.restore();
}
