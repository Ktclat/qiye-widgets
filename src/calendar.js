// SPDX-License-Identifier: GPL-3.0-only
import { t, getLocale, formatDate } from './i18n.js';

export const DAY = 86400000;
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  return y >= 1900 && y <= 2200 && localDateKey(date) === value ? date : null;
}
export function dayStamp(date) { return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()); }
export function daysBetween(start, end) { return Math.round((dayStamp(end) - dayStamp(start)) / DAY); }
export function dateStats(date) {
  const thursday = new Date(dayStamp(date));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const isoYear = thursday.getUTCFullYear();
  return { day: daysBetween(new Date(date.getFullYear(), 0, 1), date) + 1, week: Math.ceil(((thursday - Date.UTC(isoYear, 0, 1)) / DAY + 1) / 7), isoYear };
}
const lunarDays = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
export function chineseLunarDate(date = new Date(), compact = false) {
  const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {month:'long',day:'numeric'}).formatToParts(date);
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = Number(parts.find(p => p.type === 'day')?.value);
  if (getLocale() === 'en') return new Intl.DateTimeFormat('en-u-ca-chinese', {month:'short',day:'numeric'}).format(date);
  return compact && day !== 1 ? lunarDays[day - 1] : month + lunarDays[day - 1];
}
// PRC State Council 2026 notice: see docs/WIDGETS.md for the official source.
const holidayRanges = [
  ['2026-01-01','2026-01-03','元旦'], ['2026-02-15','2026-02-23','春节'],
  ['2026-04-04','2026-04-06','清明节'], ['2026-05-01','2026-05-05','劳动节'],
  ['2026-06-19','2026-06-21','端午节'], ['2026-09-25','2026-09-27','中秋节'], ['2026-10-01','2026-10-07','国庆节'],
];
const workdays = new Set(['2026-01-04','2026-02-14','2026-02-28','2026-05-09','2026-09-20','2026-10-10']);
export function holidayFor(date, region = 'none') {
  if (region !== 'CN' || date.getFullYear() !== 2026) return null;
  const key = localDateKey(date);
  if (workdays.has(key)) return { work: true, label: t('调休上班') };
  const range = holidayRanges.find(([start, end]) => key >= start && key <= end);
  return range ? { work: false, label: t(range[2]) } : null;
}
export function countWorkdays(start, end, region = 'none') {
  if (daysBetween(start, end) < 0) throw new Error(t('结束日期不能早于开始日期'));
  if (region === 'CN' && (start.getFullYear() !== 2026 || end.getFullYear() !== 2026)) throw new Error(t('中国调休数据目前仅覆盖 2026 年'));
  let count = 0;
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const holiday = holidayFor(day, region);
    if (holiday ? holiday.work : day.getDay() !== 0 && day.getDay() !== 6) count++;
  }
  return count;
}
export function monthCells(month, config, today = new Date()) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const offset = (first.getDay() - config.weekStart + 7) % 7;
  return Array.from({length:42}, (_, index) => {
    const date = new Date(first.getFullYear(), first.getMonth(), 1 - offset + index, 12);
    return {date, key:localDateKey(date), outside:date.getMonth() !== month.getMonth(), today:localDateKey(date) === localDateKey(today), holiday:holidayFor(date, config.holidays)};
  });
}
export function weekdayLabels(weekStart = 1) {
  return Array.from({length:7}, (_, i) => formatDate(new Date(2026, 5, 7 + (i + weekStart) % 7), {weekday:'short'}));
}
