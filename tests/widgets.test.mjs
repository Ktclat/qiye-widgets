import { chineseLunarDate, localDateKey } from '../src/calendar.js';
import { parseWeatherResponse } from '../src/weather.js';
import { DEFAULT_STATE } from './fixtures/legacy-host.js';
import { newWidgetConfig } from '../src/widget-registry.js';
import { newWidgetData } from '../src/widget-data.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateExpression, daysUntil, escapeHtml, focusRemaining,
  habitStreak, renderWidget, widgetCatalog,
  workdayStatus,
} from '../src/widgets.js';

const baseState = structuredClone(DEFAULT_STATE);

test('calculator respects precedence, parentheses, unary signs, and postfix percentages', () => {
  for (const [source, expected] of [
    ['2+3*4', 14], ['(2+3)*4', 20], ['-(2+3)*4', -20], ['2*-3', -6],
    ['200 × 10%', 20], ['.5 + .25', .75], ['0.1+0.2', .3], ['12÷4−1', 2],
    ['2--3', 5], ['6/(1+2)', 2], ['(25+25)%', .5],
  ]) assert.equal(calculateExpression(source), expected, source);
});

test('calculator rejects code, incomplete arithmetic, deep nesting, and invalid numeric results', () => {
  for (const source of ['', 'alert(1)', 'globalThis.x=1', '1;2', '1/0', '1/(3-3)', '1+2)', '(1+2', '2**3', '1.2.3', '9'.repeat(257), '10/(0.01' + '%'.repeat(154) + ')', '('.repeat(49) + '1' + ')'.repeat(49)]) {
    assert.throws(() => calculateExpression(source), Error, source);
  }
  assert.throws(() => calculateExpression('1/0'), /不能除以 0/);
});

test('countdown uses calendar dates, including leap years, instead of elapsed 24-hour intervals', () => {
  assert.equal(daysUntil('2027-01-01', new Date(2026, 11, 31, 23, 59, 59)), 1);
  assert.equal(daysUntil('2026-10-11', new Date(2026, 9, 11, 0, 0, 1)), 0);
  assert.equal(daysUntil('2026-10-10', new Date(2026, 9, 11, 12)), -1);
  assert.equal(daysUntil('2024-03-01', new Date(2024, 1, 28, 20)), 2);
  assert.equal(daysUntil('2025-02-29', new Date(2025, 1, 28)), null);
  assert.equal(daysUntil('2026-13-01', new Date(2026, 9, 11)), null);
  assert.equal(daysUntil('<script>', new Date(2026, 9, 11)), null);
  assert.equal(localDateKey(new Date(2026, 0, 3, 23)), '2026-01-03');
});

test('Chinese lunar calendar uses Intl and renders lunar new year correctly', () => {
  assert.match(chineseLunarDate(new Date(2026, 1, 17, 12)), /正月初一/);
  assert.match(chineseLunarDate(new Date(2025, 0, 29, 12)), /正月初一/);
});

test('focus timer resumes from persisted endAt and accounts for suspended tabs', () => {
  const now = 1_800_000_000_000;
  assert.equal(focusRemaining({ running: true, remaining: 1500, endAt: now + 90_001 }, now), 91);
  assert.equal(focusRemaining({ running: true, remaining: 1500, endAt: now + 90_001 }, now + 75_000), 16);
  assert.equal(focusRemaining({ running: true, remaining: 1500, endAt: now - 5000 }, now), 0);
  assert.equal(focusRemaining({ running: false, remaining: 725, endAt: null }, now), 725);
  assert.equal(focusRemaining({ running: false, remaining: -4, endAt: null }, now), 0);
});

test('work countdown handles the exact finishing instant and configured days off', () => {
  const config = { endTime: '18:00', payday: 10, workdays: [1, 2, 3, 4, 5] };
  assert.equal(workdayStatus(config, new Date(2026, 9, 14, 17, 59, 58)).text, '00:00:02');
  assert.equal(workdayStatus(config, new Date(2026, 9, 14, 18, 0, 0)).text, '已下班');
  assert.equal(workdayStatus(config, new Date(2026, 9, 11, 17, 0)).text, '休息日');
  assert.equal(workdayStatus({ ...config, workdays: [0] }, new Date(2026, 9, 11, 17, 0)).text, '01:00:00');
  assert.equal(workdayStatus({ ...config, workdays: [] }, new Date(2026, 9, 14, 17, 0)).text, '休息日');
});

