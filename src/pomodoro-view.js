// SPDX-License-Identifier: GPL-3.0-only
import { t, formatDate, formatNumber } from './i18n.js';
import { escapeText as e } from './html.js';
import { icon } from './icons.js';
import { windowControls } from './widget-app-controls.js';
import { POMODORO_PHASES, pomodoroRemaining, pomodoroTime, pomodoroToday } from './pomodoro.js';

export function pomodoroPhaseLabel(phase) {
  return t({ focus: '专注', short: '短休息', long: '长休息' }[phase]);
}

function startLabel(data) {
  return data.status === 'running' ? t('暂停') : data.status === 'paused' ? t('继续') : t(data.phase === 'focus' ? '开始专注' : '开始休息');
}

function phaseHint(data) {
  if (data.status === 'paused') return t('停一停，准备好了再继续。');
  if (data.phase === 'short') return t('起身走走，让眼睛离开屏幕。');
  if (data.phase === 'long') return t('给自己一段完整的留白。');
  return t(data.status === 'running' ? '这一刻，只做一件事。' : '从一颗番茄开始。');
}

const leaf = '<svg class="pomo-leaf" viewBox="0 0 48 24" aria-hidden="true"><path d="M24 20C9 20 3 10 3 7c11-2 19 1 21 13Zm0 0C23 7 33 1 44 3c-1 10-8 16-20 17Z" fill="currentColor"/><path d="M24 21V9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

function dial(item, now) {
  const seconds = pomodoroRemaining(item.data, now);
  return `<span class="pomo-dial" style="--pomo-digits:${pomodoroTime(seconds).length}">${leaf}<svg class="pomo-face" viewBox="0 0 200 200" aria-hidden="true"><circle class="pomo-track" cx="100" cy="100" r="91"/><circle class="pomo-progress" cx="100" cy="100" r="91" pathLength="100" style="stroke-dasharray:${seconds / item.data.duration * 100} 100"/><circle class="pomo-ticks" cx="100" cy="100" r="80" pathLength="60"/><circle class="pomo-inner-line" cx="100" cy="100" r="72"/></svg><span class="pomo-dial-copy"><span class="pomo-phase" data-pomo="phase">${pomodoroPhaseLabel(item.data.phase)}</span><strong class="pomo-time" data-pomo="time" role="timer" aria-live="off">${pomodoroTime(seconds)}</strong><span class="pomo-dial-state" data-pomo="state">${t(item.data.status === 'running' ? '进行中' : item.data.status === 'paused' ? '已暂停' : '准备开始')}</span></span></span>`;
}

function toggle(item, compact = false) {
  const label = startLabel(item.data);
  return `<button type="button" class="pomo-start${compact ? ' pomo-start-small' : ''}" data-pomo-action="toggle" aria-label="${label}"><span data-pomo="play">${icon(item.data.status === 'running' ? 'pause' : 'play')}</span><span data-pomo="start">${label}</span></button>`;
}

function cycleMarkup(item) {
  return Array.from({ length: item.config.longBreakEvery }, (_, i) => `<span class="pomo-seed${i < item.data.cycle ? ' is-done' : ''}${i === item.data.cycle && item.data.phase === 'focus' ? ' is-current' : ''}" aria-hidden="true">${icon('tomato')}</span>`).join('');
}

function cycleLabel(item) {
  return t('本组已完成 {done}/{total} 颗番茄', { done: Math.min(item.data.cycle, item.config.longBreakEvery), total: item.config.longBreakEvery });
}

