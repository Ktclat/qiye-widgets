// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { icon } from './icons.js';
import { changePomodoro, configurePomodoro, settlePomodoro, validatePomodoroConfig } from './pomodoro.js';
import { readPomodoroSettings, readPomodoroDurations, updatePomodoroView } from './pomodoro-view.js';

const pending = new Set(), failedCompletions = new Map(), observers = new Set();
let audioContext;
const notify = () => { for (const refresh of observers) refresh(); };

function enableSound() {
  try {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return;
    audioContext ||= new Audio();
    void audioContext.resume().catch(() => {});
  } catch { /* Sound is optional; a browser restriction must not stop the timer. */ }
}

function chime() {
  if (audioContext?.state !== 'running') return;
  try {
    for (const [i, frequency] of [660, 880, 1100].entries()) {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      const start = audioContext.currentTime + i * .18;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.09, start + .015);
      gain.gain.exponentialRampToValueAtTime(.001, start + .5);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(start); oscillator.stop(start + .55);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
  } catch { /* Visual completion remains available without audio. */ }
}

export async function savePomodoroChange(host, id, transform, automatic = false) {
  const item = host.getState().items.find(entry => entry.id === id && entry.widget === 'pomodoro');
  if (!item || pending.has(id) || automatic && failedCompletions.get(id) === item.data) return false;
  const before = { data: item.data, config: item.config };
  const changedAt = Date.now();
  const next = transform(item);
  if (next.data === before.data && next.config === before.config) return true;
  pending.add(id); failedCompletions.delete(id);
  Object.assign(item, next); notify();
  try {
    await host.save();
    const completed = before.data.status === 'running' && before.data.endAt <= changedAt && next.data.phase !== before.data.phase;
    if (completed) {
      host.toast?.(t(before.data.phase === 'focus' ? '收获一颗番茄。休息一下，下一阶段由你开启。' : '休息结束，准备好再开始下一颗番茄。'));
      if (item.config.sound && Date.now() - before.data.endAt < 10000) chime();
    }
    return true;
  } catch (error) {
    const current = host.getState().items.find(entry => entry.id === id);
    if (current === item) {
      if (current.data === next.data) current.data = before.data;
      if (current.config === next.config) current.config = before.config;
    }
    // A failed completion stays retryable through an explicit interaction,
    // instead of hammering storage and toasts once a second.
    if (automatic && current?.widget === 'pomodoro' && settlePomodoro(current.data, current.config) !== current.data) failedCompletions.set(id, current.data);
    if (!error?.notified) host.toast?.(error?.message || t('保存失败，请重试'));
    return false;
  } finally { pending.delete(id); notify(); }
}

