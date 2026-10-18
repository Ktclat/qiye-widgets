// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { icon } from './icons.js';
import { bookmarkPath, bookmarkDescendants, bookmarkSelection, bookmarkChanges, checkBookmarkChange, changeLocalBookmarkBatch, listBookmarks, browserBookmarkClient } from './bookmarks.js';
import { bookmarkSidebar, bookmarkRows, bookmarkBreadcrumb, bookmarkLocation, bookmarkEditor, bookmarkCounts, bookmarkCard } from './bookmarks-view.js';

export function bindBookmarkWorkspace(root, initial, host, client = browserBookmarkClient) {
  const controller = new AbortController(), options = {signal:controller.signal};
  const find = selector => root.querySelector(selector);
  const current = () => host.getState().items.find(item => item.id === initial.id);
  const alive = () => !controller.signal.aborted && root.isConnected && !!current();
  const view = {source:'local', folder:'', scope:'folder', query:'', sort:'manual', expanded:new Set(), selected:new Set(), managing:false, loading:false, limit:100};
  let granted = false, browserNodes = [], editor = null, saving = false, switching = false, sequence = 0, timer, expanded = false, dragging = null, pendingReload = false;
  const nodes = () => view.source === 'browser' ? browserNodes : current()?.data.nodes || [];
  const feedback = message => { if (alive()) { find('.bm-feedback').textContent = message; find('.bm-feedback').hidden = !message; } };

  function render() {
    if (!alive()) return;
    const entries = nodes();
    view.selected = new Set([...view.selected].filter(id => entries.some(node => node.id === id && !node.readonly && !node.protected)));
    if (view.folder && !entries.some(node => node.id === view.folder && node.url === null)) view.folder = '';
    const sidebar = find('.bm-sidebar'), scroll = sidebar.scrollTop;
    sidebar.innerHTML = bookmarkSidebar(entries, view); sidebar.scrollTop = scroll;
    find('.bm-breadcrumb').innerHTML = bookmarkBreadcrumb(entries, view);
    const list = find('.bm-list'), listScroll = list.scrollTop;
    list.innerHTML = bookmarkRows(entries, view, host.getState()); list.scrollTop = listScroll;
    const location = bookmarkLocation(entries,view.folder);
    find('.bm-path-text').textContent = view.query ? t('搜索结果') : location;
    find('.bm-path summary').title = location;
    const counts = bookmarkCounts(entries);
    find('.bm-footer').textContent = t('{links} 个书签 · {folders} 个文件夹', counts);
    find('.bm-footer').title = find('.bm-footer').textContent;
    find('.bm-source-label').textContent = t(view.source === 'browser' ? '浏览器收藏' : '独立收藏');
    find('.bm-source-glyph').innerHTML = icon(view.source === 'browser' ? 'globe' : 'bookmark');
    find('.bm-sort summary').title = t('书签排序') + ' · ' + find('[data-bm-sort]').selectedOptions[0].textContent;
    find('.bm-source-note').textContent = t(view.source === 'browser' ? '正在管理浏览器原始收藏，修改会直接生效。' : client.supported() ? '独立收藏随此组件保存；连接浏览器后可直接管理原始收藏，两者各自保留。' : '独立收藏随此组件保存。安装栖页扩展后可连接浏览器书签。');
    find('.bm-source-note').classList.toggle('is-browser', view.source === 'browser');
    for (const source of root.querySelectorAll('[data-bm-source]')) {
      source.setAttribute('aria-pressed', String(source.dataset.bmSource === view.source));
      source.disabled = switching || saving || source.dataset.bmSource === 'browser' && !client.supported();
      if (source.dataset.bmSource === 'browser') source.title = t(!client.supported() ? '独立收藏随此组件保存。安装栖页扩展后可连接浏览器书签。' : granted ? '浏览器收藏' : '连接浏览器书签');
    }
    const writable = view.source === 'local' || entries.some(node => node.url === null && !node.readonly);
    const busy = saving || switching || view.loading;
    for (const action of ['new-folder','new-bookmark']) find(`[data-bm-action=${action}]`).disabled = !writable || busy;
    find('[data-bm-action=refresh]').disabled = busy;
    const selected = [...view.selected], activeId = selected.length === 1 ? selected[0] : selected.length ? '' : view.folder;
    const active = entries.find(node => node.id === activeId);
    for (const action of ['edit','move','delete']) {
      const control = find(`.bm-commands [data-bm-action=${action}]`);
      control.dataset.id = activeId; control.disabled = busy || !active || active.readonly || active.protected;
    }
    find('[data-bm-action=manage]').setAttribute('aria-pressed',String(view.managing));
    find('[data-bm-action=manage]').setAttribute('aria-label',t(view.managing ? '完成管理' : '管理收藏'));
    find('[data-bm-action=manage] span').textContent = t(view.managing ? '完成' : '管理');
    find('[data-bm-action=manage]').disabled = busy;
    find('.bm-selection-count').textContent = selected.length;
    find('.bm-selection-count').hidden = !selected.length;
    find('.bm-selection-count').title = t('已选择 {count} 项', {count:selected.length});
    find('.bm-batch-actions').hidden = !view.managing;
    root.classList.toggle('is-managing',view.managing);
    root.classList.toggle('has-query',!!view.query);
    for (const action of ['batch-move','batch-delete']) find(`[data-bm-action=${action}]`).disabled = busy || !selected.length;
    const selectable = listBookmarks(entries,view).filter(node => !node.readonly && !node.protected);
    const all = find('[data-bm-select-all]'), total = selectable.filter(node => view.selected.has(node.id)).length;
    all.checked = !!selectable.length && total === selectable.length; all.indeterminate = total > 0 && total < selectable.length;
    all.disabled = busy || !selectable.length;
    for (const input of root.querySelectorAll('[data-bm-select]')) input.disabled ||= busy;
  }

  function navigate(folder) {
    if (saving) return;
    closeMenus();
    view.folder = folder; view.scope = 'folder'; view.query = ''; view.limit = 100; find('[data-bm-query]').value = '';
    for (const node of bookmarkPath(nodes(), folder)) view.expanded.add(node.id);
    render(); find('.bm-list').scrollTop = 0;
  }

  function closeEditor(force = false) {
    if (saving && !force) return;
    editor = null; find('.bm-editor-overlay').hidden = true;
    for (const selector of ['.bm-header','.bm-layout']) find(selector).inert = false;
    find('.bm-commands summary').focus({preventScroll:true});
  }

  function openEditor(type, id = '', folder = false, ids = null) {
    if (saving || switching || view.loading) return;
    closeMenus();
    const entries = nodes(), selected = ids ? bookmarkSelection(entries,ids) : [], node = ids ? selected[0] : entries.find(entry => entry.id === id);
    if (type !== 'create' && (!node || node.readonly || node.protected)) return;
    let parentId = type === 'move' ? node.parentId : view.folder;
    if (view.source === 'browser' && (!parentId || entries.find(entry => entry.id === parentId)?.readonly)) parentId = entries.find(entry => entry.url === null && !entry.readonly)?.id;
    editor = {type,id,folder,parentId,source:view.source,baseline:JSON.stringify(current().data)};
    if (ids) { editor.ids = selected.map(entry => entry.id); editor.changes = bookmarkChanges(entries,editor.ids,type); }
    if (node) editor.expectedNode = JSON.stringify({title:node.title,url:node.url,parentId:node.parentId});
    if (type === 'delete' && node.url === null) {
      const ids = bookmarkDescendants(entries,id);
      editor.expectedSubtree = JSON.stringify(entries.filter(entry => ids.has(entry.id)));
    }
    find('.bm-editor').innerHTML = bookmarkEditor(entries,view,editor);
    find('.bm-editor-overlay').hidden = false;
    for (const selector of ['.bm-header','.bm-layout']) find(selector).inert = true;
    (find('.bm-editor input') || find('.bm-editor select') || find('.bm-editor [data-bm-action=cancel]'))?.focus();
  }

  async function reload({initialLoad = false, showLoading = false} = {}) {
    pendingReload = false;
    const ticket = ++sequence;
    if (showLoading) { view.loading = true; render(); }
    try {
      const snapshot = await client.load();
      if (!alive() || ticket !== sequence) return;
      granted = snapshot.granted; browserNodes = snapshot.nodes;
      if (initialLoad && initial.config.source === 'browser' && granted) view.source = 'browser';
      if (!granted && view.source === 'browser') {
        view.source = 'local'; view.folder = ''; view.expanded.clear(); view.selected.clear(); closeEditor(true);
        feedback(t('书签授权已失效，已返回独立收藏'));
      }
    } catch (error) { if (alive() && ticket === sequence) feedback(error.message || t('读取收藏失败，请重试')); }
    finally { if (alive() && ticket === sequence) { view.loading = false; render(); } }
  }

  async function selectSource(source) {
    closeMenus(true);
    if (switching || saving || source === view.source) return;
    // The permission request is deliberately the first asynchronous operation.
    const permission = source === 'browser' && !granted ? client.request() : Promise.resolve(true);
    switching = true; feedback(''); render();
    try {
      if (!await permission) { feedback(t('未授予书签权限，继续使用独立收藏')); return; }
      if (!alive()) return;
      if (source === 'browser') {
        await reload();
        if (!alive() || !granted) return;
      }
      const item = current();
      await host.saveSettings(item.id, {title:item.title, config:{...item.config,source}}, JSON.stringify([item.title,item.config]));
      if (!alive()) return;
      if (source === 'browser' && !granted) return;
      view.source = source; view.folder = ''; view.scope = 'folder'; view.expanded.clear(); view.selected.clear(); view.query = ''; find('[data-bm-query]').value = '';
    } catch (error) { feedback(error.message || t('保存失败，请重试')); }
    finally { switching = false; render(); }
  }

  async function persistChanges(session, changes) {
    const before = nodes(), completed = [];
    try {
      if (session.source === 'local') {
        const next = changeLocalBookmarkBatch(JSON.parse(session.baseline),changes);
        await host.saveData(initial.id,next,session.baseline);
        completed.push(...changes.map(change => change.id));
      } else {
        // Native writes are sequential, and each mutation rechecks permission and
        // the reviewed node/subtree. Completed writes cannot be rolled back safely.
        for (const change of changes) { await client.mutate(change); completed.push(change.id); }
      }
    } catch (error) {
      error.completed = completed.length;
      throw error;
    } finally {
      for (const id of completed) for (const child of bookmarkDescendants(before,id)) view.selected.delete(child);
      if (session.source === 'browser') await reload();
      if (completed.length) host.refreshCards?.();
    }
  }

  async function submit(event) {
    if (event.target.id !== 'bm-editor-form') return;
    event.preventDefault(); event.stopPropagation();
    if (!editor || saving || switching) return;
    const session = editor, form = event.target, values = new FormData(form);
    const entries = nodes(), node = entries.find(entry => entry.id === session.id);
    const change = {type:session.type,id:session.id,expectedSubtree:session.expectedSubtree,expectedNode:session.expectedNode};
    if (session.type === 'create') { change.id = host.uid(); change.dateAdded = Date.now(); }
    if (session.type === 'create' || session.type === 'update') {
      change.title = String(values.get('title') || '').trim();
      change.url = (session.type === 'create' ? session.folder : node?.url === null) ? null : String(values.get('url') || '').trim();
    }
    if (session.type === 'create' || session.type === 'move') change.parentId = String(values.get('parentId') ?? '');
    saving = true; form.querySelector('fieldset').disabled = true;
    const errorNode = form.querySelector('.bm-editor-feedback'); errorNode.hidden = true;
    try {
      const changes = session.ids ? session.changes.map(entry => ({...entry,...(session.type === 'move' ? {parentId:change.parentId} : {})})) : [change];
      await persistChanges(session,changes);
      if (!alive()) return;
      closeEditor(true); feedback(t('收藏已保存'));
      saving = false;
      if (session.type === 'create' || session.type === 'move') navigate(change.parentId);
      else render();
    } catch (error) {
      if (!alive()) return;
      if (error.completed) {
        closeEditor(true);
        feedback(t('已完成 {done} 项，剩余 {left} 项未完成：{error}', {done:error.completed,left:session.changes.length - error.completed,error:error.message}));
      } else { errorNode.textContent = error.message || t('保存失败，请重试'); errorNode.hidden = false; }
    } finally {
      saving = false;
      if (alive()) {
        form.querySelector('fieldset').disabled = false; render();
        if (editor === session) form.querySelector('input,select,button[type=submit]')?.focus();
      }
    }
  }

  function closeMenus(restoreFocus = false) {
    const open = root.querySelector('[data-bm-menu][open]');
    for (const menu of root.querySelectorAll('[data-bm-menu]')) menu.open = false;
    if (restoreFocus) open?.querySelector('summary').focus({preventScroll:true});
    return !!open;
  }
  for (const menu of root.querySelectorAll('[data-bm-menu]')) {
    menu.addEventListener('toggle', () => {
      if (menu.open) for (const other of root.querySelectorAll('[data-bm-menu]')) if (other !== menu) other.open = false;
    }, options);
  }
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('[data-bm-menu]')) closeMenus();
  }, options);
  root.addEventListener('focusout', event => {
    const menu = event.target.closest('[data-bm-menu]');
    if (menu && event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
  }, options);

  root.addEventListener('click', event => {
    if (view.managing && event.target.closest('a.bm-row-open')) {
      event.preventDefault();
      toggleSelection(event.target.closest('[data-bm-row]').dataset.bmRow); return;
    }
    const target = event.target.closest('button');
    if (!target || target.hasAttribute('data-close')) return;
    if (target.dataset.detailAction === 'window-expand') {
      expanded = !expanded; root.closest('dialog').classList.toggle('widget-app-expanded',expanded);
      target.innerHTML = icon(expanded ? 'minimize' : 'maximize'); target.setAttribute('aria-pressed',String(expanded));
      target.title = t(expanded ? '还原窗口' : '最大化窗口'); target.setAttribute('aria-label',target.title); return;
    }
    if (target.hasAttribute('data-bm-source')) { void selectSource(target.dataset.bmSource); return; }
    if (target.hasAttribute('data-bm-folder')) { navigate(target.dataset.bmFolder); focusFolder(target.dataset.bmFolder); return; }
    if (target.hasAttribute('data-bm-toggle')) {
      const id = target.dataset.bmToggle;
      if (view.expanded.has(id)) view.expanded.delete(id); else view.expanded.add(id);
      render(); focusFolder(id); return;
    }
    const action = target.dataset.bmAction, id = target.dataset.id;
    if (action === 'manage') {
      closeMenus(); view.managing = !view.managing; view.selected.clear(); render(); return;
    }
    if (action === 'select-item') {
      if (saving || switching || view.loading) return;
      view.managing = true; view.selected = new Set([id]); render();
      find('.bm-commands').open = true; find('.bm-commands [data-bm-action=edit]').focus(); return;
    }
    if (action === 'batch-move' || action === 'batch-delete') openEditor(action === 'batch-move' ? 'move' : 'delete','',false,[...view.selected]);
    if (action === 'new-folder' || action === 'new-bookmark') openEditor('create','',action === 'new-folder');
    if (action === 'edit') openEditor('update',id);
    if (action === 'move' || action === 'delete') openEditor(action,id);
    if (action === 'cancel') closeEditor();
    if (action === 'locate') navigate(nodes().find(node => node.id === id)?.parentId || '');
    if (action === 'clear-search') { view.query = ''; find('[data-bm-query]').value = ''; render(); find('[data-bm-query]').focus(); }
    if (action === 'more') { view.limit += 100; const scroll = find('.bm-list').scrollTop; render(); find('.bm-list').scrollTop = scroll; }
    if (action === 'refresh') { closeMenus(true); feedback(''); void reload({showLoading:true}); }
  }, options);
  root.addEventListener('input', event => { if (event.target.matches('[data-bm-query]')) { view.query = event.target.value.trim(); view.limit = 100; render(); } }, options);
  function toggleSelection(id) {
    if (saving || switching || view.loading) return;
    const node = nodes().find(entry => entry.id === id);
    if (!node || node.readonly || node.protected) return;
    if (view.selected.has(id)) view.selected.delete(id); else view.selected.add(id);
    const scroll = find('.bm-list').scrollTop;
    render(); find('.bm-list').scrollTop = scroll;
  }
  root.addEventListener('change', event => {
    if (event.target.matches('[data-bm-sort]')) { view.sort = event.target.value; render(); }
    if (event.target.matches('[data-bm-select]')) {
      const id = event.target.dataset.bmSelect, inTree = !!event.target.closest('.bm-sidebar');
      toggleSelection(id);
      [...root.querySelectorAll(`${inTree ? '.bm-sidebar' : '.bm-list'} [data-bm-select]`)].find(input => input.dataset.bmSelect === id)?.focus({preventScroll:true});
    }
    if (event.target.matches('[data-bm-select-all]')) {
      for (const node of listBookmarks(nodes(),view).filter(node => !node.readonly && !node.protected)) {
        if (event.target.checked) view.selected.add(node.id); else view.selected.delete(node.id);
      }
      render();
    }
  }, options);
  root.addEventListener('submit', event => { void submit(event); }, options);
  root.closest('dialog').addEventListener('cancel', event => {
    if (editor) { event.preventDefault(); event.stopImmediatePropagation(); closeEditor(); }
    else if (closeMenus(true)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, {capture:true, signal:controller.signal});

  function focusFolder(id) { [...root.querySelectorAll('[role=treeitem]')].find(button => button.dataset.bmFolder === id)?.focus({preventScroll:true}); }

  function clearDrop() { for (const target of root.querySelectorAll('[data-bm-drop]')) target.removeAttribute('data-bm-drop'); }
  function dropTarget(event) {
    if (!dragging || saving || editor || dragging.source !== view.source) return null;
    const entries = nodes(), row = event.target.closest('[data-bm-row]'), folder = event.target.closest('[data-bm-folder]');
    let parentId, beforeId, element, position = 'inside';
    if (row) {
      const node = entries.find(entry => entry.id === row.dataset.bmRow);
      if (!node) return null;
      const rect = row.getBoundingClientRect(), fraction = (event.clientY - rect.top) / rect.height;
      if (node.url === null && fraction > .24 && fraction < .76) { parentId = node.id; element = row; }
      else {
        if (view.sort !== 'manual' || view.query) return null;
        parentId = node.parentId; element = row; position = fraction < .5 ? 'before' : 'after';
        const siblings = entries.filter(entry => entry.parentId === parentId && !dragging.ids.includes(entry.id));
        const at = siblings.findIndex(entry => entry.id === node.id);
        if (at < 0) return null;
        beforeId = position === 'before' ? node.id : siblings[at + 1]?.id;
      }
    } else if (folder) { parentId = folder.dataset.bmFolder; element = folder; }
    else if (event.target.closest('.bm-list') && !view.query) { parentId = view.folder; element = find('.bm-list'); }
    else return null;
    const destination = {parentId,...(beforeId !== undefined ? {beforeId} : {})};
    if ((view.sort !== 'manual' || view.query) && dragging.ids.every(id => entries.find(node => node.id === id)?.parentId === parentId)) return null;
    try { for (const id of dragging.ids) checkBookmarkChange(entries,{type:'move',id,...destination},view.source); }
    catch { return null; }
    return {destination,element,position};
  }
  root.addEventListener('dragstart', event => {
    const row = event.target.closest('[data-bm-drag]');
    if (!row || editor || saving || switching || view.loading || event.target.matches('input')) { event.preventDefault(); return; }
    event.stopPropagation(); closeMenus();
    const id = row.dataset.bmDrag, ids = view.selected.has(id) ? [...view.selected] : [id];
    dragging = {source:view.source,baseline:JSON.stringify(current().data),ids:bookmarkSelection(nodes(),ids).map(node => node.id)};
    dragging.changes = bookmarkChanges(nodes(),dragging.ids,'move');
    event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-qiye-bookmarks',dragging.ids.join(','));
    root.classList.add('is-dragging'); row.classList.add('bm-drag-origin');
  }, options);
  root.addEventListener('dragover', event => {
    if (!dragging) return;
    event.stopPropagation(); clearDrop();
    if (event.target.closest('.bm-path summary')) find('.bm-path').open = true;
    const target = dropTarget(event);
    event.dataTransfer.dropEffect = target ? 'move' : 'none';
    if (target) { event.preventDefault(); target.element.dataset.bmDrop = target.position; }
    // Keep long lists and folder trees reachable during a native drag.
    const scroll = event.target.closest('.bm-sidebar,.bm-list');
    if (scroll) { const rect = scroll.getBoundingClientRect(); if (event.clientY < rect.top + 28) scroll.scrollTop -= 12; else if (event.clientY > rect.bottom - 28) scroll.scrollTop += 12; }
  }, options);
  root.addEventListener('dragleave', event => { if (!root.contains(event.relatedTarget)) clearDrop(); }, options);
  root.addEventListener('drop', event => {
    if (!dragging) return;
    event.preventDefault(); event.stopPropagation();
    const target = dropTarget(event), session = dragging;
    dragging = null; clearDrop(); closeMenus(); root.classList.remove('is-dragging');
    if (!target) { if (pendingReload) void reload(); else render(); return; }
    saving = true; feedback(''); render();
    void (async () => {
      try { await persistChanges(session,session.changes.map(change => ({...change,...target.destination}))); feedback(t('收藏已保存')); }
      catch (error) { feedback(error.completed ? t('已完成 {done} 项，剩余 {left} 项未完成：{error}',{done:error.completed,left:session.ids.length-error.completed,error:error.message}) : error.message || t('保存失败，请重试')); }
      finally { saving = false; render(); }
    })();
  }, options);
  root.addEventListener('dragend', () => {
    dragging = null; clearDrop(); closeMenus(); root.classList.remove('is-dragging');
    if (!saving) { if (pendingReload) void reload(); else render(); }
  }, options);

  root.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && ['f','k'].includes(event.key.toLowerCase())) {
      event.preventDefault(); event.stopPropagation();
      if (!editor) { closeMenus(); find('[data-bm-query]').focus(); }
      return;
    }
    if (!editor && !event.target.matches('input,select,textarea') && view.managing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault(); event.stopPropagation();
      for (const node of listBookmarks(nodes(),view).filter(node => !node.readonly && !node.protected)) view.selected.add(node.id);
      render(); return;
    }
    if (!editor && event.key === 'Escape' && closeMenus(true)) { event.preventDefault(); event.stopPropagation(); return; }
    if (!editor && event.key === 'Escape' && find('[data-bm-query]') === event.target) { event.preventDefault(); event.stopPropagation(); event.target.blur(); return; }
    if (!editor && event.key === 'Escape' && view.managing) { event.preventDefault(); event.stopPropagation(); view.managing = false; view.selected.clear(); render(); return; }
    if (editor) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEditor(); }
      if (event.key === 'Tab') {
        const fields = [...find('.bm-editor').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(node => !node.closest('fieldset:disabled'));
        const first = fields[0], last = fields.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      return;
    }
    if (!event.target.matches('[role=treeitem]')) return;
    const buttons = [...root.querySelectorAll('[role=treeitem]')], at = buttons.indexOf(event.target), id = event.target.dataset.bmFolder;
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') {
      if (view.expanded.has(id)) { view.expanded.delete(id); render(); focusFolder(id); }
      else focusFolder(nodes().find(node => node.id === id)?.parentId || '');
    } else if (event.key === 'ArrowRight') {
      if (!view.expanded.has(id)) { view.expanded.add(id); render(); focusFolder(id); }
      else buttons[at + 1]?.focus();
    } else buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0,Math.min(buttons.length - 1,at + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  }, options);
  const unsubscribe = client.subscribe(reason => {
    if (!alive()) return;
    if (reason === 'revoked') {
      sequence++; granted = false; browserNodes = []; view.loading = false;
      if (view.source === 'browser') { dragging = null; view.source = 'local'; view.folder = ''; view.expanded.clear(); view.selected.clear(); closeEditor(true); feedback(t('书签授权已失效，已返回独立收藏')); }
      render();
    } else { pendingReload = true; clearTimeout(timer); timer = setTimeout(() => { if (!dragging && !saving) void reload(); },80); }
  });
  render(); void reload({initialLoad:true});
  return () => { controller.abort(); sequence++; clearTimeout(timer); unsubscribe(); };
}

