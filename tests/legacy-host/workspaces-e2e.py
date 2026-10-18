#!/usr/bin/env python3
"""Dedicated widget tools, wallpaper gestures, layout exchange and isolated community runtime."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse, json, os, subprocess, threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
OUT=ROOT/'test-results/workspaces';OUT.mkdir(parents=True,exist_ok=True)
state=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {DEFAULT_STATE} from './src/core.js';import {listWidgetDefinitions,newWidgetConfig} from './src/widget-registry.js';import {newWidgetData} from './src/widget-data.js';const s=structuredClone(DEFAULT_STATE);s.settings.language='zh-CN';s.settings.autoExtractIcons=false;s.items=listWidgetDefinitions().map(w=>({id:w.type,groupId:'home',type:'widget',widget:w.type,title:w.title,size:'1x1',config:newWidgetConfig(w.type),data:newWidgetData(w.type)}));console.log(JSON.stringify(s))"],cwd=ROOT))
layout=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {DEFAULT_STATE} from './src/core.js';import {createLayout} from './src/layout-sharing.js';console.log(JSON.stringify(createLayout(DEFAULT_STATE,{appearance:true})))"],cwd=ROOT))
catalog=json.loads((ROOT/'community/index.json').read_text(encoding='utf-8'))
checks=[]
def check(name,ok):
    assert ok,name
    checks.append(name);print('PASS',name,flush=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    executable=os.environ.get('CHROMIUM_PATH')
    browser=p.chromium.launch(**({'executable_path':executable} if executable else {}))
    try:
        context=browser.new_context(viewport={'width':1440,'height':950},locale='zh-CN')
        page=context.new_page();page.set_default_timeout(10000);errors=[];requests=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        def route(r):
            url=r.request.url;requests.append(url)
            headers={'Access-Control-Allow-Origin':'*'}
            if url=='https://example.org/layout.json':r.fulfill(json=layout,headers=headers)
            elif url.endswith('/community/index.json'):r.fulfill(json=catalog,headers=headers)
            elif '/community/examples/counter/index.html' in url:r.fulfill(body=(ROOT/'community/examples/counter/index.html').read_text(encoding='utf-8'),content_type='text/html',headers=headers)
            elif '/community/examples/counter/' in url and url.endswith('.svg'):r.fulfill(body=(ROOT/'community/examples/counter'/url.rsplit('/',1)[-1]).read_text(encoding='utf-8'),content_type='image/svg+xml',headers=headers)
            elif url.endswith('/community/sdk.js'):r.fulfill(body=(ROOT/'community/sdk.js').read_text(encoding='utf-8'),content_type='text/javascript',headers=headers)
            else:r.abort()
        page.route('https://**/*',route)
        page.add_init_script('if(window===top&&!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'+json.dumps(json.dumps(state))+')')
        url=f'http://127.0.0.1:{server.server_port}/'+('Qiye-preview.html' if args.preview else '')
        page.goto(url);page.locator('#desktop [data-item=wallpaper]').wait_for()
        def saved():return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5"))')
        def close():page.locator('#dialog [data-close]').first.click();page.locator('#dialog').wait_for(state='hidden')
        def open_widget(kind):page.locator(f'#desktop [data-item={kind}]').scroll_into_view_if_needed();page.locator(f'#desktop [data-item={kind}]').focus();page.keyboard.press('Enter');page.locator('#dialog').wait_for()
        for size in ['1x1','1x2','2x1','2x2','4x2']:
            tile=page.locator('#desktop [data-item=wallpaper]');tile.click(button='right',position={'x':3,'y':3});page.locator(f'#context-menu [data-size="{size}"]').click();page.locator(f'#desktop [data-item=wallpaper][data-size="{size}"]').wait_for();page.wait_for_timeout(100)
            surface=tile.locator('[data-action=widget-open],.wallpaper-launcher').first;surface.scroll_into_view_if_needed();r=surface.bounding_box()
            page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);page.mouse.down();page.mouse.move(r['x']+r['width']/2+15,r['y']+r['height']/2+4,steps=2)
            check(f'{size} wallpaper press-and-move lifts without special handle',page.locator('.drag-ghost').count()==1)
            page.keyboard.press('Escape');page.mouse.up();page.wait_for_timeout(80)
            check(f'{size} cancelling drag suppresses wallpaper click',not page.locator('#dialog').is_visible())
            surface.click();check(f'{size} wallpaper opens centre directly',page.locator('#dialog.wallpaper-dialog').is_visible());close()
        surface=page.locator('#desktop [data-item=wallpaper] .wallpaper-launcher').first;surface.scroll_into_view_if_needed();r=surface.bounding_box();original=','.join(i['id'] for i in saved()['items']);target=page.locator('#desktop [data-item=countdown]').bounding_box()
        page.mouse.move(r['x']+20,r['y']+20);page.mouse.down();page.wait_for_timeout(360);page.mouse.move(target['x']+target['width']-3,target['y']+target['height']/2,steps=15);page.wait_for_timeout(100);page.mouse.up()
        page.wait_for_function('(before)=>JSON.parse(localStorage.getItem("qiye.state.v5")).items.map(i=>i.id).join()!==before',arg=original)
        check('wallpaper long-press drop persists new order',not page.locator('#dialog').is_visible())
        for kind in ['countdown','workday','pomodoro','notes','todo','habit','clock','quote','converter','hotsearch','weather']:
            open_widget(kind);check(f'{kind} uses dedicated workspace, not enlarged card',page.locator('.utility-app,.weather-app,.hotsearch-app,.pomo-app,.cv-app').count()==1 and page.locator('.widget-viewer').count()==0)
            if kind=='countdown':
                page.locator('[data-life-action=countdown-edit]').click();page.locator('[name=eventTitle]').fill('Launch day');page.locator('[name=date]').fill('2027-03-21');page.locator('[data-life-form=countdown] [type=submit]').click();page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.widget==="countdown").data.events?.[0]?.title==="Launch day"');check('countdown settings update date and detail',page.locator('.countdown-detail h3').inner_text().startswith('Launch day'))
                page.screenshot(path=str(OUT/'countdown-dark.png'),animations='disabled')
            elif kind=='workday':
                page.locator('[name=endTime]').fill('19:30');page.locator('[name=payday]').fill('31');page.locator('[name=workdays][value="6"]').check();page.locator('[data-utility-form] [type=submit]').click();page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.widget==="workday").config.endTime==="19:30"');check('workday persists custom workweek',6 in next(i for i in saved()['items'] if i['widget']=='workday')['config']['workdays'])
            elif kind=='pomodoro':
                page.locator('[data-pomo-duration-form] [name=focusMinutes]').fill('5');page.locator('#dialog [data-pomo-action=toggle]').click();page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.widget==="pomodoro").data.status==="running"');check('direct duration and start persist together',next(i for i in saved()['items'] if i['widget']=='pomodoro')['data']['duration']==300)
            elif kind=='notes':
                page.locator('#dialog textarea').fill('Private note remains private');page.locator('[data-note-color=mint]').click();page.wait_for_timeout(750);check('notes edits survive saving style',next(i for i in saved()['items'] if i['widget']=='notes')['data']['notes']=='Private note remains private')
            elif kind=='todo':
                page.locator('#dialog [data-widget-form=todo] input').fill('Finish review');page.locator('#dialog [data-widget-form=todo] button').click();page.locator('#dialog [data-action=widget-todo-toggle]').check();page.locator('[data-todo-filter]').select_option('active');page.wait_for_timeout(100);check('todo filter hides completed tasks',page.locator('#dialog .w-todo-row:visible').count()==0);page.locator('[data-clear-done]').click();page.wait_for_timeout(100);check('clear completed persists',next(i for i in saved()['items'] if i['widget']=='todo')['data']['todos']==[])
            elif kind=='converter':
                page.locator('#cv-expression').fill('(7+3)*4');page.locator('#cv-expression').press('Enter');check('calculator adds session history',page.locator('.cv-history li strong').inner_text()=='40')
            elif kind=='weather':
                page.locator('[data-detail-action=weather-settings]').first.click();page.locator('[name=cityName]').fill('Osaka');page.locator('#weather-settings details:has([name=latitude])').evaluate('node=>node.open=true');page.locator('[name=latitude]').fill('34.69');page.locator('[name=longitude]').fill('135.5');page.locator('[name=unit]').select_option('fahrenheit');page.locator('#weather-settings [type=submit]').click();page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.widget==="weather").config.city.name==="Osaka"');check('weather city and units save inside forecast workspace',next(i for i in saved()['items'] if i['widget']=='weather')['config']['unit']=='fahrenheit')
            close()
        # Test both themes at narrow sizes using persisted preferences.
        for theme in ['dark','light']:
            page.evaluate('(theme)=>{const s=JSON.parse(localStorage.getItem("qiye.state.v5"));s.settings.theme=theme;localStorage.setItem("qiye.state.v5",JSON.stringify(s))}',theme);page.reload();page.set_viewport_size({'width':390,'height':844});open_widget('countdown')
            check(theme+' mobile tool fields stay inside dialog',page.locator('#dialog').evaluate('d=>[...d.querySelectorAll("input,button")].filter(e=>e.getClientRects().length && !e.closest(".countdown-categories")).every(e=>{const r=e.getBoundingClientRect(),b=d.getBoundingClientRect();return r.left>=b.left-1&&r.right<=b.right+1})'))
            page.screenshot(path=str(OUT/f'countdown-{theme}-mobile.png'),animations='disabled');close();page.set_viewport_size({'width':1440,'height':950})
        page.goto(url+'#import='+ 'https%3A%2F%2Fexample.org%2Flayout.json');page.reload();page.locator('[data-layout-load]').wait_for()
        check('share link opens preview form without network request',not any('example.org/layout.json' in x for x in requests));page.locator('[data-layout-load] button').click();page.locator('[data-layout-apply]').wait_for();before=saved();page.locator('[data-layout-apply] button').click();page.locator('[data-layout-undo]').wait_for();check('import creates groups without replacing current notes',len(saved()['groups'])==len(before['groups'])+1 and any(i.get('data',{}).get('notes')=='Private note remains private' for i in saved()['items']));page.locator('[data-layout-undo]').click();page.wait_for_timeout(150);check('one-click undo restores groups and items',saved()['items']==before['items'] and saved()['groups']==before['groups'])
        with page.expect_download() as download:
            page.locator('[data-layout-export] button').click()
        download.value.save_as(OUT/'qiye-layout.json');exported=(OUT/'qiye-layout.json').read_text(encoding='utf-8');check('export excludes notes and widget content','Private note' not in exported and '"data"' not in exported)
        page.locator('[data-add-tab=community]').click();page.locator('[data-community-source] button').click();page.locator('[data-community-card]').wait_for();page.locator('[data-community-size]').select_option('1x1');page.locator('[data-community-add]').click();page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.some(i=>i.widget==="community")');check('community installs selected size without starting remote page',not any('/examples/counter/index.html' in x for x in requests) and page.locator('[data-community-card] img').get_attribute('src').endswith('/1x1.svg') and next(i for i in saved()['items'] if i['widget']=='community')['size']=='1x1');close()
        item=next(i for i in saved()['items'] if i['widget']=='community');page.locator(f'#desktop [data-item="{item["id"]}"]').focus();page.keyboard.press('Enter');page.locator('[data-community-run]').click();frame=page.frame_locator('.community-frame-host iframe');frame.locator('#increase').wait_for();page.wait_for_function('document.querySelector("[data-community-status]").textContent.includes("正在运行")');frame.locator('#increase').click();page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.widget==="community").data.value===\'{"count":1}\'');check('isolated iframe saves only its own instance through port',next(i for i in saved()['items'] if i['widget']=='notes')['data']['notes']=='Private note remains private')
        check('iframe cannot read parent desktop or storage',frame.locator('body').evaluate('()=>{try{void parent.document;return false}catch{return true}}'));check('iframe sandbox excludes same-origin and navigation',page.locator('.community-frame-host iframe').get_attribute('sandbox')=='allow-scripts');page.screenshot(path=str(OUT/'community-running.png'),animations='disabled');page.locator('[data-community-stop]').click();check('stop removes running page',page.locator('.community-frame-host iframe').count()==0);close()
        print('PAGE_ERRORS',errors,flush=True);check('no uncaught JavaScript errors',not errors)
        (OUT/('preview.json' if args.preview else 'source.json')).write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
        print('PASS',len(checks),'checks')
    finally:browser.close();server.shutdown()
