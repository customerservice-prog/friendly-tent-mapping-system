/*
 * RentSketch local multi-view stereo reconstruction.
 *
 * This is intentionally a metric, deterministic first step toward a real venue
 * digital twin. It does NOT invent the unseen property. Instead it uses three
 * overlapping captures (left / center / right) and image disparity to estimate
 * real depth in feet from a user-provided camera baseline.
 *
 * The output is a textured depth-mesh grid suitable for Three.js. It is much
 * closer to an actual 3D reconstruction than the old single-photo backdrop:
 * nearby pixels move more than distant pixels because they have distinct XYZ.
 *
 * Capture assumptions for this lightweight browser solver:
 *  - camera stays level and faces roughly the same direction,
 *  - user moves sideways between left / center / right photos,
 *  - zoom/focal length does not change between captures,
 *  - left-to-right baseline is known approximately in feet.
 *
 * Later this contract can be swapped for SfM / Gaussian Splatting without
 * changing RentSketch's world-registration or rental-geometry layers.
 */

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}
function clamp(value,min,max){
  return Math.max(min,Math.min(max,value));
}
function percentile(values,p){
  if(!values.length)return null;
  const a=values.slice().sort((x,y)=>x-y),i=clamp(Math.round((a.length-1)*p),0,a.length-1);
  return a[i];
}
function gray(image){
  const {data,width,height}=image||{};
  if(!data||!width||!height)throw new Error('Stereo reconstruction needs valid image data.');
  const out=new Float32Array(width*height);
  for(let i=0,j=0;i<data.length;i+=4,j++){
    out[j]=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;
  }
  return out;
}
function localContrast(g,w,h,x,y,r){
  let s=0,s2=0,n=0;
  for(let yy=y-r;yy<=y+r;yy++)for(let xx=x-r;xx<=x+r;xx++){
    if(xx<0||yy<0||xx>=w||yy>=h)continue;
    const v=g[yy*w+xx];s+=v;s2+=v*v;n++;
  }
  if(!n)return 0;
  const mean=s/n;
  return Math.sqrt(Math.max(0,s2/n-mean*mean));
}
function patchScore(a,b,w,h,ax,ay,bx,by,r){
  let ma=0,mb=0,n=0;
  for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++){
    const x1=ax+xx,y1=ay+yy,x2=bx+xx,y2=by+yy;
    if(x1<0||y1<0||x1>=w||y1>=h||x2<0||y2<0||x2>=w||y2>=h)continue;
    ma+=a[y1*w+x1];mb+=b[y2*w+x2];n++;
  }
  if(n<Math.max(9,(r*2+1)*(r*2+1)*.7))return Infinity;
  ma/=n;mb/=n;
  let err=0,energy=0;
  for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++){
    const x1=ax+xx,y1=ay+yy,x2=bx+xx,y2=by+yy;
    if(x1<0||y1<0||x1>=w||y1>=h||x2<0||y2<0||x2>=w||y2>=h)continue;
    const da=a[y1*w+x1]-ma,db=b[y2*w+x2]-mb,d=da-db;
    err+=d*d;energy+=da*da+db*db;
  }
  return err/Math.max(1,energy);
}
function bestMatch(center,target,w,h,x,y,{direction,maxDisparity,patchRadius,verticalSearch}){
  let best={score:Infinity,d:0,dy:0},second=Infinity;
  for(let d=1;d<=maxDisparity;d++){
    const tx=x+direction*d;
    if(tx-patchRadius<0||tx+patchRadius>=w)continue;
    for(let dy=-verticalSearch;dy<=verticalSearch;dy++){
      const ty=y+dy;
      if(ty-patchRadius<0||ty+patchRadius>=h)continue;
      const score=patchScore(center,target,w,h,x,y,tx,ty,patchRadius);
      if(score<best.score){second=best.score;best={score,d,dy};}
      else if(score<second)second=score;
    }
  }
  const separation=Number.isFinite(second)?(second-best.score)/Math.max(.0001,second):0;
  const confidence=clamp(separation*3.2,0,1)*clamp(1-best.score/.95,0,1);
  return {...best,confidence};
}
function chooseDisparity(leftMatch,rightMatch){
  const candidates=[leftMatch,rightMatch].filter(m=>m&&m.d>0&&Number.isFinite(m.score)&&m.confidence>.08);
  if(!candidates.length)return null;
  if(candidates.length===1)return {d:candidates[0].d,confidence:candidates[0].confidence,score:candidates[0].score};
  const [a,b]=candidates;
  const rel=Math.abs(a.d-b.d)/Math.max(1,Math.max(a.d,b.d));
  if(rel<.36){
    const wa=Math.max(.05,a.confidence),wb=Math.max(.05,b.confidence);
    return {d:(a.d*wa+b.d*wb)/(wa+wb),confidence:clamp((a.confidence+b.confidence)*.58,0,1),score:Math.min(a.score,b.score)};
  }
  const best=a.confidence>=b.confidence?a:b;
  return {d:best.d,confidence:best.confidence*.72,score:best.score};
}
function sampleColor(image,x,y){
  const {data,width,height}=image;
  x=clamp(Math.round(x),0,width-1);y=clamp(Math.round(y),0,height-1);
  const i=(y*width+x)*4;
  return [data[i]/255,data[i+1]/255,data[i+2]/255];
}

