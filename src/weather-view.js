// SPDX-License-Identifier: GPL-3.0-only
import { t, formatDate } from './i18n.js';
import { parseDate } from './calendar.js';
import { escapeText } from './html.js';
import { icon } from './icons.js';
import { appButton, windowControls } from './widget-app-controls.js';
import { weatherState, cityKey, weatherArt, weatherDescription, temperature, WEATHER_TTL } from './weather.js';
import { forecastChart } from './weather-chart.js';
import { WEATHER_SOURCES, readWeatherCredentials, weatherSource } from './weather-sources.js';

const e = escapeText;
const measurement = (value, suffix = '') => Number.isFinite(value) ? `${Math.round(value * 10) / 10}${suffix}` : '—';
const art = (code, isDay = true) => Number.isFinite(code) && code>=0 ? weatherArt(code, isDay) : '<span class="weather-art-missing">—</span>';

export function weatherSourceFields(config) {
  return `<label><span>${t('天气源')}</span><select name="source">${WEATHER_SOURCES.map(source=>`<option value="${source.id}" ${(config.source||'auto')===source.id?'selected':''}>${t(source.name)}</option>`).join('')}</select></label><label class="weather-enable"><input name="fallback" type="checkbox" ${config.fallback!==false?'checked':''}>${t('故障时自动切换天气源')}</label>`;
}
function citySearch() {
  return `<form id="weather-list-search" class="weather-city-search" role="search"><div class="weather-search-field"><input id="weather-list-query" aria-label="${t('搜索全球城市')}" placeholder="${t('输入城市、乡镇')}" maxlength="100" autocomplete="off"><button type="submit" aria-label="${t('搜索城市')}" title="${t('搜索城市')}">${icon('search')}</button></div><div id="weather-list-results" class="weather-search-results" hidden></div></form>`;
}
export function weatherWorkspace(item) {
  return `<div class="weather-app" data-panel="">
    <header class="weather-window-bar"><h2 id="dialog-title">${e(item.title)}</h2><div class="weather-header-actions"><div class="weather-tools">
      ${appButton('weather-add-city',t('添加城市'),'plus','aria-expanded="false" aria-controls="weather-city-panel"')}
      ${appButton('weather-cities',t('城市列表'),'list','aria-expanded="false" aria-controls="weather-city-panel"')}
      ${appButton('weather-settings',t('天气设置'),'settings','aria-expanded="false" aria-controls="weather-settings-panel"')}
    </div>${windowControls()}</div></header>
    <div class="weather-content"><div class="weather-main"><div class="weather-toolbar"><div id="weather-location"></div><button type="button" id="weather-refresh" class="weather-refresh" data-detail-action="weather-refresh" aria-label="${t('刷新')}" title="${t('刷新')}" hidden>${icon('refresh')}</button></div><p id="weather-feedback" role="status" hidden></p><div class="weather-scroll"><section id="weather-forecast">${weatherDetail(item)}</section></div></div>
      <div class="weather-side-slot">
      <aside id="weather-city-panel" class="weather-side-panel weather-city-panel" aria-labelledby="weather-city-title" hidden><header><h3 id="weather-city-title" tabindex="-1">${t('天气列表')}</h3>${appButton('weather-panel-close',t('收起面板'),'close')}</header><div class="weather-panel-body">${citySearch()}<div id="weather-city-list"></div><p class="weather-panel-help">${t('切换城市查看天气，最多保留 8 个城市。')}</p></div></aside>
      <aside id="weather-settings-panel" class="weather-side-panel" aria-labelledby="weather-settings-title" hidden><header><h3 id="weather-settings-title" tabindex="-1">${t('天气设置')}</h3>${appButton('weather-panel-close',t('收起面板'),'close')}</header><div class="weather-panel-body">${weatherSettings(item)}</div></aside>
      </div>
    </div></div>`;
}

