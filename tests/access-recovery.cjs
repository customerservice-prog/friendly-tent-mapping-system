// Recovery-page behavior with mocked email API only; no messages are sent.
const { JSDOM } = require('jsdom'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const settle = () => new Promise(r => setImmediate(r));
async function page(tenant, status = 200) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'my-event/index.html'), 'utf8'), { url: 'https://rentsketch.com/my-event/' + (tenant ? '?tenant=' + tenant : ''), runScripts: 'outside-only' });
  const w = dom.window, calls = [];
  w.AbortController = AbortController;
  w.fetch = async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return { ok: status === 200, json: async () => status === 200 ? { ok: true } : { error: 'Access email is temporarily unavailable.' } }; };
  w.eval(fs.readFileSync(path.join(root, 'my-event/access.js'), 'utf8'));
  const form = w.document.getElementById('accessForm'), button = form.querySelector('button');
  w.document.getElementById('accessEmail').value = 'owner@example.invalid';
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await settle(); await settle();
  assert.equal(calls.length, 1, 'duplicate submit queues one request');
  assert.equal(calls[0].body.tenant, tenant || null);
  assert.equal(calls[0].body.email, 'owner@example.invalid');
  if (status === 200) { assert.match(w.document.getElementById('accessStatus').textContent, /If a saved event matches/); assert.equal(button.disabled, true); }
  else { assert.match(w.document.getElementById('accessStatus').textContent, /temporarily unavailable/); assert.equal(button.disabled, false); }
  assert.equal(w.document.querySelector('[data-preview]').search, tenant ? '?tenant=' + tenant : '');
  w.close();
}
async function orderPage(status, accessUrl = 'https://rentsketch.com/designer/?tenant=friendly#recoveryToken=fixture.booking.token') {
  const dom = new JSDOM(fs.readFileSync(path.join(root,'my-event/index.html'),'utf8'),{url:'https://rentsketch.com/my-event/?tenant=friendly&mode=order&order=ERS-6991',runScripts:'outside-only'}),w=dom.window,calls=[];
  const navigations=[];
  w.AbortController=AbortController;w.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return{ok:status===200,json:async()=>status===200?{ok:true,accessUrl}:{error:status===403?'No active confirmed Friendly booking matched those details.':'Please try again shortly.'}};};
  w.testLocation={search:w.location.search,assign:url=>navigations.push(url)};
  w.eval('(function(location){'+fs.readFileSync(path.join(root,'my-event/access.js'),'utf8')+'})(window.testLocation);');
  assert.equal(w.document.getElementById('orderAccess').open,true);assert.equal(w.document.getElementById('orderNumber').value,'ERS-6991');
  w.document.getElementById('orderFirstName').value=' Booked ';const form=w.document.getElementById('orderAccessForm');
  for(let i=0;i<2;i++)form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();await settle();
  assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/order-access/request'));assert.deepEqual(calls[0].body,{orderNumber:'ERS-6991',firstName:'Booked'});assert.equal(w.document.getElementById('orderEmail'),null);
  assert.equal(w.document.getElementById('paidAccess').hidden,true);assert.equal(w.document.getElementById('emailHelp').hidden,true);
  assert.match(w.document.querySelector('.details').textContent,/No email or code needed/);
  const success=status===200&&accessUrl.startsWith('https://rentsketch.com/designer/');
  assert.match(w.document.getElementById('orderAccessStatus').textContent,success?/Booking verified\. Opening/:status===403?/No active confirmed Friendly booking/:/try again/);
  assert.equal(form.querySelector('button').disabled,success);
  assert.equal(w.document.getElementById('orderContinue').hidden,!success);
  assert.equal(navigations.length,success?1:0,'successful name/order match navigates immediately in the same tab');
  if(success)assert.equal(navigations[0],accessUrl);
  else assert.equal(w.document.getElementById('orderAccessStatus').className,'error');
  assert.equal(calls.some(c=>c.url.endsWith('/recovery-link')),false,'booking form never requests email');
  w.close();
}
(async () => { await page('friendly'); await page(null); await page('generic', 503); await orderPage(200); await orderPage(403); await orderPage(503); await orderPage(200,'https://other.example/designer/?tenant=friendly#recoveryToken=bad'); await orderPage(200,''); console.log('PASS access page: immediate same-tab booking access, explicit declines, no booking email request, order prefill, duplicate prevention, redirect validation and unchanged paid-email recovery. Mock API; no emails.'); })().catch(e => { console.error(e); process.exitCode = 1; });
