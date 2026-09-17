const db = require('./db');

const BASE = 'https://www.friendlypartyrental.com';
const TARGET_EMAIL = 'customerservice@friendlypartyrental.com';

async function getText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'RentSketchCatalogSync/1.0 (+https://rentsketch.com)' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}

function decode(s) {
  return String(s || '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
function strip(s) { return decode(String(s || '').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()); }
function meta(html, key) {
  const a = html.match(new RegExp('<meta[^>]+(?:property|name)=["\\\']'+key+'["\\\'][^>]+content=["\\\']([^"\\\']+)', 'i'));
  const b = html.match(new RegExp('<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]+(?:property|name)=["\\\']'+key+'["\\\']', 'i'));
  return decode((a || b || [])[1] || '');
}
function slugFromUrl(url) { try { return new URL(url).pathname.split('/').filter(Boolean).pop(); } catch (_) { return ''; } }
function categoryFromHtml(html) {
  const breadcrumb = strip((html.match(/Home\s*\/\s*([^<\/]+)\s*\//i)||[])[1]);
  const s = breadcrumb.toLowerCase();
  if (/tent/.test(s)) return 'tent'; if (/table.*chair|chair/.test(s)) return 'chair'; if (/table/.test(s)) return 'table';
  if (/linen/.test(s)) return 'linen'; if (/light/.test(s)) return 'lighting'; if (/dance|stage/.test(s)) return 'dance_floor';
  if (/bounce|water|inflatable/.test(s)) return 'inflatable'; if (/photo/.test(s)) return 'photobooth'; if (/concession/.test(s)) return 'concession';
  if (/generator/.test(s)) return 'generator'; if (/game/.test(s)) return 'game'; if (/package|wedding/.test(s)) return 'package';
  return breadcrumb ? breadcrumb.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'') : 'other';
}
function parseProduct(url, html) {
  let ld = null;
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const obj = JSON.parse(m[1]); const list = Array.isArray(obj) ? obj : (obj['@graph'] || [obj]);
      ld = list.find(x => x && (x['@type'] === 'Product' || (Array.isArray(x['@type']) && x['@type'].includes('Product'))));
      if (ld) break;
    } catch (_) {}
  }
  const h1 = strip((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]);
  const name = (ld && ld.name) || h1 || meta(html,'og:title').replace(/\s*\|.*$/,'');
  let image = ld && ld.image;
  if (Array.isArray(image)) image = image[0];
  if (image && typeof image === 'object') image = image.url || image.contentUrl;
  image = image || meta(html,'og:image');
  let offer = ld && ld.offers; if (Array.isArray(offer)) offer = offer[0];
  let price = offer && (offer.price || offer.lowPrice);
  if (price == null) {
    const pm = strip(html).match(/Starting at\s*\$([\d,]+(?:\.\d{1,2})?)(?:\s*\/\s*day|\/day)?/i) || strip(html).match(/\$([\d,]+(?:\.\d{1,2})?)\s*\/\s*day/i);
    price = pm && pm[1];
  }
  price = price == null ? null : Number(String(price).replace(/,/g,''));
  if (!name || !Number.isFinite(price)) return null;
  const size = name.match(/(\d{1,3})\s*[x×]\s*(\d{1,3})/i);
  const capacityMatch = strip(html).match(/(?:seats?|accommodates?|capacity)[^\d]{0,20}(\d{1,3})/i);
  return {
    externalId: 'fpr:' + slugFromUrl(url), name: strip(name), category: categoryFromHtml(html), price,
    photoUrl: image || null, widthFt: size ? Number(size[1]) : null, lengthFt: size ? Number(size[2]) : null,
    capacity: capacityMatch ? Number(capacityMatch[1]) : null, sourceUrl: url
  };
}
async function discoverItemUrls() {
  const found = new Set();
  const sitemapCandidates = [BASE+'/sitemap.xml', BASE+'/sitemap_index.xml', BASE+'/sitemap-index.xml'];
  try {
    const robots = await getText(BASE+'/robots.txt');
    for (const m of robots.matchAll(/^Sitemap:\s*(\S+)/gim)) sitemapCandidates.unshift(m[1]);
  } catch (_) {}
  const seenMaps = new Set();
  async function readMap(url, depth) {
    if (seenMaps.has(url) || depth > 2) return; seenMaps.add(url);
    try {
      const xml = await getText(url);
      const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/gi), m => decode(m[1].trim()));
      for (const loc of locs) {
        if (/\/items\/[^/?#]+/i.test(loc)) found.add(loc.split('?')[0]);
        else if (/sitemap/i.test(loc)) await readMap(loc, depth + 1);
      }
    } catch (_) {}
  }
  for (const s of sitemapCandidates) await readMap(s, 0);
  if (!found.size) {
    const seeds = [BASE+'/', BASE+'/items', BASE+'/category/tent-rentals', BASE+'/category/table-chair-rentals', BASE+'/category/bounce-house-rentals', BASE+'/category/linen-tablecloth-rentals', BASE+'/category/dance-floor-stage-rentals', BASE+'/category/photobooth-rentals', BASE+'/category/concession-machine-rentals', BASE+'/category/generator-rentals', BASE+'/category/yard-game-rentals', BASE+'/category/party-rental-packages'];
    for (const u of seeds) { try { const h=await getText(u); for(const m of h.matchAll(/href=["']([^"']*\/items\/[^"'#?]+)["']/gi)){found.add(new URL(decode(m[1]),BASE).href);} } catch (_) {} }
  }
  return Array.from(found);
}
async function syncFriendlyCatalog() {
  const tenantResult = await db.query(`SELECT id,slug,name,contact_email FROM tenants WHERE lower(contact_email)=lower($1) OR lower(name) LIKE '%friendly party rental%' ORDER BY CASE WHEN lower(contact_email)=lower($1) THEN 0 ELSE 1 END LIMIT 1`, [TARGET_EMAIL]);
  const tenant = tenantResult.rows[0];
  if (!tenant) { console.log('[catalog-sync] Friendly Party Rental tenant not found; skipped'); return { skipped: true }; }
  const urls = await discoverItemUrls();
  if (!urls.length) throw new Error('No Friendly Party Rental item URLs discovered');
  let imported=0, failed=0;
  for (let i=0;i<urls.length;i+=6) {
    await Promise.all(urls.slice(i,i+6).map(async url => {
      try {
        const html=await getText(url); const p=parseProduct(url,html); if(!p) { failed++; return; }
        await db.query(`INSERT INTO products (tenant_id,category,external_id,name,price_per_day,price_type,width_ft,length_ft,capacity,photo_url,sort_order,active)
          VALUES ($1,$2,$3,$4,$5,'per_day',$6,$7,$8,$9,0,true)
          ON CONFLICT (tenant_id, external_id) DO UPDATE SET category=EXCLUDED.category,name=EXCLUDED.name,price_per_day=EXCLUDED.price_per_day,width_ft=EXCLUDED.width_ft,length_ft=EXCLUDED.length_ft,capacity=EXCLUDED.capacity,photo_url=EXCLUDED.photo_url,active=true,updated_at=now()`,
          [tenant.id,p.category,p.externalId,p.name,p.price,p.widthFt,p.lengthFt,p.capacity,p.photoUrl]);
        imported++;
      } catch (e) { failed++; console.warn('[catalog-sync] item failed', url, e.message); }
    }));
  }
  console.log(`[catalog-sync] ${tenant.slug}: discovered=${urls.length} imported=${imported} failed=${failed}`);
  return { tenant: tenant.slug, discovered: urls.length, imported, failed };
}
module.exports = syncFriendlyCatalog;