export function reconstructStereoGrid({
  left,
  center,
  right,
  baselineFt=6,
  fovDeg=62,
  horizonY=.34,
  eyeHeightFt=5.6,
  step=4,
  maxDisparity=28,
  patchRadius=2,
  verticalSearch=2,
  minContrast=7,
  minConfidence=.11,
  maxDepthFt=150,
  minDepthFt=3,
}={}){
  if(!left||!center||!right)throw new Error('Left, center and right captures are required.');
  const w=center.width,h=center.height;
  if(left.width!==w||right.width!==w||left.height!==h||right.height!==h)throw new Error('Scan frames must use the same working resolution.');
  baselineFt=clamp(finite(baselineFt,6),1,30);
  fovDeg=clamp(finite(fovDeg,62),35,100);
  horizonY=clamp(finite(horizonY,.34),.08,.85);
  step=Math.max(2,Math.min(10,Math.round(finite(step,4))));
  maxDisparity=Math.max(4,Math.min(Math.floor(w*.24),Math.round(finite(maxDisparity,28))));
  const centerGray=gray(center),leftGray=gray(left),rightGray=gray(right);
  const focalPx=w/(2*Math.tan(fovDeg*Math.PI/360));
  const halfBaseline=baselineFt/2;
  const margin=maxDisparity+patchRadius+2;
  const xs=[],ys=[];
  for(let x=margin;x<w-margin;x+=step)xs.push(x);
  for(let y=patchRadius+verticalSearch+1;y<h-patchRadius-verticalSearch-1;y+=step)ys.push(y);
  const cols=xs.length,rows=ys.length,total=cols*rows;
  const positions=new Float32Array(total*3),uvs=new Float32Array(total*2),colors=new Float32Array(total*3);
  const depths=new Float32Array(total),confidence=new Float32Array(total),valid=new Uint8Array(total);
  const validDepths=[],validConf=[];
  const horizonPx=horizonY*h;
  for(let gy=0;gy<rows;gy++){
    const y=ys[gy];
    for(let gx=0;gx<cols;gx++){
      const x=xs[gx],index=gy*cols+gx;
      uvs[index*2]=x/(w-1);uvs[index*2+1]=1-y/(h-1);
      const rgb=sampleColor(center,x,y);colors[index*3]=rgb[0];colors[index*3+1]=rgb[1];colors[index*3+2]=rgb[2];
      const contrast=localContrast(centerGray,w,h,x,y,patchRadius+1);
      if(contrast<minContrast)continue;
      // Same-facing lateral capture: content shifts right in the left image and
      // left in the right image relative to the center frame.
      const lm=bestMatch(centerGray,leftGray,w,h,x,y,{direction:1,maxDisparity,patchRadius,verticalSearch});
      const rm=bestMatch(centerGray,rightGray,w,h,x,y,{direction:-1,maxDisparity,patchRadius,verticalSearch});
      const match=chooseDisparity(lm,rm);
      if(!match||match.confidence<minConfidence)continue;
      const depth=clamp(focalPx*halfBaseline/Math.max(.5,match.d),minDepthFt,maxDepthFt);
      const worldX=(x-w/2)/focalPx*depth;
      const worldY=eyeHeightFt-(y-horizonPx)/focalPx*depth;
      positions[index*3]=worldX;positions[index*3+1]=worldY;positions[index*3+2]=depth;
      depths[index]=depth;confidence[index]=match.confidence;valid[index]=1;
      validDepths.push(depth);validConf.push(match.confidence);
    }
  }

  // Fill only small holes from neighboring metric samples. Large untextured
  // areas (usually sky) intentionally remain absent instead of becoming fake 3D.
  for(let pass=0;pass<2;pass++){
    const fill=[];
    for(let gy=1;gy<rows-1;gy++)for(let gx=1;gx<cols-1;gx++){
      const i=gy*cols+gx;if(valid[i])continue;
      const ns=[i-1,i+1,i-cols,i+cols].filter(j=>valid[j]);
      if(ns.length<3)continue;
      const ds=ns.map(j=>depths[j]),med=percentile(ds,.5);
      if(Math.max(...ds)-Math.min(...ds)>Math.max(4,med*.28))continue;
      fill.push({i,gx,gy,depth:med,conf:Math.min(...ns.map(j=>confidence[j]))*.65});
    }
    for(const f of fill){
      const x=xs[f.gx],y=ys[f.gy],i=f.i,depth=f.depth;
      positions[i*3]=(x-w/2)/focalPx*depth;
      positions[i*3+1]=eyeHeightFt-(y-horizonPx)/focalPx*depth;
      positions[i*3+2]=depth;depths[i]=depth;confidence[i]=f.conf;valid[i]=1;
    }
  }

  const indices=[];
  function triangle(a,b,c){
    if(!valid[a]||!valid[b]||!valid[c])return;
    const da=depths[a],db=depths[b],dc=depths[c],min=Math.min(da,db,dc),max=Math.max(da,db,dc);
    // Avoid stretching a surface across real depth discontinuities such as a
    // tree silhouette in front of a distant house.
    if(max-min>Math.max(5,min*.42))return;
    indices.push(a,b,c);
  }
  for(let gy=0;gy<rows-1;gy++)for(let gx=0;gx<cols-1;gx++){
    const a=gy*cols+gx,b=a+1,c=a+cols,d=c+1;
    triangle(a,c,b);triangle(b,c,d);
  }
  const validCount=valid.reduce((s,v)=>s+v,0),validRatio=total?validCount/total:0;
  const medianDepthFt=percentile(Array.from(depths).filter((_,i)=>valid[i]),.5);
  const avgConfidence=validCount?Array.from(confidence).reduce((s,v,i)=>s+(valid[i]?v:0),0)/validCount:0;
  const quality=validRatio>.42&&avgConfidence>.24?'good':validRatio>.20&&avgConfidence>.14?'usable':'weak';
  return {
    width:w,height:h,cols,rows,xSamples:xs,ySamples:ys,
    positions,uvs,colors,depths,confidence,valid,indices:new Uint32Array(indices),
    focalPx,baselineFt,fovDeg,horizonY,eyeHeightFt,
    metrics:{validCount,totalSamples:total,validRatio,medianDepthFt,averageConfidence:avgConfidence,triangleCount:indices.length/3,quality}
  };
}

