// SPDX-License-Identifier: GPL-3.0-only
import { escapeText as esc } from './html.js';
import { t } from './i18n.js';
import { WORKDAY_COLORS } from './widget-life.js';

// Compact cards have deliberately different information hierarchies from full cards.
export function renderWidgetSummary(item, model, symbol) {
  const portrait = item.size === '1x2';
  const wide = item.size === '2x1';
  const textCard = ['notes', 'quote'].includes(item.widget);
  const color = item.widget === 'notes' ? ` w-notes-${item.config.color}` : '';
  const background=WORKDAY_COLORS.includes(item.config.background)?item.config.background:WORKDAY_COLORS[0],ink=background==='#ece8df'?'#39372e':'#f4f5f7';
  const appearance=item.widget==='workday'?` style="--w-bg:${background};--w-fg:${ink};--w-heading:${ink};--w-muted:${ink}"`:'';
  const value = `<span class="compact-primary" style="--value-digits:${Math.max(2,model.value.length)}"><strong class="compact-value">${esc(model.value)}</strong>${model.unit ? `<small class="compact-unit">${esc(model.unit)}</small>` : ''}</span>`;
  const info = `<span class="compact-copy"><span class="compact-caption">${esc(model.caption)}</span>${portrait || wide ? `<span class="compact-detail">${esc(model.detail)}</span>` : ''}</span>`;
  const timer = item.widget === 'focus' && portrait ? `<button type="button" class="compact-quick" data-action="widget-focus-toggle"><span data-live="focus-button">${item.data.focus.running ? t('暂停') : t('开始')}</span></button>` : '';
  return `<div class="widget-inner widget-compact w-${esc(item.widget)} compact-${esc(item.widget)}${color}${textCard ? ' compact-text-card' : ''}" data-widget="${esc(item.widget)}" data-widget-id="${esc(item.id)}" data-display-size="${item.size}" data-compact="true"${appearance}>
    <button type="button" class="compact-open" data-action="widget-open" aria-label="${esc(item.title)}">
      <span class="compact-symbol" aria-hidden="true">${symbol}</span>${value}${info}
      ${portrait ? `<span class="compact-meta">${esc(model.meta)}</span>` : ''}
    </button>${timer}</div>`;
}
