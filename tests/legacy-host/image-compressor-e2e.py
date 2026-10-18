#!/usr/bin/env python3
"""Compression, cancellation, wallpaper races and lifecycle on HTTP/standalone."""
import argparse
import copy
import io
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import threading
import zipfile
from playwright.sync_api import sync_playwright
from image_fixtures import upload

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--preview', action='store_true')
args = parser.parse_args()
OUT = ROOT / 'output/playwright/image-compressor'
OUT.mkdir(parents=True, exist_ok=True)
initial = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', """
import {DEFAULT_STATE} from './src/core.js';
const s=structuredClone(DEFAULT_STATE);s.settings.autoExtractIcons=false;
s.items=['1x1','1x2','2x1','2x2','4x2'].map((size,i)=>({id:'c'+i,groupId:'home',type:'widget',widget:'image-compressor',title:'图片压缩',size,config:{},data:{}}));
console.log(JSON.stringify(s));
"""], cwd=ROOT))


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


checks = []


def check(name, ok):
    assert ok, name
    checks.append(name)
    print('PASS', name, flush=True)


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH')
    browser = p.chromium.launch(**({'executable_path': executable} if executable else {}))
    try:
        for language, theme, width in [('zh-CN', 'light', 1440), ('en', 'dark', 390)]:
            state = copy.deepcopy(initial)
            state['settings'].update(language=language, theme=theme)
            context = browser.new_context(viewport={'width': width, 'height': 850}, accept_downloads=True)
            page = context.new_page()
            page.set_default_timeout(15000)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('https://**/*', lambda route: route.abort())
            page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'
                                 + json.dumps(json.dumps(state)) + ')')
            page.add_init_script("""window.imageURLs=new Set();