export function bindPomodoro(container, host) {
  const controller = new AbortController(), options = { signal: controller.signal };
  const roots = () => [...container.querySelectorAll('[data-widget="pomodoro"]')];
  let settingsBase = JSON.stringify(roots().length === 1 ? host.getState().items.find(entry => entry.id === roots()[0].dataset.widgetId)?.config : null);
  let feedbackTimer;
  const feedback = message => {clearTimeout(feedbackTimer);const node=container.querySelector('.pomo-feedback');if(node){node.textContent=message;if(message)feedbackTimer=setTimeout(()=>{node.textContent='';},3000);}};
  function refresh() {
    for (const root of roots()) {
      const item = host.getState().items.find(entry => entry.id === root.dataset.widgetId && entry.widget === 'pomodoro');
      if (!item) { root.inert = true; continue; }
      updatePomodoroView(root, item);
      if (failedCompletions.get(item.id) === item.data) {
        for (const node of root.querySelectorAll('[data-pomo="start"]')) node.textContent = t('重试保存');
        root.querySelector('[data-pomo-action="toggle"]')?.setAttribute('aria-label', t('重试保存'));
        const state = root.querySelector('[data-pomo="state"]'), play = root.querySelector('[data-pomo="play"]');
        if (state) state.textContent = t('完成待保存');
        if (play) play.innerHTML = icon('refresh');
      }
      root.setAttribute('aria-busy', String(pending.has(item.id)));
      for (const button of root.querySelectorAll('[data-pomo-action="toggle"],[data-pomo-action="reset"],[data-pomo-action="skip"],[type="submit"]')) {
        button.disabled = pending.has(item.id) || button.closest('[data-pomo-task-form]') !== null && item.data.status !== 'idle';
      }
    }
  }
  function tick() {
    for (const id of failedCompletions.keys()) if (!host.getState().items.some(item => item.id === id)) failedCompletions.delete(id);
    // Include hidden groups as well as visible cards. Multiple mounted views
    // share the synchronous lock and cannot count the same completion twice.
    for (const item of host.getState().items) {
      if (item.widget !== 'pomodoro') continue;
      const next = settlePomodoro(item.data, item.config);
      if (next !== item.data) void savePomodoroChange(host, item.id, current => ({ config: current.config, data: settlePomodoro(current.data, current.config) }), true);
    }
    refresh();
  }
  observers.add(refresh);
  container.addEventListener('click', async event => {
    const button = event.target.closest('[data-pomo-action],[data-pomo-preset],[data-detail-action="window-expand"]');
    if (!button || !container.contains(button)) return;
    const root = button.closest('[data-widget="pomodoro"]');
    if (!root) return;
    event.preventDefault(); event.stopPropagation();
    const item = host.getState().items.find(entry => entry.id === root.dataset.widgetId);
    if (!item) return;
    if (button.dataset.detailAction === 'window-expand') {
      const dialog = root.closest('dialog'); dialog.classList.toggle('widget-app-expanded');
      button.setAttribute('aria-pressed', String(dialog.classList.contains('widget-app-expanded'))); return;
    }
    const action = button.dataset.pomoAction;
    if (action === 'open') { host.openDialog?.('widget-detail', { item }); return; }
    if (button.dataset.pomoPreset) {
      const form = button.closest('form'), deep = button.dataset.pomoPreset === 'deep';
      for (const [name, value] of Object.entries({ focusMinutes: deep ? 50 : 25, shortBreakMinutes: deep ? 10 : 5, longBreakMinutes: deep ? 30 : 15 })) form.elements[name].value = value;
      form.dataset.dirty = 'true';
      return;
    }
    if (item.config.sound) enableSound();
    const taskInput = root.querySelector('[name="task"]');
    const durations = root.querySelector('[data-pomo-duration-form]');
    const applyDurations = action === 'toggle' && item.data.status === 'idle' && durations?.dataset.dirty;
    if (applyDurations && !durations.reportValidity()) return;
    try {
      const saved = await savePomodoroChange(host, item.id, current => {
        if (applyDurations && JSON.stringify(current.config) !== settingsBase) throw new Error(t('组件设置已在其他位置修改，请重新打开。'));
        const config = applyDurations ? validatePomodoroConfig(readPomodoroDurations(new FormData(durations), current.config)) : current.config;
        const configured = applyDurations ? configurePomodoro(current.data, config) : current.data;
        const data = action === 'toggle' && configured.status === 'idle' && taskInput
          ? changePomodoro(configured, config, { type: 'task', task: taskInput.value }) : configured;
        return { config, data: changePomodoro(data, config, { type: action, phase: button.dataset.phaseValue }) };
      });
      if (saved && taskInput && action === 'toggle') delete taskInput.dataset.dirty;
      if (saved && applyDurations) { delete durations.dataset.dirty; settingsBase = JSON.stringify(host.getState().items.find(entry => entry.id === item.id)?.config); }
      if (!controller.signal.aborted) { feedback(saved ? '' : t('未能保存，请重试。')); refresh(); }
    } catch (error) { if (!controller.signal.aborted) { feedback(error.message); host.toast?.(error.message); } }
  }, options);
  container.addEventListener('input', event => {
    if (event.target.matches('[data-pomo-task-form] input')) event.target.dataset.dirty = 'true';
    const durations = event.target.closest('[data-pomo-duration-form]');
    if (durations) durations.dataset.dirty = 'true';
  }, options);
  container.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('[data-pomo-task-form],[data-pomo-settings-form],[data-pomo-duration-form]')) return;
    event.preventDefault(); event.stopPropagation();
    const id = form.closest('[data-widget="pomodoro"]').dataset.widgetId;
    try {
      const fields = new FormData(form), durations = form.hasAttribute('data-pomo-duration-form');
      const settings = durations || form.hasAttribute('data-pomo-settings-form');
      const previous = host.getState().items.find(entry => entry.id === id)?.config;
      const config = settings ? validatePomodoroConfig(durations ? readPomodoroDurations(fields, previous) : readPomodoroSettings(fields, previous)) : null;
      if (config?.sound) enableSound();
      const saved = await savePomodoroChange(host, id, item => {
        if (settings && JSON.stringify(item.config) !== settingsBase) throw new Error(t('组件设置已在其他位置修改，请重新打开。'));
        return settings ? { config, data: configurePomodoro(item.data, config) }
          : { config: item.config, data: changePomodoro(item.data, item.config, { type: 'task', task: String(fields.get('task') || '') }) };
      });
      if (saved) {
        if (settings) { settingsBase = JSON.stringify(config); if (durations) delete form.dataset.dirty; }
        else delete form.elements.task.dataset.dirty;
      }
      if (!controller.signal.aborted) { feedback(saved ? t('已保存') : t('未能保存，请重试。')); refresh(); }
    } catch (error) { feedback(error.message); }
  }, options);
  globalThis.addEventListener?.('visibilitychange', tick, options);
  const timer = setInterval(tick, 1000); tick();
  return () => { controller.abort(); clearInterval(timer); clearTimeout(feedbackTimer); observers.delete(refresh); };
}
