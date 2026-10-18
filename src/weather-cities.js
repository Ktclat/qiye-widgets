// SPDX-License-Identifier: GPL-3.0-only
import { cityKey } from './weather.js';

const KEY = 'qiye.weather.cities.v1';
export const CITY_LIMIT = 8;
export function validWeatherCity(city) {
  return city && typeof city.name === 'string' && city.name.trim().length > 0 && city.name.length <= 60
    && Number.isFinite(city.latitude) && Math.abs(city.latitude) <= 90
    && Number.isFinite(city.longitude) && Math.abs(city.longitude) <= 180;
}
export function weatherCityList(cities, current) {
  const seen = new Set();
  return [current, ...cities].filter(city => {
    if (!validWeatherCity(city) || seen.has(cityKey(city))) return false;
    seen.add(cityKey(city)); return true;
  }).slice(0, CITY_LIMIT).map(({name, latitude, longitude, countryCode}) => ({name, latitude, longitude,...(/^[A-Z]{2}$/.test(countryCode)?{countryCode}:{})}));
}
export function readWeatherCities() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? weatherCityList(raw, null) : [];
  } catch { return []; }
}
export function saveWeatherCities(cities) {
  localStorage.setItem(KEY, JSON.stringify(weatherCityList(cities, null)));
}
