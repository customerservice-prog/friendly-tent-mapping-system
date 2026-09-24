const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
(async()=>{
  const source=fs.readFileSync(path.join(root,'js/ui/venue-photo.js'),'utf8');
  const context=vm.createContext({console,setTimeout,clearTimeout});
  const mod=new vm.SourceTextModule(source,{context,identifier:'venue-photo.js'});
  await mod.link(()=>{throw new Error('venue-photo.js should not import dependencies');});
  await mod.evaluate();
  const route=mod.namespace.venuePhotoRoutes;
  let r=route({api:'https://api.test/',slug:'generic',designId:'abc 123'});
  assert.equal(r.upload,'https://api.test/api/consumer/designs/abc%20123/background-photo');
  assert.equal(r.remove('photo/1'),'https://api.test/api/consumer/designs/abc%20123/background-photo/photo%2F1');
  r=route({api:'https://api.test',slug:'friendly',designId:'tenant-design'});
  assert.equal(r.upload,'https://api.test/api/tenants/friendly/designs/tenant-design/background-photo');
  assert.equal(r.remove('p1'),'https://api.test/api/tenants/friendly/designs/tenant-design/background-photo/p1');
  assert.equal(route({api:'',slug:'generic',designId:'x'}),null);
  console.log('PASS venue photo routing: generic/Event Pass uses /api/consumer; tenant designs use /api/tenants/:slug.');
})().catch(e=>{console.error(e);process.exitCode=1;});
