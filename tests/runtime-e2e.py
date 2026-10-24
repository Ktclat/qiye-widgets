#!/usr/bin/env python3
"""Independent sandbox runtime smoke tests for every widget, size and theme."""
from pathlib import Path
import json,threading,os
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/playwright';OUT.mkdir(parents=True,exist_ok=True)
catalog=json.loads((ROOT/'dist/index.json').read_text(encoding='utf-8'))
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as pw:
 browser=pw.chromium.launch(args=['--no-sandbox']);page=browser.new_page(viewport={'width':1200,'height':850},locale='zh-CN',timezone_id='Asia/Hong_Kong');page.set_default_timeout(10000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://**/*',lambda r:r.fulfill(status=200,content_type='application/json',body='{}',headers={'Access-Control-Allow-Origin':'*'}))
 settings={'theme':'dark','themeColor':'#79d7b4','useThemeColor':False,'surfaceOpacity':72,'gridSize':60,'gap':30,'radius':18,'showSeconds':True,'hour12':False}
 for m in catalog['widgets']:
  kind=m['id'].split('.')[1]
  for mode in ['card','window']:
   for theme in ['dark','light']:
    sizes=m['sizes'] if mode=='card' else ['2x2']
    for size in sizes:
     w,h=map(int,size.split('x'));width=w*60+(w-1)*30 if mode=='card' else 1000;height=h*60+(h-1)*30 if mode=='card' else 700
     page.goto(base+'/index.html')
     page.evaluate("""({url,width,height,kind,size,mode,theme,settings})=>{
      document.body.replaceChildren();window.ready=false;window.calls=[];window.earlyCalls=[];const iframe=document.createElement('iframe');iframe.sandbox='allow-scripts allow-forms allow-downloads';iframe.style.cssText=`border:0;width:${width}px;height:${height}px`;iframe.src=url;
      iframe.addEventListener('load',()=>{const channel=new MessageChannel();window.port=channel.port1;let revision=kind==='hotsearch'?JSON.stringify({config:{subscriptions:['zhihu','weibo'],activeSource:'zhihu',layout:'list',enabled:true,apiBase:'https://uapis.cn'},data:{}}):'null';port.onmessage=event=>{const m=event.data;if(m.type==='ready'){window.ready=true;return;}if(m.type==='call'){if(!window.ready){earlyCalls.push(m.method);return;}calls.push(m);let value=true;if(m.method==='hotboard')value={code:200,list:[{index:1,title:'首次加载榜单',url:'https://example.com/news',hot_value:1200}]};if(m.method==='save'){if(m.params.expected!==revision){port.postMessage({type:'result',id:m.id,error:'Conflict'});return;}revision=JSON.stringify(m.params.value);value={value:revision,revision};}port.postMessage({type:'result',id:m.id,value});}};iframe.contentWindow.postMessage({type:'qiye:init',version:2,value:revision,revision,storage:{},item:{id:'test',title:kind,size},environment:{mode,theme,size,locale:'zh-CN',width,height,hostFeatures:['hotboard'],settings:{...settings,theme}}},'*',[channel.port2]);});document.body.append(iframe);
     }""",{'url':base+'/releases/'+m['release']+'/widget.html?widget='+kind,'width':width,'height':height,'kind':kind,'size':size,'mode':mode,'theme':theme,'settings':settings})
     try:page.wait_for_function('window.ready')
     except Exception:
      print('FAILED',kind,mode,theme,size,errors,flush=True);print(page.frames[-1].locator('body').inner_text(),flush=True);raise
     frame=page.frame_locator('iframe');assert frame.locator('#widget-root').inner_html()
     assert page.evaluate('earlyCalls')==[],(kind,mode,size,'Host calls before ready',page.evaluate('earlyCalls'))
     if kind=='hotsearch' and (mode=='window' or size in ['2x2','4x2']):
      frame.locator('.hotsearch-title').first.wait_for()
      assert frame.locator('.hotsearch-title').first.inner_text()=='首次加载榜单'
     assert not errors,(kind,mode,size,errors)
     if mode=='card':
      rect=frame.locator('#widget-root').bounding_box();assert abs(rect['width']-width)<2 and abs(rect['height']-height)<2,(kind,size,rect)
     if mode=='window':
      page.locator('iframe').evaluate('(frame)=>frame.style.width="360px"')
      page.wait_for_timeout(40)
      assert frame.locator('#widget-root').is_visible()
     if kind in ['calendar','converter','clock','notes'] and size=='2x2':page.screenshot(path=str(OUT/f'{kind}-{mode}-{theme}.png'))
     if mode=='window' and frame.locator('[data-plugin-settings]').count():
      frame.locator('[data-plugin-settings]').first.click()
      frame.locator('#widget-form input[name=title]').wait_for()
      frame.locator('#widget-form button[type=submit]').click()
      try:frame.locator('#widget-form input[name=title]').wait_for(state='detached')
      except Exception:
       print('SETTINGS FAILED',kind,frame.locator('#form-error').inner_text(),page.evaluate('calls'),errors,flush=True);raise
      assert not errors,(kind,'settings',errors)

  print('PASS',kind,'five card sizes, two themes, narrow window',flush=True)
 browser.close()
server.shutdown()
print('PASS all independent widget runtimes',flush=True)
