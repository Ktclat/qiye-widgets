import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, validateImport } from './fixtures/legacy-host.js';
import { createLayout, validateLayout } from './fixtures/legacy-layout.js';
import { listWidgetDefinitions, newWidgetConfig, validateWidgetConfig } from '../src/widget-registry.js';
import { HOTSEARCH_API, hotsearchSource, filterHotsearchSources, moveHotsearchSubscription } from '../src/hotsearch-sources.js';
import { createHotsearchClient, parseHotsearchResponse, hotsearchRequestUrl, HOTSEARCH_TTL } from '../src/hotsearch-data.js';
import { hotsearchRows, hotsearchCard, hotsearchMain } from '../src/hotsearch-view.js';

const config = () => ({...newWidgetConfig('hotsearch'), enabled:true});
const payload = title => ({type:'zhihu', update_time:'2026-10-14T02:00:00Z', list:[{index:1,title,url:'https://www.zhihu.com/question/123',hot_value:'12345'}]});
function memoryStorage() { const map=new Map(); return {getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value)}; }

test('legacy trending cards upgrade in place without changing unrelated desktop data',()=>{
  const state=structuredClone(DEFAULT_STATE);
  const titles=['热搜入口','Trending links','我的热门内容','My favorite topics','热搜入口'];
  const sizes=['4x2','2x2','1x1','1x2','2x1'];
  const legacy=sizes.map((size,i)=>({id:'legacy-hot-'+i,type:'widget',widget:'hotlinks',title:titles[i],size,groupId:state.activeGroupId,config:{},data:{}}));
  state.items.push(...legacy);
  const before=structuredClone(state), upgraded=validateImport(state);
  assert.deepEqual(state,before);
  assert.deepEqual({...upgraded,items:upgraded.items.slice(0,-legacy.length)},DEFAULT_STATE);
  upgraded.items.slice(-legacy.length).forEach((item,i)=>{
    assert.deepEqual(item,{...legacy[i],widget:'hotsearch',title:i===0||i===4?'热搜榜':i===1?'Trending':titles[i],config:newWidgetConfig('hotsearch')});
    assert.equal(item.config.enabled,false);
  });
  assert.deepEqual(validateImport(JSON.stringify(upgraded)),upgraded);
  assert.equal(listWidgetDefinitions().filter(item=>['hotlinks','hotsearch'].includes(item.type)).map(item=>item.type).join(),'hotsearch');
});

test('legacy trending imports remain strict and shared layouts also upgrade',()=>{
  const state=structuredClone(DEFAULT_STATE);
  state.items.push({id:'legacy-hot',type:'widget',widget:'hotlinks',title:'热搜入口',size:'4x2',groupId:state.activeGroupId,config:{},data:{}});
  const shared=createLayout(state).items.find(item=>item.id==='legacy-hot');
  assert.equal(shared.widget,'hotsearch');assert.equal(shared.config.enabled,false);
  for(const key of ['config','data']){
    const invalid=structuredClone(state);invalid.items.at(-1)[key]={unexpected:'must not be discarded'};
    assert.throws(()=>validateImport(invalid),/不是支持的字段/);
  }
});

