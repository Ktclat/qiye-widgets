#!/usr/bin/env python3
"""Bookmark manager regression using disposable data and controlled browser APIs."""
import argparse
import copy
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--preview', action='store_true')
args = parser.parse_args()
OUT = ROOT / 'output/playwright/bookmarks'
OUT.mkdir(parents=True, exist_ok=True)
seed = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {DEFAULT_STATE} from './src/core.js';console.log(JSON.stringify(DEFAULT_STATE))"], cwd=ROOT))
seed['settings'].update(language='zh-CN', autoExtractIcons=False)
seed['items'] = [dict(id='bookmarks-'+size, groupId=seed['activeGroupId'], type='widget', widget='bookmarks', title='书签', size=size, config={'source':'local'}, data={'nodes':[]}) for size in ['4x2','2x2','1x1','1x2','2x1']]
checks = []
def check(name, condition=True):
    assert condition, name
    checks.append(name)
    print('PASS', name, flush=True)

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/' + ('Qiye-preview.html' if args.preview else '')

with sync_playwright() as p:
    browser = p.chromium.launch(**({'executable_path':os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {}))
    context = browser.new_context(viewport={'width':1440,'height':950})
    page = context.new_page()
    page.set_default_timeout(8000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://**/*', lambda route: route.abort())
    page.add_init_script('if(!localStorage.getItem("qiye.state.v5")) localStorage.setItem("qiye.state.v5",'+json.dumps(json.dumps(seed, ensure_ascii=False))+');')
    page.add_init_script((ROOT / 'tests/bookmarks-browser-fixture.js').read_text(encoding='utf-8'))
    def data(): return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="bookmarks-4x2").data.nodes')
    def node_id(title): return next(node['id'] for node in data() if node['title'] == title)
    def open_manager():
        page.locator('[data-item="bookmarks-4x2"] [data-action=widget-open]').first.click()
        page.locator('.bookmarks-app').wait_for()
    def commands():
        if not page.locator(".bm-commands").evaluate("n=>n.open"): page.locator(".bm-commands summary").click()
    def create(title, url=None):
        commands()
        page.locator('[data-bm-action='+('new-folder' if url is None else 'new-bookmark')+']').click()
        page.locator('#bm-editor-form [name=title]').fill(title)
        if url is not None: page.locator('#bm-editor-form [name=url]').fill(url)
        page.locator('#bm-editor-form button[type=submit]').click()
        expect(page.locator('.bm-editor-overlay')).to_be_hidden()
    def folder(id): page.locator('.bm-tree [data-bm-folder="'+id+'"]').click()
    def row_action(id, action):
        if action == 'locate': page.locator('[data-bm-row="'+id+'"] [data-bm-action=locate]').click()
        else:
            page.locator('[data-bm-row="'+id+'"] [data-bm-action=select-item]').click()
            page.locator('.bm-commands [data-bm-action='+action+']').click()
    def select_source(source):
        page.locator('.bm-source-switch summary').click()
        page.locator('[data-bm-source='+source+']').click()
    try:
        page.goto(base, wait_until='domcontentloaded')
        page.locator('[data-widget=bookmarks]').first.wait_for()
        check('all five card sizes mount', page.locator('#desktop [data-widget=bookmarks]').count() == 5)
        open_manager()
        check('no automatic permission request or native read', page.evaluate('__bookmarkTest.calls.length') == 0)
        check('title bar is slim and all primary controls share one row', page.locator('.bm-header').evaluate('n=>n.offsetHeight<=48 && [...n.querySelectorAll(".bm-source-switch>summary,.bm-search,.bm-settings>summary,.widget-app-controls")].every(e=>Math.abs(e.getBoundingClientRect().y-n.querySelector(".bm-search").getBoundingClientRect().y)<3)'))
        check('content begins immediately under the title bar',page.locator('.bookmarks-app').evaluate('n=>Math.abs(n.querySelector(".bm-layout").getBoundingClientRect().y-n.querySelector(".bm-header").getBoundingClientRect().bottom)<1'))
        page.locator('.bm-sort summary').focus(); page.keyboard.press('Enter')
        expect(page.locator('[data-bm-sort]')).to_be_visible()
        page.locator('[data-bm-sort]').select_option('title')
        expect(page.locator('.bm-sort summary')).to_have_attribute('title','书签排序 · 按名称排序')
        page.keyboard.press('Escape')
        expect(page.locator('.bm-sort')).not_to_have_attribute('open','')
        expect(page.locator('.bm-sort summary')).to_be_focused()
        check('title bar supports keyboard sorting and Escape without closing the manager',page.locator('.bookmarks-app').is_visible())
        page.locator('.bm-source-switch summary').click(); page.locator('[data-bm-query]').click()
        check('clicking outside dismisses the source menu',not page.locator('.bm-source-switch').evaluate('n=>n.open'))
        select_source('browser')
        expect(page.locator('.bm-feedback')).to_contain_text('未授予')
        check('denial keeps independent mode', page.locator('[data-bm-source=local]').get_attribute('aria-pressed') == 'true')
        create('工作资料'); work = node_id('工作资料'); folder(work)
        create('设计灵感'); design = node_id('设计灵感'); folder(design)
        create('界面参考'); reference = node_id('界面参考'); folder(reference)
        create('MDN Web Docs','developer.mozilla.org'); guide = node_id('MDN Web Docs')
        create('GitHub','https://github.com'); github = node_id('GitHub')
        check('three levels and bookmark addresses persist', next(node for node in data() if node['id']==guide)['url']=='https://developer.mozilla.org/')
        commands(); page.locator('[data-bm-action=new-bookmark]').click()
        page.locator('[name=title]').fill('Duplicate'); page.locator('[name=url]').fill('https://github.com/')
        page.locator('#bm-editor-form button[type=submit]').click()
        expect(page.locator('.bm-editor-feedback')).to_contain_text('已收藏')
        page.keyboard.press('Escape')
        check('duplicate URL is rejected without losing the manager', page.locator('.bookmarks-app').is_visible() and len(data())==5)
        page.locator('[data-bm-query]').fill('developer.mozilla')
        expect(page.locator('.bm-location')).to_contain_text('工作资料 / 设计灵感 / 界面参考')
        row_action(guide,'locate')
        check('cross-folder search can locate its parent', page.locator('.bm-path-text').inner_text().endswith('界面参考'))
        row_action(guide,'edit'); page.locator('[name=title]').fill('MDN · Web reference')
        page.evaluate('''() => { const original=Storage.prototype.setItem; let fail=true; Storage.prototype.setItem=function(key,value) { if(key==='qiye.state.v5' && fail) { fail=false; throw new DOMException('Simulated quota full','QuotaExceededError'); } return original.call(this,key,value); }; }''')
        page.locator('#bm-editor-form button[type=submit]').click()
        expect(page.locator('.bm-editor-feedback')).to_be_visible()
        check('failed independent save keeps draft and persisted data',page.locator('[name=title]').input_value()=='MDN · Web reference' and next(node for node in data() if node['id']==guide)['title']=='MDN Web Docs')
        page.locator('#bm-editor-form button[type=submit]').click()
        expect(page.locator('.bm-editor-overlay')).to_be_hidden()
        row_action(guide,'move'); page.locator('[name=parentId]').select_option(work); page.locator('#bm-editor-form button[type=submit]').click()
        expect(page.locator('.bm-editor-overlay')).to_be_hidden()
        check('moving a bookmark preserves its identity', next(node for node in data() if node['id']==guide)['parentId']==work)
        row_action(design,'move')
        check('move picker excludes self and descendants', page.locator('[name=parentId] option[value="'+design+'"]').count()==0 and page.locator('[name=parentId] option[value="'+reference+'"]').count()==0)
        page.keyboard.press('Escape')
        page.locator('[data-bm-query]').fill('GitHub'); row_action(github,'locate')
        page.screenshot(path=str(OUT / ('preview-dark.png' if args.preview else 'manager-dark.png')))
        independent = copy.deepcopy(data())
        page.evaluate('__bookmarkTest.acceptRequest=true')
        select_source('browser')
        expect(page.locator('[data-bm-source=browser]')).to_have_attribute('aria-pressed','true')
        expect(page.locator('.bm-tree')).to_contain_text('书签栏')
        check('grant switches to native tree and preserves local data', data()==independent)
        check('system folders have no delete action', page.locator('[data-bm-row="1"] [data-bm-action=delete]').count()==0)
        folder('1'); folder('10')
        check('special browser URLs remain visible without executable links', page.locator('[data-bm-row="12"] a').count()==0)
        create('Native new','https://native.example'); native_id=page.evaluate('__bookmarkTest.nodes.find(n=>n.title==="Native new").id')
        check('native create uses selected native folder', page.evaluate('__bookmarkTest.nodes.find(n=>n.title==="Native new").parentId')=='10')
        row_action(native_id,'edit'); page.locator('[name=title]').fill('Native renamed')
        page.evaluate('__bookmarkTest.failWrite=true'); page.locator('#bm-editor-form button[type=submit]').click()
        expect(page.locator('.bm-editor-feedback')).to_contain_text('Simulated')
        check('failed native save keeps editable draft', page.locator('[name=title]').input_value()=='Native renamed')
        page.evaluate('__bookmarkTest.failWrite=false'); page.locator('#bm-editor-form button[type=submit]').click()
        expect(page.locator('.bm-editor-overlay')).to_be_hidden()
        row_action(native_id,'move'); page.locator('[name=parentId]').select_option('2'); page.locator('#bm-editor-form button[type=submit]').click()
        expect(page.locator('.bm-editor-overlay')).to_be_hidden()
        check('native move calls browser API', page.evaluate('__bookmarkTest.nodes.find(n=>n.title==="Native renamed").parentId')=='2')
        row_action(native_id,'delete'); page.locator('#bm-editor-form button[type=submit]').click(); expect(page.locator('.bm-editor-overlay')).to_be_hidden()
        check('native delete calls browser API', page.evaluate('__bookmarkTest.nodes.some(n=>n.title==="Native renamed")') is False)
        page.evaluate("__bookmarkTest.nodes.push({id:'external',parentId:'2',title:'External bookmark',url:'https://external.example/'});chrome.bookmarks.onCreated.emit('external',{})")
        expect(page.locator('.bm-list')).to_contain_text('External bookmark')
        check('external native changes update the open view')
        page.evaluate("__bookmarkTest.granted=false;chrome.permissions.onRemoved.emit({permissions:['bookmarks']})")
        expect(page.locator('[data-bm-source=local]')).to_have_attribute('aria-pressed','true')
        check('permission revocation returns to preserved independent data', data()==independent and 'External bookmark' not in page.locator('.bm-list').inner_text())
        page.locator('[data-bm-query]').fill('设计灵感'); row_action(design,'delete')
        expect(page.locator('.bm-editor')).to_contain_text('1 个书签和 1 个文件夹')
        page.keyboard.press('Escape'); check('cancelling recursive deletion preserves the subtree', data()==independent)
        row_action(design,'delete'); page.locator('#bm-editor-form button[type=submit]').click(); expect(page.locator('.bm-editor-overlay')).to_be_hidden()
        check('confirmed recursive deletion removes only that subtree', len(data())==2 and any(node['id']==guide for node in data()))
        page.locator('[data-close]').click(); page.reload(); open_manager()
        check('local bookmarks survive reload and sibling instances remain empty', len(data())==2 and page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items.filter(i=>i.widget==="bookmarks"&&i.id!=="bookmarks-4x2").every(i=>i.data.nodes.length===0)'))
        folder(work)
        page.evaluate('document.documentElement.dataset.theme="light"')
        page.screenshot(path=str(OUT / ('preview-light.png' if args.preview else 'manager-light.png')))
        page.set_viewport_size({'width':390,'height':844})
        # Resizing dispatches an asynchronous window event before the host's
        # CSS variables and container queries settle. Await the required layout.
        page.wait_for_function('''() => {
          const sidebar=document.querySelector('.bm-sidebar').getBoundingClientRect();
          const main=document.querySelector('.bm-main').getBoundingClientRect();
          const dialog=document.querySelector('#dialog').getBoundingClientRect();
          return dialog.width<=innerWidth-24+1 && sidebar.right<=main.left+1 && main.width>140;
        }''')
        sidebar = page.locator('.bm-sidebar').bounding_box(); main = page.locator('.bm-main').bounding_box()
        check('narrow screens retain side-by-side folders and links', sidebar['x']+sidebar['width']<=main['x']+1 and main['width']>140)
        check('narrow manager does not overflow', page.locator('.bookmarks-app').evaluate('n=>n.scrollWidth<=n.clientWidth+1'))
        check('narrow title bar stays on one 44px row',page.locator('.bm-header').evaluate('n=>n.offsetHeight===44 && n.scrollWidth<=n.clientWidth'))
        page.locator('.bm-settings summary').click()
        check('narrow settings stays within the window',page.locator('.bm-settings-panel').evaluate('n=>{const a=n.getBoundingClientRect(),b=n.closest(".bookmarks-app").getBoundingClientRect();return a.x>=b.x&&a.right<=b.right}'))
        page.keyboard.press('Escape')
        check('desktop navigation margins do not leak into the manager', page.locator('.bm-main').evaluate('n=>getComputedStyle(n).marginLeft==="0px" && getComputedStyle(n).marginRight==="0px"'))
        page.screenshot(path=str(OUT / ('preview-mobile.png' if args.preview else 'manager-mobile.png')))
        commands(); page.locator('[data-bm-action=new-bookmark]').click(); page.locator('[name=title]').fill('Mobile bookmark'); page.locator('[name=url]').fill('https://mobile.example/'); page.locator('#bm-editor-form button[type=submit]').click()
        expect(page.locator('.bm-editor-overlay')).to_be_hidden(); check('narrow editor remains usable',len(data())==3)
        context.close()
        context = browser.new_context(viewport={'width':1100,'height':800})
        page = context.new_page(); page.set_default_timeout(8000)
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.route('https://**/*',lambda route:route.abort())
        english = copy.deepcopy(seed); english['settings'].update(language='en',theme='light')
        for item in english['items']: item['title']='Bookmarks'
        page.add_init_script('localStorage.setItem("qiye.state.v5",'+json.dumps(json.dumps(english))+');')
        page.goto(base,wait_until='domcontentloaded'); open_manager()
        expect(page.locator('[data-bm-source=browser]')).to_be_disabled()
        check('ordinary web mode does not offer unavailable browser authorization')
        import re
        check('English manager contains translated controls',not re.search('[\u3400-\u9fff]',page.locator('.bookmarks-app').inner_text()))
        page.keyboard.press('Control+f')
        expect(page.locator('[data-bm-query]')).to_be_focused(); check('search shortcut stays inside the bookmark manager')
        create('Example reference','https://example.com')
        page.screenshot(path=str(OUT / ('preview-english.png' if args.preview else 'manager-english.png')))
        check('no uncaught JavaScript errors',not errors)
    except Exception:
        page.screenshot(path=str(OUT/'failure.png'))
        (OUT/'failure.txt').write_text(page.locator('body').inner_text(),encoding='utf-8')
        raise
    finally:
        (OUT / ('preview-report.json' if args.preview else 'report.json')).write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
        context.close(); browser.close(); server.shutdown()
print(f'{len(checks)} bookmark browser checks passed.')
