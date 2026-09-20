// A read-only product demonstration. Uses the actual designer renderer and
// models; it never reads customer storage, starts a preview, saves, or quotes.
const studio = document.querySelector('[data-tour]');
if (studio) {
  const target = studio.querySelector('.tour-3d');
  const status = studio.querySelector('.tour-status');
  const note = studio.querySelector('.tour-note');
  const image = studio.querySelector('.plan-img');
  const actions = studio.querySelector('.tour-actions');
  const buttons = [...studio.querySelectorAll('[data-view]')];
  let view, loading, selected = '2d', night = false;
  const tables = [];
  for (const x of [10, 30]) for (const y of [8, 22, 38, 52]) {
    tables.push({id:'sample-table-'+x+'-'+y,kind:'table',tableId:'round-5ft',shape:'round',widthFt:5,depthFt:5,x:x-2.5,y:y-2.5,rotationDeg:0,seatCount:8,chairId:'resin-white',linenId:'linen-round-120',linenColor:'White'});
  }
  const dance = [];
  for (let x=14;x<26;x+=3) for (let y=24;y<36;y+=3) dance.push({id:'sample-floor-'+x+'-'+y,kind:'dance',widthFt:3,depthFt:3,x,y});
  const scene = {tent:{id:'pole-40x60',type:'pole',widthFt:40,lengthFt:60,installationClearanceFt:5,centerPoles:[{x:20,y:20},{x:20,y:40}]},surfaceType:'grass',anchoringMethod:'stake',objects:[...tables,...dance],lightingId:'lighting-bistro'};
  function say(text) { status.textContent = text; status.hidden = !text; }
  function show() {
    target.classList.toggle('active', selected === '3d');
    image.style.visibility = selected === '3d' && view ? 'hidden' : 'visible';
    actions.hidden = selected !== '3d' || !view;
    note.textContent = selected === '3d' && view ? 'Drag to explore · scroll or pinch to zoom' : 'Example layout · switch views to explore';
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === selected)));
    if (view && selected === '3d') view.fitCamera();
  }
  async function load() {
    say('Loading the 3D example…');
    try {
      const module = await import('/js/ui/view3d.js');
      view = module.init(target);
      view.rebuild(scene);
      view.setScene({motion:false,guests:false,styling:true,night:false});
      say(''); show();
    } catch (_) {
      view?.destroy(); view = null; selected = '2d';
      say('3D could not load in this browser. You can still explore the 2D example.'); show();
    } finally { loading = null; buttons.forEach(button => {button.disabled=false;}); }
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    selected = button.dataset.view; show();
    if (selected === '3d' && !view && !loading) { button.disabled=true; loading=load(); }
  }));
  studio.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => {
    studio.querySelectorAll('[data-camera]').forEach(other => other.setAttribute('aria-pressed',String(other===button)));
    if (button.dataset.camera === 'inside') view?.inside(); else view?.fitCamera();
  }));
  studio.querySelector('[data-night]').addEventListener('click', event => {
    night = !night; event.currentTarget.setAttribute('aria-pressed',String(night)); view?.night(night);
  });
  window.addEventListener('pagehide',()=>view?.destroy(),{once:true});
}
