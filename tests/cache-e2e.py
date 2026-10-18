#!/usr/bin/env python3
"""Verify real HTTP cache reuse across opaque, credentialless widget frames."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from collections import Counter
import json,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
version=json.loads((ROOT/'package.json').read_text())['version'];requests=Counter()
class Cached(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  requests[self.path.split('?')[0]]+=1
  super().do_GET()
 def end_headers(self):
  if '/releases/' in self.path:self.send_header('Cache-Control','public, max-age=3600, immutable')
  super().end_headers()
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Cached,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch();page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base+'/index.html')
  # No Playwright request routing: it disables the browser HTTP cache.
  for kind,mode,size in [('notes','card','2x2'),('notes','window','2x2'),('calendar','card','4x2'),('calendar','window','2x2')]:
   elapsed=page.evaluate("""({url,kind,mode,size})=>new Promise((resolve,reject)=>{
    const started=performance.now(),timeout=setTimeout(()=>reject(new Error('Widget ready timed out')),15000);
    document.body.replaceChildren();const iframe=document.createElement('iframe');
    iframe.sandbox='allow-scripts allow-forms allow-downloads';iframe.setAttribute('credentialless','');iframe.style.cssText='width:750px;height:500px;border:0';
    iframe.onload=()=>{const channel=new MessageChannel();channel.port1.onmessage=event=>{
     const m=event.data;if(m.type==='ready'){clearTimeout(timeout);resolve(performance.now()-started);}
     if(m.type==='call')channel.port1.postMessage({type:'result',id:m.id,value:true});
    };iframe.contentWindow.postMessage({type:'qiye:init',version:2,value:'null',revision:'null',storage:{},item:{id:'cache-test',title:kind,size},environment:{mode,theme:'dark',size,locale:'zh-CN',width:750,height:500,settings:{theme:'dark',gridSize:60,gap:30}}},'*',[channel.port2]);};
    iframe.src=url;document.body.append(iframe);
   })""",{'url':base+'/releases/'+version+'/widget.html?widget='+kind,'kind':kind,'mode':mode,'size':size})
   assert page.frame_locator('iframe').locator('#widget-root').inner_html()
   print(f'PASS {kind} {mode} ready in {elapsed:.0f} ms',flush=True)
  for name in ['runtime.js','styles.css']:
   count=requests['/releases/'+version+'/'+name]
   assert count==1,(name,'expected one HTTP transfer across four frames',count,dict(requests))
   print('PASS',name,'transferred once across four credentialless frames',flush=True)
  assert not errors,errors
  browser.close()
finally:server.shutdown()
