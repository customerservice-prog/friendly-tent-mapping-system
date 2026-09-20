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
  w.localStorage.setItem('rentsketch-anon-session', 'existing-browser-owner');
  if (options.previewDeadline) w.localStorage.setItem('rentsketch-preview-deadline:v1', String(options.previewDeadline));
  if (options.saved) w.localStorage.setItem('rentsketch-autosave:friendly', JSON.stringify(options.saved));
  let draft, checkouts = 0;
  w.fetch = async (url, request = {}) => {
    const body = request.body && JSON.parse(request.body); calls.push({ url, body, method: request.method || 'GET' });
    let data;
    if (url.endsWith('/api/tenants/friendly')) data = { slug: 'friendly', name: 'Friendly Party Rental', showPrices: true };
    else if (url.endsWith('/products')) data = { products };
    else if (url.includes('/event-pass/offer?')) data = { ...offer, ...options.offer };
    else if (url.endsWith('/event-pass/preview')) { if(options.failPreview)throw Error('Preview service unavailable');data={limited:true,remainingSeconds:options.previewSeconds ?? 300}; }
    else if (url.endsWith('/designs/recovery-link')) data = { ok: true };
    else if (url.endsWith('/event-pass/restore')) data = options.restored;
    else if (url.endsWith('/event-pass/resume')) { if (options.failResume) throw Error('Connection unavailable'); data = options.resumed || draft; }
    else if (url.includes('/review-pricing')) data = { available: true, zip: new URL(url).searchParams.get('zip'), deliveryFee: new URL(url).searchParams.has('zip') ? 49.99 : null, taxRate: 8, taxDelivery: true };
    else if (url.endsWith('/quote-requests')) data = { id: 'isolated-quote', notificationSent: true };
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
  await (await load(path.join(root, 'js/ui/booking-handoff.js'))).evaluate();
  evalScript('js/ui/preview-limit.js'); evalScript('js/ui/paywall.js'); evalScript('js/ui/autosave.js');
  if (query.includes('autoplace=1')) evalScript('js/ui/tent-preview-entry.js'); else await (await load(path.join(root, 'js/ui/intake.js'))).evaluate();
  await wait(150); evalScript('js/ui/customer-entry.js'); evalScript('js/ui/review-actions.js');
  return { dom, w, calls, get draft() { return draft; }, get checkouts() { return checkouts; } };
}
(async () => {
  let t = await setup('?tenant=friendly&embed=1&focus=tent&autoplace=1&view=2d&productId=fpr-pole', { embedded: true });
  let { w } = t, d = w.document, b = w.FriendlyBridge;
  assert.equal(b.getScene().tentId, 'pole-20x20'); assert.equal(d.querySelector('.paywall-overlay'), null, 'first preview stays visible');
  assert.match(d.getElementById('designMyEvent').textContent, /\$9.99/);
  const sceneBefore = JSON.stringify(b.getScene());
  b.buildPartyScene(); await wait(10); assert.equal(b.getScene().objects.length, 0, 'direct party builder cannot bypass free preview'); d.querySelector('.pass-close').click();
  assert.equal(b.loadScene({tentId:'pole-20x20',objects:[{id:'t',kind:'table',tableId:'round-5ft'}]}),false,'unpaid import cannot bypass access');
  d.querySelector('.pass-recover').click(); d.querySelector('#recoverEmail').value='paid@example.invalid'; d.querySelector('.paywall-modal form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})); await wait(20); assert.equal(t.calls.filter(c=>c.url.endsWith('/designs/recovery-link')).length,1); assert.match(d.querySelector('.paywall-error').textContent,/If a saved event matches/); d.querySelector('.pass-close').click();
  d.getElementById('designMyEvent').click(); await wait(10);
  assert.match(d.querySelector('.paywall-modal').textContent, /\$9.99/); assert.match(d.querySelector('.paywall-modal').textContent, /No subscription/); assert.match(d.querySelector('.paywall-modal').textContent, /30 days/);
  d.querySelector('[data-terms]').click();assert.match(d.querySelector('.rs-modal').textContent,/Event Pass/);assert.doesNotMatch(d.querySelector('.rs-modal').textContent,/Early Access/);d.querySelector('.rs-modal [data-close]').click();assert.equal(d.querySelector('.rs-entry'),null);assert.equal(d.querySelector('.rs-beta'),null);
  d.querySelector('.pass-back:not([data-recover])').click(); assert.equal(JSON.stringify(b.getScene()), sceneBefore); assert.equal(w.RENTSKETCH_TENT_PREVIEW, true);
  d.getElementById('designMyEvent').click(); await wait(10); d.querySelector('#passEmail').value = 'buyer@example.invalid';
  const form = d.querySelector('.paywall-modal form'); form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(30);
  assert.equal(t.checkouts, 1); assert.equal(t.draft.scene.tentId, 'pole-20x20'); assert.deepEqual(JSON.parse(JSON.stringify(t.draft.scene.objects)), []);
  assert.equal(d.querySelector('.pass-checkout-link').target, '_blank'); assert.equal(d.querySelector('.pass-checkout-link').hidden, false, 'hosted checkout never runs inside the iframe');
  assert.equal(t.calls.filter(c => c.method === 'POST' && c.url.endsWith('/designs')).length, 1, 'checkout reuses one autosaved draft');
  assert.equal(t.calls.find(c => c.url.endsWith('/event-pass/checkout-session')).body.priceCents, undefined);
  t.dom.window.close();
  const emptyFrame = { id: 'draft-owned', tenant: 'friendly', scene: { tentId: 'frame-20x20', objects: [], surfaceType: 'concrete', lightingId: 'lighting-none', customer: { name: '', email: '', date: '' } }, anonymousSessionId: 'restored-owner', active: true, renewable: true, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), customerEmail: 'paid@example.invalid', accessUrl: 'https://rentsketch.com/designer/?tenant=friendly#recoveryToken=fixture.private.token', emailDelivery: 'sent' };
  t = await setup('?tenant=friendly&payment=success&checkout_session_id=cs_live_fixturecheckout', { restored: emptyFrame });
  w = t.w; d = w.document; b = w.FriendlyBridge;
  assert.equal(b.getScene().tentId, 'frame-20x20', 'paid empty frame replaces the initial pole tent'); assert.equal(b.getScene().surfaceType, 'concrete'); assert.equal(b.getScene().objects.length, 0);
  assert.equal(w.RentSketchAutosave.getDesignId(), 'draft-owned'); assert.equal(w.RentSketchAutosave.getSessionId(), 'restored-owner');
  assert.equal(w.localStorage.getItem('rentsketch-anon-session'), 'existing-browser-owner', 'recovering one paid event does not change ownership of other drafts');
  assert.equal(JSON.parse(w.localStorage.getItem('rentsketch-autosave:friendly')).anonymousSessionId, 'restored-owner');
  assert.equal(t.calls.filter(c => c.method === 'POST' && c.url.endsWith('/designs')).length, 0, 'return never saves the initial blank/default scene over the paid design');
  assert.match(d.querySelector('#eventPassBar').textContent, /Event Pass active/); assert.ok(d.querySelector('.pass-access-link').value.includes('#recoveryToken=fixture.private.token')); assert.match(d.querySelector('[data-email-status]').textContent, /sent to paid@example.invalid/);
  assert.equal(w.location.search.includes('checkout_session_id'), false, 'private credential removed from address after restore');
  assert.equal(d.getElementById('customerEmail').value, 'paid@example.invalid', 'checkout email fills an empty saved contact email');
  d.querySelector('.pass-close').click(); d.querySelector('[data-drawer="tables"]').click(); assert.equal(d.getElementById('drawer').hidden, false);
  // Save real edits, then reopen the server snapshot on a separate device.
  b.loadScene({ ...b.getScene(), surfaceType: 'grass', objects: [{ id: 'dining', kind: 'table', tableId: 'round-5ft', shape: 'round', widthFt: 5, depthFt: 5, x: 2, y: 2, seatCount: 8, chairId: 'resin-white', linenId: null }] });
  for (const [id, value] of [['customerName', 'Sam Event'], ['customerEmail', 'organizer@example.invalid'], ['customerDate', '2027-06-01']]) {
    d.getElementById(id).value = value; d.getElementById(id).dispatchEvent(new w.Event('input', { bubbles: true }));
  }
  d.getElementById('view3dDayNight').click();
  d.getElementById('sceneRain').checked = true; d.getElementById('sceneRain').dispatchEvent(new w.Event('change', { bubbles: true }));
  d.getElementById('sceneMotion').checked = false; d.getElementById('sceneMotion').dispatchEvent(new w.Event('change', { bubbles: true }));
  d.getElementById('btnToReview').click(); await wait(10);
  d.querySelector('[name="deliveryZip"]').value = '13090'; d.querySelector('[name="deliveryZip"]').dispatchEvent(new w.Event('input', { bubbles: true }));
  await w.RentSketchAutosave.flush();
  const savedScene = JSON.parse(JSON.stringify(t.calls.filter(c => c.method === 'PATCH').at(-1).body.scene));
  assert.deepEqual(savedScene.customer, { name: 'Sam Event', email: 'organizer@example.invalid', date: '2027-06-01' });
  assert.equal(savedScene.deliveryZip, '13090'); assert.equal(savedScene.sceneOptions.night, true); assert.equal(savedScene.sceneOptions.weather, 'rain'); assert.equal(savedScene.sceneOptions.motion, false);
  assert.equal(t.checkouts, 0, 'paid editing does not start another checkout');
  t.dom.window.close();
  const savedEvent = { ...emptyFrame, scene: savedScene };
  t = await setup('?tenant=friendly#recoveryToken=fixture.private.token', { restored: savedEvent });
  w = t.w; d = w.document; b = w.FriendlyBridge;
  assert.equal(w.RentSketchEventPass.canEdit(), true); assert.equal(d.querySelector('.paywall-overlay'), null);
  assert.equal(b.getScene().tentId, 'frame-20x20'); assert.equal(b.getScene().objects[0].id, 'dining');
  assert.equal(d.getElementById('customerName').value, 'Sam Event'); assert.equal(d.getElementById('customerEmail').value, 'organizer@example.invalid', 'contact email is not overwritten by the payer email'); assert.equal(d.getElementById('customerDate').value, '2027-06-01');
  assert.equal(d.getElementById('view3dDayNight').getAttribute('aria-pressed'), 'true'); assert.equal(d.getElementById('sceneRain').checked, true); assert.equal(d.getElementById('sceneMotion').checked, false);
  assert.equal(b.currentReviewPricing().total, null, 'saved rates are never reused as current prices');
  d.getElementById('btnToReview').click(); await wait(10);
  assert.equal(d.querySelector('[name="deliveryZip"]').value, '13090'); assert.ok(t.calls.some(c => c.url.endsWith('/review-pricing?zip=13090'))); assert.equal(b.currentReviewPricing().deliveryFee, 49.99);
  d.getElementById('btnEmailQuote').click(); await wait(20);
  const quote = t.calls.find(c => c.url.endsWith('/quote-requests')).body;
  assert.equal(quote.designId, 'draft-owned'); assert.equal(quote.anonymousSessionId, 'restored-owner'); assert.equal(quote.customerName, 'Sam Event'); assert.equal(quote.customerEmail, 'organizer@example.invalid'); assert.equal(quote.eventDate, '2027-06-01'); assert.equal(quote.lineItems.find(l => l.category === 'delivery').amount, 49.99); assert.equal(quote.estimateTotal, b.currentReviewPricing().total);
  assert.equal(t.checkouts, 0); assert.equal(t.calls.filter(c => c.method === 'POST' && c.url.endsWith('/designs')).length, 0, 'Review reuses the paid event on another device');
  b.loadScene(emptyFrame.scene);
  assert.equal(d.getElementById('customerName').value, ''); assert.equal(d.getElementById('customerDate').value, ''); assert.equal(d.getElementById('customerEmail').value, ''); assert.equal(b.getScene().deliveryZip, '', 'opening a different legacy scene clears the prior event ZIP'); assert.equal(b.currentReviewPricing().deliveryFee, null);
  assert.equal(d.getElementById('view3dDayNight').getAttribute('aria-pressed'), 'false'); assert.equal(d.getElementById('sceneRain').checked, false);
  w.matchMedia = () => ({ matches: true });
  b.loadScene({ ...emptyFrame.scene, viewMode: '3d', sceneOptions: { night: false, weather: 'clear', motion: true } });
  assert.equal(b.state.viewMode, '3d', 'the saved 3D view is reopened'); assert.equal(d.getElementById('sceneMotion').checked, false, 'the returning device reduced-motion preference is respected');
  assert.equal(b.getScene().sceneOptions.night, false, 'an explicit saved day setting is preserved');
  t.dom.window.close();
  t = await setup('?tenant=friendly&embed=1&focus=tent&autoplace=1&view=2d&productId=fpr-pole', { embedded: true, saved: savedEvent, resumed: savedEvent });
  assert.equal(t.w.FriendlyBridge.getScene().tentId, 'pole-20x20', 'a different product still opens its exact free preview');
  [...t.w.document.querySelectorAll('#eventPassBar button')].find(button => button.textContent === 'Continue my saved event').click();
  assert.equal(t.w.FriendlyBridge.getScene().tentId, 'frame-20x20'); assert.equal(t.w.RENTSKETCH_TENT_PREVIEW, false); assert.equal(t.w.document.querySelector('.tent-preview-actions'), null); assert.match(t.w.document.getElementById('toolbarEventTitle').textContent, /Frame/); assert.equal(t.w.document.getElementById('customerName').value, 'Sam Event'); assert.equal(t.checkouts, 0);
  t.dom.window.close();
  t = await setup('?tenant=friendly#recoveryToken=fixture.booking.token', { restored: { ...emptyFrame, includedWithOrder: true, renewable: false, orderNumber: '9126', scene: { tentId: null, objects: [], eventName: 'Friendly order #9126', guestCount: 0, customer: { name: 'Booked Customer', email: 'booked@example.invalid', date: '2027-06-01' }, orderStart: { items: [{ slug: '20x20-pole-tent', quantity: 1 }] } } } });
  w=t.w;d=w.document;b=w.FriendlyBridge;
  assert.equal(b.getScene().tentId,'pole-20x20','included order opens the booked tent from the live catalog');assert.equal(b.getScene().orderStart,undefined,'future saves retain edits rather than rebuilding the starter');
  assert.match(d.getElementById('eventPassBar').textContent,/Included with Friendly order #9126/);assert.equal(w.RentSketchEventPass.canEdit(),true);assert.equal(d.getElementById('friendlyBooking').hidden,true,'existing bookings cannot accidentally create a duplicate order');
  d.getElementById('btnBookRentals').click();assert.equal(t.checkouts,0);
  d.getElementById('btnToReview').click();await wait(10);assert.equal(d.getElementById('btnEmailQuote').textContent,'Send layout to Friendly');assert.match(d.getElementById('quoteDisclaimer').textContent,/does not change booked items/);
  d.getElementById('btnEmailQuote').click();await wait(20);const bookedQuote=t.calls.find(c=>c.url.endsWith('/quote-requests')).body;assert.match(bookedQuote.notes,/Friendly order #9126/);assert.equal(bookedQuote.designId,'draft-owned');assert.equal(t.checkouts,0);
  t.dom.window.close();
  t = await setup('?tenant=friendly&payment=cancelled#draft=fixturetoken', { restored: { ...emptyFrame, active: false, renewable: false } });
  assert.equal(t.w.FriendlyBridge.getScene().tentId, 'frame-20x20'); assert.equal(t.w.document.body.classList.contains('rs-pass-preview'), true); assert.equal(t.w.document.querySelector('.paywall-overlay'), null);
  t.dom.window.close();
  t = await setup('?tenant=friendly&demo=1'); assert.equal(t.w.FriendlyBridge.getScene().objects.length,0,'demo URL cannot create a free furnished event'); t.dom.window.close();
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
  assert.equal(t.w.RentSketchEventPass.canEdit(),true);
  assert.equal(t.w.document.body.classList.contains('rs-pass-preview'), false); assert.equal(t.w.document.getElementById('eventPassBar').hidden, true);
  t.dom.window.close();
  t = await setup('?tenant=friendly', { saved: emptyFrame, failResume: true });
  assert.match(t.w.document.querySelector('.paywall-modal').textContent, /could not be opened/);
  t.w.dispatchEvent(new t.w.Event('pagehide'));
  assert.equal(JSON.parse(t.w.localStorage.getItem('rentsketch-autosave:friendly')).id, 'draft-owned', 'failed recovery plus page exit does not overwrite the original draft');
  assert.equal(t.calls.filter(c => c.method === 'POST' && c.url.endsWith('/designs')).length, 0);
  t.dom.window.close();
  t = await setup('?tenant=friendly&focus=tent&autoplace=1&view=2d&productId=fpr-pole', { previewSeconds: 0.1 });
  assert.match(t.w.document.getElementById('eventPreviewMark').textContent, /Free preview/);
  await wait(1100);
  assert.ok(t.w.document.querySelector('.preview-limit-screen'), 'the preview ends when the server deadline runs out');
  assert.ok(t.w.document.getElementById('designerApp').hasAttribute('inert'), 'expired preview cannot receive keyboard or pointer input');
  assert.equal(t.w.FriendlyBridge.getScene().tentId, 'pole-20x20', 'expiry preserves the exact rental');
  t.w.document.querySelector('[data-preview-buy]').click(); await wait(20);
  assert.ok(t.w.document.querySelector('.paywall-modal'), 'checkout is still reachable after expiry');
  t.w.document.querySelector('.pass-close').click();
  assert.ok(t.w.document.querySelector('.preview-limit-screen'), 'closing checkout does not restart free preview');
  t.w.document.querySelector('[data-preview-recover]').click();
  assert.ok(t.w.document.getElementById('recoverEmail'), 'paid customers can recover from the expired screen');
  t.dom.window.close();
  t = await setup('?tenant=friendly&focus=tent&autoplace=1&view=2d&productId=fpr-frame', { failPreview: true, previewDeadline: Date.now() - 1000 });
  assert.ok(t.w.document.querySelector('.preview-limit-screen'), 'reload, another product and API outage cannot reset an expired preview');
  t.dom.window.close();
  t = await setup('?tenant=friendly#recoveryToken=fixture.private.token', { restored: emptyFrame, previewSeconds: 0, previewDeadline: Date.now() - 1000 });
  assert.equal(t.w.document.querySelector('.preview-limit-screen'), null, 'verified access overrides preview expiry');
  assert.equal(t.calls.filter(c => c.url.endsWith('/event-pass/preview')).length, 0, 'paid event does not consume a preview');
  t.dom.window.close();
  console.log('PASS preview limit: visible countdown, timed expiry, exact scene retained, inert controls, checkout/recovery, reload/product persistence, outage bounds and paid access override.');
  console.log('PASS Event Pass UI: free exact preview, $9.99 / 30-day offer, iframe checkout, paid save/reopen with contact details, delivery ZIP and scene preferences, fresh review prices, same paid design for isolated quote, other-product resume, private recovery, forged success rejection, $4.99 renewal and launch-off behavior. DOM checks only; no GPU or payment/network writes.');
})().catch(e => { console.error(e); process.exitCode = 1; });
