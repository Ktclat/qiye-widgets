// SPDX-License-Identifier: GPL-3.0-only
import { t, getLocale, formatDate, formatNumber } from './i18n.js';
import { getWidgetDefinition, validateWidgetConfig } from './widget-registry.js';

export function mountWidgetExtensions(container, host, registry = { get: getWidgetDefinition, validateConfig: validateWidgetConfig }) {
  const instances = [];
  for (const root of container.querySelectorAll('[data-widget]')) {
    const definition = registry.get(root.dataset.widget);
    if (!definition || definition.builtin || root.dataset.compact) continue;
    const controller = new AbortController();
    const getItem = () => host.getState().items.find(item => item.id === root.dataset.widgetId && item.widget === definition.type);
    const active = () => !controller.signal.aborted && root.isConnected && !!getItem();
    const report = error => { if (!error?.notified) host.toast?.(`${definition.title}：${error?.message || t("组件运行失败")}`); };
    const api = Object.freeze({
      root, t, locale: getLocale(), formatDate, formatNumber,
      size: root.dataset.displaySize || getItem()?.size,
      openSettings: () => { if(active())host.openDialog?.('widget-config', {item:getItem()}); },
      openDetail: () => { if(active())host.openDialog?.('widget-detail', {item:getItem()}); },
      signal: controller.signal,
      getConfig: () => structuredClone(getItem()?.config || {}),
      async updateConfig(patch) {
        if (!active()) return false;
        const item = getItem();
        const previous = item.config;
        const next = registry.validateConfig(definition.type, { ...item.config, ...patch });
        item.config = next;
        try { await host.save(); }
        catch (error) {
          if (getItem() === item && item.config === next) item.config = previous;
          throw error;
        }
        if (active()) instance.update();
        return true;
      },
      toast: message => { if (active()) host.toast?.(String(message)); },
    });
    const instance = {
      failed: false,
      update() {
        if (!active() || instance.failed) return;
        try {
          const result = definition.update?.(api);
          if (result && typeof result.then === 'function') {
            Promise.resolve(result).catch(() => {});
            throw new Error(t("update 必须同步返回；异步任务请在 mount 内启动"));
          }
        }
        catch (error) { instance.failed = true; report(error); }
      },
      cleanup() {
        controller.abort();
        try { instance.dispose?.(); } catch (error) { report(error); }
      },
    };
    try {
      const dispose = definition.mount?.(api);
      if (dispose && typeof dispose.then === 'function') Promise.resolve(dispose).catch(() => {});
      if (dispose !== undefined && typeof dispose !== 'function') throw new Error(t("mount 必须同步返回清理函数或 undefined"));
      instance.dispose = dispose;
    } catch (error) { instance.failed = true; controller.abort(); report(error); }
    instances.push(instance);
  }
  return {
    update() { for (const instance of instances) instance.update(); },
    cleanup() { for (const instance of instances.splice(0)) instance.cleanup(); },
  };
}
