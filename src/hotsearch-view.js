// SPDX-License-Identifier: GPL-3.0-only
import { t, formatDate } from './i18n.js';
import { escapeText as esc } from './html.js';
import { icon } from './icons.js';
import { bindFaviconImages } from './favicon-view.js';
import { windowControls } from './widget-app-controls.js';
import { HOTSEARCH_CATEGORIES, hotsearchCardSource, filterHotsearchSources, hotsearchSource } from './hotsearch-sources.js';
import { hotsearchClient, hotsearchHeat, HOTSEARCH_TTL } from './hotsearch-data.js';

export function hotsearchLogo(source) {
  return `<span class="hotsearch-logo site-visual${source.github?' is-monochrome':''}" data-favicon-site="${esc(source.url)}" data-favicon-selected="${esc(source.iconUrl)}" aria-hidden="true"><span class="site-fallback">${icon('globe')}</span><img class="site-favicon" alt="" referrerpolicy="no-referrer" decoding="async" draggable="false" hidden></span>`;
}
export function bindHotsearchLogos(root) { bindFaviconImages(root,{autoDiscover:false,targetSize:24}); }
const linkAttrs = state => `${state.settings?.openNewTab !== false ? ' target="_blank"' : ''} rel="noopener noreferrer"`;
export function hotsearchRows(data, source, state, limit = 100) {
  return `<ol class="hotsearch-rows">${data.items.slice(0,limit).map(row => `<li>${row.url?`<a href="${esc(row.url)}"${linkAttrs(state)} title="${esc(row.title)}">`:`<span class="hotsearch-unlinked" title="${esc(row.title+' · '+t('平台未提供原文链接'))}">`}<span class="hotsearch-rank rank-${Math.min(row.rank,4)}">${row.rank}</span><span class="hotsearch-title">${esc(row.title)}</span><span class="hotsearch-heat">${source.github && row.heat ? '★ ' : ''}${esc(hotsearchHeat(row.heat))}</span>${row.url?'</a>':'</span>'}</li>`).join('')}</ol>`;
}
function timestamp(data) {
  return t('更新于 {time}', {time:formatDate(new Date(data.updatedAt), {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})});
}
export function hotsearchBoard(source, item, state, collapsed = false) {
  const current = hotsearchClient.state(item.config,source.id), data = current.data;
  const stale = data && Date.now()-data.fetchedAt >= HOTSEARCH_TTL;
  const subscribed = item.config.subscriptions.includes(source.id);
  let content = '';
  if (current.status === 'error') content += `<div class="hotsearch-error" role="status"><span>${esc(current.error)}${data ? ' '+t('正在显示上次缓存。') : ''}</span><button type="button" data-hot-retry="${source.id}">${t('重试')}</button></div>`;
  if (data?.items.some(row=>!row.url)) content += `<p class="hotsearch-source-note">${t('部分条目未提供原文链接，可通过“打开平台”查看。')}</p>`;
  if (data?.items.length) content += hotsearchRows(data,source,state);
  else if (data && current.status !== 'loading' && current.status !== 'error') content += `<div class="hotsearch-empty">${t('这个榜单暂时没有内容。')}</div>`;
  else if (current.status !== 'error') content += `<div class="hotsearch-skeleton" role="status" aria-label="${t('正在加载榜单…')}">${Array.from({length:14}, (_,i)=>`<span><i>${i+1}</i><b></b></span>`).join('')}</div>`;
  return `<section class="hotsearch-board" data-hot-board="${source.id}" aria-label="${esc(t(source.name)+' · '+t(source.label))}" aria-busy="${current.status==='loading'}">
    <header>${hotsearchLogo(source)}<h3><a href="${esc(source.url)}"${linkAttrs(state)}>${esc(t(source.name))}<span> · ${esc(t(source.label))}</span></a></h3>
      <button class="hotsearch-subscribe" type="button" data-hot-subscribe="${source.id}" aria-pressed="${subscribed}" aria-label="${esc(t(subscribed?'取消订阅 {name}':'订阅 {name}',{name:t(source.name)}))}" title="${t(subscribed?'已订阅':'订阅')}">${icon(subscribed?'check':'plus')}</button>
      <button type="button" class="hotsearch-collapse" data-hot-collapse="${source.id}" aria-expanded="${!collapsed}" aria-label="${t(collapsed?'展开榜单':'收起榜单')}">${collapsed?'+':'−'}</button>
    </header><div class="hotsearch-board-content" ${collapsed?'hidden':''}>${content}</div>
    <footer ${collapsed?'hidden':''}><span>${data?esc(timestamp(data)):t('公开平台榜单')}${stale?' · '+t('缓存'):''}</span><a href="${esc(source.url)}"${linkAttrs(state)}>${t('打开平台')} ↗</a></footer>
  </section>`;
}
export function hotsearchSidebar(item, view) {
  const sources = filterHotsearchSources(item.config,view.category,view.query);
  return sources.map(source => `<div class="hotsearch-source-row" data-hot-sort="${source.id}">${view.category==='subscribed'?`<button type="button" class="hotsearch-grip" draggable="true" data-hot-drag="${source.id}" title="${t('拖动排序，或按 Alt + 方向键调整')}" aria-label="${esc(t('调整 {name} 的顺序',{name:t(source.name)}))}">⠿</button>`:''}<button type="button" class="hotsearch-source" data-hot-source="${source.id}" aria-pressed="${source.id===view.active}">${hotsearchLogo(source)}<span>${esc(t(source.name))}</span></button></div>`).join('') || `<p class="hotsearch-empty">${t(view.query?'没有找到匹配的平台':'还没有订阅榜单')}</p>`;
}
export function hotsearchMain(item, state, view) {
  const sources = filterHotsearchSources(item.config,view.category,view.query);
  if (!sources.length) return `<div class="hotsearch-empty hotsearch-main-empty">${icon('search')}<h3>${t(view.query?'没有找到匹配的平台':'还没有订阅榜单')}</h3><p>${t(view.query?'试试平台名称，例如知乎或 GitHub。':'在管理订阅中添加你喜欢的平台。')}</p><button type="button" data-hot-action="manage">${t('管理订阅')}</button></div>`;
  const shown = item.config.layout === 'grid' ? sources : sources.filter(source => source.id===view.active);
  return `<div class="hotsearch-boards ${item.config.layout==='grid'?'is-grid':''}">${shown.map(source => hotsearchBoard(source,item,state,view.collapsed.has(source.id))).join('')}</div>`;
}
export function hotsearchManager(item, view) {
  const sources = filterHotsearchSources(item.config,view.manageCategory,view.manageQuery);
  return `<header><h3 id="hotsearch-manage-title">${t('管理订阅')}</h3><button type="button" data-hot-action="manage-close" aria-label="${t('关闭订阅管理')}">${icon('close')}</button></header><p class="hotsearch-manager-description">${t('选择喜欢的平台，拖动或使用方向按钮调整顺序。')}</p>
    <p class="hotsearch-manager-feedback" role="status" hidden></p><div class="hotsearch-manager-tools"><input type="search" data-hot-manage-query value="${esc(view.manageQuery)}" placeholder="${t('搜索平台')}" aria-label="${t('搜索订阅平台')}"><select data-hot-manage-category aria-label="${t('平台分类')}">${HOTSEARCH_CATEGORIES.filter(([id])=>id!=='subscribed').map(([id,label])=>`<option value="${id}" ${id===view.manageCategory?'selected':''}>${t(label)}</option>`).join('')}</select></div>
    <div class="hotsearch-manager-sources">${sources.map(source => `<button type="button" data-hot-subscribe="${source.id}" aria-pressed="${item.config.subscriptions.includes(source.id)}">${hotsearchLogo(source)}<span>${esc(t(source.name))}<small>${esc(t(source.label))}</small></span>${icon(item.config.subscriptions.includes(source.id)?'check':'plus')}</button>`).join('') || `<p>${t('没有找到匹配的平台')}</p>`}</div>
    <h4>${t('订阅顺序')} <span>${item.config.subscriptions.length}</span></h4><ol class="hotsearch-sort-list">${item.config.subscriptions.map((id,index)=>{const source=hotsearchSource(id);return `<li data-hot-sort="${id}"><button type="button" class="hotsearch-grip" draggable="true" data-hot-drag="${id}" aria-label="${esc(t('调整 {name} 的顺序',{name:t(source.name)}))}" title="${t('拖动排序，或按 Alt + 方向键调整')}">⠿</button>${hotsearchLogo(source)}<span>${esc(t(source.name))}</span><button type="button" data-hot-move="${id}" data-direction="-1" ${index===0?'disabled':''} aria-label="${esc(t('上移 {name}',{name:t(source.name)}))}">↑</button><button type="button" data-hot-move="${id}" data-direction="1" ${index===item.config.subscriptions.length-1?'disabled':''} aria-label="${esc(t('下移 {name}',{name:t(source.name)}))}">↓</button><button type="button" data-hot-subscribe="${id}" aria-label="${esc(t('取消订阅 {name}',{name:t(source.name)}))}">${icon('close')}</button></li>`;}).join('') || `<p>${t('还没有订阅榜单')}</p>`}</ol>
    <details class="hotsearch-connection"><summary>${t('数据源设置')}</summary><form id="hotsearch-settings"><label>${t('热榜服务地址')}<input name="apiBase" type="url" value="${esc(item.config.apiBase)}" required maxlength="2048"></label><p>${t('默认使用 UAPI，也可填写兼容 DailyHotApi 的公开 HTTPS 服务。GitHub 新星榜直接使用 GitHub API。')}</p><label class="hotsearch-switch"><input name="enabled" type="checkbox" ${item.config.enabled?'checked':''}>${t('自动更新热搜榜')}</label><p>${t('关闭自动更新后，打开榜单或手动刷新仍会获取最新内容。')}</p><button type="submit">${t('保存数据源')}</button></form></details>`;
}
export function hotsearchWorkspace(item) {
  return `<section class="hotsearch-app"><header class="hotsearch-app-header"><span class="hotsearch-emblem">${icon('trending')}</span><h2 id="dialog-title">${esc(item.title)}</h2><div class="hotsearch-header-actions"><button type="button" data-hot-action="refresh" aria-label="${t('刷新榜单')}" title="${t('刷新榜单')}">${icon('refresh')}</button><button type="button" data-hot-action="manage" aria-label="${t('管理订阅')}" title="${t('管理订阅')}" aria-expanded="false" aria-controls="hotsearch-manager">${icon('sliders')}<span>${t('管理订阅')}</span></button><button type="button" data-hot-action="layout" aria-label="${t('切换多榜视图')}" title="${t('切换多榜视图')}">${icon('grid')}</button></div>${windowControls()}</header>
    <div class="hotsearch-toolbar"><button type="button" data-hot-action="search" aria-label="${t('搜索平台')}" aria-expanded="false" aria-controls="hotsearch-query">${icon('search')}</button><input id="hotsearch-query" type="search" placeholder="${t('搜索平台')}" aria-label="${t('搜索平台')}" hidden><nav class="hotsearch-categories" aria-label="${t('榜单分类')}">${HOTSEARCH_CATEGORIES.map(([id,label])=>`<button type="button" data-hot-category="${id}" aria-pressed="${id==='subscribed'}">${t(label)}</button>`).join('')}</nav></div>
    <p class="hotsearch-feedback" role="status" hidden></p><div class="hotsearch-layout"><aside class="hotsearch-sidebar" aria-label="${t('榜单平台')}"></aside><div class="hotsearch-main" role="region" aria-label="${t('榜单内容')}"></div></div>
    <footer class="hotsearch-app-footer">${t('热搜数据来自公开平台，按需聚合展示')}<span class="hotsearch-provider"></span></footer>
    <div class="hotsearch-manager-overlay" hidden><section id="hotsearch-manager" class="hotsearch-manager" role="dialog" aria-modal="true" aria-labelledby="hotsearch-manage-title" tabindex="-1"></section></div>
  </section>`;
}
export function hotsearchCard(item, state) {
  if (!['4x2','2x2'].includes(item.size)) {
    return `<button type="button" class="hs-card-launcher" data-action="widget-open" aria-label="${t('打开热搜榜')}" title="${esc(item.title || t('热搜榜'))}"><span class="hs-launcher-symbol" aria-hidden="true">${icon('trending')}</span></button>`;
  }
  const sources = filterHotsearchSources(item.config), source = hotsearchCardSource(item.config);
  const status = hotsearchClient.state(item.config,source.id);
  const hasRows = sources.length > 0 && Boolean(status.data?.items.length);
  const message = !sources.length ? '还没有订阅榜单' : status.status === 'error' ? '榜单暂不可用'
    : status.data ? '这个榜单暂时没有内容。' : status.status === 'loading' || item.config.enabled ? '正在加载榜单…' : '点击查看实时榜单';
  const content = hasRows ? hotsearchRows(status.data,source,state,20)
    : `<button type="button" class="hs-card-empty" data-action="widget-open" aria-label="${t('打开热搜榜')}" title="${esc(status.error || '')}"><span class="hs-empty-mark" aria-hidden="true">${icon('trending')}</span><span>${esc(t(message))}</span></button>`;
  if (!sources.length) return `<div class="hs-card-content">${content}</div>`;
  const cached = hasRows && (status.status === 'error' || Date.now()-status.data.fetchedAt >= HOTSEARCH_TTL);
  const description = hasRows ? timestamp(status.data)+(cached?' · '+t('正在显示上次缓存。'):'') : t(message);
  const id = 'hs-'+esc(item.id || 'card');
  return `<div class="hs-card-tabs" role="tablist" aria-label="${t('榜单平台')}">${sources.map(tab => `<button type="button" role="tab" id="${id}-${tab.id}-tab" data-hot-card-source="${tab.id}" aria-selected="${tab.id===source.id}" aria-controls="${id}-${tab.id}-panel" tabindex="${tab.id===source.id?0:-1}" title="${esc(t(tab.name))}">${esc(t(tab.name))}</button>`).join('')}</div>${sources.map(tab => `<div id="${id}-${tab.id}-panel" class="hs-card-content" role="tabpanel" aria-labelledby="${id}-${tab.id}-tab" tabindex="0" data-hot-card-panel="${tab.id}"${tab.id===source.id?` data-cached="${cached}" aria-busy="${status.status==='loading'}" title="${esc(description)}"`:' hidden'}>${tab.id===source.id?content:''}</div>`).join('')}`;
}

export function refreshHotsearchCards(container, state) {
  for (const root of container.querySelectorAll('[data-widget=hotsearch]:not([data-compact])')) {
    const item=state.items.find(item=>item.id===root.dataset.widgetId);
    if (item) { root.innerHTML=hotsearchCard(item,state); bindHotsearchLogos(root); }
  }
}
