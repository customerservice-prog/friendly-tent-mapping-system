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
const signup=new JSDOM(fs.readFileSync(path.join(root,'business/signup.html'),'utf8'),{url:'https://rentsketch.com/business/signup.html?plan=starter',runScripts:'outside-only'});
signup.window.eval(fs.readFileSync(path.join(root,'business/signup.js'),'utf8'));
assert.equal(signup.window.document.querySelector('input[name=plan]:checked').value,'starter');
assert.equal(signup.window.document.querySelector('input[type=email]').required,true);
dom.window.close();signup.window.close();console.log('PASS marketing: all sitemap pages resolve, unique metadata/canonicals, valid structured data, local links/images, accessible menu, accurate annual totals and signup plan selection. DOM/static checks, not device rendering.');
