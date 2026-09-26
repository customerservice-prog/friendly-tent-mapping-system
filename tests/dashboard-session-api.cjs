// Real signed JWTs, real session/middleware/routes and temporary Postgres.
// Password hashing is a deterministic test adapter; no accounts or external APIs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite'),express=require('express'),jwt=require('jsonwebtoken');
const root=path.resolve(__dirname,'..'),pg=new PGlite(),env={NODE_ENV:'test',JWT_SECRET:'isolated-session-signing-key',PLATFORM_ADMIN_EMAIL:'platform@example.invalid'};
const db={query:(sql,args)=>pg.query(sql,args),pool:{connect:async()=>({query:(sql,args)=>pg.query(sql,args),release(){}})}};
function load(file,deps){const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{module:mod,exports:mod.exports,require:id=>{if(id==='../clientIp')return require('../server/src/clientIp');assert.ok(id in deps,'Unexpected dependency '+id);return deps[id]},process:{env},console,Buffer,Date,Map,Promise},{filename:file});return mod.exports;}
const hash=p=>crypto.createHash('sha256').update(p).digest('hex');
const auth=load('server/src/auth.js',{bcryptjs:{hash:async p=>hash(p),compare:async(p,h)=>hash(p)===h},jsonwebtoken:jwt});
const sessions=load('server/src/dashboardSessions.js',{crypto,'./db':db,'./auth':auth});
const guards=load('server/src/middleware/requireAuth.js',{'../db':db,'../dashboardSessions':sessions});
const routes=load('server/src/routes/auth.js',{express,crypto,'../db':db,'../auth':auth,'../dashboardSessions':sessions});
const app=express();app.use(express.json());app.use('/api/auth',routes);
app.get('/admin',guards.requirePlatformAdmin,(req,res)=>res.json({ok:true}));
app.get('/tenant/:slug',guards.requireTenantAccess,(req,res)=>res.json({role:req.user.tenantRole}));
app.post('/tenant/:slug',guards.requireTenantRole('staff'),(req,res)=>res.json({ok:true}));
app.use((err,req,res,next)=>res.status(500).json({error:err.message}));
const admin='10000000-0000-4000-8000-000000000001',staff='10000000-0000-4000-8000-000000000002',viewer='10000000-0000-4000-8000-000000000003',tenant='20000000-0000-4000-8000-000000000001';
let server,base;
async function req(url,token,body){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,body:await r.json(),cache:r.headers.get('cache-control')}}
async function login(email='platform@example.invalid',password='initial-password'){const r=await req('/api/auth/login',null,{email,password});assert.equal(r.status,200);return r.body;}
(async()=>{
 await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY,email text,password_hash text,display_name text,is_platform_admin boolean default false);
 CREATE TABLE tenants(id uuid PRIMARY KEY,slug text,name text,subscription_status text,trial_ends_at timestamptz);
 CREATE TABLE tenant_memberships(tenant_id uuid,user_id uuid,role text);`);
 await pg.exec(fs.readFileSync(path.join(root,'server/migrations/020_dashboard_sessions.sql'),'utf8'));
 await pg.exec(fs.readFileSync(path.join(root,'server/migrations/016_password_reset_tokens.sql'),'utf8'));
 await pg.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3),($4,$5,$3),($6,$7,$3)',[admin,env.PLATFORM_ADMIN_EMAIL,hash('initial-password'),staff,'staff@example.invalid',viewer,'viewer@example.invalid']);
 await pg.query("INSERT INTO tenants VALUES($1,'friendly','Friendly','active',NULL)",[tenant]);
 await pg.query("INSERT INTO tenant_memberships VALUES($1,$2,'staff'),($1,$3,'viewer')",[tenant,staff,viewer]);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 assert.equal((await req('/admin')).status,401);
 assert.equal((await req('/api/auth/me')).status,401);
 const a=await login(),b=await login(),payload=auth.verifyToken(a.token);
 assert.equal(payload.kind,'dashboard_session');assert.equal(payload.exp-payload.iat,28800);assert.equal(a.session.idleTimeoutSeconds,1800);assert.equal(a.user.isPlatformAdmin,true);
 assert.equal((await req('/admin',a.token)).status,200);assert.equal((await req('/admin',a.token)).cache,'no-store');
 assert.equal((await req('/api/auth/me',a.token)).cache,'no-store');
 assert.equal((await pg.query('SELECT count(*)::int n FROM dashboard_sessions WHERE token_hash=$1',[hash(payload.sid)])).rows[0].n,1);
 assert.notEqual((await pg.query('SELECT token_hash FROM dashboard_sessions LIMIT 1')).rows[0].token_hash,payload.sid,'raw session bearer not stored');
 const staffToken=(await login('staff@example.invalid')).token,viewerToken=(await login('viewer@example.invalid')).token;
 assert.equal((await req('/admin',staffToken)).status,403);assert.equal((await req('/tenant/friendly',staffToken,{})).status,200);assert.equal((await req('/tenant/friendly',viewerToken,{})).status,403);
 const claimed=jwt.sign({...auth.verifyToken(staffToken),isPlatformAdmin:true},env.JWT_SECRET);
 assert.equal((await req('/admin',claimed)).status,403,'signed admin claim cannot override current DB identity');
 for(const invalid of [auth.signToken({userId:admin,isPlatformAdmin:true}),auth.signToken({kind:'tenant_design_share',userId:admin}),jwt.sign({kind:'dashboard_session',userId:admin,sid:payload.sid},'wrong-key'),a.token.slice(0,-8)+'tampered',jwt.sign({kind:'dashboard_session',userId:admin,sid:payload.sid},env.JWT_SECRET,{expiresIn:-1}),jwt.sign({kind:'dashboard_session',userId:admin,sid:payload.sid},env.JWT_SECRET,{algorithm:'HS384'})]){
  assert.equal((await req('/admin',invalid)).status,401);assert.equal((await req('/api/auth/me',invalid)).status,401);
 }
 await pg.query('UPDATE users SET email=$1 WHERE id=$2',['changed@example.invalid',admin]);assert.equal((await req('/admin',a.token)).status,403,'configured admin identity checked on every request');
 await pg.query('UPDATE users SET email=$1 WHERE id=$2',[env.PLATFORM_ADMIN_EMAIL,admin]);
 assert.equal((await req('/api/auth/logout',a.token,{})).status,200);assert.equal((await req('/admin',a.token)).status,401);assert.equal((await req('/admin',b.token)).status,200,'logout only revokes current browser session');
 assert.equal((await req('/api/auth/logout',a.token,{})).status,200,'logout idempotent');
 const idle=await login();await pg.query("UPDATE dashboard_sessions SET last_seen_at=now()-interval '31 minutes' WHERE token_hash=$1",[hash(auth.verifyToken(idle.token).sid)]);assert.equal((await req('/admin',idle.token)).status,401,'server enforces idle timeout');
 const absolute=await login();await pg.query("UPDATE dashboard_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[hash(auth.verifyToken(absolute.token).sid)]);assert.equal((await req('/admin',absolute.token)).status,401,'DB absolute expiration independently enforced');
 const change=await req('/api/auth/change-password',b.token,{currentPassword:'initial-password',newPassword:'changed-password'});assert.equal(change.status,200);assert.equal(change.body.signInRequired,true);assert.equal((await req('/admin',b.token)).status,401);
 await assert.rejects(()=>sessions.createDashboardSession({id:admin,password_hash:hash('initial-password')}),/credentials changed/,'stale password verification cannot mint a new session');
 const fresh=await login(env.PLATFORM_ADMIN_EMAIL,'changed-password');
 assert.equal((await req('/api/auth/change-password',fresh.token,{currentPassword:'changed-password',newPassword:'é'.repeat(37)})).status,400,'bcrypt byte ceiling enforced');
 const reset=crypto.randomBytes(32).toString('hex');await pg.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[admin,hash(reset)]);
 assert.equal((await req('/api/auth/reset-password',null,{token:reset,newPassword:'reset-password-new'})).status,200);assert.equal((await req('/admin',fresh.token)).status,401,'password recovery revokes all existing sessions');
 assert.equal((await req('/api/auth/reset-password',null,{token:reset,newPassword:'another-password'})).status,400,'reset link single use');
 let resetFresh=await login(env.PLATFORM_ADMIN_EMAIL,'reset-password-new');assert.equal((await req('/admin',resetFresh.token)).status,200);
 const share=auth.signToken({kind:'consumer_design_recovery',designId:'event'}, {expiresIn:'180d'});assert.equal(auth.verifyToken(share).kind,'consumer_design_recovery','non-dashboard links unaffected');
 env.PLATFORM_ADMIN_PASSWORD='bootstrap-fixture-password';env.PLATFORM_ADMIN_BOOTSTRAP_RESET='true';
 const bootstrap=load('server/src/bootstrapPlatformAdmin.js',{'./db':db,'./auth':auth,'./dashboardSessions':sessions});
 await bootstrap();assert.equal((await req('/admin',resetFresh.token)).status,401,'bootstrap password replacement revokes existing sessions');
 resetFresh=await login(env.PLATFORM_ADMIN_EMAIL,'bootstrap-fixture-password');
 await pg.query('DELETE FROM users WHERE id=$1',[admin]);assert.equal((await req('/api/auth/me',resetFresh.token)).status,401,'deleting account cascades session revocation');
 console.log('PASS dashboard security: real signed sessions; anonymous/forged/legacy/share-token denial; current admin identity; staff/viewer boundaries; logout; server idle/absolute expiry; password-change/reset revocation; byte limit; customer recovery compatibility. Isolated database only.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{server?.close();await pg.close()});
