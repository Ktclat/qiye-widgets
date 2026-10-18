// SPDX-License-Identifier: GPL-3.0-only
import { iconPaths } from './icons.js';
import { calculateArithmetic } from './arithmetic.js';
import { converterCard } from './converter-view.js';
import { codecCard } from './codec-workspace.js';
import { mapCard } from './map-view.js';
import { baseConverterCard } from './base-converter-view.js';
import { pomodoroCard } from './pomodoro-view.js';
import { bindPomodoro } from './pomodoro-runtime.js';
import { renderWidgetSummary } from './widget-summary.js';
import { bookmarkCard } from './bookmarks-view.js';
import { bindBookmarkCards } from './bookmarks-workspace.js';
import { countdownPrimary, workdayTimeline } from './widget-life.js';
import { countdownCardFace, workdayFace, worldClockCardFace } from './widget-life-view.js';
import { communityCard } from './community-widget.js';
import { isCompactWidget } from './widget-sizes.js';
import { t } from './i18n.js';
/* 栖页 Qiye — independent, local-first new-tab widgets. */

import { normalizeWallpaperPhoto } from './wallpapers.js';
import { listWidgetDefinitions, getWidgetDefinition } from './widget-registry.js';
import { mountWidgetExtensions } from './widget-runtime.js';
import { hotsearchCard } from './hotsearch-view.js';
import { bindHotsearchCards } from './hotsearch-workspace.js';
import { hotsearchSource } from './hotsearch-sources.js';

const DAY = 86_400_000;
import { weatherSource, requestWeatherPermission } from './weather-sources.js';
import { WEATHER_TTL, weatherState, requestWeather, cityKey, weatherKey, temperature, weatherDescription, weatherArt } from './weather.js';
import { localDateKey, dayStamp, chineseLunarDate, dateStats } from './calendar.js';
import { formatDate, getLocale } from './i18n.js';
import { memoCard } from './memo-view.js';
import { calendarGrid } from './calendar-view.js';
const bindings = new WeakMap();
const quotes = [
  '把今天过得慢一点，认真看一朵云，认真完成一件小事。',
  '让注意力回到手边，下一步就会慢慢清楚。',
  '生活留一点空白，好让新的风景走进来。',
  '不必等到准备完美，小小的开始也有自己的力量。',
  '把喜欢的事放进日常，普通的一天也会发光。',
  '给思绪一个停靠的地方，再轻轻出发。',
  '今天的进步，可以只比昨天多一点点。',
  '世界很大，眼前这杯茶和这段时光也很珍贵。',
  '偶尔抬头看看天，答案未必都藏在屏幕里。',
  '专心走好脚下的一小段路，远方也就近了一些。',
];

export const widgetCatalog = listWidgetDefinitions();

export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

const icons = {
  code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"/>',
  settings: iconPaths.settings,
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  chevronLeft: '<path d="m14 6-6 6 6 6"/>',
  chevronRight: '<path d="m10 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  pin: '<path d="M18 9c0 5-6 11-6 11S6 14 6 9a6 6 0 1 1 12 0Z"/><circle cx="12" cy="9" r="2"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 1-9 6 6 0 0 1 11 2 3.5 3.5 0 1 1 0 7Z"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16"/>',
  note: '<path d="M18 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8l6-6V5a2 2 0 0 0-2-2Z"/><path d="M14 21v-6h6M8 8h8M8 12h6"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5V2m6 4 2-2m-8 9V8"/>',
  briefcase: '<rect x="3" y="6" width="18" height="15" rx="3"/><path d="M8 6V3h8v3M3 11a20 20 0 0 0 18 0m-9 1v3"/>',
  quote: '<path d="M10 6H4v7h4c0 3-2 5-4 5m16-12h-6v7h4c0 3-2 5-4 5"/>',
  trending: '<path d="m3 17 6-6 4 4 8-10m-6 0h6v6"/>',
  converter: '<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
  calculator: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M8 6h8M8 10h1m6 0h1m-8 4h1m6 0h1m-8 4h1m6 0h1"/>',
  sparkles: '<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7ZM19 2v4m-2-2h4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  flag: '<path d="M5 21V3m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 16 5-5 4 4 3-3 6 6"/>',
};

function icon(name, className = '') {
  return `<svg class="widget-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.sparkles}</svg>`;
}

function configButton(label = t("设置组件")) {
  return `<button type="button" class="widget-icon-button widget-config" data-action="widget-config" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon('more')}</button>`;
}

function header(label, iconName, action = configButton()) {
  return `<div class="widget-heading"><button type="button" class="widget-title" data-action="widget-open">${iconName ? icon(iconName) : ''}${escapeHtml(label)}</button>${action}</div>`;
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function validDateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2] ? parts : null;
}

export function daysUntil(value, now = new Date()) {
  const parts = validDateParts(value);
  if (!parts) return null;
  const date = new Date(0);
  date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  date.setUTCHours(0, 0, 0, 0);
  return Math.round((date.getTime() - dayStamp(now)) / DAY);
}

