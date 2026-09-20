// Real layout store, entry, autosave and pass UI; all API/Stripe responses isolated.
const { JSDOM } = require('jsdom'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), html = fs.readFileSync(path.join(root, 'designer/index.html'), 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
const products = [
  { id: 'fpr-pole', external_id: 'fpr:20x20-pole-tent', category: 'tent', visual_model_id: 'pole-20x20', name: '20x20 Pole Tent', price_per_day: 200 },
  { id: 'fpr-frame', external_id: 'fpr:20x20-frame-tent', category: 'tent', visual_model_id: 'frame-20x20', name: '20x20 Frame Tent', price_per_day: 275 },
  { id: 'fpr-table', category: 'table', visual_model_id: 'round-5ft', name: "5' Round Table", price_per_day: 12 },
  { id: 'fpr-chair', category: 'chair', visual_model_id: 'resin-white', name: 'White Resin Chair', price_per_day: 4 },
];
const offer = { required: true, available: true, priceCents: 999, durationDays: 30, renewalPriceCents: 499, renewalDurationDays: 30, recurring: false };
async function setup(query, options = {}) {
  const dom = new JSDOM(html, { url: 'https://rentsketch.com/designer/' + query, runScripts: 'outside-only', pretendToBeVisual: true }), w = dom.window, calls = [];
  w.AbortController = AbortController; w.ResizeObserver = class { observe() {} disconnect() {} }; w.confirm = () => { throw Error('No surprise restore dialog'); }; w.alert = () => {};
  if (options.embedded) Object.defineProperty(w, 'parent', { value: { postMessage() {} } });
  let draft, checkouts = 0;
  w.fetch = async (url, request = {}) => {
    const body = request.body && JSON.parse(request.body); calls.push({ url, body, method: request.method || 'GET' });
    let data;
    if (url.endsWith('/api/tenants/friendly')) data = { slug: 'friendly', name: 'Friendly Party Rental', showPrices: true };
    else if (url.endsWith('/products')) data = { products };
    else if (url.includes('/event-pass/offer?')) data = { ...offer, ...options.offer };
    else if (url.endsWith('/event-pass/restore')) data = options.restored;
    else if (url.endsWith('/event-pass/resume')) data = options.resumed || draft;
    else if (url.endsWith('/event-pass/checkout-session') || url.endsWith('/event-pass/renewal-checkout-session')) { checkouts++; data = { url: 'https://checkout.stripe.com/c/pay/cs_live_fixturecheckout' }; }
    else if (/\/designs(?:\/draft-owned)?$/.test(url)) { draft = { id: 'draft-owned', scene: body.scene, tenant: 'friendly', anonymousSessionId: body.anonymousSessionId, active: false }; data = { id: draft.id }; }
    else throw Error('Unexpected API request ' + url);
    return { ok: true, status: 200, json: async () => data };
  };
  const context = dom.getInternalVMContext(), cache = new Map();
  function moduleFor(file, source) {
    file = file.split('?')[0]; if (cache.has(file)) return cache.get(file);
    const m = new vm.SourceTextModule(source ?? fs.readFileSync(file, 'utf8'), { context, identifier: file, initializeImportMeta(meta) { meta.url = require('node:url').pathToFileURL(file).href; } }); cache.set(file, m); return m;
  }
  async function load(file, source) { const m = moduleFor(file, source); if (m.status === 'unlinked') await m.link((spec, ref) => moduleFor(path.resolve(path.dirname(ref.identifier), spec))); return m; }
  const evalScript = file => w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  const bootstrap = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  await (await load(path.join(root, 'designer/index.html'), bootstrap)).evaluate();
  await (await load(path.join(root, 'script.js'))).evaluate();
  evalScript('js/ui/paywall.js'); evalScript('js/ui/autosave.js');
  if (query.includes('autoplace=1')) evalScript('js/ui/tent-preview-entry.js'); else await (await load(path.join(root, 'js/ui/intake.js'))).evaluate();
  await wait(150);
  return { dom, w, calls, get draft() { return draft; }, get checkouts() { return checkouts; } };
}
(async () => {
  let t = await setup('?tenant=friendly&embed=1&focus=tent&autoplace=1&view=2d&productId=fpr-pole', { embedded: true });
  let { w } = t, d = w.document, b = w.FriendlyBridge;
  assert.equal(b.getScene().tentId, 'pole-20x20'); assert.equal(d.querySelector('.paywall-overlay'), null, 'first preview stays visible');
  assert.match(d.getElementById('designMyEvent').textContent, /\$9.99/);
  const sceneBefore = JSON.stringify(b.getScene());
  d.getElementById('designMyEvent').click(); await wait(10);
  assert.match(d.querySelector('.paywall-modal').textContent, /\$9.99/); assert.match(d.querySelector('.paywall-modal').textContent, /No subscription/);
  d.querySelector('.pass-back').click(); assert.equal(JSON.stringify(b.getScene()), sceneBefore); assert.equal(w.RENTSKETCH_TENT_PREVIEW, true);
  d.getElementById('designMyEvent').click(); await wait(10); d.querySelector('#passEmail').value = 'buyer@example.invalid';
  const form = d.querySelector('.paywall-modal form'); form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(30);
  assert.equal(t.checkouts, 1); assert.equal(t.draft.scene.tentId, 'pole-20x20'); assert.deepEqual(JSON.parse(JSON.stringify(t.draft.scene.objects)), []);
  assert.equal(d.querySelector('.pass-checkout-link').target, '_blank'); assert.equal(d.querySelector('.pass-checkout-link').hidden, false, 'hosted checkout never runs inside the iframe');
  assert.equal(t.calls.filter(c => c.method === 'POST' && c.url.endsWith('/designs')).length, 1, 'checkout reuses one autosaved draft');
  assert.equal(t.calls.find(c => c.url.endsWith('/event-pass/checkout-session')).body.priceCents, undefined);
  t.dom.window.close();
  const emptyFrame = { id: 'draft-owned', tenant: 'friendly', scene: { tentId: 'frame-20x20', objects: [], surfaceType: 'concrete', lightingId: 'lighting-none' }, anonymousSessionId: 'restored-owner', active: true, renewable: true, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() };
  t = await setup('?tenant=friendly&payment=success&checkout_session_id=cs_live_fixturecheckout', { restored: emptyFrame });
  w = t.w; d = w.document; b = w.FriendlyBridge;
  assert.equal(b.getScene().tentId, 'frame-20x20', 'paid empty frame replaces the initial pole tent'); assert.equal(b.getScene().surfaceType, 'concrete'); assert.equal(b.getScene().objects.length, 0);
  assert.equal(w.RentSketchAutosave.getDesignId(), 'draft-owned'); assert.equal(w.RentSketchAutosave.getSessionId(), 'restored-owner');
  assert.equal(t.calls.filter(c => c.method === 'POST' && c.url.endsWith('/designs')).length, 0, 'return never saves the initial blank/default scene over the paid design');
  assert.match(d.querySelector('#eventPassBar').textContent, /Event Pass active/); assert.ok(d.querySelector('.pass-access-link').value.includes('#eventPass=cs_live_fixturecheckout'));
  assert.equal(w.location.search.includes('checkout_session_id'), false, 'private credential removed from address after restore');
  d.querySelector('.pass-close').click(); d.querySelector('[data-drawer="tables"]').click(); assert.equal(d.getElementById('drawer').hidden, false);
  t.dom.window.close();
  t = await setup('?tenant=friendly&payment=cancelled#draft=fixturetoken', { restored: { ...emptyFrame, active: false, renewable: false } });
  assert.equal(t.w.FriendlyBridge.getScene().tentId, 'frame-20x20'); assert.equal(t.w.document.body.classList.contains('rs-pass-preview'), true); assert.equal(t.w.document.querySelector('.paywall-overlay'), null);
  t.dom.window.close();
  t = await setup('?tenant=friendly&payment=success&design=forged');
  assert.equal(t.w.document.body.classList.contains('rs-pass-preview'), true); assert.doesNotMatch(t.w.document.getElementById('eventPassBar').textContent, /Event Pass active/);
  t.dom.window.close();
  t = await setup('?tenant=friendly#eventPass=cs_live_fixturecheckout', { restored: { ...emptyFrame, active: false, expiresAt: new Date(Date.now() - 86400000).toISOString() } });
  t.w.document.querySelector('[data-buy-pass]').click(); await wait(10); assert.match(t.w.document.querySelector('.paywall-price').textContent, /\$4.99/);
  Object.defineProperty(t.w, 'parent', { value: { postMessage() {} } });
  t.w.document.querySelector('#passEmail').value = 'buyer@example.invalid';
  t.w.document.querySelector('.paywall-modal form').dispatchEvent(new t.w.Event('submit', { bubbles: true, cancelable: true })); await wait(30);
  assert.equal(t.calls.filter(c => c.url.endsWith('/renewal-checkout-session')).length, 1, 'expired design can renew without a forbidden save first');
  assert.equal(t.calls.filter(c => c.method === 'PATCH').length, 0);
  t.dom.window.close();
  t = await setup('?tenant=friendly', { offer: { required: false } });
  assert.equal(t.w.document.body.classList.contains('rs-pass-preview'), false); assert.equal(t.w.document.getElementById('eventPassBar').hidden, true);
  t.dom.window.close();
  console.log('PASS Event Pass UI: real entry/store/autosave, free exact preview, clear $9.99 offer, cancel preserves scene, duplicate click guard, iframe checkout link, same empty-frame return, private recovery link, forged success cannot unlock, $4.99 renewal and launch-off behavior. DOM checks only; no GPU or payment/network writes.');
})().catch(e => { console.error(e); process.exitCode = 1; });
