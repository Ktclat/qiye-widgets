#!/usr/bin/env python3
"""File conversion workflow, lifecycle, settings, input and output bounds."""
import argparse
import copy
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import threading
from playwright.sync_api import sync_playwright
from image_fixtures import upload

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--preview',action='store_true')
args=parser.parse_args()
OUT=ROOT/'output/playwright/file-converter'
OUT.mkdir(parents=True,exist_ok=True)
initial=json.loads(subprocess.check_output(['node','--input-type=module','-e',"""
import {DEFAULT_STATE} from './src/core.js';
import {newWidgetConfig} from './src/widget-registry.js';
const s=structuredClone(DEFAULT_STATE);s.settings.autoExtractIcons=false;
s.items=['1x1','1x2','2x1','2x2','4x2'].map((size,i)=>({id:'f'+i,groupId:'home',type:'widget',widget:'file-converter',title:'文件转换',size,config:newWidgetConfig('file-converter'),data:{}}));
console.log(JSON.stringify(s));
"""],cwd=ROOT))


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):
        pass


checks=[]


def check(name,ok):
    assert ok,name
    checks.append(name)
    print('PASS',name,flush=True)


server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    executable=os.environ.get('CHROMIUM_PATH')
    browser=p.chromium.launch(**({'executable_path':executable} if executable else {}))
    try:
        for language,theme,width in [('zh-CN','light',1440),('en','dark',390)]:
            state=copy.deepcopy(initial)
            state['settings'].update(language=language,theme=theme)
            context=browser.new_context(viewport={'width':width,'height':850},accept_downloads=True)
            page=context.new_page()
            page.set_default_timeout(15000)
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.route('https://**/*',lambda route:route.abort())
            page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'+json.dumps(json.dumps(state))+')')
            page.add_init_script("""window.imageURLs=new Set();
const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=create(blob);imageURLs.add(url);return url;};
URL.revokeObjectURL=url=>{imageURLs.delete(url);revoke(url);};
window.realBitmap=createImageBitmap;
window.holdDecode=()=>{window.decodeEntered=false;window.decodeReleased=false;createImageBitmap=async(...args)=>{
  createImageBitmap=realBitmap;decodeEntered=true;await new Promise(r=>window.releaseDecode=r);
  const result=await realBitmap(...args);decodeReleased=true;return result;};};
window.holdRead=()=>{window.readEntered=false;const original=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=async function(){
  Blob.prototype.arrayBuffer=original;readEntered=true;await new Promise(r=>window.releaseRead=r);return original.call(this);};};""")
            page.goto(f'http://127.0.0.1:{server.server_port}/'+('Qiye-preview.html' if args.preview else ''))
            page.locator('[data-item=f3]').wait_for()

            def saved():
                return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5"))')

            def open_tool():
                page.locator('[data-item=f3] .fc-launch').click()
                page.locator('[data-fc-input]').wait_for(state='attached')
                page.locator('#dialog').evaluate('e=>Promise.all(e.getAnimations().map(animation=>animation.finished))')

            def close():
                page.locator('#dialog [data-close]').click()
                page.locator('#dialog').wait_for(state='hidden')

            def add(files):
                page.locator('[data-fc-input]').set_input_files(files)
                page.wait_for_function('document.querySelector("[data-fc-drop]").getAttribute("aria-busy")==="false"')

            def run():
                page.locator('[data-fc-action=run]').click()
                page.locator('[data-fc-action=cancel]').wait_for(state='hidden')

            check(f'{language}: all five card sizes mount',page.locator('#desktop .fc-launch').count()==5)
            check('card controls stay within their frames',page.locator('#desktop .fc-launch').evaluate_all('ns=>ns.every(n=>{const r=n.closest(".widget-inner").getBoundingClientRect(),b=n.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top-1&&b.bottom<=r.bottom+1})'))
            open_tool()
            check('title gets initial focus and header stays 46px',page.evaluate('document.activeElement.id')=='dialog-title' and abs(page.locator('.fc-header').bounding_box()['height']-46)<1)
            expand=page.locator('[data-detail-action=window-expand]')
            expand.click()
            check('maximize works',expand.get_attribute('aria-pressed')=='true')
            expand.click()
            check('restore works',expand.get_attribute('aria-pressed')=='false')
            with page.expect_file_chooser():
                page.locator('[data-fc-action=pick]').press('Enter')
            check('file picker supports keyboard selection',True)
            add([upload('same.png',transparent=True),upload('same.png'),{'name':'fake.png','mimeType':'image/png','buffer':b'not an image'}])
            check('valid files accepted and forged file rejected',page.locator('.fc-row').count()==2)
            check('uploader becomes compact after files are added',page.locator('[data-fc-drop]').bounding_box()['height']<120)
            page.locator('[data-fc-format]').select_option('jpeg')
            run()
            check('batch conversion completes',page.locator('.fc-state-done').count()==2)
            names=[]
            for button in page.locator('[data-fc-action=download]').all():
                with page.expect_download() as download:
                    button.click()
                names.append(download.value.suggested_filename)
                check('JPEG download has JPEG signature',download.value.path().read_bytes().startswith(b'\xff\xd8\xff'))
            check('duplicate names produce unique output filenames',names==['same.jpg','same (2).jpg'])
            white=page.locator('[data-fc-action=download]').first.evaluate("""async button=>{
let url;const original=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){url=this.href;};
try{button.click();}finally{HTMLAnchorElement.prototype.click=original;}
const blob=await (await fetch(url)).blob(),bitmap=await realBitmap(blob),canvas=document.createElement('canvas');
canvas.width=1;canvas.height=1;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
return Array.from(ctx.getImageData(0,0,1,1).data);
}""")
            check('JPEG transparency is flattened to white',all(channel>=250 for channel in white[:3]) and white[3]==255)
            page.screenshot(path=str(OUT/f'{language}{"-preview" if args.preview else ""}.png'))
            check('queue fits narrow and wide layouts',page.locator('.fc-app').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
            page.evaluate('holdRead()')
            page.locator('[data-fc-input]').set_input_files(upload('pending.png'))
            page.wait_for_function('readEntered')
            check('clear and remove are disabled during asynchronous import',page.locator('[data-fc-action=clear]').is_disabled() and page.locator('[data-fc-action=remove]').first.is_disabled())
            page.evaluate('releaseRead()')
            page.wait_for_function('document.querySelectorAll(".fc-row").length===3')
            page.locator('[data-fc-format]').select_option('png')
            check('PNG disables lossy quality control and releases previous results',page.locator('[data-fc-quality]').is_disabled() and page.evaluate('imageURLs.size')==0)
            run()
            with page.expect_download() as download:
                page.locator('[data-fc-action=download]').first.click()
            check('PNG output has correct signature',download.value.path().read_bytes().startswith(b'\x89PNG'))
            page.locator('[data-fc-format]').select_option('webp')
            page.locator('[data-fc-quality]').evaluate('e=>{e.value=83;e.dispatchEvent(new Event("change",{bubbles:true}));}')
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="f3").config.quality===83')
            check('configuration preserves any valid integer quality',saved()['items'][3]['config']=={'outputFormat':'webp','quality':83})
            page.evaluate("""() => {const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){
if(k==='qiye.state.v5'){Storage.prototype.setItem=original;throw new DOMException('Simulated quota full','QuotaExceededError');}
return original.call(this,k,v);};}""")
            page.locator('[data-fc-format]').select_option('jpeg')
            page.wait_for_function('document.querySelector("[data-fc-format]").value==="webp"')
            check('failed settings save rolls back visible and stored choices',saved()['items'][3]['config']['outputFormat']=='webp')
            page.locator('[data-fc-action=clear]').click()
            add(upload('animated.png',animated=True))
            run()
            check('animated PNG reports error instead of flattening',page.locator('.fc-state-error').count()==1 and ('Animated' if language=='en' else '动画') in page.locator('.fc-file-info small').inner_text())
            page.locator('[data-fc-action=clear]').click()
            add(upload())
            page.evaluate('holdDecode()')
            page.locator('[data-fc-action=run]').click()
            page.wait_for_function('decodeEntered')
            page.locator('[data-fc-action=cancel]').click()
            page.evaluate('releaseDecode()')
            page.wait_for_function('decodeReleased')
            page.locator('[data-fc-action=cancel]').wait_for(state='hidden')
            check('cancel leaves task retryable with no output',page.locator('[data-fc-action=run]').is_enabled() and page.locator('[data-fc-action=download]').count()==0 and page.evaluate('imageURLs.size')==0)
            run()
            check('retry completes after cancellation',page.locator('.fc-state-done').count()==1)
            page.locator('[data-fc-format]').select_option('png')
            page.evaluate('holdDecode()')
            page.locator('[data-fc-action=run]').click()
            page.wait_for_function('decodeEntered')
            close()
            page.evaluate('releaseDecode()')
            page.wait_for_function('decodeReleased')
            check('closing discards pending conversion and releases all URLs',page.evaluate('imageURLs.size')==0 and not page.locator('#dialog').is_visible())
            page.reload()
            page.locator('[data-item=f3]').wait_for()
            open_tool()
            check('reload restores settings but never stores file data',page.locator('.fc-row').count()==0 and page.locator('[data-fc-format]').input_value()=='png' and page.locator('[data-fc-quality]').input_value()=='83' and not any(item['data'] for item in saved()['items']))
            close()
            page.evaluate('''()=>{const s=JSON.parse(localStorage.getItem("qiye.state.v5"));s.settings.windowSize=75;localStorage.setItem("qiye.state.v5",JSON.stringify(s));}''')
            page.reload();page.locator('[data-item=f3]').wait_for();open_tool()
            bounds=page.locator('#dialog').bounding_box()
            check(f'window follows the saved 75 percent size preference ({bounds})',abs(bounds['width']-min(735,width-24))<1 and abs(bounds['height']-480)<1)
            # Returned byte sizes are bounded even for unexpectedly large encoder output.
            add(upload())
            page.evaluate("""() => {const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb,...args){
HTMLCanvasElement.prototype.toBlob=original;return original.call(this,blob=>{Object.defineProperty(blob,'size',{value:121*1024*1024});cb(blob);},...args);};}""")
            run()
            check('oversized output cannot accumulate in the result queue',page.locator('.fc-state-error').count()==1 and '120 MiB' in page.locator('.fc-file-info small').inner_text() and page.evaluate('imageURLs.size')==0)
            close()
            check('no uncaught browser exceptions',not errors)
            context.close()
    finally:
        browser.close()
        server.shutdown()
print(f'{len(checks)} file conversion browser checks passed.')