function renderCalendar(monthDate, today, item) {
  const stats = dateStats(today);
  return `<div class="w-calendar-summary"><div class="w-calendar-top"><button type="button" class="widget-icon-button" data-action="widget-calendar-prev" aria-label="${t('上个月')}">${icon('chevronLeft')}</button><span>${escapeHtml(formatDate(monthDate,{year:'numeric',month:'long'}))}</span><button type="button" class="widget-icon-button" data-action="widget-calendar-next" aria-label="${t('下个月')}">${icon('chevronRight')}</button></div><button type="button" class="w-calendar-open" data-action="widget-calendar-detail" aria-label="${t('打开日历')}"><strong>${today.getDate()}</strong><span>${t('第 {day} 天 · ISO 第 {week} 周',{day:stats.day,week:stats.week})}</span><small>${item.config.showLunar?escapeHtml(chineseLunarDate(today))+' · ':''}${escapeHtml(formatDate(today,{weekday:'short'}))}</small></button>${localDateKey(monthDate).slice(0,7) !== localDateKey(today).slice(0,7) ? `<button type="button" class="w-calendar-return" data-action="widget-calendar-today">${t('回到本月')}</button>` : ''}</div><div class="w-calendar-dates">${calendarGrid(monthDate,item.config,{compact:true,events:item.data.events})}</div>`;
}

function renderNotes(data) {
  return `${header(t("随手记"), 'note')}<textarea class="w-notes-input" data-widget-input="notes" aria-label="${t("便签内容")}" placeholder="${t("写下一点灵感，\n或今天想做的小事…")}" maxlength="100000" spellcheck="false">${escapeHtml(data.notes)}</textarea><div class="w-notes-footer"><span data-live="notes-status">${t("已保存在本机")}</span><span class="w-notes-fold" aria-hidden="true"></span></div>`;
}

function todoList(state) {
  const todos = state.todos;
  return todos.length ? todos.map((todo) => `<li class="w-todo-row${todo.done ? ' is-done' : ''}"><label><input type="checkbox" data-action="widget-todo-toggle" data-todo-id="${escapeHtml(todo.id)}"${todo.done ? ' checked' : ''} aria-label="${escapeHtml(`${todo.done ? t("取消完成") : t("完成")}：${todo.text}`)}"><span title="${escapeHtml(todo.text)}">${escapeHtml(todo.text)}</span></label><button type="button" class="widget-icon-button w-row-delete" data-action="widget-todo-delete" data-todo-id="${escapeHtml(todo.id)}" aria-label="${escapeHtml(`${t("删除：{v0}", {v0: todo.text})}`)}">${icon('close')}</button></li>`).join('') : `<li class="w-empty-list">${t("给今天安排一件小事")}</li>`;
}

function todoSummary(state) {
  const todos = state.todos;
  return `${todos.filter((todo) => todo.done).length}/${todos.length}`;
}

function renderTodo(state) {
  return `${header(t("今日待办"), 'check', '<span class="w-todo-summary" data-live="todo-summary">' + todoSummary(state) + '</span>')}<ul class="w-todo-list" data-live="todo-list">${todoList(state)}</ul><form class="w-inline-form" data-widget-form="todo"><input type="text" name="text" autocomplete="off" maxlength="240" placeholder="${t("添加一项待办")}" aria-label="${t("新待办")}"><button type="submit" class="widget-icon-button" aria-label="${t("添加待办")}">${icon('plus')}</button></form>`;
}

function countdownView(item, now = new Date()) {
  const entry=countdownPrimary(item,now),days=entry?.occurrence.days;
  return {title:entry?.title||t('添加倒数日'),number:entry?String(Math.abs(days)):'—',caption:t(!entry?'添加一个值得期待的日子':days<0?'已经过去':days===0?'就是今天':'还有'),unit:t('天'),date:entry?entry.occurrence.key.replaceAll('-','.'):''};
}

function renderCountdown(item) {
  return `${header(t('倒数日'),'calendar')}<div class="countdown-card-surface">${countdownCardFace(item)}</div>`;
}

export function focusRemaining(focus, now = Date.now()) {
  return focus.running && Number.isFinite(Number(focus.endAt)) && Number(focus.endAt) > 0 ? Math.max(0, Math.ceil((Number(focus.endAt) - now) / 1000)) : Math.max(0, Math.ceil(Number(focus.remaining) || 0));
}

