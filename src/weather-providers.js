// SPDX-License-Identifier: GPL-3.0-only
import { t, getLocale } from './i18n.js';
import { numeric, parseOpenMeteo } from './weather-normalize.js';
import { weatherTimezone } from './weather-regions.js';

const number = value => value === '' || value === null || value === undefined || typeof value === 'boolean' ? null : numeric(Number(value));
const scale = (value, factor) => number(value) === null ? null : number(value)*factor;
const time = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) ? value.replace(' ','T').slice(0,16) : '';
const text = value => typeof value==='string' ? value.slice(0,1000) : '';
const emptyDay = date => ({time:date,code:null,min:null,max:null,rain:null,sunrise:'',sunset:'',uv:null,wind:null});
function emptyWeather(source,city) {
  return {fetchedAt:Date.now(),temperature:null,feelsLike:null,humidity:null,wind:null,pressure:null,precipitation:null,code:-1,isDay:true,min:null,max:null,observedAt:'',timezone:weatherTimezone(city),daily:[],hourly:[],air:null,sources:{current:source},station:'',description:'',notice:''};
}
function validate(data) {
  if(numeric(data.temperature)===null || data.temperature < -90 || data.temperature > 65) throw new Error(t('天气服务返回的数据不完整'));
  return data;
}
export async function weatherFetch(url,{headers,format='json',timeout=8000}={}) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',headers});
    if(!response.ok) throw new Error(t('服务暂不可用（{status}）',{status:response.status}));
    return format==='text'?await response.text():await response.json();
  } finally {clearTimeout(timer);}
}
export async function fetchOpenMeteo(city) {
  const params=new URLSearchParams({latitude:String(city.latitude),longitude:String(city.longitude),timezone:'auto',forecast_days:'7',current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,surface_pressure,precipitation',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_speed_10m_max',hourly:'temperature_2m,weather_code,precipitation_probability,is_day,wind_speed_10m'});
  const data=parseOpenMeteo(await weatherFetch(`https://api.open-meteo.com/v1/forecast?${params}`));
  data.sources={current:'openmeteo',hourly:'openmeteo',daily:'openmeteo'};
  return data;
}
export async function fetchWeatherAir(city) {
  const params=new URLSearchParams({latitude:String(city.latitude),longitude:String(city.longitude),current:'us_aqi,pm2_5,pm10',timezone:'auto'});
  const raw=await weatherFetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`,{timeout:4500});
  const c=raw?.current;
  return c?{aqi:numeric(c.us_aqi),pm25:numeric(c.pm2_5),pm10:numeric(c.pm10),standard:'US',source:'cams'}:null;
}

export function hkoCode(value) {
  return ({50:0,51:1,52:2,53:61,54:61,60:3,61:61,62:63,63:65,64:65,65:95,70:0,71:0,72:0,73:0,74:0,75:1,76:2,77:2,80:2,81:0,82:0,83:45,84:45,85:45})[value] ?? -1;
}
// Coordinates for the public temperature stations; humidity is reported at HKO.
const hkStations=[['Hong Kong Observatory',22.302,114.174],['King\'s Park',22.312,114.172],['Sha Tin',22.403,114.21],['Tai Po',22.446,114.179],['Tuen Mun',22.391,113.971],['Tseung Kwan O',22.315,114.256],['Chek Lap Kok',22.309,113.922],['Cheung Chau',22.202,114.026],['Ta Kwu Ling',22.528,114.157],['Yuen Long Park',22.441,114.019],['Wong Tai Sin',22.34,114.205],['Tsuen Wan Shing Mun Valley',22.375,114.124]];
const distance=(a,b)=>Math.hypot((a.latitude-b.latitude)*111,(a.longitude-b.longitude)*111*Math.cos(a.latitude*Math.PI/180));
export function parseHko(raw,forecast,city) {
  const data=emptyWeather('hko',city), readings=raw?.temperature?.data||[];
  const candidates=hkStations.map(([name,latitude,longitude])=>({name,latitude,longitude,value:readings.find(r=>r.place===name)?.value})).filter(s=>numeric(s.value)!==null).sort((a,b)=>distance(city,a)-distance(city,b));
  const station=candidates[0];
  if(!station) throw new Error(t('天气服务返回的数据不完整'));
  const stationNames={'Hong Kong Observatory':'香港天文台',"King's Park":'京士柏','Sha Tin':'沙田','Tai Po':'大埔','Tuen Mun':'屯门','Tseung Kwan O':'将军澳','Chek Lap Kok':'赤鱲角','Cheung Chau':'长洲','Ta Kwu Ling':'打鼓岭','Yuen Long Park':'元朗公园','Wong Tai Sin':'黄大仙','Tsuen Wan Shing Mun Valley':'荃湾城门谷'};
  data.temperature=station.value;data.station=getLocale()==='zh-CN'?stationNames[station.name]||station.name:station.name;data.humidity=numeric(raw.humidity?.data?.[0]?.value);
  data.observedAt=time(raw.temperature.recordTime||raw.updateTime);data.code=hkoCode(raw.icon?.[0]);
  data.isDay=![70,71,72,73,74,75,76,77].includes(raw.icon?.[0]) && Number(data.observedAt.slice(11,13))>=6 && Number(data.observedAt.slice(11,13))<18;
  data.daily=(forecast?.weatherForecast||[]).filter(d=>/^\d{8}$/.test(d.forecastDate)).slice(0,7).map(d=>({...emptyDay(d.forecastDate.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3')),code:hkoCode(d.ForecastIcon),min:number(d.forecastMintemp?.value),max:number(d.forecastMaxtemp?.value),description:text(d.forecastWeather),rainText:text(d.PSR),source:'hko'}));
  if(data.daily.length) data.sources.daily='hko';
  return validate(data);
}
async function fetchHko(city) {
  // English station identifiers stay stable across application language changes.
  const [current,daily]=await Promise.allSettled([
    weatherFetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en'),
    weatherFetch(`https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=fnd&lang=${getLocale()==='zh-CN'?'sc':'en'}`)
  ]);
  if(current.status==='rejected') throw current.reason;
  return parseHko(current.value,daily.status==='fulfilled'?daily.value:null,city);
}

export function smgCode(code) {
  return ({'01':0,a1:0,'02':1,a2:1,'03':2,'04':3,'05':45,'06':45,'07':45,'08':45,'09':45,'10':51,'11':99,'12':61,'13':65,'14':71,'15':75,'16':80,'17':82,'18':95,'19':45,'20':45,'22':45,'23':45,'24':95,'25':95,'28':61,c8:61,'29':80,c9:80})[code]??-1;
}
const xmlTag=(body,name)=>body.match(new RegExp(`<${name}>\\s*([^<]*)\\s*</${name}>`))?.[1]?.trim()||'';
function xmlMeasurement(xml,name,type) {
  for(const [,body] of xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`,'g'))) if(xmlTag(body,'Type')===String(type)) return number(xmlTag(body,'Value'));
  return null;
}
export function parseSmg(xml,city,forecast='') {
  if(typeof xml!=='string' || xml.length>100000 || !xml.includes('<ActualWeatherBrief>')) throw new Error(t('天气服务返回的数据不完整'));
  // Read only known scalar tags; never execute XML entities, markup or URLs.
  const tag=xmlTag,value=(name,type)=>xmlMeasurement(xml,name,type);
  const data=emptyWeather('smg',city), code=tag(xml,'WeatherStatus');
  data.temperature=value('Temperature',3);data.min=value('Temperature',9);data.max=value('Temperature',8);
  data.humidity=value('Humidity',3);data.wind=value('WindSpeed',3);data.precipitation=value('Rainfall',5);data.precipitationPeriod='day';
  data.observedAt=time(tag(xml,'ValidFor'));data.station=getLocale()==='zh-CN'?'大潭山':'Taipa Grande';
  data.code=smgCode(code);
  const hour=Number(data.observedAt.slice(11,13));data.isDay=!code.startsWith('a')&&hour>=6&&hour<18;
  if(typeof forecast==='string'&&forecast.length<100000) {
    data.daily=[...forecast.matchAll(/<WeatherForecast>([\s\S]*?)<\/WeatherForecast>/g)].map(([,body])=>({...emptyDay(tag(body,'ValidFor')),min:xmlMeasurement(body,'Temperature',2),max:xmlMeasurement(body,'Temperature',1),code:smgCode(tag(body,'WeatherStatus')),description:tag(body,'WeatherDescription'),source:'smg'})).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.time)).slice(0,7);
    if(data.daily.length) data.sources.daily='smg';
  }
  return validate(data);
}
async function fetchSmg(city) {
  const [current,daily]=await Promise.allSettled([
    weatherFetch('https://xml.smg.gov.mo/c_actual_brief.xml',{format:'text'}),
    weatherFetch(`https://xml.smg.gov.mo/${getLocale()==='zh-CN'?'c':'e'}_7daysforecast.xml`,{format:'text'})
  ]);
  if(current.status==='rejected') throw current.reason;
  return parseSmg(current.value,city,daily.status==='fulfilled'?daily.value:'');
}

