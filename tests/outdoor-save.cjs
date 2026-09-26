// Real project API with isolated Postgres: outdoor drafts have no tent.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {PGlite}=require('@electric-sql/pglite'),express=require('express');
const root=path.resolve(__dirname,'..'),pg=new PGlite();
const db={query:(sql,args)=>pg.query(sql,args),pool:{connect:async()=>({query:(sql,args)=>pg.query(sql,args),release(){}})}};
function load(file,deps){const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{module,exports:module.exports,require:id=>{if(!(id in deps))throw Error('Unexpected dependency '+id);return deps[id];},Buffer,URL,console},{filename:file});return module.exports;}
const authz={requireTenantAccess:(req,res,next)=>next()};
const projects=load('server/src/designProjects.js',{crypto,'./db':db,'./dashboardHttpSession':{getDashboardToken:()=>null},'./dashboardSessions':{},'./middleware/requireAuth':authz,'./eventPassAccess':{savePermission:async()=>null,permissionDesign:async d=>d},'./auth':{}});
const routes=load('server/src/routes/designs.js',{express,'../db':db,'../clientIp':require('../server/src/clientIp'),'../middleware/requireAuth':authz,'../designProjects':projects});
const app=express();app.use(express.json());app.use('/api/tenants',routes);app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
let server,base;
async function request(url,method,body){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};}
(async()=>{
 await pg.exec(`CREATE TABLE tenants(id uuid PRIMARY KEY,slug text);CREATE TABLE designs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,owner_user_id uuid,anonymous_session_id text,schema_version int,event_type text,guest_count int,scene jsonb,estimate_total numeric,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
 await pg.exec(fs.readFileSync(path.join(root,'server/migrations/022_design_projects.sql'),'utf8'));
 await pg.query("INSERT INTO tenants VALUES($1,'test-company')",[crypto.randomUUID()]);
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;
 const scene={tentId:null,siteWidthFt:40,siteLengthFt:50,objects:[{id:'slide1',kind:'inflatable',inflatableId:'test-slide',x:8,y:8,widthFt:16,depthFt:32}],zones:[],aisles:[]};
 const body={scene,anonymousSessionId:'test-private-browser'},url='/api/tenants/test-company/designs';
 const created=await request(url,'POST',body);assert.equal(created.status,201);assert.equal(created.body.scene.tentId,null);assert.equal(created.body.revision,1);
 const updated=await request(url+'/'+created.body.id,'PATCH',{...body,expectedRevision:1});assert.equal(updated.status,200);assert.equal(updated.body.scene.objects[0].kind,'inflatable');assert.equal(updated.body.revision,2);
 assert.equal((await request(url,'POST',{...body,scene:{...scene,tentId:{}}})).status,400);
 assert.equal((await request(url,'POST',{...body,scene:{...scene,objects:Array(501).fill({})}})).status,400);
 assert.equal((await request(url+'/'+created.body.id,'PATCH',{scene,expectedRevision:2})).status,401);
 assert.equal((await request(url+'/'+created.body.id,'PATCH',body)).status,428);
 assert.equal((await pg.query('SELECT count(*) AS n FROM designs')).rows[0].n,1);
 console.log('PASS outdoor create/update with null tentId and revisions; invalid types, oversized scenes, missing ownership and old-client writes rejected.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{server?.close();await pg.close();});
