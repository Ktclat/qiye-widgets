#!/usr/bin/env python3
"""Regression for the 2026-10-19 widget controls and purpose-specific layouts."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json, threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/playwright/controls';OUT.mkdir(parents=True,exist_ok=True)
version=json.loads((ROOT/'package.json').read_text())['version']
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
def open_widget(page,kind,theme='dark',width=1000,height=680,value='null',mode='window',size='2x2'):
    page.goto(base+'/index.html')
    page.evaluate('''args=>{
      document.body.replaceChildren();document.body.style='margin:0';window.ready=false;window.saved=args.value;
      const frame=document.createElement('iframe');frame.sandbox='allow-scripts allow-forms allow-downloads';
      frame.style=`width:${args.width}px;height:${args.height}px;border:0;display:block`;frame.src=args.url;
      frame.onload=()=>{const channel=new MessageChannel();window.port=channel.port1;
        port.onmessage=event=>{const m=event.data;if(m.type==='ready'){window.ready=true;return;}
          if(m.type==='call'){let value=true;if(m.method==='save'){
            if(m.params.expected!==saved){port.postMessage({type:'result',id:m.id,error:'Conflict'});return;}
            saved=JSON.stringify(m.params.value);value={value:saved,revision:saved};}
            port.postMessage({type:'result',id:m.id,value});}};
        frame.contentWindow.postMessage({type:'qiye:init',version:2,value:args.value,revision:args.value,storage:{},item:{id:'test',title:'测试',size:args.size},
          environment:{mode:args.mode,size:args.size,theme:args.theme,locale:'zh-CN',width:args.width,height:args.height,settings:{theme:args.theme,useThemeColor:false,gridSize:60,gap:30,radius:18,showSeconds:true}}},'*',[channel.port2]);};document.body.append(frame);
    }''',dict(url=f'{base}/releases/{version}/widget.html?widget={kind}',kind=kind,theme=theme,width=width,height=height,value=value,mode=mode,size=size))
    page.wait_for_function('window.ready')
    return page.frame_locator('iframe')
def fits(node):
    return node.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
def snap(page,name): page.locator('iframe').screenshot(path=str(OUT/(name+'.png')))

with sync_playwright() as pw:
    browser=pw.chromium.launch(args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1100,'height':800},locale='zh-CN',timezone_id='Asia/Hong_Kong')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    for theme in ['dark','light']:
        frame=open_widget(page,'notes',theme)
        assert frame.locator('.life-content').evaluate('e=>getComputedStyle(e).padding')=='0px'
        assert frame.locator('.notes-desk').evaluate('e=>getComputedStyle(e).borderRadius')=='0px'
        frame.locator('[data-widget-input=notes]').fill('一整面的纸，自动保存。\n第二行 📝')
        page.wait_for_function("saved.includes('一整面的纸')")
        frame.locator('[data-note-color=pink]').click()
        page.wait_for_function("JSON.parse(saved).config.color==='pink'")
        assert frame.locator('.life-notes.notes-paper-pink').count()==1
        snap(page,'notes-'+theme)
        saved=page.evaluate('saved');frame=open_widget(page,'notes',theme,360,value=saved)
        assert '第二行' in frame.locator('textarea').input_value()
        assert fits(frame.locator('#widget-root'))
        snap(page,'notes-narrow-'+theme)
        todos=[{'id':f't{i}','text':('很长的任务内容，' if i==0 else '完成今日的一件小事 ')+('x'*210 if i==0 else str(i)),'done':False} for i in range(25)]
        frame=open_widget(page,'todo',theme,360,value=json.dumps({'config':{},'data':{'todos':todos}}))
        assert fits(frame.locator('.w-todo-list')) and fits(frame.locator('#widget-root'))
        assert frame.locator('[data-utility-form]').count()==0
        button=frame.locator('.w-row-delete').first
        assert button.evaluate('e=>{const b=e.getBoundingClientRect(),i=e.querySelector("svg").getBoundingClientRect();return i.left>=b.left&&i.right<=b.right&&Math.abs((i.left+i.right)-(b.left+b.right))<2}')
        button.click();page.wait_for_function('JSON.parse(saved).data.todos.length===24')
        frame.locator('.w-todo-row input').first.check()
        page.wait_for_function('JSON.parse(saved).data.todos.some(t=>t.done)')
        frame.locator('[data-todo-filter]').select_option('done')
        assert frame.locator('.w-todo-row:visible').count()==1
        snap(page,'todo-narrow-'+theme)
        frame=open_widget(page,'converter',theme,360)
        search=frame.locator('.cv-search')
        assert search.evaluate('e=>parseFloat(getComputedStyle(e).borderRadius)>=16')
        assert frame.locator('.cv-search input').evaluate('e=>parseFloat(getComputedStyle(e).borderWidth)===0')
        assert fits(frame.locator('.cv-header'))
        frame.locator('.cv-search input').fill('长度')
        snap(page,'converter-narrow-'+theme)
        clock={'config':{'label':'香港','timeZone':'Asia/Hong_Kong','cities':[{'label':label,'timeZone':zone} for label,zone in [('香港','Asia/Hong_Kong'),('伦敦','Europe/London'),('纽约','America/New_York'),('东京','Asia/Tokyo')]]},'data':{}}
        frame=open_widget(page,'clock',theme,value=json.dumps(clock))
        for columns in [1,2,3]:
            frame.locator(f'[data-clock-columns="{columns}"]').click()
            page.wait_for_function(f'JSON.parse(saved).config.columns==={columns}')
            assert frame.locator('.world-clock-cities').evaluate('e=>getComputedStyle(e).gridTemplateColumns.split(" ").length')==columns
            assert fits(frame.locator('.world-clock-cities'))
            snap(page,f'clock-{columns}-{theme}')
        saved=page.evaluate('saved');frame=open_widget(page,'clock',theme,360,value=saved)
        assert frame.locator('[data-clock-columns="3"]').get_attribute('aria-pressed')=='true'
        assert frame.locator('.world-clock-cities').evaluate('e=>getComputedStyle(e).gridTemplateColumns.split(" ").length')==1
        snap(page,'clock-narrow-'+theme)
        for size in ['1x1','1x2','2x1','2x2','4x2']:
            w,h=map(int,size.split('x'));frame=open_widget(page,'file-converter',theme,w*60+(w-1)*30,h*60+(h-1)*30,mode='card',size=size)
            assert fits(frame.locator('#widget-root'))
            snap(page,'file-'+size+'-'+theme)
    assert not errors,errors
    browser.close()
server.shutdown()
print('PASS notes surface/save, todo overflow/delete/filter, converter search, persisted clock columns, file tile sizes, both themes')
