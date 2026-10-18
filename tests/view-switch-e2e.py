#!/usr/bin/env python3
"""Real, cached widget runtime switches views without navigating its iframe."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from collections import Counter
import json,threading,statistics
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/playwright/view-switch';OUT.mkdir(parents=True,exist_ok=True)
catalog=json.loads((ROOT/'dist/index.json').read_text(encoding='utf-8'));version=json.loads((ROOT/'package.json').read_text())['version']
requests=Counter();checks=[];timings=[];cache_after_reload={};cache_after_tab={}
class Cached(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):requests[self.path.split('?')[0]]+=1;super().do_GET()
 def end_headers(self):self.send_header('Cache-Control','public, max-age=3600, immutable');super().end_headers()
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Cached,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
def check(name,ok):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
def start(page,m,theme,size):
 return page.evaluate('''({url,title,theme,size})=>new Promise(resolve=>{
  document.body.replaceChildren();window.saved='null';window.revision='null';window.pendingViews=new Map();window.viewId=0;window.loads=0;
  window.env={mode:'card',theme,size,locale:'zh-CN',width:180,height:180,settings:{theme,gridSize:60,gap:30,radius:20,showSeconds:true,hour12:false}};
  const f=document.createElement('iframe');f.sandbox='allow-scripts allow-forms allow-downloads';f.setAttribute('credentialless','');f.style.cssText='width:180px;height:180px;border:0';
  const started=performance.now();f.onload=()=>{window.loads++;const channel=new MessageChannel();window.port=channel.port1;
   port.onmessage=({data:m})=>{
    if(m.type==='ready'){window.features=m.features;resolve(performance.now()-started);}
    if(m.type==='view-ready'){const j=pendingViews.get(m.id);pendingViews.delete(m.id);m.error?j.reject(Error(m.error)):j.resolve(performance.now()-j.started);}
    if(m.type==='call'){let value=true;if(m.method==='save'){if(m.params.expected!==revision){port.postMessage({type:'result',id:m.id,error:'Conflict'});return;}window.saved=window.revision=JSON.stringify(m.params.value);value={value:saved,revision};}port.postMessage({type:'result',id:m.id,value});}
   };
   f.contentWindow.postMessage({type:'qiye:init',version:2,value:'null',revision:'null',storage:{},item:{id:'test',title,size},environment:env},'*',[channel.port2]);
  };f.src=url;document.body.append(f);
 })''',dict(url=base+f'/releases/{version}/widget.html?widget='+m['id'].split('.')[1],title=m['name'],theme=theme,size=size))
def view(page,mode,width=960,height=640):
 elapsed=page.evaluate('''({mode,width,height})=>new Promise((resolve,reject)=>{
  const f=document.querySelector('iframe');f.style.width=width+'px';f.style.height=height+'px';env={...env,mode,width,height};
  const id=String(++viewId);pendingViews.set(id,{resolve,reject,started:performance.now()});port.postMessage({type:'view',id,environment:env});
 })''',dict(mode=mode,width=width,height=height));timings.append(elapsed)
 return page.frame_locator('iframe')
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch();context=browser.new_context(viewport={'width':1100,'height':800},locale='zh-CN',timezone_id='Asia/Hong_Kong');page=context.new_page();page.set_default_timeout(10000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+'/index.html')
  for m in catalog['widgets']:
   kind=m['id'].split('.')[1]
   for theme in ['dark','light']:
    initial_ms=start(page,m,theme,'2x2');before=dict(requests);f=view(page,'window')
    assert f.locator('body').get_attribute('class')=='embedded-window'
    assert f.locator('#widget-root').inner_html()
    if kind=='pomodoro':
     f.locator('[data-pomo-action=toggle]').click();page.wait_for_function('JSON.parse(saved)?.data?.status==="running"');end=page.evaluate('JSON.parse(saved).data.endAt')
     view(page,'card',180,180);f=view(page,'window');assert page.evaluate('JSON.parse(saved).data.endAt')==end
    if kind=='habit':
     f.locator('[data-habit-suggestion="阅读"]').click();f.locator('.habit-tracker-row').wait_for();view(page,'card',180,180);f=view(page,'window');assert '阅读' in f.locator('.habit-tracker-row').inner_text()
    if kind=='codec':
     f.locator('#codec-input').fill('hello');page.wait_for_timeout(180);assert f.locator('#codec-output').input_value()=='aGVsbG8='
     view(page,'card',180,180);f=view(page,'window');assert f.locator('#codec-input').input_value()==''
    view(page,'card',180,180);f=view(page,'window',360,640);assert f.locator('#widget-root').is_visible();view(page,'card',180,180)
    check(f'{kind}/{theme}: wide/narrow windows return to the same card without loading',page.evaluate('loads===1 && features.includes("view-switch")') and dict(requests)==before and f.locator('body').get_attribute('class')=='embedded-card')
   if kind=='pomodoro':
    for size,w,h in [('1x1',60,60),('2x1',150,60),('2x2',150,150),('4x2',330,150),('4x4',330,330)]:
     start(page,m,'dark',size);view(page,'window');f=view(page,'card',w,h);check('Return restores card size '+size,f.locator('#widget-root').get_attribute('data-size')==size)
  for asset in ['runtime.js','styles.css']:
   check(asset+' transfers once in this page',requests[f'/releases/{version}/{asset}']==1)
  # Measure HTTP cache behavior separately from isolated storage. Browsers
  # may retain public HTTP responses across reloads; that is not an installed
  # offline package, and a new context/server cache policy can change it.
  page.reload();start(page,catalog['widgets'][0],'dark','2x2')
  cache_after_reload={name:requests[f'/releases/{version}/{name}'] for name in ['runtime.js','styles.css']};print('CACHE transfers after reload',cache_after_reload,flush=True)
  second=page.context.new_page();second.goto(base+'/index.html');start(second,catalog['widgets'][0],'dark','2x2');cache_after_tab={name:requests[f'/releases/{version}/{name}'] for name in ['runtime.js','styles.css']};print('CACHE transfers after same-context tab',cache_after_tab,flush=True);second.close()
  check('No runtime errors',not errors);browser.close()
finally:
 server.shutdown();(OUT/'report.json').write_text(json.dumps({'checks':checks,'switch_ms':timings,'median_ms':statistics.median(timings) if timings else None,'cache_after_reload':cache_after_reload,'cache_after_tab':cache_after_tab},ensure_ascii=False,indent=2),encoding='utf-8')