test('payday clamps the 31st to the actual last day of each month', () => {
  const config = { endTime: '18:00', payday: 31, workdays: [1, 2, 3, 4, 5] };
  assert.equal(workdayStatus(config, new Date(2026, 1, 27, 12)).paydays, 1);
  assert.equal(workdayStatus(config, new Date(2026, 1, 28, 12)).paydays, 0);
  assert.equal(workdayStatus(config, new Date(2026, 2, 1, 12)).paydays, 30);
  assert.equal(workdayStatus({ ...config, payday: 1 }, new Date(2026, 11, 31, 12)).paydays, 1);
});

test('habit streak allows today to remain unchecked and stops at the first missed day', () => {
  const now = new Date(2026, 9, 11, 12);
  assert.equal(habitStreak(['2026-10-09', '2026-10-10'], now), 2);
  assert.equal(habitStreak(['2026-10-09', '2026-10-10', '2026-10-11'], now), 3);
  assert.equal(habitStreak(['2026-10-08', '2026-10-11', '2026-10-12'], now), 1);
  assert.equal(habitStreak(['2026-10-09'], now), 0);
  assert.equal(habitStreak(['2026-10-10', '2026-10-10'], now), 1);
  assert.equal(habitStreak([], now), 0);
});

test('weather data keeps missing optional measurements unknown and rejects absent current observations', () => {
  const parsed = parseWeatherResponse({ current: { temperature_2m: 27.4, weather_code: 2, is_day: 0, time: '2026-10-11T22:00' } }, 12345);
  assert.deepEqual(parsed, { fetchedAt: 12345, temperature: 27.4, feelsLike: null, humidity: null, code: 2, isDay: false, max: null, min: null, observedAt: '2026-10-11T22:00', wind:null, pressure:null, precipitation:null, timezone:'', daily:[], hourly:[], air:null });
  for (const raw of [null, {}, { current: {} }, { current: { temperature_2m: '27', weather_code: 2 } }, { current: { temperature_2m: null, weather_code: 2 } }, { current: { temperature_2m: 20, weather_code: NaN } }]) assert.throws(() => parseWeatherResponse(raw), /数据不完整/);
});

test('all catalog widgets render offline without requesting external services', () => {
  assert.ok(widgetCatalog.some(widget => widget.type === 'converter'));
  assert.ok(!widgetCatalog.some(widget => widget.type === 'base-converter'));
  assert.ok(widgetCatalog.some(entry => entry.type === 'bookmarks'));
  assert.ok(widgetCatalog.some(entry => entry.type === 'pomodoro'));
  const originalFetch = globalThis.fetch;
  let requested = false;
  globalThis.fetch = () => { requested = true; throw new Error('unexpected network request'); };
  try {
    for (const entry of widgetCatalog) {
      const html = renderWidget({ id: `test-${entry.type}`, widget: entry.type, config: newWidgetConfig(entry.type), data: newWidgetData(entry.type) }, baseState);
      assert.ok(html.includes(`data-widget="${entry.type}"`), entry.type);
      assert.ok(html.startsWith('<div class="widget-inner '), entry.type);
      assert.ok(!html.includes('undefined'), entry.type);
    }
    assert.equal(requested, false);
    const weather = renderWidget({ id: 'weather', widget: 'weather', config: newWidgetConfig('weather') }, baseState);
    assert.match(weather, /启用天气/);
    assert.doesNotMatch(weather, /\d+<sup>°/);
    const wallpaper = renderWidget({ id: 'wallpaper', widget: 'wallpaper', config: {} }, baseState);
    assert.match(wallpaper, /打开壁纸中心/);
    assert.doesNotMatch(wallpaper, /<img[^>]+src=/);
    const hotlinks = renderWidget({ id: 'hot', widget: 'hotlinks', config: {} }, baseState);
    assert.match(hotlinks, /快捷入口/);
    assert.match(hotlinks, /noopener noreferrer/);
    assert.match(hotlinks, /github\.com\/trending/);
  } finally { globalThis.fetch = originalFetch; }
});

test('user-controlled strings cannot break textarea, HTML, or attribute boundaries', () => {
  const payload = '</textarea><img src=x onerror="alert(1)"><script>alert(1)</script>';
  assert.equal(escapeHtml('<&"\''), '&lt;&amp;&quot;&#39;');
  const data = { notes: payload, todos: [{ id: 'todo-1', text: payload, done: false }], habits: [{ id: 'habit-1', name: payload, dates: [] }] };
  for (const widget of ['notes', 'todo', 'habit', 'countdown', 'quote', 'clock']) {
    const html = renderWidget({ id: 'x" onclick="alert(1)', widget, data, config: { ...newWidgetConfig(widget), title: payload, text: payload, author: payload, label: payload } }, baseState);
    assert.doesNotMatch(html, /<script|<img|onclick="alert/);
    assert.match(html, /&lt;/);
    assert.match(html, /data-widget-id="x&quot; onclick=&quot;alert\(1\)"/);
  }
});
