// Venue/background photo ownership + capability URL regression. No production writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite'),express=require('express');
const root=path.resolve(__dirname,'..'),pg=new PGlite(),db={query:(sql,args)=>pg.query(sql,args)};
function load(file,deps){
 const mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{
  module:mod,exports:mod.exports,require:id=>{if(!(id in deps))throw Error('Unexpected dependency '+id);return deps[id];},
  console,Buffer,Date,Number,String,Object,Array,Math,JSON,Map,Promise,setTimeout,clearTimeout
 },{filename:file});
 return mod.exports;
}
const routes=load('server/src/routes/designBackgrounds.js',{
 express,crypto:require('node:crypto'),'../db':db,
 '../auth':{verifyToken:()=>({userId:'nobody'})},
 '../middleware/requireAuth':{isConfiguredPlatformAdmin:async()=>false},
 '../eventPassAccess':{savePermission:async()=>null}
});
const app=express();app.use('/api/tenants',routes);app.use('/api/consumer',routes);app.use((err,req,res,next)=>{console.error(err);if(err?.type==='entity.too.large')return res.status(413).json({error:'Request too large'});res.status(500).json({error:err.message});});
let server,base;
async function send(url,{method='GET',session,body,type}={}){
 const headers={};if(session)headers['X-RentSketch-Session']=session;if(type)headers['Content-Type']=type;
 const r=await fetch(base+url,{method,headers,body});
 const ct=r.headers.get('content-type')||'';
 return {status:r.status,ct,body:ct.includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer())};
}
(async()=>{
 await pg.exec(`
  CREATE TABLE tenants(id uuid PRIMARY KEY,slug text UNIQUE);
  CREATE TABLE designs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,anonymous_session_id text,scene jsonb);
  CREATE TABLE tenant_memberships(tenant_id uuid,user_id uuid,role text);
 `);
 await pg.exec(fs.readFileSync(path.join(root,'server/migrations/018_design_background_photos.sql'),'utf8'));
 await pg.exec(fs.readFileSync(path.join(root,'server/migrations/019_generic_design_background_photos.sql'),'utf8'));
 const tenant='00000000-0000-4000-8000-000000000001';
 await pg.query("INSERT INTO tenants(id,slug) VALUES($1,'friendly')",[tenant]);
 const design=(await pg.query("INSERT INTO designs(tenant_id,anonymous_session_id,scene) VALUES($1,'owner-session',$2) RETURNING id",[tenant,{tentId:'frame-20x20',objects:[]}])).rows[0];
 const generic=(await pg.query("INSERT INTO designs(tenant_id,anonymous_session_id,scene) VALUES(NULL,'generic-owner-session',$1) RETURNING id",[{tentId:'frame-20x20',objects:[]}])).rows[0];
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;

 const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0xff,0xd9]);
 let r=await send('/api/tenants/friendly/designs/'+design.id+'/background-photo',{method:'POST',session:'wrong-session',type:'image/jpeg',body:jpeg});
 assert.equal(r.status,403,'another browser cannot attach a photo to a guessed design id');

 r=await send('/api/tenants/friendly/designs/'+design.id+'/background-photo',{method:'POST',session:'owner-session',type:'image/jpeg',body:jpeg});
 assert.equal(r.status,201);assert.ok(r.body.id);assert.match(r.body.path,/\/background-photo\//);assert.match(r.body.path,/\?t=/);
 const token=new URL('http://fixture'+r.body.path).searchParams.get('t');assert.ok(token);
 const stored=(await pg.query('SELECT access_token_hash,image_bytes,byte_size FROM design_background_photos WHERE id=$1',[r.body.id])).rows[0];
 assert.equal(stored.byte_size,jpeg.length);assert.notEqual(stored.access_token_hash,token,'raw access capability is never stored');
 assert.deepEqual(Buffer.from(stored.image_bytes),jpeg);

 let img=await send(r.body.path);assert.equal(img.status,200);assert.match(img.ct,/image\/jpeg/);assert.deepEqual(img.body,jpeg);
 const tampered=r.body.path.replace(/t=[^&]+/,'t=not-the-token');
 assert.equal((await send(tampered)).status,404,'photo capability cannot be guessed or altered');
 assert.equal((await send('/api/tenants/friendly/designs/'+design.id+'/background-photo/'+r.body.id,{method:'DELETE',session:'wrong-session'})).status,403);
 assert.equal((await send('/api/tenants/friendly/designs/'+design.id+'/background-photo/'+r.body.id,{method:'DELETE',session:'owner-session'})).status,200);
 assert.equal((await send(r.body.path)).status,404,'removed venue photo is no longer retrievable');
 // Reproduce the public RentSketch/Event Pass path: design is saved under /api/consumer with tenant_id NULL.
 r=await send('/api/consumer/designs/'+generic.id+'/background-photo',{method:'POST',session:'wrong-session',type:'image/jpeg',body:jpeg});
 assert.equal(r.status,403,'generic design still requires the owning browser session');
 r=await send('/api/consumer/designs/'+generic.id+'/background-photo',{method:'POST',session:'generic-owner-session',type:'image/jpeg',body:jpeg});
 assert.equal(r.status,201,'generic/Event Pass design accepts a venue photo');
 assert.match(r.body.path,/^\/api\/consumer\/background-photo\//,'generic photo returns consumer capability URL');
 const genericPath=r.body.path,genericPhotoId=r.body.id;
 img=await send(genericPath);assert.equal(img.status,200);assert.deepEqual(img.body,jpeg);
 assert.equal((await send('/api/consumer/designs/'+generic.id+'/background-photo/'+genericPhotoId,{method:'DELETE',session:'wrong-session'})).status,403);
 assert.equal((await send('/api/consumer/designs/'+generic.id+'/background-photo/'+genericPhotoId,{method:'DELETE',session:'generic-owner-session'})).status,200);
 assert.equal((await send(genericPath)).status,404);
  console.log('PASS venue photo API: tenant + generic/Event Pass, design ownership, private capability URL, binary round-trip, tamper rejection and owner-only removal.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{server?.close();await pg.close();});
