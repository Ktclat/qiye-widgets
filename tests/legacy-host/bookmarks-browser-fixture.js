// Disposable browser API fixture for permission and live-change UI coverage.
(() => {
  const event = () => { const listeners = new Set(); return {addListener:fn => listeners.add(fn),removeListener:fn => listeners.delete(fn),emit(...args) { for (const fn of listeners) fn(...args); }}; };
  const state = globalThis.__bookmarkTest = {granted:false,acceptRequest:false,failWrite:false,calls:[],nextId:100,nodes:[
    {id:'1',parentId:'0',title:'书签栏',folderType:'bookmarks-bar'},
    {id:'2',parentId:'0',title:'其他书签'},
    {id:'3',parentId:'0',title:'公司收藏',unmodifiable:'managed'},
    {id:'10',parentId:'1',title:'开发文档'},
    {id:'11',parentId:'10',title:'Browser guide',url:'https://browser.example/guide'},
    {id:'12',parentId:'10',title:'Unsafe saved URL',url:'javascript:alert(1)'},
    {id:'31',parentId:'3',title:'Policy',url:'https://policy.example/'},
  ]};
  const permissions = {onAdded:event(),onRemoved:event(),contains:async () => state.granted,request:async () => {
    state.calls.push(['request']);
    if (state.acceptRequest) { state.granted = true; permissions.onAdded.emit({permissions:['bookmarks']}); }
    return state.granted;
  }};
  const assertAccess = () => { if (!state.granted) throw new Error('Missing bookmark permission'); if (state.failWrite || state.failAfter === 0) throw new Error('Simulated browser write failure'); if (state.failAfter > 0) state.failAfter--; };
  const bookmarks = {getTree:async () => {
    state.calls.push(['read']);
    if (!state.granted) throw new Error('Missing bookmark permission');
    const branch = id => state.nodes.filter(node => node.parentId === id).map(node => ({...node,...(!node.url ? {children:branch(node.id)} : {})}));
    return [{id:'0',title:'',children:branch('0')}];
  }};
  for (const name of ['onCreated','onChanged','onRemoved','onMoved','onChildrenReordered','onImportEnded']) bookmarks[name] = event();
  bookmarks.create = async value => { assertAccess(); state.calls.push(['create',value]); const node = {...value,id:String(state.nextId++),dateAdded:Date.now()}; state.nodes.push(node); bookmarks.onCreated.emit(node.id,node); return node; };
  bookmarks.update = async (id,value) => { assertAccess(); state.calls.push(['update',id,value]); const node = state.nodes.find(node => node.id === id); Object.assign(node,value); bookmarks.onChanged.emit(id,value); return node; };
  bookmarks.move = async (id,value) => { assertAccess(); state.calls.push(['move',id,value]); const node = state.nodes.find(node => node.id === id); const siblings = state.nodes.filter(entry => entry.parentId === value.parentId); const before = siblings[value.index]; state.nodes.splice(state.nodes.indexOf(node),1); node.parentId = value.parentId; const at = before && before !== node ? state.nodes.indexOf(before) : state.nodes.length; state.nodes.splice(at,0,node); bookmarks.onMoved.emit(id,value); return node; };
  bookmarks.remove = async id => { assertAccess(); state.calls.push(['remove',id]); state.nodes = state.nodes.filter(node => node.id !== id); bookmarks.onRemoved.emit(id,{}); };
  bookmarks.removeTree = async id => { assertAccess(); const ids = new Set([id]); let count = 0; while (count !== ids.size) { count = ids.size; for (const node of state.nodes) if (ids.has(node.parentId)) ids.add(node.id); } state.calls.push(['removeTree',id]); state.nodes = state.nodes.filter(node => !ids.has(node.id)); bookmarks.onRemoved.emit(id,{}); };
  Object.assign(globalThis.chrome ||= {},{permissions,bookmarks});
})();
