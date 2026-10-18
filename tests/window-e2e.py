#!/usr/bin/env python3
"""Window layout, keyboard, date rollover and persistence through API v2."""
from pathlib import Path
import json, threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/playwright/windows'
OUT.mkdir(parents=True, exist_ok=True)
catalog = json.loads((ROOT/'dist/index.json').read_text(encoding='utf-8'))
manifests = {m['id'].split('.')[1]: m for m in catalog['widgets']}
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'

def open_widget(page, kind, theme='dark', width=1000, height=640, value='null'):
    m = manifests[kind]
    page.goto(base+'/index.html')
    page.evaluate('''({url,kind,title,theme,width,height,value}) => {
      document.body.replaceChildren();document.body.style.cssText='margin:0;background:#243442';
      window.ready=false;window.calls=[];window.saved=value;window.revision=value;
      const iframe=document.createElement('iframe');iframe.sandbox='allow-scripts allow-forms allow-downloads';
      iframe.style.cssText=`display:block;border:0;width:${width}px;height:${height}px`;iframe.src=url;
      iframe.addEventListener('load',()=>{const channel=new MessageChannel();window.port=channel.port1;
        port.onmessage=event=>{const m=event.data;if(m.type==='ready'){window.ready=true;return;}
          if(m.type==='call'){calls.push(m);let value=true;
            if(m.method==='save'){if(m.params.expected!==window.revision){port.postMessage({type:'result',id:m.id,error:'Conflict'});return;}
              window.saved=window.revision=JSON.stringify(m.params.value);value={value:saved,revision};}
            port.postMessage({type:'result',id:m.id,value});}};
        iframe.contentWindow.postMessage({type:'qiye:init',version:2,value,revision:value,storage:{},item:{id:'test',title,size:'2x2'},
          environment:{mode:'window',theme,size:'2x2',locale:'zh-CN',width,height,settings:{theme,themeColor:'#79d7b4',useThemeColor:false,surfaceOpacity:72,gridSize:60,gap:30,radius:18,showSeconds:true,hour12:false}}},'*',[channel.port2]);});
      document.body.append(iframe);
    }''', dict(url=base+'/releases/'+m['release']+'/widget.html?widget='+kind,kind=kind,title=m['name'],theme=theme,width=width,height=height,value=value))
    page.wait_for_function('window.ready')
    return page.frame_locator('iframe')

from datetime import datetime, timezone
import base64

checks=[]
def check(name, condition):
    assert condition, name
    checks.append(name)
    print('PASS', name, flush=True)

def bounds(locator):
    return locator.evaluate('(e)=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}')

def snapshot(page, name):
    page.locator('iframe').screenshot(path=str(OUT/(name+'.png')))