export function weatherSettings(item) {
  const c=item.config, local=readWeatherCredentials();
  return `<form id="weather-settings">${weatherSourceFields(c)}<p class="weather-panel-help">${t('自动模式优先匹配地区实况；小时预报及缺失的每日预报由 Open-Meteo 补充。')}</p><details class="weather-credentials"><summary>${t('配置天气源密钥')}</summary><p class="weather-panel-help">${t('密钥仅保存在本机，不进入桌面备份或 WebDAV 同步。留空保留已存密钥。')}</p><label><span>QWeather API Host</span><input name="qweatherHost" value="${e(local.qweatherHost)}" placeholder="xxxx.qweatherapi.com" maxlength="200" autocomplete="off" spellcheck="false"></label><label><span>${t('和风天气')} API Key</span><input type="password" name="qweatherKey" maxlength="256" autocomplete="new-password" placeholder="${t(local.qweatherKey?'已配置，留空保留':'尚未配置')}"></label><a href="https://dev.qweather.com/docs/start/" target="_blank" rel="noopener noreferrer">${t('获取和风天气密钥')}</a><label><span>${t('台湾中央气象署')} API Key</span><input type="password" name="cwaKey" maxlength="256" autocomplete="new-password" placeholder="${t(local.cwaKey?'已配置，留空保留':'尚未配置')}"></label><a href="https://opendata.cwa.gov.tw/" target="_blank" rel="noopener noreferrer">${t('获取气象署授权码')}</a><label class="weather-enable"><input type="checkbox" name="clearKeys">${t('清除本机天气密钥')}</label></details><label><span>${t('卡片名称')}</span><input name="title" value="${e(item.title)}" required maxlength="30"></label><label><span>${t('城市名称')}</span><input name="cityName" value="${e(c.city.name)}" required maxlength="60"></label><details><summary>${t('手动坐标')}</summary><label><span>${t('纬度')}</span><input name="latitude" type="number" step="any" min="-90" max="90" required value="${c.city.latitude}"></label><label><span>${t('经度')}</span><input name="longitude" type="number" step="any" min="-180" max="180" required value="${c.city.longitude}"></label></details><label><span>${t('温度单位')}</span><select name="unit"><option value="celsius" ${c.unit === 'celsius' ? 'selected' : ''}>${t('摄氏度 °C')}</option><option value="fahrenheit" ${c.unit === 'fahrenheit' ? 'selected' : ''}>${t('华氏度 °F')}</option></select></label><label class="weather-enable"><input type="checkbox" name="enabled" ${c.enabled ? 'checked' : ''}>${t('启用天气')}</label><p class="weather-panel-help">${t('启用后向所选天气源发送城市坐标；每 30 分钟更新。')}</p><button type="submit" class="weather-primary">${t('保存设置')}</button><p class="weather-settings-status" role="status"></p></form>`;
}

export function weatherLocation(item) {
  const state = weatherState(item.config.city,item.config), data = state.data;
  return `<strong>${e(item.config.city.name)}</strong>${item.config.enabled && data ? `<span>${e(data.description||weatherDescription(data.code))}</span><small>${t(data.observedAt?'发布于':'获取于')} ${e(data.observedAt?data.observedAt.replace('T',' ').slice(5):formatDate(new Date(data.fetchedAt),{hour:'2-digit',minute:'2-digit'}))}</small>` : ''}`;
}

export function weatherCityCards(item, cities) {
  return cities.map(city => {
    const key = cityKey(city), active = key === cityKey(item.config.city), state = weatherState(city,item.config), data = item.config.enabled ? state.data : null;
    return `<div class="weather-city-card ${active ? 'active' : ''}">${active?`<span class="weather-city-pin" aria-label="${t('当前')}">${icon('pin')}</span>`:''}<button type="button" data-weather-city="${key}" aria-pressed="${active}"><span class="weather-city-heading"><strong>${e(city.name)}</strong><b>${data?temperature(data.temperature,item.config.unit):'—'}</b></span><span class="weather-city-summary"><span>${data?art(data.code,data.isDay):icon('cloud')}${e(data?(data.description||weatherDescription(data.code)):t(item.config.enabled?state.status==='error'?'暂不可用':'正在获取天气':'未启用天气'))}</span><small>${data?`${t('最高')}${temperature(data.max,item.config.unit)} ${t('最低')}${temperature(data.min,item.config.unit)}`:''}</small></span><span class="weather-city-origin">${data?e(t(weatherSource(data.sources?.current).name)):''}${data&&state.status==='error'?` · ${t('缓存')}`:''}</span></button>${active?'':`<button type="button" class="weather-city-remove" data-weather-remove="${key}" aria-label="${e(t('移除城市 {name}',{name:city.name}))}" title="${t('移除城市')}">${icon('close')}</button>`}</div>`;
  }).join('');
}

