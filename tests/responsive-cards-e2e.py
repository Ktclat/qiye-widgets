"""Production iframe cards: five sizes, both themes, real bounds and cache states."""
import copy
import json
import subprocess
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/playwright/responsive-cards'
OUT.mkdir(parents=True, exist_ok=True)
version = json.loads((ROOT/'package.json').read_text())['version']
defaults = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {newWidgetData} from './src/widget-data.js';import {newWidgetConfig} from './src/widget-registry.js';console.log(JSON.stringify(Object.fromEntries(['converter','hotsearch'].map(k=>[k,{config:newWidgetConfig(k),data:newWidgetData(k)}]))))"], cwd=ROOT))
sizes = ['1x1','1x2','2x1','2x2','4x2']
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
checks = 0
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={'width':1280,'height':820}, locale='zh-CN', timezone_id='Asia/Hong_Kong')
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('https://**/*', lambda route: route.abort())
    page.goto(base+'/index.html')
    for cell in [38.4,74,120]:
        for theme in ['dark','light']:
            for mode in ['idle','cached','error','stale','live']:
                page.evaluate('''({base,version,cell,theme,mode,defaults,sizes})=>{
                  document.head.innerHTML=`<style>*{box-sizing:border-box}body{margin:0;padding:24px;background:${theme==='dark'?'#142831':'#e8eeea'};font:12px system-ui;color:${theme==='dark'?'#cadbdc':'#455453'}}section{display:flex;flex-wrap:wrap;gap:24px;align-items:center;margin-bottom:28px}figure{margin:0}figcaption{margin-top:10px;text-align:center}iframe{display:block;border:0;border-radius:20px;overflow:hidden}</style>`;
                  document.body.replaceChildren();window.cards={};
                  for(const kind of ['converter','hotsearch']){
                    const section=document.createElement('section');document.body.append(section);
                    for(const size of sizes){
                      const id=kind+'-'+size,[w,h]=size.split('x').map(Number),gap=cell<50?14.4:30;
                      const width=w*cell+(w-1)*gap,height=h*cell+(h-1)*gap;
                      const envelope=structuredClone(defaults[kind]);
                      if(kind==='hotsearch')Object.assign(envelope.config,{enabled:['error','live','stale'].includes(mode),subscriptions:['baidu','weibo','douyin'],activeSource:'baidu'});
                      const now=Date.now(),old=mode==='stale'?now-1200000:now;
                      const rows=['今天值得关注的科技新进展','一条足够长的榜单标题需要在小卡片里自然截断且不挤走排名与热度',...Array.from({length:18},(_,i)=>'第'+(i+3)+'条测试新闻')].map((title,i)=>({rank:i+1,title,url:'https://example.com/story/'+i,heat:34567-i}));
                      const storage=kind==='hotsearch'&&['cached','stale'].includes(mode)?{'qiye.hotsearch.v1':JSON.stringify(Object.fromEntries(['baidu','weibo','douyin'].map(platform=>['https://uapis.cn:'+platform,{items:rows.map(r=>({...r,title:platform+' · '+r.title})),fetchedAt:old,updatedAt:old}])))}:{};
                      const figure=document.createElement('figure'),frame=document.createElement('iframe'),caption=document.createElement('figcaption');
                      frame.id=id;frame.title=id;frame.sandbox='allow-scripts allow-forms allow-downloads';frame.style.width=width+'px';frame.style.height=height+'px';frame.src=base+'/releases/'+version+'/widget.html?widget='+kind;
                      const state=cards[id]={ready:false,calls:[],width,height,envelope,storage,environment:{mode:'card',theme,size,locale:'zh-CN',width,height,hostFeatures:['hotboard','interactions','long-press'],settings:{theme,gridSize:cell,gap,surfaceOpacity:72}}};
                      frame.addEventListener('load',()=>{
                        const channel=new MessageChannel();state.port=channel.port1;
                        const respond=m=>{let value=true,error;
                          if(m.method==='hotboard'){if(mode==='error'||mode==='stale')error='Offline fixture';else value={code:200,list:rows.map(r=>({...r,title:m.params.platform+' · '+r.title,index:r.rank,hot_value:r.heat})),updateTime:now};}
                          if(m.method==='save'){if(state.failSave)error='Save fixture';else{state.envelope=m.params.value;const revision=JSON.stringify(m.params.value);value={value:revision,revision};}}
                          if(m.method==='storage')state.storage=m.params.value;
                          state.port.postMessage({type:'result',id:m.id,value,error});};
                        state.port.onmessage=event=>{const m=event.data;if(m.type==='ready'){state.ready=true;return;}if(m.type!=='call')return;state.calls.push(m);
                          if(m.method==='hotboard'&&state.deferBoards){state.boards.push(m);return;}
                          if(m.method==='save'&&state.saveDelay)setTimeout(()=>respond(m),state.saveDelay);else respond(m);};
                        state.respond=respond;
                        frame.contentWindow.postMessage({type:'qiye:init',version:2,value:JSON.stringify(state.envelope),revision:JSON.stringify(state.envelope),storage:state.storage,item:{id,title:kind==='converter'?'换算器':'热搜榜',size},environment:state.environment},'*',[channel.port2]);
                      });caption.textContent=size;figure.append(frame,caption);section.append(figure);
                    }
                  }
                }''', dict(base=base,version=version,cell=cell,theme=theme,mode=mode,defaults=defaults,sizes=sizes))
                page.wait_for_function('Object.values(cards).length===10&&Object.values(cards).every(c=>c.ready)')
                if mode in ['live','stale','error']:
                    page.wait_for_function("['hotsearch-2x2','hotsearch-4x2'].every(id=>cards[id].calls.some(m=>m.method==='hotboard'))")
                for kind in ['converter','hotsearch']:
                    for size in sizes:
                        frame=page.frame_locator('#'+kind+'-'+size)
                        if kind=='hotsearch' and size in ['4x2','2x2']:
                            if mode in ['live','cached','stale']: frame.locator('.hotsearch-rows').wait_for(state='attached')
                            elif mode=='error': frame.get_by_text('榜单暂不可用').wait_for(state='attached')
                        if kind=='hotsearch' and size not in ['4x2','2x2']:
                            assert frame.locator('.hotsearch-rows,.hs-card-tabs,.hs-card-content').count()==0
                            assert frame.locator('.hs-card-launcher').inner_text().strip()==''
                            assert not page.evaluate('(id)=>cards[id].calls.some(m=>m.method==="hotboard")', 'hotsearch-'+size)
                        result=frame.locator('.widget-inner').evaluate('''root=>{
                          const box=root.getBoundingClientRect(),visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
                          const bad=[...root.querySelectorAll('button:not([role=tab]), .cv-card-brand, .cv-card-equation, .cv-card-from, .cv-card-to, .hs-card-tabs, .hs-card-launcher .icon')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.left<box.left-1||r.right>box.right+1||r.top<box.top-1||r.bottom>box.bottom+1;}).map(e=>e.className);
                          return {bad,scroll:root.scrollWidth>root.clientWidth+1||root.scrollHeight>root.clientHeight+1,text:root.textContent};
                        }''')
                        if result['bad'] or result['scroll']: page.screenshot(path=str(OUT/'overflow.png'), full_page=True)
                        assert not result['bad'] and not result['scroll'], (cell,theme,mode,kind,size,result)
                        assert 'undefined' not in result['text'], result
                        assert frame.locator('select,[data-action="widget-config"],.widget-drag-handle').count()==0
                        checks+=1
                if cell==74 and mode in ['live','cached','stale']:
                    frame=page.frame_locator('#hotsearch-4x2')
                    content=frame.locator('.hs-card-content:not([hidden])')
                    assert frame.locator('.hotsearch-rows li').count()==20
                    metrics=content.evaluate("""e=>{const b=e.getBoundingClientRect();return {visible:[...e.querySelectorAll('li')].filter(n=>{const r=n.getBoundingClientRect();return r.top>=b.top-1&&r.bottom<=b.bottom+1}).length,x:e.scrollWidth>e.clientWidth+1,y:e.scrollHeight>e.clientHeight};}""")
                    assert 4<=metrics['visible']<=5 and metrics['y'] and not metrics['x'],metrics
                    content.focus();content.press('End')
                    actual=page.locator('#hotsearch-4x2').element_handle().content_frame()
                    actual.wait_for_function("(()=>{const e=document.querySelector('.hs-card-content:not([hidden])');return Math.abs(e.scrollTop-(e.scrollHeight-e.clientHeight))<1})()")
                    assert content.evaluate('e=>e.tabIndex')==0
                    content.evaluate("e=>{e.blur();e.scrollTo({top:0,behavior:'instant'});}")
                    actual.wait_for_function("document.querySelector('.hs-card-content:not([hidden])').scrollTop===0")
                    if mode=='stale':
                        assert content.get_attribute('data-cached')=='true'
                        assert '缓存' in content.get_attribute('title')
                    assert not frame.locator('.hotsearch-heat').first.is_visible()
                    square=page.frame_locator('#hotsearch-2x2')
                    assert not square.locator('.hotsearch-heat').first.is_visible()
                    assert square.locator('.hotsearch-title').nth(1).evaluate('e=>e.scrollWidth>e.clientWidth')
                if cell==74 and mode in ['idle','cached','error','stale']:
                    page.screenshot(path=str(OUT/f'{theme}-{mode}.png'), full_page=True)
                if cell==74 and mode=='idle':
                    # Tab/Enter opens the card without introducing visible handles.
                    for kind in ['converter','hotsearch']:
                        frame=page.frame_locator('#'+kind+'-1x1')
                        control=frame.locator('[data-action="widget-open"]').first
                        control.focus();control.press('Enter')
                        page.wait_for_function('(id)=>cards[id].calls.some(m=>m.method==="open")',arg=kind+'-1x1')
                    assert not page.evaluate("Object.values(cards).some(c=>c.calls.some(m=>m.method==='hotboard'))"), 'Disabled hotsearch started network activity'
    # Saved unit pair survives frame reinitialization and produces a true equivalence.
    frame=page.frame_locator('#converter-2x2')
    page.evaluate('''()=>{const c=cards['converter-2x2'];c.envelope.data.category='temperature';c.envelope.data.pairs.temperature=['c','f'];const value=JSON.stringify(c.envelope);c.port.postMessage({type:'state',value,revision:value,environment:c.environment});}''')
    frame.locator('.cv-card-equation[title="1 °C = 33.8 °F"]').wait_for()
    for cell in [38.4,74]:
        for category,pair in [('pressure',['pa','mmhg']),('energy',['kwh','ev']),('temperature',['k','c'])]:
            page.evaluate("""({cell,category,pair})=>{for(const size of ['1x1','1x2','2x1','2x2','4x2']){const id='converter-'+size,c=cards[id],f=document.getElementById(id),[w,h]=size.split('x').map(Number),gap=cell<50?14.4:30;c.environment.width=w*cell+(w-1)*gap;c.environment.height=h*cell+(h-1)*gap;f.style.width=c.environment.width+'px';f.style.height=c.environment.height+'px';c.envelope.data.category=category;c.envelope.data.pairs[category]=pair;const value=JSON.stringify(c.envelope);c.port.postMessage({type:'state',value,revision:value,environment:c.environment});}}""",dict(cell=cell,category=category,pair=pair))
            page.frame_locator('#converter-2x2').locator('.cv-card-bottom').filter(has_text={'pressure':'压力','energy':'能量','temperature':'温度'}[category]).wait_for(state='attached')
            for size in sizes:
                frame=page.frame_locator('#converter-'+size)
                bad=frame.locator('.cv-card-to b').evaluate("""b=>{if(!b.getClientRects().length)return false;const card=b.closest('.widget-inner').getBoundingClientRect(),r=document.createRange();r.selectNodeContents(b);const text=r.getBoundingClientRect();return text.left<card.left-1||text.right>card.right+1||text.top<card.top-1||text.bottom>card.bottom+1;}""")
                if bad: page.screenshot(path=str(OUT/'long-number-overflow.png'),full_page=True)
                assert not bad,(cell,category,size,'number text escaped card')
                checks+=1
    # Real tabs, cached selection, keyboard navigation and reload persistence.
    hot='hotsearch-2x2'
    page.evaluate('''id=>{const c=cards[id];c.environment.width=178;c.environment.height=178;c.envelope.config.enabled=false;c.envelope.config.activeSource='baidu';c.ready=false;c.calls=[];const f=document.getElementById(id);f.style.width='178px';f.style.height='178px';f.src=f.src;}''',hot)
    page.wait_for_function('(id)=>cards[id].ready',arg=hot)
    frame=page.frame_locator('#'+hot)
    tab=lambda source: frame.locator('[data-hot-card-source="'+source+'"]')
    tab('weibo').click()
    page.wait_for_function('(id)=>cards[id].envelope.config.activeSource==="weibo"',arg=hot)
    frame.locator('.hotsearch-title').first.filter(has_text='weibo').wait_for()
    assert not page.evaluate('(id)=>cards[id].calls.some(m=>m.method==="open")',hot)
    tab('weibo').focus();tab('weibo').press('ArrowRight')
    assert tab('douyin').evaluate('e=>e===document.activeElement')
    assert tab('weibo').get_attribute('aria-selected')=='true', 'Arrow navigation must not fetch or activate a slow tab'
    tab('douyin').press('Enter')
    page.wait_for_function('(id)=>cards[id].envelope.config.activeSource==="douyin"',arg=hot)
    frame.locator('.hotsearch-title').first.filter(has_text='douyin').wait_for()
    assert tab('douyin').evaluate('e=>e===document.activeElement'), 'Refresh lost keyboard focus'
    tab('douyin').press('Home')
    assert tab('baidu').evaluate('e=>e===document.activeElement')
    tab('baidu').press('ArrowLeft')
    assert tab('douyin').evaluate('e=>e===document.activeElement')
    page.wait_for_function("(id)=>JSON.parse(cards[id].storage['qiye.hotsearch.v1']||'{}')['https://uapis.cn:douyin']?.items[0].title.startsWith('douyin')",arg=hot)
    page.evaluate('(id)=>{const c=cards[id];c.ready=false;c.calls=[];const f=document.getElementById(id);f.src=f.src;}',hot)
    page.wait_for_function('(id)=>cards[id].ready',arg=hot)
    frame.locator('.hotsearch-title').first.filter(has_text='douyin').wait_for()
    assert tab('douyin').get_attribute('aria-selected')=='true'
    assert not page.evaluate('(id)=>cards[id].calls.some(m=>m.method==="hotboard")',hot), 'Cached reload fetched again while automatic refresh was disabled'
    # A rejected save restores the previous selection and reports the failure.
    page.evaluate('(id)=>{cards[id].failSave=true;}',hot)
    tab('baidu').click()
    page.wait_for_function('(id)=>cards[id].calls.some(m=>m.method==="toast"&&m.params.message==="Save fixture")',arg=hot)
    assert tab('douyin').get_attribute('aria-selected')=='true'
    assert page.evaluate('(id)=>cards[id].envelope.config.activeSource',hot)=='douyin'
    # Late responses from an abandoned platform must not replace the active list.
    page.evaluate('''id=>{const c=cards[id];c.failSave=false;c.storage={};c.envelope.config.activeSource='baidu';c.ready=false;c.calls=[];c.boards=[];c.deferBoards=true;const f=document.getElementById(id);f.src=f.src;}''',hot)
    page.wait_for_function('(id)=>cards[id].ready',arg=hot)
    tab('weibo').click()
    page.wait_for_function('(id)=>cards[id].boards.some(m=>m.params.platform==="weibo")',arg=hot)
    tab('douyin').click()
    page.wait_for_function('(id)=>cards[id].boards.some(m=>m.params.platform==="douyin")',arg=hot)
    page.evaluate('(id)=>{const c=cards[id];c.respond(c.boards.find(m=>m.params.platform==="douyin"));}',hot)
    frame.locator('.hotsearch-title').first.filter(has_text='douyin').wait_for()
    page.evaluate('(id)=>{const c=cards[id];c.respond(c.boards.find(m=>m.params.platform==="weibo"));}',hot)
    assert tab('douyin').get_attribute('aria-selected')=='true'
    assert 'douyin' in frame.locator('.hotsearch-title').first.inner_text()
    # Rapid selection during a slow save retains the final requested platform.
    page.evaluate('(id)=>{cards[id].deferBoards=false;cards[id].saveDelay=200;}',hot)
    tab('baidu').click();tab('weibo').click()
    page.wait_for_function('(id)=>cards[id].envelope.config.activeSource==="weibo"',arg=hot)
    frame.locator('.hotsearch-title').first.filter(has_text='weibo').wait_for()
    frame.locator('.hs-card-content:not([hidden])').focus()
    frame.locator('.hs-card-content:not([hidden])').press('Enter')
    page.wait_for_function('(id)=>cards[id].calls.some(m=>m.method==="open")',arg=hot)
    # More subscriptions scroll horizontally; unfocused traversal never changes the platform.
    page.evaluate("""id=>{const c=cards[id];c.saveDelay=0;c.envelope.config.subscriptions=['baidu','weibo','douyin','52pojie','github-ai','ithome-xijiayi'];c.envelope.config.activeSource='zhihu';const value=JSON.stringify(c.envelope);c.port.postMessage({type:'state',value,revision:value,environment:c.environment});}""",hot)
    tab('ithome-xijiayi').wait_for(state='attached')
    assert tab('baidu').get_attribute('aria-selected')=='true', 'Unsubscribed window source should fall back to first card tab'
    tab('baidu').focus();tab('baidu').press('End')
    assert tab('ithome-xijiayi').evaluate('e=>e===document.activeElement')
    assert tab('ithome-xijiayi').evaluate('e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return r.left>=p.left-1&&r.right<=p.right+1;}'), 'Focused tab is clipped'
    tab('ithome-xijiayi').press('Tab')
    assert tab('baidu').get_attribute('tabindex')=='0', 'Re-entering tabs must focus the selected platform'
    assert tab('ithome-xijiayi').get_attribute('tabindex')=='-1'
    assert not errors, errors
    browser.close()
server.shutdown()
print(f'PASS {checks} widget bounds, icon launchers, tabs/keyboard, persistence, save rollback, late responses, offline caches and saved pair')
