import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_REGIONS, newMapData, validateMapData, validateMapConfig, regionAt, regionPlace, project, unproject, convertMapPoint, parseMapCoordinates, searchMapPlaces, mapExternalUrl } from '../src/map-model.js';
import { defaultMapLocal, validateMapLocal, validateTileTemplate, resolveMapSource, mapTileUrls, amapStaticUrl, parseAmapPlaces, searchAmapPlaces, requestMapPermission, hasMapPermission, MAP_SOURCES } from '../src/map-sources.js';
import { newWidgetConfig, listWidgetDefinitions } from '../src/widget-registry.js';
import { newWidgetData, validateWidgetData } from '../src/widget-data.js';
import { renderWidget } from '../src/widgets.js';
import { mapWorkspace, mapSelection, mapAttribution } from '../src/map-view.js';
import { DEFAULT_STATE, validateImport, exportState } from './fixtures/legacy-host.js';

const item=()=>({id:'test-map',groupId:'home',type:'widget',widget:'map',title:'地图',size:'4x2',config:newWidgetConfig('map'),data:newWidgetData('map')});
test('map defaults are offline and each widget receives independent data',()=>{
  assert.equal(listWidgetDefinitions().find(w=>w.type==='map').size,'4x2');
  const first=item(),second=item();first.data.favorites.push({...first.data.selected,id:'one'});
  assert.equal(second.data.favorites.length,0);assert.equal(first.config.enabled,false);
  assert.deepEqual(validateWidgetData('map',first.data),first.data);
  assert.throws(()=>validateMapConfig({...first.config,amapKey:'secret'}));
  for(const size of ['1x1','1x2','2x1','2x2','4x2']) {
    const html=renderWidget({...first,size},DEFAULT_STATE);
    assert.match(html,/data-widget="map"/);assert.match(html,/data-action="widget-open"/);
    assert.doesNotMatch(html,/<img|<script|<iframe|https:\/\/restapi/);
  }
});
test('maps survive the existing backup validation without including local source secrets',()=>{
  const state=structuredClone(DEFAULT_STATE);state.items.push(item());
  const restored=validateImport(JSON.parse(exportState(state)));
  assert.deepEqual(restored.items.find(i=>i.id==='test-map').data,newMapData());
  assert.doesNotMatch(exportState(state),/amapKey|tiandituKey|custom-template/);
});
test('map points and backups reject malformed, oversized and duplicate data',()=>{
  for(const bad of [NaN,Infinity,181,'114'])assert.throws(()=>validateMapData({...newMapData(),center:{longitude:bad,latitude:22,crs:'wgs84'}}));
  assert.throws(()=>parseMapCoordinates('114, 90'));
  assert.throws(()=>validateMapData({...newMapData(),zoom:3.5}));
  assert.throws(()=>validateMapData({...newMapData(),selected:{...newMapData().selected,crs:'bd09'}}));
  const favorite={...newMapData().selected,id:'same'};
  assert.throws(()=>validateMapData({...newMapData(),favorites:[favorite,favorite]}));
  assert.throws(()=>validateMapData({...newMapData(),favorites:Array.from({length:81},(_,i)=>({...favorite,id:String(i)}))}));
  assert.deepEqual(parseMapCoordinates('121.5654， 25.0330'),{longitude:121.5654,latitude:25.033,crs:'wgs84'});
  assert.equal(parseMapCoordinates('深圳'),null);
});
test('Mercator projection is reversible, clamped at poles and wraps longitude',()=>{
  for(const point of [...MAP_REGIONS,{longitude:-122.42,latitude:37.77}])for(const zoom of [3,12,19]) {
    const actual=unproject(project(point,zoom),zoom);
    assert.ok(Math.abs(actual.longitude-point.longitude)<1e-9);assert.ok(Math.abs(actual.latitude-point.latitude)<1e-9);
  }
  assert.ok(unproject({x:0,y:-100},10).latitude<=85.051129);
  assert.equal(unproject({x:256*2**10*2,y:0},10).longitude,-180);
});
test('mainland GCJ display conversion is reversible and special regions retain WGS84',()=>{
  const beijing={longitude:116.404,latitude:39.915,crs:'wgs84'};
  const shifted=convertMapPoint(beijing,'gcj02','CN');
  assert.ok(Math.abs(shifted.longitude-116.4102445)<.000001);
  assert.ok(Math.abs(shifted.latitude-39.9164043)<.000001);
  const back=convertMapPoint(shifted,'wgs84','CN');
  assert.ok(Math.abs(back.longitude-beijing.longitude)<1e-7);assert.ok(Math.abs(back.latitude-beijing.latitude)<1e-7);
  for(const region of ['HK','MO','TW']) {
    const p=regionPlace(region),actual=convertMapPoint(p,'gcj02',region);
    assert.equal(actual.longitude,p.longitude);assert.equal(actual.latitude,p.latitude);
    assert.equal(regionAt(p),region);
  }
  assert.equal(regionAt(regionPlace('CN')),'CN','Shenzhen must not be mistaken for Hong Kong');
  assert.notEqual(convertMapPoint(regionPlace('CN'),'gcj02','CN').longitude,regionPlace('CN').longitude);
  assert.equal(regionAt({longitude:-73,latitude:40}),'WORLD');
});
test('automatic regional sources expose actual fallback while explicit missing keys remain errors',()=>{
  const config=newWidgetConfig('map'),local=defaultMapLocal();
  assert.equal(resolveMapSource(config,'HK',local).source.id,'hk');assert.equal(resolveMapSource(config,'TW',local).source.id,'nlsc');
  assert.equal(resolveMapSource(config,'MO',local).source.id,'osm');assert.ok(resolveMapSource(config,'CN',local).notice);
  assert.equal(resolveMapSource(config,'CN',{...local,amapKey:'demo'}).source.id,'amap');
  assert.equal(resolveMapSource(config,'MO',{...local,tiandituKey:'demo'}).source.id,'tianditu');
  assert.ok(resolveMapSource({...config,source:'amap'},'CN',local).problem);
  assert.ok(resolveMapSource({...config,source:'hk'},'TW',local).problem);
  assert.ok(resolveMapSource({...config,source:'custom-missing'},'CN',local).problem);
  assert.equal(resolveMapSource({...config,source:'osm',layer:'satellite'},'CN',local).layer,'street');
});
test('multiple custom sources validate independently and reject unsafe templates',()=>{
  const custom={id:'custom-one',name:'One',template:'https://tiles.example.com/{z}/{x}/{y}.png',credit:'© Example',crs:'wgs84',minZoom:2,maxZoom:19};
  const local=validateMapLocal({...defaultMapLocal(),custom:[custom,{...custom,id:'custom-two',name:'Two'}],preferences:{CN:'custom-one',HK:'hk',MO:'custom-two',TW:'nlsc'}});
  assert.equal(resolveMapSource(newWidgetConfig('map'),'CN',local).source.name,'One');
  for(const template of ['javascript:alert(1)','http://tiles.example.com/{z}/{x}/{y}','https://127.0.0.1/{z}/{x}/{y}','https://user:pass@example.com/{z}/{x}/{y}','https://localhost/{z}/{x}/{y}','https://tiles.example.com/{z}/{x}/{y}?key={key}','https://{x}.example.com/{z}/{y}','https://tiles.example.com/{z}/{x}/{y}#foo'])assert.throws(()=>validateTileTemplate(template),template);
  assert.throws(()=>validateMapLocal({...local,custom:[custom,custom]}));
  assert.throws(()=>validateMapLocal({...local,custom:[{...custom,minZoom:19,maxZoom:2}]}));
  assert.throws(()=>validateMapLocal({...local,preferences:{...local.preferences,CN:'hk'}}));
  assert.equal(mapTileUrls({...custom,layers:['street']},'street',local,8,23,44)[0],'https://tiles.example.com/8/23/44.png');
});
test('source notice preferences migrate old settings and stay local',()=>{
  const legacy={amapKey:'',tiandituKey:'',preferences:{CN:'amap',HK:'hk',MO:'tianditu',TW:'nlsc'},custom:[]};
  assert.equal(validateMapLocal(legacy).showSourceNotices,true);
  assert.equal(validateMapLocal({...legacy,showSourceNotices:false}).showSourceNotices,false);
  assert.throws(()=>validateMapLocal({...legacy,showSourceNotices:'false'}));
  const state=structuredClone(DEFAULT_STATE);state.items.push(item());
  assert.doesNotMatch(exportState(state),/showSourceNotices/);
});
test('official map URLs preserve row/column order, labels, credentials and static limits',()=>{
  const local={...defaultMapLocal(),amapKey:'demo',tiandituKey:'tdt-demo'};
  const tw=MAP_SOURCES.find(s=>s.id==='nlsc'),hk=MAP_SOURCES.find(s=>s.id==='hk'),tdt=MAP_SOURCES.find(s=>s.id==='tianditu');
  assert.match(mapTileUrls(tw,'street',local,15,27366,14127)[0],/\/15\/14127\/27366$/);
  assert.match(mapTileUrls(tw,'satellite',local,15,27366,14127)[0],/\/PHOTO2\//);
  assert.equal(mapTileUrls(hk,'street',local,12,3347,1786).length,2);assert.match(mapTileUrls(hk,'street',local,12,3347,1786)[1],/\/tc\/WGS84\/12\/3347\/1786/);
  const url=new URL(mapTileUrls(tdt,'satellite',local,15,27366,14127)[1]);
  assert.equal(url.searchParams.get('LAYER'),'cia');assert.equal(url.searchParams.get('TILEROW'),'14127');assert.equal(url.searchParams.get('TILECOL'),'27366');
  const staticUrl=new URL(amapStaticUrl(regionPlace('CN'),19,1500,800,local));
  assert.equal(staticUrl.origin,'https://restapi.amap.com');assert.equal(staticUrl.searchParams.get('size'),'1024*800');assert.equal(staticUrl.searchParams.get('zoom'),'17');assert.equal(staticUrl.searchParams.get('key'),'demo');
  assert.throws(()=>amapStaticUrl(regionPlace('CN'),12,800,600,defaultMapLocal()));
});
test('traditional, simplified and English place aliases work without a request',()=>{
  for(const query of ['澳门','澳門','Macau','香港','Hong Kong','臺北','台北','Taipei','廣州','广州'])assert.ok(searchMapPlaces(query).length,query);
  assert.equal(searchMapPlaces('',[],'MO')[0].region,'MO');
  const favorite={...regionPlace('TW'),name:'<img src=x onerror=alert(1)>',id:'saved'};
  assert.match(mapSelection(favorite,[favorite]),/&lt;img/);assert.doesNotMatch(mapSelection(favorite,[]),/<img src=x/);
  const external=new URL(mapExternalUrl({...favorite,name:'A&B?城市'}));assert.equal(external.searchParams.get('name'),'A&B?城市');assert.equal(external.searchParams.get('coordinate'),'wgs84');
  assert.equal(new URL(mapExternalUrl({...favorite,crs:'gcj02'})).searchParams.get('coordinate'),'gaode');
});
test('Amap search validates responses and sends keywords only on explicit invocation',async()=>{
  assert.throws(()=>parseAmapPlaces({status:'0',info:'INVALID_USER_KEY'}),/Key/);
  assert.deepEqual(parseAmapPlaces({status:'1',pois:[{name:'bad',location:''}]}),[]);
  const rows=parseAmapPlaces({status:'1',pois:[{name:'深圳站',location:'114.119,22.532',address:'罗湖',pname:'广东省'}]});
  assert.equal(rows[0].crs,'gcj02');assert.equal(rows[0].longitude,114.119);
  let requested;
  await searchAmapPlaces('咖啡 & 公园',{...defaultMapLocal(),amapKey:'unit-test-key'},{fetcher:async(url,options)=>{requested=new URL(url);assert.equal(options.credentials,'omit');return new Response(JSON.stringify({status:'1',pois:[]}),{headers:{'Content-Type':'application/json'}});}});
  assert.equal(requested.searchParams.get('keywords'),'咖啡 & 公园');assert.equal(requested.searchParams.get('key'),'unit-test-key');
});
test('map source permissions are narrow, explicit and denial is reported',async()=>{
  const previous=globalThis.chrome,asked=[];
  globalThis.chrome={runtime:{id:'test'},permissions:{request:async args=>{asked.push(args);return false;},contains:async()=>false}};
  try {
    assert.equal(await hasMapPermission(MAP_SOURCES[0],'street',defaultMapLocal()),false);assert.equal(asked.length,0);
    await assert.rejects(requestMapPermission(MAP_SOURCES[0],'street',defaultMapLocal()));
    assert.deepEqual(asked,[{origins:['https://restapi.amap.com/*']}]);
  } finally {globalThis.chrome=previous;}
});
test('workspace renders real controls without remote scripts or automatic location access',()=>{
  const html=mapWorkspace(item());assert.match(html,/map-viewport/);assert.match(html,/map-settings-form/);assert.doesNotMatch(html,/<iframe|<script|maps\.googleapis|webapi\.amap/);
  assert.match(mapAttribution(MAP_SOURCES.find(s=>s.id==='hk'),true),/landsdlogo/);
  assert.match(mapAttribution(MAP_SOURCES.find(s=>s.id==='osm'),true),/OpenStreetMap contributors/);
});
