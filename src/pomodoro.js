// SPDX-License-Identifier: GPL-3.0-only
import { keys, string, number, bool, enumeration, array, unique, invalid } from './validation.js';
import { localDateKey } from './calendar.js';
import { t } from './i18n.js';

export const POMODORO_DEFAULTS = Object.freeze({ focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4, dailyGoal: 8, sound: true });
export const POMODORO_PHASES = Object.freeze(['focus', 'short', 'long']);
export const POMODORO_HISTORY_LIMIT = 2000;

export function pomodoroDuration(config, phase) {
  return config[{ focus: 'focusMinutes', short: 'shortBreakMinutes', long: 'longBreakMinutes' }[phase]] * 60;
}

export function newPomodoroData() {
  return { phase: 'focus', status: 'idle', duration: 1500, remaining: 1500, endAt: null, cycle: 0, task: '', sessions: [] };
}

// Receives an already validated legacy timer. Completed, stopped timers have no
// reliable completion timestamp, so migration does not invent session history.
export function migrateFocusTimer(focus) {
  const duration = focus.duration * 60;
  const remaining = Math.min(duration, Math.ceil(focus.remaining));
  const running = focus.running && focus.endAt > 0;
  const data = { ...newPomodoroData(), duration, remaining: remaining || duration };
  if (running) Object.assign(data, { status: 'running', endAt: Math.ceil(focus.endAt) });
  else if (remaining > 0 && remaining < duration) data.status = 'paused';
  return { config: { ...POMODORO_DEFAULTS, focusMinutes: focus.duration }, data };
}

export function validatePomodoroConfig(raw, path = 'config') {
  keys(raw, Object.keys(POMODORO_DEFAULTS), path);
  return {
    focusMinutes: number(raw.focusMinutes, `${path}.focusMinutes`, 1, 180, true),
    shortBreakMinutes: number(raw.shortBreakMinutes, `${path}.shortBreakMinutes`, 1, 60, true),
    longBreakMinutes: number(raw.longBreakMinutes, `${path}.longBreakMinutes`, 1, 120, true),
    longBreakEvery: number(raw.longBreakEvery, `${path}.longBreakEvery`, 2, 12, true),
    dailyGoal: number(raw.dailyGoal, `${path}.dailyGoal`, 1, 24, true),
    sound: bool(raw.sound, `${path}.sound`),
  };
}

export function validatePomodoroData(raw, path = 'data') {
  keys(raw, ['phase', 'status', 'duration', 'remaining', 'endAt', 'cycle', 'task', 'sessions'], path);
  const phase = enumeration(raw.phase, POMODORO_PHASES, `${path}.phase`);
  const status = enumeration(raw.status, ['idle', 'running', 'paused'], `${path}.status`);
  const duration = number(raw.duration, `${path}.duration`, 60, 10800, true);
  const remaining = number(raw.remaining, `${path}.remaining`, 1, duration, true);
  const endAt = raw.endAt === null ? null : number(raw.endAt, `${path}.endAt`, 1, 8640000000000000, true);
  if ((status === 'running') !== (endAt !== null) || status === 'idle' && remaining !== duration) invalid(path, t('番茄钟状态与剩余时间不一致'));
  const sessions = array(raw.sessions, `${path}.sessions`, POMODORO_HISTORY_LIMIT).map((entry, i) => {
    const at = `${path}.sessions[${i}]`;
    keys(entry, ['completedAt', 'seconds', 'task'], at);
    return { completedAt: number(entry.completedAt, `${at}.completedAt`, 1, 8640000000000000, true), seconds: number(entry.seconds, `${at}.seconds`, 60, 10800, true), task: string(entry.task, `${at}.task`, 120, true) };
  });
  unique(sessions.map(entry => entry.completedAt), `${path}.sessions`);
  return { phase, status, duration, remaining, endAt, cycle: number(raw.cycle, `${path}.cycle`, 0, 12, true), task: string(raw.task, `${path}.task`, 120, true), sessions };
}

export function pomodoroRemaining(data, now = Date.now()) {
  return data.status === 'running' ? Math.max(0, Math.min(data.remaining, Math.ceil((data.endAt - now) / 1000))) : data.remaining;
}

function ready(data, config, phase, cycle = data.cycle) {
  const duration = pomodoroDuration(config, phase);
  return { ...data, phase, cycle, duration, remaining: duration, status: 'idle', endAt: null };
}

// Only the running interval is completed after suspension. The next phase waits
// for a deliberate start, so time spent away never becomes fictional sessions.
export function settlePomodoro(data, config, now = Date.now()) {
  if (data.status !== 'running' || pomodoroRemaining(data, now) > 0) return data;
  if (data.phase !== 'focus') return ready(data, config, 'focus', data.phase === 'long' ? 0 : data.cycle);
  const cycle = Math.min(12, data.cycle + 1);
  const session = { completedAt: data.endAt, seconds: data.duration, task: data.task };
  const sessions = [...data.sessions.filter(entry => entry.completedAt !== session.completedAt), session]
    .sort((a, b) => a.completedAt - b.completedAt).slice(-POMODORO_HISTORY_LIMIT);
  return ready({ ...data, sessions }, config, cycle >= config.longBreakEvery ? 'long' : 'short', cycle);
}

export function changePomodoro(data, config, action, now = Date.now()) {
  const current = settlePomodoro(data, config, now);
  // A click arriving at the deadline acknowledges completion without starting,
  // resetting or skipping the freshly selected phase by accident.
  if (current !== data) return current;
  if (action.type === 'toggle') {
    return data.status === 'running'
      ? { ...data, remaining: pomodoroRemaining(data, now), status: 'paused', endAt: null }
      : { ...data, status: 'running', endAt: now + data.remaining * 1000 };
  }
  if (action.type === 'reset') return ready(data, config, data.phase);
  if (action.type === 'skip') return ready(data, config, data.phase === 'focus' ? 'short' : 'focus', data.phase === 'long' ? 0 : data.cycle);
  if (action.type === 'phase' && data.status === 'idle' && POMODORO_PHASES.includes(action.phase)) return ready(data, config, action.phase);
  if (action.type === 'task' && data.status === 'idle') return { ...data, task: string(action.task, 'task', 120, true).trim() };
  return data;
}

export function configurePomodoro(data, config) {
  // An in-flight round retains the duration with which it was started.
  return data.status === 'idle' ? ready(data, config, data.phase) : data;
}

export function pomodoroToday(data, now = Date.now()) {
  const day = localDateKey(new Date(now));
  const sessions = data.sessions.filter(entry => localDateKey(new Date(entry.completedAt)) === day);
  return { sessions, count: sessions.length, minutes: Math.round(sessions.reduce((sum, entry) => sum + entry.seconds, 0) / 60) };
}

export function pomodoroTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
