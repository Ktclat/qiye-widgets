import test from 'node:test';
import assert from 'node:assert/strict';
import { POMODORO_DEFAULTS, newPomodoroData, validatePomodoroData, validatePomodoroConfig, pomodoroRemaining, settlePomodoro, changePomodoro, configurePomodoro, pomodoroToday } from '../src/pomodoro.js';
import { savePomodoroChange } from '../src/pomodoro-runtime.js';
import { newWidgetConfig, listWidgetDefinitions } from '../src/widget-registry.js';
import { newWidgetData } from '../src/widget-data.js';
import { DEFAULT_STATE, validateImport } from './fixtures/legacy-host.js';
import { renderWidget } from '../src/widgets.js';
import { pomodoroWorkspace, readPomodoroDurations, readPomodoroSettings } from '../src/pomodoro-view.js';
import { setLocale } from '../src/i18n.js';

const config = POMODORO_DEFAULTS;
const now = new Date(2026, 9, 15, 10).getTime();
const item = () => ({ id: 'pomodoro-test', type: 'widget', widget: 'pomodoro', title: '番茄钟', groupId: 'home', size: '2x2', config: newWidgetConfig('pomodoro'), data: newWidgetData('pomodoro') });
const start = (data = newPomodoroData(), at = now) => changePomodoro(data, config, { type: 'toggle' }, at);
const complete = (data, c = config) => settlePomodoro(data, c, data.endAt);

test('new Pomodoro instances have independent state and round-trip through desktop backups', () => {
  assert.equal(listWidgetDefinitions().find(entry => entry.type === 'pomodoro').title, '番茄钟');
  const first = item(), second = item();
  first.data.task = 'Draft an outline';
  first.data.sessions.push({ completedAt: now, seconds: 1500, task: 'Read a chapter' });
  assert.equal(second.data.task, ''); assert.deepEqual(second.data.sessions, []);
  first.config.focusMinutes = 45; assert.equal(second.config.focusMinutes, 25);
  const state = structuredClone(DEFAULT_STATE); state.items.push(first);
  assert.deepEqual(validateImport(JSON.stringify(state)).items.find(entry => entry.id === first.id), first);
});

test('retired focus cards migrate without losing identity, placement, custom titles or timer progress', () => {
  assert.ok(!listWidgetDefinitions().some(entry => entry.type === 'focus'));
  assert.ok(!DEFAULT_STATE.items.some(entry => entry.widget === 'focus'));
  for (const running of [true, false]) {
    const legacy = { ...item(), widget: 'focus', title: 'My writing timer', size: '4x2', config: {}, data: { focus: { duration: 40, remaining: 930, running, endAt: running ? now + 930000 : null } } };
    const state = structuredClone(DEFAULT_STATE); state.items = [legacy];
    const migrated = validateImport(state).items[0];
    assert.equal(migrated.widget, 'pomodoro'); assert.equal(migrated.id, legacy.id);
    assert.equal(migrated.title, legacy.title); assert.equal(migrated.groupId, legacy.groupId); assert.equal(migrated.size, legacy.size);
    assert.equal(migrated.config.focusMinutes, 40); assert.equal(migrated.data.duration, 2400);
    assert.equal(migrated.data.remaining, 930); assert.equal(migrated.data.status, running ? 'running' : 'paused');
    assert.equal(migrated.data.endAt, legacy.data.focus.endAt);
    assert.deepEqual(validateImport(validateImport(state)).items[0], migrated);
  }
});

test('legacy completion is reconciled once and stopped timers never invent history', () => {
  const state = structuredClone(DEFAULT_STATE);
  state.items = [{ ...item(), widget: 'focus', title: '专注计时', config: {}, data: { focus: { duration: 25, remaining: 1500, running: true, endAt: now - 1000 } } }];
  const migrated = validateImport(state).items[0];
  assert.equal(migrated.title, '番茄钟');
  const completed = settlePomodoro(migrated.data, migrated.config, now);
  assert.equal(completed.sessions.length, 1); assert.equal(completed.sessions[0].completedAt, now - 1000);
  assert.strictEqual(settlePomodoro(completed, migrated.config, now + 86400000), completed);
  state.items[0].data.focus = { duration: 25, remaining: 0, running: false, endAt: null };
  const stopped = validateImport(state).items[0];
  assert.equal(stopped.data.status, 'idle'); assert.equal(stopped.data.remaining, 1500); assert.deepEqual(stopped.data.sessions, []);
  state.items[0].data.focus.running = true;
  assert.throws(() => validateImport(state), /结束时间/);
});

