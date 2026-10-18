import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHko, parseSmg, parseCwa, parseQweather, smgCode, supplementForecast } from '../src/weather-providers.js';
import { localWeatherCities, weatherRegion } from '../src/weather-regions.js';
import { weatherSourcePlan, weatherSourceProblem, validateWeatherCredentials, saveWeatherCredentials, readWeatherCredentials } from '../src/weather-sources.js';
import { requestWeather, weatherState, weatherKey, parseWeatherResponse } from '../src/weather.js';
import { validateWidgetConfig } from '../src/widget-registry.js';
import { weatherSettings, weatherCityCards } from '../src/weather-view.js';

const hk={name:'香港',latitude:22.32,longitude:114.17},mo={name:'澳门',latitude:22.1987,longitude:113.5439},tw={name:'台北',latitude:25.033,longitude:121.5654,countryCode:'TW'};
const emptyKeys={qweatherHost:'',qweatherKey:'',cwaKey:'',revision:0};
const keys={qweatherHost:'example.xy.qweatherapi.com',qweatherKey:'test-qw-key',cwaKey:'test-cwa-key',revision:0};
const hko={temperature:{recordTime:'2026-10-15T20:00:00+08:00',data:[{place:'Hong Kong Observatory',value:27},{place:"King's Park",value:26},{place:'Sha Tin',value:24}]},humidity:{data:[{value:75}]},icon:[77]};
const model={current:{temperature_2m:25,weather_code:0,time:'2026-10-15T20:00'},daily:{time:['2026-10-15'],temperature_2m_min:[22],temperature_2m_max:[28]},hourly:{time:['2026-10-15T20:00'],temperature_2m:[25],weather_code:[0]},timezone:'Asia/Hong_Kong'};

