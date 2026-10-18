// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { keys, string, number, bool, enumeration, array, unique, id } from './validation.js';

export const MAP_REGIONS = Object.freeze([
  { id:'CN', name:'中国大陆', short:'大陆', city:'深圳', longitude:114.0579, latitude:22.5431, zoom:12 },
  { id:'HK', name:'中国香港', short:'香港', city:'香港', longitude:114.1694, latitude:22.3193, zoom:12 },
  { id:'MO', name:'中国澳门', short:'澳门', city:'澳门', longitude:113.5439, latitude:22.1987, zoom:14 },
  { id:'TW', name:'中国台湾', short:'台湾', city:'台北', longitude:121.5654, latitude:25.0330, zoom:12 },
]);
export const MAP_DEFAULTS = Object.freeze({ enabled:false, source:'auto', layer:'street' });
export const MAP_SOURCE_IDS = Object.freeze(['auto','amap','tianditu','hk','nlsc','osm']);
export const MAP_FAVORITE_LIMIT = 80;
const regionIds = ['CN','HK','MO','TW','WORLD'];
export const mapRegion = region => MAP_REGIONS.find(row => row.id === region);
function inPolygon(x,y,points) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const [xi,yi]=points[i],[xj,yj]=points[j];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
export function regionAt({ longitude:x, latitude:y }) {
  // Coarse service coverage only, never drawn as administrative boundaries.
  if (inPolygon(x,y,[[113.82,22.13],[114.5,22.13],[114.5,22.55],[114.25,22.56],[114.16,22.56],[114.11,22.53],[114.04,22.50],[113.98,22.52],[113.91,22.50],[113.82,22.40]])) return 'HK';
  if (x >= 113.52 && x <= 113.61 && y >= 22.1 && y <= 22.22) return 'MO';
  if (x >= 119.3 && x <= 122.1 && y >= 21.8 && y <= 25.5) return 'TW';
  if (x >= 72.004 && x <= 137.8347 && y >= 0.8293 && y <= 55.8271) return 'CN';
  return 'WORLD';
}
export function regionPlace(region) {
  const entry = mapRegion(region) || MAP_REGIONS[0];
  return { name:t(entry.city), address:t(entry.name), region:entry.id, longitude:entry.longitude, latitude:entry.latitude, crs:'wgs84' };
}
export function newMapData() {
  const selected = regionPlace('CN');
  return { region:'CN', center:pointOnly(selected), zoom:12, selected, favorites:[] };
}
export function pointOnly(point) { return { longitude:point.longitude, latitude:point.latitude, crs:point.crs }; }
export function validateMapPoint(raw, path='point') {
  keys(raw, ['longitude','latitude','crs'], path);
  return { longitude:number(raw.longitude,path+'.longitude',-180,180), latitude:number(raw.latitude,path+'.latitude',-85.05112878,85.05112878), crs:enumeration(raw.crs,['wgs84','gcj02'],path+'.crs') };
}
export function validateMapPlace(raw, path='place', favorite=false) {
  keys(raw, ['name','address','region','longitude','latitude','crs',...(favorite?['id']:[])],path);
  return { ...(favorite?{id:id(raw.id,path+'.id')}:{}), name:string(raw.name,path+'.name',120), address:string(raw.address,path+'.address',400,true), region:enumeration(raw.region,regionIds,path+'.region'), ...validateMapPoint(pointOnly(raw),path) };
}
export function validateMapConfig(raw, path='config') {
  keys(raw,['enabled','source','layer'],path);
  const source=string(raw.source,path+'.source',80);
  if (!MAP_SOURCE_IDS.includes(source) && !/^custom-[a-zA-Z0-9_-]{1,60}$/.test(source)) throw new Error(t('地图源标识无效。'));
  return {enabled:bool(raw.enabled,path+'.enabled'),source,layer:enumeration(raw.layer,['street','satellite'],path+'.layer')};
}
export function validateMapData(raw, path='data') {
  keys(raw,['region','center','zoom','selected','favorites'],path);
  const favorites=array(raw.favorites,path+'.favorites',MAP_FAVORITE_LIMIT).map((place,i)=>validateMapPlace(place,`${path}.favorites[${i}]`,true));
  unique(favorites.map(place=>place.id),path+'.favorites');
  return {region:enumeration(raw.region,regionIds,path+'.region'),center:validateMapPoint(raw.center,path+'.center'),zoom:number(raw.zoom,path+'.zoom',1,20,true),selected:validateMapPlace(raw.selected,path+'.selected'),favorites};
}

