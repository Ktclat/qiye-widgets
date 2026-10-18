#!/usr/bin/env python3
"""Map workspace interactions with controlled provider responses, never live tile scans."""
import argparse
import copy
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/playwright/map'
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--preview', action='store_true')
args = parser.parse_args()
seed = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {DEFAULT_STATE} from './src/core.js';import {newWidgetConfig} from './src/widget-registry.js';import {newWidgetData} from './src/widget-data.js';const state=structuredClone(DEFAULT_STATE);state.items=[{id:'map-e2e',groupId:'home',type:'widget',widget:'map',title:'地图',size:'4x2',config:newWidgetConfig('map'),data:newWidgetData('map')}];console.log(JSON.stringify(state))"], cwd=ROOT))
checks = []

def check(label, condition=True):
    assert condition, label
    checks.append(label)
    print('PASS', label, flush=True)

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/' + ('Qiye-preview.html' if args.preview else '')
tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e7ece1"/><path d="M0 0H256V256H0Z M0 128H256 M128 0V256" fill="none" stroke="#d4ddcf"/><text x="24" y="60" fill="#71866c" font-size="12">CONTROLLED TEST TILE</text></svg>'
with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH')
    browser = p.chromium.launch(**({'executable_path': executable} if executable else {}))
    try:
        for language, theme in [('zh-CN', 'light'), ('en', 'dark')]:
            state = copy.deepcopy(seed)
            state['settings'].update(language=language, theme=theme, autoExtractIcons=False)
            context = browser.new_context(viewport={'width':1440,'height':960}, permissions=['clipboard-read','clipboard-write'])
            page = context.new_page()
            page.set_default_timeout(10000)
            errors, requests = [], []
            fail_tiles = [False]
            page.on('pageerror', lambda error: errors.append(str(error)))
            map_hosts=['tile.openstreetmap.org','mapapi.geodata.gov.hk','wmts.nlsc.gov.tw','tianditu.gov.cn','restapi.amap.com','tiles.example.com','api.hkmapservice.gov.hk']
            page.on('request', lambda request: requests.append(request.url) if any(host in request.url for host in map_hosts) else None)
            def route_network(route):
                request = route.request.url
                if '/v3/place/text' in request:
                    route.fulfill(json={'status':'1','pois':[{'name':'深圳测试地点','location':'114.0630,22.5400','address':'Test address'}]})
                elif any(host in request for host in ['tile.openstreetmap.org','mapapi.geodata.gov.hk','wmts.nlsc.gov.tw','tianditu.gov.cn','restapi.amap.com','tiles.example.com']):
                    if fail_tiles[0]: route.abort()
                    else: route.fulfill(body=tile, content_type='image/svg+xml', headers={'Access-Control-Allow-Origin':'*'})
                else: route.abort()
            page.route('https://**/*', route_network)
            payload = json.dumps(state, ensure_ascii=False)
            page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'+json.dumps(payload)+')')
            try:
                page.goto(url, wait_until='domcontentloaded')
                page.locator('#desktop [data-widget=map]').wait_for()
                def saved():
                    page.wait_for_function('document.querySelector("#map-workspace").dataset.mapPersistence==="saved"')
                def place(name):
                    query.fill(name)
                    page.locator('[data-map-result]').first.click()
                    saved()
                def menu():
                    if page.locator('#map-source-menu').is_hidden(): page.locator('[data-map-action=sources]').click()
                def close_menu():
                    if page.locator('#map-source-menu').is_visible(): page.locator('[data-map-action=sources]').click()
                def screenshot(name):
                    page.screenshot(path=str(OUT/f'{name}-{language}{"-preview" if args.preview else ""}.png'),animations='disabled')
                check(f'{language} card does not request any map provider',not requests)
                page.locator('#desktop .map-card-open').click()
                query=page.locator('#map-search-form [name=query]')
                expect(page.locator('.map-app')).to_be_visible()
                check(f'{language} starts with search only and no suggested location',page.locator('.map-sidebar').is_hidden() and page.locator('[data-map-results]').inner_text()=='' and page.locator('.map-selected-marker').is_hidden())
                check(f'{language} has one slim header and no region or footer rows',page.locator('.map-regions,.map-toolbar,.map-footer').count()==0 and page.locator('.map-header').evaluate('e=>parseFloat(getComputedStyle(e).height)')==48)
                check(f'{language} header holds search source and saved places',page.locator('.map-header #map-search-form').count()==1 and page.locator('.map-header [data-map-action=sources]').is_visible())
                check(f'{language} unopened maps remain offline',not requests)
                page.locator('[data-map-action=enable]').click()
                expect(page.locator('[data-map-gate]')).to_be_hidden()
                expect(page.locator('[data-map-notice]')).to_be_visible()
                page.locator('[data-map-action=dismiss-notice]').click()
                expect(page.locator('[data-map-notice]')).to_be_hidden()
                check(f'{language} fallback notice is dismissible and remembered',page.evaluate('JSON.parse(localStorage.getItem("qiye.map.sources.v1")).showSourceNotices===false'))
                screenshot('browse')
                place('澳門')
                check(f'{language} traditional alias opens a place card',page.locator('[data-map-selection]').is_visible() and page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items[0].data.selected.region')=='MO')
                page.locator('[data-map-action=favorite]').click();saved()
                page.locator('[data-map-action=copy]').click()
                check(f'{language} coordinates copy with their coordinate system','WGS84' in page.evaluate('navigator.clipboard.readText()'))
                page.locator('[data-map-action=places]').click()
                expect(page.locator('[data-map-result]')).to_have_count(1)
                page.locator('[data-map-result]').click();saved()
                check(f'{language} saved places reopen without schema errors',page.locator('[data-map-action=favorite]').get_attribute('aria-pressed')=='true')
                page.locator('[data-map-action=panel-close]').click()
                expect(page.locator('.map-sidebar')).to_be_hidden()
                check(f'{language} closing a place returns to an unobstructed map',query.input_value()=='' and page.locator('.map-selected-marker').is_hidden())
                viewport=page.locator('.map-viewport')
                rect=viewport.bounding_box()
                page.mouse.click(rect['x']+rect['width']*.7,rect['y']+rect['height']*.5);saved()
                expect(page.locator('[data-map-selection]')).to_be_visible()
                page.locator('[data-map-action=favorite]').click();saved()
                page.locator('[data-map-action=zoom-in]').click();saved()
                check(f'{language} picking saving favoriting and zooming persist sequentially without false conflicts',page.locator('[data-map-save-state]').is_hidden() and page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items[0].data.favorites.length')==2)
                place('香港')
                check(f'{language} searching Hong Kong selects official base and labels',any('/basemap/WGS84/' in u for u in requests) and any('/label/hk/' in u for u in requests))
                menu();expect(page.locator('[data-map-layer=satellite]')).to_be_disabled();close_menu()
                check(f'{language} attribution remains visible',page.locator('[data-map-attribution]').is_visible() and 'Lands Department' in page.locator('[data-map-attribution]').inner_text())
                page.locator('[data-map-action=clear-search]').click()
                before=page.locator('[data-map-center]').text_content()
                rect=viewport.bounding_box()
                page.mouse.move(rect['x']+rect['width']/2,rect['y']+rect['height']/2);page.mouse.down();page.mouse.move(rect['x']+rect['width']/2+80,rect['y']+rect['height']/2+40,steps=8);page.mouse.up();saved()
                check(f'{language} dragging changes map center without opening details',page.locator('[data-map-center]').text_content()!=before and page.locator('.map-sidebar').is_hidden())
                center=page.locator('[data-map-center]').text_content()
                check(f'{language} drag stays near Hong Kong',113<float(center.split(',')[0])<115)
                viewport.focus();viewport.press('ArrowRight');saved()
                check(f'{language} keyboard panning works',page.locator('[data-map-center]').text_content()!=center)
                place('台北')
                menu();page.locator('[data-map-layer=satellite]').click()
                page.wait_for_function('document.querySelector("[data-map-layer=satellite]").getAttribute("aria-pressed")==="true"');close_menu()
                check(f'{language} Taiwan satellite uses PHOTO2',any('/PHOTO2/' in u for u in requests))
                screenshot('workspace')
                page.locator('[data-map-action=settings]').first.click()
                form=page.locator('#map-settings-form')
                expect(form.locator('[name=showSourceNotices]')).not_to_be_checked()
                form.locator('[name=amapKey]').fill('map-test-key');form.locator('[name=tiandituKey]').fill('tdt-test-key')
                for name in ['Custom one','Custom two']:
                    page.locator('[data-map-action=add-source]').click();custom=page.locator('[data-map-custom]').last
                    custom.locator('[name=custom-name]').fill(name);custom.locator('[name=custom-template]').fill('https://tiles.example.com/{z}/{x}/{y}.png');custom.locator('[name=custom-credit]').fill('© Test provider');custom.locator('[name=custom-credit]').press('Tab')
                screenshot('settings');form.locator('[type=submit]').click()
                expect(page.locator('.map-settings-panel')).to_be_hidden()
                check(f'{language} multiple custom sources are saved locally',page.evaluate('JSON.parse(localStorage.getItem("qiye.map.sources.v1")).custom.length')==2)
                check(f'{language} keys never enter the desktop backup',not page.evaluate('localStorage.getItem("qiye.state.v5").includes("map-test-key")'))
                place('深圳')
                page.wait_for_function('document.querySelector("[data-map-provider]").textContent.includes("Amap") || document.querySelector("[data-map-provider]").textContent.includes("高德")')
                check(f'{language} mainland picks configured Amap static service',any('/v3/staticmap?' in u for u in requests))
                page.locator('[data-map-action=search-options]').click();page.locator('[name=searchSource]').select_option('amap');page.locator('[data-map-action=search-options]').click()
                query.fill('测试地点')
                check(f'{language} Amap search waits for submit',not any('/v3/place/text' in u for u in requests))
                query.press('Enter');page.locator('[data-map-result]').wait_for();page.locator('[data-map-result]').click();saved()
                expect(page.locator('.map-coordinate-line')).to_contain_text('GCJ-02')
                page.locator('[data-map-action=favorite]').click();saved()
                menu();page.locator('[data-map-source]').select_option('osm')
                page.wait_for_function('document.querySelector("[data-map-provider]").textContent==="OpenStreetMap"');close_menu()
                expect(page.locator('.map-coordinate-line')).to_contain_text('GCJ-02')
                check(f'{language} provider changes retain original selected coordinate system')
                fail_tiles[0]=True;page.locator('[data-map-action=zoom-in]').click()
                page.wait_for_function('document.querySelector("[data-map-load]").dataset.status==="error"')
                check(f'{language} failed tiles show retry',page.locator('[data-map-action=retry]').is_visible())
                fail_tiles[0]=False;page.locator('[data-map-action=retry]').click();expect(page.locator('[data-map-load]')).to_be_hidden();saved()
                page.locator('[data-map-action=settings]').first.click();page.locator('[name=enabled]').uncheck();page.locator('#map-settings-form [type=submit]').click()
                expect(page.locator('[data-map-gate]')).to_be_visible()
                check(f'{language} disabling maps clears network images',page.locator('.map-image-plane img').count()==0)
                page.locator('[data-close]').click();expect(page.locator('#dialog')).to_be_hidden()
                before_close=len(requests);page.reload();page.locator('#desktop [data-widget=map]').wait_for()
                check(f'{language} reopening desktop makes no background map requests',len(requests)==before_close)
                page.set_viewport_size({'width':360,'height':740});page.locator('#desktop .map-card-open').click()
                expect(page.locator('.map-sidebar')).to_be_hidden()
                check(f'{language} narrow map uses full available width',page.locator('.map-stage').bounding_box()['width']>300)
                check(f'{language} narrow single header has no overflow',page.locator('.map-header').evaluate('e=>e.scrollWidth<=e.clientWidth+1') and page.locator('#dialog').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
                page.locator('[data-map-action=places]').click();expect(page.locator('[data-map-result]')).to_have_count(3)
                page.locator('[data-map-result]').first.click();saved()
                expect(page.locator('[data-map-selection]')).to_be_visible();screenshot('mobile')
                page.keyboard.press('Escape');expect(page.locator('.map-sidebar')).to_be_hidden();expect(page.locator('#dialog')).to_be_visible()
                check(f'{language} Escape clears place details before closing map')
                menu();check(f'{language} source and layer menu fits narrow windows',page.locator('#map-source-menu').evaluate('e=>e.scrollWidth<=e.clientWidth+1'));close_menu()
                page.locator('[data-map-action=settings]').first.click()
                check(f'{language} narrow settings have no horizontal overflow',page.locator('.map-settings-panel').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
                page.locator('[name=enabled]').check();page.locator('#map-settings-form [type=submit]').click();expect(page.locator('.map-settings-panel')).to_be_hidden()
                check(f'{language} dismissed notices stay dismissed after refresh',page.locator('[data-map-notice]').is_hidden())
                page.locator('[data-map-action=settings]').first.click();page.locator('[name=showSourceNotices]').check();page.locator('#map-settings-form [type=submit]').click();expect(page.locator('.map-settings-panel')).to_be_hidden()
                check(f'{language} source notices can be restored in settings',page.evaluate('JSON.parse(localStorage.getItem("qiye.map.sources.v1")).showSourceNotices===true'))
                page.locator('[data-map-action=settings]').first.click();page.keyboard.press('Escape');expect(page.locator('.map-settings-panel')).to_be_hidden();expect(page.locator('#dialog')).to_be_visible()
                check(f'{language} Escape closes settings before the map')
                saved();page.locator('[data-close]').click();expect(page.locator('#dialog')).to_be_hidden()
                page.evaluate("""() => { const s=JSON.parse(localStorage.getItem('qiye.state.v5')); const original=s.items[0];s.items=['1x1','1x2','2x1','2x2','4x2'].map((size,i)=>({...original,id:'map-'+i,size}));localStorage.setItem('qiye.state.v5',JSON.stringify(s)); }""")
                page.set_viewport_size({'width':1440,'height':960});page.reload();expect(page.locator('#desktop [data-widget=map]')).to_have_count(5);screenshot('cards')
                check(f'{language} five sizes fit without extra region strips',page.locator('.map-card-regions').count()==0 and page.locator('#desktop [data-widget=map]').evaluate_all('nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1&&n.scrollHeight<=n.clientHeight+1)'))
                check(f'{language} no uncaught browser errors',not errors)
            except Exception:
                page.screenshot(path=str(OUT/'failure.png'))
                (OUT/'failure.txt').write_text(page.locator('body').inner_text()+'\n'+json.dumps(errors),encoding='utf-8')
                (OUT/'geometry.json').write_text(json.dumps(page.evaluate('''() => ['#dialog','#dialog-content','#map-workspace','.map-app','.map-header','.map-regions','.map-layout','.map-stage','.map-footer','.map-settings-panel'].map(s=>{const n=document.querySelector(s);if(!n)return {s};const r=n.getBoundingClientRect(),c=getComputedStyle(n);return {s,r:r.toJSON(),client:[n.clientWidth,n.clientHeight],scroll:[n.scrollWidth,n.scrollHeight,n.scrollTop,n.scrollLeft],height:c.height,width:c.width,display:c.display,position:c.position,flex:c.flex,background:c.background};})'''),indent=2),encoding='utf-8')
                raise
            finally:
                context.close()
        (OUT/f'report{"-preview" if args.preview else ""}.json').write_text(json.dumps({'checks':checks,'passed':len(checks),'browser':browser.version},indent=2),encoding='utf-8')
    finally:
        browser.close()
        server.shutdown()
print(f'{len(checks)} map checks passed.', flush=True)
