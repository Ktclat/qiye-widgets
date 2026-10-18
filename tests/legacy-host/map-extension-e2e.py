#!/usr/bin/env python3
"""Native MV3 map smoke test with fixture tiles and a disposable permission manifest."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/playwright/map'
OUT.mkdir(parents=True,exist_ok=True)
seed=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {DEFAULT_STATE} from './src/core.js';import {newWidgetConfig} from './src/widget-registry.js';import {newWidgetData} from './src/widget-data.js';const s=structuredClone(DEFAULT_STATE);s.settings.language='zh-CN';s.settings.autoExtractIcons=false;s.items=[{id:'map-native',groupId:'home',type:'widget',widget:'map',title:'地图',size:'4x2',config:{...newWidgetConfig('map'),enabled:true,source:'osm'},data:newWidgetData('map')}];console.log(JSON.stringify(s));"],cwd=ROOT))
checks=[]
def check(name,condition=True):
    assert condition,name
    checks.append(name)
    print('PASS',name,flush=True)

with tempfile.TemporaryDirectory(prefix='qiye-map-mv3-') as temp, sync_playwright() as p:
    build=Path(temp)/'extension'
    build.mkdir()
    for directory in ['src','icons','fonts','_locales']:
        shutil.copytree(ROOT/directory,build/directory)
    for name in ['manifest.json','index.html','styles.css','background.js','popup.html','popup.js','popup.css']:
        if (ROOT/name).exists(): shutil.copyfile(ROOT/name,build/name)
    manifest=json.loads((build/'manifest.json').read_text(encoding='utf-8'))
    # Pregrant only the fixture origin. Real permission dialogs remain manual.
    manifest['host_permissions'].append('https://tile.openstreetmap.org/*')
    (build/'manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
    context=p.chromium.launch_persistent_context(str(Path(temp)/'profile'),**({'executable_path':os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {'channel':'chromium'}),headless=True,args=[f'--disable-extensions-except={build}',f'--load-extension={build}'],viewport={'width':1440,'height':960})
    try:
        worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=20000)
        extension_id=worker.url.split('/')[2]
        page=context.new_page()
        errors=[]
        requests=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        context.route('https://**/*',lambda route:route.abort())
        def tiles(route):
            requests.append(route.request.headers)
            route.fulfill(body='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dce9df"/></svg>',content_type='image/svg+xml',headers={'Access-Control-Allow-Origin':'*'})
        context.route('https://tile.openstreetmap.org/**',tiles)
        page.goto(f'chrome-extension://{extension_id}/index.html')
        page.evaluate('s=>chrome.storage.local.set({"qiye.state.v5":s})',seed)
        page.reload()
        page.locator('#desktop .map-card-open').wait_for()
        check('native desktop does not request map tiles',not requests)
        page.locator('#desktop .map-card-open').click()
        expect(page.locator('[data-map-gate]')).to_be_hidden()
        page.wait_for_function('document.querySelector(".map-image-plane img")?.naturalWidth>0')
        check('native MV3 renders maps without external scripts',not errors)
        check('OSM extension requests identify Qiye',all('Qiye' in row.get('x-requested-with','') for row in requests))
        page.locator('[name=query]').fill('深圳')
        page.locator('[data-map-result]').first.click()
        page.locator('[data-map-action=favorite]').click()
        expect(page.locator('[data-map-favorite-count]')).to_have_text('1')
        page.locator('[data-close]').click()
        expect(page.locator('#dialog')).to_be_hidden()
        # Playwright 1.56 treats a returned Promise as truthy without polling its
        # resolved boolean. Await actual storage completion before reloading.
        page.evaluate('''async()=>{
          for(let attempt=0;attempt<100;attempt++){
            const stored=(await chrome.storage.local.get("qiye.state.v5"))["qiye.state.v5"];
            if(stored.items[0].data.favorites.length===1)return;
            await new Promise(resolve=>setTimeout(resolve,50));
          }
          throw new Error('Map favorite was not persisted after closing');
        }''')
        page.reload()
        page.locator('#desktop [data-item=map-native] .map-card-open').click()
        expect(page.locator('[data-map-favorite-count]')).to_have_text('1')
        check('map favorites persist in chrome.storage.local')
        page.evaluate('''()=>{window.mapActualPermissions=chrome.permissions;chrome.permissions={contains:async()=>false,request:async()=>false};}''')
        page.locator('[name=query]').fill('香港')
        page.locator('[data-map-result]').first.click()
        expect(page.locator('[data-map-gate]')).to_be_visible()
        page.locator('[data-map-action=enable]').click()
        expect(page.locator('[data-map-gate]')).to_be_visible()
        check('denied source permission does not load map images',page.locator('.map-image-plane img').count()==0)
        page.locator('[data-map-action=locate]').click()
        expect(page.locator('[data-map-feedback]')).to_contain_text('未获准定位')
        check('denied geolocation remains recoverable')
        check('native map has no uncaught errors',not errors)
        (OUT/'native-report.json').write_text(json.dumps({'checks':checks,'passed':len(checks),'permission_prompts':'source denial mocked, OSM fixture host pregranted','errors':errors},indent=2),encoding='utf-8')
    finally:
        context.close()
print(f'{len(checks)} native map checks passed.',flush=True)