// Web Mercator pixels. Keep the stored coordinate system explicit across providers.
export function project(point, zoom) {
  const size=256*2**zoom, lat=Math.max(-85.05112878,Math.min(85.05112878,point.latitude))*Math.PI/180;
  return {x:(point.longitude+180)/360*size,y:(1-Math.asinh(Math.tan(lat))/Math.PI)/2*size};
}
export function unproject({x,y},zoom,crs='wgs84') {
  const size=256*2**zoom;
  return {longitude:((x/size*360)%360+360)%360-180,latitude:Math.atan(Math.sinh(Math.PI*(1-2*Math.max(0,Math.min(size,y))/size)))*180/Math.PI,crs};
}
function gcjDelta(point) {
  const x=point.longitude-105,y=point.latitude-35,pi=Math.PI;
  let lat=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));
  let lon=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));
  const waves=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;
  lat+=waves+(20*Math.sin(y*pi)+40*Math.sin(y/3*pi))*2/3+(160*Math.sin(y/12*pi)+320*Math.sin(y*pi/30))*2/3;
  lon+=waves+(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3+(150*Math.sin(x/12*pi)+300*Math.sin(x/30*pi))*2/3;
  const rad=point.latitude*pi/180,magic=1-.00669342162296594323*Math.sin(rad)**2,root=Math.sqrt(magic);
  return {longitude:lon*180/(6378245/root*Math.cos(rad)*pi),latitude:lat*180/(6378245*(1-.00669342162296594323)/(magic*root)*pi)};
}
export function convertMapPoint(point, crs, region=regionAt(point)) {
  if (point.crs===crs) return pointOnly(point);
  // Regional WGS84 services must never receive the mainland GCJ offset.
  // This is an approximate display conversion, not a surveying transformation.
  if (region!=='CN' || regionAt(point)!=='CN') return {...pointOnly(point),crs};
  if (crs==='gcj02') {const d=gcjDelta(point);return {longitude:point.longitude+d.longitude,latitude:point.latitude+d.latitude,crs};}
  let result={...pointOnly(point),crs};
  for(let i=0;i<5;i++){const d=gcjDelta(result);result={longitude:point.longitude-d.longitude,latitude:point.latitude-d.latitude,crs};}
  return result;
}
export function sameMapPlace(a,b) {return a.crs===b.crs && Math.abs(a.longitude-b.longitude)<.00001 && Math.abs(a.latitude-b.latitude)<.00001;}
export function coordinateText(point) {return `${point.longitude.toFixed(6)}, ${point.latitude.toFixed(6)}`;}
export function parseMapCoordinates(query, crs='wgs84') {
  const match=String(query).trim().match(/^(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)$/);
  if(!match)return null;
  return validateMapPoint({longitude:Number(match[1]),latitude:Number(match[2]),crs});
}
export function mapExternalUrl(place, provider='amap') {
  if(provider==='amap') {
    const url=new URL('https://uri.amap.com/marker');
    url.search=new URLSearchParams({position:`${place.longitude.toFixed(6)},${place.latitude.toFixed(6)}`,name:place.name,coordinate:place.crs==='gcj02'?'gaode':'wgs84',src:'Qiye',callnative:'0'});
    return url.href;
  }
  const p=convertMapPoint(place,'wgs84',place.region),url=new URL('https://www.google.com/maps/dir/');
  url.search=new URLSearchParams({api:'1',destination:`${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`});
  return url.href;
}

const places = [
  ['深圳','Shenzhen','CN',114.0579,22.5431],['广州','廣州 Guangzhou','CN',113.2644,23.1291],['珠海','Zhuhai','CN',113.5767,22.2707],
  ['北京','Beijing','CN',116.4074,39.9042],['上海','Shanghai','CN',121.4737,31.2304],['杭州','Hangzhou','CN',120.1551,30.2741],
  ['成都','Chengdu','CN',104.0665,30.5723],['重庆','重慶 Chongqing','CN',106.5516,29.5630],['武汉','武漢 Wuhan','CN',114.3055,30.5928],
  ['南京','Nanjing','CN',118.7969,32.0603],['西安','Xi’an Xian','CN',108.9398,34.3416],['厦门','廈門 Xiamen','CN',118.0894,24.4798],
  ['香港','Hong Kong 香港','HK',114.1694,22.3193],['中环','中環 Central','HK',114.1588,22.2819],['尖沙咀','Tsim Sha Tsui','HK',114.1722,22.2986],
  ['香港国际机场','香港國際機場 Hong Kong International Airport','HK',113.9185,22.3080],['沙田','Sha Tin','HK',114.1898,22.3810],
  ['澳门','澳門 Macao Macau','MO',113.5439,22.1987],['大三巴牌坊','Ruins of St. Paul’s','MO',113.5408,22.1976],['氹仔','Taipa 凼仔','MO',113.5577,22.1534],
  ['台北','臺北 Taipei','TW',121.5654,25.0330],['台北 101','臺北 Taipei 101','TW',121.5645,25.0339],['台中','臺中 Taichung','TW',120.6736,24.1477],
  ['台南','臺南 Tainan','TW',120.2270,22.9997],['高雄','Kaohsiung','TW',120.3014,22.6273],['花莲','花蓮 Hualien','TW',121.6068,23.9911],
  ['桃园','桃園 Taoyuan','TW',121.3010,24.9937],['新竹','Hsinchu','TW',120.9675,24.8138],
];
export const MAP_PLACES=Object.freeze(places.map(([name,aliases,region,longitude,latitude])=>({name,aliases,region,longitude,latitude,crs:'wgs84',address:mapRegion(region).name})));
export function searchMapPlaces(query, favorites=[], region='CN') {
  const term=query.trim().toLocaleLowerCase().replace(/臺/g,'台');
  const rows=[...favorites,...MAP_PLACES].filter(place=>!term || `${place.name} ${place.address} ${place.aliases||''} ${t(place.name)}`.toLocaleLowerCase().replace(/臺/g,'台').includes(term));
  return rows.sort((a,b)=>Number(b.region===region)-Number(a.region===region)).filter((place,i,all)=>all.findIndex(p=>sameMapPlace(p,place))===i).slice(0,12).map(({aliases,id,...place})=>({...place,name:t(place.name),address:t(place.address)}));
}