function conditionCode(value) {
  if(/雷|thunder/i.test(value)) return 95;
  if(/雪|snow/i.test(value)) return 71;
  if(/雨|rain|shower/i.test(value)) return 61;
  if(/霧|雾|fog/i.test(value)) return 45;
  if(/陰|阴|overcast/i.test(value)) return 3;
  if(/多雲|多云|cloud/i.test(value)) return 2;
  if(/晴|sun|fine|clear/i.test(value)) return 0;
  return -1;
}
export function parseCwa(raw,city) {
  const station=(raw?.records?.Station||[]).map(s=>{
    const geo=s.GeoInfo?.Coordinates?.find(c=>c.CoordinateName==='WGS84');
    return {...s,latitude:number(geo?.StationLatitude),longitude:number(geo?.StationLongitude)};
  }).filter(s=>s.latitude!==null&&s.longitude!==null&&number(s.WeatherElement?.AirTemperature)!==null&&number(s.WeatherElement.AirTemperature)>-90).sort((a,b)=>distance(city,a)-distance(city,b))[0];
  if(!station||distance(city,station)>100) throw new Error(t('附近暂无可用的气象观测站。'));
  const data=emptyWeather('cwa',city),c=station.WeatherElement;
  const nonnegative=value=>number(value)!==null&&number(value)>=0?number(value):null;
  data.temperature=number(c.AirTemperature);data.humidity=nonnegative(c.RelativeHumidity);data.wind=scale(nonnegative(c.WindSpeed),3.6);
  data.pressure=nonnegative(c.AirPressure);data.precipitation=nonnegative(c.Now?.Precipitation);data.precipitationPeriod='day';
  data.station=text(station.StationName);data.observedAt=time(station.ObsTime?.DateTime);data.description=getLocale()==='zh-CN'?text(c.Weather):'';data.code=conditionCode(c.Weather);
  const hour=Number(data.observedAt.slice(11,13));data.isDay=hour>=6&&hour<18;
  return validate(data);
}