export function hourlyForecast(weather, unit, metric = 'temperature') {
  const hours = weather.hourly, selected = ['temperature','rain','wind'].includes(metric) ? metric : 'temperature';
  const label = selected === 'rain' ? t('降水概率') : selected === 'wind' ? t('风速') : t('温度');
  const format = value => selected === 'temperature' ? temperature(value,unit) : measurement(value, selected === 'rain' ? '%' : '');
  const bounds = selected === 'rain' ? {min:0,max:100} : selected === 'wind' ? {min:0,max:Math.max(10,...hours.map(h=>h.wind || 0))} : undefined;
  return `<section class="weather-forecast-panel"><header><h3>${icon('clock')}${t('未来 24 小时')}</h3><div class="weather-metric-switch" role="group" aria-label="${t('小时预报指标')}">${[['temperature','温度','cloud'],['rain','降水概率','droplet'],['wind','风速','wind']].map(([key,title,glyph])=>`<button type="button" data-weather-metric="${key}" aria-pressed="${key === selected}" aria-label="${t(title)}" title="${t(title)}">${icon(glyph)}</button>`).join('')}</div></header><div class="weather-chart-caption">${label}${selected === 'wind' ? ' · km/h' : selected === 'temperature' ? (unit === 'fahrenheit' ? ' · °F' : ' · °C') : ' · %'}</div>${hours.length ? `<div class="weather-horizontal-scroll" tabindex="0" role="region" aria-label="${t('未来 24 小时')}"><div class="weather-hour-track" style="--forecast-count:${hours.length}"><div class="hourly-weather">${hours.map(hour=>`<div><time datetime="${e(hour.time)}">${e(hour.time.slice(11,16))}</time><span title="${weatherDescription(hour.code)}">${art(hour.code,hour.isDay)}</span><span class="sr-only">${weatherDescription(hour.code)} · ${label} ${format(hour[selected])}${selected === 'wind' ? ' km/h' : ''}</span></div>`).join('')}</div>${forecastChart([{values:hours.map(hour=>hour[selected]),format}],hours.length,bounds)}</div></div>` : `<p class="weather-empty">${t('暂无小时预报')}</p>`}</section>`;
}

function dailyForecast(weather, unit) {
  const days = weather.daily, temp = value => temperature(value,unit), today = weather.observedAt.slice(0,10)||weather.daily[0]?.time;
  return `<section class="weather-forecast-panel weather-week-panel"><header><h3>${icon('calendar')}${t('未来 7 天')}</h3><div class="weather-chart-legend"><span>${t('最高')}</span><span>${t('最低')}</span></div></header>${days.length ? `<div class="weather-horizontal-scroll" tabindex="0" role="region" aria-label="${t('未来 7 天')}"><div class="weather-week-track" style="--forecast-count:${days.length}"><div class="weather-day-backgrounds" aria-hidden="true">${days.map(day=>`<div class="${day.time===today?'is-today':''}"></div>`).join('')}</div><div class="daily-weather">${days.map(day=>`<div ${day.time===today?'aria-current="date"':''}><time datetime="${e(day.time)}"><strong>${day.time===today?t('今天'):(parseDate(day.time)?formatDate(parseDate(day.time),{weekday:'short'}):e(day.time))}</strong><span>${e(day.time.slice(5))}</span></time><span class="weather-day-condition" title="${e(day.description||weatherDescription(day.code))}">${art(day.code)}<span>${e(day.description||weatherDescription(day.code))}</span></span><span class="sr-only">${t('最高')} ${temp(day.max)} · ${t('最低')} ${temp(day.min)}</span></div>`).join('')}</div>${forecastChart([{values:days.map(day=>day.max),format:temp},{values:days.map(day=>day.min),format:temp,low:true}],days.length)}<div class="weather-day-metrics">${days.map(day=>`<div><span title="${t('最高风速')}">${icon('wind')}${measurement(day.wind,' km/h')}</span><span title="${t('降水概率')}">${icon('droplet')}${day.rainText?e(day.rainText):measurement(day.rain,'%')}</span></div>`).join('')}</div></div></div>` : `<p class="weather-empty">${t('暂无每日预报')}</p>`}</section>`;
}