export function pomodoroCard(item, now = Date.now()) {
  const size = item.size || '2x2', compact = ['1x1', '1x2', '2x1'].includes(size);
  const today = pomodoroToday(item.data, now);
  const open = `<button type="button" class="pomo-open-dial" data-action="widget-open" aria-label="${e(t('打开{v0}', { v0: item.title || t('番茄钟') }))}">${dial(item, now)}</button>`;
  const content = compact ? `${open}${size === '1x1' ? '' : toggle(item, true)}` : `
    <div class="pomo-card-heading"><button type="button" data-action="widget-open">${icon('tomato')}<span>${t('番茄钟')}</span></button><button type="button" class="pomo-card-more" data-action="widget-config" aria-label="${t('设置组件')}">${icon('more')}</button></div>
    <div class="pomo-card-body"><div class="pomo-card-timer">${open}${toggle(item, true)}</div><div class="pomo-card-side"><span class="pomo-eyebrow">${t('此刻专注')}</span><strong data-pomo="task">${e(item.data.task || t('只做眼前这一件事'))}</strong><div class="pomo-cycle" data-pomo="cycle" role="img" aria-label="${cycleLabel(item)}">${cycleMarkup(item)}</div><span class="pomo-card-next" data-pomo="next">${t('每 {count} 颗番茄，长休一次', { count: item.config.longBreakEvery })}</span></div></div>
    <div class="pomo-card-footer"><span>${icon('tomato')}<span data-pomo="today">${t('今日 {count} 颗', { count: today.count })}</span></span><span data-pomo="minutes">${t('{count} 分钟', { count: today.minutes })}</span></div>`;
  return `<div class="widget-inner w-pomodoro${compact ? ' pomo-compact' : ''}" data-widget="pomodoro" data-widget-id="${e(item.id)}" data-display-size="${size}" data-phase="${item.data.phase}" data-status="${item.data.status}">${content}</div>`;
}

export function pomodoroSettingsFields(config, advancedOnly = false) {
  const fields = [...(advancedOnly ? [] : [['focusMinutes', '专注时长', 180], ['shortBreakMinutes', '短休时长', 60], ['longBreakMinutes', '长休时长', 120]]), ['longBreakEvery', '长休间隔（颗）', 12], ['dailyGoal', '每日目标（颗）', 24]];
  return `<div class="pomo-settings-grid">${fields.map(([name, label, max]) => `<label><span>${t(label)}</span><span class="pomo-number-field"><input name="${name}" type="number" min="${name === 'longBreakEvery' ? 2 : 1}" max="${max}" step="1" value="${config[name]}" required>${name.endsWith('Minutes') ? `<small>${t('分钟')}</small>` : ''}</span></label>`).join('')}</div><label class="pomo-sound-setting"><input name="sound" type="checkbox" ${config.sound ? 'checked' : ''}><span>${t('阶段结束时播放提示音')}</span></label><p class="pomo-settings-help">${t('时长调整从下一阶段生效；正在进行的这一轮保持原时长。')}</p>`;
}

export function readPomodoroSettings(form, previous = {}) {
  return { ...previous, ...Object.fromEntries(['focusMinutes', 'shortBreakMinutes', 'longBreakMinutes', 'longBreakEvery', 'dailyGoal'].filter(key => form.has(key)).map(key => [key, Number(form.get(key))])), sound: form.has('sound') };
}

export function readPomodoroDurations(form, previous) {
  return { ...previous, ...Object.fromEntries(['focusMinutes', 'shortBreakMinutes', 'longBreakMinutes'].map(key => [key, Number(form.get(key))])) };
}

function durationEditor(config) {
  return `<form class="pomo-duration-editor" data-pomo-duration-form aria-label="${t('设置专注与休息时长')}"><div class="pomo-duration-fields">${[['focusMinutes', '专注', 180], ['shortBreakMinutes', '短休息', 60], ['longBreakMinutes', '长休息', 120]].map(([name, label, max]) => `<label><span>${t(label)}</span><span class="pomo-duration-value"><input name="${name}" aria-label="${t(label)} · ${t('分钟')}" type="number" inputmode="numeric" min="1" max="${max}" step="1" value="${config[name]}" required><small>${t('分钟')}</small></span></label>`).join('')}</div><div class="pomo-duration-actions"><div class="pomo-presets"><button type="button" data-pomo-preset="classic" title="${t('经典 25 / 5')}">25 / 5</button><button type="button" data-pomo-preset="deep" title="${t('深入 50 / 10')}">50 / 10</button></div><button type="submit" class="pomo-apply-duration">${t('应用时长')}</button></div><p class="pomo-duration-help" data-pomo="duration-help">${t('直接输入分钟数，应用或开始专注。')}</p></form>`;
}

function historyMarkup(item, now) {
  const sessions = pomodoroToday(item.data, now).sessions.slice(-6).reverse();
  return sessions.length ? `<ol>${sessions.map(entry => `<li><span class="pomo-history-mark">${icon('tomato')}</span><span><strong>${e(entry.task || t('一次心无旁骛的专注'))}</strong><small>${e(formatDate(new Date(entry.completedAt), { hour: '2-digit', minute: '2-digit' }))}</small></span><span>${t('{count} 分钟', { count: entry.seconds / 60 })}</span></li>`).join('')}</ol>` : `<div class="pomo-empty">${icon('tomato')}<p>${t('第一颗番茄，从现在开始。')}<small>${t('完成一整轮专注，就会在这里留下记录。')}</small></p></div>`;
}

