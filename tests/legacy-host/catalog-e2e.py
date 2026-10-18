#!/usr/bin/env python3
"""Exercise fixed chooser controls, repeated additions and failed/pending saves."""
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
OUT = ROOT / 'output/playwright/catalog'
OUT.mkdir(parents=True, exist_ok=True)
suffix = '-live' if args.url else '-preview' if args.preview else ''
state0 = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {DEFAULT_STATE} from './src/core.js';console.log(JSON.stringify(DEFAULT_STATE))"], cwd=ROOT))
checks, errors = [], []


def check(name, condition):
    assert condition, name
    checks.append(name)
    print('PASS', name, flush=True)


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = args.url or f'http://127.0.0.1:{server.server_port}/' + ('Qiye-preview.html' if args.preview else '')
with sync_playwright() as playwright:
    executable = os.environ.get('CHROMIUM_PATH')
    browser = playwright.chromium.launch(**({'executable_path': executable} if executable else {}))
    try:
        for language, theme in [('zh-CN', 'light'), ('en', 'dark')]:
            state = copy.deepcopy(state0)
            state['settings'].update(language=language, theme=theme, autoExtractIcons=False, wallpaperApiEnabled=False)
            context = browser.new_context(viewport={'width': 1440, 'height': 950}, locale=language)
            page = context.new_page()
            page.set_default_timeout(12000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('https://**/*', lambda route: route.continue_() if args.url and route.request.url.startswith(args.url) else route.abort())
            page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",' + json.dumps(json.dumps(state, ensure_ascii=False)) + ')')
            page.goto(url, wait_until='domcontentloaded')

            def saved():
                return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5"))')

            def settled():
                page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                page.wait_for_function('document.querySelector("#dialog").getAnimations({subtree:true}).every(animation => animation.playState !== "running")')

            def wait_count(count):
                page.wait_for_function('(count) => JSON.parse(localStorage.getItem("qiye.state.v5")).items.length === count', arg=count)
                page.wait_for_function('!document.querySelector(".catalog-add[aria-busy=true]")')

            def close():
                page.locator('#dialog [data-close]').click()
                page.locator('#dialog').wait_for(state='hidden')

            def hold_save():
                page.evaluate('''() => {
                    window.catalogLockReady = false;
                    navigator.locks.request('qiye.state.v5', () => new Promise(resolve => {
                        window.catalogRelease = resolve; window.catalogLockReady = true;
                    }));
                }''')
                page.wait_for_function('window.catalogLockReady')

            page.locator('.top-tools [data-action=add]').click()
            settled()
            check(f'{language} opens with calm title focus', page.evaluate('document.activeElement.id') == 'workspace-title')
            controls = ['#widget-query', '#catalog-group', '.add-window-actions [data-action=workspace-expand]', '.add-window-actions [data-close]']
            boxes = [page.locator(selector).bounding_box() for selector in controls]
            centers = [box['y'] + box['height'] / 2 for box in boxes]
            check(f'{language} search and window controls share a 46px title bar', max(centers) - min(centers) < 1 and abs(page.locator('.add-header').bounding_box()['height'] - 46) < 1)
            category_top = page.locator('.catalog-categories').bounding_box()['y']
            page.locator('.catalog-scroll').hover()
            page.mouse.wheel(0, 1000)
            page.wait_for_function('document.querySelector(".catalog-scroll").scrollTop > 500')
            check(f'{language} wheel scrolling keeps every header control fixed', all(abs(page.locator(selector).bounding_box()['y'] - box['y']) < 1 for selector, box in zip(controls, boxes)))
            check(f'{language} categories remain fixed above the list', abs(page.locator('.catalog-categories').bounding_box()['y'] - category_top) < 1)
            check(f'{language} scrolled header controls remain clickable', page.locator('.add-header input,.add-header select,.add-header button').evaluate_all('nodes => nodes.every(node => {const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})'))
            page.screenshot(path=str(OUT / f'{language}-scrolled{suffix}.png'), animations='disabled')

            page.locator('[data-catalog-category="日常"]').click()
            query = '便签' if language == 'zh-CN' else 'sticky'
            page.locator('#widget-query').fill(query)
            page.locator('#catalog-group').select_option('life')
            card = page.locator('[data-catalog-widget=notes]')
            count = len(saved()['items'])
            for size in ['1x1', '1x2', '2x1', '2x2', '4x2']:
                card.locator(f'[data-catalog-size="{size}"]').click()
                button = card.locator('[data-add-widget]')
                button.focus()
                button.press('Enter')
                count += 1
                wait_count(count)
                item = saved()['items'][-1]
                check(f'{language} repeated {size} addition saves its target and preview', item['widget'] == 'notes' and item['size'] == size and item['groupId'] == 'life')
                check(f'{language} {size} addition keeps search, category and focus', page.locator('#dialog').is_visible() and page.locator('#widget-query').input_value() == query and page.locator('#catalog-group').input_value() == 'life' and page.locator('[data-catalog-category="日常"]').get_attribute('aria-pressed') == 'true' and button.evaluate('node => node === document.activeElement'))
            check(f'{language} additions create distinct instances', len({item['id'] for item in saved()['items'][-5:]}) == 5)
            check(f'{language} result is visible inside the modal', page.locator('[data-add-feedback]').is_visible() and bool(page.locator('[data-add-feedback]').inner_text()))

            page.locator('#widget-query').fill('')
            page.locator('[data-catalog-category="全部"]').click()
            normal_width = page.locator('#dialog').bounding_box()['width']
            page.locator('[data-action=workspace-expand]').click()
            settled()
            check(f'{language} maximize gives the catalog more space', page.locator('#dialog').bounding_box()['width'] > normal_width)
            button = card.locator('[data-add-widget]')
            button.scroll_into_view_if_needed()
            scroll_top = page.locator('.catalog-scroll').evaluate('node => node.scrollTop')
            button.click()
            count += 1
            wait_count(count)
            check(f'{language} adding preserves the scrolled and maximized chooser', scroll_top > 0 and abs(page.locator('.catalog-scroll').evaluate('node => node.scrollTop') - scroll_top) < 1 and page.locator('#dialog').evaluate('node => node.classList.contains("workspace-expanded")'))

            if language == 'zh-CN':
                hold_save()
                button.evaluate('node => { node.click(); node.click(); }')
                check('pending save prevents accidental duplicate activation', button.get_attribute('aria-disabled') == 'true' and len(saved()['items']) == count)
                page.locator('[data-add-widget=clock]').click()
                page.evaluate('window.catalogRelease()')
                count += 2
                wait_count(count)
                check('different pending additions both persist once', [item['widget'] for item in saved()['items'][-2:]] == ['notes', 'clock'])

                page.locator('#widget-query').fill(query)
                page.evaluate('''() => {
                    window.catalogOriginalSetItem = Storage.prototype.setItem;
                    window.catalogFailSave = true;
                    Storage.prototype.setItem = function(key,value) {
                        if (key === 'qiye.state.v5' && window.catalogFailSave) throw new DOMException('Catalog test quota', 'QuotaExceededError');
                        return window.catalogOriginalSetItem.call(this,key,value);
                    };
                }''')
                button.click()
                page.wait_for_function('document.querySelector("[data-add-feedback]").classList.contains("is-error")')
                check('failed save retains chooser state and displays its error', page.locator('#dialog').is_visible() and page.locator('#widget-query').input_value() == query and len(saved()['items']) == count and page.locator('[data-add-feedback]').is_visible())
                page.evaluate('window.catalogFailSave = false')
                button.click()
                count += 1
                wait_count(count)
                check('retry creates one saved item without a phantom duplicate', saved()['items'][-1]['widget'] == 'notes' and not page.locator('[data-add-feedback]').evaluate('node => node.classList.contains("is-error")'))
                page.evaluate('() => { Storage.prototype.setItem = window.catalogOriginalSetItem; }')

            page.locator('[data-add-tab=sites]').click()
            check(f'{language} changing catalogs retains maximized state and target', page.locator('#dialog').evaluate('node => node.classList.contains("workspace-expanded")') and page.locator('#catalog-group').input_value() == 'life')
            page.locator('#widget-query').fill('github')
            for _ in range(2):
                page.locator('[data-add-site]:visible').first.click()
                count += 1
                wait_count(count)
            check(f'{language} website shortcuts can also be added consecutively', page.locator('#dialog').is_visible() and page.locator('#widget-query').input_value() == 'github' and all(item['type'] == 'link' and item['groupId'] == 'life' for item in saved()['items'][-2:]))
            page.locator('[data-add-tab=widgets]').click()
            page.locator('[data-action=workspace-expand]').click()
            for width, height in [(390, 844), (320, 568), (1440, 950)]:
                page.set_viewport_size({'width': width, 'height': height})
                settled()
                check(f'{language} {width}px header stays compact without overflow', abs(page.locator('.add-header').bounding_box()['height'] - 46) < 1 and page.locator('.add-header').evaluate('node => node.scrollWidth <= node.clientWidth'))
                check(f'{language} {width}px header controls fit and receive pointer hits', page.locator('.add-header input,.add-header select,.add-header button').evaluate_all('nodes => nodes.every(node => {const r=node.getBoundingClientRect(),d=node.closest("dialog").getBoundingClientRect();return r.width>20 && r.x>=d.x && r.right<=d.right && node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})'))
                page.locator('.catalog-scroll').focus()
                page.keyboard.press('Home')
                page.wait_for_function('document.querySelector(".catalog-scroll").scrollTop === 0')
                before = page.locator('.catalog-scroll').evaluate('node => node.scrollTop')
                page.keyboard.press('PageDown')
                page.wait_for_function('(before) => document.querySelector(".catalog-scroll").scrollTop > before', arg=before)
                check(f'{language} {width}px list supports keyboard scrolling', True)
                page.screenshot(path=str(OUT / f'{language}-{width}{suffix}.png'), animations='disabled')
            close()
            check(f'{language} closing restores focus to the add launcher', page.locator('.top-tools [data-action=add]').evaluate('node => node === document.activeElement'))

            if language == 'zh-CN':
                page.locator('.top-tools [data-action=add]').click()
                hold_save()
                page.locator('[data-add-widget=notes]').click()
                page.keyboard.press('Escape')
                page.locator('#dialog').wait_for(state='hidden')
                page.locator('#brand-button').click()
                page.evaluate('window.catalogRelease()')
                count += 1
                wait_count(count)
                check('late save leaves the newly opened settings window alone', page.locator('#dialog.settings-dialog').is_visible() and page.locator('[data-add-feedback]').count() == 0)
                close()
            expected = [(item['id'], item.get('size'), item['groupId']) for item in saved()['items']]
            page.reload(wait_until='domcontentloaded')
            page.locator('#desktop [data-item]').first.wait_for()
            check(f'{language} all additions survive reloading with their sizes and groups', [(item['id'], item.get('size'), item['groupId']) for item in saved()['items']] == expected)
            context.close()
        check('no uncaught browser errors', not errors)
        print(f'{len(checks)} catalog checks passed', flush=True)
    finally:
        (OUT / f'report{suffix}.json').write_text(json.dumps({'url': url, 'checks': checks, 'errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
        browser.close()
        server.shutdown()
