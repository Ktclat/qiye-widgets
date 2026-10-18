import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE } from './fixtures/legacy-host.js';
import { parseDate, localDateKey } from '../src/calendar.js';
import { calendarAlmanac, festivalsForYear, addCalendarDays } from '../src/calendar-almanac.js';
import { dateToolResults, calendarGrid } from '../src/calendar-view.js';
import { newCalendarView } from '../src/calendar-controls.js';
import { setLocale } from '../src/i18n.js';

test('new desktop uses unmasked transparent icons and a wide Sunday-first calendar', () => {
  assert.equal(DEFAULT_STATE.settings.iconShape, 'original');
  assert.equal(DEFAULT_STATE.settings.iconBackdrop, 'none');
  const item = DEFAULT_STATE.items.find(item => item.widget === 'calendar');
  assert.equal(item.size, '4x2');
  assert.equal(item.config.weekStart, 0);
});

test('lunar details match the reference date and distinguish leap months', () => {
  setLocale('zh-CN');
  const day = calendarAlmanac(parseDate('2026-10-14'));
  assert.equal(day.lunarMonth, '九');
  assert.equal(day.lunarDay, '初五');
  assert.equal(day.zodiac, '马');
  assert.equal(day.constellation, '天秤');
  assert.deepEqual(day.avoid, ['开光', '栽种']);
  assert.match(calendarAlmanac(parseDate('2025-07-25')).lunarMonth, /闰六/);
});

test('annual festival list computes movable lunar festivals and all 24 solar terms', () => {
  setLocale('zh-CN');
  const entries = festivalsForYear(2026);
  assert.ok(entries.some(entry => entry.date === '2026-02-17' && entry.title === '春节'));
  assert.ok(entries.some(entry => entry.date === '2026-06-19' && entry.title === '端午节'));
  assert.ok(entries.some(entry => entry.date === '2026-09-25' && entry.title === '中秋节'));
  assert.ok(entries.some(entry => entry.date === '2026-10-23' && entry.title === '霜降'));
  assert.equal(entries.filter(entry => ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'].includes(entry.title)).length, 24);
  assert.throws(() => festivalsForYear(2201));
});

test('almanac cache isolates languages and English uses translated seasonal data', () => {
  setLocale('en');
  const day = calendarAlmanac(parseDate('2026-10-14'));
  assert.equal(day.constellation, 'Libra');
  assert.equal(day.zodiac, 'Horse');
  assert.doesNotMatch(JSON.stringify([day.suitable,day.avoid,day.season,day.directions]), /[\u3400-\u9fff]/);
  assert.ok(festivalsForYear(2026).some(entry => entry.title === 'Lunar New Year'));
  assert.doesNotMatch(JSON.stringify(festivalsForYear(2026)), /[\u3400-\u9fff]/);
  setLocale('zh-CN');
  assert.equal(calendarAlmanac(parseDate('2026-10-14')).zodiac, '马');
});

test('day offsets preserve civil dates across leap years, DST and range bounds', () => {
  assert.equal(localDateKey(addCalendarDays('2024-02-28',1)), '2024-02-29');
  assert.equal(localDateKey(addCalendarDays('2026-03-08',-1)), '2026-03-07');
  assert.equal(localDateKey(addCalendarDays('2026-12-31',1)), '2027-01-01');
  for (const [date, count] of [['2200-12-31',1],['1900-01-01',-1],['2026-01-01',1.5],['2026-02-30',1]]) assert.equal(addCalendarDays(date,count),null);
});

test('date difference and offset remain usable without an official workday schedule', () => {
  setLocale('zh-CN');
  const values = {...newCalendarView('2027-01-01').tools, end:'2027-01-10', offset:-1};
  const results = dateToolResults(values,'CN');
  assert.equal(results.difference,'9 天');
  assert.match(results.workdays,/2026/);
  assert.match(results.offset,/2026/);
  assert.equal(dateToolResults(newCalendarView('2026-10-14').tools, 'CN').workdays, '0 个工作日');
  assert.match(dateToolResults({...values,offset:''},'none').offset,/整数/);
});

test('weekend styles follow actual weekdays when Monday is the first column', () => {
  const html = calendarGrid(parseDate('2026-10-01'), {weekStart:1,showLunar:true,holidays:'CN'});
  assert.match(html, /class="calendar-cell weekend" data-calendar-date="2026-10-11"/);
  assert.match(html, /class="calendar-cell weekend workday" data-calendar-date="2026-10-10"/);
});