export function qweatherCode(value) {
  const code=Number(value);
  if([100,150].includes(code)) return 0;
  if([102,103,152,153].includes(code)) return 1;
  if([101,151].includes(code)) return 2;
  if(code===104) return 3;
  if([302,303,304].includes(code)) return 95;
  if(code>=300&&code<400) return code===305?61:code===306?63:code===307?65:61;
  if(code>=400&&code<500) return 71;
  if(code>=500&&code<600) return 45;
  return -1;
}
export function parseQweather(current,daily,hourly,city) {
  const data=emptyWeather('qweather',city),c=current;
  data.temperature=number(c?.temperature?.value);data.feelsLike=number(c?.feelsLike?.value);data.humidity=scale(c?.humidity,100);
  data.wind=scale(c?.wind?.speed?.value,c?.wind?.speed?.unit==='km/h'?1:3.6);data.pressure=number(c?.pressure?.value);data.precipitation=number(c?.precipitation?.amount?.value);
  data.code=qweatherCode(c?.condition?.code);data.description=text(c?.condition?.text);
  // v1 current has no observation timestamp; do not invent one from request time.
  data.daily=(daily?.days||[]).filter(d=>time(d.forecastStartTime)).slice(0,7).map(d=>({...emptyDay(time(d.forecastStartTime).slice(0,10)),code:qweatherCode(d.daytime?.condition?.code),description:text(d.daytime?.condition?.text),min:number(d.temperatureMin?.value),max:number(d.temperatureMax?.value),rain:Math.max(scale(d.daytime?.precipitation?.probability,100)??-1,scale(d.nighttime?.precipitation?.probability,100)??-1),sunrise:time(d.astro?.sunrise),sunset:time(d.astro?.sunset),uv:number(d.uvIndexMax),wind:scale(d.daytime?.wind?.speed?.value,d.daytime?.wind?.speed?.unit==='km/h'?1:3.6),source:'qweather'})).map(d=>({...d,rain:d.rain<0?null:d.rain}));
  data.hourly=(hourly?.hours||[]).filter(h=>time(h.forecastTime)).slice(0,24).map(h=>({time:time(h.forecastTime),temperature:number(h.temperature?.value),code:qweatherCode(h.condition?.code),isDay:Number(time(h.forecastTime).slice(11,13))>=6&&Number(time(h.forecastTime).slice(11,13))<18,rain:scale(h.precipitation?.probability,100),wind:scale(h.wind?.speed?.value,h.wind?.speed?.unit==='km/h'?1:3.6)}));
  data.min=data.daily[0]?.min??null;data.max=data.daily[0]?.max??null;
  data.isDay=![150,151,152,153].includes(Number(c?.condition?.code));
  const offset=hourly?.hours?.[0]?.forecastTime?.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1];
  if(offset) data.timezone=offset==='Z'?'UTC':`UTC${offset}`;
  if(data.daily.length) data.sources.daily='qweather';
  if(data.hourly.length) data.sources.hourly='qweather';
  return validate(data);
}
async function fetchQweather(city,credentials) {
  const base=`https://${credentials.qweatherHost}/weather/v1`,location=`${city.latitude.toFixed(4)}/${city.longitude.toFixed(4)}`;
  const params=new URLSearchParams({localTime:'true',lang:getLocale()==='zh-CN'?'zh':'en'}),options={headers:{'X-QW-Api-Key':credentials.qweatherKey}};
  const [current,daily,hourly]=await Promise.allSettled([
    weatherFetch(`${base}/current/${location}?${params}`,options),
    weatherFetch(`${base}/daily/${location}?${params}&days=7`,options),
    weatherFetch(`${base}/hourly/${location}?${params}&hours=24`,options)
  ]);
  if(current.status==='rejected') throw current.reason;
  return parseQweather(current.value,daily.status==='fulfilled'?daily.value:null,hourly.status==='fulfilled'?hourly.value:null,city);
}
export function fetchWeatherSource(source,city,credentials) {
  if(source==='openmeteo') return fetchOpenMeteo(city);
  if(source==='hko') return fetchHko(city);
  if(source==='smg') return fetchSmg(city);
  if(source==='cwa') return weatherFetch(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001?${new URLSearchParams({Authorization:credentials.cwaKey,format:'JSON'})}`).then(raw=>parseCwa(raw,city));
  if(source==='qweather') return fetchQweather(city,credentials);
  throw new Error(t('未知天气源。'));
}

export function supplementForecast(primary,model) {
  if(!model) return primary;
  const data={...primary,sources:{...primary.sources},timezone:model.timezone||primary.timezone};
  if(!data.hourly.length) {data.hourly=model.hourly;data.sources.hourly='openmeteo';}
  if(!data.daily.length) {data.daily=model.daily;data.sources.daily='openmeteo';}
  else if(['hko','smg'].includes(data.sources.daily)) {
    // HKO starts tomorrow; retain today's model range and mark each day's source.
    const today=model.daily.find(d=>d.time===model.observedAt.slice(0,10));
    if(today&&!data.daily.some(d=>d.time===today.time)) data.daily=[{...today,source:'openmeteo'},...data.daily].slice(0,7);
  }
  const today=data.daily.find(d=>d.time===model.observedAt.slice(0,10));
  data.min=data.min??today?.min??null;data.max=data.max??today?.max??null;
  return data;
}
