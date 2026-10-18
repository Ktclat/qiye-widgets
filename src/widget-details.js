// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { localDateKey, parseDate } from './calendar.js';
import { newCalendarView, calendarAction, calendarChange, calendarKeydown } from './calendar-controls.js';
import { newMemo, listMemos, MEMO_LIMIT } from './memos.js';
import { createWidgetDraft } from './widget-drafts.js';
import { calendarDetail } from './calendar-view.js';
import { memoDetail, memoList, memoTimestamp } from './memo-view.js';
import { escapeText } from './html.js';

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name.replace(/[\\/:*?"<>|]/g, '_');
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createWidgetDetails(host) {
  const drafts = new Map();
  let active = null, closing = null;
  const currentItem = session => host.getState().items.find(item => item.id === session.item.id);
  const exportDraft = session => download(JSON.stringify({widget:session.item.widget, data:session.draft.data}, null, 2), 'Qiye-unsaved-widget.json', 'application/json');

  function updateStatus(session) {
    const {root, draft} = session;
    if (!root?.isConnected) return;
    root.querySelector('#memo-save-status')?.replaceChildren(t(draft.error ? '保存失败，请重试' : draft.dirty ? '保存中…' : '已保存在本机'));
    const feedback = root.querySelector('.widget-save-feedback');
    feedback.hidden = !draft.error;
    if (draft.error) {
      feedback.innerHTML = `<p>${t('保存失败。草稿仍保留在此窗口，可重试或导出。')}</p><small>${escapeText(draft.error.message)}</small><div class="detail-toolbar"><button type="button" data-detail-action="save-retry">${t('重试保存')}</button><button type="button" data-detail-action="draft-export">${t('导出未保存的数据')}</button></div>`;
    }
  }

  function renderBody(session) {
    const item = {...(currentItem(session) || session.item), data:session.draft.data};
    const body = item.widget === 'calendar' ? calendarDetail(item, session.view)
      : memoDetail(item, session.view);
    return `<div class="widget-save-feedback" role="alert" hidden></div>${body}`;
  }

  function redraw(session) {
    if (!session.root?.isConnected) return;
    const previous = session.root.querySelector('#memo-text');
    const selection = previous && {id:previous.dataset.memoId, start:previous.selectionStart, end:previous.selectionEnd, scroll:previous.scrollTop};
    session.root.innerHTML = renderBody(session);
    const editor = session.root.querySelector('#memo-text');
    if (editor && selection?.id === editor.dataset.memoId) {
      editor.setSelectionRange(selection.start, selection.end);
      editor.scrollTop = selection.scroll;
    }
    updateStatus(session);
  }

  async function flush(session) {
    const saved = await session.draft.flush();
    if (saved) host.refreshCards();
    return saved;
  }

  function newEntry(session) {
    const entries = session.draft.data.entries;
    if (entries.length >= MEMO_LIMIT) {
      host.toast(t('备忘录最多支持 {count} 条', {count:MEMO_LIMIT}));
      return;
    }
    const entry = newMemo(host.uid());
    entries.push(entry);
    session.view.active = entry.id;
    session.view.query = '';
    session.view.mobileList = false;
    session.draft.changed();
    redraw(session);
    session.root.querySelector('#memo-title')?.focus();
  }

  async function action(session, event) {
    const target = event.target.closest('[data-detail-action],[data-calendar-date]');
    if (!target) return;
    event.preventDefault();
    const {view, draft} = session, data = draft.data, name = target.dataset.detailAction;
    if (session.item.widget === 'calendar' && calendarAction(session, target, redraw)) return;
    if (name === 'window-expand') {
      view.expanded = !view.expanded;
      session.root.closest('dialog').classList.toggle('widget-app-expanded', view.expanded);
      redraw(session);
      session.root.querySelector('[data-detail-action=window-expand]').focus();
    } else if (name === 'event-delete') {
      data.events = data.events.filter(entry => entry.id !== target.dataset.id);
      draft.changed();
      redraw(session);
    } else if (name === 'memo-new') {
      newEntry(session);
    } else if (name === 'memo-select') {
      view.active = target.dataset.id;
      view.mobileList = false;
      redraw(session);
      session.root.querySelector('#memo-title')?.focus();
    } else if (name === 'memo-toggle-list') {
      view.mobileList = !view.mobileList;
      redraw(session);
      session.root.querySelector(view.mobileList ? '#memo-query' : '#memo-title')?.focus();
    } else if (name === 'memo-undo' && view.deleted) {
      if (data.entries.length >= MEMO_LIMIT) return;
      data.entries.push(view.deleted);
      view.active = view.deleted.id;
      view.deleted = null;
      draft.changed();
      redraw(session);
      await flush(session);
    } else if (name === 'save-retry') {
      await flush(session);
    } else if (name === 'draft-export') {
      exportDraft(session);
    } else {
      const entry = data.entries?.find(entry => entry.id === view.active);
      if (!entry) return;
      if (name === 'memo-pin') {
        entry.pinned = !entry.pinned;
        draft.changed();
        redraw(session);
        session.root.querySelector('[data-detail-action=memo-pin]')?.focus();
      } else if (name === 'memo-export') {
        download(entry.title + '\n\n' + entry.text, (entry.title || 'Qiye-memo').slice(0, 80) + '.txt', 'text/plain;charset=utf-8');
      } else if (name === 'memo-delete') {
        data.entries = data.entries.filter(memo => memo.id !== entry.id);
        view.active = listMemos(data.entries)[0]?.id || '';
        view.deleted = entry;
        draft.changed();
        redraw(session);
        await flush(session);
      }
    }
  }

  function input(session, event) {
    const {root, draft, view} = session, target = event.target;
    if (session.item.widget === 'calendar') {
      if (target.closest('[data-date-tool]')) calendarChange(session, target, redraw);
      return;
    }
    if (target.id === 'memo-query') view.query = target.value;
    else if (target.id === 'memo-title' || target.id === 'memo-text') {
      const entry = draft.data.entries.find(entry => entry.id === view.active);
      if (!entry) return;
      entry[target.id === 'memo-title' ? 'title' : 'text'] = target.value;
      entry.updatedAt = Date.now();
      draft.changed();
      root.querySelector('#memo-count').textContent = t('{count} 字符', {count:entry.text.length});
      root.querySelector('#memo-updated').textContent = memoTimestamp(entry.updatedAt);
    } else return;
    root.querySelector('#memo-list').innerHTML = memoList(listMemos(draft.data.entries, view.query, view.sort), view.active);
  }

  function change(session, event) {
    const target = event.target;
    if (session.item.widget === 'calendar' && calendarChange(session, target, redraw)) return;
    if (target.id === 'memo-sort') {
      session.view.sort = target.value;
      redraw(session);
      session.root.querySelector('#memo-sort').focus();
    }
  }

  async function submit(session, event) {
    event.preventDefault();
    event.stopPropagation();
    const form = event.target, data = new FormData(form);
    if (form.id === 'calendar-event-form') {
      const title = String(data.get('title')).trim();
      if (!title) return;
      if (session.draft.data.events.length >= 500) { host.toast(t('日程最多支持 500 条')); return; }
      session.draft.data.events.push({id:host.uid(), date:session.view.date, title});
      session.draft.changed();
      redraw(session);
      await flush(session);
    }
  }

  function close() {
    const session = active;
    if (!session) return closing;
    if (closing) return closing;
    if (session.root) session.root.inert = true;
    const job = flush(session).then(saved => {
      if (saved) {
        active = null;
        session.controller?.abort();
        session.root = null;
        drafts.delete(session.item.id);
      } else if (session.root) session.root.inert = false;
      return saved;
    }).catch(error => { if (session.root) session.root.inert = false; throw error; })
      .finally(() => { if (closing === job) closing = null; });
    closing = job;
    return job;
  }

  return {
    close,
    render(item, data = {}) {
      let session = drafts.get(item.id);
      if (!session) {
        const today = parseDate(data.date) ? data.date : localDateKey();
        session = {item, view:{...newCalendarView(today), query:'', sort:'updated', active:data.memoId || listMemos(item.data.entries || [])[0]?.id || ''}};
        session.draft = createWidgetDraft(item, host.saveData, () => {
          updateStatus(session);
          if (!session.draft.dirty) host.refreshCards();
        });
        drafts.set(item.id, session);
      }
      active = session;
      return renderBody(session);
    },
    mount(element, data = {}) {
      const session = active;
      session.root = element;
      session.controller = new AbortController();
      const options = {signal:session.controller.signal};
      element.addEventListener('click', event => { action(session,event).catch(error => host.toast(error.message)); }, options);
      element.addEventListener('input', event => input(session,event), options);
      element.addEventListener('change', event => change(session,event), options);
      if (session.item.widget === 'calendar') element.addEventListener('keydown', event => calendarKeydown(session, event, redraw), options);
      element.addEventListener('submit', event => { submit(session,event).catch(error => host.toast(error.message)); }, options);
      globalThis.addEventListener('pagehide', () => { void flush(session); }, options);
      updateStatus(session);
      element.closest('dialog').classList.toggle('widget-app-expanded', !!session.view.expanded);
      if (data.newMemo) newEntry(session);
    },
  };
}
