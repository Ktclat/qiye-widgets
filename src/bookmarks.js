// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { keys, array, id, string, number, unique, invalid } from './validation.js';

export const BOOKMARK_LIMIT = 5000;
export const BOOKMARK_DEPTH = 64;

export function bookmarkUrl(value) {
  const text = String(value || '').trim();
  if (!text || /[\u0000-\u0020\u007f]/.test(text)) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : 'https://' + text);
    return ['https:', 'http:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function bookmarkIndex(nodes) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const children = new Map();
  for (const node of nodes) {
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node);
  }
  return { byId, children };
}

export function bookmarkPath(nodes, folderId) {
  const { byId } = bookmarkIndex(nodes), path = [], seen = new Set();
  let node = byId.get(folderId);
  while (node && !seen.has(node.id)) {
    seen.add(node.id); path.unshift(node); node = byId.get(node.parentId);
  }
  return path;
}

export function bookmarkDescendants(nodes, nodeId) {
  const { children } = bookmarkIndex(nodes), result = new Set(), queue = [nodeId];
  while (queue.length) {
    const current = queue.pop();
    if (result.has(current)) continue;
    result.add(current);
    for (const child of children.get(current) || []) queue.push(child.id);
  }
  return result;
}

// A selected folder owns its selected descendants for a single operation.
export function bookmarkSelection(nodes, ids) {
  const selected = new Set(ids), byId = new Map(nodes.map(node => [node.id,node]));
  return nodes.filter(node => {
    if (!selected.has(node.id)) return false;
    const seen = new Set([node.id]);
    let parent = byId.get(node.parentId);
    while (parent && !seen.has(parent.id)) {
      if (selected.has(parent.id)) return false;
      seen.add(parent.id); parent = byId.get(parent.parentId);
    }
    return true;
  });
}

export function bookmarkChanges(nodes, ids, type, destination = {}) {
  return bookmarkSelection(nodes, ids).map(node => {
    const subtree = type === 'delete' && node.url === null ? bookmarkDescendants(nodes,node.id) : null;
    return {type, id:node.id, ...destination,
      expectedNode:JSON.stringify({title:node.title,url:node.url,parentId:node.parentId}),
      ...(subtree ? {expectedSubtree:JSON.stringify(nodes.filter(entry => subtree.has(entry.id)))} : {}),
    };
  });
}

function moveIndex(nodes, change) {
  const siblings = nodes.filter(node => node.parentId === change.parentId);
  if (change.beforeId === undefined) return siblings.length;
  const index = siblings.findIndex(node => node.id === change.beforeId);
  if (index < 0 || change.beforeId === change.id) throw new Error(t('拖放位置已改变，请重试'));
  return index;
}

export function validateBookmarks(raw, path = 'bookmarks') {
  keys(raw, ['nodes'], path);
  const nodes = array(raw.nodes, path + '.nodes', BOOKMARK_LIMIT).map((node, i) => {
    const p = `${path}.nodes[${i}]`;
    keys(node, ['id', 'parentId', 'title', 'url', 'dateAdded'], p);
    const url = node.url === null ? null : bookmarkUrl(string(node.url, p + '.url', 4096));
    if (node.url !== null && !url) invalid(p, t('请输入有效的 http 或 https 网址'));
    return { id:id(node.id, p + '.id'), parentId:node.parentId === '' ? '' : id(node.parentId, p + '.parentId'),
      title:string(node.title, p + '.title', 300), url, dateAdded:number(node.dateAdded, p + '.dateAdded', 0, 8640000000000000) };
  });
  unique(nodes.map(node => node.id), path);
  const { byId } = bookmarkIndex(nodes);
  for (const node of nodes) {
    const visited = new Set([node.id]);
    let parentId = node.parentId;
    while (parentId !== '') {
      const parent = byId.get(parentId);
      if (!parent || parent.url !== null) invalid(path, t('目标文件夹不存在'));
      if (visited.has(parentId)) invalid(path, t('不能将文件夹移入自身或子文件夹'));
      visited.add(parentId);
      if (visited.size > BOOKMARK_DEPTH) invalid(path, t('文件夹层级最多为 {count} 层', {count:BOOKMARK_DEPTH}));
      parentId = parent.parentId;
    }
  }
  return { nodes };
}

