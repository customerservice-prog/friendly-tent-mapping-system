const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const root=path.resolve(__dirname,'..');
const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
const urls=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>x[1]);
assert.equal(new Set(urls).size,urls.length);
const titles=new Set();
for(const url of urls){
 const pathname=new URL(url).pathname,file=pathname.endsWith('/')?pathname+'index.html':pathname;
 const html=fs.readFileSync(path.join(root,file),'utf8'),d=new JSDOM(html,{url}).window.document;
 assert.equal(d.querySelectorAll('h1').length,1,url+' has one heading');
 assert.equal(d.querySelector('link[rel=canonical]').href,url);
 assert.ok(!titles.has(d.title),'unique titles');titles.add(d.title);
 assert.ok(d.querySelector('meta[name=description]').content.length>70);
 for(const script of d.querySelectorAll('script[type="application/ld+json"]'))JSON.parse(script.textContent);
 for(const a of d.querySelectorAll('a[href]')){
  const link=new URL(a.href,url);if(link.origin!==new URL(url).origin)continue;
  const target=path.join(root,link.pathname.endsWith('/')?link.pathname+'index.html':link.pathname);
  assert.ok(fs.existsSync(target),'broken internal link '+a.href+' on '+url);
 }
 for(const img of d.querySelectorAll('img[src]'))assert.ok(fs.existsSync(path.join(root,new URL(img.src,url).pathname)),'missing image '+img.src);
}
const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://rentsketch.com/',runScripts:'outside-only'});
dom.window.fetch=async()=>({ok:true,json:async()=>({plans:[]})});
dom.window.eval(fs.readFileSync(path.join(root,'marketing.js'),'utf8'));
const doc=dom.window.document;doc.querySelector('.menu-toggle').click();assert.equal(doc.querySelector('.menu-toggle').getAttribute('aria-expanded'),'true');
doc.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(doc.querySelector('.menu-toggle').getAttribute('aria-expanded'),'false');
doc.querySelector('[data-billing=annual]').click();assert.equal(doc.querySelector('[data-plan=starter] [data-monthly]').textContent,'$490');assert.equal(doc.querySelector('[data-period]').textContent,'/year');
doc.querySelector('[data-billing=monthly]').click();assert.equal(doc.querySelector('[data-plan=starter] [data-monthly]').textContent,'$49');
assert.ok(!sitemap.includes('/designer/'));assert.ok(!sitemap.includes('signup'));assert.ok(!sitemap.includes('/dashboard/'));assert.ok(sitemap.includes('/demo/'));

