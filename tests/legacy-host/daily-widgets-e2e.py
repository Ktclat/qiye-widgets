#!/usr/bin/env python3
"""Calendar, memo, weather and locale regression using a real HTTP origin.
External weather/geocoding services are controlled fixtures, not availability tests.
"""
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
args = parser.parse_args()
OUT = ROOT / 'test-results/daily-widgets'; OUT.mkdir(parents=True, exist_ok=True)
state0 = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {DEFAULT_STATE} from './src/core.js';console.log(JSON.stringify(DEFAULT_STATE))"], cwd=ROOT))
checks = []


def check(name, condition):
    assert condition, name
    checks.append(name); print('PASS', name, flush=True)


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/' + ('Qiye-preview.html' if args.preview else '')
forecast = {
    'timezone': 'Asia/Hong_Kong',
    'current': {'temperature_2m': 20, 'weather_code': 2, 'time': '2026-10-13T00:00', 'relative_humidity_2m': 62, 'apparent_temperature': 21, 'wind_speed_10m': 9},
    'hourly': {'time': [f'2026-10-13T{i:02}:00' for i in range(24)], 'temperature_2m': [20]*24, 'weather_code': [2]*24, 'precipitation_probability': [30]*24},
    'daily': {'time': [f'2026-10-{i:02}' for i in range(13,20)], 'weather_code': [2]*7, 'temperature_2m_min': [16]*7, 'temperature_2m_max': [25]*7, 'precipitation_probability_max': [40]*7, 'sunrise': ['2026-10-13T06:20']*7, 'sunset': ['2026-10-13T18:10']*7, 'uv_index_max': [5]*7},
}

