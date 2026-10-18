#!/usr/bin/env python3
"""Dialog scaling and widget API/data regression against production modules."""
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
parser.add_argument('--output', default='test-results/widgets')
args = parser.parse_args()
OUT = Path(args.output); OUT.mkdir(parents=True, exist_ok=True)
base_state = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {DEFAULT_STATE} from './src/core.js';console.log(JSON.stringify(DEFAULT_STATE))"], cwd=ROOT))
base_state['settings']['language'] = 'zh-CN'
checks = []


def check(name, condition):
    assert condition, name
    checks.append(name); print('PASS', name, flush=True)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'

with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH')
    browser = p.chromium.launch(**({'executable_path': executable} if executable else {}))
    errors = []

    def setup(state=None, width=1440, height=950, extension=False):
        context = browser.new_context(viewport={'width': width, 'height': height})
        page = context.new_page(); page.set_default_timeout(7000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('https://**/*', lambda route: route.abort())
        if extension:
            page.route('**/widget-extensions.js', lambda route: route.fulfill(content_type='text/javascript', body="import { counterWidget } from './widget-example.js'; export const widgetExtensions = [counterWidget];"))
        payload = json.dumps(state or base_state, ensure_ascii=False)
        page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",' + json.dumps(payload) + ')')
        page.goto(base, wait_until='domcontentloaded')
        page.locator('[data-item]').first.wait_for()
        return context, page

    def saved(page): return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5"))')

    def add(page, widget):
        page.locator('.top-tools [data-action=add]').click()
        page.locator('[data-add-tab=widgets]').click()
        page.locator(f'[data-add-widget={widget}]').click()
        page.wait_for_function('document.querySelector("[data-add-feedback]")?.textContent.length > 0')
        check(f'{widget} chooser stays open after adding', page.locator('#dialog').is_visible())
        page.locator('#dialog [data-close]').click()
        page.locator('#dialog').wait_for(state='hidden')

    try:
        context, page = setup()
        page.locator('#brand-button').click(); page.locator('[data-settings-tab=appearance]').click()
        for scale in [75, 100, 150]:
            page.locator('[data-preference=windowSize]').select_option(str(scale))
            page.wait_for_function('(s)=>JSON.parse(localStorage.getItem("qiye.state.v5")).settings.windowSize===s', arg=scale)
            rect = page.locator('#dialog').bounding_box()
            check(f'{scale}% settings remains inside viewport', rect['x'] >= -1 and rect['y'] >= -1 and rect['x'] + rect['width'] <= 1441 and rect['y'] + rect['height'] <= 951)
            check(f'{scale}% reflows without scaling controls', page.locator('#dialog').evaluate('n=>getComputedStyle(n).zoom') == '1')
        page.screenshot(path=str(OUT / 'settings-150.png'))
        page.locator('[data-close]').first.click(); page.reload(); page.locator('#brand-button').click()
        check('scale survives reload', saved(page)['settings']['windowSize'] == 150)
        page.locator('[data-settings-tab=appearance]').click(); page.locator('[data-preference=windowSize]').select_option('100')
        check('reset restores 100%', page.locator('#dialog').evaluate('n=>getComputedStyle(n).zoom') == '1')
        context.close()

        for theme in ['dark', 'light']:
            state = copy.deepcopy(base_state); state['settings']['language']='zh-CN';state['settings'].update({'windowSize': 150, 'theme': theme})
            context, page = setup(state, width=360, height=640)
            page.locator('#brand-button').click(); page.locator('[data-settings-tab=appearance]').click()
            check(f'{theme} narrow 150% settings can scroll', page.locator('.settings-content').evaluate('n=>n.scrollHeight>n.clientHeight && n.scrollWidth<=n.clientWidth+1'))
            page.wait_for_timeout(250)
            check(f'{theme} narrow 150% close stays reachable', page.locator('[data-close]').first.evaluate('n=>{const r=n.getBoundingClientRect();return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("[data-close]")}'))
            page.screenshot(path=str(OUT / f'settings-mobile-{theme}.png'))
            page.locator('[data-close]').first.click()
            for action in ['add', 'wallpaper']:
                page.locator(f'.top-tools [data-action={action}]').click()
                rect = page.locator('#dialog').bounding_box()
                check(f'{theme} narrow {action} fits', rect['x'] >= -1 and rect['x'] + rect['width'] <= 361 and rect['y'] + rect['height'] <= 641)
                page.locator('[data-close]').first.click()
            context.close()

        state = copy.deepcopy(base_state)
        state['items'] = []
        for widget in ['notes', 'todo', 'habit', 'pomodoro']:
            for index in [1, 2]:
                state['items'].append({'id': f'{widget}-{index}', 'groupId': 'home', 'type': 'widget', 'widget': widget, 'title': f'{widget}-{index}', 'size': '2x2', 'config': copy.deepcopy(next(i['config'] for i in base_state['items'] if i.get('widget') == widget)), 'data': copy.deepcopy(next(i['data'] for i in base_state['items'] if i.get('widget') == widget))})
        context, page = setup(state)
        original = page.locator('[data-item=notes-2] textarea').input_value()
        page.locator('[data-item=notes-1] textarea').fill('first note only')
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="notes-1").data?.notes==="first note only"')
        check('editing one note leaves sibling unchanged', page.locator('[data-item=notes-2] textarea').input_value() == original)
        for widget in ['todo', 'habit']:
            second_before = page.locator(f'[data-item={widget}-2] li').all_text_contents()
            page.locator(f'[data-item={widget}-1] input[name=text]').fill(f'unique {widget}')
            page.locator(f'[data-item={widget}-1] input[name=text]').press('Enter')
            check(f'{widget} new entry is isolated', page.locator(f'[data-item={widget}-2] li').all_text_contents() == second_before)
        page.locator('[data-item=pomodoro-1] [data-pomo-action=toggle]').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="pomodoro-1").data.status==="running"')
        check('Pomodoro timers run independently', page.locator('[data-item=pomodoro-2] [data-pomo=start]').inner_text() == '开始专注')
        page.reload(); page.locator('[data-item=notes-1] textarea').wait_for()
        check('independent notes survive reload', page.locator('[data-item=notes-1] textarea').input_value() == 'first note only' and page.locator('[data-item=notes-2] textarea').input_value() == original)
        add(page, 'notes')
        check('new note starts empty', page.locator('#desktop [data-widget-input=notes]').last.input_value() == '')
        page.locator('.top-tools [data-action=add]').click(); page.locator('[data-add-tab=widgets]').click()
        page.locator('#widget-query').fill('计时')
        check('catalog filters by purpose', page.locator('[data-add-widget]:visible').count() >= 1 and page.locator('[data-add-widget]:visible').count() < 13)
        page.locator('#widget-query').fill('does-not-exist')
        check('catalog has useful empty state', page.locator('#widget-catalog-empty').is_visible())
        page.locator('#widget-query').fill('便签'); page.locator('[data-catalog-widget=notes] [data-catalog-size="4x2"]').click()
        page.locator('[data-add-widget=notes]').click()
        page.wait_for_function('document.querySelector("[data-add-feedback]")?.textContent.length > 0')
        page.locator('#dialog [data-close]').click(); page.locator('#dialog').wait_for(state='hidden')
        check('catalog size selection persists', saved(page)['items'][-1]['size'] == '4x2')
        context.close()

        context, page = setup(extension=True)
        add(page, 'counter')
        page.locator('#desktop [data-counter-add]').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.widget==="counter").config.count===1')
        page.locator('#desktop [data-widget=counter] [data-action=widget-config]').click()
        page.locator('[name=config-label]').fill('My counter'); page.locator('[name=config-count]').fill('5')
        page.locator('#widget-form button[type=submit]').click(); page.locator('#dialog').wait_for(state='hidden')
        check('extension auto-generated settings persist and render', page.locator('#desktop [data-counter-value]').inner_text() == '5' and page.locator('#desktop [data-counter-label]').inner_text() == 'My counter')
        add(page, 'counter')
        check('two extension instances are independent', page.locator('#desktop [data-counter-value]').all_text_contents() == ['5', '0'])
        page.reload(); page.locator('#desktop [data-counter-value]').first.wait_for()
        check('extension state survives reload', page.locator('#desktop [data-counter-value]').all_text_contents() == ['5', '0'])
        page.locator('[data-group=code]').click(); page.locator('[data-group=home]').click()
        page.locator('#desktop [data-counter-add]').first.click()
        page.wait_for_function('document.querySelector("#desktop [data-counter-value]").textContent!=="5"')
        check('remount does not duplicate listeners', page.locator('#desktop [data-counter-value]').first.inner_text() == '6')
        first_id=next(i['id'] for i in saved(page)['items'] if i.get('widget')=='counter')
        page.locator(f'[data-item="{first_id}"]').click(button='right',position={'x':3,'y':3});page.locator('#context-menu [data-size="1x1"]').click()
        page.locator(f'[data-item="{first_id}"] .extension-counter-mini').wait_for()
        check('extension owns its compact rendering',page.locator(f'[data-item="{first_id}"] [data-counter-add]').count()==1)
        page.locator(f'[data-item="{first_id}"] [data-counter-add]').click()
        page.wait_for_function('(id)=>JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id===id).config.count===7',arg=first_id)
        check('compact extension saves without changing its size',next(i for i in saved(page)['items'] if i['id']==first_id)['size']=='1x1')
        page.locator('.top-tools [data-action=add]').click()
        check('chooser exposes only supported extension sizes',page.locator('[data-catalog-widget=counter] [data-catalog-size]').count()==2)
        page.locator('[data-catalog-widget=counter] [data-catalog-size="1x1"]').click()
        check('chooser previews the real compact extension',page.locator('[data-catalog-widget=counter] .extension-counter-mini').count()==1)

        context.close()
        check('no uncaught runtime errors', errors == [])
        print(f'{len(checks)} widget/browser checks passed.', flush=True)
    finally:
        (OUT / 'widget-report.json').write_text(json.dumps({'passed': checks, 'errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
        browser.close(); server.shutdown()