test('direct duration edits and advanced settings preserve each other', () => {
  const previous = { ...config, dailyGoal: 12, longBreakEvery: 6, sound: false };
  const durations = new FormData();
  for (const [key, value] of Object.entries({ focusMinutes: 42, shortBreakMinutes: 7, longBreakMinutes: 21 })) durations.set(key, value);
  const updated = validatePomodoroConfig(readPomodoroDurations(durations, previous));
  assert.deepEqual(updated, { ...previous, focusMinutes: 42, shortBreakMinutes: 7, longBreakMinutes: 21 });
  const advanced = new FormData(); advanced.set('dailyGoal', '10'); advanced.set('longBreakEvery', '5'); advanced.set('sound', 'on');
  assert.deepEqual(validatePomodoroConfig(readPomodoroSettings(advanced, updated)), { ...updated, dailyGoal: 10, longBreakEvery: 5, sound: true });
  durations.set('focusMinutes', ''); assert.throws(() => validatePomodoroConfig(readPomodoroDurations(durations, previous)));
});

test('wall-clock deadlines survive reload, suspension and a backwards clock adjustment', () => {
  const data = JSON.parse(JSON.stringify(start()));
  assert.equal(pomodoroRemaining(data, now + 61001), 1439);
  assert.equal(pomodoroRemaining(data, now - 10000), 1500);
  assert.equal(pomodoroRemaining(data, now + 1800000), 0);
  const resumed = settlePomodoro(data, config, now + 3 * 86400000);
  assert.equal(resumed.sessions.length, 1);
  assert.equal(resumed.sessions[0].completedAt, data.endAt);
  assert.equal(resumed.phase, 'short'); assert.equal(resumed.status, 'idle');
  assert.strictEqual(settlePomodoro(resumed, config, now + 5 * 86400000), resumed);
});

test('pause freezes the remaining time and resume creates a fresh deadline', () => {
  const paused = changePomodoro(start(), config, { type: 'toggle' }, now + 90000);
  assert.equal(paused.remaining, 1410); assert.equal(paused.status, 'paused'); assert.equal(paused.endAt, null);
  assert.equal(pomodoroRemaining(paused, now + 86400000), 1410);
  const running = changePomodoro(paused, config, { type: 'toggle' }, now + 3600000);
  assert.equal(running.endAt, now + 3600000 + 1410000);
  assert.equal(complete(running).sessions[0].seconds, 1500);
});

test('four completed focus rounds earn a long break, which starts a new cycle', () => {
  let data = newPomodoroData(), time = now;
  for (let round = 1; round <= 4; round++) {
    data = complete(start(data, time)); time += 1500000;
    assert.equal(data.cycle, round); assert.equal(data.sessions.length, round);
    assert.equal(data.phase, round === 4 ? 'long' : 'short'); assert.equal(data.status, 'idle');
    data = complete(start(data, time)); time += round === 4 ? 900000 : 300000;
    assert.equal(data.phase, 'focus'); assert.equal(data.cycle, round === 4 ? 0 : round);
    assert.equal(data.sessions.length, round);
  }
});

test('reset, skip and manual rest never manufacture a completed tomato', () => {
  const running = start();
  const reset = changePomodoro(running, config, { type: 'reset' }, now + 20000);
  assert.equal(reset.remaining, 1500); assert.equal(reset.status, 'idle');
  const skipped = changePomodoro(running, config, { type: 'skip' }, now + 20000);
  assert.equal(skipped.phase, 'short'); assert.equal(skipped.cycle, 0); assert.deepEqual(skipped.sessions, []);
  const rest = changePomodoro(newPomodoroData(), config, { type: 'phase', phase: 'long' }, now);
  assert.equal(complete(start(rest)).cycle, 0); assert.deepEqual(complete(start(rest)).sessions, []);
});

