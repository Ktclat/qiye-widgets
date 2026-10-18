// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
// Opt in through widget-extensions.js; not installed on users' desktops by default.
export const counterWidget = {
  apiVersion: 3,
  type: 'counter', title: '计数器', description: '每张卡片独立保存的计数器', icon: 'plus', size: '2x2',
  fields: [
    { key: 'label', label: '计数名称', type: 'text', default: '今天的小进步', maxLength: 60, required: true },
    { key: 'count', label: '当前数值', type: 'number', default: 0, min: 0, max: 9999, integer: true },
  ],
  render({ config, escapeHtml, size }) {
    if (size === '1x1') return `<button class="extension-counter-mini" data-counter-add aria-label="${escapeHtml(config.label)} · ${t('加一')}"><strong data-counter-value>${config.count}</strong><span data-counter-label>${escapeHtml(config.label)}</span></button>`;
    return `<div class="extension-widget-content"><p data-counter-label>${escapeHtml(config.label)}</p><strong data-counter-value>${config.count}</strong><button type="button" class="secondary-button" data-counter-add>${t("加一")}</button></div>`;
  },
  mount({ root, signal, getConfig, updateConfig, toast }) {
    root.querySelector('[data-counter-add]').addEventListener('click', async event => {
      event.stopPropagation();
      const button = event.currentTarget;
      button.disabled = true;
      try { await updateConfig({ count: Math.min(9999, getConfig().count + 1) }); }
      catch (error) { if (!error.notified) toast(error.message); }
      finally { if (!signal.aborted) button.disabled = false; }
    }, { signal });
  },
  update({ root, getConfig }) {
    const config = getConfig();
    const output = root.querySelector('[data-counter-value]');
    if (output.textContent !== String(config.count)) output.textContent = String(config.count);
    root.querySelector('[data-counter-label]').textContent = config.label;
  },
};
