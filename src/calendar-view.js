// SPDX-License-Identifier: GPL-3.0-only
import { t, formatDate, getLocale } from './i18n.js';
import { icon } from './icons.js';
import { escapeText } from './html.js';
import { windowControls } from './widget-app-controls.js';
import { localDateKey, parseDate, monthCells, weekdayLabels, chineseLunarDate, dateStats, holidayFor, daysBetween, countWorkdays } from './calendar.js';
import { calendarAlmanac, festivalsForYear, addCalendarDays } from './calendar-almanac.js';

const e = escapeText;
const tools = [['difference', '日期差计算'], ['workdays', '工作日计算'], ['festivals', '节日大全']];

export function calendarGrid(month, config, {selected = '', events = [], compact = false} = {}) {
  const eventDates = new Set(events.map(event => event.date));
  const weekdays = weekdayLabels(config.weekStart).map((day, index) => {
    const weekend = [0, 6].includes((index + config.weekStart) % 7);
    return `<span class="${weekend ? 'weekend' : ''}">${e(getLocale() === 'zh-CN' ? day.replace(/^周/, '') : day)}</span>`;
  }).join('');
  const cells = monthCells(month, config).map(day => {
    const info = compact ? null : calendarAlmanac(day.date);
    const festival = info?.term || info?.festivals[0] || '';
    const classes = ['calendar-cell', day.outside && 'outside', day.today && 'today', day.key === selected && 'selected',
      [0, 6].includes(day.date.getDay()) && 'weekend', day.holiday && (day.holiday.work ? 'workday' : 'holiday')].filter(Boolean).join(' ');
    const label = [formatDate(day.date, {dateStyle:'full'}), day.holiday?.label, festival].filter(Boolean).join(' · ');
    return `<button type="button" class="${classes}" data-calendar-date="${day.key}" ${parseDate(day.key) ? '' : 'disabled'} ${day.today ? 'aria-current="date"' : ''} ${!compact ? `aria-pressed="${day.key === selected}"` : ''} aria-label="${e(label)}"><span class="calendar-number">${day.date.getDate()}</span>${!compact && (config.showLunar || festival) ? `<small class="${festival ? 'festival' : ''}" title="${e(festival)}">${e(festival || chineseLunarDate(day.date, true))}</small>` : ''}${!compact && day.holiday ? `<em class="${day.holiday.work ? 'work' : 'rest'}">${day.holiday.work ? t('班') : t('休')}</em>` : ''}${eventDates.has(day.key) ? '<i class="event-dot" aria-hidden="true"></i>' : ''}</button>`;
  }).join('');
  return `<div class="calendar-week">${weekdays}</div><div class="calendar-month-grid">${cells}</div>`;
}

function dayDetail(item, view) {
  const date = parseDate(view.date), info = calendarAlmanac(date), stats = dateStats(date);
  const holiday = holidayFor(date, item.config.holidays), events = item.data.events.filter(event => event.date === view.date);
  const row = (label, content, color = '') => `<div class="almanac-row"><dt class="${color}">${t(label)}</dt><dd>${e(content)}</dd></div>`;
  const lunar = getLocale() === 'en' ? chineseLunarDate(date) : `${info.lunarYear}年${info.lunarMonth}月${info.lunarDay}`;
  return `<aside class="calendar-day-detail calendar-panel" aria-label="${t('日期详情')}">
    <div class="calendar-day-heading"><h3>${e(formatDate(date, {year:'numeric', month:'2-digit', day:'2-digit', weekday:'short'}))}</h3><div class="calendar-tearoff" aria-hidden="true">${date.getDate()}</div>
    ${item.config.showLunar ? `<p>${e(lunar)}</p><p>${e(info.year)} · ${e(info.zodiac)}</p>` : ''}<p>${t('第 {day} 天 · ISO 第 {week} 周', {day:stats.day, week:stats.week})}</p>${holiday ? `<p class="calendar-holiday">${e(holiday.label)}</p>` : ''}</div>
    <dl class="calendar-almanac">${row('生肖', info.zodiac, 'coral')}${row('星座', info.constellation, 'pink')}
    ${item.config.showLunar ? `${row('宜', info.suitable.join(getLocale() === 'en' ? ', ' : '、'), 'green')}${row('忌', info.avoid.join(getLocale() === 'en' ? ', ' : '、'), 'coral')}<div class="almanac-pair">${row('月相', info.moon)}${row(getLocale() === 'en' ? '节气' : '物候', info.season)}</div>` : ''}</dl>
    ${item.config.showLunar ? `<dl class="almanac-directions">${['喜神方位', '阳贵神方位', '阴贵神方位', '福神方位', '财神方位'].map((label, i) => `<div><dt>${t(label)}</dt><dd>${e(info.directions[i])}</dd></div>`).join('')}</dl>` : ''}
    <section class="calendar-agenda"><h4>${t('当天日程')}</h4><ul class="calendar-events">${events.map(event => `<li><span>${e(event.title)}</span><button type="button" data-detail-action="event-delete" data-id="${e(event.id)}" aria-label="${t('删除日程')}">${icon('close')}</button></li>`).join('') || `<li class="calendar-no-events">${t('暂无日程')}</li>`}</ul><form id="calendar-event-form"><input name="title" required maxlength="160" placeholder="${t('添加日程')}" aria-label="${t('日程内容')}"><button type="submit" aria-label="${t('添加')}">${icon('plus')}</button></form></section>
  </aside>`;
}