// Both storage adapters enforce these rules. Browser data keeps unsupported URLs
// visible, but they never become executable links in an extension page.
export function checkBookmarkChange(nodes, change, source = 'local') {
  const { byId } = bookmarkIndex(nodes), node = byId.get(change.id);
  if (!['create','update','move','delete'].includes(change.type)) throw new Error(t('不支持的书签操作'));
  if (change.type !== 'create' && !node) throw new Error(t('这条收藏已不存在，请刷新后重试'));
  if (node && (node.readonly || node.protected)) throw new Error(t('浏览器系统文件夹或只读收藏无法修改'));
  if (change.type === 'create' || change.type === 'move') {
    const parent = byId.get(change.parentId);
    if (change.parentId !== '' && (!parent || parent.url !== null)) throw new Error(t('目标文件夹不存在'));
    if (parent?.readonly || source === 'browser' && change.parentId === '') throw new Error(t('请选择可写入的文件夹'));
    if (node && bookmarkDescendants(nodes, node.id).has(change.parentId)) throw new Error(t('不能将文件夹移入自身或子文件夹'));
    if (change.type === 'move') moveIndex(nodes, change);
  }
  if (change.type === 'create' || change.type === 'update') {
    string(change.title, 'bookmark.title', 300);
    const isFolder = change.type === 'create' ? change.url === null : node.url === null;
    if (!isFolder && (!bookmarkUrl(change.url) || String(change.url).length > 4096) && !(source === 'browser' && node?.url === change.url)) throw new Error(t('请输入有效的 http 或 https 网址'));
    if (isFolder && change.url !== null) throw new Error(t('不支持的书签操作'));
  }
  const url = change.type === 'move' ? node.url : change.url;
  const parentId = change.type === 'update' ? node.parentId : change.parentId;
  const changesLocation = change.type === 'create' || change.type === 'move' && node.parentId !== parentId || change.type === 'update' && node.url !== (bookmarkUrl(url) || url);
  if (changesLocation && url && nodes.some(other => other.id !== node?.id && other.parentId === parentId && other.url === (bookmarkUrl(url) || url))) throw new Error(t('此文件夹已收藏这个网址'));
  if (change.type === 'delete' && node.url === null) {
    const subtree = bookmarkDescendants(nodes, node.id);
    if (nodes.some(entry => subtree.has(entry.id) && entry.readonly)) throw new Error(t('浏览器系统文件夹或只读收藏无法修改'));
  }
  return node;
}

export function changeLocalBookmarks(data, change) {
  const nodes = structuredClone(data.nodes);
  const node = checkBookmarkChange(nodes, change);
  if (change.type === 'create') nodes.push({id:change.id, parentId:change.parentId, title:change.title.trim(), url:change.url === null ? null : bookmarkUrl(change.url), dateAdded:change.dateAdded});
  if (change.type === 'update') { node.title = change.title.trim(); node.url = change.url === null ? null : bookmarkUrl(change.url); }
  if (change.type === 'move') {
    nodes.splice(nodes.indexOf(node), 1); node.parentId = change.parentId;
    const siblings = nodes.filter(entry => entry.parentId === change.parentId), index = moveIndex(nodes, change);
    const at = siblings[index] ? nodes.indexOf(siblings[index]) : siblings.length ? nodes.indexOf(siblings.at(-1)) + 1 : nodes.length;
    nodes.splice(at, 0, node);
  }
  const deleted = change.type === 'delete' ? bookmarkDescendants(nodes, node.id) : new Set();
  return validateBookmarks({nodes:nodes.filter(entry => !deleted.has(entry.id))});
}

// Validate the complete batch before the caller performs one persistent write.
export function changeLocalBookmarkBatch(data, changes) {
  return changes.reduce((next, change) => changeLocalBookmarks(next, change), data);
}

export function listBookmarks(nodes, {folder = '', query = '', sort = 'manual', scope = 'folder'} = {}) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const result = nodes.filter(node => terms.length ? terms.every(term => (node.title + ' ' + (node.url || '')).toLocaleLowerCase().includes(term))
    : scope === 'recent' ? node.url !== null : node.parentId === folder);
  return result.sort((a, b) => {
    if (sort === 'recent' || scope === 'recent' && sort === 'manual' && !terms.length) return b.dateAdded - a.dateAdded;
    const foldersFirst = Number(a.url !== null) - Number(b.url !== null);
    return sort === 'title' ? foldersFirst || a.title.localeCompare(b.title) : 0;
  });
}