with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH')
    browser = p.chromium.launch(**({'executable_path': executable} if executable else {}))
    try:
        for language, theme in [('en', 'dark'), ('zh-CN', 'light')]:
            state = copy.deepcopy(state0); state['settings'].update(language=language, theme=theme, autoExtractIcons=False)
            weather = next(i for i in state['items'] if i.get('widget') == 'weather'); weather['config']['enabled'] = True
            context = browser.new_context(viewport={'width':1440,'height':950}, locale='en-US')
            page = context.new_page(); page.set_default_timeout(10000)
            errors = []; page.on('pageerror', lambda error: errors.append(str(error)))
            requests = []; offline = [False]

            def route_api(route):
                url = route.request.url; requests.append(url)
                if 'geocoding-api.open-meteo.com' in url:
                    return route.fulfill(json={'results':[{'name':'Paris','latitude':48.85,'longitude':2.35,'country':'France'}]})
                if 'air-quality-api.open-meteo.com' in url:
                    return route.fulfill(json={'current':{'us_aqi':32,'pm2_5':4,'pm10':9}})
                if 'api.open-meteo.com' in url:
                    if offline[0]: return route.abort()
                    return route.fulfill(json=forecast)
                return route.abort()

            page.route('https://**/*', route_api)
            payload = json.dumps(state, ensure_ascii=False)
            page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'+json.dumps(payload)+')')
            page.goto(base, wait_until='domcontentloaded'); page.locator('[data-widget=calendar]').wait_for()

            def saved(): return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5"))')
            def close(): page.locator('[data-close]').first.click(); page.locator('#dialog').wait_for(state='hidden')
            def memo_count(count): page.wait_for_function('(count)=>JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.widget==="memo").data.entries.length===count',arg=count)

            check(f'{language} sets document language', page.locator('html').get_attribute('lang')==language)
            page.locator('[data-widget=calendar] [data-action=widget-calendar-detail]').click()
            page.locator('#calendar-year').select_option('2026'); page.locator('#calendar-month').select_option('10')
            page.locator('#widget-detail-body [data-calendar-date="2026-10-13"]').click()
            check(f'{language} calendar has 42 selectable dates', page.locator('#widget-detail-body .calendar-cell').count()==42)
            check(f'{language} ISO week statistics', '42' in page.locator('.calendar-day-detail').inner_text())
            page.locator('#calendar-event-form input').fill('Review <script>safe</script>')
            page.locator('#calendar-event-form button').click();page.locator('.calendar-events li span').wait_for()
            check(f'{language} event is text, not HTML', page.locator('.calendar-events').inner_text().startswith('Review <script>') and page.locator('.calendar-events script').count()==0)
            check(f'{language} dedicated calendar has no generic header', page.locator('#dialog .dialog-head').count()==0 and page.locator('.calendar-app-header [role=tab]').count()==2)
            page.screenshot(path=str(OUT/f'calendar-{language}.png'),animations='disabled')
            page.locator('[data-detail-action=window-expand]').click()
            check(f'{language} calendar maximizes', 'widget-app-expanded' in page.locator('#dialog').get_attribute('class'))
            page.locator('[data-detail-action=window-expand]').click()
            page.locator('[data-detail-action=calendar-page][data-page=tools]').click()
            page.locator('#date-tool-form [name=start]').fill('2026-10-01'); page.locator('#date-tool-form [name=end]').fill('2026-10-10')
            check(f'{language} date difference updates live', page.locator('#date-tool-result').inner_text().startswith('9'))
            page.locator('#date-offset-form [name=base]').fill('2024-02-28'); page.locator('#date-offset-form [name=offset]').fill('1')
            check(f'{language} date offset handles leap day', '29' in page.locator('#date-offset-result').inner_text())
            page.locator('[data-detail-action=offset-step][data-step="-1"]').click()
            check(f'{language} offset stepper updates result', '28' in page.locator('#date-offset-result').inner_text())
            page.screenshot(path=str(OUT/f'calendar-tools-{language}.png'),animations='disabled')
            page.locator('[data-detail-action=calendar-tool][data-tool=workdays]').click()
            check(f'{language} adjusted workday calculation', page.locator('#workday-tool-result').inner_text().startswith('3'))
            page.locator('[data-detail-action=calendar-tool][data-tool=festivals]').click()
            page.locator('#festival-year').fill('2026');page.locator('#festival-year').dispatch_event('change')
            check(f'{language} annual festival timeline', page.locator('.festival-month').count()==12 and page.locator('.festival-month button').count()>35)
            page.screenshot(path=str(OUT/f'calendar-festivals-{language}.png'),animations='disabled')
            page.locator('.festival-month [data-calendar-date="2026-02-17"]').click()
            check(f'{language} festival opens the selected day', '17' in page.locator('.calendar-tearoff').inner_text())
            page.locator('#calendar-main-tab').press('ArrowRight')
            check(f'{language} keyboard switches calendar tabs', page.locator('#calendar-tools-tab').get_attribute('aria-selected')=='true')
            close()
            page.locator('[data-widget=memo] [data-action=widget-memo-new]').first.click()
            page.locator('#memo-title').fill('First memo'); page.locator('#memo-text').fill('User text: 设置 <img src=x onerror=alert(1)>')
            page.locator('[data-detail-action=memo-new]').click()
            page.locator('#memo-title').fill('Second memo'); page.locator('#memo-text').fill('Second body'); memo_count(2)
            page.locator('#memo-query').fill('User text'); check(f'{language} full-text memo search', page.locator('.memo-entry').count()==1)
            page.locator('.memo-entry').click(); check(f'{language} switching memos saves the draft', page.locator('#memo-text').input_value().startswith('User text:'))
            page.locator('[data-detail-action=memo-pin]').click(); page.locator('#memo-query').fill('')
            check(f'{language} pinned memo stays first', page.locator('.memo-entry strong').first.inner_text().endswith('First memo'))
            with page.expect_download() as download:
                page.locator('[data-detail-action=memo-export]').click()
            check(f'{language} memo exports a text file', download.value.suggested_filename=='First memo.txt')
            check(f'{language} memo uses dedicated left/right layout', page.locator('#dialog .dialog-head').count()==0 and page.locator('.memo-sidebar').bounding_box()['x']<page.locator('.memo-editor').bounding_box()['x'])
            check(f'{language} memo shows edit and creation dates', bool(page.locator('#memo-updated').inner_text()) and page.locator('.memo-status time').count()==1)
            content_before = page.locator('#memo-text').input_value()
            page.locator('#memo-text').fill('Long memo\n' * 200)
            page.locator('#memo-text').evaluate('n=>{n.setSelectionRange(20,30);n.scrollTop=800;}')
            page.locator('[data-detail-action=window-expand]').click()
            check(f'{language} maximize preserves memo selection and scroll', page.locator('#memo-text').evaluate('n=>n.selectionStart===20 && n.selectionEnd===30 && n.scrollTop===800'))
            page.locator('[data-detail-action=window-expand]').click()
            page.locator('#memo-text').fill(content_before)
            page.screenshot(path=str(OUT/f'memo-{language}.png'),animations='disabled')
            page.locator('[data-detail-action=memo-delete]').click(); memo_count(1)
            page.locator('[data-detail-action=memo-undo]').click(); memo_count(2);page.wait_for_function('document.querySelector("#memo-title")?.value==="First memo"')
            check(f'{language} delete can be undone', page.locator('#memo-title').input_value()=='First memo')
            page.evaluate('''() => { window.originalLockRequest = navigator.locks.request.bind(navigator.locks); navigator.locks.request = (...args) => new Promise(resolve => { window.resumeSave = () => resolve(window.originalLockRequest(...args)); }); }''')
            page.locator('#memo-text').fill('Close flushes this draft'); page.locator('[data-close]').first.click()
            page.wait_for_function('typeof window.resumeSave === "function"')
            check(f'{language} closing waits for the storage write',page.locator('#dialog').is_visible())
            page.evaluate('() => { navigator.locks.request = window.originalLockRequest; window.resumeSave(); }')
            page.locator('#dialog').wait_for(state='hidden');page.reload();page.locator('[data-widget=memo]').wait_for()
            check(f'{language} closing flushes pending edits', any(e['text']=='Close flushes this draft' for e in next(i for i in saved()['items'] if i.get('widget')=='memo')['data']['entries']))
            check(f'{language} events survive reload', next(i for i in saved()['items'] if i.get('widget')=='calendar')['data']['events'][0]['title'].startswith('Review <script>'))
            page.locator('[data-widget=memo] [data-action=widget-memo-open]').last.click()
            page.evaluate('''() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if(key === "qiye.state.v5") throw new DOMException("Quota exceeded", "QuotaExceededError"); return window.originalSetItem.call(this,key,value); }; }''')
            page.locator('#memo-text').fill('Recover this failed draft')
            page.locator('.widget-save-feedback').wait_for(state='visible')
            close();page.locator('[data-widget=memo] [data-action=widget-memo-open]').last.click()
            check(f'{language} failed save preserves draft after reopening',page.locator('#memo-text').input_value()=='Recover this failed draft')
            with page.expect_download() as unsaved:
                page.locator('[data-detail-action=draft-export]').click()
            check(f'{language} failed draft remains exportable',unsaved.value.suggested_filename=='Qiye-unsaved-widget.json')
            page.evaluate('() => { Storage.prototype.setItem = window.originalSetItem; }')
            page.locator('[data-detail-action=save-retry]').click()
            page.locator('.widget-save-feedback').wait_for(state='hidden')
            check(f'{language} retry saves recovered draft', any(e['text']=='Recover this failed draft' for e in next(i for i in saved()['items'] if i.get('widget')=='memo')['data']['entries']))
            close()
            page.locator('[data-action=widget-weather-detail]').click();page.locator('.daily-weather>div').first.wait_for()
            check(f'{language} full forecast and AQI', page.locator('.hourly-weather>div').count()==24 and page.locator('.daily-weather>div').count()==7 and '32' in page.locator('.weather-air').inner_text())
            page.screenshot(path=str(OUT/f'weather-{language}.png'),animations='disabled')
            offline[0]=True;page.locator('[data-detail-action=weather-refresh]').click();page.wait_for_function('!document.querySelector("[data-detail-action=weather-refresh]").disabled')
            check(f'{language} network failure retains forecast', page.locator('.daily-weather>div').count()==7); offline[0]=False;close()
            page.locator('[data-widget=weather] [data-action=widget-config]').click()
            page.locator('#city-query').fill('Paris');page.locator('#city-query').press('Enter');page.locator('[data-city-result]').first.click()
            check(f'{language} city search fills coordinates', page.locator('[name=latitude]').input_value()=='48.85')
            page.locator('[name=unit]').select_option('fahrenheit');page.locator('#widget-form button[type=submit]').click();page.locator('#dialog').wait_for(state='hidden')
            page.wait_for_function('document.querySelector(".w-weather-current strong")?.textContent.includes("68")')
            check(f'{language} units persist per widget', next(i for i in saved()['items'] if i.get('widget')=='weather')['config']['unit']=='fahrenheit')
            page.locator('#brand-button').click();page.locator('[data-preference=language]').select_option('en' if language=='zh-CN' else 'zh-CN')
            page.wait_for_function('(title)=>document.querySelector("#workspace-title")?.textContent===title',arg='Settings' if language=='zh-CN' else '设置')
            check(f'{language} language switch is immediate', page.locator('#workspace-title').inner_text()==('Settings' if language=='zh-CN' else '设置'))
            close();page.reload();page.locator('[data-widget=memo]').wait_for()
            check(f'{language} language survives reload and preserves user text', any(e['title']=='First memo' for e in next(i for i in saved()['items'] if i.get('widget')=='memo')['data']['entries']))
            page.set_viewport_size({'width':360,'height':640});page.locator('[data-widget=memo] [data-action=widget-memo-open]').last.click()
            check(f'{language} narrow memo dialog has no horizontal overflow', page.locator('#dialog').evaluate('n=>n.scrollWidth<=n.clientWidth+1'))
            page.locator('[data-detail-action=memo-toggle-list]').click()
            check(f'{language} mobile memo list opens', page.locator('.memo-sidebar').is_visible())
            page.locator('.memo-entry').first.click()
            check(f'{language} mobile memo selection returns to editor', page.locator('#memo-text').is_visible() and not page.locator('.memo-sidebar').is_visible())
            page.screenshot(path=str(OUT/f'memo-mobile-{language}.png'),animations='disabled');close()
            page.locator('#brand-button').click();page.locator('[data-settings-tab=appearance]').click()
            page.locator('[data-preference=windowSize]').select_option('150')
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).settings.windowSize===150');close()
            for selector in ['[data-action=widget-calendar-detail]','[data-widget=memo] [data-action=widget-memo-open]','[data-action=widget-weather-detail]']:
                page.locator(selector).last.click()
                check(f'{language} 360px at 150% fits {selector}',page.locator('#dialog').evaluate('n=>n.scrollWidth<=n.clientWidth+1') and page.locator('#widget-detail-body,#weather-workspace').evaluate('n=>n.scrollWidth<=n.clientWidth+1'))
                page.keyboard.press('Escape');page.locator('#dialog').wait_for(state='hidden')
            check(f'{language} no uncaught JavaScript errors', not errors)
            context.close()
        # An untouched browser chooses English without rewriting imported content.
        context=browser.new_context(locale='en-US');page=context.new_page();page.route('https://**/*',lambda route:route.abort());page.goto(base);page.locator('[data-widget=memo]').wait_for()
        check('Fresh browser uses English defaults', page.locator('html').get_attribute('lang')=='en' and page.locator('[data-group=home]').inner_text()=='Home')
        context.close()
    finally:
        browser.close();server.shutdown()
(OUT/('preview-report.json' if args.preview else 'report.json')).write_text(json.dumps({'checks':checks,'passed':len(checks),'external_api_fixtures':True},indent=2),encoding='utf-8')
print(f'{len(checks)} daily widget checks passed.',flush=True)