function timerText(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function renderFocus(state) {
  const focus = state.focus;
  const remaining = focusRemaining(focus);
  const progress = Math.max(0, Math.min(1, remaining / (focus.duration * 60)));
  return `${header(t("专注时刻"), 'timer')}<div class="w-focus-ring" data-live="focus-ring" style="--focus-progress:${progress}"><div><strong data-live="focus-time">${timerText(remaining)}</strong><span data-live="focus-label">${focus.running ? t("专心做好一件事") : remaining === 0 ? t("这一轮，完成了") : `${t("{v0} 分钟，留给自己", {v0: focus.duration})}`}</span></div></div><div class="w-focus-controls"><button type="button" class="w-focus-start" data-action="widget-focus-toggle"><span data-live="focus-button-icon">${icon(focus.running ? 'pause' : 'play')}</span><span data-live="focus-button">${focus.running ? t("暂停") : remaining === 0 ? t("再来一轮") : remaining < focus.duration * 60 ? t("继续") : t("开始")}</span></button><button type="button" class="widget-icon-button" data-action="widget-focus-reset" title="${t("重置计时")}" aria-label="${t("重置计时")}">${icon('reset')}</button></div>`;
}

export function workdayStatus(config, now = new Date()) {
  return workdayTimeline(config,now);
}

function renderWorkday(item) {
  return `<div class="workday-card-wrap font-${escapeHtml(item.config.font||'system')}">${workdayFace(item.config)}${configButton()}<button class="workday-open" type="button" data-action="widget-open" aria-label="${t('下班倒计时')}"></button></div>`;
}

function getQuote(item, now = new Date()) {
  return item.config.text ? { text: item.config.text, author: item.config.author || t("我的摘录") } : { text: t(quotes[((Math.floor(dayStamp(now) / DAY) + item.config.quoteIndex) % quotes.length + quotes.length) % quotes.length]), author: t("栖页随笔") };
}

function renderQuote(item) {
  const quote = getQuote(item);
  return `${header(t("给今天的一句话"), 'quote', `<div class="widget-heading-actions">${item.config.text ? '' : `<button type="button" class="widget-icon-button" data-action="widget-quote-next" title="${t("换一句")}" aria-label="${t("换一句")}">${icon('reset')}</button>`}${configButton()}</div>`)}<blockquote class="w-quote-text" data-live="quote-text" title="${escapeHtml(quote.text)}">${escapeHtml(quote.text)}</blockquote><div class="w-quote-author" data-live="quote-author">— ${escapeHtml(quote.author)}</div><span class="w-quote-decoration" aria-hidden="true">“</span>`;
}

const hotlinks = [
  { name: '微博热搜', letter: '微', color: '#ff714c', url: 'https://s.weibo.com/top/summary?cate=realtimehot' },
  { name: '知乎热榜', letter: '知', color: '#2684ff', url: 'https://www.zhihu.com/hot' },
  { name: '百度热搜', letter: '百', color: '#4e64fa', url: 'https://top.baidu.com/board?tab=realtime' },
  { name: 'B站热门', letter: '哔', color: '#ec6a9b', url: 'https://www.bilibili.com/v/popular/rank/all' },
  { name: '抖音热点', letter: '抖', color: '#2d3040', url: 'https://www.douyin.com/hot' },
  { name: 'GitHub 趋势', letter: 'G', color: '#35394a', url: 'https://github.com/trending' },
];

function renderHotlinks(state) {
  return `${header(t("热门 · 快捷入口"), 'trending', `<span class="w-hotlinks-tag">${t("直达平台")}</span>`)}<div class="w-hotlinks-grid">${hotlinks.map((link) => `<a href="${link.url}"${state.settings?.openNewTab !== false ? ' target="_blank"' : ''} rel="noopener noreferrer" class="w-hotlink"><span class="w-hotlink-logo" style="--platform-color:${link.color}">${link.letter}</span><span>${t(link.name)}</span>${icon('arrow')}</a>`).join('')}</div><div class="w-hotlinks-footer">${t("打开平台，查看实时榜单")}</div>`;
}

export const calculateExpression = calculateArithmetic;

export function habitStreak(dates, now = new Date()) {
  const records = new Set(Array.isArray(dates) ? dates : []);
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!records.has(localDateKey(date))) date.setDate(date.getDate() - 1);
  let streak = 0;
  while (records.has(localDateKey(date)) && streak <= 36600) { streak += 1; date.setDate(date.getDate() - 1); }
  return streak;
}

function habitList(state, now = new Date()) {
  const habits = state.habits;
  return habits.length ? habits.map((habit) => {
    const done = Array.isArray(habit.dates) && habit.dates.includes(localDateKey(now));
    const streak = habitStreak(habit.dates, now);
    return `<li class="w-habit-row"><button type="button" class="w-habit-check${done ? ' is-done' : ''}" data-action="widget-habit-toggle" data-habit-id="${escapeHtml(habit.id)}" aria-pressed="${done}" aria-label="${escapeHtml(`${done ? t("取消今日打卡") : t("今日打卡")}：${habit.name}`)}">${icon('check')}</button><span class="w-habit-name" title="${escapeHtml(habit.name)}">${escapeHtml(habit.name)}<small>${streak ? `${t("连续 {v0} 天", {v0: streak})}` : t("从今天开始")}</small></span><button type="button" class="widget-icon-button w-row-delete" data-action="widget-habit-delete" data-habit-id="${escapeHtml(habit.id)}" aria-label="${escapeHtml(`${t("删除习惯：{v0}", {v0: habit.name})}`)}">${icon('close')}</button></li>`;
  }).join('') : `<li class="w-empty-list">${t("让一个好习惯，从今天开始")}</li>`;
}

function renderHabit(state) {
  return `${header(t("习惯打卡"), 'sparkles', `<span class="w-habit-today" data-live="habit-summary">${t('今天')} ${state.habits.filter(h=>h.dates.includes(localDateKey())).length}/${state.habits.length}</span>`)}<ul class="w-habit-list" data-live="habit-list">${habitList(state)}</ul><form class="w-inline-form" data-widget-form="habit"><input type="text" name="text" maxlength="60" autocomplete="off" placeholder="${t("添加一个好习惯")}" aria-label="${t("新习惯")}"><button type="submit" class="widget-icon-button" aria-label="${t("添加习惯")}">${icon('plus')}</button></form>`;
}

function timeInZone(zone, now, seconds = false) {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hourCycle: 'h23' }).format(now); } catch { return '—'; }
}

function zoneDate(zone, now) {
  try { return new Intl.DateTimeFormat(getLocale(), { timeZone: zone, month: 'long', day: 'numeric', weekday: 'short' }).format(now); } catch { return t("请设置有效时区"); }
}

function renderClock(item, now = new Date()) {
  return `${header(t('世界时钟'),'globe')}<div class="world-clock-card-surface">${worldClockCardFace(item,now)}</div>`;
}

