// SPDX-License-Identifier: GPL-3.0-only
import { t, getLocale } from './i18n.js';
import { numeric, parseOpenMeteo } from './weather-normalize.js';
import { localWeatherCities, weatherRegion } from './weather-regions.js';
import { readWeatherCredentials, weatherSourcePlan, weatherSourceProblem, weatherSource } from './weather-sources.js';
import { fetchWeatherSource, fetchWeatherAir, supplementForecast } from './weather-providers.js';

export const WEATHER_TTL = 30 * 60000;
const CACHE_KEY = 'qiye.weather.forecasts.v3';
const states = new Map(), requests = new Map();
export function cityKey(city) { return `${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`; }
export function weatherKey(city,config={}) { return `${cityKey(city)}:${weatherRegion(city)}:${config.source||'auto'}:${config.fallback!==false}:${readWeatherCredentials().revision}:${getLocale()}`; }
export function temperature(value, unit = 'celsius') { return numeric(value) === null ? '—' : `${Math.round(unit === 'fahrenheit' ? value * 9 / 5 + 32 : value)}°`; }
export function parseWeatherResponse(raw, now=Date.now()) { return parseOpenMeteo(raw,now); }
function readCache(key) {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY) || '{}')[key];
    const numbers = (object, fields) => object && fields.every(field => object[field] === null || numeric(object[field]) !== null);
    const time = (value, pattern) => typeof value === 'string' && pattern.test(value);
    const valid = value && numeric(value.temperature) !== null && numeric(value.code) !== null
      && numeric(value.fetchedAt) !== null && value.fetchedAt <= Date.now() && Date.now()-value.fetchedAt < 7*86400000
      && typeof value.timezone === 'string' && typeof value.isDay === 'boolean'
      && typeof value.observedAt === 'string' && (!value.observedAt || time(value.observedAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/))
      && numbers(value, ['feelsLike','humidity','wind','min','max','pressure','precipitation'])
      && (value.air === null || numbers(value.air, ['aqi','pm25','pm10']))
      && value.sources && ['openmeteo','hko','smg','cwa','qweather'].includes(value.sources.current)
      && Array.isArray(value.daily) && value.daily.length <= 7 && value.daily.every(day => numbers(day,['code','min','max','rain','uv','wind']) && time(day.time,/^\d{4}-\d{2}-\d{2}$/) && typeof day.sunrise === 'string' && typeof day.sunset === 'string')
      && Array.isArray(value.hourly) && value.hourly.length <= 24 && value.hourly.every(hour => numbers(hour,['temperature','code','rain','wind']) && typeof hour.isDay === 'boolean' && time(hour.time,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/));
    return valid ? value : null;
  } catch { return null; }
}
function cache(key, data) {
  try {
    const previous = JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY) || '{}');
    const entries = Object.entries(previous || {}).filter(([k,v])=>k !== key && numeric(v?.fetchedAt) !== null).sort((a,b)=>b[1].fetchedAt-a[1].fetchedAt).slice(0,47);
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify({...Object.fromEntries(entries), [key]:data}));
  } catch { /* A full or disabled cache must not discard a forecast. */ }
}
export function weatherState(city,config={}) {
  const key = weatherKey(city,config);
  if (!states.has(key)) {
    if (states.size >= 64) states.delete(states.keys().next().value);
    states.set(key, {status:'idle', data:readCache(key), error:'', lastAttempt:0});
  }
  return states.get(key);
}
export async function searchCities(query, signal) {
  if (query.trim().length < 2) return [];
  const local=localWeatherCities(query);
  if(local.length) return local;
  const params = new URLSearchParams({name:query.trim(), count:'8', language:getLocale() === 'zh-CN' ? 'zh' : 'en', format:'json'});
  const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok) throw new Error(t('城市搜索失败，请重试或填写坐标。'));
  const raw=await response.json();
  return (Array.isArray(raw.results) ? raw.results : []).filter(c=>typeof c.name === 'string' && numeric(c.latitude) !== null && Math.abs(c.latitude)<=90 && numeric(c.longitude) !== null && Math.abs(c.longitude)<=180).map(c=>({name:c.name.slice(0,60),latitude:c.latitude,longitude:c.longitude,...(/^[A-Z]{2}$/.test(c.country_code)?{countryCode:c.country_code}:{}),region:[c.admin1,c.country].filter(Boolean).join(', ')}));
}
export function requestWeather(city, force = false, config={}) {
  const key=weatherKey(city,config),status=weatherState(city,config);
  if(requests.has(key)) return requests.get(key);
  if(!force&&((status.data&&Date.now()-status.data.fetchedAt<WEATHER_TTL)||Date.now()-status.lastAttempt<60000)) return Promise.resolve();
  status.status='loading';status.lastAttempt=Date.now();
  const credentials=readWeatherCredentials(),plan=weatherSourcePlan(city,config,credentials);
  const job=(async()=>{
    let modelJob;
    const model=()=>modelJob||(modelJob=fetchWeatherSource('openmeteo',city,credentials).then(data=>({data}),error=>({error})));
    const airJob=fetchWeatherAir(city).catch(()=>null);
    const failures=[];
    try {
      let data;
      for(const source of plan) {
        try {
          const problem=weatherSourceProblem(source,city,credentials);
          if(problem) throw new Error(problem);
          if(source==='openmeteo') {const result=await model();if(result.error)throw result.error;data=result.data;}
          else {
            if(['hko','smg','cwa'].includes(source)) void model();
            data=await fetchWeatherSource(source,city,credentials);
            if(!data.hourly.length||!data.daily.length||source==='hko') {
              const result=await model();data=supplementForecast(data,result.data);
              if(result.error) data.notice=t('补充预报暂不可用，已保留实况数据。');
            }
          }
          break;
        } catch(error) {failures.push(`${t(weatherSource(source).name)}: ${error.name==='AbortError'?t('请求超时，请稍后重试'):error instanceof TypeError?t('网络连接失败，请稍后重试'):error.message}`);}
      }
      if(!data) throw new Error(failures.join(' · '));
      data.air=await airJob;
      if(failures.length) data.notice=t('首选天气源暂不可用，已切换至 {source}。',{source:t(weatherSource(data.sources.current).name)});
      status.data=data;status.status='success';status.error='';cache(key,data);
    } catch(error) {status.status='error';status.error=error.message;}
    finally {requests.delete(key);}
  })();
  requests.set(key,job);return job;
}

