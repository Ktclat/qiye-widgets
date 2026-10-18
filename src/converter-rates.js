// SPDX-License-Identifier: GPL-3.0-only
import { t, getLocale } from './i18n.js';
import { CURRENCY_CODES, calendarStamp } from './converter.js';

const CACHE_KEY = 'qiye.converter.rates.v1';
const ORIGIN = 'https://api.frankfurter.dev/*';
export const RATE_MAX_AGE = 86400000;

export function currencyName(code) {
  try { return new Intl.DisplayNames([getLocale()], {type:'currency'}).of(code); } catch { return code; }
}

export function validateRate(raw, base, quote) {
  if (!raw || raw.base !== base || raw.quote !== quote || !CURRENCY_CODES.includes(base) || !CURRENCY_CODES.includes(quote)
      || typeof raw.rate !== 'number' || !Number.isFinite(raw.rate) || raw.rate <= 0 || typeof raw.date !== 'string') throw new Error(t('汇率来源返回了无效数据。'));
  const stamp = calendarStamp(raw.date);
  if (stamp > Date.now() + RATE_MAX_AGE) throw new Error(t('汇率日期无效。'));
  return {base, quote, rate:raw.rate, date:raw.date};
}

export function readCachedRate(base, quote, storage = globalThis.localStorage) {
  if (base === quote) return {base, quote, rate:1, date:'', fetchedAt:Date.now(), identity:true};
  try {
    const raw = JSON.parse(storage.getItem(CACHE_KEY) || '{}')[`${base}/${quote}`];
    if (!raw || !Number.isFinite(raw.fetchedAt) || raw.fetchedAt > Date.now() + 60000 || raw.fetchedAt < 0) return null;
    return {...validateRate(raw, base, quote), fetchedAt:raw.fetchedAt};
  } catch { return null; }
}

export function cacheRate(rate, storage = globalThis.localStorage) {
  const record = {...rate, fetchedAt:Date.now()};
  try {
    const raw = JSON.parse(storage.getItem(CACHE_KEY) || '{}');
    const entries = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.entries(raw) : [];
    const recent = entries.filter(([key, value]) => key !== `${rate.base}/${rate.quote}` && Number.isFinite(value?.fetchedAt)).sort((a,b) => b[1].fetchedAt - a[1].fetchedAt).slice(0,63);
    storage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries([...recent, [`${rate.base}/${rate.quote}`, record]])));
  } catch { /* Conversion still works when browser storage is unavailable. */ }
  return record;
}

export function requestCurrencyPermission() {
  if (!globalThis.chrome?.runtime?.id) return Promise.resolve(true);
  // Call directly from the enable/refresh click, retaining the browser user gesture.
  return chrome.permissions.request({origins:[ORIGIN]});
}

export async function currencyPermissionGranted() {
  if (!globalThis.chrome?.runtime?.id) return true;
  return chrome.permissions.contains({origins:[ORIGIN]});
}

export async function fetchCurrencyRate(base, quote, signal) {
  if (!CURRENCY_CODES.includes(base) || !CURRENCY_CODES.includes(quote) || base === quote) throw new Error(t('换算单位设置无效。'));
  const response = await fetch(`https://api.frankfurter.dev/v2/rate/${base}/${quote}`, {signal, credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store', headers:{Accept:'application/json'}});
  if (!response.ok) throw new Error(t('汇率暂时不可用，请稍后重试。'));
  const text = await response.text();
  if (text.length > 16000) throw new Error(t('汇率来源返回了无效数据。'));
  return validateRate(JSON.parse(text), base, quote);
}
