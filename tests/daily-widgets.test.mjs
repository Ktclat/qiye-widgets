import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, createDefaultState, validateImport } from './fixtures/legacy-host.js';
import { t, setLocale, getLocale, resolveLocale, formatDate } from '../src/i18n.js';
import { englishMessages } from '../src/messages-en.js';
import { parseDate, localDateKey, daysBetween, dateStats, monthCells, countWorkdays, holidayFor } from '../src/calendar.js';
import { newMemo, listMemos, validateMemos } from '../src/memos.js';
import { parseWeatherResponse, requestWeather, weatherState, weatherKey, temperature, searchCities } from '../src/weather.js';
import { memoCard } from '../src/memo-view.js';
import { calendarDetail } from '../src/calendar-view.js';

test('locale resolution supports explicit preference, browser language and deterministic fallback',()=>{
  assert.equal(resolveLocale('auto',['zh-HK']),'zh-CN');
  assert.equal(resolveLocale('auto',['fr-FR','zh-CN']),'en');
  assert.equal(resolveLocale('zh-CN',['en-US']),'zh-CN');
  assert.equal(resolveLocale('en',['zh-CN']),'en');
  assert.equal(resolveLocale('auto',[]),'zh-CN');
});
test('English messages preserve the source placeholders and do not recursively interpolate values',()=>{
  for(const [source,translated] of Object.entries(englishMessages)){
    const placeholders=s=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
    for(const text of typeof translated==='string'?[translated]:Object.values(translated))assert.deepEqual(placeholders(text),placeholders(source),source);
  }
  setLocale('en');assert.equal(t('第 {day} 天 · ISO 第 {week} 周',{day:10,week:2}),'Day 10 · ISO week 2');
  assert.equal(t('打开{v0}',{v0:'设置 {v0}'}),'Open 设置 {v0}');assert.equal(t('constructor'),'constructor');setLocale('zh-CN');
});
test('default content is localized at creation, imported user content is never translated',()=>{
  setLocale('en');const fresh=createDefaultState();assert.equal(fresh.groups[0].name,'Home');assert.equal(fresh.items.find(i=>i.widget==='weather').config.city.name,'Hong Kong');
  fresh.groups[0].name='设置';const imported=validateImport(fresh);assert.equal(imported.groups[0].name,'设置');assert.equal(imported.settings.language,'auto');
  assert.match(formatDate(new Date(2026,9,13),{month:'long'}),/October/);setLocale('zh-CN');assert.equal(getLocale(),'zh-CN');
});
test('current schema requires language and independent complete weather configuration',()=>{
  const state=structuredClone(DEFAULT_STATE);delete state.settings.language;assert.throws(()=>validateImport(state));
  const weather=structuredClone(DEFAULT_STATE);weather.items.find(i=>i.widget==='weather').config.unit='kelvin';assert.throws(()=>validateImport(weather));
  const old=structuredClone(DEFAULT_STATE);old.schemaVersion=2;assert.throws(()=>validateImport(old));
});
test('calendar uses local civil days across leap years and daylight-saving boundaries',()=>{
  assert.equal(parseDate('2025-02-29'),null);assert.equal(parseDate('2024-02-29').getDate(),29);
  assert.equal(parseDate('1899-12-31'),null);assert.equal(daysBetween(parseDate('2024-02-28'),parseDate('2024-03-01')),2);
  assert.equal(daysBetween(new Date(2026,2,7,12),new Date(2026,2,9,12)),2);
  assert.deepEqual(dateStats(parseDate('2021-01-01')),{day:1,week:53,isoYear:2020});
  assert.equal(dateStats(parseDate('2024-12-31')).day,366);
});
test('calendar week start, today and holiday adjustments agree with published 2026 dates',()=>{
  const cells=monthCells(parseDate('2026-10-01'),{weekStart:1,holidays:'CN'},parseDate('2026-10-13'));
  assert.equal(cells.length,42);assert.equal(cells[0].date.getDay(),1);assert.equal(cells.filter(c=>c.today).length,1);
  assert.equal(monthCells(parseDate('2026-10-01'),{weekStart:0,holidays:'none'})[0].date.getDay(),0);
  assert.equal(holidayFor(parseDate('2026-10-10'),'CN').work,true);
  assert.equal(countWorkdays(parseDate('2026-10-01'),parseDate('2026-10-10'),'CN'),3);
  assert.equal(countWorkdays(parseDate('2026-10-01'),parseDate('2026-10-10'),'none'),7);
  assert.throws(()=>countWorkdays(parseDate('2027-01-01'),parseDate('2027-01-03'),'CN'),/2026/);
  assert.throws(()=>countWorkdays(parseDate('2026-10-10'),parseDate('2026-10-01')));
});
test('calendar event data is validated and escaped when rendered',()=>{
  const state=structuredClone(DEFAULT_STATE),item=state.items.find(i=>i.widget==='calendar');
  item.data.events.push({id:'event-1',date:'2026-10-13',title:'<img src=x onerror=alert(1)>'});
  assert.equal(validateImport(state).items.find(i=>i.widget==='calendar').data.events.length,1);
  assert.doesNotMatch(calendarDetail(item,{date:'2026-10-13',month:'2026-10'}),/<img src=x/);
  item.data.events[0].date='2026-02-30';assert.throws(()=>validateImport(state));
});
test('memos search both fields, sort pinned first and do not mutate stored order',()=>{
  const entries=[{...newMemo('a',10),title:'Beta',text:'calendar'}, {...newMemo('b',20),title:'Alpha',pinned:true}, {...newMemo('c',30),title:'Gamma'}];
  assert.deepEqual(listMemos(entries).map(e=>e.id),['b','c','a']);
  assert.deepEqual(listMemos(entries,'CALENDAR').map(e=>e.id),['a']);
  assert.deepEqual(listMemos(entries,'','title').map(e=>e.id),['b','a','c']);
  assert.deepEqual(entries.map(e=>e.id),['a','b','c']);
  assert.throws(()=>validateMemos({entries:[entries[0],entries[0]]},'memos'));
});
test('memo backups round trip separately from quick notes and escape title and text',()=>{
  const state=structuredClone(DEFAULT_STATE),memo=state.items.find(i=>i.widget==='memo');
  memo.data.entries.push({...newMemo('n1'),title:'<script>alert(1)</script>',text:'</button><img src=x>'});
  assert.deepEqual(validateImport(JSON.stringify(state)),state);
  assert.doesNotMatch(memoCard(memo),/<script>|<img src=x/);
  const invalid=structuredClone(memo.data);delete invalid.entries[0].text;assert.throws(()=>validateMemos(invalid,'memo'));
});
test('forecast parser handles missing values and malformed timestamps without inventing zeros',()=>{
  const raw={current:{temperature_2m:0,weather_code:0,time:'2026-10-13T12:00'},daily:{time:['2026-10-13',null],temperature_2m_max:[null]},hourly:{time:[null,'2026-10-13T11:00','2026-10-13T12:00','bad'],temperature_2m:[1,2,3,4]}};
  const data=parseWeatherResponse(raw,100);assert.equal(data.temperature,0);assert.equal(data.max,null);assert.equal(data.daily.length,1);assert.equal(data.hourly.length,1);assert.equal(data.hourly[0].temperature,3);
  assert.equal(temperature(undefined),'—');assert.equal(temperature(null),'—');assert.equal(temperature(0,'fahrenheit'),'32°');assert.equal(temperature(-40,'fahrenheit'),'-40°');
});
test('weather coalesces requests, isolates cities and keeps a forecast when air quality fails',async()=>{
  const original=globalThis.fetch;let calls=[];
  globalThis.fetch=async url=>{calls.push(url);if(url.includes('air-quality'))return new Response('{}',{status:503});return new Response(JSON.stringify({current:{temperature_2m:21,weather_code:1,time:'2026-10-13T12:00'}}));};
  try {
    const city={latitude:45.123,longitude:10.456};await Promise.all([requestWeather(city,true),requestWeather(city,true)]);
    assert.equal(calls.length,2);assert.equal(weatherState(city).data.temperature,21);assert.equal(weatherState(city).data.air,null);
    await requestWeather(city);assert.equal(calls.length,2);
    globalThis.fetch=async()=>{throw new TypeError('offline');};await requestWeather(city,true);assert.equal(weatherState(city).status,'error');assert.equal(weatherState(city).data.temperature,21);
    assert.equal(weatherState({latitude:1,longitude:2}).data,null);
  }finally{globalThis.fetch=original;}
});
test('city search uses the current language, bounds requests and rejects bad coordinates',async()=>{
  const previous=globalThis.fetch;let requested;
  globalThis.fetch=async url=>{requested=new URL(url);return new Response(JSON.stringify({results:[{name:'Paris',latitude:48.8,longitude:2.3,country:'France'},{name:'Bad',latitude:999,longitude:1}]}));};
  try {setLocale('en');assert.deepEqual(await searchCities('a'),[]);const cities=await searchCities('Paris');assert.equal(cities.length,1);assert.equal(requested.searchParams.get('language'),'en');assert.equal(requested.searchParams.get('count'),'8');}finally{globalThis.fetch=previous;setLocale('zh-CN');}
});


test('weather rejects malformed persisted forecasts and preserves valid night observations',()=>{
  const storage=globalThis.localStorage;
  const valid=parseWeatherResponse({current:{temperature_2m:15,weather_code:0,time:'2026-10-13T22:00'},hourly:{time:['2026-10-13T22:00'],is_day:[0],weather_code:[0],temperature_2m:[15]}});
  assert.equal(valid.hourly[0].isDay,false);
  valid.sources={current:'openmeteo',hourly:'openmeteo',daily:'openmeteo'};
  const goodKey=weatherKey({latitude:81,longitude:12}),badKey=weatherKey({latitude:82,longitude:12});
  globalThis.localStorage={getItem:key=>key==='qiye.weather.forecasts.v3'?JSON.stringify({[goodKey]:valid,[badKey]:{...valid,hourly:[null]}}):null};
  try {
    assert.equal(weatherState({latitude:81,longitude:12}).data.hourly[0].temperature,15);
    assert.equal(weatherState({latitude:82,longitude:12}).data,null);
  } finally {if(storage)globalThis.localStorage=storage;else delete globalThis.localStorage;}
});
