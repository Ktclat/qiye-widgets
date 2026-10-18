#!/usr/bin/env python3
"""Real Chrome bookmark CRUD in a disposable extension and browser profile.

The temporary manifest grants bookmarks at install time. The actual optional
permission prompt remains a manual check; denial/revocation use the UI fixture.
"""
import json
import os
from pathlib import Path
import shutil
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/playwright/bookmarks'
OUT.mkdir(parents=True, exist_ok=True)
checks = []
def check(name, condition=True):
    assert condition, name
    checks.append(name)
    print('PASS', name, flush=True)

with tempfile.TemporaryDirectory(prefix='qiye-bookmarks-') as temporary, sync_playwright() as p:
    base = Path(temporary)
    extension = base / 'extension'; extension.mkdir()
    for name in ['src','icons','fonts','_locales']: shutil.copytree(ROOT/name,extension/name)
    for name in ['index.html','styles.css','background.js','popup.html','popup.css','popup.js']: shutil.copy2(ROOT/name,extension/name)
    manifest = json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
    manifest['permissions'].append('bookmarks'); manifest['optional_permissions'].remove('bookmarks')
    (extension/'manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
    launch = {'executable_path':os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {'channel':'chromium'}
    context = p.chromium.launch_persistent_context(str(base/'profile'),**launch,headless=True,viewport={'width':1440,'height':950},args=[f'--disable-extensions-except={extension}',f'--load-extension={extension}'])
    try:
        worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=20000)
        page = context.new_page(); page.set_default_timeout(10000)
        errors = []; page.on('pageerror',lambda error:errors.append(str(error)))
        page.route('https://**/*',lambda route:route.abort())
        page.goto(f'chrome-extension://{worker.url.split("/")[2]}/index.html')
        page.locator('#desktop [data-item]').first.wait_for()
        await_setup = page.evaluate('''async () => {
          const {DEFAULT_STATE,STORAGE_KEY} = await import('./src/core.js');
          const state = structuredClone(DEFAULT_STATE);
          state.settings.language='zh-CN'; state.settings.autoExtractIcons=false;
          state.items=[{id:'native-bookmarks',type:'widget',widget:'bookmarks',title:'书签',groupId:state.activeGroupId,size:'4x2',config:{source:'browser'},data:{nodes:[]}}];
          const tree=await chrome.bookmarks.getTree();
          const parent=tree[0].children.find(node=>!node.unmodifiable).id;
          const folder=await chrome.bookmarks.create({parentId:parent,title:'Native test folder'});
          const child=await chrome.bookmarks.create({parentId:folder.id,title:'Nested folder'});
          await chrome.bookmarks.create({parentId:child.id,title:'Native documentation',url:'https://example.com/native'});
          await chrome.storage.local.set({[STORAGE_KEY]:state});
          return {folder:folder.id,child:child.id,parent};
        }''')
        page.reload(); page.locator('[data-widget=bookmarks] [data-action=widget-open]').first.click()
        expect(page.locator('[data-bm-source=browser]')).to_have_attribute('aria-pressed','true')
        check('real MV3 extension reads authorized native bookmarks')
        page.locator('[data-bm-query]').fill('Native documentation')
        expect(page.locator('.bm-location')).to_contain_text('Native test folder / Nested folder')
        page.locator('[data-bm-action=locate]').click()
        page.locator('.bm-commands summary').click(); page.locator('[data-bm-action=new-bookmark]').click()
        page.locator('[name=title]').fill('Created through widget'); page.locator('[name=url]').fill('https://example.com/created')
        page.locator('#bm-editor-form button[type=submit]').click(); expect(page.locator('.bm-editor-overlay')).to_be_hidden()
        created=page.evaluate("async ()=>(await chrome.bookmarks.search({title:'Created through widget'}))[0]")
        check('create writes into the actual nested browser folder',created['parentId']==await_setup['child'])
        def drag_row(source_id,target_id,after=False):
            page.wait_for_timeout(300)
            a=page.locator('[data-bm-row="'+source_id+'"]').bounding_box(); b=page.locator('[data-bm-row="'+target_id+'"]').bounding_box()
            x=a['x']+80; y=a['y']+a['height']/2; tx=b['x']+80; ty=b['y']+(b['height']-4 if after else 4)
            page.mouse.move(x,y); page.mouse.down(); page.mouse.move(x+8,y+5,steps=5); page.mouse.move(tx,ty,steps=15); page.mouse.move(tx,ty); page.mouse.up(); page.wait_for_timeout(250)
        doc=page.evaluate("async ()=>(await chrome.bookmarks.search({title:'Native documentation'}))[0]")
        drag_row(created['id'],doc['id'])
        check('real native upward drag uses the correct sibling index',page.evaluate('async id=>(await chrome.bookmarks.getChildren(id)).map(n=>n.id)',await_setup['child'])==[created['id'],doc['id']])
        tail=page.evaluate("async parent=>await chrome.bookmarks.create({parentId:parent,title:'Reorder tail',url:'https://example.com/tail'})",await_setup['child'])
        expect(page.locator('.bm-list')).to_contain_text('Reorder tail')
        drag_row(created['id'],tail['id'])
        check('real native downward drag handles removal index adjustment',page.evaluate('async id=>(await chrome.bookmarks.getChildren(id)).map(n=>n.id)',await_setup['child'])==[doc['id'],created['id'],tail['id']])
        page.evaluate('async id=>await chrome.bookmarks.remove(id)',tail['id']); expect(page.locator('[data-bm-row="'+tail['id']+'"]')).to_have_count(0)
        row='[data-bm-row="'+created['id']+'"]'
        def action(row, name):
            page.locator(row+' [data-bm-action=select-item]').click()
            page.locator('.bm-commands [data-bm-action='+name+']').click()
        action(row,'edit'); page.locator('[name=title]').fill('Native edited'); page.locator('#bm-editor-form button[type=submit]').click(); expect(page.locator('.bm-editor-overlay')).to_be_hidden()
        check('edit updates the actual browser node',page.evaluate('async id=>(await chrome.bookmarks.get(id))[0].title',created['id'])=='Native edited')
        action(row,'move'); page.locator('[name=parentId]').select_option(await_setup['parent']); page.locator('#bm-editor-form button[type=submit]').click(); expect(page.locator('.bm-editor-overlay')).to_be_hidden()
        check('move updates the actual browser parent',page.evaluate('async id=>(await chrome.bookmarks.get(id))[0].parentId',created['id'])==await_setup['parent'])
        page.evaluate("async parent=>{await chrome.bookmarks.create({parentId:parent,title:'External native change',url:'https://example.com/external'})}",await_setup['parent'])
        expect(page.locator('.bm-list')).to_contain_text('External native change'); check('real native events refresh the manager')
        action(row,'delete'); page.locator('#bm-editor-form button[type=submit]').click(); expect(page.locator('.bm-editor-overlay')).to_be_hidden()
        check('delete removes the actual browser node',page.evaluate("async ()=>(await chrome.bookmarks.search({title:'Native edited'})).length") == 0)
        page.locator('[data-bm-query]').fill('Native test folder'); action('.bm-list li','delete')
        expect(page.locator('.bm-editor')).to_contain_text('1 个书签和 1 个文件夹')
        page.locator('#bm-editor-form button[type=submit]').click(); expect(page.locator('.bm-editor-overlay')).to_be_hidden()
        check('recursive removal deletes the real nested subtree',page.evaluate("async ()=>(await chrome.bookmarks.search({title:'Native documentation'})).length")==0)
        check('browser bookmarks stay out of widget storage',page.evaluate("async ()=>Object.values(await chrome.storage.local.get(null)).filter(v=>v?.items).every(s=>s.items.filter(i=>i.widget==='bookmarks').every(i=>i.data.nodes.length===0))"))
        check('no uncaught native integration errors',not errors)
        (OUT/'native-report.json').write_text(json.dumps({'checks':checks,'errors':errors},indent=2),encoding='utf-8')
    finally:
        context.close()
print(f'{len(checks)} native bookmark checks passed.')