const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=create(blob);imageURLs.add(url);return url;};
URL.revokeObjectURL=url=>{imageURLs.delete(url);revoke(url);};
window.realBitmap=createImageBitmap;
window.holdDecode=()=>{window.decodeEntered=false;window.decodeReleased=false;createImageBitmap=async(...args)=>{
  createImageBitmap=realBitmap;decodeEntered=true;await new Promise(r=>window.releaseDecode=r);
  const result=await realBitmap(...args);decodeReleased=true;return result;};};""")
            page.goto(f'http://127.0.0.1:{server.server_port}/' + ('Qiye-preview.html' if args.preview else ''))
            page.locator('[data-item=c3]').wait_for()

            def saved():
                return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5"))')

            def open_tool():
                page.locator('[data-item=c3] [data-image-compressor-open]').click()
                page.locator('[data-image-files]').wait_for(state='attached')

            def close():
                page.locator('#dialog [data-close]').first.click()
                page.locator('#dialog').wait_for(state='hidden')

            check(f'{language}: all five compact card sizes render', page.locator('#desktop [data-image-compressor-open]').count() == 5)
            open_tool()
            check('single-row 46px header', abs(page.locator('.image-tool-header').bounding_box()['height'] - 46) < 1)
            check('initial focus is on title, not a settings control', page.evaluate('document.activeElement.id') == 'dialog-title')
            expand = page.locator('[data-detail-action=window-expand]')
            expand.click()
            check('maximize works', expand.get_attribute('aria-pressed') == 'true')
            expand.click()
            check('restore works', expand.get_attribute('aria-pressed') == 'false')
            page.locator('[data-image-files]').set_input_files([upload('first.png'), upload('second.png')])
            page.locator('[data-image-run]').click()
            page.locator('[data-image-compare]').wait_for(state='visible')
            check('two files complete', page.locator('[data-image-row]').count() == 2)
            page.wait_for_function('[...document.querySelectorAll(".image-tool-preview img")].every(i=>i.complete&&i.naturalWidth===256)')
            with page.expect_download() as download:
                page.locator('[data-image-download]').click()
            check('downloads actual WebP output', download.value.suggested_filename.endswith('.webp') and download.value.path().read_bytes()[8:12] == b'WEBP')
            with page.expect_download() as download:
                page.locator('[data-image-zip]').click()
            with zipfile.ZipFile(io.BytesIO(download.value.path().read_bytes())) as archive:
                check('ZIP contains both results with valid deterministic dates', len(archive.infolist()) == 2 and all(i.date_time == (1980, 1, 1, 0, 0, 0) for i in archive.infolist()) and archive.testzip() is None)
            check('files do not enter persistent widget data', saved()['items'] == state['items'])
            page.locator('[data-image-split]').focus()
            page.keyboard.press('ArrowRight')
            check('comparison slider is keyboard accessible', page.locator('[data-image-split]').input_value() == '51')
            check('workspace fits narrow and wide windows', page.locator('.image-tool').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
            check('desktop navigation margins do not leak into image preview', page.locator('.image-tool-main').evaluate('e=>getComputedStyle(e).marginLeft==="0px"'))
            page.screenshot(path=str(OUT / f'{language}{"-preview" if args.preview else ""}.png'))
            page.locator('[data-image-mode]').select_option('lossless')
            page.locator('[data-image-run]').click()
            page.locator('[data-image-compare]').wait_for(state='visible')
            with page.expect_download() as download:
                page.locator('[data-image-download]').click()
            check('lossless mode retains PNG', download.value.path().read_bytes().startswith(b'\x89PNG'))
            page.locator('[data-image-files]').set_input_files(upload('animated.png', animated=True))
            page.locator('[data-image-run]').click()
            page.locator('.image-tool-row-error').wait_for()
            check('animated PNG is rejected in both languages', ('Animated' if language == 'en' else '动画') in page.locator('.image-tool-row-error').inner_text())
            page.locator('[data-image-mode]').select_option('smart')
            page.locator('[data-image-files]').set_input_files(upload())
            page.evaluate('holdDecode()')
            page.locator('[data-image-run]').click()
            page.wait_for_function('decodeEntered')
            page.locator('[data-image-cancel]').click()
            page.evaluate('releaseDecode()')
            page.wait_for_function('decodeReleased')
            check('canceled decode cannot publish output', page.locator('[data-image-results]').is_hidden() and page.locator('[data-image-run]').is_enabled())
            close()
            page.wait_for_function('imageURLs.size===0')
            check('all temporary URLs released after close', True)
            open_tool()
            check('reopen clears file queue', page.locator('[data-image-results]').is_hidden() and page.locator('[data-image-run]').is_disabled())
            close()

            page.locator('.top-tools [data-action=wallpaper]').click()
            page.evaluate('holdDecode()')
            page.locator('#wallpaper-file').set_input_files(upload('stale.png'))
            page.wait_for_function('decodeEntered')
            close()
            page.evaluate('releaseDecode()')
            page.wait_for_function('decodeReleased')
            page.wait_for_timeout(300)
            check('closing wallpaper window invalidates pending upload', not page.locator('#dialog').is_visible() and not saved()['settings']['customWallpaper'])
            page.locator('.top-tools [data-action=wallpaper]').click()
            page.evaluate('holdDecode()')
            page.locator('#wallpaper-file').set_input_files(upload('slow.png'))
            page.wait_for_function('decodeEntered')
            page.locator('#wallpaper-file').set_input_files(upload('latest.png', width=32, height=24))
            page.wait_for_function('!!JSON.parse(localStorage.getItem("qiye.state.v5")).settings.customWallpaper')
            wallpaper = saved()['settings']['customWallpaper']
            page.evaluate('releaseDecode()')
            page.wait_for_function('decodeReleased')
            page.wait_for_timeout(300)
            check('late upload does not replace the newest wallpaper', saved()['settings']['customWallpaper'] == wallpaper)
            close()
            page.reload()
            page.locator('[data-item=c3]').wait_for()
            check('wallpaper and cards survive reload', saved()['settings']['customWallpaper'] == wallpaper and len(saved()['items']) == 5)
            check('no uncaught browser exceptions', not errors)
            context.close()
    finally:
        browser.close()
        server.shutdown()
print(f'{len(checks)} image compression browser checks passed.')
