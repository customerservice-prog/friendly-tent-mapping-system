// A deterministic, seekable customer preview. Durations are film pacing, not
// installation estimates. Sequence references are recorded in docs/tent-setup.md.
export const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
export const smooth = value => { const t=clamp01(value); return t*t*(3-2*t); };
const purpose={
  layout:'Checking the diagonals helps prevent a twisted footprint.',anchors:'Anchors hold the tent against uplift and sideways movement.',cloth:'The cloth protects the coated fabric from dirt and abrasion.',top:'Centering and joining the top now avoids dragging it after lifting.',straps:'Working slack lets the top rise while the anchors keep it controlled.',corners:'The corner supports establish the perimeter before the center peaks rise.',
  'center-angle':'The initial angled position lifts the fabric clear while leaving room for the remaining work.',
  'cloth-away':'The protective cloth can be withdrawn once the vinyl is clear of the ground.',
  'center-up':'Bringing each base under its peak creates the finished roof height.',sides:'The remaining poles support the perimeter between the corners.',tension:'Balanced tension keeps the roof square and the poles aligned.',walls:'Walls are attached after the structure and restraints are complete.',check:'The last circuit checks the whole installation, including its connections and clearances.',
  'frame-parts':'Laying out the members makes their connection positions clear.',
  'frame-connect':'The roof frame can be connected while the fittings are accessible.',
  'frame-first':'Raising the whole side keeps the connected frame moving together.',
  'frame-second':'The opposite lift brings the roof level at its finished height.',expand:'The linked scissor frame opens before the legs reach full height.',
  'frame-raise':'Matching leg heights keep the folding frame level.'
};
const step=(id,title,detail,seconds,camera='overview')=>({id,title,detail,seconds,camera,why:purpose[id]||''});
export function tentSetupSteps(tent,{sidewalls=false,anchor='stake'}={}) {
  const pole=tent.type==='pole',popup=tent.type==='canopy';
  const anchorStep=step('anchors',anchor==='ballast'?'Position the ballast':'Drive the perimeter stakes',anchor==='ballast'?'The crew positions the specified ballast at the frame’s anchor points and connects the restraint straps.':'Crew members work around the footprint, driving anchors at the marked positions. Anchor requirements depend on the tent and site.',7,'anchor');
  let steps;
  if(pole) steps=[
    step('layout','Measure & square the footprint','The crew checks the diagonals and marks the tent corners, pole positions and working area.',5),
    anchorStep,
    step('cloth','Unroll the protective drop cloth','The ground cloth opens first to keep the white vinyl off the grass and away from abrasion.',5),
    step('top','Unfold & join the tent top','The crew unfolds the top across the cloth, aligns the sections and joins any lace lines before lifting.',7,'fabric'),
    step('straps','Lay out poles & connect loose straps','Side poles are staged beside the perimeter. Loosely connected straps allow the fabric to rise.',6,'anchor'),
    step('corners','Raise the four corner poles','Corner poles rotate upright one at a time while the corner straps support the edges of the top.',9,'lift'),
    step('center-angle','Lift with the center poles','Working together beneath the supported top, the crew raises each full-length center pole into its initial angled position.',10,'lift'),
    step('cloth-away','Pull the drop cloth clear','With the vinyl lifted clear of the ground, the crew withdraws and rolls the protective cloth.',5,'fabric'),
    step('center-up','Bring the center poles upright','The pole bases move inward under their peaks. The same poles rotate upright without changing length.',7,'lift'),
    step('sides','Raise the remaining side poles','The crew works around the perimeter, seating each pole and bringing the edge up to its finished height.',10,'lift'),
    step('tension','Tension the ratchets evenly','Workers tighten the straps in stages, check the pole alignment and gather the loose ends as the fabric becomes taut.',8,'anchor'),
  ];
  else if(popup) steps=[
    step('layout','Mark the canopy position','The crew checks the footprint and leaves room around the legs and anchors.',5),
    step('expand','Open the folding frame','Workers pull opposite sides apart as the linked scissor frame expands.',8,'lift'),
    step('top','Position & secure the canopy top','The fabric opens over the low frame and the corners are secured.',7,'fabric'),
    step('frame-raise','Raise the telescoping legs','The crew lifts the canopy evenly and locks the leg extensions at matching heights.',9,'lift'),
    anchorStep,
    step('tension','Check the frame locks & restraints','The crew checks all leg locks, top attachments and anchors before finishing.',7,'anchor'),
  ];
  else steps=[
    step('layout','Measure & square the footprint','The crew marks the corners and lays out enough working room to assemble the roof at ground level.',5),
    step('frame-parts','Lay out tubing & fittings','Rafters, eave members and fittings are staged in their assembly positions.',5,'fabric'),
    step('frame-connect','Assemble the roof frame','The crew connects the roof members and fittings in sequence while the frame is still low.',9,'fabric'),
    step('cloth','Protect the vinyl with a drop cloth','The protective cloth is laid beside the low frame before the top is unrolled.',5,'fabric'),
    step('top','Pull the top over the low frame','Workers guide the fabric across the frame, then center the top and attach the perimeter straps.',9,'fabric'),
    step('frame-first','Lift the first side together','The first side rises as a unit. Crew members install its legs while the opposite side remains low.',10,'lift'),
    step('frame-second','Lift the opposite side together','The other side rises, its legs are installed and the frame settles level on all feet.',10,'lift'),
    anchorStep,
    step('tension','Square the frame & tension the top','Workers check the fittings and tighten the straps around the frame until the fabric sits evenly.',8,'anchor'),
  ];
  if(sidewalls) steps.push(step('walls','Hang the selected sidewalls','Only the sidewall panels in your layout are unrolled and clipped along the finished tent perimeter.',7,'lift'));
  steps.push(step('check','Final walk-around','The crew checks the finished structure, connections, anchors and clearances before the event layout returns.',6));
  let start=0;return steps.map(s=>{const result={...s,start,end:start+s.seconds};start=result.end;return result;});
}
export function setupFrame(steps,elapsed){
  const duration=steps.at(-1)?.end||0,time=Math.max(0,Math.min(duration,Number(elapsed)||0));
  const index=Math.max(0,steps.findIndex(s=>time<s.end));
  const step=time>=duration?steps.at(-1):steps[index];
  return {step,index:time>=duration?steps.length-1:index,time,duration,progress:duration?time/duration:1,local:step?clamp01((time-step.start)/step.seconds):1,done:time>=duration};
}
export function phaseProgress(steps,id,time){const s=steps.find(s=>s.id===id);return s?clamp01((time-s.start)/s.seconds):0;}
export function stagger(progress,index,count,overlap=.2){return smooth((progress*(count*(1-overlap)+overlap)-index*(1-overlap)));}

export const ease=smooth;

// Compatibility exports for the established pole renderer.
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
