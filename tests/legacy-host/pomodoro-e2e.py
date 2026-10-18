#!/usr/bin/env python3
"""Pomodoro lifecycle and responsive layouts against source or the standalone preview."""
import argparse
import copy
import json
import os
import subprocess
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--preview', action='store_true')
args = parser.parse_args()
OUT = ROOT / 'output/playwright/pomodoro'
OUT.mkdir(parents=True, exist_ok=True)
seed = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', '''
import {DEFAULT_STATE} from './src/core.js';
import {newWidgetConfig} from './src/widget-registry.js';
import {newWidgetData} from './src/widget-data.js';
const state=structuredClone(DEFAULT_STATE);
state.settings.language='zh-CN'; state.settings.autoExtractIcons=false;
state.items=['1x1','1x2','2x1','2x2','4x2'].map((size,i)=>({id:'pomo-'+i,type:'widget',widget:'pomodoro',title:'番茄钟',groupId:'home',size,config:newWidgetConfig('pomodoro'),data:newWidgetData('pomodoro')}));
console.log(JSON.stringify(state));
'''], cwd=ROOT))
checks, errors = [], []


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

    def setup(state=None, width=1440, height=1000, clock=None):
        context = browser.new_context(viewport={'width': width, 'height': height}, locale='zh-CN', timezone_id='Asia/Hong_Kong', reduced_motion='reduce')
        page = context.new_page()
        page.set_default_timeout(8000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('https://**/*', lambda route: route.abort())
        if clock is not None: page.clock.install(time=datetime.fromtimestamp(clock / 1000, timezone.utc))
        payload = json.dumps(state or seed, ensure_ascii=False)
        page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",' + json.dumps(payload) + ')')
        page.goto(base, wait_until='domcontentloaded')
        page.locator('[data-item]').first.wait_for()
        return context, page

    def saved(page): return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5"))')
    def data(page, id='pomo-3'): return next(item['data'] for item in saved(page)['items'] if item['id'] == id)
    def open_timer(page, id='pomo-3'):
        page.locator(f'[data-item="{id}"] .pomo-open-dial').click()
        page.locator('.pomo-app').wait_for()
    def close(page):
        page.locator('#dialog [data-close]').click()
        page.locator('#dialog').wait_for(state='hidden')
    def phase(page, phase):
        page.wait_for_function('(phase)=>JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="pomo-3").data.phase===phase', arg=phase)

    try:
        context, page = setup(clock=1792029600000)
        page.locator('.top-tools [data-action=add]').click()
        page.locator('[data-catalog-category="效率"]').click()
        page.locator('#widget-query').fill('番茄钟')
        check('catalog search exposes Pomodoro in productivity', page.locator('[data-catalog-widget=pomodoro]').is_visible())
        check('retired focus timer is absent from the catalog', page.locator('[data-add-widget=focus]').count() == 0)
        page.locator('[data-add-widget=pomodoro]').click()
        page.wait_for_function('document.querySelector("[data-add-feedback]")?.textContent.length > 0')
        check('catalog remains open after adding Pomodoro', page.locator('#dialog').is_visible())
        page.locator('#dialog [data-close]').click()
        page.locator('#dialog').wait_for(state='hidden')
        check('adding creates an independent timer', len(saved(page)['items']) == 6)
        for card in page.locator('#desktop [data-widget=pomodoro]').all():
            rect = card.bounding_box()
            time = card.locator('[data-pomo=time]').bounding_box()
            check(f'{card.get_attribute("data-display-size")} timer is visible inside its card', time['width'] > 10 and time['height'] > 8 and time['x'] >= rect['x'] and time['x'] + time['width'] <= rect['x'] + rect['width'] + 1 and time['y'] >= rect['y'] and time['y'] + time['height'] <= rect['y'] + rect['height'] + 1)
        page.screenshot(path=str(OUT / 'cards.png'))
        open_timer(page)
        check('header is a compact single row', page.locator('.pomo-app-header').bounding_box()['height'] <= 52)
        check('all durations are editable without opening settings', page.locator('[data-pomo-duration-form] input:visible').count() == 3 and not page.locator('.pomo-preferences').get_attribute('open'))
        page.locator('[data-pomo-task-form] input').fill('写好番茄钟的交互说明')
        page.locator('#dialog [data-pomo-action=toggle]').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="pomo-3").data.status==="running"')
        check('starting captures the task without an extra save click', data(page)['task'] == '写好番茄钟的交互说明')
        check('active task and phase are locked', page.locator('[data-pomo-task-form] input').is_disabled() and page.locator('[data-phase-value=short]').is_disabled())
        page.clock.fast_forward(61000)
        page.locator('#dialog [data-pomo-action=toggle]').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="pomo-3").data.status==="paused"')
        remaining = data(page)['remaining']
        check('wall-clock progress is reflected on pause', 1437 <= remaining <= 1439)
        page.clock.fast_forward(60000)
        check('paused time stays frozen', data(page)['remaining'] == remaining)
        page.reload(); open_timer(page)
        check('reload restores a paused round and its task', data(page)['status'] == 'paused' and page.locator('[data-pomo-task-form] input').input_value() == '写好番茄钟的交互说明')
        page.locator('#dialog [data-pomo-action=toggle]').click()
        page.clock.fast_forward((remaining + 2) * 1000)
        phase(page, 'short')
        check('card and detail count one completion', len(data(page)['sessions']) == 1 and data(page)['status'] == 'idle')
        check('a completed focus enters a green break', page.locator('.pomo-app').get_attribute('data-phase') == 'short')
        page.screenshot(path=str(OUT / 'break.png'))
        page.clock.fast_forward(3600000)
        check('time away does not generate extra tomatoes', len(data(page)['sessions']) == 1 and data(page)['phase'] == 'short')
        page.locator('#dialog [data-pomo-action=skip]').click(); phase(page, 'focus')
        for round in range(2, 5):
            page.locator('#dialog [data-pomo-action=toggle]').click()
            page.clock.fast_forward(1501000)
            phase(page, 'long' if round == 4 else 'short')
            if round != 4:
                page.locator('#dialog [data-pomo-action=skip]').click(); phase(page, 'focus')
        check('four focus rounds select a long break', data(page)['cycle'] == 4 and len(data(page)['sessions']) == 4 and data(page)['remaining'] == 900)
        page.locator('#dialog [data-pomo-action=toggle]').click()
        page.clock.fast_forward(901000); phase(page, 'focus')
        check('long break resets the cycle without adding a tomato', data(page)['cycle'] == 0 and len(data(page)['sessions']) == 4)
        page.locator('#dialog [data-pomo-action=toggle]').click()
        page.locator('[data-pomo-duration-form] [name=focusMinutes]').fill('50')
        page.locator('[data-pomo-duration-form] [name=shortBreakMinutes]').fill('10')
        page.locator('[data-pomo-duration-form] [type=submit]').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="pomo-3").config.focusMinutes===50')
        check('settings preserve the active round', data(page)['duration'] == 1500)
        page.clock.fast_forward(1501000); phase(page, 'short')
        check('new durations apply to the following phase', data(page)['remaining'] == 600)
        check('sibling timers remain untouched', data(page, 'pomo-4')['status'] == 'idle' and data(page, 'pomo-4')['sessions'] == [])
        context.close()

        # Direct editing works for all phases and can be applied together with Start.
        context, page = setup()
        open_timer(page)
        for name, value in [('focusMinutes', '37'), ('shortBreakMinutes', '7'), ('longBreakMinutes', '18')]:
            page.locator(f'[data-pomo-duration-form] [name={name}]').fill(value)
        page.locator('[data-pomo-duration-form] [name=focusMinutes]').press('Enter')
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="pomo-3").config.focusMinutes===37')
        check('typing a duration and Enter immediately updates an idle timer', page.locator('#dialog [data-pomo=time]').inner_text() == '37:00')
        page.locator('[data-phase-value=short]').click(); phase(page, 'short')
        check('short break uses the directly entered duration', data(page)['remaining'] == 420)
        page.locator('[data-phase-value=long]').click(); phase(page, 'long')
        check('long break uses the directly entered duration', data(page)['remaining'] == 1080)
        page.reload(); open_timer(page)
        check('custom durations survive reload', [page.locator(f'[data-pomo-duration-form] [name={name}]').input_value() for name in ['focusMinutes', 'shortBreakMinutes', 'longBreakMinutes']] == ['37', '7', '18'])
        page.locator('[data-pomo-action=preferences]').click()
        page.locator('[data-pomo-settings-form] [name=dailyGoal]').fill('10')
        page.locator('[data-pomo-settings-form] [name=sound]').uncheck()
        page.locator('[data-pomo-settings-form] [type=submit]').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="pomo-3").config.dailyGoal===10')
        check('advanced preferences preserve custom duration values', next(i for i in saved(page)['items'] if i['id'] == 'pomo-3')['config']['focusMinutes'] == 37)
        page.locator('[data-phase-value=focus]').click(); phase(page, 'focus')
        page.locator('[data-pomo-duration-form] [name=focusMinutes]').fill('0')
        page.locator('[data-pomo-duration-form] [type=submit]').click()
        check('out-of-range durations cannot replace saved values', data(page)['remaining'] == 2220 and not page.locator('[data-pomo-duration-form]').evaluate('n=>n.checkValidity()'))
        page.locator('[data-pomo-duration-form] [name=focusMinutes]').fill('42')
        page.locator('#dialog [data-pomo-action=toggle]').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="pomo-3").data.status==="running"')
        check('Start applies the typed duration without a separate save', data(page)['duration'] == 2520)
        page.locator('#dialog [data-pomo-action=toggle]').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="pomo-3").data.status==="paused"')
        page.locator('[data-pomo-duration-form] [name=focusMinutes]').fill('45')
        page.locator('[data-pomo-duration-form] [type=submit]').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="pomo-3").config.focusMinutes===45')
        check('editing durations preserves a paused round and the sound setting', data(page)['duration'] == 2520 and next(i for i in saved(page)['items'] if i['id'] == 'pomo-3')['config']['sound'] is False)
        page.locator('#dialog [data-pomo-action=reset]').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="pomo-3").data.duration===2700')
        context.close()

        legacy = copy.deepcopy(seed)
        legacy['items'][3].update({'widget': 'focus', 'title': '专注计时', 'config': {}, 'data': {'focus': {'duration': 40, 'remaining': 90, 'running': False, 'endAt': None}}})
        context, page = setup(legacy)
        open_timer(page)
        check('existing focus cards open as Pomodoro with remaining time preserved', page.locator('#dialog [data-pomo=time]').inner_text() == '01:30' and page.locator('#dialog-title').inner_text() == '番茄钟')
        page.locator('#dialog [data-pomo-action=toggle]').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="pomo-3").widget==="pomodoro"')
        check('resuming persists the migration and original duration', data(page)['duration'] == 2400 and data(page)['status'] == 'running')
        context.close()

        # Page-close recovery and hidden groups use the original completion time.
        returning = copy.deepcopy(seed)
        target = returning['items'][3]
        target['groupId'] = 'work'
        target['data'].update({'status': 'running', 'endAt': 1792029600000 - 2000, 'task': 'Closed-page session'})
        # Existing defaults may use a different work group id; choose an actual inactive group.
        target['groupId'] = returning['groups'][1]['id']
        context, page = setup(returning, clock=1792029600000)
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="pomo-3").data.sessions.length===1')
        check('expired timers in hidden groups settle when the page returns', data(page)['phase'] == 'short' and data(page)['sessions'][0]['completedAt'] == 1792029600000 - 2000)
        context.close()

        # A failed save must not leave a visually running but unpersisted round.
        context, page = setup()
        open_timer(page)
        page.evaluate('''() => { const original=Storage.prototype.setItem; window.restorePomodoroStorage=()=>Storage.prototype.setItem=original; Storage.prototype.setItem=function(key,value){if(key==='qiye.state.v5')throw new DOMException('quota','QuotaExceededError');return original.call(this,key,value);}; }''')
        page.locator('[data-pomo-task-form] input').fill('Keep this draft')
        page.locator('[data-pomo-duration-form] [name=focusMinutes]').fill('35')
        page.locator('#dialog [data-pomo-action=toggle]').click()
        page.locator('.pomo-feedback').filter(has_text='未能保存').wait_for()
        check('failed start rolls back the timer', data(page)['status'] == 'idle' and page.locator('.pomo-app').get_attribute('data-status') == 'idle')
        check('failed start preserves the task draft', page.locator('[data-pomo-task-form] input').input_value() == 'Keep this draft')
        check('failed start preserves the duration draft', page.locator('[data-pomo-duration-form] [name=focusMinutes]').input_value() == '35' and data(page)['duration'] == 1500)
        page.evaluate('() => { window.restorePomodoroStorage(); }')
        page.locator('#dialog [data-pomo-action=toggle]').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="pomo-3").data.status==="running"')
        check('explicit retry persists the task, duration and timer', data(page)['task'] == 'Keep this draft' and data(page)['duration'] == 2100)
        context.close()

        compact = copy.deepcopy(seed)
        compact['settings'].update({'theme': 'light', 'language': 'en', 'useThemeColor': True, 'themeColor': '#6259bb'})
        for current in compact['items']:
            current['config'].update({'focusMinutes': 180, 'longBreakEvery': 12})
            current['data'].update({'duration': 10800, 'remaining': 10800, 'task': 'A deliberately long focus task that should wrap or truncate gracefully in the smallest card.'})
        context, page = setup(compact, width=360, height=800)
        for card in page.locator('#desktop [data-widget=pomodoro]').all():
            check(f'{card.get_attribute("data-display-size")} at narrow width contains controls and a three-digit timer', card.evaluate('''n=>{const r=n.getBoundingClientRect();return [...n.querySelectorAll('button,[data-pomo=time]')].filter(e=>e.getClientRects().length).every(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top-1&&b.bottom<=r.bottom+1})}'''))
        open_timer(page)
        check('custom accent applies to the dedicated workspace', page.locator('#dialog .pomo-start').evaluate('n=>getComputedStyle(n).backgroundColor') == 'rgb(98, 89, 187)')
        context.close()

        for theme, language, width, scale in [('light', 'zh-CN', 1440, 100), ('dark', 'zh-CN', 1440, 100), ('light', 'en', 360, 150), ('dark', 'zh-CN', 360, 75)]:
            state = copy.deepcopy(seed)
            state['settings'].update({'theme': theme, 'language': language, 'windowSize': scale})
            context, page = setup(state, width=width, height=900 if width > 500 else 720)
            open_timer(page)
            dialog = page.locator('#dialog').bounding_box()
            check(f'{theme}/{language}/{scale}% workspace fits viewport', dialog['x'] >= 0 and dialog['x'] + dialog['width'] <= width + 1)
            check(f'{theme}/{language} content has no horizontal overflow', page.locator('.pomo-app-scroll').evaluate('n=>n.scrollWidth<=n.clientWidth+1'))
            check(f'{theme}/{language} header remains compact', page.locator('.pomo-app-header').bounding_box()['height'] <= 52)
            check(f'{theme}/{language} duration inputs fit without scrolling sideways', page.locator('[data-pomo-duration-form]').evaluate('n=>n.scrollWidth<=n.clientWidth+1'))
            check(f'{theme}/{language} timer is legible', page.locator('#dialog [data-pomo=time]').evaluate('n=>parseFloat(getComputedStyle(n).fontSize)>=44'))
            if language == 'en':
                check('English workspace has no untranslated Chinese', not page.locator('.pomo-app').evaluate('n=>/[\u3400-\u9fff]/.test(n.innerText.replace("番茄钟",""))'))
            page.screenshot(path=str(OUT / f'workspace-{theme}-{language}-{width}.png'))
            page.locator('[data-pomo-action=preferences]').click()
            check(f'{theme}/{language} rhythm settings remain within the viewport', page.locator('[data-pomo-settings-form]').evaluate('n=>n.scrollWidth<=n.clientWidth+1'))
            close(page)
            context.close()
        check('no runtime exceptions', not errors)
        (OUT / ('preview.json' if args.preview else 'source.json')).write_text(json.dumps({'checks': checks, 'errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'{len(checks)} checks passed', flush=True)
    finally:
        browser.close()
        server.shutdown()