function renderWeather(item, state) {
  const city = item.config.city;
  const top = header(city.name, 'pin', configButton(t("设置天气城市")));
  if (!item.config.enabled) return `${top}<div class="w-weather-off">${weatherArt(2)}<span>${t("把天气带进新标签页")}</span><button type="button" class="w-weather-enable" data-action="widget-weather-enable">${t("启用天气")}</button></div><div class="w-weather-source">${t("启用后向所选天气源发送城市坐标；每 30 分钟更新。")}</div>`;
  const current = weatherState(city,item.config);
  if (!current.data) return `${top}<div class="w-weather-unavailable">${icon('cloud')}<strong>${current.status === 'error' ? t("暂时无法获取天气") : t("正在获取天气")}</strong><span>${current.status === 'error' ? escapeHtml(current.error) : t("等待天气源返回数据")}</span>${current.status === 'error' ? `<button type="button" class="w-weather-enable" data-action="widget-weather-retry">${t("重新加载")}</button>` : `<span class="w-weather-loading" aria-label="${t("正在加载")}"></span>`}</div><div class="w-weather-source">${escapeHtml(t(weatherSource(item.config.source||'auto').name))}</div>`;
  const weather = current.data;
  const updated = new Date(weather.fetchedAt).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', hour12: false });
  const stale = Date.now() - weather.fetchedAt >= WEATHER_TTL;
  const detail = [weather.description||weatherDescription(weather.code), weather.min !== null && weather.max !== null ? `${temperature(weather.min,item.config.unit).replace("°", "")}° / ${temperature(weather.max,item.config.unit).replace("°", "")}°` : ''].filter(Boolean).join(' · ');
  return `${top}<div class="w-weather-current"><strong>${temperature(weather.temperature,item.config.unit).replace("°", "")}<sup>°</sup></strong>${weatherArt(weather.code, weather.isDay)}</div><div class="w-weather-description">${escapeHtml(detail)}</div><div class="w-weather-details">${weather.feelsLike !== null ? `<span>${t("体感 {v0}°", {v0: temperature(weather.feelsLike,item.config.unit).replace("°", "")})}</span>` : ''}${weather.humidity !== null ? `<span>${t("湿度 {v0}%", {v0: Math.round(weather.humidity)})}</span>` : ''}</div><button type="button" class="w-weather-details-button" data-action="widget-weather-detail">${t("24 小时 · 7 天预报 ↗")}</button><button type="button" class="w-weather-update${current.status === 'error' ? ' is-error' : ''}" data-action="widget-weather-retry" title="${escapeHtml(current.status === 'error' ? current.error : t("重新获取天气"))}"${current.status === 'loading' ? ' disabled' : ''}>${current.status === 'loading' ? t("正在更新…") : current.status === 'error' ? `${t("缓存 {v0} · 更新失败 ↻", {v0: updated})}` : `${stale ? t("缓存") : t("更新")} ${updated} · ${escapeHtml(t(weatherSource(weather.sources?.current).name))} ↻`}</button>`;
}

function renderWallpaper(item, state) {
 const photo = state.settings.wallpaperApiEnabled && normalizeWallpaperPhoto(state.settings.remoteWallpaper);
 return `<div class="wallpaper-widget-art" aria-hidden="true"></div>${photo ? `<img class="wallpaper-widget-photo" src="${escapeHtml(photo.thumbnail)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : ''}<button class="wallpaper-launcher" data-action="wallpaper" aria-label="${t("打开壁纸中心")}"><span class="wallpaper-eyebrow">WALLPAPERS</span><strong>${t("换一片风景")}</strong><span>${t("自定义 · 官方背景 · 摄影图库")}</span><span class="wallpaper-launch-arrow" aria-hidden="true">↗</span></button>`;
}