test('hotsearch config is independent, strict, portable and disabled when sharing',()=>{
  const first=newWidgetConfig('hotsearch'),second=newWidgetConfig('hotsearch');first.subscriptions.reverse();assert.notDeepEqual(first,second);
  for(const patch of [{subscriptions:['zhihu','zhihu']},{subscriptions:['missing']},{layout:'html'},{activeSource:'unknown'},{enabled:1},{apiBase:'http://localhost'},{apiBase:'https://example.com/?token=secret'}])assert.throws(()=>validateWidgetConfig('hotsearch',{...second,...patch}));
  assert.deepEqual(validateWidgetConfig('hotsearch',{...second,subscriptions:[]}).subscriptions,[]);
  const state=structuredClone(DEFAULT_STATE);state.items.push({id:'hot-1',type:'widget',widget:'hotsearch',title:'我的热榜',size:'4x2',groupId:state.activeGroupId,config:config(),data:{}});
  assert.deepEqual(validateImport(JSON.stringify(state)).items.at(-1),state.items.at(-1));
  const layout=createLayout(state);const shared=layout.items.find(item=>item.widget==='hotsearch');assert.equal(shared.config.enabled,false);
  shared.config.enabled=true;assert.equal(validateLayout(layout).items.find(item=>item.widget==='hotsearch').config.enabled,false);
});
test('source filtering preserves subscription order and keyboard moves do not mutate the input',()=>{
  const c=config();assert.deepEqual(filterHotsearchSources(c).map(s=>s.id),c.subscriptions);
  assert.deepEqual(filterHotsearchSources(c,'tech','GITHUB').map(s=>s.id),['github','github-ai']);
  assert.equal(filterHotsearchSources(c,'all','不存在').length,0);
  assert.deepEqual(moveHotsearchSubscription(c.subscriptions,'github','zhihu'),['github','zhihu','weibo','52pojie']);
  assert.deepEqual(moveHotsearchSubscription(c.subscriptions,'zhihu',undefined),c.subscriptions);
  assert.equal(c.subscriptions[0],'zhihu');
});
test('parsers support UAPI, DailyHotApi and GitHub while rejecting unsafe URLs',()=>{
  const now=Date.parse('2026-10-14T04:00:00Z'),source=hotsearchSource('zhihu');
  const raw=payload('<img src=x onerror=alert(1)>');
  raw.list.push({title:'unsafe',url:'javascript:alert(1)'},{title:'duplicate',url:raw.list[0].url},{title:'no link',url:'',hot_value:'查看:1'});
  const parsed=parseHotsearchResponse(raw,source,now);
  assert.equal(parsed.items.length,2);assert.equal(parsed.updatedAt,Date.parse(raw.update_time));assert.equal(parsed.items[1].url,'');
  const rendered=hotsearchRows(parsed,source,DEFAULT_STATE);assert.doesNotMatch(rendered,/<img|javascript:|href=""/);assert.match(rendered,/&lt;img/);assert.match(rendered,/noopener noreferrer/);assert.match(rendered,/hotsearch-unlinked/);
  assert.doesNotMatch(hotsearchRows(parsed,source,{settings:{openNewTab:false}}),/target="_blank"/);
  assert.equal(parseHotsearchResponse({code:200,data:[{title:'hello',url:'https://example.com/post',hot:1000}]},source,now).items[0].heat,1000);
  assert.equal(parseHotsearchResponse({items:[{full_name:'a/b',html_url:'https://github.com/a/b',stargazers_count:42}]},hotsearchSource('github'),now).items[0].heat,42);
  assert.throws(()=>parseHotsearchResponse({code:500,data:[]},source));assert.throws(()=>parseHotsearchResponse({list:[{title:'bad',url:'data:text/html,x'}]},source));
  assert.equal(parseHotsearchResponse({list:[]},source).items.length,0);
  assert.equal(hotsearchRequestUrl(config(),source),HOTSEARCH_API+'/api/v1/misc/hotboard?type=zhihu');
  assert.equal(hotsearchRequestUrl({...config(),apiBase:'https://example.com/api/'},source),'https://example.com/api/zhihu');
  assert.equal(new URL(hotsearchRequestUrl(config(),hotsearchSource('github'),now)).searchParams.get('q'),'created:>=2026-10-07');
});
test('requests share work, respect TTL and retain cache when refresh fails',async()=>{
  let now=Date.parse('2026-10-14T04:00:00Z'),calls=0,fail=false;
  const storage=memoryStorage(),client=createHotsearchClient({storage:()=>storage,now:()=>now,fetcher:async()=>{calls++;if(fail)throw Error('offline');return payload('first');}});
  const c=config();await Promise.all([client.request(c,'zhihu'),client.request(c,'zhihu')]);assert.equal(calls,1);
  await client.request(c,'zhihu');assert.equal(calls,1);
  now+=HOTSEARCH_TTL+1;fail=true;await client.request(c,'zhihu');assert.equal(calls,2);assert.equal(client.state(c,'zhihu').status,'error');assert.equal(client.state(c,'zhihu').data.items[0].title,'first');
  const reloaded=createHotsearchClient({storage:()=>storage,now:()=>now});assert.equal(reloaded.state(c,'zhihu').data.items[0].title,'first');
  assert.equal(reloaded.state({...c,apiBase:'https://another.example.com'},'zhihu').data,null);
  now+=8*86400000;assert.equal(createHotsearchClient({storage:()=>storage,now:()=>now}).state(c,'zhihu').data,null);
});
test('paused widgets only fetch on explicit viewing, and reject malformed cached links',async()=>{
  let calls=0;const now=Date.now(),storage=memoryStorage();
  storage.setItem('qiye.hotsearch.v1',JSON.stringify({[HOTSEARCH_API+':zhihu']:{fetchedAt:now,updatedAt:now,items:[{title:'bad',url:'javascript:alert(1)',rank:1,heat:1}]}}));
  const client=createHotsearchClient({storage:()=>storage,now:()=>now,fetcher:async()=>{calls++;return payload('manual');}}),c=newWidgetConfig('hotsearch');
  assert.equal(client.state(c,'zhihu').data,null);await client.request(c,'zhihu');assert.equal(calls,0);
  const html=hotsearchCard({config:c},DEFAULT_STATE);assert.match(html,/点击查看实时榜单/);assert.doesNotMatch(html,/点击启用/);
  const main=hotsearchMain({config:c},DEFAULT_STATE,{category:'subscribed',query:'',active:'zhihu',collapsed:new Set()});
  assert.match(main,/data-hot-board="zhihu"/);assert.doesNotMatch(main,/data-hot-action="enable"|hotsearch-welcome/);
  await client.request(c,'zhihu',{manual:true});assert.equal(calls,1);assert.equal(client.state(c,'zhihu').data.items[0].title,'manual');
  assert.equal(c.enabled,false);
});
test('one consumer leaving does not cancel another; abandoned work cannot update state',async()=>{
  let finish,fetchSignal,calls=0;
  const client=createHotsearchClient({storage:()=>null,fetcher:(_url,{signal})=>{calls++;fetchSignal=signal;return new Promise(resolve=>{finish=resolve;});}}),c=config();
  const a=new AbortController(),b=new AbortController();const one=client.request(c,'zhihu',{signal:a.signal}),two=client.request(c,'zhihu',{signal:b.signal});
  a.abort();assert.equal(fetchSignal.aborted,false);finish(payload('shared'));await Promise.all([one,two]);assert.equal(calls,1);assert.equal(client.state(c,'zhihu').data.items[0].title,'shared');
  const only=new AbortController();const late=client.request(c,'weibo',{signal:only.signal});only.abort();assert.equal(fetchSignal.aborted,true);finish(payload('late'));await late;
  assert.equal(client.state(c,'weibo').data,null);assert.equal(client.state(c,'weibo').status,'idle');
});
test('switching back before an aborted request settles starts a new request',async()=>{
  const callbacks=[];const client=createHotsearchClient({storage:()=>null,fetcher:()=>new Promise(resolve=>callbacks.push(resolve))}),c=config(),abort=new AbortController();
  const first=client.request(c,'zhihu',{signal:abort.signal});abort.abort();const second=client.request(c,'zhihu');
  assert.equal(callbacks.length,2);callbacks[1](payload('new'));await second;callbacks[0](payload('old'));await first;assert.equal(client.state(c,'zhihu').data.items[0].title,'new');
});


test('opaque-frame default hotboard requests use the advertised host transport',async()=>{
 const previous=globalThis.qiyeBridge,calls=[];
 globalThis.qiyeBridge={init:{environment:{hostFeatures:['hotboard']}},call:async(method,params)=>{calls.push({method,params});return payload('Host public board');}};
 try{const client=createHotsearchClient({storage:()=>memoryStorage()});await client.request(config(),'zhihu');assert.equal(client.state(config(),'zhihu').data.items[0].title,'Host public board');assert.deepEqual(calls,[{method:'hotboard',params:{platform:'zhihu'}}]);}
 finally{if(previous===undefined)delete globalThis.qiyeBridge;else globalThis.qiyeBridge=previous;}
});
