// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { icon } from './icons.js';
import { escapeText } from './html.js';

export function appButton(action, label, glyph, extra = '') {
  return `<button type="button" class="widget-app-button" data-detail-action="${action}" aria-label="${escapeText(label)}" title="${escapeText(label)}" ${extra}>${icon(glyph)}</button>`;
}

export function windowControls(expanded = false) {
  return `<div class="widget-app-controls"><button type="button" class="widget-app-button" data-plugin-settings aria-label="${t('设置组件')}" title="${t('设置组件')}">${icon('settings')}</button>${appButton('window-expand', t(expanded ? '还原窗口' : '最大化窗口'), expanded ? 'minimize' : 'maximize', `aria-pressed="${expanded}"`)}<button type="button" class="widget-app-button" data-close aria-label="${t('关闭')}" title="${t('关闭')}">${icon('close')}</button></div>`;
}