export function stereoReconstructionSummary(result){
  const m=result?.metrics||{};
  return {
    quality:m.quality||'weak',
    coveragePct:Math.round((m.validRatio||0)*100),
    medianDepthFt:m.medianDepthFt==null?null:Math.round(m.medianDepthFt*10)/10,
    confidencePct:Math.round((m.averageConfidence||0)*100),
    triangles:Math.round(m.triangleCount||0)
  };
}


export function stereoObstacleRects(result,{
  siteWidthFt=50,
  siteLengthFt=60,
  cameraOffsetZ,
  cellFt=2,
  minHeightFt=1.4,
  maxHeightFt=35,
  minConfidence=.16,
  paddingFt=.35,
}={}){
  if(!result?.positions||!result?.valid||!result?.confidence)return [];
  siteWidthFt=Math.max(8,finite(siteWidthFt,50));siteLengthFt=Math.max(8,finite(siteLengthFt,60));
  cellFt=clamp(finite(cellFt,2),1,5);
  const cameraZ=Number.isFinite(Number(cameraOffsetZ))?Number(cameraOffsetZ):-siteLengthFt/2-8;
  const cols=Math.ceil(siteWidthFt/cellFt),rows=Math.ceil(siteLengthFt/cellFt),cells=new Map();
  for(let i=0;i<result.valid.length;i++){
    if(!result.valid[i]||result.confidence[i]<minConfidence)continue;
    const wx=result.positions[i*3],wy=result.positions[i*3+1],wz=result.positions[i*3+2]+cameraZ;
    if(!Number.isFinite(wx)||!Number.isFinite(wy)||!Number.isFinite(wz)||wy<minHeightFt||wy>maxHeightFt)continue;
    const sx=wx+siteWidthFt/2,sy=wz+siteLengthFt/2;
    if(sx<0||sy<0||sx>=siteWidthFt||sy>=siteLengthFt)continue;
    const cx=Math.floor(sx/cellFt),cy=Math.floor(sy/cellFt),key=cy*cols+cx;
    const cell=cells.get(key)||{cx,cy,count:0,maxHeight:0,confidence:0};
    cell.count++;cell.maxHeight=Math.max(cell.maxHeight,wy);cell.confidence+=result.confidence[i];cells.set(key,cell);
  }
  // Keep cells with repeated elevated evidence. A lone depth speck should not
  // become a blocking object in the rental fit engine.
  const solid=new Map(Array.from(cells).filter(([,cell])=>cell.count>=2).map(([k,v])=>[k,v]));
  const seen=new Set(),components=[];
  for(const [key,start] of solid){
    if(seen.has(key))continue;
    const queue=[start],part=[];seen.add(key);
    while(queue.length){
      const cell=queue.pop();part.push(cell);
      for(const [nx,ny] of [[cell.cx-1,cell.cy],[cell.cx+1,cell.cy],[cell.cx,cell.cy-1],[cell.cx,cell.cy+1]]){
        if(nx<0||ny<0||nx>=cols||ny>=rows)continue;
        const nk=ny*cols+nx,next=solid.get(nk);
        if(next&&!seen.has(nk)){seen.add(nk);queue.push(next);}
      }
    }
    if(part.length>=2)components.push(part);
  }
  return components.map((part,index)=>{
    const minX=Math.min(...part.map(c=>c.cx)),maxX=Math.max(...part.map(c=>c.cx));
    const minY=Math.min(...part.map(c=>c.cy)),maxY=Math.max(...part.map(c=>c.cy));
    const totalPoints=part.reduce((s,c)=>s+c.count,0);
    const conf=part.reduce((s,c)=>s+c.confidence,0)/Math.max(1,totalPoints);
    const x=Math.max(0,minX*cellFt-paddingFt),y=Math.max(0,minY*cellFt-paddingFt);
    const right=Math.min(siteWidthFt,(maxX+1)*cellFt+paddingFt),bottom=Math.min(siteLengthFt,(maxY+1)*cellFt+paddingFt);
    return {
      id:'scan-depth-obstacle-'+index,
      type:'obstacle',
      source:'metric-depth',
      x,y,widthFt:Math.max(.2,right-x),depthFt:Math.max(.2,bottom-y),
      heightFt:part.reduce((m,c)=>Math.max(m,c.maxHeight),0),
      rotationDeg:0,
      confidence:clamp(conf,0,1),
      cells:part.length,
      points:totalPoints
    };
  }).filter(o=>o.widthFt*o.depthFt>=3).sort((a,b)=>(b.points*b.confidence)-(a.points*a.confidence)).slice(0,28);
}
