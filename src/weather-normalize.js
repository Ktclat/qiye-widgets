// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
export const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function parseOpenMeteo(raw, now = Date.now()) {
  const c = raw?.current;
  if (numeric(c?.temperature_2m) === null || numeric(c?.weather_code) === null) throw new Error(t('天气服务返回的数据不完整'));
  const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value : '';
  const observedAt = timestamp(c.time);
  const daily = (Array.isArray(raw.daily?.time) ? raw.daily.time : []).slice(0,7).map((time, i) => ({time, code:numeric(raw.daily.weather_code?.[i]), min:numeric(raw.daily.temperature_2m_min?.[i]), max:numeric(raw.daily.temperature_2m_max?.[i]), rain:numeric(raw.daily.precipitation_probability_max?.[i]), sunrise:timestamp(raw.daily.sunrise?.[i]), sunset:timestamp(raw.daily.sunset?.[i]), uv:numeric(raw.daily.uv_index_max?.[i]), wind:numeric(raw.daily.wind_speed_10m_max?.[i])})).filter(day=>typeof day.time==='string' && /^\d{4}-\d{2}-\d{2}$/.test(day.time));
  const hourly = (Array.isArray(raw.hourly?.time) ? raw.hourly.time : []).map((time,i) => ({time:timestamp(time), temperature:numeric(raw.hourly.temperature_2m?.[i]), code:numeric(raw.hourly.weather_code?.[i]), isDay:raw.hourly.is_day?.[i] !== 0, rain:numeric(raw.hourly.precipitation_probability?.[i]), wind:numeric(raw.hourly.wind_speed_10m?.[i])})).filter(hour => hour.time && hour.time >= observedAt.slice(0,13)).slice(0,24);
  return {fetchedAt:now, temperature:c.temperature_2m, feelsLike:numeric(c.apparent_temperature), humidity:numeric(c.relative_humidity_2m), wind:numeric(c.wind_speed_10m), pressure:numeric(c.surface_pressure), precipitation:numeric(c.precipitation), code:c.weather_code, isDay:c.is_day !== 0, min:daily[0]?.min ?? null, max:daily[0]?.max ?? null, observedAt, timezone:typeof raw.timezone === 'string' ? raw.timezone : '', daily, hourly, air:null};
}