with sync_playwright() as pw:
    browser=pw.chromium.launch(args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1200,'height':850},locale='zh-CN',timezone_id='Asia/Hong_Kong')
    page.set_default_timeout(10000)
    errors=[]
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.route('https://**/*',lambda r:r.fulfill(status=200,content_type='application/json',body='{}',headers={'Access-Control-Allow-Origin':'*'}))
    fixed=datetime(2026,10,18,2,0,tzinfo=timezone.utc)
    page.clock.install(time=fixed)
    page.clock.pause_at(fixed)

    for theme in ['dark','light']:
        for width,height in [(1000,640),(900,560),(360,640)]:
            for kind in ['pomodoro','habit','codec']:
                f=open_widget(page,kind,theme,width,height)
                check(f'{kind} {theme} {width}: single slim header',44<=bounds(f.locator('header').first)['height']<=48)
                check(f'{kind} {theme} {width}: one settings button', f.locator('header [data-plugin-settings]').count()==1)
                check(f'{kind} {theme} {width}: no initial settings outline',f.locator('[data-plugin-settings]').evaluate("e=>getComputedStyle(e).outlineStyle==='none'"))
                check(f'{kind} {theme} {width}: native controls follow theme', f.locator('html').evaluate('(e)=>getComputedStyle(e).colorScheme')==theme)
                overflow=f.locator('#widget-root').evaluate('''r=>[r,...r.querySelectorAll('.pomo-app-scroll,.life-content,.codec-main,.codec-nav')].filter(e=>e.clientWidth && e.scrollWidth>e.clientWidth+1).map(e=>e.className)''')
                check(f'{kind} {theme} {width}: no horizontal overflow', not overflow)
                if kind=='pomodoro':
                    check(f'Pomodoro {width}: primary control in first screen',bounds(f.locator('[data-pomo-action=toggle]'))['bottom']<=height)
                    check(f'Pomodoro {width}: rounds in first screen',bounds(f.locator('.pomo-rounds'))['bottom']<=height)
                elif kind=='habit':
                    check(f'Habit {width}: one useful empty state',f.locator('.habit-onboarding').count()==1 and f.locator('.habit-detail,.habit-week-heading,.habit-today-progress,[data-life-action=habit-add]').count()==0)
                    check(f'Habit {width}: add form in first screen',bounds(f.locator('.habit-add-form'))['bottom']<=height)
                elif width>=900:
                    editors=bounds(f.locator('.codec-editors'))
                    check(f'Codec {width}: compact introduction and useful editor height', editors['y']<160 and editors['height']>=280)
                    check(f'Codec {width}: run and footer visible', bounds(f.locator('.codec-footer'))['bottom']<=height)
                if width!=900:snapshot(page,f'{kind}-{theme}-{width}')

    # Shared changes apply to every embedded app, including legacy calendar/hot lists.
    for theme in ['dark','light']:
        for kind in manifests:
            for width in [1000,360]:
                f=open_widget(page,kind,theme,width,640)
                bars=f.locator('header:has(.widget-app-controls)')
                if bars.count():
                    check(f'{kind} {theme} {width}: compact window chrome',44<=bounds(bars.first)['height']<=48)
                check(f'{kind} {theme} {width}: host owns entrance animation',f.locator('#dialog').evaluate("e=>getComputedStyle(e).opacity==='1' && getComputedStyle(e).animationName==='none'"))
                if kind in ['calendar','hotsearch']:
                    snapshot(page,f'{kind}-{theme}-{width}')
                    if kind=='calendar':
                        check('Calendar keeps a small icon in narrow windows',bounds(f.locator('.calendar-app-icon'))['width']==18)
                        f.locator('[data-detail-action=calendar-page][data-page=tools]').click()
                        check('Calendar tools tab remains accessible',f.locator('[data-page=tools]').get_attribute('aria-selected')=='true')
                    else:
                        f.locator('[data-hot-action=manage]').click()
                        check('Hotsearch subscription controls remain accessible',f.locator('.hotsearch-manager-overlay').is_visible())
                        f.locator('[data-hot-action=manage-close]').click()

    # Persistence through the real MessageChannel bridge, not a mocked renderer.
    f=open_widget(page,'pomodoro')
    f.locator('[name=task]').fill('写完这一段')
    f.locator('[data-pomo-task-form] button').click()
    page.wait_for_function("JSON.parse(window.saved)?.data.task==='写完这一段'")
    f.locator('[data-pomo-duration-form] [name=focusMinutes]').fill('30')
    f.locator('[data-pomo-duration-form] button[type=submit]').click()
    page.wait_for_function('JSON.parse(window.saved)?.config.focusMinutes===30')
    f.locator('[data-pomo-action=toggle]').click()
    page.wait_for_function("JSON.parse(window.saved)?.data.status==='running'")
    saved=page.evaluate('window.saved')
    page.clock.fast_forward(3000)
    f=open_widget(page,'pomodoro',value=saved)
    check('Pomodoro running time restores without NaN or a reset',f.locator('[data-pomo=time]').inner_text()=='29:57')
    check('Pomodoro task restores while running',f.locator('[name=task]').input_value()=='写完这一段' and f.locator('[name=task]').is_disabled())
    f.locator('[data-pomo-action=toggle]').click()
    page.wait_for_function("JSON.parse(window.saved)?.data.status==='paused'")
    f.locator('[data-pomo-action=reset]').click()
    page.wait_for_function("JSON.parse(window.saved)?.data.status==='idle'")
    f.locator('.pomo-preferences summary').click()
    f.locator('[data-pomo-settings-form] [name=dailyGoal]').fill('6')
    f.locator('[data-pomo-settings-form] button[type=submit]').click()
    page.wait_for_function('JSON.parse(window.saved)?.config.dailyGoal===6')
    check('Pomodoro rhythm settings remain editable', True)

    f=open_widget(page,'habit')
    f.locator('[data-habit-suggestion="阅读"]').click()
    f.locator('.habit-tracker-row').wait_for()
    check('First habit replaces onboarding with a working tracker',f.locator('.habit-onboarding').count()==0 and f.locator('.habit-detail').count()==1)
    f.locator('[data-life-action=habit-add]').click()
    f.locator('.habit-add-form input').fill('每天走一走')
    f.locator('.habit-add-form button').click()
    page.wait_for_function('JSON.parse(window.saved)?.data.habits.length===2')
    f.locator('.habit-tracker-row').last.locator('[data-habit-date="2026-10-18"]').click()
    page.wait_for_function("JSON.parse(window.saved)?.data.habits[1].dates.includes('2026-10-18')")
    saved=page.evaluate('window.saved')
    f=open_widget(page,'habit',value=saved)
    check('Habit names and check-ins survive reopening',f.locator('.habit-tracker-row').count()==2 and f.locator('.habit-tracker-row').last.locator('[data-habit-date="2026-10-18"]').get_attribute('aria-pressed')=='true')
    snapshot(page,'habit-populated-dark')
    f=open_widget(page,'habit','light',value=saved)
    snapshot(page,'habit-populated-light')
    f=open_widget(page,'habit','dark',360,640,value=saved)
    check('Populated narrow habit tracker fits horizontally',f.locator('.habit-tracker').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
    snapshot(page,'habit-populated-narrow')
    f.locator('[data-habit-filter=done]').click()
    check('Habit filters still work',f.locator('.habit-tracker-row').count()==1)
    page.clock.fast_forward(14*60*60*1000)
    check('Habit day heading rolls over at local midnight','19' in f.locator('.habit-today p').inner_text())
    check('Yesterday remains recorded, today starts incomplete',f.locator('.habit-tracker-row').count()==0 and f.locator('.habit-today-progress strong').inner_text()=='0/2')
    f.locator('[data-habit-filter=all]').click()
    f.locator('[data-life-action=habit-delete]').click()
    page.wait_for_function('JSON.parse(window.saved)?.data.habits.length===1')
    f.locator('[data-life-action=habit-delete]').click()
    f.locator('.habit-onboarding').wait_for()
    f.locator('[data-life-action=habit-undo]').click()
    f.locator('.habit-tracker-row').wait_for()
    check('Delete-last and undo return to the correct layout',f.locator('.habit-onboarding').count()==0)

    f=open_widget(page,'codec')
    f.locator('#codec-input').fill('你好 Qiye')
    page.clock.fast_forward(250)
    expected=base64.b64encode('你好 Qiye'.encode()).decode()
    from playwright.sync_api import expect
    expect(f.locator('#codec-output')).to_have_value(expected)
    f.locator('[data-codec-algorithm=url]').click()
    check('URL options appear only when relevant',f.locator('.codec-options').is_visible() and f.locator('[data-codec-url]').is_visible())
    f.locator('[data-codec-algorithm=md5]').click()
    f.locator('#codec-input').fill('abc')
    f.locator('[data-codec-uppercase]').check()
    f.locator('[data-codec-action=run]').click()
    expect(f.locator('#codec-output')).to_have_value('900150983CD24FB0D6963F7D28E17F72')
    check('Hash controls and conversion remain functional',True)
    f.locator('[data-codec-algorithm=beast]').click()
    check('Fun codec options and note remain reachable',f.locator('[data-codec-beast]').is_visible() and f.locator('[data-codec-fun-note]').is_visible())
    f.locator('[data-codec-algorithm=base64]').click()
    check('Simple codecs reclaim the options row',not f.locator('.codec-options').is_visible())
    f=open_widget(page,'codec','light',360,640)
    f.locator('[data-codec-select]').select_option('url')
    f.locator('#codec-input').fill('A B')
    f.locator('[data-codec-action=run]').click()
    expect(f.locator('#codec-output')).to_have_value('A%20B')
    check('Narrow codec selector and run button remain usable',True)

    # An actual keyboard entry must retain the visible focus cue.
    f=open_widget(page,'habit')
    page.keyboard.press('Tab')
    check('Keyboard focus is visible on title controls', f.locator('[data-plugin-settings]').evaluate("e=>e.matches(':focus-visible') && getComputedStyle(e).outlineStyle!=='none'"))
    check('No browser errors',not errors)
    (OUT/'report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
    browser.close()
server.shutdown()
print(f'PASS {len(checks)} window layout and interaction checks',flush=True)