function calendarPage(item, view) {
  const month = parseDate(view.month + '-01');
  return `<div class="calendar-detail" id="calendar-main-panel" role="tabpanel" aria-labelledby="calendar-main-tab"><section class="calendar-month-panel calendar-panel">
    <div class="calendar-month-toolbar"><select id="calendar-year" aria-label="${t('选择年份')}">${Array.from({length:301}, (_, index) => `<option value="${1900 + index}" ${month.getFullYear() === 1900 + index ? 'selected' : ''}>${1900 + index}</option>`).join('')}</select><button type="button" data-detail-action="month-prev" aria-label="${t('上个月')}">${icon('chevronLeft')}</button><select id="calendar-month" aria-label="${t('选择月份')}">${Array.from({length:12}, (_, index) => `<option value="${index + 1}" ${month.getMonth() === index ? 'selected' : ''}>${e(formatDate(new Date(2026, index, 1), {month:'short'}))}</option>`).join('')}</select><button type="button" data-detail-action="month-next" aria-label="${t('下个月')}">${icon('chevronRight')}</button><button type="button" class="calendar-today-button" data-detail-action="calendar-today">${t('今天')}</button></div>
    ${calendarGrid(month, item.config, {selected:view.date, events:item.data.events})}</section>${dayDetail(item, view)}</div>`;
}

function dateInput(name, value, label) {
  return `<label class="date-tool-field"><span>${t(label)}</span><input type="date" name="${name}" value="${value}" min="1900-01-01" max="2200-12-31" required></label>`;
}

export function dateToolResults(values, region) {
  const start = parseDate(values.start), end = parseDate(values.end), offset = addCalendarDays(values.base, Number(values.offset));
  let workdays;
  try {
    if (!start || !end) throw new Error(t('请选择有效日期'));
    workdays = t('{count} 个工作日', {count:countWorkdays(start, end, region) - countWorkdays(start, start, region)});
  } catch (error) { workdays = error.message; }
  return {
    difference: start && end ? t('{count} 天', {count:Math.abs(daysBetween(start, end))}) : t('请选择有效日期'),
    offset: offset && values.offset !== '' ? formatDate(offset, {dateStyle:'full'}) : t('请选择有效日期和整数天数'),
    workdays,
  };
}