export function pomodoroWorkspace(item, now = Date.now()) {
  const today = pomodoroToday(item.data, now);
  return `<div class="pomo-app w-pomodoro" data-widget="pomodoro" data-widget-id="${e(item.id)}" data-phase="${item.data.phase}" data-status="${item.data.status}">
    <header class="pomo-app-header"><div class="pomo-brand">${icon('tomato')}<h2 id="dialog-title">${e(item.title)}</h2></div><div class="pomo-header-actions"><button type="button" class="pomo-settings-jump" data-pomo-action="preferences" title="${t('更多设置')}" aria-label="${t('更多设置')}">${icon('settings')}</button>${windowControls()}</div></header>
    <div class="pomo-app-scroll"><div class="pomo-workbench"><section class="pomo-studio" aria-label="${t('番茄计时器')}">
      <div class="pomo-phase-tabs" role="group" aria-label="${t('计时阶段')}">${POMODORO_PHASES.map(phase => `<button type="button" data-pomo-action="phase" data-phase-value="${phase}" aria-pressed="${phase === item.data.phase}">${pomodoroPhaseLabel(phase)}</button>`).join('')}</div>
      ${durationEditor(item.config)}${dial(item, now)}<p class="pomo-hint" data-pomo="hint">${phaseHint(item.data)}</p>
      <div class="pomo-controls"><button type="button" class="pomo-secondary" data-pomo-action="reset" aria-label="${t('重新计时')}" title="${t('重新计时')}">${icon('reset')}</button>${toggle(item)}<button type="button" class="pomo-secondary" data-pomo-action="skip" aria-label="${t('结束本轮，进入下一阶段（不计为完成）')}" title="${t('结束本轮，进入下一阶段（不计为完成）')}">${icon('skip')}</button></div>
      <div class="pomo-rounds"><div class="pomo-cycle" data-pomo="cycle" role="img" aria-label="${cycleLabel(item)}">${cycleMarkup(item)}</div><span data-pomo="next">${t('每 {count} 颗番茄，长休一次', { count: item.config.longBreakEvery })}</span></div>
      <p class="pomo-phase-help">${t('完成后，下一阶段等你亲手开启。')}</p>
    </section><aside class="pomo-companion">
      <section class="pomo-intention"><span class="pomo-section-number">01 / ${t('把注意力放在这里')}</span><h3>${t('这一颗，为哪件事？')}</h3><form data-pomo-task-form><input name="task" type="text" maxlength="120" value="${e(item.data.task)}" placeholder="${t('例如：读完一章，写好一段')}" aria-label="${t('当前专注事项')}" autocomplete="off"><button type="submit" aria-label="${t('保存专注事项')}">${icon('check')}</button></form><p data-pomo="task-help">${t('把大任务拆成一个番茄能完成的小步。')}</p></section>
      <section class="pomo-harvest"><span class="pomo-section-number">02 / ${t('今天的收获')}</span><div class="pomo-totals"><div><strong data-pomo="count">${formatNumber(today.count)}</strong><span>${t('颗番茄')}</span></div><div><strong data-pomo="total-minutes">${formatNumber(today.minutes)}</strong><span>${t('专注分钟')}</span></div></div><div class="pomo-goal-caption"><span data-pomo="goal">${t('今日目标 {done}/{goal}', { done: today.count, goal: item.config.dailyGoal })}</span><span data-pomo="goal-percent">${Math.min(100, Math.round(today.count / item.config.dailyGoal * 100))}%</span></div><progress class="pomo-goal" data-pomo="goal-bar" max="${item.config.dailyGoal}" value="${Math.min(today.count, item.config.dailyGoal)}" aria-label="${t('每日番茄目标')}"></progress></section>
      <details class="pomo-preferences"><summary>${icon('settings')}${t('更多设置')}<span>＋</span></summary><form data-pomo-settings-form>${pomodoroSettingsFields(item.config, true)}<button type="submit" class="pomo-save">${t('保存节奏')}</button></form></details>
    </aside></div><section class="pomo-history"><div class="pomo-history-heading"><h3>${t('留下的专注时光')}</h3><span>${t('今天 · 最近 6 次')}</span></div><div data-pomo="history">${historyMarkup(item, now)}</div></section><p class="pomo-storage-note">${t('关闭页面后按实际时间恢复；提示音需页面保持打开。')}</p></div><div class="pomo-feedback" role="status" aria-live="polite"></div>
  </div>`;
}

