import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWeatherResponse, temperature } from '../src/weather.js';
import { forecastPlot } from '../src/weather-chart.js';
import { weatherCityList, validWeatherCity, CITY_LIMIT } from '../src/weather-cities.js';

test('hourly forecast includes the current partial hour and preserves missing measurements', () => {
  const data = parseWeatherResponse({current:{temperature_2m:27,weather_code:2,time:'2026-10-14T20:45',surface_pressure:999,precipitation:0},
    hourly:{time:['2026-10-14T19:00','2026-10-14T20:00','2026-10-14T21:00'],temperature_2m:[29,27,null],wind_speed_10m:[3,0,null]},
    daily:{time:['2026-10-14'],wind_speed_10m_max:[12]}});
  assert.equal(data.hourly[0].time,'2026-10-14T20:00');
  assert.equal(data.hourly[0].wind,0);
  assert.equal(data.hourly[1].temperature,null);
  assert.equal(data.hourly[1].wind,null);
  assert.equal(data.pressure,999);
  assert.equal(data.precipitation,0);
  assert.equal(data.daily[0].wind,12);
});

test('forecast curves use a shared high/low scale and do not bridge missing data', () => {
  const [high,low] = forecastPlot([{values:[30,33,null,29]},{values:[25,25,25,25]}],4);
  assert.ok(high.points[0].y < low.points[0].y);
  assert.equal((high.path.match(/M/g)||[]).length,2);
  assert.equal((high.path.match(/L/g)||[]).length,1);
  assert.ok(!/NaN|Infinity|null/.test(high.path));
  const [flat] = forecastPlot([{values:[0,0,0]}],3);
  assert.ok(flat.points.every(point=>point.y===50));
  assert.equal(temperature(0,'fahrenheit'),'32°');
  assert.equal(temperature(null,'fahrenheit'),'—');
});

test('city list deduplicates coordinates, caps entries and rejects corrupt local data', () => {
  const current = {name:'Hong Kong',latitude:22.32,longitude:114.17};
  const other = Array.from({length:12},(_,i)=>({name:`City ${i}`,latitude:i,longitude:i}));
  const list = weatherCityList([{...current,name:'Duplicate'},null,{name:'Bad',latitude:200,longitude:0},...other],current);
  assert.equal(list.length,CITY_LIMIT);
  assert.deepEqual(list[0],current);
  assert.equal(list.filter(city=>city.latitude===22.32).length,1);
  assert.equal(validWeatherCity({name:'',latitude:0,longitude:0}),false);
  assert.equal(validWeatherCity({name:'City',latitude:NaN,longitude:0}),false);
});