export function bindBookmarkCards(container, host, client = browserBookmarkClient) {
  const roots = [...container.querySelectorAll('[data-widget=bookmarks]')];
  if (!roots.length) return () => {};
  const controller = new AbortController(), folders = new Map();
  let timer;
  const render = () => {
    if (controller.signal.aborted) return;
    for (const root of roots) {
      const item = host.getState().items.find(item => item.id === root.dataset.widgetId);
      if (item && root.isConnected) root.innerHTML = bookmarkCard(item,host.getState(),folders.get(item.id) || '');
    }
  };
  const load = () => client.load().then(render).catch(() => {});
  container.addEventListener('click', event => {
    const button = event.target.closest('[data-bm-card-folder]');
    if (!button) return;
    const root = button.closest('[data-widget=bookmarks]');
    if (!root) return;
    event.preventDefault(); event.stopPropagation(); folders.set(root.dataset.widgetId,button.dataset.bmCardFolder); render();
  }, {signal:controller.signal});
  const unsubscribe = client.subscribe(reason => {
    if (reason === 'revoked') { folders.clear(); render(); }
    else { clearTimeout(timer); timer = setTimeout(load,100); }
  });
  if (roots.some(root => host.getState().items.find(item => item.id === root.dataset.widgetId)?.config.source === 'browser')) void load();
  return () => { controller.abort(); clearTimeout(timer); unsubscribe(); };
}