export function weatherDescription(code) {
  if (code === 0) return t("晴");
  if (code === 1) return t("晴间多云");
  if (code === 2) return t("多云");
  if (code === 3) return t("阴");
  if ([45, 48].includes(code)) return t("雾");
  if ([51, 53, 55, 56, 57].includes(code)) return t("毛毛雨");
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return t("雨");
  if ([71, 73, 75, 77, 85, 86].includes(code)) return t("雪");
  if ([95, 96, 99].includes(code)) return t("雷雨");
  return t("天气数据");
}

export function weatherArt(code = 2, isDay = true) {
  if(!Number.isFinite(code)||code<0) return '<span class="weather-art-missing" aria-hidden="true">—</span>';
  const cloud = '<path d="M21 54c-9 0-15-6-15-13s6-13 13-13c3-11 12-17 22-15 10 2 16 9 16 18 9-1 17 4 17 12s-6 13-15 13H21Z" fill="rgba(255,255,255,.96)"/>';
  const sun = '<circle cx="56" cy="23" r="15" fill="#ffd982"/><g stroke="#ffe6a9" stroke-width="2.5" stroke-linecap="round"><path d="M56 2v-2m0 44v3M35 23h-3m45 0h3M41 8l-2-2m34 34 2 2M41 38l-2 2M71 8l2-2"/></g>';
  const moon = '<path d="M64 8a18 18 0 1 0 14 28A18 18 0 0 1 64 8Z" fill="#fff0bd"/>';
  const precipitation = code >= 51 && code < 95;
  const snow = [71, 73, 75, 77, 85, 86].includes(code);
  return `<svg class="w-weather-art" viewBox="0 0 84 78" aria-hidden="true">${code <= 2 ? (isDay ? sun : moon) : ''}${code === 0 ? '' : cloud}${precipitation ? `<g stroke="${snow ? '#fff' : '#bfe9ff'}" stroke-width="3" stroke-linecap="round"><path d="m24 64-3 6m20-6-3 6m20-6-3 6"/>${snow ? '<path d="m19 65 7 4m10-4 7 4m10-4 7 4"/>' : ''}</g>` : ''}${code >= 95 ? '<path d="m44 58-9 12h7l-3 9 16-17h-9l4-4Z" fill="#ffda79"/>' : ''}</svg>`;
}

