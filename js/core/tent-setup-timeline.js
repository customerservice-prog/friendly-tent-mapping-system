// Installation illustration. Sequence reference: The Rental Guy's 20x40 setup,
// https://www.youtube.com/watch?v=s6HhJ6egTdo (2:56–4:06).
// Product dimensions/counts still come from the selected tent, not the video.
export const POLE_SETUP_STEPS = [
  { id:'layout', seconds:5, title:'Spread the top & lay out hardware', detail:'The canopy starts on the ground, with poles and hardware arranged around it.', undo:'Fold & pack the canopy' },
  { id:'anchors', seconds:6, title:'Drive stakes & connect ratchets', detail:'Stakes go around the footprint, with two anchor directions at each corner. Straps connect before lifting.', undo:'Disconnect straps & remove stakes' },
  { id:'corners', seconds:7, title:'Raise the four corners', detail:'Corner poles lift the edges while the center of the canopy stays low.', undo:'Lower the corner poles' },
  { id:'centers', seconds:8, title:'Raise the center poles', detail:'Each center pole lifts its own section of the canopy into a peak.', undo:'Lower the center poles' },
  { id:'sides', seconds:6, title:'Set the remaining side poles', detail:'The crew works around the perimeter and brings the remaining edges up.', undo:'Lower the remaining side poles' },
  { id:'tension', seconds:5, title:'Straighten poles & tension straps', detail:'The poles are brought upright and the top is tensioned evenly around the tent.', undo:'Release the final tension' },
  { id:'walls', seconds:4, title:'Attach the selected sidewalls', detail:'Sidewalls are installed after the tent is raised and secured.', undo:'Remove the sidewalls' },
  { id:'check', seconds:3, title:'Check the finished installation', detail:'Illustrated overview. Your crew follows the manufacturer’s installation and anchoring requirements.', undo:'Clear the event area' },
];
export const clamp01 = value => Math.max(0, Math.min(1, value));
export const ease = value => { const x=clamp01(value);return x*x*(3-2*x); };
export function setupSteps(hasWalls=false){return POLE_SETUP_STEPS.filter(s=>s.id!=='walls'||hasWalls);}
export function setupDuration(steps){return steps.reduce((sum,s)=>sum+s.seconds,0);}
export function sampleSetup(seconds,steps,reverse=false){
  const duration=setupDuration(steps),elapsed=clamp01(seconds/duration)*duration;
  const buildTime=reverse?duration-elapsed:elapsed;
  const progress={};let start=0;
  for(const s of steps){progress[s.id]=clamp01((buildTime-start)/s.seconds);start+=s.seconds;}
  const ordered=reverse?[...steps].reverse():steps;
  let offset=0,index=ordered.length-1;
  for(let i=0;i<ordered.length;i++){if(elapsed<offset+ordered[i].seconds){index=i;break;}offset+=ordered[i].seconds;}
  return {progress,index,step:ordered[index],done:elapsed>=duration,duration};
}
export function stagger(progress,index,count){return ease(progress*Math.max(1,count)-index);}