function compactModel(item) {
  const type = item.widget, now = new Date(), data = item.data, config = item.config;
  let value = '', caption = item.title, detail = '', meta = '', unit = '';
  if (type === 'calendar') {
    value = String(now.getDate()); caption = formatDate(now, {weekday:'short'});
    detail = formatDate(now, {month:'short'}); meta = config.showLunar ? chineseLunarDate(now) : String(now.getFullYear());
  } else if (type === 'weather') {
    const weather = config.enabled ? weatherState(config.city,config).data : null;
    value = weather ? temperature(weather.temperature, config.unit) : '—'; caption = config.city.name;
    detail = weather ? weatherDescription(weather.code) : t('启用天气');
    meta = weather && weather.min !== null && weather.max !== null ? `${temperature(weather.min,config.unit)} / ${temperature(weather.max,config.unit)}` : '';
  } else if (type === 'todo') {
    const pending = data.todos.filter(entry => !entry.done);
    value = String(pending.length); caption = t('待办清单'); detail = pending[0]?.text || t('给今天安排一件小事');
    meta = todoSummary(data);
  } else if (type === 'memo') {
    value = String(data.entries.length); caption = t('备忘录');
    const latest = [...data.entries].sort((a,b) => b.updatedAt-a.updatedAt)[0];
    detail = latest?.title || t('记录一个想法'); meta = latest?.text.slice(0,50) || '';
  } else if (type === 'notes') {
    value = data.notes || t('记录一个想法'); caption = t('便签'); detail = t('点击编辑');
  } else if (type === 'focus') {
    value = timerText(focusRemaining(data.focus)); caption = t('专注计时');
    detail = data.focus.running ? t('专心做好一件事') : t('准备开始'); meta = t('{v0} 分钟，留给自己', {v0:data.focus.duration});
  } else if (type === 'countdown') {
    const view = countdownView(item);
    value = view.number; caption = config.title; detail = view.caption; meta = view.date; unit = view.unit;
  } else if (type === 'workday') {
    const view = workdayStatus(config);
    value = view.text; caption = t('下班倒计时'); detail = view.caption;
    meta = t('距发薪日') + ' ' + t('{v0} 天', {v0:view.paydays});
  } else if (type === 'clock') {
    value = timeInZone(config.timeZone,now); caption = config.label;
    detail = zoneDate(config.timeZone,now); meta = config.timeZone;
  } else if (type === 'habit') {
    value = data.habits.filter(entry => entry.dates.includes(localDateKey(now))).length + '/' + data.habits.length;
    caption = t('习惯打卡'); detail = data.habits[0]?.name || t('记录一个想法'); meta = formatDate(now,{month:'short',day:'numeric'});
  } else if (type === 'quote') {
    const quote = getQuote(item); value = quote.text; caption = quote.author; detail = t('每日一句');
  } else if (type === 'wallpaper') { caption = t('壁纸'); detail = t('换一片风景'); meta = t('打开壁纸中心'); }
  else if (type === 'hotlinks') { caption = t('热搜入口'); detail = t('直达平台'); meta = 'GitHub · B站'; }
  else if (type === 'hotsearch') { value = String(config.subscriptions.length); caption = t('热搜榜'); detail = t(hotsearchSource(config.activeSource).name); meta = t('我的订阅'); }
  else if (type === 'calculator' || (type === 'converter' && data.category !== 'radix')) { value = '⇄'; caption = t('换算器'); detail = t('计算 · 单位 · 汇率'); meta = t('20 类常用换算'); }
  else if (type === 'base-converter' || (type === 'converter' && data.category === 'radix')) {
    const radix = type === 'converter' ? data.radix : data;
    const integer = radix.mode === 'signed' || radix.mode === 'unsigned', bits = radix.bits || 32;
    value = integer ? `${radix.mode === 'signed' ? 'i' : 'u'}${bits}` : '2↔16';
    caption = t('进制转换'); detail = 'BIN · OCT · DEC · HEX';
    meta = integer ? `${t(radix.mode === 'signed' ? '有符号' : '无符号')} · ${t('{bits} 位', {bits})}` : t('支持 2–36 进制');
  }
  else if (type === 'codec') { caption = t('编码工具'); detail = 'Base64 · URL'; meta = t('编码 · 解码 · 哈希'); }
  return {value, caption, detail, meta, unit};
}
function renderCompact(item) {
  return renderWidgetSummary(item, compactModel(item), icon(getWidgetDefinition(item.widget).icon));
}

export function renderWidgetContent(item, state) {
  if (item.widget === 'converter') return converterCard(item);
  if (item.widget === 'map') return mapCard(item);
  if (item.widget === 'base-converter') return baseConverterCard(item);
  if (item.widget === 'bookmarks') return bookmarkCard(item, state);
  if (item.widget === 'pomodoro') return pomodoroCard(item);
  if (item.widget === 'codec') return codecCard(item);
  if (item.widget === 'hotsearch') return hotsearchCard(item, state);
  const now = new Date();
  const renderers = { wallpaper: () => renderWallpaper(item, state), weather: () => renderWeather(item, state), calendar: () => renderCalendar(now, now, item), memo: () => memoCard(item), notes: () => renderNotes(item.data), todo: () => renderTodo(item.data), countdown: () => renderCountdown(item), focus: () => renderFocus(item.data), workday: () => renderWorkday(item), quote: () => renderQuote(item), hotlinks: () => renderHotlinks(state), habit: () => renderHabit(item.data), clock: () => renderClock(item, now) };
  return renderers[item.widget]();
}

export function renderWidget(item, state) {
  const definition = getWidgetDefinition(item.widget);
  if (!definition) throw new Error(`${t("未知组件：{v0}", {v0: item.widget})}`);
  item = { ...item, size: item.size || definition.size };
  const type = item.widget;
  if (type === 'map') return mapCard(item);
  if (type === 'pomodoro') return pomodoroCard(item);
  if(type==='community')return `<div class="widget-inner w-community" data-widget="community" data-widget-id="${escapeHtml(item.id)}" data-display-size="${item.size}">${communityCard(item)}</div>`;
  if (definition.builtin && type !== 'bookmarks' && isCompactWidget(item.size)) return renderCompact(item);
  if (definition && !definition.builtin) {
    let content;
    try {
      content = definition.render({ item: structuredClone(item), config: structuredClone(item.config), escapeHtml, t, locale:getLocale(), size:item.size });
      if (content && typeof content.then === 'function') Promise.resolve(content).catch(() => {});
      if (typeof content !== 'string') throw new Error(t("render 必须同步返回 HTML 字符串"));
    }
    catch { content = `<p class="w-empty-list">${t("组件加载失败，请检查组件实现")}</p>`; }
    return `<div class="widget-inner w-extension" data-widget="${escapeHtml(type)}" data-widget-id="${escapeHtml(item.id)}" data-display-size="${item.size}">${isCompactWidget(item.size) ? '' : header(item.title)}${content}</div>`;
  }
  const now = new Date();
  const color = type === 'notes' && ['yellow', 'pink', 'mint'].includes(item.config?.color) ? ` w-notes-${item.config.color}` : '';
  return `<div class="widget-inner w-${type}${color}" data-widget="${type}" data-widget-id="${escapeHtml(item.id)}" data-display-size="${item.size}"${type === 'calendar' ? ` data-calendar-month="${now.getFullYear()}-${now.getMonth()}" data-calendar-today="${localDateKey(now)}"` : ''}${type === 'habit' || type === 'quote' ? ` data-widget-day="${localDateKey(now)}"` : ''}>${renderWidgetContent(item,state)}</div>`;
}

