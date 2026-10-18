// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { weatherRegion } from './weather-regions.js';

export const WEATHER_SOURCES = [
  {id:'auto',name:'自动选择（按地区）',url:''},
  {id:'openmeteo',name:'Open-Meteo',url:'https://open-meteo.com/'},
  {id:'qweather',name:'和风天气',url:'https://www.qweather.com/'},
  {id:'hko',name:'香港天文台',url:'https://www.hko.gov.hk/'},
  {id:'cwa',name:'台湾中央气象署',url:'https://www.cwa.gov.tw/'},
  {id:'smg',name:'澳门地球物理气象局',url:'https://www.smg.gov.mo/'},
];
const LOCAL_KEY='qiye.weather.credentials.v1';
export function weatherSource(id) { return WEATHER_SOURCES.find(s=>s.id===id) || WEATHER_SOURCES[1]; }
export function readWeatherCredentials() {
  try { return validateWeatherCredentials(JSON.parse(globalThis.localStorage?.getItem(LOCAL_KEY)||'{}')); }
  catch { return {qweatherHost:'',qweatherKey:'',cwaKey:'',revision:0}; }
}
export function validateWeatherCredentials(raw) {
  const qweatherHost=String(raw.qweatherHost||'').trim().replace(/^https:\/\//,'').replace(/\/$/,'').toLowerCase();
  if(qweatherHost && !/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?\.qweatherapi\.com$/.test(qweatherHost)) throw new Error(t('请填写和风控制台提供的 API Host（以 .qweatherapi.com 结尾）。'));
  const qweatherKey=String(raw.qweatherKey||'').trim(),cwaKey=String(raw.cwaKey||'').trim();
  if([qweatherKey,cwaKey].some(key=>key.length>256 || /[^\x21-\x7e]/.test(key))) throw new Error(t('API Key 格式无效。'));
  return {qweatherHost,qweatherKey,cwaKey,revision:Number.isSafeInteger(raw.revision)&&raw.revision>=0?raw.revision:0};
}
export function saveWeatherCredentials(raw) {
  const clean=validateWeatherCredentials(raw), previous=readWeatherCredentials();
  const changed=['qweatherHost','qweatherKey','cwaKey'].some(k=>clean[k]!==previous[k]);
  clean.revision=previous.revision+(changed?1:0);
  if(changed) globalThis.localStorage.setItem(LOCAL_KEY,JSON.stringify(clean));
  return clean;
}
export function weatherSourcePlan(city, config={}, credentials=readWeatherCredentials()) {
  const region=weatherRegion(city), selected=config.source || 'auto';
  let primary=selected;
  if(primary==='auto') primary=region==='HK'?'hko':region==='MO'?'smg':region==='TW'&&credentials.cwaKey?'cwa':credentials.qweatherHost&&credentials.qweatherKey?'qweather':'openmeteo';
  const plan=[primary];
  if(config.fallback!==false && primary!=='openmeteo') {
    if(primary!=='qweather' && credentials.qweatherHost&&credentials.qweatherKey) plan.push('qweather');
    plan.push('openmeteo');
  }
  return plan;
}
export function weatherSourceProblem(source,city,credentials=readWeatherCredentials()) {
  const region=weatherRegion(city), required={hko:'HK',smg:'MO',cwa:'TW'}[source];
  if(required&&region!==required) return t('这个天气源不覆盖当前城市。');
  if(source==='qweather' && (!credentials.qweatherHost||!credentials.qweatherKey)) return t('请先配置和风天气 API Host 和 API Key。');
  if(source==='cwa'&&!credentials.cwaKey) return t('请先配置中央气象署 API Key。');
  return '';
}
// Invoked only from an explicit settings/enable click, before asynchronous work.
export function requestWeatherPermission(city,config,credentials=readWeatherCredentials()) {
  if(!config.enabled || !globalThis.chrome?.runtime?.id || !globalThis.chrome?.permissions?.request) return Promise.resolve(true);
  const plan=weatherSourcePlan(city,config,credentials);
  const origins=['https://api.open-meteo.com/*','https://air-quality-api.open-meteo.com/*','https://geocoding-api.open-meteo.com/*'];
  if(plan.includes('hko')) origins.push('https://data.weather.gov.hk/*');
  if(plan.includes('smg')) origins.push('https://xml.smg.gov.mo/*');
  if(plan.includes('cwa')) origins.push('https://opendata.cwa.gov.tw/*');
  if(plan.includes('qweather')&&credentials.qweatherHost) origins.push(`https://${credentials.qweatherHost}/*`);
  return chrome.permissions.request({origins}).then(granted=>{
    if(!granted) throw new Error(t('未获准访问天气源，请在天气设置中重新保存并授权。'));
    return true;
  });
}
