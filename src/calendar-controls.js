// SPDX-License-Identifier: GPL-3.0-only
import { localDateKey, parseDate } from './calendar.js';
import { addCalendarDays } from './calendar-almanac.js';
import { dateToolResults } from './calendar-view.js';

export function newCalendarView(date = localDateKey()) {
  return {date, month:date.slice(0, 7), page:'calendar', tool:'difference', year:Number(date.slice(0, 4)),
    tools:{start:date, end:date, base:date, offset:1}};
}

export function updateDateTools(session) {
  const results = dateToolResults(session.view.tools, session.item.config.holidays);
  for (const [id, key] of [['date-tool-result', 'difference'], ['date-offset-result', 'offset'], ['workday-tool-result', 'workdays']]) {
    const element = session.root.querySelector('#' + id);
    if (element) element.textContent = results[key];
  }
}

export function calendarAction(session, target, redraw) {
  const {view, root} = session, name = target.dataset.detailAction;
  let focus;
  if (target.dataset.calendarDate) {
    if (!parseDate(target.dataset.calendarDate)) return true;
    view.date = target.dataset.calendarDate;
    view.month = view.date.slice(0, 7);
    view.page = 'calendar';
    focus = `[data-calendar-date="${view.date}"]`;
  } else if (name === 'calendar-page') {
    view.page = target.dataset.page;
    focus = `[data-detail-action="calendar-page"][data-page="${view.page}"]`;
  } else if (name === 'calendar-tool') {
    view.tool = target.dataset.tool;
    focus = `[data-detail-action="calendar-tool"][data-tool="${view.tool}"]`;
  } else if (name?.startsWith('month-')) {
    const date = parseDate(view.month + '-01');
    date.setMonth(date.getMonth() + (name === 'month-next' ? 1 : -1));
    if (date.getFullYear() < 1900 || date.getFullYear() > 2200) return true;
    view.month = localDateKey(date).slice(0, 7);
    focus = `[data-detail-action="${name}"]`;
  } else if (name === 'calendar-today') {
    view.date = localDateKey();
    view.month = view.date.slice(0, 7);
    focus = `[data-calendar-date="${view.date}"]`;
  } else if (name === 'offset-step') {
    const field = root.querySelector('[name=offset]');
    const value = Number(field.value) + Number(target.dataset.step);
    if (!addCalendarDays(view.tools.base, value)) return true;
    view.tools.offset = value;
    field.value = value;
    updateDateTools(session);
    return true;
  } else if (name === 'date-tool-reset') {
    const today = localDateKey();
    if (target.dataset.tool === 'offset') Object.assign(view.tools, {base:today, offset:1});
    else Object.assign(view.tools, {start:today, end:today});
    focus = `[data-detail-action="date-tool-reset"][data-tool="${target.dataset.tool}"]`;
  } else return false;
  redraw(session);
  root.querySelector(focus)?.focus({preventScroll:true});
  return true;
}

export function calendarChange(session, target, redraw) {
  if (target.closest('[data-date-tool]')) {
    session.view.tools[target.name] = target.value;
    updateDateTools(session);
    return true;
  }
  if (['calendar-month', 'calendar-year'].includes(target.id)) {
    const year = session.root.querySelector('#calendar-year').value;
    const month = session.root.querySelector('#calendar-month').value.padStart(2, '0');
    if (!parseDate(`${year}-${month}-01`)) return false;
    session.view.month = `${year}-${month}`;
  }
  else if (target.id === 'festival-year' && target.value && target.validity.valid) session.view.year = Number(target.value);
  else return false;
  const id = target.id;
  redraw(session);
  session.root.querySelector('#' + id)?.focus({preventScroll:true});
  return true;
}

export function calendarKeydown(session, event, redraw) {
  const target = event.target;
  if (target.matches('[role=tab]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const tabs = [...session.root.querySelectorAll('[role=tab]')];
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - tabs.indexOf(target);
    tabs[index].click();
  } else if (target.dataset.calendarDate && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const offset = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7}[event.key];
    const date = addCalendarDays(target.dataset.calendarDate, offset);
    if (date) calendarAction(session, {dataset:{calendarDate:localDateKey(date)}}, redraw);
  }
}
