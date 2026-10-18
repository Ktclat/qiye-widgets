#!/usr/bin/env python3
"""Trending widget regression. External lists are controlled fixtures, not availability claims."""
import argparse
import copy
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import threading
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--preview', action='store_true')
args = parser.parse_args()
OUT = ROOT / 'output/playwright/hotsearch'
OUT.mkdir(parents=True, exist_ok=True)
seed = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {DEFAULT_STATE} from './src/core.js';import {newWidgetConfig} from './src/widget-registry.js';import {HOTSEARCH_SOURCES} from './src/hotsearch-sources.js';console.log(JSON.stringify({state:DEFAULT_STATE,config:newWidgetConfig('hotsearch'),icons:Object.fromEntries(HOTSEARCH_SOURCES.map(s=>[s.id,s.iconUrl]))}))"], cwd=ROOT))
icon_fixture = (ROOT / 'icons/icon32.png').read_bytes()
checks = []

def check(name, condition):
    assert condition, name
    checks.append(name)
    print('PASS', name, flush=True)

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/' + ('Qiye-preview.html' if args.preview else '')

with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH')
    browser = p.chromium.launch(**({'executable_path': executable} if executable else {}))
    try:
        for language, theme in [('zh-CN', 'dark'), ('en', 'light')]:
            state = copy.deepcopy(seed['state'])
            state['settings'].update(language=language, theme=theme, autoExtractIcons=False)
            state['items'] = [dict(id='hot-'+size, type='widget', widget='hotsearch', title='热搜榜' if language=='zh-CN' else 'Trending', size=size, groupId=state['activeGroupId'], config=copy.deepcopy(seed['config']), data={}) for size in ['4x2','2x2','1x1','1x2','2x1']]
            context = browser.new_context(viewport={'width':1440,'height':950}, locale='en-US')
            page = context.new_page()
            page.set_default_timeout(12000)
            errors, requests = [], []
            offline = [False]
            hold_source, held = [''], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            def route_api(route):
                url = route.request.url
                if url in seed['icons'].values():
                    if url == seed['icons']['v2ex']: return route.abort()
                    return route.fulfill(content_type='image/png', body=icon_fixture)
                if 'uapis.cn/api/v1/misc/hotboard' in url or 'api.github.com/search/repositories' in url or 'hot.example.com' in url:
                    requests.append(url)
                    if offline[0]: return route.abort()
                    source = parse_qs(urlparse(url).query).get('type', ['github'])[0]
                    if source == hold_source[0]:
                        held.append(route)
                        return
                    if 'api.github.com' in url:
                        return route.fulfill(json={'items':[{'full_name':f'example/project-{i}', 'html_url':f'https://github.com/example/project-{i}', 'stargazers_count':5000-i*10} for i in range(1,31)]})
                    return route.fulfill(json={'type':source,'update_time':'2026-10-14T02:00:00Z','list':[{'index':i,'title':f'{source} · 测试话题 {i}：这是一条用于布局验收的长标题，不是真实新闻','url':f'https://example.com/{source}/{i}','hot_value':str(5000000-i*10000)} for i in range(1,31)]})
                return route.abort()
            page.route('https://**/*', route_api)
            payload = json.dumps(state, ensure_ascii=False)
            page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'+json.dumps(payload)+')')
            page.goto(base, wait_until='domcontentloaded')
            card = page.locator('[data-widget-id="hot-4x2"]')
            card.wait_for()
            def saved(): return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="hot-4x2").config')
            def close():
                page.locator('#hotsearch-workspace [data-close]').click()
                expect(page.locator('#dialog')).not_to_be_visible()
            def open_widget():
                page.locator('[data-widget-id="hot-4x2"] [data-action=widget-open]').first.click()
                page.locator('#hotsearch-workspace').wait_for()
            check(language+' all sizes render without list requests', page.locator('[data-widget=hotsearch]').count()==5 and not requests)
            open_widget()
            expect(page.locator('[data-hot-board=zhihu] .hotsearch-rows li')).to_have_count(30)
            check(language+' opening directly loads the list with automatic updates off', len(requests)==1 and not saved()['enabled'])
            check(language+' no enable screen is shown',page.locator('[data-hot-action=enable]').count()==0)
            expect(page.locator('#dialog')).to_have_css('transform','none')
            check(language+' reading window matches the reference proportions',page.locator('#dialog').evaluate('n=>n.getBoundingClientRect().width===1000&&n.getBoundingClientRect().height===660'))
            check(language+' thirteen ranks are visible without scrolling',page.locator('[data-hot-board=zhihu] .hotsearch-board-content').evaluate('n=>n.querySelectorAll("li")[12].getBoundingClientRect().bottom<=n.getBoundingClientRect().bottom'))
            # Playwright aborts URLs ending in /favicon.ico before route handlers.
            # Exercise successful hydration with GitHub's PNG and failed images below.
            expect(page.locator('[data-hot-source=github] .hotsearch-logo.is-loaded img')).to_be_visible()
            check(language+' sidebar hydrates the selected site icon',page.locator('[data-hot-source=github] .site-favicon').get_attribute('src')==seed['icons']['github'])
            check(language+' loaded site icons have transparent backgrounds',page.locator('[data-hot-source=github] .hotsearch-logo').evaluate('n=>getComputedStyle(n).backgroundColor==="rgba(0, 0, 0, 0)"'))
            expect(page.locator('[data-hot-source=github] .site-favicon')).to_have_css('filter','brightness(0) invert(1)' if theme=='dark' else 'none')
            check(language+' monochrome GitHub icon follows the theme',True)
            expect(card.locator('.hotsearch-rows li')).to_have_count(4)
            check(language+' desktop tabs show platform names without icons',card.locator('.hotsearch-card-tabs img,.hotsearch-card-tabs .hotsearch-logo').count()==0 and card.locator('[data-hot-card-source=github]').inner_text()=='GitHub')
            check(language+' desktop shows read headlines while automatic updates are off',True)
            page.locator('#dialog').screenshot(path=str(OUT/f'direct-view-{language}.png'),animations='disabled')
            check(language+' list fills the reading area',page.locator('.hotsearch-main').evaluate('n=>parseFloat(getComputedStyle(n).paddingTop)===0&&n.firstElementChild.getBoundingClientRect().height>=n.getBoundingClientRect().height-2'))
            check(language+' article links honor new-tab isolation',page.locator('[data-hot-board=zhihu] .hotsearch-rows a').first.get_attribute('rel')=='noopener noreferrer')
            page.locator('[data-hot-source=weibo]').click()
            expect(page.locator('[data-hot-board=weibo] .hotsearch-rows li')).to_have_count(30)
            check(language+' source choice persists',saved()['activeSource']=='weibo')
            page.locator('[data-hot-source=github]').click()
            expect(page.locator('[data-hot-board=github] .hotsearch-rows li')).to_have_count(30)
            expect(page.locator('[data-hot-board=github] .hotsearch-logo.is-loaded img')).to_be_visible()
            check(language+' switching lists also switches the site icon',page.locator('[data-hot-board=github] .site-favicon').get_attribute('src')==seed['icons']['github'])
            page.locator('[data-hot-source=weibo]').click()
            page.locator('[data-hot-collapse=weibo]').click()
            expect(page.locator('[data-hot-board=weibo] .hotsearch-board-content')).not_to_be_visible()
            page.locator('[data-hot-collapse=weibo]').click()
            page.locator('[data-hot-action=layout]').click()
            expect(page.locator('.hotsearch-boards.is-grid .hotsearch-board')).to_have_count(4)
            expect(page.locator('[data-hot-board=github] .hotsearch-rows li')).to_have_count(30)
            check(language+' grid layout persists',saved()['layout']=='grid')
            page.locator('[data-hot-category=tech]').click()
            expect(page.locator('[data-hot-board=weibo]')).to_have_count(0)
            page.locator('[data-hot-action=search]').click()
            page.locator('#hotsearch-query').fill('github')
            expect(page.locator('.hotsearch-board')).to_have_count(2)
            page.locator('#hotsearch-query').fill('no-such-platform')
            expect(page.locator('.hotsearch-main-empty')).to_be_visible()
            page.locator('#hotsearch-query').fill('')
            page.locator('[data-hot-category=subscribed]').click()
            page.locator('[data-hot-action=layout]').click()
            page.locator('[data-hot-action=manage]').first.click()
            manager=page.locator('#hotsearch-manager')
            expect(manager.locator('[data-hot-subscribe=github-ai] .hotsearch-logo.is-loaded img')).to_be_visible()
            failed_icon=manager.locator('[data-hot-subscribe=v2ex] .hotsearch-logo')
            check(language+' unavailable icons keep a clean fallback',failed_icon.locator('.site-fallback').is_visible() and not failed_icon.locator('img').get_attribute('src'))
            manager.locator('[data-hot-manage-query]').fill('百度')
            check(language+' manager filters without losing input focus', page.locator('[data-hot-manage-query]').evaluate('n=>n===document.activeElement'))
            manager.locator('[data-hot-subscribe=baidu]').click()
            expect(manager.locator('[data-hot-subscribe=baidu]').first).to_have_attribute('aria-pressed','true')
            check(language+' subscription saved independently', 'baidu' in saved()['subscriptions'] and page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="hot-2x2").config.enabled') is False)
            manager.locator('[data-hot-move=baidu][data-direction="-1"]').click()
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items[0].config.subscriptions[3]==="baidu"')
            manager.locator('[data-hot-drag=baidu]').focus()
            page.keyboard.press('Alt+ArrowUp')
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items[0].config.subscriptions[2]==="baidu"')
            check(language+' arrow and keyboard reorder persist',saved()['subscriptions'][2]=='baidu')
            def begin_drag(source, target):
                handle=manager.locator(f'[data-hot-drag={source}]')
                handle.scroll_into_view_if_needed()
                # Keyboard reordering animates rows for 200ms; raw mouse coordinates
                # must be captured after those rows stop moving.
                manager.evaluate('e=>Promise.all(e.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})))')
                start=handle.bounding_box()
                end=manager.locator(f'[data-hot-sort={target}]').bounding_box()
                page.mouse.move(start['x']+start['width']/2,start['y']+start['height']/2)
                page.mouse.down()
                page.mouse.move(start['x']+start['width']/2+10,start['y']+start['height']/2,steps=5)
                page.mouse.move(end['x']+end['width']/2,end['y']+end['height']/2,steps=8)
                page.mouse.move(end['x']+end['width']/2+1,end['y']+end['height']/2)
            begin_drag('baidu','zhihu')
            expect(manager.locator('[data-hot-sort=baidu]')).to_have_class('is-dragging')
            expect(manager.locator('[data-hot-sort=zhihu]')).to_have_class('is-drop-target is-drop-before')
            check(language+' dragging shows a placeholder and insertion marker',True)
            page.screenshot(path=str(OUT/f'drag-{language}.png'))
            page.mouse.up()
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items[0].config.subscriptions[0]==="baidu"')
            check(language+' drag reorders subscriptions',saved()['subscriptions'][0]=='baidu')
            check(language+' drop removes drag effects',page.locator('.is-dragging,.is-drop-target,.hotsearch-drag-preview').count()==0)
            expect(manager.locator('.hotsearch-manager-feedback.is-transient')).to_be_visible()
            expect(manager.locator('.hotsearch-manager-feedback')).not_to_be_visible(timeout=4000)
            check(language+' saved-order notice disappears automatically',True)
            before_cancel=saved()['subscriptions']
            begin_drag('github','baidu')
            expect(manager.locator('[data-hot-sort=github]')).to_have_class('is-dragging')
            page.keyboard.press('Escape')
            page.mouse.up()
            expect(manager).to_be_visible()
            check(language+' cancel keeps order and clears drag effects',saved()['subscriptions']==before_cancel and page.locator('.is-dragging,.is-drop-target,.hotsearch-drag-preview').count()==0)
            # A newer error must not be dismissed by a previous success timer.
            manager.locator('[data-hot-drag=github]').focus()
            page.keyboard.press('Alt+ArrowUp')
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items[0].config.subscriptions[3]==="github"')
            expect(manager.locator('.hotsearch-manager-feedback.is-transient')).to_be_visible()
            page.evaluate("()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='qiye.state.v5')throw new Error('Test disk full');return window.originalSetItem.call(this,k,v)}}")
            manager.locator('[data-hot-subscribe=baidu]').first.focus()
            page.keyboard.press('Enter')
            expect(manager.locator('.hotsearch-manager-feedback')).to_be_visible()
            check(language+' failed save retains subscription', 'baidu' in saved()['subscriptions'])
            page.wait_for_timeout(2600)
            check(language+' error survives the previous success timeout',manager.locator('.hotsearch-manager-feedback').is_visible() and 'is-transient' not in manager.locator('.hotsearch-manager-feedback').get_attribute('class'))
            page.evaluate('()=>{Storage.prototype.setItem=window.originalSetItem}')
            page.keyboard.press('Escape')
            expect(page.locator('.hotsearch-manager-overlay')).not_to_be_visible()
            check(language+' Escape returns focus to manager button',page.locator('[data-hot-action=manage]').first.evaluate('n=>n===document.activeElement'))
            page.locator('[data-hot-source=zhihu]').click()
            expect(page.locator('[data-hot-board=zhihu] .hotsearch-rows li')).to_have_count(30)
            reading_height=page.locator('.hotsearch-layout').bounding_box()['height']
            page.evaluate("()=>{window.originalAnimate=Element.prototype.animate;window.sortAnimations=0;Element.prototype.animate=function(...args){if(this.matches('[data-hot-sort]'))window.sortAnimations++;return window.originalAnimate.apply(this,args)}}")
            if language=='en': page.emulate_media(reduced_motion='reduce')
            sidebar=page.locator('.hotsearch-sidebar')
            sidebar.locator('[data-hot-drag="52pojie"]').drag_to(sidebar.locator('[data-hot-sort=github]'))
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items[0].config.subscriptions[3]==="52pojie"')
            expect(page.locator('.hotsearch-feedback.is-transient')).to_be_visible()
            check(language+' sidebar drag saves without resizing the reading area',page.locator('.hotsearch-layout').bounding_box()['height']==reading_height)
            check(language+' reorder animation follows reduced-motion preference',(page.evaluate('window.sortAnimations')==0) if language=='en' else page.evaluate('window.sortAnimations')>0)
            page.evaluate('()=>{Element.prototype.animate=window.originalAnimate}')
            page.emulate_media(reduced_motion='no-preference')
            expect(page.locator('.hotsearch-feedback')).not_to_be_visible(timeout=4000)
            check(language+' sidebar notice also dismisses automatically',True)
            page.wait_for_timeout(3100)
            offline[0]=True
            page.locator('[data-hot-action=refresh]').click()
            expect(page.locator('[data-hot-board=zhihu] .hotsearch-error')).to_be_visible()
            check(language+' failed refresh retains all cached rows',page.locator('[data-hot-board=zhihu] .hotsearch-rows li').count()==30)
            expect(page.locator('[data-widget-id="hot-4x2"] .hotsearch-card-footer')).to_contain_text('缓存' if language=='zh-CN' else 'Cache')
            check(language+' workspace refresh updates the desktop card',True)
            page.screenshot(path=str(OUT/f'desktop-{language}.png'),animations='disabled')
            page.locator('[data-detail-action=window-expand]').click()
            check(language+' maximize works', 'widget-app-expanded' in page.locator('#dialog').get_attribute('class'))
            for width in [760,360]:
                page.set_viewport_size({'width':width,'height':740})
                check(f'{language} fits {width}px',page.locator('#dialog').evaluate('n=>n.scrollWidth<=n.clientWidth+1') and page.locator('.hotsearch-main').evaluate('n=>n.scrollWidth<=n.clientWidth+1'))
            page.locator('[data-hot-action=manage]').first.click()
            check(language+' mobile manager fits',manager.evaluate('n=>n.scrollWidth<=n.clientWidth+1'))
            page.screenshot(path=str(OUT/f'mobile-{language}.png'),animations='disabled')
            page.keyboard.press('Escape')
            close()
            page.reload(wait_until='domcontentloaded')
            open_widget()
            expect(page.locator('[data-hot-board=zhihu] .hotsearch-rows li')).to_have_count(30)
            check(language+' subscriptions and cached list survive reload',saved()['subscriptions'][0]=='baidu')
            page.locator('[data-hot-action=manage]').first.click()
            if not manager.locator('[name=enabled]').is_visible(): manager.locator('summary').click()
            manager.locator('[name=enabled]').check()
            manager.locator('button[type=submit]').click()
            expect(page.locator('.hotsearch-manager-overlay')).not_to_be_visible()
            check(language+' automatic updates can be enabled independently',saved()['enabled'])
            page.locator('[data-hot-action=manage]').first.click()
            if not manager.locator('[name=enabled]').is_visible(): manager.locator('summary').click()
            manager.locator('[name=enabled]').uncheck()
            manager.locator('button[type=submit]').click()
            expect(page.locator('.hotsearch-manager-overlay')).not_to_be_visible()
            expect(page.locator('[data-hot-board=zhihu] .hotsearch-rows li')).to_have_count(30)
            check(language+' disabling automatic updates keeps the list readable',not saved()['enabled'])
            page.clock.install()
            count_before_tick=len(requests)
            page.clock.fast_forward(11*60*1000)
            check(language+' paused widgets do not poll',len(requests)==count_before_tick)
            page.locator('[data-hot-action=refresh]').click()
            expect(page.locator('[data-hot-action=refresh]')).to_be_enabled()
            check(language+' manual refresh still works while paused',len(requests)>count_before_tick)
            page.clock.resume()
            close()
            offline[0]=False
            hold_source[0]='zhihu'
            page.evaluate("()=>{localStorage.removeItem('qiye.hotsearch.v1');const state=JSON.parse(localStorage.getItem('qiye.state.v5'));Object.assign(state.items[0].config,{enabled:true,activeSource:'zhihu'});localStorage.setItem('qiye.state.v5',JSON.stringify(state))}")
            page.reload(wait_until='domcontentloaded')
            page.locator('[data-widget-id="hot-4x2"] [data-hot-card-source=weibo]').click()
            expect(page.locator('[data-widget-id="hot-4x2"] .hotsearch-rows li')).to_have_count(4)
            page.locator('[data-widget-id="hot-4x2"]').screenshot(path=str(OUT/f'compact-card-{language}.png'),animations='disabled')
            check(language+' card switches immediately while previous source is pending',saved()['activeSource']=='weibo' and 'weibo' in page.locator('[data-widget-id="hot-4x2"] .hotsearch-title').first.inner_text())
            for route in held:
                route.abort()
            hold_source[0]=''
            small=page.locator('[data-widget-id="hot-2x2"]')
            picker=small.locator('[data-hot-card-select]')
            check(language+' compact platform selector stays within the card',picker.is_visible() and picker.evaluate('n=>{const r=n.getBoundingClientRect(),p=n.closest(".widget-inner").getBoundingClientRect();return r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom}'))
            picker.select_option('github')
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="hot-2x2").config.activeSource==="github"')
            check(language+' compact platform selection is independent',saved()['activeSource']=='weibo' and not page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="hot-2x2").config.enabled'))
            legacy=copy.deepcopy(seed['state'])
            legacy['settings'].update(language=language,theme=theme,autoExtractIcons=False)
            legacy['items']=[dict(id='legacy-hot',type='widget',widget='hotlinks',title='My custom trends',size='4x2',groupId=legacy['activeGroupId'],config={},data={})]
            page.evaluate('(state)=>{localStorage.removeItem("qiye.hotsearch.v1");localStorage.setItem("qiye.state.v5",JSON.stringify(state))}',legacy)
            count_before_upgrade=len(requests)
            page.reload(wait_until='domcontentloaded')
            upgraded=page.locator('[data-widget-id=legacy-hot][data-widget=hotsearch]')
            upgraded.wait_for()
            check(language+' legacy card upgrades without background requests',len(requests)==count_before_upgrade and page.locator('[data-widget=hotlinks]').count()==0)
            upgraded.locator('[data-action=widget-open]').first.click()
            expect(page.locator('[data-hot-board=zhihu] .hotsearch-rows li')).to_have_count(30)
            check(language+' existing card opens new rankings and keeps its custom name',page.locator('#dialog-title').inner_text()=='My custom trends' and page.locator('[data-platform-filter],.utility-hotlinks').count()==0)
            page.locator('[data-hot-source=weibo]').click()
            expect(page.locator('[data-hot-board=weibo] .hotsearch-rows li')).to_have_count(30)
            upgraded_saved=page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items[0]')
            check(language+' first edit persists the upgraded card without changing identity',upgraded_saved['id']=='legacy-hot' and upgraded_saved['widget']=='hotsearch' and upgraded_saved['title']=='My custom trends' and not upgraded_saved['config']['enabled'])
            page.reload(wait_until='domcontentloaded')
            page.locator('[data-widget-id=legacy-hot][data-widget=hotsearch]').wait_for()
            check(language+' upgraded card survives reload',True)
            check(language+' no uncaught JavaScript errors',not errors)
            context.close()
    finally:
        browser.close()
        server.shutdown()
(OUT/('preview-report.json' if args.preview else 'report.json')).write_text(json.dumps({'checks':checks,'passed':len(checks),'external_api_fixtures':True},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(checks)} hotsearch checks passed.',flush=True)
