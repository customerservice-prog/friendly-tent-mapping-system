// Exercise the real POST/PATCH handlers against an isolated in-memory DB adapter.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const handlers={},writes=[],router={post:(p,f)=>handlers.post=f,patch:(p,f)=>handlers.patch=f,get(){}};
const db={query:async(sql,args)=>{if(sql.startsWith('SELECT id,slug FROM tenants'))return{rows:[{id:'tenant-fixture'}]};if(sql.startsWith('SELECT * FROM designs'))return{rows:[{id:'design-fixture'}]};writes.push({sql,args});return{rows:[{id:'design-fixture'}]};}};
const context={Buffer,console,module:{exports:{}},require:name=>name==='express'?{Router:()=>router}:name==='../db'?db:name==='../eventPassAccess'?{savePermission:async()=>null}:name.includes('requireAuth')?{requireTenantAccess(){}}:(()=>{throw Error('Unexpected dependency '+name);})()};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server/src/routes/designs.js'),'utf8'),context);
async function request(method,scene,session='test-session'){let status=200,body;const res={status(n){status=n;return this;},json(v){body=v;return this;}};await handlers[method]({params:{slug:'test-company',id:'design-fixture'},headers:{},socket:{remoteAddress:'127.0.0.1'},body:{scene,anonymousSessionId:session}},res);return{status,body};}
(async()=>{
 const scene={tentId:null,siteWidthFt:40,siteLengthFt:50,objects:[{id:'slide1',kind:'inflatable',inflatableId:'test-slide',x:8,y:8,widthFt:16,depthFt:32}],zones:[],aisles:[]};
 assert.equal((await request('post',scene)).status,201);assert.equal(writes[0].args[5].tentId,null);
 assert.equal((await request('patch',scene)).status,200);assert.equal(writes[1].args[3].objects[0].kind,'inflatable');
 assert.equal((await request('post',{...scene,tentId:{}})).status,400);assert.equal((await request('post',{...scene,objects:Array(501).fill({})})).status,400);assert.equal((await request('patch',scene,null)).status,400);assert.equal(writes.length,2);
 console.log('PASS outdoor designs create/update with null tentId; invalid types, oversized layouts and missing session still rejected. No external DB calls.');
})().catch(e=>{console.error(e);process.exitCode=1;});
