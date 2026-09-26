const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
(async()=>{
  const context=vm.createContext({console,setTimeout,clearTimeout});
  const cache=new Map();
  function moduleFor(file){
    if(cache.has(file))return cache.get(file);
    const module=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,module);return module;
  }
  const mod=moduleFor(path.join(root,'js/ui/venue-photo.js'));
  await mod.link((specifier,referencingModule)=>{
    assert.ok(specifier.startsWith('.'),'photo routing uses local production modules');
    return moduleFor(path.resolve(path.dirname(referencingModule.identifier),specifier));
  });
  await mod.evaluate();
  const route=mod.namespace.venuePhotoRoutes;
  let r=route({api:'https://api.test/',slug:'generic',designId:'abc 123'});
  assert.equal(r.upload,'https://api.test/api/consumer/designs/abc%20123/background-photo');
  assert.equal(r.remove('photo/1'),'https://api.test/api/consumer/designs/abc%20123/background-photo/photo%2F1');
  r=route({api:'https://api.test',slug:'friendly',designId:'tenant-design'});
  assert.equal(r.upload,'https://api.test/api/tenants/friendly/designs/tenant-design/background-photo');
  assert.equal(r.remove('p1'),'https://api.test/api/tenants/friendly/designs/tenant-design/background-photo/p1');
  assert.equal(route({api:'',slug:'generic',designId:'x'}),null);
  const normalized=mod.namespace.normalizeVenueScan({metric:true,accuracy:'validated',validation:{status:'valid'}},'https://api.test');
  assert.equal(normalized.accuracy,'unverified');assert.equal(normalized.validation,undefined,'linked validation code does not trust saved verdict flags');
  console.log('PASS venue photo routing: generic/Event Pass uses /api/consumer; tenant designs use /api/tenants/:slug.');
})().catch(e=>{console.error(e);process.exitCode=1;});
