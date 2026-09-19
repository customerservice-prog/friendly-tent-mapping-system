import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitTentCamera } from '../js/ui/view3d-framing.js';

const source = readFileSync(new URL('../js/ui/tent-preview-entry.js', import.meta.url), 'utf8');
const exactTent = { id:'pole-20x20', productId:'product-20', externalId:'fpr:20x20-pole-tent', name:'20x20 Pole Tent', widthFt:20, lengthFt:20 };
function preview(query, catalog = [exactTent]) {
  class Element extends EventTarget {
    classList = {add(){}, remove(){}};
    clientWidth = 800; clientHeight = 600;
    appendChild() {} setAttribute() {} remove() { this.removed = true; }
  }
  const elements = new Map();
  const el = key => { if (!elements.has(key)) elements.set(key, new Element()); return elements.get(key); };
  const window = new EventTarget();
  window.RENTSKETCH_CATALOG_READY = true;
  window.ACTIVE_TENANT = { name:'Friendly Party Rental' };
  const messages = [], counts = {reset:0, refresh:0};
  window.FriendlyBridge = { TENTS:catalog, state:{}, customizeFromScratch(){counts.reset++;}, setViewMode(mode){this.state.viewMode=mode;}, fitTentPreview(){}, refreshAll(){counts.refresh++;} };
  const document = {body:el('body'),getElementById:el,querySelector:el,createElement:()=>new Element()};
  const context = {window, document, location:{search:query}, URLSearchParams, Event, CustomEvent, parent:{postMessage(m){messages.push(m);}}, console:{error(){}}, setTimeout(){},requestAnimationFrame(fn){fn();},Date};
  vm.runInNewContext(source, context);
  return {window, el, messages, counts};
}
test('exact product preview loads before any entry acknowledgment', () => {
  const p=preview('?embed=1&view=3d&focus=tent&autoplace=1&tenant=friendly&productId=product-20');
  assert.equal(p.window.FriendlyBridge.state.tentId,'pole-20x20');
  assert.equal(p.messages[0].renderer,'webgl');
  assert.equal(p.messages[0].productId,'product-20');
  assert.equal(p.el('designMyEvent').disabled,false);
  assert.equal(p.counts.reset,1);
});
test('wrong explicit product ID never falls back to a similarly named tent', () => {
  const p=preview('?focus=tent&autoplace=1&tenant=friendly&productId=wrong&tentSlug=20x20-pole-tent');
  assert.equal(p.counts.reset,0);
  assert.equal(p.messages[0].type,'rentsketch.error');
});
test('Friendly slug-only link resolves exact pole tent, not same-size frame', () => {
  const p=preview('?focus=tent&autoplace=1&view=3d&tenant=friendly&tentSlug=20x20-pole-tent',[{...exactTent,id:'frame-20x20',externalId:'fpr:20x20-frame-tent',name:'20x20 Frame Tent'},exactTent]);
  assert.equal(p.window.FriendlyBridge.state.tentId,'pole-20x20');
});
test('Design My Event continues the same scene and camera without resetting', () => {
  const p=preview('?focus=tent&autoplace=1&view=3d&tenant=friendly&tentSlug=20x20-pole-tent');
  const state=p.window.FriendlyBridge.state;
  p.el('designMyEvent').dispatchEvent(new Event('click'));
  assert.equal(p.window.FriendlyBridge.state,state);
  assert.equal(state.viewMode,'3d');
  assert.equal(state.tentId,'pole-20x20');
  assert.equal(p.counts.reset,1);
  assert.equal(p.counts.refresh,1);
  assert.equal(p.window.RENTSKETCH_TENT_PREVIEW,false);
});
test('embedded continuation waits for the existing acknowledgment callback', () => {
  const p=preview('?embed=1&focus=tent&autoplace=1&view=3d&tenant=friendly&tentSlug=20x20-pole-tent');
  let accept;
  p.window.RentSketchCustomerEntry={startDesigning(fn){accept=fn;}};
  p.el('designMyEvent').dispatchEvent(new Event('click'));
  assert.equal(p.window.RENTSKETCH_TENT_PREVIEW,true);
  accept();
  assert.equal(p.window.RENTSKETCH_TENT_PREVIEW,false);
  assert.equal(p.counts.reset,1);
});
test('2D entry still loads the exact requested tent', () => {
  const p=preview('?focus=tent&autoplace=1&view=2d&tenant=friendly&tentSlug=20x20-pole-tent');
  assert.equal(p.messages[0].renderer,'2d');
  assert.equal(p.messages[0].tentId,'pole-20x20');
});
test('camera keeps all eight tent corners inside landscape and portrait viewports', () => {
  for (const aspect of [390/650, 1366/700, 844/300]) {
    const f=fitTentCamera(exactTent,14.5,aspect,36,5);
    const dir=f.position.map((v,i)=>v-f.target[i]),distance=Math.hypot(...dir),forward=dir.map(v=>v/distance);
    const rlen=Math.hypot(forward[0],forward[2]),right=[forward[2]/rlen,0,-forward[0]/rlen];
    const up=[forward[1]*right[2],forward[2]*right[0]-forward[0]*right[2],-forward[1]*right[0]];
    const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),tan=Math.tan(Math.PI/10);
    for(const x of [-15,15])for(const y of [-7.25,7.25])for(const z of [-15,15]){
      const corner=[x,y,z],depth=distance-dot(corner,forward);
      assert.ok(Math.abs(dot(corner,right))/(depth*tan*aspect)<.87);
      assert.ok(Math.abs(dot(corner,up))/(depth*tan)<.87);
    }
  }
});
