// SPDX-License-Identifier: GPL-3.0-only
import { lunarEngine } from './lunar-engine.js';
import { getLocale, t } from './i18n.js';
import { localDateKey, parseDate } from './calendar.js';

// Keep vendor objects private: their locale tables are mutable and not part of our API.
const days = new Map(), years = new Map();
lunarEngine.I18n.setMessages('en', {'jr.chunJie':'Lunar New Year', 'yj.kaiGuang':'Consecration'});
function solarFor(date) {
  const language = getLocale() === 'en' ? 'en' : 'chs';
  if (lunarEngine.I18n.getLanguage() !== language) lunarEngine.I18n.setLanguage(language);
  return lunarEngine.Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function calendarAlmanac(date) {
  const key = `${getLocale()}:${localDateKey(date)}`;
  if (days.has(key)) return days.get(key);
  const solar = solarFor(date), lunar = solar.getLunar();
  const result = Object.freeze({
    festivals: Object.freeze([...solar.getFestivals(), ...lunar.getFestivals()].map(title => t(title))),
    term: lunar.getJieQi(), zodiac: lunar.getYearShengXiao(), constellation: solar.getXingZuo(),
    year: lunar.getYearInGanZhi(), lunarYear: lunar.getYearInChinese(),
    lunarMonth: lunar.getMonthInChinese(), lunarDay: lunar.getDayInChinese(),
    suitable: Object.freeze(lunar.getDayYi()), avoid: Object.freeze(lunar.getDayJi()),
    moon: lunar.getYueXiang(), season: getLocale() === 'en' ? lunar.getPrevJieQi(true).getName() : lunar.getWuHou(),
    directions: Object.freeze([lunar.getDayPositionXiDesc(), lunar.getDayPositionYangGuiDesc(),
      lunar.getDayPositionYinGuiDesc(), lunar.getDayPositionFuDesc(), lunar.getDayPositionCaiDesc()]),
  });
  if (days.size >= 512) days.delete(days.keys().next().value);
  days.set(key, result);
  return result;
}

export function festivalsForYear(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new RangeError('Invalid calendar year');
  const key = `${getLocale()}:${year}`;
  if (years.has(key)) return years.get(key);
  const entries = [];
  for (const date = new Date(year, 0, 1, 12); date.getFullYear() === year; date.setDate(date.getDate() + 1)) {
    const info = calendarAlmanac(date);
    for (const title of [...info.festivals, ...(info.term ? [info.term] : [])]) {
      entries.push(Object.freeze({date:localDateKey(date), title}));
    }
  }
  const result = Object.freeze(entries);
  if (years.size >= 6) years.delete(years.keys().next().value);
  years.set(key, result);
  return result;
}

export function addCalendarDays(value, amount) {
  const date = parseDate(value);
  if (!date || !Number.isInteger(amount) || Math.abs(amount) > 110000) return null;
  date.setDate(date.getDate() + amount);
  return parseDate(localDateKey(date)) ? date : null;
}