test('phase and task stay locked during a running or paused round', () => {
  for (const data of [start(), changePomodoro(start(), config, { type: 'toggle' }, now + 10000)]) {
    assert.strictEqual(changePomodoro(data, config, { type: 'phase', phase: 'short' }, now + 11000), data);
    assert.strictEqual(changePomodoro(data, config, { type: 'task', task: 'Changed' }, now + 11000), data);
  }
});

test('a click at the exact deadline completes once without starting the following break', () => {
  const data = start();
  for (const type of ['toggle', 'reset', 'skip', 'phase']) {
    const next = changePomodoro(data, config, { type, phase: 'long' }, data.endAt);
    assert.equal(next.sessions.length, 1); assert.equal(next.status, 'idle'); assert.equal(next.phase, 'short');
  }
});

test('settings changes preserve the current round and apply to the next phase', () => {
  const running = start(), changed = { ...config, focusMinutes: 50, shortBreakMinutes: 10 };
  assert.strictEqual(configurePomodoro(running, changed), running);
  const next = complete(running, changed);
  assert.equal(next.remaining, 600); assert.equal(next.sessions[0].seconds, 1500);
  assert.equal(configurePomodoro(newPomodoroData(), changed).remaining, 3000);
});

test('completed tasks are snapshots and daily totals use the local completion day', () => {
  const beforeMidnight = new Date(2026, 9, 14, 23, 50).getTime();
  let data = changePomodoro(newPomodoroData(), config, { type: 'task', task: 'Read a chapter' }, beforeMidnight);
  data = complete(start(data, beforeMidnight));
  assert.equal(pomodoroToday(data, beforeMidnight).count, 0);
  assert.equal(pomodoroToday(data, now).count, 1); assert.equal(pomodoroToday(data, now).minutes, 25);
  data = changePomodoro(data, config, { type: 'task', task: 'Next task' }, now);
  assert.equal(data.sessions[0].task, 'Read a chapter');
  assert.equal(pomodoroToday(data, new Date(2026, 9, 16, 0, 1).getTime()).count, 0);
});

test('malformed state, excessive configuration and duplicated sessions are rejected', () => {
  for (const change of [{ status: 'running' }, { endAt: now }, { remaining: 0 }, { remaining: 1501 }, { remaining: 3 }, { cycle: 13 }, { phase: 'unknown' }, { task: 'x'.repeat(121) }]) {
    assert.throws(() => validatePomodoroData({ ...newPomodoroData(), ...change }));
  }
  const session = { completedAt: now, seconds: 1500, task: '' };
  assert.throws(() => validatePomodoroData({ ...newPomodoroData(), sessions: [session, session] }));
  for (const change of [{ focusMinutes: 0 }, { shortBreakMinutes: 61 }, { longBreakMinutes: 121 }, { longBreakEvery: 1 }, { dailyGoal: 25 }, { sound: 'true' }, { focusMinutes: 1.5 }]) assert.throws(() => validatePomodoroConfig({ ...config, ...change }));
  assert.deepEqual(validatePomodoroData(newPomodoroData()), newPomodoroData());
});

test('save failure rolls back both timer and settings and allows an explicit retry', async () => {
  const current = item(), state = { items: [current] }, initial = structuredClone(current);
  let fails = true;
  const host = { getState: () => state, save: async () => { if (fails) throw new Error('quota'); } };
  const transform = entry => ({ config: { ...entry.config, dailyGoal: 4 }, data: start(entry.data) });
  assert.equal(await savePomodoroChange(host, current.id, transform), false);
  assert.deepEqual(current, initial);
  fails = false;
  assert.equal(await savePomodoroChange(host, current.id, transform), true);
  assert.equal(current.data.status, 'running'); assert.equal(current.config.dailyGoal, 4);
});

