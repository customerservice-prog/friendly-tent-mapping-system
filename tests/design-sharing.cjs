// Isolated regression for tenant read-only layout sharing. No production writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite'),express=require('express'),jwt=require('jsonwebtoken');
const root=path.resolve(__dirname,'..'),pg=new PGlite(),SECRET='fixture-share-secret';
const db={query:(sql,args)=>pg.query(sql,args)};
function load(file,deps){
  const mod={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{
    module:mod,exports:mod.exports,require:id=>{if(id==='../clientIp')return require('../server/src/clientIp');if(!(id in deps))throw Error('Unexpected dependency '+id);return deps[id];},
    console,Date,Number,String,Object,Array,Math,JSON,URL,Buffer,Map,Promise,setTimeout,clearTimeout
  },{filename:file});
  return mod.exports;
}
const auth={
  signToken:(payload,opts)=>jwt.sign(payload,SECRET,{expiresIn:opts?.expiresIn||'1h'}),
  verifyToken:token=>jwt.verify(token,SECRET)
};
const routes=load('server/src/routes/designs.js',{
  express,'../db':db,'../middleware/requireAuth':{requireTenantAccess:(req,res,next)=>next()},
  '../eventPassAccess':{savePermission:async()=>null},'../auth':auth,'../dashboardHttpSession':{getDashboardToken:req=>String(req.headers.authorization||'').startsWith('Bearer ')?req.headers.authorization.slice(7):null},'../dashboardSessions':{verifyDashboardToken:async()=>{throw Error('No staff fixture')}}
});
const app=express();app.use(express.json());app.use('/api/tenants',routes);app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:err.message});});
let server,base;
async function req(url,{method='POST',body}={}){
 const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 return{status:r.status,body:await r.json().catch(()=>({}))};
}
(async()=>{
 await pg.exec(`
   CREATE TABLE tenants(id uuid PRIMARY KEY,slug text UNIQUE);
   CREATE TABLE designs(
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,anonymous_session_id text,schema_version int default 1,
     event_type text,guest_count int,scene jsonb,estimate_total numeric,created_at timestamptz default now(),updated_at timestamptz default now()
   );
 `);
 const tenant='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 await pg.query("INSERT INTO tenants(id,slug) VALUES($1,'friendly'),($2,'other')",[tenant,other]);
 const scene={tentId:'frame-20x20',sidewalls:[{id:'front-0',side:'front',startFt:0,lengthFt:10,type:'window',enabled:true}],backgroundPhoto:{id:'photo-fixture',url:'https://api.example.invalid/api/tenants/friendly/background-photo/photo-fixture?t=capability',focusX:37,focusY:58,zoom:1.24,shade:.12},objects:[{id:'t1',kind:'table',x:2,y:2,widthFt:5,depthFt:5}]};
 const design=(await pg.query("INSERT INTO designs(tenant_id,anonymous_session_id,event_type,guest_count,scene) VALUES($1,'owner-session','wedding',80,$2) RETURNING id",[tenant,scene])).rows[0];
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;

 let r=await req('/api/tenants/friendly/designs/'+design.id+'/share',{body:{anonymousSessionId:'owner-session'}});
 assert.equal(r.status,200);assert.match(r.body.url,/^https:\/\/rentsketch\.com\/designer\/\?tenant=friendly#share=/);assert.equal(r.body.expiresInDays,180);
 const token=new URLSearchParams(new URL(r.body.url).hash.slice(1)).get('share');assert.ok(token);
 r=await req('/api/tenants/friendly/shared-design/restore',{body:{token}});
 assert.equal(r.status,200);assert.equal(r.body.readOnly,true);assert.deepEqual(r.body.scene,scene);assert.equal(r.body.guestCount,80);
 assert.equal((await req('/api/tenants/friendly/designs/'+design.id+'/share',{body:{anonymousSessionId:'wrong-session'}})).status,404,'guessed design id cannot be shared without ownership');
 assert.equal((await req('/api/tenants/other/shared-design/restore',{body:{token}})).status,400,'share token is tenant-bound');
 assert.equal((await req('/api/tenants/friendly/shared-design/restore',{body:{token:token.slice(0,-1)+'x'}})).status,400,'tampered share token is rejected');
 console.log('PASS design sharing: owner-only creation, 180-day signed fragment URL, exact sidewall scene restore, tenant binding and tamper rejection.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{server?.close();await pg.close();});
