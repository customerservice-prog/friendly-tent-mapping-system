// Installation illustration. Sequence reference: The Rental Guy's 20x40 setup,
// https://www.youtube.com/watch?v=s6HhJ6egTdo (2:56–4:06).
// The animation preserves that video's corner-first / center-pole / side-pole lift
// order while adding slower explanatory phases around layout, ratchets, pole
// staging and final checks. Product dimensions/counts still come from the
// selected RentSketch tent, not the reference video.
export const POLE_SETUP_STEPS = [
  {
    id:'measure',seconds:4,phase:'Layout',
    title:'Measure & square the tent footprint',
    detail:'The crew lays out the exact tent rectangle and checks the diagonals so the four corners start square.',
    why:'A square footprint keeps the top from twisting and makes the pole and anchor lines match.',
    undo:'Clear the final layout marks'
  },
  {
    id:'anchors',seconds:6,phase:'Anchoring',
    title:'Drive the perimeter stakes',
    detail:'Stakes are driven outside the footprint at the side-pole stations, with two anchor directions at the corners.',
    why:'The anchors are in place before lifting so the canopy can stay controlled as the poles go up.',
    undo:'Pull the perimeter stakes'
  },
  {
    id:'layout',seconds:5,phase:'Tent top',
    title:'Spread and orient the tent top',
    detail:'The canopy is opened flat on the protected ground area and aligned to the four corners before anything is raised.',
    why:'Correct orientation now prevents the crew from rotating or dragging the top once hardware is connected.',
    undo:'Fold and roll the tent top'
  },
  {
    id:'ratchets',seconds:4,phase:'Loose anchoring',
    title:'Connect the ratchets with working slack',
    detail:'Ratchet straps are connected between the tent edge and the pre-driven stakes, but they stay loose enough for the top to lift.',
    why:'Loose straps control the canopy without fighting the crew while poles are being installed.',
    undo:'Disconnect the loose ratchets'
  },
  {
    id:'poles',seconds:4,phase:'Pole staging',
    title:'Stage a pole at every lifting position',
    detail:'Corner, center and remaining side poles are laid beside the places where the crew will raise them.',
    why:'Staging keeps the crew from carrying long poles through a partially raised tent.',
    undo:'Stack and remove the staged poles'
  },
  {
    id:'corners',seconds:7,phase:'Corner lift',
    title:'Raise the four corner poles',
    detail:'The corners come up first in the reference setup, lifting the perimeter while the middle of the canopy remains low.',
    why:'The corner poles establish the outside shape and keep the top controlled before the peaks are raised.',
    undo:'Lower the four corner poles'
  },
  {
    id:'centerPrep',seconds:4,phase:'Center poles',
    title:'Position the center poles under their peaks',
    detail:'The crew moves each center pole into its lifting position and seats the top connection before walking the pole upward.',
    why:'The pole has to be centered under the peak before the canopy is lifted to full height.',
    undo:'Move the center poles clear'
  },
  {
    id:'centers',seconds:8,phase:'Center lift',
    title:'Raise the center poles into the peaks',
    detail:'Each center pole lifts its section of the canopy until the roof develops its full peak height.',
    why:'The center poles create the roof pitch that sheds water and gives the pole tent its finished shape.',
    undo:'Lower the center poles'
  },
  {
    id:'sides',seconds:6,phase:'Perimeter poles',
    title:'Set the remaining side poles',
    detail:'The crew works around the perimeter installing the remaining side poles and bringing every bay to the same eave height.',
    why:'Even side-pole spacing spreads load around the tent and keeps the valance line consistent.',
    undo:'Lower the remaining side poles'
  },
  {
    id:'tension',seconds:6,phase:'Final tension',
    title:'Plumb the poles & tension every ratchet',
    detail:'Workers straighten the poles and make a full perimeter pass, tightening opposite points progressively instead of pulling one side all at once.',
    why:'Balanced tension keeps the tent square and the poles vertical instead of dragging the canopy toward one corner.',
    undo:'Release the final perimeter tension'
  },
  {
    id:'walls',seconds:4,phase:'Sidewalls',
    title:'Attach the selected sidewalls',
    detail:'Selected sidewalls go on only after the tent is fully raised, anchored and tensioned.',
    why:'Installing walls last keeps the structure visible for inspection and avoids adding wind load during the lift.',
    undo:'Remove and fold the sidewalls'
  },
  {
    id:'check',seconds:4,phase:'Crew check',
    title:'Inspect the finished installation',
    detail:'The crew checks the poles, stakes, ratchets, top tension, wall attachment and clearances before releasing the tent for use.',
    why:'The final inspection verifies the completed installation, not just that the tent is standing.',
    undo:'Finish clearing the event area'
  },
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