test('simultaneous card and detail completion share a lock and persist just once', async () => {
  const current = item(); current.data = start();
  const state = { items: [current] }; let writes = 0, release;
  const host = { getState: () => state, save: () => { writes++; return new Promise(resolve => { release = resolve; }); } };
  const transform = entry => ({ config: entry.config, data: complete(entry.data) });
  const first = savePomodoroChange(host, current.id, transform, true);
  assert.equal(await savePomodoroChange(host, current.id, transform, true), false);
  assert.equal(writes, 1); assert.equal(current.data.sessions.length, 1);
  release(); await first;
});

test('rollback does not replace newer data supplied by an external state conflict', async () => {
  let state = { items: [item()] };
  const host = { getState: () => state, save: async () => { state = { items: [{ ...item(), data: { ...newPomodoroData(), task: 'From another tab' } }] }; throw new Error('conflict'); } };
  await savePomodoroChange(host, 'pomodoro-test', entry => ({ config: entry.config, data: start(entry.data) }));
  assert.equal(state.items[0].data.task, 'From another tab');
});

test('failed automatic completion stops retrying until an explicit action succeeds', async () => {
  const current = item(); current.data = start();
  let writes = 0, fails = true;
  const host = { getState: () => ({ items: [current] }), save: async () => { writes++; if (fails) throw new Error('quota'); } };
  const transform = entry => ({ config: entry.config, data: complete(entry.data) });
  assert.equal(await savePomodoroChange(host, current.id, transform, true), false);
  assert.equal(await savePomodoroChange(host, current.id, transform, true), false);
  assert.equal(writes, 1); assert.equal(current.data.status, 'running');
  fails = false;
  assert.equal(await savePomodoroChange(host, current.id, transform), true);
  assert.equal(writes, 2); assert.equal(current.data.sessions.length, 1);
});

test('a completion already saved by another tab is not marked as a failed pending save', async () => {
  const current = item(); current.data = start(newPomodoroData(), Date.now() - 1800000);
  const completed = complete(current.data);
  let state = { items: [current] };
  const host = { getState: () => state, save: async () => { state = { items: [{ ...current, data: completed }] }; throw new Error('conflict'); } };
  const transform = entry => ({ config: entry.config, data: settlePomodoro(entry.data, entry.config) });
  assert.equal(await savePomodoroChange(host, current.id, transform, true), false);
  assert.equal(await savePomodoroChange(host, current.id, transform, true), true);
  assert.equal(state.items[0].data.sessions.length, 1);
});

test('a slow save cannot turn an early skip into a completion announcement', async () => {
  const originalNow = Date.now;
  let clock = now;
  Date.now = () => clock;
  try {
    const current = item(); current.data = start();
    const notices = [];
    const host = { getState: () => ({ items: [current] }), save: async () => { clock = now + 1600000; }, toast: message => notices.push(message) };
    await savePomodoroChange(host, current.id, entry => ({ config: entry.config, data: changePomodoro(entry.data, entry.config, { type: 'skip' }) }));
    assert.equal(current.data.sessions.length, 0); assert.deepEqual(notices, []);
  } finally { Date.now = originalNow; }
});

test('all five sizes are purpose-built, offline, and safely escape tasks and titles', () => {
  const current = item(); current.title = '"><img src=x onerror=alert(1)>'; current.data.task = '<script>alert(1)</script>';
  current.data.sessions = [{ completedAt: now, seconds: 1500, task: '<img src=x>' }];
  for (const size of ['1x1', '1x2', '2x1', '2x2', '4x2']) {
    const html = renderWidget({ ...current, size }, DEFAULT_STATE);
    assert.match(html, /data-widget="pomodoro"/); assert.match(html, /pomo-dial/);
    assert.doesNotMatch(html, /undefined|<img|<script|onerror="/);
  }
  assert.doesNotMatch(pomodoroWorkspace(current, now), /<img|<script/);
  setLocale('en');
  try { assert.match(pomodoroWorkspace(item(), now), /Start focus|Short break/); }
  finally { setLocale('zh-CN'); }
});
