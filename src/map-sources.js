// SPDX-License-Identifier: GPL-3.0-only
import { t, getLocale } from './i18n.js';
import { keys, string, number, bool, array, unique, enumeration } from './validation.js';
import { publicHttpsUrl, fetchPublicJson } from './public-json.js';
import { MAP_REGIONS, MAP_SOURCE_IDS, convertMapPoint, validateMapPlace } from './map-model.js';

const LOCAL_KEY='qiye.map.sources.v1';
export const MAP_SOURCES=Object.freeze([
  {id:'amap',name:'高德地图',note:'大陆街道 · 地点搜索',crs:'gcj02',minZoom:3,maxZoom:17,layers:['street'],regions:['CN'],credential:'amapKey',url:'https://lbs.amap.com/api/webservice/guide/api/staticmaps',credit:'© 高德地图'},
  {id:'tianditu',name:'天地图',note:'街道与卫星 · 需要 Key',crs:'wgs84',minZoom:3,maxZoom:18,layers:['street','satellite'],credential:'tiandituKey',url:'https://lbs.tianditu.gov.cn/server/MapService.html',credit:'© 天地图'},
  {id:'hk',name:'香港地政总署',note:'香港街道 · 繁体标注',crs:'wgs84',minZoom:10,maxZoom:20,layers:['street'],regions:['HK'],url:'https://p1static.csdi.gov.hk/csdi-webpage/apidoc/TopographicMapAPI',credit:'Map from Lands Department'},
  {id:'nlsc',name:'台湾通用电子地图',note:'台湾街道 · 正射影像',crs:'wgs84',minZoom:7,maxZoom:19,layers:['street','satellite'],regions:['TW'],url:'https://maps.nlsc.gov.tw/S09SOA/pro/Wmts_ajax_main.jsp',credit:'© 內政部國土測繪中心'},
  {id:'osm',name:'OpenStreetMap',note:'全球街道 · 无需 Key',crs:'wgs84',minZoom:2,maxZoom:19,layers:['street'],url:'https://www.openstreetmap.org/copyright',credit:'© OpenStreetMap contributors'},
]);
export const defaultMapLocal = () => ({amapKey:'',tiandituKey:'',showSourceNotices:true,preferences:{CN:'amap',HK:'hk',MO:'tianditu',TW:'nlsc'},custom:[]});
export function validateTileTemplate(value) {
  const url=string(value,'tile.url',2048);
  if(!['{z}','{x}','{y}'].every(key=>url.includes(key)) || /\{(?![zxy]\})/.test(url))throw new Error(t('瓦片地址须包含 {z}、{x}、{y}，并使用公开 HTTPS 域名。'));
  const resolved=publicHttpsUrl(url.replace(/\{[zxy]\}/g,'1'));
  if(new URL(resolved).hash || /\{/.test(new URL(url).hostname))throw new Error(t('瓦片地址不能在域名中使用占位符或包含片段。'));
  return url;
}
export function validateMapLocal(raw) {
  keys(raw,['amapKey','tiandituKey','preferences','custom','showSourceNotices'],'map.sources');
  const clean=defaultMapLocal();
  clean.showSourceNotices=bool(raw.showSourceNotices??true,'map.showSourceNotices');
  for(const name of ['amapKey','tiandituKey']) {
    const key=string(raw[name]??'','map.'+name,128,true).trim();
    if(key&&!/^[a-zA-Z0-9_-]+$/.test(key))throw new Error(t('API Key 格式无效。'));
    clean[name]=key;
  }
  clean.custom=array(raw.custom??[],'map.custom',8).map((entry,i)=>{
    const p=`map.custom[${i}]`;
    keys(entry,['id','name','template','credit','crs','minZoom','maxZoom'],p);
    if(!/^custom-[a-zA-Z0-9_-]{1,60}$/.test(entry.id))throw new Error(t('地图源标识无效。'));
    const minZoom=number(entry.minZoom,p+'.minZoom',1,20,true);
    return {id:entry.id,name:string(entry.name,p+'.name',50),template:validateTileTemplate(entry.template),credit:string(entry.credit,p+'.credit',160),crs:enumeration(entry.crs,['wgs84','gcj02'],p+'.crs'),minZoom,maxZoom:number(entry.maxZoom,p+'.maxZoom',minZoom,20,true)};
  });
  unique(clean.custom.map(entry=>entry.id),'map.custom');
  const all=[...MAP_SOURCES,...clean.custom];
  keys(raw.preferences??clean.preferences,MAP_REGIONS.map(r=>r.id),'map.preferences');
  for(const region of MAP_REGIONS) {
    const value=raw.preferences?.[region.id]??clean.preferences[region.id],source=all.find(s=>s.id===value);
    if(!source || source.regions&&!source.regions.includes(region.id))throw new Error(t('地区首选地图源无效。'));
    clean.preferences[region.id]=value;
  }
  return clean;
}
export function readMapLocal() {try{return validateMapLocal(JSON.parse(globalThis.localStorage?.getItem(LOCAL_KEY)||'{}'));}catch{return defaultMapLocal();}}
export function saveMapLocal(raw) {const clean=validateMapLocal(raw);globalThis.localStorage.setItem(LOCAL_KEY,JSON.stringify(clean));return clean;}
export function allMapSources(local=readMapLocal()) {return [...MAP_SOURCES,...local.custom.map(row=>({...row,layers:['street'],note:'自定义地图源',url:new URL(row.template).origin}))];}
export function mapSourceProblem(source,region,local) {
  if(!source)return t('这个自定义地图源仅保存在原设备，请在本机重新配置。');
  if(source.regions&&!source.regions.includes(region))return t('这个地图源不覆盖当前地区，请切换地图源。');
  if(source.credential&&!local[source.credential])return t('请先在地图源设置中填写 {name} Key。',{name:t(source.name)});
  return '';
}
export function resolveMapSource(config,region,local=readMapLocal()) {
  const sources=allMapSources(local),preferred=config.source==='auto'?(local.preferences[region]||'osm'):config.source;
  let source=sources.find(row=>row.id===preferred),problem=mapSourceProblem(source,region,local),notice='';
  if(config.source==='auto'&&problem) {
    const fallback=local.tiandituKey?'tianditu':'osm';
    source=sources.find(row=>row.id===fallback);
    notice=t('首选源尚未配置，当前使用 {name}。',{name:t(source.name)});problem='';
  }
  const layer=source?.layers.includes(config.layer)?config.layer:'street';
  if(source&&config.layer!==layer)notice=[notice,t('当前地图源仅提供街道底图。')].filter(Boolean).join(' ');
  return {source,layer,problem,notice};
}
function tdtUrl(layer,key,z,x,y) {
  const url=new URL(`https://t0.tianditu.gov.cn/${layer}_w/wmts`);
  url.search=new URLSearchParams({SERVICE:'WMTS',REQUEST:'GetTile',VERSION:'1.0.0',LAYER:layer,STYLE:'default',TILEMATRIXSET:'w',FORMAT:'tiles',TILEMATRIX:String(z),TILEROW:String(y),TILECOL:String(x),tk:key});
  return url.href;
}
export function mapTileUrls(source,layer,local,z,x,y) {
  if(source.id==='tianditu')return (layer==='satellite'?['img','cia']:['vec','cva']).map(l=>tdtUrl(l,local.tiandituKey,z,x,y));
  if(source.id==='hk')return [`https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/WGS84/${z}/${x}/${y}.png`,`https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/${getLocale()==='en'?'en':'tc'}/WGS84/${z}/${x}/${y}.png`];
  if(source.id==='nlsc')return [`https://wmts.nlsc.gov.tw/wmts/${layer==='satellite'?'PHOTO2':getLocale()==='en'?'EMAP8':'EMAP'}/default/GoogleMapsCompatible/${z}/${y}/${x}`];
  if(source.id==='osm')return [`https://tile.openstreetmap.org/${z}/${x}/${y}.png`];
  if(source.template)return [source.template.replace(/\{([zxy])\}/g,(_,key)=>({z,x,y})[key])];
  return [];
}
export function amapStaticUrl(center,zoom,width,height,local) {
  if(!local.amapKey)throw new Error(t('请先在地图源设置中填写 {name} Key。',{name:t('高德地图')}));
  const p=convertMapPoint(center,'gcj02','CN'),url=new URL('https://restapi.amap.com/v3/staticmap');
  url.search=new URLSearchParams({key:local.amapKey,location:`${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`,zoom:String(Math.max(3,Math.min(17,zoom))),size:`${Math.max(1,Math.min(1024,Math.round(width)))}*${Math.max(1,Math.min(1024,Math.round(height)))}`,scale:'1'});
  return url.href;
}
export function mapOrigins(source,layer,local) {
  if(!source)return [];
  if(source.id==='amap')return ['https://restapi.amap.com/*'];
  return [...new Set(mapTileUrls(source,layer,local,12,0,0).map(url=>new URL(publicHttpsUrl(url)).origin+'/*'))];
}
// Call synchronously from a user gesture; never request permission during rendering.
export function requestMapPermission(source,layer,local) {
  const origins=mapOrigins(source,layer,local);
  if(!globalThis.chrome?.runtime?.id||!chrome.permissions?.request||!origins.length)return Promise.resolve(true);
  return chrome.permissions.request({origins}).then(granted=>{if(!granted)throw new Error(t('未获准访问地图源，请重新授权。'));return true;});
}
export async function hasMapPermission(source,layer,local) {
  if(!globalThis.chrome?.runtime?.id||!chrome.permissions?.contains)return true;
  return chrome.permissions.contains({origins:mapOrigins(source,layer,local)});
}
export function parseAmapPlaces(raw) {
  if(String(raw?.status)!=='1')throw new Error(t('高德请求失败，请检查 Key、服务权限与调用额度。'));
  if(!Array.isArray(raw.pois))throw new Error(t('地点来源返回的数据格式无效。'));
  return raw.pois.slice(0,20).flatMap(poi=>{
    const location=typeof poi.location==='string'?poi.location.split(',').map(Number):[];
    if(location.length!==2||!location.every(Number.isFinite))return [];
    try {return [validateMapPlace({name:poi.name,address:[poi.pname,poi.cityname,poi.adname,poi.address].filter(s=>typeof s==='string').join(' ').slice(0,400),longitude:location[0],latitude:location[1],crs:'gcj02',region:'CN'})];}catch{return [];}
  });
}
export async function searchAmapPlaces(query,local,{signal,fetcher=globalThis.fetch}={}) {
  const keywords=string(query,'query',120).trim();
  if(!local.amapKey)throw new Error(t('请先在地图源设置中填写 {name} Key。',{name:t('高德地图')}));
  const url=new URL('https://restapi.amap.com/v3/place/text');
  url.search=new URLSearchParams({key:local.amapKey,keywords,offset:'20',page:'1',extensions:'base',output:'JSON'});
  return parseAmapPlaces(await fetchPublicJson(url.href,{signal,fetcher,maxBytes:512*1024}));
}
