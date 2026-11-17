from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import json, secrets, time, threading, os, re
from urllib.parse import urlparse, parse_qs

rooms={}; lock=threading.Lock(); ROOT=os.path.dirname(os.path.abspath(__file__))
class Handler(BaseHTTPRequestHandler):
 def respond(self,code,obj):
  b=json.dumps(obj).encode();self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(b)
 def do_GET(self):
  u=urlparse(self.path)
  if u.path=='/api/state':
   room=parse_qs(u.query).get('room',[''])[0].upper()
   with lock:
    r=rooms.get(room)
    if not r:return self.respond(404,{'error':'Room not found. Ask the host for a new link.'})
    return self.respond(200,{'status':r['status'],'round':r['round'],'buzzes':r['buzzes'],'participants':list(r['participants'].values())})
  if u.path in ('/', '/index.html', '/studio', '/studio/', '/studio/index.html', '/studio/app.js', '/studio/styles.css', '/studio/theme.css', '/studio/integration.js'):
   name = 'index.html' if u.path in ('/', '/index.html', '/studio', '/studio/', '/studio/index.html') else u.path.rsplit('/',1)[-1]
   b=open(os.path.join(ROOT,'..',name),'rb').read();self.send_response(200);self.send_header('Content-Type', {'index.html':'text/html; charset=utf-8','app.js':'text/javascript; charset=utf-8','styles.css':'text/css; charset=utf-8','theme.css':'text/css; charset=utf-8','integration.js':'text/javascript; charset=utf-8'}[name]);self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(b);return
  if u.path in ('/buzzer', '/buzzer/', '/buzzer/index.html'):
   b=open(os.path.join(ROOT,'index.html'),'rb').read();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(b);return
  self.send_error(404)
 def do_POST(self):
  try:
   n=int(self.headers.get('Content-Length','0'))
   if n>8192: return self.respond(413,{'error':'Request too large'})
   x=json.loads(self.rfile.read(n)); action=urlparse(self.path).path
   with lock:
    if action=='/api/create':
     code=secrets.token_hex(3).upper()
     while code in rooms:code=secrets.token_hex(3).upper()
     token=secrets.token_urlsafe(32);rooms[code]={'host':token,'status':'locked','round':0,'buzzes':[],'seen':set(),'opened':None,'participants':{}};return self.respond(200,{'room':code,'host':token})
    r=rooms.get(str(x.get('room','')).upper())
    if not r:return self.respond(404,{'error':'Room not found. Ask the host for a new link.'})
    if action=='/api/join':
     name=str(x.get('name','')).strip();guest=str(x.get('guest',''))
     if not name or len(name)>40 or not re.fullmatch(r'[a-zA-Z0-9-]{16,100}',guest):return self.respond(400,{'error':'Enter a valid name (up to 40 characters).'})
     if any(v.casefold()==name.casefold() for k,v in r['participants'].items() if k!=guest):return self.respond(409,{'error':'Name already in use. Add your initial.'})
     if len(r['participants'])>=500 and guest not in r['participants']:return self.respond(409,{'error':'Room is full.'})
     r['participants'][guest]=name;return self.respond(200,{'ok':True})
    if action=='/api/buzz':
     name=str(x.get('name','')).strip();guest=str(x.get('guest',''))
     if not name or len(name)>40 or not re.fullmatch(r'[a-zA-Z0-9-]{16,100}',guest):return self.respond(400,{'error':'Enter a name (up to 40 characters).'})
     if r['participants'].get(guest)!=name:return self.respond(409,{'error':'Please join the room first.'})
     if r['status']!='open':return self.respond(409,{'error':'Buzzers are not open.'})
     if guest in r['seen']:return self.respond(409,{'error':'You have already buzzed this round.'})
     if any(b['name'].casefold()==name.casefold() for b in r['buzzes']):return self.respond(409,{'error':'That name already buzzed. Add your initial to make it unique.'})
     if len(r['buzzes'])>=500:return self.respond(409,{'error':'Round is full.'})
     elapsed=round((time.monotonic()-r['opened'])*1000);r['seen'].add(guest);b={'name':name,'rank':len(r['buzzes'])+1,'ms':elapsed};r['buzzes'].append(b);return self.respond(200,b)
    if not secrets.compare_digest(str(x.get('host','')),r['host']):return self.respond(403,{'error':'Host permission required.'})
    if action=='/api/open':
     if r['status']!='open':
      if r['buzzes']:return self.respond(409,{'error':'Reset before starting a new round.'})
      r['status']='open';r['round']+=1;r['opened']=time.monotonic()
    elif action=='/api/lock':r['status']='locked'
    elif action=='/api/reset':r['status']='locked';r['buzzes']=[];r['seen']=set();r['opened']=None
    else:return self.respond(404,{'error':'Unknown action'})
    return self.respond(200,{'ok':True})
  except (ValueError,TypeError,json.JSONDecodeError):return self.respond(400,{'error':'Invalid request'})
 def log_message(self,*args):pass
if __name__=='__main__':ThreadingHTTPServer(('0.0.0.0',int(os.environ.get('PORT','8080'))),Handler).serve_forever()