assert.ok(sitemap.includes('/event-pass/'),'Event Pass landing page must be indexable');
const consumerPages=['index.html','event-pass/index.html','business/pricing.html','wedding-layout-planner/index.html','tent-layout-software/index.html','tent-diagram-software/index.html','event-layout-software/index.html'];
for(const file of consumerPages){
 const html=fs.readFileSync(path.join(root,file),'utf8'),page=new JSDOM(html,{url:'https://rentsketch.com/'+(file==='index.html'?'':file.replace(/index\.html$/,''))}).window.document;
 const paid=[...page.querySelectorAll('a[href*="/api/consumer/event-pass/direct-checkout"]')];
 assert.ok(paid.length>=1,file+' exposes a direct Event Pass purchase CTA');
 for(const a of paid){
  const u=new URL(a.href);
  assert.equal(u.hostname,'rentsketch-api-production.up.railway.app');
  assert.equal(u.pathname,'/api/consumer/event-pass/direct-checkout');
  assert.equal(u.searchParams.get('tenant'),'generic');
  assert.match(a.textContent,/\$9\.99/);
 }
 assert.doesNotMatch(html,/\{event_pass_url\(/,file+' contains no unrendered template URL');
}
const homeHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.match(homeHtml,/Plan one event · \$9\.99/);
assert.match(homeHtml,/<title>Party Rental Software &amp; 3D Event Planning/);
assert.match(homeHtml,/<h1>Party rental software<br><span>customers can actually see\.<\/span><\/h1>/);
assert.match(homeHtml,/Start 14-day business trial/);
assert.match(homeHtml,/"applicationCategory": "BusinessApplication"/);
assert.ok(sitemap.includes('/tent-rental-software/'),'Tent rental software landing page must be indexable');
const partySoftware=fs.readFileSync(path.join(root,'party-rental-software/index.html'),'utf8');
assert.match(partySoftware,/<title>Party Rental Software/);
for(const phrase of ['party rental business software','party rental inventory software','party rental management software','party and event rental software']) assert.ok(partySoftware.toLowerCase().includes(phrase),phrase+' must appear naturally on party-rental-software');
assert.match(partySoftware,/does not replace live stock-count or reservation software/);
assert.match(partySoftware,/data-software-proof/);
assert.match(partySoftware,/Built around a live rental workflow/);
assert.match(partySoftware,/View live installation/);
assert.match(partySoftware,/https:\/\/www\.friendlypartyrental\.com\/design-your-event/);
const eventSoftware=fs.readFileSync(path.join(root,'event-rental-software/index.html'),'utf8');
assert.match(eventSoftware,/<title>Party &amp; Event Rental Software \| RentSketch<\/title>/);
assert.match(eventSoftware,/Searching for “rent event registration software”\?/);
assert.match(eventSoftware,/RentSketch is not that category of software/);
const tentSoftware=fs.readFileSync(path.join(root,'tent-rental-software/index.html'),'utf8');
assert.match(tentSoftware,/<title>Tent Rental Software/);
assert.match(tentSoftware,/does not currently replace component-level tent inventory/);

const inventorySoftware=fs.readFileSync(path.join(root,'party-rental-inventory-software/index.html'),'utf8');
assert.match(inventorySoftware,/<title>Party Rental Inventory Software \| RentSketch<\/title>/);
assert.match(inventorySoftware,/date-based availability/);
assert.match(inventorySoftware,/does not claim to replace/);
const managementSoftware=fs.readFileSync(path.join(root,'party-rental-management-software/index.html'),'utf8');
assert.match(managementSoftware,/<title>Party Rental Management Software \| RentSketch<\/title>/);
assert.match(managementSoftware,/booking workflow/);
assert.match(managementSoftware,/does not currently replace every contract/);
assert.ok(sitemap.includes('/party-rental-inventory-software/'));
assert.ok(sitemap.includes('/party-rental-management-software/'));
assert.match(homeHtml,/party-rental-inventory-software/);
assert.match(homeHtml,/party-rental-management-software/);
for(const html of [partySoftware,eventSoftware,tentSoftware]){
  assert.match(html,/"@type": "SoftwareApplication"/);
  assert.match(html,/Start business trial/);
}

for(const target of ['/party-rental-management-software/','/party-rental-inventory-software/','/tent-rental-software/','/event-rental-software/']){
  assert.ok(homeHtml.includes('href="'+target+'"'),'homepage must crawl-link '+target);
}
assert.match(partySoftware,/Party Rental Software for Rental Businesses/);
assert.match(eventSoftware,/Party &amp; Event Rental Software/);
assert.match(tentSoftware,/Tent Rental Software for Layouts &amp; Quotes/);
for(const html of [partySoftware,eventSoftware,tentSoftware,inventorySoftware,managementSoftware]){
  assert.match(html,/Party rental software by job/);
  assert.match(html,/party-rental-management-software/);
  assert.match(html,/party-rental-inventory-software/);
  assert.match(html,/tent-rental-software/);
}
const eventPassHtml=fs.readFileSync(path.join(root,'event-pass/index.html'),'utf8');
assert.match(eventPassHtml,/No subscription/);
assert.match(eventPassHtml,/30 days/);
assert.match(eventPassHtml,/\$9\.99 once/);
const signup=new JSDOM(fs.readFileSync(path.join(root,'business/signup.html'),'utf8'),{url:'https://rentsketch.com/business/signup.html?plan=starter',runScripts:'outside-only'});
signup.window.eval(fs.readFileSync(path.join(root,'business/signup.js'),'utf8'));
assert.equal(signup.window.document.querySelector('input[name=plan]:checked').value,'starter');
assert.equal(signup.window.document.querySelector('input[type=email]').required,true);
dom.window.close();signup.window.close();console.log('PASS marketing: all sitemap pages resolve, unique metadata/canonicals, valid structured data, local links/images, accessible menu, accurate annual totals and signup plan selection. DOM/static checks, not device rendering.');