function findItem(root, state) { return state.items?.find((item) => item.id === root?.dataset.widgetId); }
function widgetRoots(container, type) { return container.querySelectorAll(`[data-widget="${type}"]:not([data-compact])`); }
function setText(root, selector, value) { const element = root.querySelector(`[data-live="${selector}"]`); if (element && element.textContent !== String(value)) element.textContent = String(value); }

function updateWeatherCards(binding) {
  if (!binding.alive) return;
  const state = binding.context.getState();
  for (const root of widgetRoots(binding.container, 'weather')) {
    const item = findItem(root, state);
    if (item) root.innerHTML = renderWeather(item, state);
  }
}

function ensureWeather(binding, force = false) {
  if (!binding.alive) return;
  const state = binding.context.getState();
  for (const root of binding.container.querySelectorAll('[data-widget=weather]')) {
    const item = findItem(root, state);
    if (!item?.config.enabled) continue;
    const city = item.config.city, key = weatherKey(city,item.config), current = weatherState(city,item.config);
    if (binding.weatherPending.has(key)) continue;
    if (!force && ((current.data && Date.now()-current.data.fetchedAt<WEATHER_TTL) || Date.now()-current.lastAttempt<60000)) continue;
    binding.weatherPending.add(key);
    const request=requestWeather(city,force,item.config); updateWeatherCards(binding);
    request.finally(()=>{binding.weatherPending.delete(key);if(binding.alive)updateWeatherCards(binding);});
  }
}

function updateTodoCards(binding) {
  const state = binding.context.getState();
  for (const root of widgetRoots(binding.container, 'todo')) {
    const item = findItem(root, state);
    if (!item) continue;
    const list = root.querySelector('[data-live="todo-list"]');
    if (list) list.innerHTML = todoList(item.data);
    setText(root, 'todo-summary', todoSummary(item.data));
  }
}

function updateHabitCards(binding) {
  const state = binding.context.getState();
  for (const root of widgetRoots(binding.container, 'habit')) {
    const item = findItem(root, state);
    if (!item) continue;
    const list = root.querySelector('[data-live="habit-list"]');
    if (list) list.innerHTML = habitList(item.data);
    setText(root,'habit-summary',`${t('今天')} ${item.data.habits.filter(h=>h.dates.includes(localDateKey())).length}/${item.data.habits.length}`);
    root.dataset.widgetDay = localDateKey();
  }
}

