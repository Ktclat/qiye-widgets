// SPDX-License-Identifier: GPL-3.0-only
import { t, formatDate } from './i18n.js';
import { icon } from './icons.js';
import { escapeText } from './html.js';
import { appButton, windowControls } from './widget-app-controls.js';
import { listMemos } from './memos.js';

const e = escapeText;
export function memoTimestamp(value) { return formatDate(new Date(value), {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}); }

export function memoCard(item) {
  const entries = listMemos(item.data.entries).slice(0, 4);
  return `<div class="widget-heading"><span>${t('备忘录')}</span><button class="widget-icon-button" type="button" data-action="widget-memo-new" aria-label="${t('新建备忘录')}">+</button></div><div class="memo-card-list">${entries.map(entry => `<button type="button" data-action="widget-memo-open" data-memo-id="${e(entry.id)}"><strong>${entry.pinned ? '⌑ ' : ''}${e(entry.title || t('未命名备忘录'))}</strong><span>${e(entry.text.slice(0, 100) || t('空白备忘录'))}</span></button>`).join('') || `<button type="button" data-action="widget-memo-new">${t('记录一个想法')}</button>`}</div><button class="memo-card-footer" type="button" data-action="widget-memo-open">${t('查看全部 {count} 条', {count:item.data.entries.length})} ↗</button>`;
}

export function memoList(entries, active) {
  return entries.map(entry => `<button type="button" class="memo-entry ${entry.id === active ? 'selected' : ''}" data-detail-action="memo-select" data-id="${e(entry.id)}" aria-current="${entry.id === active ? 'true' : 'false'}"><strong>${entry.pinned ? '⌑ ' : ''}${e(entry.title || t('未命名备忘录'))}</strong><small>${e(memoTimestamp(entry.updatedAt))}</small><span>${e(entry.text.slice(0, 100) || t('空白备忘录'))}</span></button>`).join('') || `<p class="memo-no-results">${t('没有匹配的备忘录')}</p>`;
}

export function memoDetail(item, view) {
  const entries = listMemos(item.data.entries, view.query, view.sort), active = item.data.entries.find(entry => entry.id === view.active);
  return `<div class="memo-workspace ${view.mobileList ? 'show-memo-list' : ''}"><aside class="memo-sidebar"><div class="memo-sidebar-heading"><h2 id="dialog-title" tabindex="-1">${t('备忘录')}</h2><select id="memo-sort" aria-label="${t('排序')}"><option value="updated" ${view.sort === 'updated' ? 'selected' : ''}>${t('最近修改')}</option><option value="title" ${view.sort === 'title' ? 'selected' : ''}>${t('按标题')}</option></select></div><input id="memo-query" type="search" value="${e(view.query)}" placeholder="${t('搜索备忘录')}" aria-label="${t('搜索备忘录')}"><div id="memo-list">${memoList(entries, view.active)}</div><button type="button" class="memo-new-button" data-detail-action="memo-new" aria-label="${t('新建备忘录')}" title="${t('新建备忘录')}">${icon('plus')}</button></aside>
    <section class="memo-editor"><header class="memo-editor-header">${appButton('memo-toggle-list', t('备忘录列表'), 'panel')}${active ? `<input id="memo-title" value="${e(active.title)}" maxlength="120" placeholder="${t('未命名备忘录')}" aria-label="${t('备忘录标题')}">` : `<span class="memo-empty-heading">${t('备忘录')}</span>`}<div class="memo-document-controls">${active ? appButton('memo-pin', t(active.pinned ? '取消置顶' : '置顶'), 'pin', `aria-pressed="${active.pinned}"`) + appButton('memo-export', t('导出文本'), 'download') + appButton('memo-delete', t('删除'), 'trash') : ''}</div>${windowControls(view.expanded)}</header>
    ${view.deleted ? `<div class="memo-deleted" role="status">${t('备忘录已删除')}<button type="button" data-detail-action="memo-undo">${t('撤销')}</button></div>` : ''}
    ${active ? `<textarea id="memo-text" data-memo-id="${e(active.id)}" maxlength="100000" placeholder="${t('开始记录…')}" aria-label="${t('备忘录内容')}">${e(active.text)}</textarea><footer class="memo-status"><div><span>${t('最后编辑')} <time id="memo-updated">${e(memoTimestamp(active.updatedAt))}</time></span><span>${t('创建时间')} ${e(memoTimestamp(active.createdAt))}</span></div><div><span id="memo-save-status" role="status">${t('已保存在本机')}</span><span id="memo-count">${t('{count} 字符', {count:active.text.length})}</span></div></footer>` : `<div class="memo-empty">${icon('note')}<p>${t('选择或新建一条备忘录')}</p><button type="button" data-detail-action="memo-new">${t('新建备忘录')}</button></div>`}</section></div>`;
}
