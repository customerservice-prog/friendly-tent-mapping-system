// Lightweight multi-frame camera-path estimation for Space Scan.
// Tracks stable image features between neighboring frames and estimates the
// relative sideways travel from observed parallax instead of assuming the user
// walked at a perfectly constant speed between video timestamps.
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function median(values){if(!values.length)return 0;const a=values.slice().sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function percentile(values,p){if(!values.length)return 0;const a=values.slice().sort((x,y)=>x-y);return a[Math.max(0,Math.min(a.length-1,Math.round((a.length-1)*p)))];}
function gray(image){
  const {data,width,height}=image||{};if(!data||!width||!height)return null;
  const out=new Float32Array(width*height);
  for(let i=0,j=0;i<data.length;i+=4,j++)out[j]=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
  return {data:out,width,height};
}
function cornerScore(g,w,h,x,y){
  const gx=g[y*w+x+1]-g[y*w+x-1],gy=g[(y+1)*w+x]-g[(y-1)*w+x];
  const g45=g[(y+1)*w+x+1]-g[(y-1)*w+x-1],gm45=g[(y+1)*w+x-1]-g[(y-1)*w+x+1];
  return Math.abs(gx*gy)+.35*(Math.abs(g45)+Math.abs(gm45))+.15*(gx*gx+gy*gy);
}
function patchError(a,b,w,h,ax,ay,bx,by,r=2){
  let ma=0,mb=0,n=0;
  for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++){
    const x1=ax+xx,y1=ay+yy,x2=bx+xx,y2=by+yy;
    if(x1<0||y1<0||x1>=w||y1>=h||x2<0||y2<0||x2>=w||y2>=h)continue;
    ma+=a[y1*w+x1];mb+=b[y2*w+x2];n++;
  }
  if(n<15)return Infinity;ma/=n;mb/=n;
  let err=0,energy=0;
  for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++){
    const x1=ax+xx,y1=ay+yy,x2=bx+xx,y2=by+yy;
    if(x1<0||y1<0||x1>=w||y1>=h||x2<0||y2<0||x2>=w||y2>=h)continue;
    const da=a[y1*w+x1]-ma,db=b[y2*w+x2]-mb,d=da-db;err+=d*d;energy+=da*da+db*db;
  }
  return err/Math.max(1,energy);
}
function features(frame,maxFeatures=90){
  const g=gray(frame);if(!g)return [];const {data,width:w,height:h}=g,margin=9,candidates=[];
  const stride=Math.max(3,Math.round(Math.min(w,h)/28));
  for(let y=margin;y<h-margin;y+=stride)for(let x=margin;x<w-margin;x+=stride){
    const score=cornerScore(data,w,h,x,y);if(score>180)candidates.push({x,y,score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const selected=[];
  for(const c of candidates){
    if(selected.some(p=>(p.x-c.x)**2+(p.y-c.y)**2<36))continue;
    selected.push(c);if(selected.length>=maxFeatures)break;
  }
  return selected;
}
function similarityPose(tracks,w,h){
  if(!tracks?.length)return {rollDeg:0,scale:1,txPx:0,tyPx:0,fitError:Infinity};
  let sx=0,sy=0,dx=0,dy=0;
  for(const t of tracks){sx+=t.x;sy+=t.y;dx+=t.x+t.dx;dy+=t.y+t.dy;}
  const n=tracks.length,cx=sx/n,cy=sy/n,ux=dx/n,uy=dy/n;
  let dot=0,cross=0,den=0;
  for(const t of tracks){
    const ax=t.x-cx,ay=t.y-cy,bx=t.x+t.dx-ux,by=t.y+t.dy-uy;
    dot+=ax*bx+ay*by;cross+=ax*by-ay*bx;den+=ax*ax+ay*ay;
  }
  if(den<1)return {rollDeg:0,scale:1,txPx:ux-cx,tyPx:uy-cy,fitError:Infinity};
  const a=dot/den,b=cross/den,scale=Math.sqrt(a*a+b*b),angle=Math.atan2(b,a);
  const cos=Math.cos(angle)*scale,sin=Math.sin(angle)*scale;
  const tx=ux-(cos*cx-sin*cy),ty=uy-(sin*cx+cos*cy);
  let err=0;
  for(const t of tracks){
    const px=cos*t.x-sin*t.y+tx,py=sin*t.x+cos*t.y+ty;
    err+=Math.hypot(px-(t.x+t.dx),py-(t.y+t.dy));
  }
  return {rollDeg:angle*180/Math.PI,scale,txPx:tx,tyPx:ty,fitError:err/n};
}
function trackPair(aFrame,bFrame,{maxDx=28,maxDy=7,patchRadius=2}={}){
  const a=gray(aFrame),b=gray(bFrame);if(!a||!b||a.width!==b.width||a.height!==b.height)return {tracks:[],motion:null};
  const w=a.width,h=a.height,pts=features(aFrame),tracks=[];
  for(const p of pts){
    let best={error:Infinity,dx:0,dy:0},second=Infinity;
    for(let dy=-maxDy;dy<=maxDy;dy++)for(let dx=-maxDx;dx<=maxDx;dx++){
      if(Math.abs(dx)<1&&Math.abs(dy)<1)continue;
      const bx=p.x+dx,by=p.y+dy;if(bx<patchRadius||by<patchRadius||bx>=w-patchRadius||by>=h-patchRadius)continue;
      const error=patchError(a.data,b.data,w,h,p.x,p.y,bx,by,patchRadius);
      if(error<best.error){second=best.error;best={error,dx,dy};}
      else if(error<second)second=error;
    }
    const separation=Number.isFinite(second)?(second-best.error)/Math.max(.0001,second):0;
    if(best.error<.58&&separation>.035)tracks.push({...p,...best,separation});
  }
  if(tracks.length<7)return {tracks,motion:null};
  const dys=tracks.map(t=>t.dy),medianDy=median(dys);
  const verticalFiltered=tracks.filter(t=>Math.abs(t.dy-medianDy)<=2);
  if(verticalFiltered.length<6)return {tracks,motion:null};
  const dxs=verticalFiltered.map(t=>t.dx),medianDx=median(dxs);
  const deviations=dxs.map(v=>Math.abs(v-medianDx)),mad=median(deviations)||1;
  const inliers=verticalFiltered.filter(t=>Math.abs(t.dx-medianDx)<=Math.max(2,2.8*mad));
  if(inliers.length<6)return {tracks,motion:null};
  const signedDx=median(inliers.map(t=>t.dx)),absDx=Math.abs(signedDx);
  const spread=Math.max(0,percentile(inliers.map(t=>Math.abs(t.dx)),.80)-percentile(inliers.map(t=>Math.abs(t.dx)),.20));
  const similarity=similarityPose(inliers,w,h);
  const rollReliable=inliers.length>=8&&similarity.fitError<2.4&&Math.abs(similarity.rollDeg)<=8;
  const quality=clamp((inliers.length/Math.max(1,pts.length))*.55+clamp(absDx/5,0,1)*.22+clamp(spread/4,0,1)*.13+(rollReliable?.10:0),0,1);
  return {tracks,motion:{dx:signedDx,dy:median(inliers.map(t=>t.dy)),magnitudePx:Math.max(.25,percentile(inliers.map(t=>Math.abs(t.dx)),.5)),trackCount:inliers.length,totalFeatures:pts.length,quality,spreadPx:spread,rollDeg:rollReliable?similarity.rollDeg:0,rollReliable,similarityScale:similarity.scale,poseFitError:similarity.fitError}};
}
export function estimateTrackedCameraPath(frames,{centerIndex}={}){
  if(!Array.isArray(frames)||frames.length<3)return {usable:false,reason:'not-enough-frames',offsetFactors:[],pairs:[]};
  centerIndex=Number.isFinite(Number(centerIndex))?Math.max(0,Math.min(frames.length-1,Math.round(Number(centerIndex)))):Math.floor(frames.length/2);
  const pairs=[];
  for(let i=1;i<frames.length;i++)pairs.push(trackPair(frames[i-1],frames[i]));
  if(pairs.some(p=>!p.motion))return {usable:false,reason:'weak-feature-tracking',offsetFactors:[],pairs};
  const directions=pairs.map(p=>Math.sign(p.motion.dx)).filter(Boolean),positive=directions.filter(v=>v>0).length,negative=directions.filter(v=>v<0).length;
  const dominant=positive>=negative?1:-1,consistent=directions.filter(v=>v===dominant).length/Math.max(1,directions.length);
  if(consistent<.72)return {usable:false,reason:'camera-path-not-monotonic',offsetFactors:[],pairs,consistency:consistent};
  const steps=pairs.map(p=>Math.max(.25,p.motion.magnitudePx));
  const leftTotal=steps.slice(0,centerIndex).reduce((a,b)=>a+b,0),rightTotal=steps.slice(centerIndex).reduce((a,b)=>a+b,0);
  if(leftTotal<=0||rightTotal<=0)return {usable:false,reason:'insufficient-bilateral-motion',offsetFactors:[],pairs};
  const offsets=new Array(frames.length).fill(0);
  // A video's temporal midpoint need not be halfway along the physical path.
  // Preserve the independently entered TOTAL baseline while allowing asymmetric
  // travel on either side. Normalizing each half to .5 distorted variable-speed scans.
  const totalMotion=leftTotal+rightTotal;
  let run=0;for(let i=centerIndex-1;i>=0;i--){run+=steps[i];offsets[i]=-run/totalMotion;}
  run=0;for(let i=centerIndex+1;i<frames.length;i++){run+=steps[i-1];offsets[i]=run/totalMotion;}
  const meanQuality=pairs.reduce((s,p)=>s+p.motion.quality,0)/pairs.length;
  const rolls=new Array(frames.length).fill(0);
  let roll=0;for(let i=centerIndex-1;i>=0;i--){roll-=pairs[i].motion.rollReliable?pairs[i].motion.rollDeg:0;roll=clamp(roll,-10,10);rolls[i]=roll;}
  roll=0;for(let i=centerIndex+1;i<frames.length;i++){roll+=pairs[i-1].motion.rollReliable?pairs[i-1].motion.rollDeg:0;roll=clamp(roll,-10,10);rolls[i]=roll;}
  const framePoses=offsets.map((xFactor,i)=>({frameIndex:i,xFactor:Number(xFactor.toFixed(4)),rollDeg:Number(rolls[i].toFixed(3)),rollReliable:i===centerIndex||pairs[Math.max(0,i-1)]?.motion?.rollReliable===true}));
  return {
    usable:meanQuality>=.22,
    reason:meanQuality>=.22?null:'weak-motion-confidence',
    offsetFactors:offsets.map(v=>Number(v.toFixed(4))),
    framePoses,
    centerIndex,
    pairs:pairs.map((p,i)=>({from:i,to:i+1,...p.motion})),
    meanQuality:Number(meanQuality.toFixed(3)),
    consistency:Number(consistent.toFixed(3)),
    totalTracks:pairs.reduce((s,p)=>s+(p.motion?.trackCount||0),0),
    centerBaselineFraction:leftTotal/totalMotion,
    poseAxes:{translationX:'tracked-relative',roll:'tracked-similarity',translationY:'unresolved',translationZ:'unresolved',yaw:'unresolved',pitch:'unresolved'},
    method:'multi-frame-feature-tracking'
  };
}