export function bindWidgets(container, context) {
  bindings.get(container)?.cleanup();
  const binding = { container, context, alive: true, noteTimer: null, notePending: false, weatherPending: new Set(), focusFinishing: new Set(), cleanup: null };
  const persist = async () => {
    try { await context.save(); return true; }
    catch (error) { if (binding.alive && !error?.notified) context.toast?.(error?.message || t("保存失败，请重试")); return false; }
  };
  binding.persist = persist;

  async function click(event) {
    const target = event.target.closest?.('[data-action^="widget-"],[data-calendar-date]');
    if (!target || !container.contains(target)) {
      const root=event.target.closest?.('[data-widget]');
      if(root && !event.target.closest('button,a,input,textarea,select,[contenteditable]')) {
        const item=findItem(root,context.getState());
        if(item){event.stopPropagation();context.openDialog('widget-detail',{item});}
      }
      return;
    }
    const root = target.closest('[data-widget]');
    if (!root) return;
    const state = context.getState();
    const item = findItem(root, state);
    if (!item) return;
    const action = target.dataset.action;
    if (target.dataset.calendarDate) { event.preventDefault(); event.stopPropagation(); context.openDialog('widget-detail',{item,date:target.dataset.calendarDate}); return; }
    event.stopPropagation();
    if (target.tagName !== 'INPUT') event.preventDefault();
    if (action === 'widget-open') { context.openDialog('widget-detail',{item,codecAlgorithm:target.dataset.codecAlgorithm,mapRegion:target.dataset.mapRegion}); return; }
    if (action === 'widget-config') { context.openDialog('widget-config', { item }); return; }
    const data = ['todo', 'habit', 'focus'].includes(item.widget) ? item.data : null;
    if (['widget-calendar-detail','widget-weather-detail','widget-memo-open','widget-memo-new'].includes(action)) { context.openDialog('widget-detail', { item, memoId: target.dataset.memoId, newMemo: action === 'widget-memo-new' }); return; }
    if (action.startsWith('widget-calendar-')) {
      const [year, month] = root.dataset.calendarMonth.split('-').map(Number);
      const date = action === 'widget-calendar-today' ? new Date() : new Date(year, month + (action === 'widget-calendar-next' ? 1 : -1), 1);
      root.dataset.calendarMonth = `${date.getFullYear()}-${date.getMonth()}`;
      root.innerHTML = renderCalendar(date, new Date(), item);
      return;
    }
    if (action === 'widget-weather-enable') {
      target.disabled=true;
      try {await requestWeatherPermission(item.config.city,{...item.config,enabled:true});}
      catch(error) {context.toast?.(error.message);if(binding.alive)target.disabled=false;return;}
      item.config.enabled = true;
      if (!await persist()) { item.config.enabled = false; if (binding.alive) updateWeatherCards(binding); return; }
      if (binding.alive) ensureWeather(binding, true);
      return;
    }
    if (action === 'widget-weather-retry') { ensureWeather(binding, true); return; }
    if (action === 'widget-todo-toggle') {
      const todo = data.todos.find((entry) => entry.id === target.dataset.todoId);
      if (todo) todo.done = target.checked;
      updateTodoCards(binding);
      await persist();
      return;
    }
    if (action === 'widget-todo-delete') {
      data.todos = data.todos.filter((entry) => entry.id !== target.dataset.todoId);
      updateTodoCards(binding);
      await persist();
      return;
    }
    if (action === 'widget-focus-toggle' || action === 'widget-focus-reset') {
      const focus = data.focus;
      const remaining = focusRemaining(focus);
      data.focus = action === 'widget-focus-reset' ? { duration: focus.duration, remaining: focus.duration * 60, running: false, endAt: null } : focus.running ? { duration: focus.duration, remaining, running: false, endAt: null } : { duration: focus.duration, remaining: remaining || focus.duration * 60, running: true, endAt: Date.now() + (remaining || focus.duration * 60) * 1000 };
      refreshLiveWidgets(container, state);
      await persist();
      return;
    }
    if (action === 'widget-quote-next') {
      item.config.quoteIndex = (item.config.quoteIndex + 1) % quotes.length;
      const quote = getQuote(item);
      setText(root, 'quote-text', quote.text);
      root.querySelector('[data-live="quote-text"]').title = quote.text;
      setText(root, 'quote-author', `— ${quote.author}`);
      await persist();
      return;
    }
    if (action === 'widget-habit-toggle') {
      const habit = data.habits.find((entry) => entry.id === target.dataset.habitId);
      if (habit) {
        const today = localDateKey();
        habit.dates = Array.isArray(habit.dates) ? habit.dates : [];
        habit.dates = habit.dates.includes(today) ? habit.dates.filter((date) => date !== today) : [...habit.dates, today];
      }
      updateHabitCards(binding);
      await persist();
      return;
    }
    if (action === 'widget-habit-delete') {
      data.habits = data.habits.filter((entry) => entry.id !== target.dataset.habitId);
      updateHabitCards(binding);
      await persist();
    }
  }

  function input(event) {
    const target = event.target;
    if (target.dataset.widgetInput === 'notes') {
      const root = target.closest('[data-widget]');
      const state = context.getState();
      const item = findItem(root, state);
      if (!item) return;
      item.data.notes = target.value.slice(0, 100_000);
      setText(root, 'notes-status', t("保存中…"));
      binding.notePending = true;
      clearTimeout(binding.noteTimer);
      binding.noteTimer = setTimeout(async () => {
        binding.notePending = false;
        const saved = await persist();
        if (binding.alive) for (const root of widgetRoots(container, 'notes')) setText(root, 'notes-status', saved ? t("已保存在本机") : t("保存失败，请重试"));
      }, 400);
    }
  }

  async function submit(event) {
    const form = event.target.closest?.('[data-widget-form]');
    if (!form || !container.contains(form)) return;
    event.preventDefault();
    event.stopPropagation();
    const input = form.querySelector('input[name="text"]');
    const value = input?.value.trim();
    if (!value) { input?.focus(); return; }
    const state = context.getState();
    const item = findItem(form.closest('[data-widget]'), state);
    if (!item || !['todo', 'habit'].includes(item.widget)) return;
    const data = item.data;
    if (form.dataset.widgetForm === 'todo') {
      if (data.todos.length >= 500) { context.toast?.(t("待办最多支持 500 项，请先整理已有任务")); return; }
      data.todos.push({ id: uid(), text: value.slice(0, 240), done: false });
      updateTodoCards(binding);
    } else {
      if (data.habits.length >= 100) { context.toast?.(t("习惯最多支持 100 项")); return; }
      data.habits.push({ id: uid(), name: value.slice(0, 60), dates: [] });
      updateHabitCards(binding);
    }
    input.value = '';
    input.focus();
    await persist();
  }

  function flushNotes() {
    if (!binding.notePending) return;
    clearTimeout(binding.noteTimer);
    binding.notePending = false;
    void persist();
  }

  container.addEventListener('click', click);
  container.addEventListener('input', input);
  container.addEventListener('submit', submit);
  globalThis.addEventListener?.('pagehide', flushNotes);
  const cleanup = () => {
    if (!binding.alive) return;
    flushNotes();
    binding.alive = false;
    binding.extensions?.cleanup();
    binding.bookmarksCleanup?.();
    binding.hotsearchCleanup?.();
    binding.pomodoroCleanup?.();
    clearTimeout(binding.noteTimer);
    container.removeEventListener('click', click);
    container.removeEventListener('input', input);
    container.removeEventListener('submit', submit);
    globalThis.removeEventListener?.('pagehide', flushNotes);
    if (bindings.get(container) === binding) bindings.delete(container);
  };
  binding.extensions = mountWidgetExtensions(container, context);
  binding.bookmarksCleanup = bindBookmarkCards(container, context);
  binding.hotsearchCleanup = bindHotsearchCards(container, context);
  binding.pomodoroCleanup = bindPomodoro(container, context);
  binding.cleanup = cleanup;
  bindings.set(container, binding);
  refreshLiveWidgets(container, context.getState());
  ensureWeather(binding);
  return cleanup;
}

