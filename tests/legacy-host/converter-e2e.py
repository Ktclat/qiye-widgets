#!/usr/bin/env python3
"""Converter workspace checks on production modules or the generated preview."""
import argparse
import copy
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--preview', action='store_true')
parser.add_argument('--url')
args = parser.parse_args()
OUT = ROOT / 'output/playwright/converter'
OUT.mkdir(parents=True, exist_ok=True)
state0 = json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {DEFAULT_STATE} from './src/core.js';console.log(JSON.stringify(DEFAULT_STATE))"],cwd=ROOT))
checks = []

def check(name, condition):
    assert condition, name
    checks.append(name)
    print('PASS', name, flush=True)

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

server = ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base = args.url or f'http://127.0.0.1:{server.server_port}/' + ('Qiye-preview.html' if args.preview else '')
suffix = '-live' if args.url else '-preview' if args.preview else ''
with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH')
    browser = p.chromium.launch(**({'executable_path':executable} if executable else {}))
    try:
        for language,theme in [('zh-CN','light'),('en','dark')]:
            state = copy.deepcopy(state0)
            seed = next(i for i in state['items'] if i.get('widget') == 'converter')
            state['items'] = []
            state['activeGroupId'] = state['groups'][0]['id']
            state['settings'].update(language=language,theme=theme,autoExtractIcons=False,wallpaperApiEnabled=False)
            for size in ['1x1','1x2','2x1','2x2','4x2']:
                item = copy.deepcopy(seed)
                item.update(id='converter-'+size,groupId=state['activeGroupId'],size=size,title='换算器' if language=='zh-CN' else 'Converter')
                state['items'].append(item)
            context = browser.new_context(viewport={'width':1440,'height':1000},permissions=['clipboard-read','clipboard-write'],timezone_id='America/New_York')
            page = context.new_page()
            page.set_default_timeout(10000)
            errors,requests = [],[]
            page.on('pageerror',lambda error: errors.append(str(error)))
            page.on('request',lambda request: requests.append(request.url))
            page.route('https://**/*',lambda route: route.abort())
            if args.url:
                page.unroute('https://**/*')
            payload = json.dumps(state,ensure_ascii=False)
            page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'+json.dumps(payload)+')')
            page.goto(base,wait_until='domcontentloaded')
            page.locator('[data-widget-id="converter-2x2"] [data-action=widget-open]').first.wait_for()
            page.screenshot(path=str(OUT/f'{language}-cards{suffix}.png'))
            for size in ['1x1','1x2','2x1','2x2','4x2']:
                card = page.locator(f'[data-widget-id="converter-{size}"]')
                check(f'{language} compact card {size} fits',card.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1 && el.scrollHeight<=el.clientHeight+1'))
            page.locator('.top-tools [data-action=add]').click()
            page.locator('[data-add-tab=widgets]').click()
            check(f'{language} catalog replaces calculator',page.locator('[data-catalog-widget=calculator]').count()==0 and page.locator('[data-catalog-widget=converter]').count()==1)
            page.locator('#dialog [data-close]').first.click()
            def open_widget():
                page.locator('[data-widget-id="converter-2x2"] [data-action=widget-open]').first.click()
                page.locator('.cv-header').wait_for()
            def mode(name):
                if page.locator('.cv-nav').is_visible(): page.locator(f'[data-cv-category={name}]').click()
                else: page.locator('[data-cv-select]').select_option(name)
            open_widget()
            check(f'{language} 46px single-row header',page.locator('.cv-header').evaluate('el=>Math.abs(el.getBoundingClientRect().height-46)<1'))
            check(f'{language} title gets initial focus',page.evaluate('document.activeElement.id')=='dialog-title')
            check(f'{language} 20 modes',page.locator('[data-cv-category]').count()==20)
            page.locator('#cv-expression').fill('(7+3)*4')
            page.locator('#cv-expression').press('Enter')
            check(f'{language} arithmetic and history',page.locator('#cv-expression').input_value()=='40' and page.locator('.cv-history li').count()==1)
            page.locator('#cv-expression').fill('1e-7*10')
            page.locator('#cv-expression').press('Enter')
            check(f'{language} scientific result reusable',float(page.locator('#cv-expression').input_value())==1e-6)
            page.locator('#cv-expression').press('Escape')
            check(f'{language} Escape clears without closing',page.locator('#dialog').is_visible() and page.locator('#cv-expression').input_value()=='')
            page.screenshot(path=str(OUT/f'{language}-calculator{suffix}.png'))
            mode('length')
            page.locator('[data-cv-value="0"]').fill('2.54')
            check(f'{language} forward conversion',page.locator('[data-cv-value="1"]').input_value()=='254')
            page.locator('[data-cv-value="1"]').fill('100')
            check(f'{language} reverse editing',page.locator('[data-cv-value="0"]').input_value()=='1')
            page.locator('[data-cv-action=swap]').click()
            check(f'{language} swap preserves quantity',page.locator('[data-cv-unit="0"]').input_value()=='cm' and page.locator('[data-cv-value="1"]').input_value()=='1')
            page.locator('[data-cv-action=copy]').click()
            check(f'{language} result copy',page.evaluate('navigator.clipboard.readText()')=='1')
            page.screenshot(path=str(OUT/f'{language}-length{suffix}.png'))
            mode('temperature')
            page.locator('[data-cv-value="0"]').fill('-274')
            check(f'{language} absolute zero validation',page.locator('[data-cv-value="1"]').input_value()=='' and bool(page.locator('#cv-status').inner_text()))
            page.locator('[data-cv-value="0"]').fill('0')
            check(f'{language} freezing point',page.locator('[data-cv-value="1"]').input_value()=='32')
            mode('bmi')
            page.locator('#cv-height').fill('180'); page.locator('#cv-weight').fill('81')
            check(f'{language} BMI threshold',page.locator('[data-cv-bmi]').inner_text()=='25.0')
            page.locator('#cv-bmi-system').select_option('imperial')
            check(f'{language} BMI unit switch preserves result',page.locator('[data-cv-bmi]').inner_text()=='25.0')
            page.screenshot(path=str(OUT/f'{language}-bmi{suffix}.png'))
            mode('date')
            page.locator('#cv-date-start').fill('2026-03-07'); page.locator('#cv-date-end').fill('2026-03-09')
            check(f'{language} calendar dates across DST',page.locator('[data-cv-date-result]').inner_text()=='2')
            page.locator('#cv-inclusive').check()
            check(f'{language} inclusive dates',page.locator('[data-cv-date-result]').inner_text()=='3')
            page.locator('[data-cv-date-mode=add]').click()
            page.locator('#cv-date-start').fill('2024-01-31');page.locator('#cv-months').fill('1')
            check(f'{language} leap-year month clamp',page.locator('[data-cv-date-result]').inner_text()=='2024-02-29')
            page.screenshot(path=str(OUT/f'{language}-date{suffix}.png'))
            mode('timestamp')
            page.locator('#cv-iso').fill('1970-01-01T08:00:00+08:00')
            check(f'{language} explicit timezone conversion',page.locator('#cv-timestamp').input_value()=='0')
            page.locator('#cv-timestamp').fill('-1')
            check(f'{language} negative epoch',page.locator('#cv-iso').input_value()=='1969-12-31T23:59:59.000Z')
            mode('currency')
            check(f'{language} no request without consent',not any('frankfurter' in url for url in requests))
            def rate_route(route):
                pair = route.request.url.split('/')[-2:]
                route.fulfill(status=200,content_type='application/json',body=json.dumps({'base':pair[0],'quote':pair[1],'rate':0.14,'date':'2026-10-14'}))
            page.route('https://api.frankfurter.dev/**',rate_route)
            page.locator('[data-cv-action=rate]').click()
            page.wait_for_function('document.querySelector("[data-cv-value=\\"1\\"]").value === "0.14"')
            check(f'{language} reference rate and provenance', '2026-10-14' in page.locator('[data-cv-rate-date]').inner_text())
            page.locator('[data-cv-value="0"]').fill('100')
            check(f'{language} amount stays local',page.locator('[data-cv-value="1"]').input_value()=='14' and all('100' not in u for u in requests if 'frankfurter' in u))
            page.unroute('https://api.frankfurter.dev/**');page.route('https://api.frankfurter.dev/**',lambda route:route.abort())
            page.locator('[data-cv-action=rate]').click()
            page.wait_for_function('!document.querySelector("[data-cv-action=rate]").disabled')
            check(f'{language} failure retains dated cache',page.locator('[data-cv-value="1"]').input_value()=='14' and ('缓存' if language=='zh-CN' else 'cached') in page.locator('[data-cv-rate-status]').inner_text())
            page.screenshot(path=str(OUT/f'{language}-currency{suffix}.png'))
            page.locator('[data-cv-action=settings]').click();page.locator('[data-cv-online]').uncheck();page.locator('[data-cv-precision]').select_option('2')
            page.locator('[data-cv-action=settings]').click()
            mode('mass');page.locator('[data-cv-unit="0"]').select_option('lb')
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="converter-2x2").data.pairs.mass[0]==="lb"')
            page.reload(wait_until='domcontentloaded');open_widget()
            check(f'{language} preferences persist independently',page.locator('[data-cv-select]').input_value()=='mass' and page.locator('[data-cv-unit="0"]').input_value()=='lb' and page.locator('[data-cv-precision]').input_value()=='2')
            check(f'{language} other card preferences unchanged',page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="converter-1x1").data.category')=='calculator')
            page.evaluate('() => { window.converterOriginalSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(key,value){if(key==="qiye.state.v5")throw new DOMException("Test quota","QuotaExceededError");return window.converterOriginalSetItem.call(this,key,value)}; }')
            mode('area')
            page.locator('[data-cv-action=retry]').wait_for(state='visible')
            check(f'{language} failed save keeps draft and offers retry',page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="converter-2x2").data.category')=='mass')
            page.locator('#dialog [data-close]').click();open_widget()
            check(f'{language} failed draft survives reopening',page.locator('[data-cv-select]').input_value()=='area')
            page.evaluate('() => { Storage.prototype.setItem=window.converterOriginalSetItem; }')
            page.locator('[data-cv-action=retry]').click()
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="converter-2x2").data.category==="area"')
            check(f'{language} save retry persists recovered draft',True)
            page.locator('[data-cv-search]').fill('kelvin')
            check(f'{language} searches unit names',page.locator('[data-cv-category]:visible').count()==1 and page.locator('[data-cv-category=temperature]').is_visible())
            page.locator('[data-cv-search]').press('Enter');page.locator('[data-cv-search]').fill('')
            page.locator('[data-detail-action=window-expand]').click()
            check(f'{language} maximize remains within viewport',page.locator('#dialog').evaluate('el=>el.getBoundingClientRect().right<=innerWidth && el.getBoundingClientRect().bottom<=innerHeight'))
            page.locator('[data-detail-action=window-expand]').click()
            page.set_viewport_size({'width':390,'height':844})
            # Wait for the responsive controls before deciding how to switch categories.
            page.locator('[data-cv-select]').wait_for(state='visible')
            for name in ['calculator','length','currency','bmi','date','volume','angle','force','timestamp','data']:
                mode(name)
                check(f'{language} narrow {name} fits',page.locator('#dialog').evaluate('el=>el.scrollWidth<=el.clientWidth+1') and page.locator('.cv-main').evaluate('el=>el.scrollWidth<=el.clientWidth+1'))
            mode('length');page.screenshot(path=str(OUT/f'{language}-narrow{suffix}.png'))
            page.locator('[data-cv-value="0"]').focus();page.keyboard.press('Tab')
            check(f'{language} keyboard focus visible',page.evaluate('document.activeElement.matches(":focus-visible")'))
            if language=='en':
                # Chinese customary units retain their official symbols (chi, cun, li).
                text = page.locator('.cv-app').inner_text()
                for symbol in ['尺','寸','里']:
                    text = text.replace(symbol,'')
                import re
                check('English converter has no untranslated Chinese text',not re.search('[\u3400-\u9fff]',text))
            check(f'{language} no browser exceptions',not errors)
            context.close()
    finally:
        browser.close(); server.shutdown()
print(f'{len(checks)} converter browser checks passed',flush=True)
