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
  const form = w.document.querySelector('form'), button = form.querySelector('button');
  w.document.querySelector('input').value = 'owner@example.invalid';
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await settle(); await settle();
  assert.equal(calls.length, 1, 'duplicate submit queues one request');
  assert.equal(calls[0].body.tenant, tenant || null);
  assert.equal(calls[0].body.email, 'owner@example.invalid');
  if (status === 200) { assert.match(w.document.getElementById('accessStatus').textContent, /If a paid event matches/); assert.equal(button.disabled, true); }
  else { assert.match(w.document.getElementById('accessStatus').textContent, /temporarily unavailable/); assert.equal(button.disabled, false); }
  assert.equal(w.document.querySelector('[data-preview]').search, tenant ? '?tenant=' + tenant : '');
  w.close();
}
(async () => { await page('friendly'); await page(null); await page('generic', 503); console.log('PASS access email recovery: tenant scope, all-events lookup, duplicate submit prevention, honest confirmation and delivery failure. Mock API; no emails.'); })().catch(e => { console.error(e); process.exitCode = 1; });