export function flattenBrowserBookmarks(tree) {
  const nodes = [], stack = [];
  for (const root of tree) for (const child of [...(root.children || [])].reverse()) stack.push({node:child, parentId:'', readonly:!!root.unmodifiable});
  while (stack.length) {
    const {node, parentId, readonly} = stack.pop();
    const locked = readonly || !!node.unmodifiable;
    nodes.push({id:node.id, parentId, title:node.title || node.url || t('未命名文件夹'), url:typeof node.url === 'string' ? node.url : null,
      dateAdded:node.dateAdded || 0, readonly:locked, protected:parentId === '' || !!node.folderType});
    for (const child of [...(node.children || [])].reverse()) stack.push({node:child, parentId:node.id, readonly:locked});
  }
  return nodes;
}

export function createBrowserBookmarkClient(api = globalThis.chrome) {
  let snapshot = {granted:false, nodes:[]};
  const descriptor = {permissions:['bookmarks']};
  const supported = () => !!api?.permissions?.request;
  async function load() {
    if (!api?.permissions?.contains || !await api.permissions.contains(descriptor)) return snapshot = {granted:false, nodes:[]};
    if (!api.bookmarks?.getTree) throw new Error(t('当前浏览器未提供书签接口。'));
    const tree = await api.bookmarks.getTree();
    // Revocation while a read is in flight must not repopulate the old tree.
    if (!await api.permissions.contains(descriptor)) return snapshot = {granted:false, nodes:[]};
    return snapshot = {granted:true, nodes:flattenBrowserBookmarks(tree)};
  }
  return {
    supported,
    snapshot: () => snapshot,
    load,
    // Call directly from the user's click, before any asynchronous work.
    request() {
      try { return supported() ? api.permissions.request(descriptor) : Promise.resolve(false); }
      catch (error) { return Promise.reject(error); }
    },
    async mutate(change) {
      const latest = await load();
      if (!latest.granted) throw new Error(t('书签授权已失效，已返回独立收藏'));
      const node = checkBookmarkChange(latest.nodes, change, 'browser');
      if (node && change.expectedNode && JSON.stringify({title:node.title,url:node.url,parentId:node.parentId}) !== change.expectedNode) throw new Error(t('这条收藏已改变，请关闭编辑后重试'));
      if (change.type === 'create') return api.bookmarks.create({parentId:change.parentId, title:change.title.trim(), ...(change.url === null ? {} : {url:bookmarkUrl(change.url)})});
      if (change.type === 'update') return api.bookmarks.update(change.id, {title:change.title.trim(), ...(node.url === null ? {} : {url:bookmarkUrl(change.url) || change.url})});
      if (change.type === 'move') return api.bookmarks.move(change.id, {parentId:change.parentId,
        ...(change.beforeId === undefined ? {} : {index:moveIndex(latest.nodes,change)})});
      // Empty-folder deletion must fail if a child arrived after confirmation.
      if (node.url === null && change.expectedSubtree) {
        const ids = bookmarkDescendants(latest.nodes, node.id);
        const actual = JSON.stringify(latest.nodes.filter(entry => ids.has(entry.id)));
        if (actual !== change.expectedSubtree) throw new Error(t('文件夹内容已改变，请重新确认删除'));
      }
      return api.bookmarks[node.url === null ? 'removeTree' : 'remove'](change.id);
    },
    subscribe(callback) {
      let bookmarkCleanups = [];
      function listen(event, handler, disposers) {
        if (event?.addListener) { event.addListener(handler); disposers.push(() => event.removeListener(handler)); }
      }
      function bind() {
        bookmarkCleanups.forEach(dispose => dispose()); bookmarkCleanups = [];
        for (const name of ['onCreated','onChanged','onRemoved','onMoved','onChildrenReordered','onImportEnded']) listen(api?.bookmarks?.[name], () => callback('change'), bookmarkCleanups);
      }
      const permissionCleanups = [];
      listen(api?.permissions?.onAdded, change => { if (change.permissions?.includes('bookmarks')) { bind(); callback('permission'); } }, permissionCleanups);
      listen(api?.permissions?.onRemoved, change => { if (change.permissions?.includes('bookmarks')) { snapshot = {granted:false, nodes:[]}; callback('revoked'); } }, permissionCleanups);
      bind();
      return () => { bookmarkCleanups.forEach(dispose => dispose()); permissionCleanups.forEach(dispose => dispose()); };
    },
  };
}

export const browserBookmarkClient = createBrowserBookmarkClient();
