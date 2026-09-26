# Real Caddy routing/security regression. Uses only a loopback fixture API.
import threading,http.server,socketserver,tempfile,pathlib,subprocess,http.client,time,json,os
root=pathlib.Path(__file__).resolve().parent.parent; observed=[]
binary=os.environ.get('RENTSKETCH_CADDY','caddy')
class Upstream(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):self.answer()
 def do_POST(self):self.answer()
 def answer(self):
  observed.append({'path':self.path,'method':self.command,'headers':dict(self.headers),'body':self.rfile.read(int(self.headers.get('Content-Length','0'))).decode()})
  self.send_response(401 if self.path.startswith('/api/auth/me') else 200)
  self.send_header('Content-Type','application/json');self.send_header('Set-Cookie','__Host-rentsketch_dashboard=fixture; HttpOnly; Secure; SameSite=Strict; Path=/');self.end_headers();self.wfile.write(b'{"fixture":true}')
server=socketserver.TCPServer(('127.0.0.1',0),Upstream);threading.Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory(prefix='rs-proxy-check-') as tmp:
 tmp=pathlib.Path(tmp);text=(root/'Caddyfile').read_text().replace(':{$PORT:8080} {','http://127.0.0.1:47862 {').replace('root * /app','root * '+str(root)).replace('https://rentsketch-api-production.up.railway.app {','http://127.0.0.1:'+str(server.server_address[1])+' {').replace('tls_server_name rentsketch-api-production.up.railway.app','')
 conf=tmp/'Caddyfile';conf.write_text(text);log=(tmp/'caddy.log').open('w+');key='a'*64;forged='forged-key-must-not-be-logged'
 p=subprocess.Popen([binary,'run','--config',str(conf),'--adapter','caddyfile'],env={**os.environ,'DASHBOARD_PROXY_KEY':key},stdout=log,stderr=log)
 def req(path,method='GET',body=None,headers={}):
  c=http.client.HTTPConnection('127.0.0.1',47862,timeout=5);c.request(method,path,body,headers);r=c.getresponse();result=(r.status,dict(r.getheaders()),r.read().decode());c.close();return result
 try:
  for i in range(30):
   try:req('/health');break
   except ConnectionError:time.sleep(.1)
  status,headers,body=req('/staff-api/api/auth/login','POST','{"email":"fixture@example.test"}',{'Content-Type':'application/json','Origin':'https://rentsketch.com','X-RentSketch-Client':'dashboard','X-Real-IP':'198.51.100.44','X-RentSketch-Proxy-Key':forged,'X-RentSketch-Client-IP':'203.0.113.99','X-RentSketch-CSRF':'secret-csrf-not-for-logs'})
  assert status==200 and observed[-1]['path']=='/api/auth/login' and observed[-1]['method']=='POST'
  assert observed[-1]['headers']['X-Rentsketch-Proxy-Key']==key
  assert observed[-1]['headers']['X-Rentsketch-Client-Ip']=='198.51.100.44'
  assert observed[-1]['headers']['Origin']=='https://rentsketch.com'
  assert observed[-1]['body']=='{"email":"fixture@example.test"}'
  assert all(flag in headers.get('Set-Cookie','') for flag in ['HttpOnly','Secure','SameSite=Strict','Path=/'])
  status,headers,body=req('/staff-api/api/auth/me?check=one',headers={'Cookie':'__Host-rentsketch_dashboard=fixture'})
  assert status==401 and observed[-1]['path']=='/api/auth/me?check=one'
  assert observed[-1]['headers']['Cookie']=='__Host-rentsketch_dashboard=fixture'
  for path in ['/staff-api','/staff-api/','/staff-api/server/src/auth.js','/staff-api/api/../../server/src/auth.js','/staff-api/api/%2e%2e/%2e%2e/server/src/auth.js']:
   status,headers,body=req(path);assert status==404,(path,status,body[:80]);assert 'JWT_SECRET' not in body
  status,headers,body=req('/dashboard/account.html');assert status==200 and headers.get('X-Frame-Options')=='DENY' and headers.get('Cache-Control')=='no-store'
  print('PASS Caddy staff proxy: method/body/query/cookie preserved, strict cookie passes, auth401 retained, headers overwritten, reserved paths+traversal404, dashboardCSP/no-store retained.')
 finally:p.terminate();p.wait(timeout=5);server.shutdown();log.seek(0);output=log.read();log.close()
 assert key not in output and forged not in output and 'secret-csrf-not-for-logs' not in output,'sensitive proxy headers leaked into access logs'
 print('PASS Caddy access logs redact custom proxy key and CSRF headers.')