export function weatherDetail(item, metric = 'temperature') {
  const state = weatherState(item.config.city,item.config), weather = state.data, unit = item.config.unit;
  if (!item.config.enabled) return `<div class="weather-empty-state">${icon('cloud')}<h3>${t('把天气带进新标签页')}</h3><p>${t('启用后向所选天气源发送城市坐标；每 30 分钟更新。')}</p><button type="button" class="weather-primary" data-detail-action="weather-enable">${t('启用天气')}</button></div>`;
  if (!weather) return `<div class="weather-empty-state">${icon('cloud')}<p role="status">${e(state.error || t('正在获取天气'))}</p><button type="button" data-detail-action="weather-refresh" ${state.status==='loading'?'disabled':''}>${t('重新加载')}</button></div>`;
  const temp = value => temperature(value,unit), day = weather.daily[0];
  const stale = Date.now()-weather.fetchedAt >= WEATHER_TTL || state.status === 'error';
  return `<div class="weather-detail"><section class="weather-hero"><div class="weather-hero-current"><strong class="weather-temperature">${temp(weather.temperature)}<span class="weather-temperature-unit">${unit==='fahrenheit'?'F':'C'}</span></strong><div class="weather-condition"><span class="weather-air" title="${t('空气质量使用 CAMS 美国 AQI 标准')}">${icon('leaf')}${weather.air?.aqi!==null&&weather.air?.aqi!==undefined?`${t(aqiLabel(weather.air.aqi))} ${measurement(weather.air.aqi)} · AQI (US)`:'AQI —'}</span><span>${art(weather.code,weather.isDay)}${e(weather.description||weatherDescription(weather.code))}<span>${icon('wind')}${measurement(weather.wind,' km/h')} ${Number.isFinite(weather.wind)?e(t('{n}级',{n:windLevel(weather.wind)})):''}</span></span></div></div><p class="weather-source-line">${icon('cloud')}${t('实况')} · ${e(t(weatherSource(weather.sources?.current).name))}${weather.station?` · ${e(weather.station)}`:''}</p><p class="weather-outlook">${t('今日温度')} ${temp(weather.min)} – ${temp(weather.max)}<span>${t('体感')} ${temp(weather.feelsLike)}</span></p><dl class="weather-metrics">${[[t('湿度'),measurement(weather.humidity,'%')],[t('气压'),measurement(weather.pressure,' hPa')],[t(weather.precipitationPeriod==='day'?'今日降水':'降水'),measurement(weather.precipitation,' mm')],[t('日出'),day?.sunrise?.slice(11,16)||'—'],[t('日落'),day?.sunset?.slice(11,16)||'—'],[t('紫外线'),measurement(day?.uv)],['PM2.5',measurement(weather.air?.pm25,' μg/m³')]].map(([label,value])=>`<div><dt>${label}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>${weather.notice?`<p class="weather-source-notice" role="status">${e(weather.notice)}</p>`:''}${stale?`<p class="weather-cache-message" role="status">${e(state.error)} ${t('缓存')} · ${e(formatDate(new Date(weather.fetchedAt),{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}))}</p>`:''}</section>${hourlyForecast(weather,unit,metric)}${dailyForecast(weather,unit)}${weatherAttribution(weather)}</div>`;
}

function windLevel(speed) { return [1,6,12,20,29,39,50,62,75,89,103,118].filter(v=>speed>=v).length; }
function aqiLabel(aqi) { return aqi<=50?'优':aqi<=100?'良':aqi<=150?'敏感人群不健康':aqi<=200?'不健康':aqi<=300?'非常不健康':'危险'; }
function weatherAttribution(weather) {
  const link=id=>{const source=weatherSource(id);return `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${e(t(source.name))}</a>`;};
  return `<footer class="weather-attribution"><span>${e(weather.timezone)} · ${t('预报时间采用城市所在时区')}</span><span>${t('实况')}: ${link(weather.sources?.current)} · ${t('小时预报')}: ${weather.sources?.hourly?link(weather.sources.hourly):'—'} · ${t('每日预报')}: ${weather.sources?.daily?link(weather.sources.daily):'—'}${weather.daily.some(d=>d.source==='openmeteo')&&weather.sources.daily!=='openmeteo'?` (${t('今天')}: ${link('openmeteo')})`:''}${weather.air?' · <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener noreferrer">CAMS · AQI (US)</a>':''}</span>${weather.sources?.current==='qweather'?'<a href="https://developer.qweather.com/attribution.html" target="_blank" rel="noopener noreferrer">QWeather attribution</a>':''}</footer>`;
}
