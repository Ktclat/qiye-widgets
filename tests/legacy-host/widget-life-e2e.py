#!/usr/bin/env python3
"""User journeys for the distinct countdown, workday, notes, clock and habit tools."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse, json, os, subprocess, threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
OUT=ROOT/'output/playwright/life';OUT.mkdir(parents=True,exist_ok=True)
state=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {DEFAULT_STATE} from './src/core.js';import {newWidgetConfig} from './src/widget-registry.js';import {newWidgetData} from './src/widget-data.js';const s=structuredClone(DEFAULT_STATE);s.settings.language='zh-CN';s.settings.autoExtractIcons=false;s.settings.theme='dark';s.items=['countdown','workday','notes','clock','habit','memo'].map(w=>({id:w,groupId:'home',type:'widget',widget:w,title:w,size:'2x2',config:newWidgetConfig(w),data:newWidgetData(w)}));console.log(JSON.stringify(s))"],cwd=ROOT))
state['items'][0]['data']={'events':[
 {'id':'birthday','title':'出生','date':'1995-10-27','category':'anniversary','repeat':'none','pinned':True,'tone':'blue'},
 {'id':'newyear','title':'新年','date':'2027-01-01','category':'holiday','repeat':'yearly','pinned':False,'tone':'amber'},
 {'id':'meet','title':'相识纪念日','date':'2026-12-15','category':'anniversary','repeat':'yearly','pinned':False,'tone':'rose'},
]}
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
with sync_playwright() as p:
 executable=os.environ.get('CHROMIUM_PATH')
 browser=p.chromium.launch(**({'executable_path':executable} if executable else {}))
 try:
  context=browser.new_context(viewport={'width':1440,'height':960},locale='zh-CN',timezone_id='Asia/Hong_Kong')
  context.route('https://**/*',lambda r:r.abort())
  page=context.new_page();page.set_default_timeout(10000);errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/'+('Qiye-preview.html' if args.preview else ''))
  page.evaluate('(s)=>localStorage.setItem("qiye.state.v5",JSON.stringify(s))',state);page.reload()
  def saved():return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5"))')
  def item(kind):return next(i for i in saved()['items'] if i['widget']==kind)
  def open_tool(kind):
   page.locator(f'#desktop [data-widget="{kind}"] [data-action="widget-open"],#desktop [data-widget="{kind}"] [data-action="widget-memo-open"]').first.click()
   page.locator('#dialog:visible').wait_for()
  def close():page.locator('#dialog [data-close]').first.click();page.wait_for_timeout(100)
  def shot(name):page.screenshot(path=str(OUT/(name+('-preview' if args.preview else '')+'.png')),animations='disabled')
  open_tool('countdown');shot('countdown')
  check('countdown has categories, event list and selected details',page.locator('.countdown-event').count()==3 and page.locator('.countdown-detail h3').inner_text().startswith('出生'))
  page.locator('[data-countdown-category="holiday"]').click();check('countdown category filters events',page.locator('.countdown-event').count()==1)
  page.locator('[data-life-action="countdown-new"]').click();check('new event focuses name without selecting background controls',page.locator('[name=eventTitle]').evaluate('e=>e===document.activeElement'))
  page.locator('[name=eventTitle]').fill('月末计划 <script>');page.locator('[name=date]').fill('2027-01-31');page.locator('[name=repeat]').select_option('monthly');page.locator('.life-editor [type=submit]').click()
  page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.widget==="countdown").data.events.length===4')
  check('countdown saves repeat and safely renders name',item('countdown')['data']['events'][-1]['repeat']=='monthly' and page.locator('.countdown-detail h3').inner_text().startswith('月末计划 <script>'))
  page.locator('[data-life-action=countdown-delete]').click();page.locator('[data-life-action=countdown-undo]').click();page.wait_for_timeout(150)
  check('delete countdown can be undone',len(item('countdown')['data']['events'])==4);close()
  open_tool('workday');page.locator('[name=startTime]').fill('10:00');page.locator('[name=endTime]').fill('19:30');page.locator('[name=style][value=ring]').check();page.locator('[name=showFriday]').check();page.locator('[name=workdays][value="6"]').check()
  check('workday preview changes before saving',page.locator('.workday-style-ring').count()>=1 and item('workday')['config'].get('style') is None)
  page.locator('[data-life-form=workday] [type=submit]').click();page.wait_for_timeout(200)
  check('workday saves schedule and appearance',item('workday')['config']['startTime']=='10:00' and item('workday')['config']['style']=='ring' and 6 in item('workday')['config']['workdays']);shot('workday');close()
  open_tool('notes');page.locator('#dialog textarea').fill('明天的三件小事\n读完一本书\n整理桌面\n给自己留一点时间');page.locator('[data-note-color=mint]').click();page.wait_for_timeout(650)
  check('notes auto-save survives color changes','整理桌面' in item('notes')['data']['notes'] and item('notes')['config']['color']=='mint')
  with page.expect_download() as downloaded:page.locator('[data-life-action=notes-export]').click()
  downloaded.value.save_as(OUT/'note.txt');check('notes exports the current text',(OUT/'note.txt').read_text(encoding='utf-8')==item('notes')['data']['notes']);shot('notes');close()
  open_tool('clock');page.locator('[data-life-action=clock-add]').click();page.locator('[data-clock-search]').fill('Mumbai')
  # English IANA names and localized city names are both searchable.
  page.locator('[data-clock-search]').fill('Kolkata');page.locator('[data-clock-add-zone="Asia/Kolkata"]').click();page.wait_for_timeout(150)
  check('world clock adds a city with a half-hour offset',len(item('clock')['config']['cities'])==5 and 'UTC+05:30' in page.locator('.world-city').last.inner_text())
  page.locator('[data-life-action=clock-primary][data-zone="Asia/Kolkata"]').click();page.wait_for_timeout(100)
  check('primary city order persists',item('clock')['config']['cities'][0]['timeZone']=='Asia/Kolkata')
  slider=page.locator('[data-clock-offset]');slider.focus();slider.press('ArrowRight');page.wait_for_timeout(1200)
  check('comparison updates all cities while retaining keyboard focus',slider.input_value()=='30' and slider.evaluate('e=>document.activeElement===e'))
  page.locator('[data-life-action=clock-now]').click();shot('clock');close()
  open_tool('habit');page.locator('[data-life-form=habit-add] input').fill('每天阅读 20 分钟');page.locator('[data-life-form=habit-add] [type=submit]').click();page.wait_for_timeout(150)
  today=page.evaluate('()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}')
  page.locator(f'.habit-tracker [data-habit-date="{today}"]').click();page.wait_for_timeout(150)
  check('habit today check-in updates saved history and completion',item('habit')['data']['habits'][0]['dates']==[today] and page.locator('.habit-today-progress strong').inner_text()=='1/1')
  yesterday=page.evaluate('()=>{const d=new Date();d.setDate(d.getDate()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}')
  page.locator(f'.habit-calendar [data-habit-date="{yesterday}"]').click();page.wait_for_timeout(150)
  check('habit calendar supports backfill and prevents future check-ins',len(item('habit')['data']['habits'][0]['dates'])==2 and page.locator('.habit-calendar button:disabled').count()>0)
  page.locator('[data-life-action=habit-delete]').click();page.locator('[data-life-action=habit-undo]').click();page.wait_for_timeout(150)
  check('habit deletion can be undone with history',len(item('habit')['data']['habits'][0]['dates'])==2);shot('habit');close()
  open_tool('memo');check('memo initial focus does not highlight sort selector',page.locator('#memo-sort').evaluate('e=>e!==document.activeElement && getComputedStyle(e).outlineStyle==="none"'));shot('memo');close()
  page.reload();open_tool('countdown');check('countdown entries survive reload',page.locator('.countdown-event').count()==4);close()
  open_tool('countdown');page.locator('[data-life-action=countdown-new]').click();page.locator('[name=eventTitle]').fill('保存失败时保留草稿')
  page.evaluate("()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='qiye.state.v5')throw new Error('Test disk full');return window.originalSetItem.call(this,k,v)}}")
  page.locator('[data-life-form=countdown] [type=submit]').click();page.locator('.life-editor-feedback:not(:empty)').wait_for()
  check('failed countdown save preserves draft and prior events',page.locator('[name=eventTitle]').input_value()=='保存失败时保留草稿' and len(item('countdown')['data']['events'])==4)
  page.evaluate('()=>{Storage.prototype.setItem=window.originalSetItem}');page.locator('[data-life-form=countdown] [type=submit]').click();page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.widget==="countdown").data.events.length===5')
  check('countdown draft can be retried successfully',page.locator('.life-overlay').count()==0);page.locator('[data-life-action=countdown-delete]').click();page.wait_for_timeout(100);close()
  open_tool('notes');check('notes content survives reload','整理桌面' in page.locator('#dialog textarea').input_value());close()
  for theme in ['light','dark']:
   page.evaluate('(theme)=>{const s=JSON.parse(localStorage.getItem("qiye.state.v5"));s.settings.theme=theme;localStorage.setItem("qiye.state.v5",JSON.stringify(s))}',theme);page.reload()
   for width in [1440,390]:
    page.set_viewport_size({'width':width,'height':960 if width==1440 else 844})
    for kind in ['countdown','workday','notes','clock','habit','memo']:
     open_tool(kind)
     check(f'{theme} {width}px {kind} has no horizontal page overflow',page.locator('#dialog').evaluate('d=>d.scrollWidth<=d.clientWidth+1 && [...d.querySelectorAll(".life-content,.memo-workspace")].every(e=>e.scrollWidth<=e.clientWidth+1)'))
     if width==390:shot(f'{kind}-{theme}-mobile')
     close()
  check('no uncaught JavaScript errors',not errors)
  (OUT/('result-preview.json' if args.preview else 'result.json')).write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
 finally:browser.close();server.shutdown()
print(f'{len(checks)} checks passed')
