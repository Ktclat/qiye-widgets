#!/usr/bin/env python3
"""Weather charts, cities, settings and failure states on source and generated web UI."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timedelta
from pathlib import Path
import argparse, copy, json, os, subprocess, threading
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
OUT=ROOT/'output/playwright/weather';OUT.mkdir(parents=True,exist_ok=True)
state0=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {DEFAULT_STATE} from './src/core.js';console.log(JSON.stringify(DEFAULT_STATE))"],cwd=ROOT))
start=datetime(2026,10,14,20)
forecast={'timezone':'Asia/Hong_Kong','current':{'temperature_2m':27,'weather_code':2,'time':'2026-10-14T20:45','is_day':0,'apparent_temperature':29,'relative_humidity_2m':74,'wind_speed_10m':9,'surface_pressure':999,'precipitation':0},
    'hourly':{'time':[(start+timedelta(hours=i)).isoformat(timespec='minutes') for i in range(24)],'temperature_2m':[27,26,25,25,25,25,25,25,25,25,25,26,26,26,27,27,27,28,28,28,27,27,26,26],'weather_code':[2]*24,'is_day':[0]*10+[1]*12+[0]*2,'precipitation_probability':[i*4 for i in range(24)],'wind_speed_10m':[9+i%6 for i in range(24)]},
    'daily':{'time':[(start+timedelta(days=i)).date().isoformat() for i in range(7)],'temperature_2m_min':[25]*7,'temperature_2m_max':[30,30,31,30,33,34,33],'weather_code':[2,0,61,80,2,2,2],'wind_speed_10m_max':[18,20,13,12,9,8,6],'precipitation_probability_max':[20,10,80,60,20,10,10],'sunrise':['2026-10-14T06:19']*7,'sunset':['2026-10-14T17:59']*7,'uv_index_max':[5]*7}}
checks=[]
def check(name,condition):
    assert condition,name
    checks.append(name);print('PASS',name,flush=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    executable=os.environ.get('CHROMIUM_PATH')
    browser=p.chromium.launch(**({'executable_path':executable} if executable else {}))
    try:
        for language,theme in [('zh-CN','dark'),('en','light')]:
            state=copy.deepcopy(state0);state['settings'].update(language=language,theme=theme,autoExtractIcons=False)
            item=next(i for i in state['items'] if i.get('widget')=='weather');item['config']['enabled']=True;item['config']['source']='openmeteo'
            context=browser.new_context(viewport={'width':1440,'height':950},locale=language)
            page=context.new_page();page.set_default_timeout(10000);errors=[];offline=[False]
            page.on('pageerror',lambda error:errors.append(str(error)))
            def route(r):
                url=r.request.url
                if 'geocoding-api.open-meteo.com' in url:r.fulfill(json={'results':[{'name':'Paris','latitude':48.85,'longitude':2.35,'country':'France'}]})
                elif 'air-quality-api.open-meteo.com' in url:r.fulfill(json={'current':{'us_aqi':48,'pm2_5':9,'pm10':16}})
                elif 'api.open-meteo.com' in url:
                    if offline[0]:r.abort()
                    else:r.fulfill(json=forecast)
                else:r.abort()
            page.route('https://**/*',route)
            page.add_init_script('if(window===top&&!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'+json.dumps(json.dumps(state))+')')
            url=f'http://127.0.0.1:{server.server_port}/'+('Qiye-preview.html' if args.preview else '')
            page.goto(url)
            def settle_motion():
                page.locator('#dialog').evaluate('async node=>{await Promise.allSettled(node.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished))}')
            def open_weather():
                page.locator('[data-action=widget-weather-detail]').click();page.locator('.daily-weather>div').first.wait_for();settle_motion()
            def saved():return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.widget==="weather")')
            def close():page.locator('#dialog [data-close]').click();page.locator('#dialog').wait_for(state='hidden')
            def show_cities():
                if not page.locator('#weather-city-panel').is_visible():page.locator('[data-detail-action=weather-cities]').click()
                settle_motion()
            def adjacent(panel):
                return page.locator('.weather-content').evaluate('(node,id)=>{const main=node.querySelector(".weather-main").getBoundingClientRect(),side=node.querySelector(id).getBoundingClientRect();return main.right<=side.left+1&&Math.abs(main.top-side.top)<1}',panel)
            open_weather()
            check(f'{language} default canvas has no search bar or open panel',not page.locator('#weather-city-panel').is_visible() and not page.locator('#weather-settings-panel').is_visible() and page.locator('.weather-main input').count()==0)
            check(f'{language} five controls share the title bar',page.locator('.weather-window-bar button').evaluate_all('buttons=>buttons.length===5&&Math.max(...buttons.map(b=>b.getBoundingClientRect().y))-Math.min(...buttons.map(b=>b.getBoundingClientRect().y))<1'))
            check(f'{language} refresh sits beside observation time',page.locator('.weather-toolbar').evaluate('node=>{const location=node.querySelector("#weather-location").getBoundingClientRect(),refresh=node.querySelector("#weather-refresh").getBoundingClientRect();return refresh.left>=location.right&&refresh.left-location.right<12&&Math.abs((refresh.top+refresh.bottom-location.top-location.bottom)/2)<2}') and page.locator('.weather-hero .weather-refresh').count()==0)
            check(f'{language} Celsius unit matches the temperature size',page.locator('.weather-temperature').evaluate('node=>getComputedStyle(node).fontSize===getComputedStyle(node.querySelector(".weather-temperature-unit")).fontSize') and page.locator('.weather-temperature').inner_text()=='27°C')
            main_width=page.locator('.weather-main').evaluate('node=>node.clientWidth')
            page.locator('#dialog').screenshot(path=str(OUT/f'{language}-default.png'),animations='disabled')
            motion=page.evaluate('''async()=>{
              document.querySelector('[data-detail-action=weather-add-city]').click();
              const samples=[],dialog=document.querySelector('#dialog'),main=document.querySelector('.weather-main'),slot=document.querySelector('.weather-side-slot'),side=document.querySelector('#weather-city-panel');
              const start=performance.now();
              while(performance.now()-start<520){
                await new Promise(requestAnimationFrame);
                samples.push({width:dialog.clientWidth,main:main.clientWidth,slot:slot.clientWidth,scale:new DOMMatrix(getComputedStyle(side).transform).a,adjacent:main.getBoundingClientRect().right<=slot.getBoundingClientRect().left+1});
              }
              return samples;
            }''')
            check(f'{language} sidebar reveals progressively with a small rebound',len(set(s['slot'] for s in motion))>4 and max(s['scale'] for s in motion)>1.002 and abs(motion[-1]['scale']-1)<.001)
            check(f'{language} window and rail animate without covering or squeezing the main canvas',len(set(s['width'] for s in motion))>4 and all(s['adjacent'] and abs(s['main']-main_width)<2 for s in motion))
            check(f'{language} add city opens and focuses sidebar search',adjacent('#weather-city-panel') and page.locator('#weather-list-query').evaluate('node=>document.activeElement===node'))
            check(f'{language} sidebar expansion preserves available main width',abs(page.locator('.weather-main').evaluate('node=>node.clientWidth')-main_width)<2)
            page.locator('#dialog').screenshot(path=str(OUT/f'{language}-rail.png'),animations='disabled')
            page.locator('[data-detail-action=weather-settings]').click()
            settle_motion()
            check(f'{language} settings replace cities in the same nonmodal rail',adjacent('#weather-settings-panel') and not page.locator('#weather-city-panel').is_visible() and page.locator('.weather-panel-shade').count()==0)
            check(f'{language} opening settings keeps focus off form controls',page.locator('#weather-settings-title').evaluate('node=>document.activeElement===node'))
            page.locator('#dialog').screenshot(path=str(OUT/f'{language}-settings.png'),animations='disabled')
            page.keyboard.press('Escape')
            check(f'{language} closing panel remains painted but cannot receive input',page.locator('#weather-settings-panel').evaluate('node=>!node.hidden&&node.inert&&node.getAttribute("aria-hidden")==="true"'))
            expect(page.locator('#weather-settings-panel')).to_be_hidden()
            check(f'{language} closing sidebar returns focus to its title action',not page.locator('#weather-settings-panel').is_visible() and page.locator('[data-detail-action=weather-settings]').evaluate('node=>document.activeElement===node'))
            page.evaluate('''async()=>{
              const cities=document.querySelector('[data-detail-action=weather-cities]'),settings=document.querySelector('[data-detail-action=weather-settings]');
              cities.click();await new Promise(resolve=>setTimeout(resolve,90));
              cities.click();await new Promise(resolve=>setTimeout(resolve,55));
              settings.click();await new Promise(resolve=>setTimeout(resolve,70));
              cities.click();
            }''')
            settle_motion()
            check(f'{language} rapid reversal and panel switching settle correctly',adjacent('#weather-city-panel') and page.locator('#weather-settings-panel').is_hidden() and page.locator('#weather-city-panel').evaluate('node=>!node.inert&&node.getAttribute("aria-hidden")==="false"') and page.locator('#dialog').evaluate('node=>node.getAnimations({subtree:true}).length===0'))
            page.keyboard.press('Escape');expect(page.locator('#weather-city-panel')).to_be_hidden()
            for preference in ['system','app']:
                if preference=='system':page.emulate_media(reduced_motion='reduce')
                else:page.evaluate('document.body.classList.add("reduce-effects")')
                page.locator('[data-detail-action=weather-cities]').click()
                check(f'{language} {preference} reduced motion opens immediately',adjacent('#weather-city-panel') and page.locator('#dialog').evaluate('node=>node.getAnimations({subtree:true}).length===0'))
                page.keyboard.press('Escape');expect(page.locator('#weather-city-panel')).to_be_hidden()
                if preference=='system':page.emulate_media(reduced_motion='no-preference')
                else:page.evaluate('document.body.classList.remove("reduce-effects")')
            check(f'{language} dedicated weather canvas',page.locator('.weather-app').count()==1 and page.locator('.utility-layout').count()==0)
            check(f'{language} 24 hours and seven dates',page.locator('.hourly-weather>div').count()==24 and page.locator('.daily-weather>div').count()==7)
            check(f'{language} real pressure and precipitation', '999 hPa' in page.locator('.weather-metrics').inner_text() and '0 mm' in page.locator('.weather-metrics').inner_text())
            check(f'{language} shared daily curves and current date',page.locator('.weather-week-track .weather-chart path').count()==2 and page.locator('.daily-weather [aria-current=date]').count()==1)
            page.locator('[data-detail-action=window-expand]').click()
            expanded_width=page.locator('#dialog').evaluate('node=>node.clientWidth')
            page.screenshot(path=str(OUT/f'{language}-overview.png'),animations='disabled')
            page.locator('.weather-week-panel').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{language}-week.png'),animations='disabled')
            page.locator('[data-weather-metric=rain]').click();check(f'{language} rain view uses percentages','%' in page.locator('.weather-hour-track .weather-chart-point').last.inner_text())
            page.locator('.weather-horizontal-scroll').first.evaluate('node=>node.scrollLeft=350');scroll_before=page.locator('.weather-horizontal-scroll').first.evaluate('node=>node.scrollLeft')
            page.locator('[data-weather-metric=wind]').click();check(f'{language} wind view keeps horizontal position','km/h' in page.locator('.weather-chart-caption').inner_text() and scroll_before>0 and abs(page.locator('.weather-horizontal-scroll').first.evaluate('node=>node.scrollLeft')-scroll_before)<1)
            page.locator('[data-weather-metric=temperature]').click()
            page.locator('.weather-scroll').evaluate('node=>node.scrollTop=120')
            viewport_before=page.locator('.weather-scroll').evaluate('node=>[node.scrollTop,node.querySelector(".weather-horizontal-scroll").scrollLeft]')
            page.evaluate('window.weatherForecastBefore=document.querySelector("#weather-forecast").firstElementChild')
            show_cities();check(f'{language} city drawer has current conditions',page.locator('.weather-city-card.active b').inner_text()=='27°')
            page.locator('[data-detail-action=weather-settings]').click()
            check(f'{language} switching sidebars preserves forecast and scroll position',page.evaluate('window.weatherForecastBefore===document.querySelector("#weather-forecast").firstElementChild') and page.locator('.weather-scroll').evaluate('node=>[node.scrollTop,node.querySelector(".weather-horizontal-scroll").scrollLeft]')==viewport_before)
            check(f'{language} sidebars preserve the maximized window width',page.locator('#dialog').evaluate('node=>node.clientWidth')==expanded_width)
            page.locator('[data-detail-action=weather-add-city]').click();page.locator('#weather-list-query').fill('Paris');page.locator('#weather-list-query').press('Enter');page.locator('[data-weather-result="0"]').click()
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.widget==="weather").config.city.name==="Paris"')
            expect(page.locator('#weather-location strong')).to_have_text('Paris')
            check(f'{language} searching changes active city',saved()['config']['city']['latitude']==48.85)
            show_cities();check(f'{language} both cities retained',page.locator('.weather-city-card').count()==2)
            page.screenshot(path=str(OUT/f'{language}-cities.png'),animations='disabled')
            page.keyboard.press('Escape');expect(page.locator('#weather-city-panel')).to_be_hidden();check(f'{language} Escape closes city panel only',page.locator('#dialog').is_visible())
            page.locator('[data-detail-action=weather-settings]').first.click();check(f'{language} six source modes available',page.locator('#weather-settings [name=source] option').count()==6);page.locator('#weather-settings [name=unit]').select_option('fahrenheit');page.locator('#weather-settings [type=submit]').click()
            expect(page.locator('.weather-temperature')).to_contain_text('81°')
            check(f'{language} Fahrenheit unit matches the temperature size',page.locator('.weather-temperature').evaluate('node=>getComputedStyle(node).fontSize===getComputedStyle(node.querySelector(".weather-temperature-unit")).fontSize') and page.locator('.weather-temperature').inner_text()=='81°F')
            check(f'{language} chart switches to Fahrenheit',page.locator('.weather-hour-track .weather-chart-point').first.inner_text()=='81°' and saved()['config']['unit']=='fahrenheit')
            offline[0]=True;page.locator('[data-detail-action=weather-refresh]').click();expect(page.locator('[data-detail-action=weather-refresh]')).to_be_enabled();page.locator('.weather-cache-message').wait_for()
            check(f'{language} offline keeps forecast',page.locator('.daily-weather>div').count()==7)
            offline[0]=False;close();page.reload();open_weather();show_cities()
            check(f'{language} city list survives reload',page.locator('.weather-city-card').count()==2)
            page.locator('[data-weather-city="22.3200,114.1700"]').click();expect(page.locator('#weather-location strong')).to_have_text(item['config']['city']['name'])
            check(f'{language} switching saved city updates widget',saved()['config']['city']['latitude']==22.32)
            show_cities();page.locator('[data-weather-remove="48.8500,2.3500"]').click();check(f'{language} remove only noncurrent city',page.locator('.weather-city-card').count()==1)
            page.keyboard.press('Escape');page.set_viewport_size({'width':390,'height':844});page.locator('.weather-scroll').evaluate('node=>node.scrollTop=0')
            check(f'{language} narrow viewport contains layout',page.locator('.weather-app').evaluate('node=>node.scrollWidth<=node.clientWidth+1'))
            page.screenshot(path=str(OUT/f'{language}-mobile.png'),animations='disabled')
            page.locator('[data-detail-action=weather-settings]').first.click()
            settle_motion()
            check(f'{language} narrow settings stack without covering the forecast',page.locator('.weather-content').evaluate('node=>node.querySelector(".weather-main").getBoundingClientRect().bottom<=node.querySelector("#weather-settings-panel").getBoundingClientRect().top+1') and page.locator('.weather-app').evaluate('node=>node.scrollWidth<=node.clientWidth+1'))
            page.locator('#dialog').screenshot(path=str(OUT/f'{language}-mobile-settings.png'),animations='disabled')
            page.locator('[data-detail-action=weather-add-city]').click()
            settle_motion()
            check(f'{language} narrow cities stack without covering the forecast',page.locator('.weather-content').evaluate('node=>node.querySelector(".weather-main").getBoundingClientRect().bottom<=node.querySelector("#weather-city-panel").getBoundingClientRect().top+1'))
            page.locator('[data-detail-action=weather-settings]').click();page.locator('[name=enabled]').uncheck();page.locator('#weather-settings [type=submit]').click();page.locator('[data-detail-action=weather-enable]').wait_for()
            check(f'{language} disabled weather displays enable state',not saved()['config']['enabled'])
            close();check(f'{language} no uncaught errors',not errors);context.close()
        # Provider selection exercises the real workspace, persistence and request adapters.
        state=copy.deepcopy(state0);state['settings'].update(language='zh-CN',theme='dark',autoExtractIcons=False)
        item=next(i for i in state['items'] if i.get('widget')=='weather');item['config'].update(enabled=True,source='auto')
        context=browser.new_context(viewport={'width':1440,'height':950});page=context.new_page();page.set_default_timeout(10000)
        provider_errors=[];failed=[False];seen=[];page.on('pageerror',lambda error:provider_errors.append(str(error)))
        def provider_route(r):
            u=r.request.url;seen.append(u)
            if 'air-quality-api' in u:r.fulfill(json={'current':{'us_aqi':48,'pm2_5':9,'pm10':16}})
            elif 'api.open-meteo.com' in u:r.fulfill(json=forecast)
            elif 'data.weather.gov.hk' in u:
                if failed[0]:r.abort()
                elif 'dataType=rhrread' in u:r.fulfill(json={'temperature':{'recordTime':'2026-10-14T20:00:00+08:00','data':[{'place':"King's Park",'value':26},{'place':'Hong Kong Observatory','value':27}]},'humidity':{'data':[{'value':75}]},'icon':[77]})
                else:r.fulfill(json={'weatherForecast':[{'forecastDate':d.replace('-',''),'forecastMaxtemp':{'value':30},'forecastMintemp':{'value':25},'ForecastIcon':51,'PSR':'Low'} for d in forecast['daily']['time'][1:]]})
            elif '.qweatherapi.com' in u:
                assert r.request.headers.get('x-qw-api-key')=='test-only-qweather-key'
                if '/current/' in u:r.fulfill(json={'temperature':{'value':29},'feelsLike':{'value':31},'humidity':.8,'condition':{'code':'150','text':'晴'},'wind':{'speed':{'value':2,'unit':'m/s'}}})
                elif '/daily/' in u:r.fulfill(json={'days':[{'forecastStartTime':d+'T07:00+08:00','temperatureMax':{'value':32},'temperatureMin':{'value':25},'daytime':{'condition':{'code':'101'},'precipitation':{'probability':.2}}} for d in forecast['daily']['time']]})
                else:r.fulfill(json={'hours':[{'forecastTime':d+'+08:00','temperature':{'value':29},'condition':{'code':'150'},'precipitation':{'probability':.25}} for d in forecast['hourly']['time']]})
            elif 'opendata.cwa.gov.tw' in u:r.fulfill(json={'records':{'Station':[{'StationName':'臺北','GeoInfo':{'Coordinates':[{'CoordinateName':'WGS84','StationLatitude':25.033,'StationLongitude':121.5654}]},'ObsTime':{'DateTime':'2026-10-14T20:00:00+08:00'},'WeatherElement':{'AirTemperature':28,'RelativeHumidity':75,'WindSpeed':2,'Weather':'多雲'}}]}})
            elif 'xml.smg.gov.mo' in u:
                xml='<SevenDaysForecast></SevenDaysForecast>' if '7days' in u else '<ActualWeatherBrief><ValidFor>2026-10-14 20:00</ValidFor><Temperature><Type>3</Type><Value>30</Value></Temperature><WeatherStatus>a2</WeatherStatus></ActualWeatherBrief>'
                r.fulfill(body=xml,content_type='text/xml')
            else:r.abort()
        page.route('https://**/*',provider_route)
        page.add_init_script('if(window===top&&!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'+json.dumps(json.dumps(state))+')')
        page.goto(url);page.locator('[data-action=widget-weather-detail]').click()
        expect(page.locator('.weather-source-line')).to_contain_text('香港天文台');expect(page.locator('.weather-temperature')).to_contain_text('26°')
        check('automatic Hong Kong observations differ from the model',page.locator('.weather-metrics').inner_text().find('75%')>=0)
        check('official and supplementary forecasts are labelled', '香港天文台' in page.locator('.weather-attribution').inner_text() and 'Open-Meteo' in page.locator('.weather-attribution').inner_text())
        def source_settings(source,keys=False):
            page.locator('[data-detail-action=weather-settings]').first.click();page.locator('#weather-settings [name=source]').select_option(source)
            if keys:
                page.locator('.weather-credentials>summary').click();page.locator('[name=qweatherHost]').fill('example.xy.qweatherapi.com');page.locator('[name=qweatherKey]').fill('test-only-qweather-key');page.locator('[name=cwaKey]').fill('test-only-cwa-key')
            page.locator('#weather-settings [type=submit]').click();expect(page.locator('#weather-settings-panel')).to_be_hidden()
        source_settings('openmeteo');expect(page.locator('.weather-temperature')).to_contain_text('27°')
        source_settings('qweather',True);expect(page.locator('.weather-temperature')).to_contain_text('29°');expect(page.locator('.weather-source-line')).to_contain_text('和风天气')
        check('QWeather v1 data and credentials apply immediately','80%' in page.locator('.weather-metrics').inner_text() and '获取于' in page.locator('#weather-location').inner_text())
        check('weather keys are absent from the desktop backup state','test-only-' not in page.evaluate('localStorage.getItem("qiye.state.v5")'))
        def local_city(query):
            if not page.locator('#weather-city-panel').is_visible():page.locator('[data-detail-action=weather-cities]').click()
            page.locator('#weather-list-query').fill(query);page.locator('#weather-list-query').press('Enter');page.locator('#weather-list-results [data-weather-result="0"]').click()
        local_city('臺北');source_settings('auto');expect(page.locator('.weather-source-line')).to_contain_text('中央气象署');expect(page.locator('.weather-temperature')).to_contain_text('28°')
        check('traditional Taiwan search routes to CWA', '臺北' in page.locator('.weather-source-line').inner_text())
        local_city('澳門');expect(page.locator('.weather-source-line')).to_contain_text('澳门地球物理气象局');expect(page.locator('.weather-temperature')).to_contain_text('30°')
        check('Macao auto mode reads official XML',page.locator('.hourly-weather>div').count()==24)
        local_city('北京');expect(page.locator('.weather-source-line')).to_contain_text('和风天气');check('mainland auto mode prefers configured QWeather',page.locator('.weather-temperature').inner_text().startswith('29°'))
        local_city('香港');failed[0]=True
        page.locator('[data-detail-action=weather-refresh]').click();expect(page.locator('.weather-source-notice')).to_contain_text('和风天气')
        check('regional failure falls back to another configured source',page.locator('.weather-temperature').inner_text().startswith('29°'))
        page.locator('[data-detail-action=weather-settings]').first.click();page.locator('[name=source]').select_option('hko');page.locator('[name=fallback]').uncheck();page.locator('#weather-settings [type=submit]').click();expect(page.locator('.weather-empty-state')).to_contain_text('香港天文台')
        check('strict source failure is visible instead of using another source',page.locator('.weather-temperature').count()==0)
        failed[0]=False;source_settings('auto');expect(page.locator('.weather-temperature')).to_contain_text('26°')
        page.locator('[data-detail-action=window-expand]').click();page.screenshot(path=str(OUT/'regional-sources.png'),animations='disabled')
        page.locator('[data-detail-action=weather-settings]').first.click();page.locator('.weather-credentials>summary').click();page.screenshot(path=str(OUT/'source-settings.png'),animations='disabled')
        page.locator('[name=clearKeys]').check();page.locator('#weather-settings [type=submit]').click();expect(page.locator('#weather-settings-panel')).to_be_hidden()
        check('clearing keys removes local provider credentials', 'test-only-' not in page.evaluate('localStorage.getItem("qiye.weather.credentials.v1")'))
        check('provider workflow has no uncaught errors',not provider_errors);context.close()
        (OUT/('preview.json' if args.preview else 'source.json')).write_text(json.dumps({'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
    finally:browser.close();server.shutdown()