export function updatePomodoroView(root, item, now = Date.now()) {
  const data = item.data, today = pomodoroToday(data, now), label = startLabel(data);
  const set = (key, value) => { for (const node of root.querySelectorAll(`[data-pomo="${key}"]`)) if (node.textContent !== String(value)) node.textContent = value; };
  root.dataset.phase = data.phase;
  root.dataset.status = data.status;
  set('time', pomodoroTime(pomodoroRemaining(data, now)));
  set('phase', pomodoroPhaseLabel(data.phase));
  set('state', t(data.status === 'running' ? '进行中' : data.status === 'paused' ? '已暂停' : '准备开始'));
  set('start', label); set('hint', phaseHint(data));
  set('task', data.task || t('只做眼前这一件事'));
  set('today', t('今日 {count} 颗', { count: today.count }));
  set('minutes', t('{count} 分钟', { count: today.minutes }));
  set('count', formatNumber(today.count)); set('total-minutes', formatNumber(today.minutes));
  set('goal', t('今日目标 {done}/{goal}', { done: today.count, goal: item.config.dailyGoal }));
  set('goal-percent', `${Math.min(100, Math.round(today.count / item.config.dailyGoal * 100))}%`);
  set('next', data.phase === 'long' ? t('这一组辛苦了，好好休息。') : t('每 {count} 颗番茄，长休一次', { count: item.config.longBreakEvery }));
  set('task-help', t(data.status === 'idle' ? '把大任务拆成一个番茄能完成的小步。' : '事项已锁定，安心完成这一轮。'));
  set('duration-help', t(data.status === 'idle' ? '直接输入分钟数，应用或开始专注。' : '本轮保持原时长，修改从下一轮生效。'));
  const durations = root.querySelector('[data-pomo-duration-form]');
  if (durations && !durations.dataset.dirty) for (const input of durations.querySelectorAll('input')) {
    if (!input.matches(':focus')) input.value = item.config[input.name];
  }
  const progress = root.querySelector('.pomo-progress');
  root.querySelector('.pomo-dial')?.style.setProperty('--pomo-digits', pomodoroTime(pomodoroRemaining(data, now)).length);
  if (progress) progress.style.strokeDasharray = `${pomodoroRemaining(data, now) / data.duration * 100} 100`;
  const play = root.querySelector('[data-pomo="play"]');
  if (play && play.dataset.status !== data.status) { play.innerHTML = icon(data.status === 'running' ? 'pause' : 'play'); play.dataset.status = data.status; }
  root.querySelector('[data-pomo-action="toggle"]')?.setAttribute('aria-label', label);
  const cycle = root.querySelector('[data-pomo="cycle"]');
  if (cycle && cycle.getAttribute('aria-label') + cycle.dataset.phase !== cycleLabel(item) + data.phase) { cycle.innerHTML = cycleMarkup(item); cycle.setAttribute('aria-label', cycleLabel(item)); cycle.dataset.phase = data.phase; }
  for (const button of root.querySelectorAll('[data-pomo-action="phase"]')) { button.setAttribute('aria-pressed', String(button.dataset.phaseValue === data.phase)); button.disabled = data.status !== 'idle'; }
  const task = root.querySelector('[name="task"]');
  if (task) {
    task.disabled = data.status !== 'idle';
    root.querySelector('[data-pomo-task-form] button').disabled = data.status !== 'idle';
    if (task.dataset.saved !== data.task && !task.dataset.dirty && !task.matches(':focus')) task.value = data.task;
    task.dataset.saved = data.task;
  }
  const bar = root.querySelector('[data-pomo="goal-bar"]');
  if (bar) { bar.max = item.config.dailyGoal; bar.value = Math.min(today.count, item.config.dailyGoal); }
  const history = root.querySelector('[data-pomo="history"]');
  const historyKey = JSON.stringify(today.sessions.slice(-6));
  if (history && history.dataset.key !== historyKey) { history.innerHTML = historyMarkup(item, now); history.dataset.key = historyKey; }
}
