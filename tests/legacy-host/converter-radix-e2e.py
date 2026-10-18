#!/usr/bin/env python3
"""Exercise migrated radix cards and the shared converter draft in a real browser."""
import argparse
import copy
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import subprocess
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--preview', action='store_true')
parser.add_argument('--url')
args = parser.parse_args()
OUT = ROOT / 'output/playwright/converter-radix'
OUT.mkdir(parents=True, exist_ok=True)
state0 = json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {DEFAULT_STATE} from './src/core.js';console.log(JSON.stringify(DEFAULT_STATE))"], cwd=ROOT))
checks = []

def check(name, condition):
    assert condition, name
    checks.append(name)
    print('PASS', name, flush=True)

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = args.url or f'http://127.0.0.1:{server.server_port}/' + ('Qiye-preview.html' if args.preview else '')
suffix = '-live' if args.url else '-preview' if args.preview else ''
with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH')
    browser = p.chromium.launch(**({'executable_path':executable} if executable else {}))
    try:
        for language, theme in [('zh-CN','light'), ('en','dark')]:
            state = copy.deepcopy(state0)
            seed = next(i for i in state['items'] if i.get('widget') == 'converter')
            state['items'] = []
            state['activeGroupId'] = 'home'
            state['settings'].update(language=language, theme=theme, autoExtractIcons=False, wallpaperApiEnabled=False)
            for size in ['1x1','1x2','2x1','2x2','4x2']:
                state['items'].append(dict(id='legacy-'+size,type='widget',widget='base-converter',groupId='home',size=size,config={},title='进制转换' if language=='zh-CN' else 'Base converter',data=copy.deepcopy(seed['data']['radix'])))
            old = copy.deepcopy(seed)
            old.update(id='old-converter',groupId='home')
            del old['data']['radix']
            state['items'].append(old)
            context = browser.new_context(viewport={'width':1440,'height':1000}, locale=language, permissions=['clipboard-read','clipboard-write'])
            page = context.new_page()
            page.set_default_timeout(12000)
            errors = []
            page.on('pageerror', lambda error:errors.append(str(error)))
            if not args.url: page.route('https://**/*', lambda route:route.abort())
            page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'+json.dumps(json.dumps(state,ensure_ascii=False))+')')
            page.goto(url, wait_until='domcontentloaded')
            def settle_layout():
                page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                page.wait_for_function('document.querySelector("#dialog").getAnimations({subtree:true}).every(a=>a.playState!=="running")')
            def open_card():
                page.locator('[data-widget-id="legacy-2x2"] [data-action=widget-open]').first.click()
                page.locator('#radix-input').wait_for()
                settle_layout()
            def mode(name):
                if page.locator('.cv-nav').is_visible(): page.locator(f'[data-cv-category={name}]').click()
                else: page.locator('[data-cv-select]').select_option(name)
            def output(base): return page.locator(f'[data-result-base="{base}"] output').inner_text()
            def stored(): return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="legacy-2x2").data')
            for size in ['1x1','1x2','2x1','2x2','4x2']:
                card = page.locator(f'[data-widget-id="legacy-{size}"]')
                check(f'{language} migrated {size} card fits',card.evaluate('el=>el.scrollWidth<=el.clientWidth+1 && el.scrollHeight<=el.clientHeight+1'))
            page.screenshot(path=str(OUT/f'{language}-cards{suffix}.png'))
            page.locator('.top-tools [data-action=add]').click()
            page.locator('[data-add-tab=widgets]').click()
            check(f'{language} one searchable catalog entry',page.locator('[data-catalog-widget=base-converter]').count()==0 and page.locator('[data-catalog-widget=converter]').count()==1)
            page.locator('#widget-query').fill('进制' if language=='zh-CN' else 'base conversion')
            check(f'{language} catalog finds merged converter',page.locator('[data-catalog-widget=converter]').is_visible())
            page.locator('#dialog [data-close]').click()
            open_card()
            check(f'{language} migration opens radix in shared shell',page.locator('.cv-header').count()==1 and page.locator('.radix-header').count()==0 and page.locator('[data-cv-select]').input_value()=='radix')
            check(f'{language} 46px header and calm initial focus',page.locator('.cv-header').evaluate('el=>el.offsetHeight===46') and page.evaluate('document.activeElement.id')=='dialog-title' and not page.locator('[data-cv-action=settings]').evaluate('el=>el.matches(":focus-visible")'))
            check(f'{language} full-width input and collapsed settings',page.locator('.radix-source').evaluate('el=>el.clientWidth>600') and page.locator('#radix-settings').is_hidden())
            check(f'{language} all default results visible without scrolling',page.locator('[data-result-base="16"]').evaluate('el=>el.getBoundingClientRect().bottom < document.querySelector(".cv-main").getBoundingClientRect().bottom'))
            check(f'{language} default results remain exact',[output(b) for b in [2,8,10,16]]==['11111111','377','255','FF'])
            page.locator('#dialog').screenshot(path=str(OUT/f'{language}-general{suffix}.png'))
            if language=='en': check('English radix is localized',not re.search('[\u3400-\u9fff]',page.locator('.cv-app').inner_text()))
            page.locator('#radix-input').fill('0.(3)')
            check(f'{language} recurring fractions stay exact',output(2)=='0.(01)')
            page.locator('#radix-input').fill('-1')
            page.locator('[data-radix-mode=signed]').click()
            page.locator('[data-radix-width]').select_option('8')
            check(f'{language} signed 8-bit interpretations',[output(b) for b in [2,8,10,16]]==['11111111','377','-1','FF'] and page.locator('[data-radix-word=unsigned]').inner_text()=='255')
            page.locator('[data-radix-mode=unsigned]').click()
            check(f'{language} sign switch keeps bits',page.locator('#radix-input').input_value()=='255' and output(16)=='FF')
            page.locator('[data-radix-mode=signed]').click()
            page.locator('[data-radix-copy="16"]').click()
            check(f'{language} copy is reusable',page.evaluate('navigator.clipboard.readText()')=='FF')
            page.locator('[data-radix-use="16"]').click()
            check(f'{language} reuse selects correct input kind',page.locator('#radix-input').input_value()=='FF' and page.locator('[data-radix-input-kind=bits]').get_attribute('aria-pressed')=='true')
            page.locator('#radix-input').fill('100')
            check(f'{language} overflow clears stale results',output(16)=='—' and page.locator('[data-radix-copy-all]').is_disabled())
            page.locator('#radix-input').fill('FF')
            page.locator('[data-radix-targets-toggle]').click()
            page.locator('[data-radix-extra]').select_option('36')
            page.locator('[data-radix-add]').click()
            check(f'{language} custom target added',output(36)=='73')
            page.locator('[data-radix-remove="36"]').click()
            page.locator('[data-radix-extra]').press('Escape')
            check(f'{language} target picker Escape preserves window',page.locator('#radix-targets').is_hidden() and page.locator('#dialog').is_visible())
            page.locator('[data-cv-action=settings]').click()
            page.locator('[data-radix-option=prefixes]').check()
            page.locator('[data-radix-option=uppercase]').uncheck()
            check(f'{language} contextual format settings',output(16)=='0xff' and page.locator('#cv-settings').is_hidden())
            page.locator('[data-radix-option=uppercase]').press('Escape')
            check(f'{language} settings Escape returns focus',page.locator('#radix-settings').is_hidden() and page.locator('[data-cv-action=settings]').evaluate('el=>el===document.activeElement'))
            page.locator('#dialog').screenshot(path=str(OUT/f'{language}-integer{suffix}.png'))
            page.locator('#radix-input').fill('7F')
            mode('length');page.locator('[data-cv-unit="0"]').select_option('ft');mode('radix')
            check(f'{language} rapid category switch keeps draft',page.locator('#radix-input').input_value()=='7F' and output(10)=='127')
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="legacy-2x2").data.radix?.input==="7F"')
            page.reload(wait_until='domcontentloaded');open_card()
            check(f'{language} nested preferences persist together',stored()['pairs']['length'][0]=='ft' and stored()['radix']['prefixes'] and page.locator('#radix-input').input_value()=='7F')
            check(f'{language} another card remains independent',page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="legacy-4x2").data.radix.input')=='255')
            page.evaluate('() => {window.radixOriginalSave=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==="qiye.state.v5")throw new DOMException("Test quota","QuotaExceededError");return window.radixOriginalSave.call(this,k,v)};}')
            page.locator('#radix-input').fill('2A')
            page.locator('[data-cv-action=retry]').wait_for(state='visible')
            mode('length');mode('radix')
            check(f'{language} failed save survives category switch',page.locator('#radix-input').input_value()=='2A' and stored()['radix']['input']=='7F')
            page.locator('#dialog [data-close]').click();open_card()
            check(f'{language} failed nested draft survives reopen',page.locator('#radix-input').input_value()=='2A')
            page.evaluate('() => {Storage.prototype.setItem=window.radixOriginalSave;}')
            page.locator('[data-cv-action=retry]').click()
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="legacy-2x2").data.radix.input==="2A"')
            check(f'{language} retry recovers shared draft',stored()['pairs']['length'][0]=='ft')
            page.locator('[data-cv-search]').fill('hex')
            check(f'{language} search recognizes radix aliases',page.locator('[data-cv-category]:visible').count()==1 and page.locator('[data-cv-category=radix]').is_visible())
            page.locator('[data-cv-search]').press('Enter');page.locator('[data-cv-search]').fill('')
            page.locator('[data-detail-action=window-expand]').click()
            settle_layout()
            check(f'{language} maximized canvas fits',page.locator('#dialog').evaluate('el=>el.getBoundingClientRect().right<=innerWidth && el.getBoundingClientRect().bottom<=innerHeight'))
            page.locator('[data-detail-action=window-expand]').click()
            for width in [390,320]:
                page.set_viewport_size({'width':width,'height':844})
                settle_layout()
                page.locator('[data-radix-width]').select_option('128')
                page.locator('#radix-input').fill('F'*32)
                check(f'{language} {width}px long 128-bit results fit',page.locator('.cv-main').evaluate('el=>el.scrollWidth<=el.clientWidth+1') and page.locator('.radix-app').evaluate('el=>el.scrollWidth<=el.clientWidth+1') and page.locator('#dialog').evaluate('el=>el.scrollWidth<=el.clientWidth+1'))
                page.locator('[data-cv-action=settings]').click()
                check(f'{language} {width}px settings fit',page.locator('.cv-main').evaluate('el=>el.scrollWidth<=el.clientWidth+1'))
                page.locator('[data-cv-action=settings]').click()
                page.locator('.cv-main').evaluate('el=>el.scrollTop=0')
                page.locator('#dialog').screenshot(path=str(OUT/f'{language}-narrow-{width}{suffix}.png'))
            page.locator('[data-cv-action=settings]').focus();page.keyboard.press('Tab')
            check(f'{language} keyboard focus remains visible',page.evaluate('document.activeElement.matches(":focus-visible") && getComputedStyle(document.activeElement).outlineStyle!=="none"'))
            check(f'{language} no runtime errors',not errors)
            context.close()
    finally:
        browser.close();server.shutdown()
(OUT / f'report{suffix}.json').write_text(json.dumps({'url':url,'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(checks)} converter radix browser checks passed',flush=True)