test('automatic routing distinguishes Hong Kong/Macao from neighbouring mainland cities and accepts Taiwan islands',()=>{
  assert.equal(weatherRegion(hk),'HK');assert.equal(weatherRegion(mo),'MO');assert.equal(weatherRegion(tw),'TW');
  assert.equal(weatherRegion({latitude:22.54,longitude:114.06}),'CN');
  assert.equal(weatherRegion({latitude:22.27,longitude:113.58}),'CN');
  assert.deepEqual(weatherSourcePlan(hk,{},emptyKeys),['hko','openmeteo']);
  assert.deepEqual(weatherSourcePlan(mo,{},emptyKeys),['smg','openmeteo']);
  assert.deepEqual(weatherSourcePlan(tw,{},keys),['cwa','qweather','openmeteo']);
  assert.deepEqual(weatherSourcePlan(localWeatherCities('金門')[0],{},keys),['cwa','qweather','openmeteo']);
  assert.deepEqual(weatherSourcePlan({latitude:39.9,longitude:116.4},{},keys),['qweather','openmeteo']);
  assert.deepEqual(weatherSourcePlan(tw,{},emptyKeys),['openmeteo']);
  assert.match(weatherSourceProblem('hko',tw,keys),/不覆盖/);
});
test('local city search understands simplified, traditional and English aliases',()=>{
  for(const [a,b] of [['澳门','澳門'],['台北','臺北'],['台北','Taipei'],['台南','臺南'],['广州','廣州']]) {
    assert.equal(localWeatherCities(a)[0].latitude,localWeatherCities(b)[0].latitude);
  }
  assert.equal(localWeatherCities('Macau')[0].countryCode,'MO');
});
test('HKO chooses the nearest reporting station, uses night icons and does not fabricate precipitation probabilities',()=>{
  const result=parseHko(hko,{weatherForecast:[{forecastDate:'20261016',forecastMaxtemp:{value:30},forecastMintemp:{value:26},ForecastIcon:51,PSR:'Low'}]},hk);
  assert.equal(result.temperature,26);assert.equal(result.isDay,false);assert.equal(result.pressure,null);assert.equal(result.precipitation,null);
  assert.equal(result.daily[0].rain,null);assert.equal(result.daily[0].rainText,'Low');
  const shatin=parseHko(hko,null,{latitude:22.4,longitude:114.2});assert.equal(shatin.temperature,24);
  assert.throws(()=>parseHko({temperature:{data:[]}},null,hk));
});
test('SMG distinguishes observation/day extrema, daily rain, rain vs snow and official daily forecasts',()=>{
  const xml='<ActualWeatherBrief><ValidFor>2026-10-15 20:00</ValidFor><Temperature><Type>8</Type><Value>29</Value></Temperature><Temperature><Type>9</Type><Value>25</Value></Temperature><Temperature><Type>3</Type><Value>26</Value></Temperature><Rainfall><Type>5</Type><Value>0.0</Value></Rainfall><WeatherStatus>a2</WeatherStatus></ActualWeatherBrief>';
  const forecast='<WeatherForecast><ValidFor>2026-10-16</ValidFor><Temperature><Type>1</Type><Value>30</Value></Temperature><Temperature><Type>2</Type><Value>25</Value></Temperature><WeatherStatus>28</WeatherStatus></WeatherForecast>';
  const data=parseSmg(xml,mo,forecast);
  assert.equal(data.temperature,26);assert.equal(data.max,29);assert.equal(data.min,25);assert.equal(data.isDay,false);assert.equal(data.precipitation,0);assert.equal(data.precipitationPeriod,'day');
  assert.equal(data.daily[0].max,30);assert.equal(data.sources.daily,'smg');assert.equal(smgCode('14'),71);assert.equal(smgCode('18'),95);assert.equal(smgCode('c8'),61);
  assert.throws(()=>parseSmg('<html>error</html>',mo));
});
test('CWA selects a WGS84 station, converts m/s, and rejects missing sentinels and distant observations',()=>{
  const station=(lat,temp)=>({StationName:'臺北',GeoInfo:{Coordinates:[{CoordinateName:'WGS84',StationLatitude:lat,StationLongitude:121.56}]},ObsTime:{DateTime:'2026-10-15T20:00:00+08:00'},WeatherElement:{AirTemperature:temp,RelativeHumidity:80,WindSpeed:2,AirPressure:-99,Weather:'多雲',Now:{Precipitation:0}}});
  const data=parseCwa({records:{Station:[station(25.033,-99),station(25.04,26)]}},tw);
  assert.equal(data.temperature,26);assert.equal(data.wind,7.2);assert.equal(data.humidity,80);assert.equal(data.pressure,null);assert.equal(data.precipitation,0);
  assert.throws(()=>parseCwa({records:{Station:[station(25,-99)]}},tw));
  assert.throws(()=>parseCwa({records:{Station:[station(20,26)]}},tw));
});
test('QWeather v1 converts fractions and units without inventing an observation timestamp',()=>{
  const data=parseQweather({temperature:{value:26},humidity:.75,wind:{speed:{value:2,unit:'m/s'}},condition:{code:'150',text:'晴'}},
    {days:[{forecastStartTime:'2026-10-15T07:00+08:00',temperatureMax:{value:29},temperatureMin:{value:24},daytime:{condition:{code:'101'},precipitation:{probability:0}},nighttime:{precipitation:{probability:.5}}}]},
    {hours:[{forecastTime:'2026-10-15T20:00+08:00',temperature:{value:26},condition:{code:'150'},precipitation:{probability:.25}}]},hk);
  assert.equal(data.humidity,75);assert.equal(data.wind,7.2);assert.equal(data.observedAt,'');assert.equal(data.hourly[0].rain,25);assert.equal(data.daily[0].rain,50);assert.equal(data.timezone,'UTC+08:00');assert.equal(data.isDay,false);
  assert.throws(()=>parseQweather({},null,null,hk));
});
test('supplemental model forecasts never replace regional current observations or invent missing local readings',()=>{
  const primary=parseHko(hko,{weatherForecast:[{forecastDate:'20261016',forecastMaxtemp:{value:30},forecastMintemp:{value:26},ForecastIcon:51}]},hk);
  const data=supplementForecast(primary,parseWeatherResponse(model));
  assert.equal(data.temperature,26);assert.equal(data.pressure,null);assert.equal(data.hourly[0].temperature,25);
  assert.equal(data.daily[0].source,'openmeteo');assert.equal(data.daily[1].source,'hko');assert.equal(data.sources.current,'hko');assert.equal(data.sources.daily,'hko');assert.equal(data.sources.hourly,'openmeteo');
});
test('legacy weather configs migrate without discarding choices; invalid sources are rejected',()=>{
  const old={city:hk,enabled:true,unit:'celsius'};
  assert.equal(validateWidgetConfig('weather',old).source,'auto');assert.equal(validateWidgetConfig('weather',old).fallback,true);
  assert.throws(()=>validateWidgetConfig('weather',{...old,source:'untrusted'}));
  assert.throws(()=>validateWidgetConfig('weather',{...old,qweatherKey:'secret'}));
  assert.equal(validateWidgetConfig('weather',{...old,city:tw,source:'cwa'}).city.countryCode,'TW');
});
test('credentials accept only QWeather hosts, stay outside widget settings markup and invalidate weather identity on change',()=>{
  const original=globalThis.localStorage,store=new Map();
  globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
  try {
    for(const host of ['evil.com','qweatherapi.com.evil.com','localhost','https://x.qweatherapi.com/private','x.qweatherapi.com:443','user@x.qweatherapi.com']) assert.throws(()=>validateWeatherCredentials({...keys,qweatherHost:host}));
    const before=weatherKey(hk);saveWeatherCredentials(keys);assert.notEqual(weatherKey(hk),before);assert.equal(readWeatherCredentials().qweatherKey,'test-qw-key');
    const markup=weatherSettings({title:'天气',config:{city:hk,source:'qweather',enabled:true,unit:'celsius'}});
    assert.ok(!markup.includes('test-qw-key'));assert.ok(!markup.includes('test-cwa-key'));
    const after=weatherKey(hk);saveWeatherCredentials(keys);assert.equal(weatherKey(hk),after);
    saveWeatherCredentials(emptyKeys);assert.equal(readWeatherCredentials().qweatherKey,'');
  } finally {if(original)globalThis.localStorage=original;else delete globalThis.localStorage;}
});
test('source failures fall back once; strict sources, caches and requests stay isolated',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async url=>{
    calls.push(url);
    if(url.includes('air-quality')) throw new TypeError('offline');
    if(url.includes('weather.gov.hk')) throw new TypeError('offline');
    return new Response(JSON.stringify(model));
  };
  const city={...hk,latitude:22.3211};
  try {
    await Promise.all([requestWeather(city,true,{source:'hko'}),requestWeather(city,true,{source:'hko'})]);
    assert.equal(calls.filter(u=>u.includes('/v1/forecast')).length,1);
    assert.equal(weatherState(city,{source:'hko'}).data.sources.current,'openmeteo');
    assert.match(weatherState(city,{source:'hko'}).data.notice,/切换/);
    assert.equal(weatherState(city,{source:'openmeteo'}).data,null);
    await requestWeather(city,true,{source:'hko',fallback:false});
    assert.equal(weatherState(city,{source:'hko',fallback:false}).status,'error');
    assert.equal(weatherState(city,{source:'hko',fallback:false}).data,null);
    globalThis.fetch=async()=>{throw new TypeError('offline');};
    await requestWeather(city,true,{source:'hko'});assert.equal(weatherState(city,{source:'hko'}).status,'error');assert.equal(weatherState(city,{source:'hko'}).data.temperature,25);
  } finally {globalThis.fetch=original;}
});
test('city cards escape upstream condition text and visibly include high/low values',()=>{
  const city={...hk,latitude:22.3222},config={city,source:'openmeteo',enabled:true,unit:'celsius'};
  const state=weatherState(city,config);state.data={...parseWeatherResponse(model),sources:{current:'openmeteo'},description:'<img onerror=alert(1)>'};
  const html=weatherCityCards({config},[city]);assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.match(html,/最高28°/);assert.match(html,/最低22°/);
});