export function refreshLiveWidgets(container, state) {
  for(const root of container.querySelectorAll('[data-compact]')) {
    const item=findItem(root,state);if(!item)continue;
    const view=compactModel(item);
    for(const key of ['value','caption','detail','meta','unit']) {const el=root.querySelector(`.compact-${key}`);if(el && el.textContent!==view[key])el.textContent=view[key];}
  }
  const now = new Date();
  const binding = bindings.get(container);
  for (const root of container.querySelectorAll('[data-widget=focus]')) {
    const item = findItem(root, state);
    if (!item) continue;
    const focus = item.data.focus;
    const remaining = focusRemaining(focus, now.getTime());
    if (focus.running && remaining === 0 && binding?.alive && !binding.focusFinishing.has(item.id)) {
      binding.focusFinishing.add(item.id);
      item.data.focus = { duration: focus.duration, remaining: 0, endAt: null, running: false };
      binding.context.toast?.(`${t("{v0}完成了，休息一下吧。", {v0: item.title})}`);
      Promise.resolve(binding.persist()).finally(() => { binding.focusFinishing.delete(item.id); });
    }
    const running = focus.running && remaining > 0;
    setText(root, 'focus-time', timerText(remaining));
    setText(root, 'focus-label', running ? t("专心做好一件事") : remaining === 0 ? t("这一轮，完成了") : `${t("{v0} 分钟，留给自己", {v0: focus.duration})}`);
    setText(root, 'focus-button', running ? t("暂停") : remaining === 0 ? t("再来一轮") : remaining < focus.duration * 60 ? t("继续") : t("开始"));
    const ring = root.querySelector('[data-live="focus-ring"]');
    ring?.style.setProperty('--focus-progress', String(Math.max(0, Math.min(1, remaining / (focus.duration * 60)))));
    const buttonIcon = root.querySelector('[data-live="focus-button-icon"]');
    if (buttonIcon && buttonIcon.dataset.running !== String(running)) { buttonIcon.innerHTML = icon(running ? 'pause' : 'play'); buttonIcon.dataset.running = String(running); }
  }
  for (const root of widgetRoots(container, 'workday')) {
    const item = findItem(root, state);
    if (!item) continue;
    const face=root.querySelector('.workday-face');
    if(face){const template=document.createElement('template');template.innerHTML=workdayFace(item.config,now);face.replaceWith(template.content.firstElementChild);}
    const status = workdayStatus(item.config, now);
    setText(root, 'workday-caption', status.caption);
    setText(root, 'workday-time', status.text);
    setText(root, 'workday-pay', status.paydays === 0 ? t("就是今天") : `${t("{v0} 天", {v0: status.paydays})}`);
  }
  for (const root of widgetRoots(container, 'countdown')) {
    const item = findItem(root, state);
    if (!item) continue;
    const surface=root.querySelector('.countdown-card-surface');
    if(surface){const markup=countdownCardFace(item,now);if(surface.innerHTML!==markup)surface.innerHTML=markup;}
    const view = countdownView(item, now);
    for (const key of ['title', 'caption', 'number', 'unit', 'date']) setText(root, `countdown-${key}`, view[key]);
  }
  for (const root of widgetRoots(container, 'clock')) {
    const item = findItem(root, state);
    if (!item) continue;
    const surface=root.querySelector('.world-clock-card-surface');
    if(surface){const template=document.createElement('template');template.innerHTML=worldClockCardFace(item,now);const fresh=template.content.firstElementChild;for(const selector of ['.world-clock-card-name','.world-clock-card-face','.world-clock-card-date']){const target=surface.querySelector(selector);if(target)target.innerHTML=fresh.querySelector(selector).innerHTML;}}
    const zone = item.config.timeZone;
    setText(root, 'world-time', timeInZone(zone, now, true));
    setText(root, 'world-date', zoneDate(zone, now));
    setText(root, 'world-london', timeInZone('Europe/London', now));
    setText(root, 'world-newyork', timeInZone('America/New_York', now));
  }
  for (const root of widgetRoots(container, 'calendar')) {
    if (root.dataset.calendarToday !== localDateKey(now)) {
      const [year, month] = root.dataset.calendarMonth.split('-').map(Number);
      root.innerHTML = renderCalendar(new Date(year, month, 1), now, findItem(root, state));
      root.dataset.calendarToday = localDateKey(now);
    }
  }
  for (const root of widgetRoots(container, 'quote')) {
    if (root.dataset.widgetDay !== localDateKey(now)) {
      const item = findItem(root, state);
      if (!item) continue;
      const quote = getQuote(item, now);
      setText(root, 'quote-text', quote.text);
      root.querySelector('[data-live="quote-text"]').title = quote.text;
      setText(root, 'quote-author', `— ${quote.author}`);
      root.dataset.widgetDay = localDateKey(now);
    }
  }
  if (binding?.alive) {
    binding.extensions?.update();
    if ([...widgetRoots(container, 'habit')].some((root) => root.dataset.widgetDay !== localDateKey(now))) updateHabitCards(binding);
    ensureWeather(binding);
    }
}
