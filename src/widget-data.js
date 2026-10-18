// SPDX-License-Identifier: GPL-3.0-only
import { newConverterData, validateConverterData } from './converter.js';
import { newMapData, validateMapData } from './map-model.js';
import { newPomodoroData, validatePomodoroData } from './pomodoro.js';
import { validateCountdownData } from './widget-life.js';
import { t } from './i18n.js';
import { keys, string, array, id, bool, number, date, unique, invalid } from './validation.js';

import { validateBookmarks } from './bookmarks.js';
import { validateMemos } from './memos.js';
import { newBaseConverterData, validateBaseConverterData } from './base-converter.js';
import { validateCommunityData } from './community-format.js';

const dataKeys = Object.freeze({ notes: 'notes', todo: 'todos', habit: 'habits', focus: 'focus' });
const defaults = { notes: '', todos: [], habits: [], focus: { duration: 25, remaining: 1500, running: false, endAt: null } };

export function newWidgetData(type) {
  if (type === 'converter') return newConverterData();
  if (type === 'map') return newMapData();
  if (type === 'base-converter') return newBaseConverterData();
  if (type === 'pomodoro') return newPomodoroData();
  if(type==='community')return {value:'null'};
  if (type === 'bookmarks') return { nodes: [] };
  if (type === 'memo') return { entries: [] };
  if (type === 'calendar') return { events: [] };
  const key = dataKeys[type];
  return key ? structuredClone({ [key]: defaults[key] }) : {};
}

export function widgetContentSummary(items) {
  return items.reduce((summary, item) => {
    if (item.type === 'widget' && item.widget === 'todo') summary.todos += item.data.todos.length;
    if (item.type === 'widget' && item.widget === 'memo') summary.notesLength += item.data.entries.reduce((sum, entry) => sum + entry.text.length, 0);
    if (item.type === 'widget' && item.widget === 'notes') summary.notesLength += item.data.notes.length;
    return summary;
  }, { todos: 0, notesLength: 0 });
}

export function validateWidgetData(type, raw, path) {
  if (type === 'converter') return validateConverterData(raw, path);
  if (type === 'map') return validateMapData(raw, path);
  if (type === 'base-converter') return validateBaseConverterData(raw, path);
  if (type === 'pomodoro') return validatePomodoroData(raw, path);
  if(type==='countdown')return validateCountdownData(raw,path);
  if(type==='community')return validateCommunityData(raw);
  if (type === 'bookmarks') return validateBookmarks(raw, path);
  if (type === 'memo') return validateMemos(raw, path);
  if (type === 'calendar') {
    keys(raw, ['events'], path);
    const events = array(raw.events, `${path}.events`, 500).map((entry, index) => {
      const p = `${path}.events[${index}]`;
      keys(entry, ['id','date','title'], p);
      return {id:id(entry.id, `${p}.id`), date:date(entry.date, `${p}.date`), title:string(entry.title, `${p}.title`, 160)};
    });
    unique(events.map(entry=>entry.id), `${path}.events`);
    return {events};
  }
  const key = dataKeys[type];
  keys(raw, key ? [key] : [], path);
  if (!key) return {};
  const value = raw[key];
  const at = `${path}.${key}`;
  if (key === 'notes') return { notes: string(value, at, 100000, true) };
  if (key === 'focus') {
    keys(value, ['duration', 'remaining', 'running', 'endAt'], at);
    const focus = {
      duration: number(value.duration, `${at}.duration`, 1, 180, true),
      remaining: number(value.remaining, `${at}.remaining`, 0, 10800),
      running: bool(value.running, `${at}.running`),
      endAt: value.endAt === null ? null : number(value.endAt, `${at}.endAt`, 0, 8640000000000000),
    };
    if (focus.running && focus.endAt === null) invalid(at, t("运行中的番茄钟必须包含结束时间"));
    return { focus };
  }
  const entries = array(value, at, key === 'todos' ? 500 : 100).map((entry, index) => {
    const p = `${at}[${index}]`;
    keys(entry, key === 'todos' ? ['id', 'text', 'done'] : ['id', 'name', 'dates'], p);
    const entryId = id(entry.id, `${p}.id`);
    if (key === 'todos') return { id: entryId, text: string(entry.text, `${p}.text`, 1000), done: bool(entry.done, `${p}.done`) };
    const dates = array(entry.dates, `${p}.dates`, 3660).map(value => date(value, `${p}.dates`));
    unique(dates, `${p}.dates`);
    return { id: entryId, name: string(entry.name, `${p}.name`, 120), dates };
  });
  unique(entries.map(entry => entry.id), at);
  return { [key]: entries };
}