function dateTools(item, view) {
  const values = view.tools, results = dateToolResults(values, item.config.holidays);
  if (view.tool === 'festivals') return festivalTimeline(view);
  if (view.tool === 'workdays') return `<div class="calendar-calculators"><form id="workday-tool-form" data-date-tool><h3>${t('工作日间隔计算')}</h3>${dateInput('start', values.start, '开始日期')}${dateInput('end', values.end, '结束日期')}<output id="workday-tool-result" aria-live="polite">${e(results.workdays)}</output><p class="date-tool-note">${t('不含开始日期，包含结束日期。')}${item.config.holidays === 'CN' ? t('按中国 2026 年法定节假日及调休计算。') : t('按周一至周五计算。')}</p><button type="button" data-detail-action="date-tool-reset" data-tool="workdays">${t('重置')}</button></form></div>`;
  return `<div class="calendar-calculators"><form id="date-tool-form" data-date-tool><h3>${t('自然日间隔计算')}</h3>${dateInput('start', values.start, '开始日期')}${dateInput('end', values.end, '结束日期')}<output id="date-tool-result" aria-live="polite">${e(results.difference)}</output><button type="button" data-detail-action="date-tool-reset" data-tool="difference">${t('重置')}</button></form>
    <form id="date-offset-form" data-date-tool><h3>${t('日期加减计算')}</h3>${dateInput('base', values.base, '开始日期')}<label class="date-tool-field"><span>${t('间隔天数')}</span><span class="date-stepper"><button type="button" data-detail-action="offset-step" data-step="-1" aria-label="${t('减少一天')}">−</button><input type="number" name="offset" min="-110000" max="110000" step="1" value="${values.offset}" aria-label="${t('间隔天数')}" required><button type="button" data-detail-action="offset-step" data-step="1" aria-label="${t('增加一天')}">+</button></span></label><output id="date-offset-result" aria-live="polite">${e(results.offset)}</output><button type="button" data-detail-action="date-tool-reset" data-tool="offset">${t('重置')}</button></form></div>`;
}

function festivalTimeline(view) {
  const today = new Date(), entries = festivalsForYear(view.year);
  return `<div class="festival-toolbar"><label>${t('选择年份')}<input id="festival-year" type="number" min="1900" max="2200" step="1" value="${view.year}"></label></div><div class="festival-timeline">${Array.from({length:12}, (_, month) => {
    const items = entries.filter(entry => Number(entry.date.slice(5,7)) === month + 1);
    return `<section class="festival-month"><h3><strong>${month + 1}</strong><span>${e(formatDate(new Date(view.year, month, 1), {month:'short'}))}</span></h3><div>${items.map(entry => {
      const date = parseDate(entry.date), distance = daysBetween(today, date);
      const relative = distance === 0 ? t('今天') : distance > 0 ? t('还有 {count} 天', {count:distance}) : t('已过 {count} 天', {count:-distance});
      return `<button type="button" data-calendar-date="${entry.date}"><strong>${e(entry.title)}</strong><span>${e(chineseLunarDate(date))} · ${entry.date.slice(5)}</span><small>${relative}</small></button>`;
    }).join('')}</div></section>`;
  }).join('')}</div>`;
}

export function calendarDetail(item, view) {
  const page = view.page || 'calendar';
  return `<div class="calendar-app"><header class="calendar-app-header"><h2 id="dialog-title"><span class="calendar-app-icon">${icon('calendar')}</span>${t('日历')}</h2><div class="calendar-app-tabs" role="tablist" aria-label="${t('日历视图')}">${[['calendar','日历'],['tools','工具']].map(([value, label]) => `<button type="button" role="tab" id="calendar-${value === 'calendar' ? 'main' : 'tools'}-tab" aria-selected="${page === value}" aria-controls="calendar-${value === 'calendar' ? 'main' : 'tools'}-panel" tabindex="${page === value ? 0 : -1}" data-detail-action="calendar-page" data-page="${value}">${t(label)}</button>`).join('')}</div>${windowControls(view.expanded)}</header>
    ${page === 'calendar' ? calendarPage(item, view) : `<div class="calendar-tools-layout" id="calendar-tools-panel" role="tabpanel" aria-labelledby="calendar-tools-tab"><nav class="calendar-tool-nav calendar-panel" aria-label="${t('日期工具')}">${tools.map(([value, label]) => `<button type="button" data-detail-action="calendar-tool" data-tool="${value}" aria-current="${view.tool === value ? 'page' : 'false'}">${t(label)}</button>`).join('')}</nav><section class="calendar-tool-content calendar-panel">${dateTools(item, view)}</section></div>`}</div>`;
}
