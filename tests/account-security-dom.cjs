// Actual account UI + cookie-session manager, with isolated API responses.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'dashboard/account.html'),'utf8');
const SECRET='JBSWY3DPEHPK3PXP',PASSWORD='isolated-account-password',CODES=Array.from({length:10},(_,i)=>'abcd1234-abcd1234-abcd1234-'+String(i).padStart(8,'0'));
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
async function harness(options={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/Not implemented: navigation/.test(e.message))errors.push(e.message);});
 const dom=new JSDOM(html,{url:'https://rentsketch.com/dashboard/account.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
 w.Headers=Headers;const calls=[],clipboard=[],downloads=[],storageWrites=[],blobs=[];
 let serverSession={id:'session-current',csrfToken:'isolated-csrf',expiresAt:'2099-01-01T00:00:00.000Z'},enabled=!!options.enabled;
 let sessions=[{id:'session-current',current:true,createdAt:'2026-09-26T00:00:00Z',lastSeenAt:'2026-09-26T00:30:00Z'},{id:'session-other',current:false,createdAt:'2026-09-25T22:00:00Z',lastSeenAt:'2026-09-26T00:00:00Z'}];
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{clipboard.push(text);}}});
 const realSet=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(key,value){storageWrites.push([key,String(value)]);return realSet.call(this,key,value);};
 w.URL.createObjectURL=blob=>{blobs.push(blob);return'blob:isolated-recovery-download';};w.URL.revokeObjectURL=()=>{};
 const anchorClick=w.HTMLAnchorElement.prototype.click;w.HTMLAnchorElement.prototype.click=function(){if(this.download)downloads.push({href:this.href,name:this.download});else anchorClick.call(this);};
 w.fetch=async(url,opts={})=>{
  const headers=Object.fromEntries(new Headers(opts.headers||{})),method=opts.method||'GET',p=String(url).replace(/^\/staff-api/,'');
  const body=typeof opts.body==='string'?JSON.parse(opts.body):opts.body;
  const call={url,path:p,method,headers,body};calls.push(call);
  assert.ok(String(url).startsWith('/staff-api/api/'));assert.equal(opts.credentials,'same-origin');assert.equal(headers['x-rentsketch-client'],'dashboard');assert.equal(headers.authorization,undefined);
  if(p==='/api/auth/me')return serverSession?response({session:serverSession,user:{id:'user-1'}}):response({error:'Sign in required'},401);
  if(!serverSession)return response({error:'Sign in required'},401);
  if(method!=='GET')assert.equal(headers['x-rentsketch-csrf'],'isolated-csrf');
  if(options.respond){const result=await options.respond(call);if(result!==undefined)return result;}
  if(p==='/api/auth/security')return response({mfa:{enabled,recoveryCodesRemaining:enabled?10:0}});
  if(p==='/api/auth/sessions'&&method==='GET')return response({sessions});
  if(p==='/api/auth/sessions/revoke-others'){sessions=sessions.filter(s=>s.current);return response({ok:true});}
  if(p.startsWith('/api/auth/sessions/')&&method==='DELETE'){const id=p.split('/').at(-1),current=id==='session-current';sessions=sessions.filter(s=>s.id!==id);if(current)serverSession=null;return response({ok:true,current});}
  if(p==='/api/auth/logout'){serverSession=null;return response({ok:true});}
  if(p==='/api/auth/security/mfa/enroll'){assert.equal(body.currentPassword,PASSWORD);return response({secret:SECRET,otpauthUri:'otpauth://totp/RentSketch:test%40example.invalid?secret='+SECRET+'&issuer=RentSketch'});}
  if(['/api/auth/security/mfa/confirm','/api/auth/security/mfa/recovery-codes','/api/auth/security/mfa/disable'].includes(p)){
   assert.equal(body.currentPassword,PASSWORD);assert.ok(body.code);enabled=!p.endsWith('/disable');serverSession=null;
   return response(enabled?{ok:true,recoveryCodes:CODES}:{ok:true});
  }
  throw new Error('Unexpected account fixture '+method+' '+p);
 };
 for(const file of ['js/ui/dashboard-session.js','dashboard/account.js','dashboard/security.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 await flush();
 const click=id=>d.getElementById(id).click(),submit=()=>d.getElementById('mfa-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 return{w,d,dom,calls,clipboard,downloads,blobs,storageWrites,errors,click,submit,session:w.RentSketchDashboardSession,
  close(){w.close();},logout(){serverSession=null;w.dispatchEvent(new w.StorageEvent('storage',{key:'rentsketch_dashboard_event',newValue:JSON.stringify({kind:'signed-out',id:'session-current',at:Date.now()})}));},
  async enroll(){click('mfa-enable');d.getElementById('mfa-password').value=PASSWORD;submit();await flush();},
  async confirm(){d.getElementById('mfa-code').value='123456';submit();await flush();}
 };
}
function noSecrets(t){
 assert.equal(t.d.getElementById('mfa-password').value,'');assert.equal(t.d.getElementById('mfa-secret').value,'');assert.equal(t.d.getElementById('mfa-code').value,'');
 assert.equal(t.d.getElementById('mfa-recovery-codes').textContent,'');assert.equal(t.d.getElementById('mfa-open-app').hasAttribute('href'),false);
 assert.equal(t.d.getElementById('mfa-setup').hidden,true);assert.equal(t.d.getElementById('mfa-recovery').hidden,true);
}
function noStoredSecrets(t){
 const values=t.storageWrites.map(([,v])=>v);for(const storage of [t.w.localStorage,t.w.sessionStorage])for(let i=0;i<storage.length;i++)values.push(storage.getItem(storage.key(i)));
 for(const value of values)for(const secret of [SECRET,PASSWORD,'isolated-csrf',...CODES])assert.ok(!value.includes(secret),'security material never enters web storage');
}

test('enrollment uses password, manual authenticator key and confirmation; recovery survives only its own session clear',async()=>{
 const t=await harness();try{
  assert.equal(t.d.getElementById('mfa-badge').textContent,'Off');assert.equal(t.d.querySelectorAll('.session-row').length,2);
  await t.enroll();assert.equal(t.d.getElementById('mfa-secret').value,SECRET);assert.match(t.d.getElementById('mfa-open-app').href,/^otpauth:\/\/totp\//);assert.equal(t.d.getElementById('mfa-code').required,true);
  t.click('mfa-copy-secret');await flush();assert.equal(t.clipboard.at(-1),SECRET);assert.equal(t.d.getElementById('mfa-copy-secret').textContent,'Copied');
  await t.confirm();assert.equal(t.session.identity(),'');assert.equal(t.d.getElementById('mfa-recovery').hidden,false);assert.equal(t.d.getElementById('mfa-recovery-codes').textContent,CODES.join('\n'));
  assert.equal(t.d.getElementById('mfa-secret').value,'');assert.equal(t.d.getElementById('mfa-password').value,'');assert.equal(t.d.getElementById('save').disabled,true);assert.equal(t.d.querySelectorAll('.session-row').length,0);
  t.click('mfa-copy-codes');await flush();assert.equal(t.clipboard.at(-1),CODES.join('\n'));
  t.click('mfa-download-codes');assert.equal(t.downloads.at(-1).name,'rentsketch-recovery-codes.txt');assert.equal(t.blobs.at(-1).type,'text/plain;charset=utf-8');
  const downloaded=await new Promise((resolve,reject)=>{const reader=new t.w.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(t.blobs.at(-1));});assert.ok(downloaded.includes(CODES.join('\n')),'download contains all one-time codes');
  noStoredSecrets(t);t.click('mfa-finish');noSecrets(t);assert.deepEqual(t.errors,[]);
 }finally{t.close();}
});

test('cancel, cross-tab logout and pagehide clear setup and one-time recovery material',async()=>{
 for(const action of ['cancel','logout','pagehide']){
  const t=await harness();try{await t.enroll();if(action==='cancel')t.click('mfa-cancel');else if(action==='logout')t.logout();else t.w.dispatchEvent(new t.w.Event('pagehide'));noSecrets(t);noStoredSecrets(t);}finally{t.close();}
 }
 for(const action of ['logout','pagehide']){
  const t=await harness();try{await t.enroll();await t.confirm();if(action==='logout')t.w.dispatchEvent(new t.w.CustomEvent('rentsketch:dashboardSessionChanged',{detail:{reason:'signed-out'}}));else t.w.dispatchEvent(new t.w.Event('pagehide'));noSecrets(t);}finally{t.close();}
 }
});

test('setup and confirmation responses finishing after logout or pagehide cannot reveal secrets',async()=>{
 for(const step of ['enroll','confirm'])for(const end of ['logout','pagehide']){
  const gate=deferred(),t=await harness({respond:c=>c.path==='/api/auth/security/mfa/'+step?response(gate.promise):undefined});
  try{
   if(step==='confirm')await t.enroll();else{t.click('mfa-enable');t.d.getElementById('mfa-password').value=PASSWORD;}
   t.d.getElementById('mfa-code').value='123456';t.submit();await flush();
   if(end==='logout')t.logout();else t.w.dispatchEvent(new t.w.Event('pagehide'));
   gate.resolve(step==='enroll'?{secret:SECRET,otpauthUri:'otpauth://totp/RentSketch?secret='+SECRET}:{ok:true,recoveryCodes:CODES});await flush();
   noSecrets(t);noStoredSecrets(t);assert.deepEqual(t.errors,[]);
  }finally{gate.resolve({});t.close();}
 }
});

test('current and other sessions can be revoked without confusing account scope',async()=>{
 let t=await harness();try{
  const rows=t.d.querySelectorAll('.session-row');assert.match(rows[0].textContent,/This session/);assert.doesNotMatch(rows[1].textContent,/This session/);
  rows[1].querySelector('button').click();await flush();assert.equal(t.d.querySelectorAll('.session-row').length,1);assert.equal(t.session.identity(),'session-current');assert.ok(t.calls.some(c=>c.method==='DELETE'&&c.path==='/api/auth/sessions/session-other'));
  t.d.querySelector('.session-row button').click();await flush();assert.equal(t.session.identity(),'');assert.equal(t.d.querySelectorAll('.session-row').length,0);assert.equal(t.d.getElementById('sessions-refresh').disabled,true);noSecrets(t);
 }finally{t.close();}
 t=await harness();try{t.click('sessions-signout-others');await flush();assert.equal(t.d.querySelectorAll('.session-row').length,1);assert.equal(t.session.identity(),'session-current');assert.equal(t.d.getElementById('sessions-signout-others').hidden,true);}finally{t.close();}
});

test('replacement codes and disabling verification require password plus current code and end the session',async()=>{
 for(const mode of ['recovery-codes','disable']){
  const t=await harness({enabled:true});try{
   t.click(mode==='disable'?'mfa-disable':'mfa-replace-codes');assert.equal(t.d.getElementById('mfa-code').required,true);
   t.d.getElementById('mfa-password').value=PASSWORD;t.d.getElementById('mfa-code').value=CODES[0];t.submit();await flush();
   assert.equal(t.session.identity(),'');assert.equal(t.d.getElementById('mfa-recovery').hidden,mode==='disable');assert.equal(t.d.getElementById('mfa-badge').textContent,mode==='disable'?'Off':'On');noStoredSecrets(t);
  }finally{t.close();}
 }
});
