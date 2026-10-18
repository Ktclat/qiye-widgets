import test from 'node:test';
import assert from 'node:assert/strict';
import { bookmarkUrl, validateBookmarks, bookmarkPath, bookmarkDescendants, bookmarkSelection, bookmarkChanges, changeLocalBookmarkBatch, changeLocalBookmarks, listBookmarks, flattenBrowserBookmarks, createBrowserBookmarkClient, BOOKMARK_DEPTH } from '../src/bookmarks.js';
import { bookmarkRows, bookmarkSidebar, bookmarkEditor } from '../src/bookmarks-view.js';
import { newWidgetData, validateWidgetData } from '../src/widget-data.js';
import { newWidgetConfig, validateWidgetConfig, getWidgetDefinition } from '../src/widget-registry.js';
import { DEFAULT_STATE, validateImport, exportState } from './fixtures/legacy-host.js';
import { renderWidget } from '../src/widgets.js';
import { createLayout, layoutImportPlan } from './fixtures/legacy-layout.js';

const folder = (id, parentId = '', title = id) => ({id,parentId,title,url:null,dateAdded:1});
const link = (id, parentId = '', url = `https://${id}.example/`, title = id, dateAdded = 2) => ({id,parentId,title,url,dateAdded});
const sample = () => ({nodes:[folder('work'),folder('docs','work'),folder('api','docs'),link('guide','api'),link('home'),folder('personal')]});
const event = () => {
  const listeners = new Set();
  return {listeners, addListener:listener => listeners.add(listener),removeListener:listener => listeners.delete(listener),emit(...args) { for (const listener of listeners) listener(...args); }};
};
function browserFixture() {
  let granted = false;
  const calls = [], tree = [{id:'0',children:[{id:'1',title:'Bookmarks bar',folderType:'bookmarks-bar',children:[{id:'10',title:'Work',children:[{id:'11',title:'Guide',url:'https://guide.example/'}]}]},
    {id:'2',title:'Other bookmarks',children:[]},{id:'3',title:'Managed',unmodifiable:'managed',children:[{id:'31',title:'Policy',url:'https://policy.example/'}]}]}];
  const api = {
    permissions:{contains:async () => granted, request:async () => {calls.push('request'); return granted;}, onAdded:event(),onRemoved:event()},
    bookmarks:{getTree:async () => { calls.push('read'); return structuredClone(tree); }},
  };
  for (const name of ['create','update','move','remove','removeTree']) api.bookmarks[name] = async (...args) => { calls.push([name,...args]); return {id:'new'}; };
  for (const name of ['onCreated','onChanged','onRemoved','onMoved','onChildrenReordered','onImportEnded']) api.bookmarks[name] = event();
  return {api,calls,tree,setGranted(value) {granted = value;},client:createBrowserBookmarkClient(api)};
}

test('bookmark data supports nested folders, round trips backups and remains per widget', () => {
  assert.equal(getWidgetDefinition('bookmarks').size,'4x2');
  assert.deepEqual(newWidgetConfig('bookmarks'),{source:'local'});
  assert.throws(() => validateWidgetConfig('bookmarks',{source:'unknown'}));
  const one = newWidgetData('bookmarks'), two = newWidgetData('bookmarks'); one.nodes.push(folder('one'));
  assert.deepEqual(two,{nodes:[]});
  const state = structuredClone(DEFAULT_STATE);
  state.items.push({id:'bookmarks-test',type:'widget',widget:'bookmarks',title:'书签',size:'4x2',groupId:state.activeGroupId,config:{source:'browser'},data:sample()});
  assert.deepEqual(validateImport(exportState(state)).items.at(-1).data,sample());
  const layout = createLayout(state), shared = layout.items.find(item => item.widget === 'bookmarks');
  assert.equal(shared.data,undefined); assert.deepEqual(shared.config,{source:'local'});
  assert.deepEqual(layoutImportPlan(state,layout).state.items.filter(item => item.widget === 'bookmarks').at(-1).data,{nodes:[]});
  assert.deepEqual(bookmarkPath(sample().nodes,'api').map(node => node.id),['work','docs','api']);
  assert.deepEqual([...bookmarkDescendants(sample().nodes,'docs')],['docs','api','guide']);
});

test('validation rejects orphan folders, cycles, bookmark parents, unknown browser fields and depth overflow', () => {
  for (const nodes of [[folder('a','missing')],[folder('a','a')],[folder('a','b'),folder('b','a')],[link('a'),folder('b','a')],[folder('a'),folder('a')],[{...folder('a'),readonly:true}]]) assert.throws(() => validateWidgetData('bookmarks',{nodes},'data'));
  const nodes = Array.from({length:BOOKMARK_DEPTH}, (_,i) => folder('f'+i,i ? 'f'+(i-1) : ''));
  assert.equal(validateBookmarks({nodes}).nodes.length,BOOKMARK_DEPTH);
  assert.throws(() => validateBookmarks({nodes:[...nodes,folder('overflow','f'+(BOOKMARK_DEPTH-1))]}));
});

test('bookmark addresses normalize web URLs and reject executable schemes and credentials', () => {
  assert.equal(bookmarkUrl('example.com/docs'),'https://example.com/docs');
  assert.equal(bookmarkUrl(' HTTPS://EXAMPLE.COM '),'https://example.com/');
  for (const url of ['javascript:alert(1)','data:text/html,test','file:///secret','chrome://settings','https://me:secret@example.com','https://exam\nple.com','']) assert.equal(bookmarkUrl(url),null,url);
});

test('local create/edit/move/delete are immutable, recursive, and reject duplicates and cycles', () => {
  const before = sample(), snapshot = structuredClone(before);
  const added = changeLocalBookmarks(before,{type:'create',...link('new','api','example.com','Example')});
  assert.equal(added.nodes.at(-1).url,'https://example.com/'); assert.deepEqual(before,snapshot);
  assert.throws(() => changeLocalBookmarks(added,{type:'create',...link('duplicate','api','https://example.com/')}),/已收藏/);
  const edited = changeLocalBookmarks(added,{type:'update',id:'new',title:'Updated',url:'https://updated.example/'});
  assert.equal(edited.nodes.at(-1).title,'Updated');
  const moved = changeLocalBookmarks(edited,{type:'move',id:'docs',parentId:'personal'});
  assert.deepEqual(bookmarkPath(moved.nodes,'api').map(node => node.id),['personal','docs','api']);
  assert.throws(() => changeLocalBookmarks(moved,{type:'move',id:'personal',parentId:'api'}),/自身/);
  const deleted = changeLocalBookmarks(moved,{type:'delete',id:'docs'});
  assert.deepEqual(deleted.nodes.map(node => node.id),['work','home','personal']);
});

test('search crosses folders, matches URL and title terms, and sorting does not reorder stored data', () => {
  const nodes = [folder('z'),link('a','','https://docs.example/tutorial','API Guide',20),link('b','','https://b.example','Basics',40),folder('nested','z')];
  assert.deepEqual(listBookmarks(nodes,{query:'api docs.example'}).map(node => node.id),['a']);
  assert.deepEqual(listBookmarks(nodes,{query:'nested'}).map(node => node.id),['nested']);
  assert.deepEqual(listBookmarks(nodes,{sort:'title'}).map(node => node.id),['z','a','b']);
  assert.deepEqual(listBookmarks(nodes,{scope:'recent'}).map(node => node.id),['b','a']);
  assert.deepEqual(nodes.map(node => node.id),['z','a','b','nested']);
});

test('browser mode never reads or writes bookmarks without permission and never prompts automatically', async () => {
  const {client,calls} = browserFixture();
  assert.deepEqual(await client.load(),{granted:false,nodes:[]}); assert.deepEqual(calls,[]);
  await assert.rejects(client.mutate({type:'create',parentId:'1',title:'Test',url:null}),/授权/);
  assert.deepEqual(calls,[]); assert.equal(await client.request(),false); assert.deepEqual(calls,['request']);
  assert.deepEqual(await createBrowserBookmarkClient({}).load(),{granted:false,nodes:[]});
});

test('browser flattening preserves special URLs and locks managed descendants and system folders', () => {
  const {tree} = browserFixture();
  tree[0].children[1].children.push({id:'special',title:'Script',url:'javascript:alert(1)'});
  const nodes = flattenBrowserBookmarks(tree);
  assert.equal(nodes.find(node => node.id === '1').protected,true);
  assert.equal(nodes.find(node => node.id === '31').readonly,true);
  assert.equal(nodes.find(node => node.id === 'special').url,'javascript:alert(1)');
  assert.equal(nodes.find(node => node.id === '11').parentId,'10');
});

test('browser adapter uses native CRUD, preserves folder IDs, and rechecks access before each write', async () => {
  const {client,calls,setGranted} = browserFixture(); setGranted(true);
  await client.mutate({type:'create',parentId:'10',title:'Docs',url:null});
  await client.mutate({type:'create',parentId:'10',title:'New',url:'new.example'});
  await client.mutate({type:'update',id:'11',title:'Renamed',url:'https://guide.example/'});
  await client.mutate({type:'move',id:'11',parentId:'2'});
  await client.mutate({type:'delete',id:'11'});
  assert.deepEqual(calls.filter(Array.isArray),[
    ['create',{parentId:'10',title:'Docs'}],['create',{parentId:'10',title:'New',url:'https://new.example/'}],
    ['update','11',{title:'Renamed',url:'https://guide.example/'}],['move','11',{parentId:'2'}],['remove','11'],
  ]);
  setGranted(false); await assert.rejects(client.mutate({type:'delete',id:'11'}));
  assert.equal(calls.filter(Array.isArray).length,5);
});

test('browser mutations reject root changes, managed folders and self-descendant moves', async () => {
  const {client,calls,setGranted} = browserFixture(); setGranted(true);
  for (const change of [{type:'delete',id:'1'},{type:'update',id:'31',title:'Changed',url:'https://policy.example/'},{type:'create',parentId:'',title:'Root',url:null},{type:'create',parentId:'3',title:'Managed',url:null},{type:'move',id:'10',parentId:'10'}]) await assert.rejects(client.mutate(change));
  assert.deepEqual(calls.filter(Array.isArray),[]);
});

test('recursive browser deletion requires the reviewed subtree to still match', async () => {
  const {client,calls,setGranted,tree} = browserFixture(); setGranted(true);
  const {nodes} = await client.load(), ids = bookmarkDescendants(nodes,'10');
  const change = {type:'delete',id:'10',expectedSubtree:JSON.stringify(nodes.filter(node => ids.has(node.id)))};
  tree[0].children[0].children[0].children.push({id:'new-child',title:'New child',url:'https://new.example/'});
  await assert.rejects(client.mutate(change),/重新确认/); assert.deepEqual(calls.filter(Array.isArray),[]);
  tree[0].children[0].children[0].children.pop(); await client.mutate(change);
  assert.deepEqual(calls.filter(Array.isArray),[['removeTree','10']]);
});

test('renaming an existing duplicate is allowed and stale native edits cannot overwrite newer changes', async () => {
  const data = {nodes:[link('one','','https://same.example/'),link('two','','https://same.example/')]};
  assert.equal(changeLocalBookmarks(data,{type:'update',id:'one',title:'Renamed',url:'https://same.example/'}).nodes[0].title,'Renamed');
  const {client,setGranted,tree,calls} = browserFixture(); setGranted(true);
  const expectedNode = JSON.stringify({title:'Guide',url:'https://guide.example/',parentId:'10'});
  tree[0].children[0].children[0].children[0].title = 'Changed elsewhere';
  await assert.rejects(client.mutate({type:'update',id:'11',title:'Stale title',url:'https://guide.example/',expectedNode}),/已改变/);
  assert.deepEqual(calls.filter(Array.isArray),[]);
});

test('revocation clears the in-memory cache and event listeners are cleaned up', async () => {
  const {client,api,setGranted} = browserFixture(); setGranted(true); await client.load();
  const events = [], off = client.subscribe(reason => events.push(reason));
  api.bookmarks.onMoved.emit('11',{}); assert.deepEqual(events,['change']);
  setGranted(false); api.permissions.onRemoved.emit({permissions:['bookmarks']});
  assert.equal(client.snapshot().granted,false); assert.deepEqual(client.snapshot().nodes,[]);
  off(); for (const emitter of Object.values(api.bookmarks).filter(value => value.listeners)) assert.equal(emitter.listeners.size,0);
  assert.equal(api.permissions.onRemoved.listeners.size,0); assert.equal(api.permissions.onAdded.listeners.size,0);
});

test('revocation during a browser read cannot restore stale bookmark data', async () => {
  const fixture = browserFixture(); fixture.setGranted(true);
  fixture.api.bookmarks.getTree = async () => { fixture.setGranted(false); return fixture.tree; };
  assert.deepEqual(await fixture.client.load(),{granted:false,nodes:[]});
});

test('views escape titles, suppress executable URLs, reveal paths, and exclude illegal move targets', () => {
  const nodes = [...sample().nodes,link('attack','api','javascript:alert(1)','<img src=x onerror=alert(1)>')];
  const view = {source:'browser',folder:'api',scope:'folder',query:'',expanded:new Set(['work','docs','api'])};
  const html = bookmarkRows(nodes,view,DEFAULT_STATE) + bookmarkSidebar(nodes,view);
  assert.doesNotMatch(html,/<img|href="javascript:/); assert.match(html,/&lt;img/);
  assert.match(bookmarkRows(nodes,{...view,query:'guide'},DEFAULT_STATE),/全部收藏 \/ work \/ docs \/ api/);
  const editor = bookmarkEditor(nodes,view,{type:'move',id:'docs',parentId:'work'});
  assert.doesNotMatch(editor,/<option value="(?:docs|api)"/); assert.match(editor,/<option value="personal"/);
});

test('all bookmark card sizes render without requesting permission or networking', () => {
  for (const size of getWidgetDefinition('bookmarks').sizes) {
    const html = renderWidget({id:'test',type:'widget',widget:'bookmarks',title:'<img src=x>',config:{source:'local'},data:sample(),size},DEFAULT_STATE);
    assert.match(html,/data-widget="bookmarks"/); assert.match(html,/widget-open/); assert.doesNotMatch(html,/<img/);
  }
});

test('drag ordering preserves exact sibling order, identity and descendants in both directions', () => {
  let data = {nodes:[link('a'),folder('f'),link('child','f'),link('b'),link('c')]};
  const move = (id,beforeId) => { data = changeLocalBookmarks(data,{type:'move',id,parentId:'',...(beforeId ? {beforeId} : {})}); return listBookmarks(data.nodes).map(node => node.id); };
  assert.deepEqual(move('a','c'),['f','b','a','c']);
  assert.deepEqual(move('c','f'),['c','f','b','a']);
  assert.deepEqual(move('f'),['c','b','a','f']);
  assert.equal(data.nodes.find(node => node.id === 'child').parentId,'f');
  assert.throws(() => move('a','missing'),/位置已改变/);
  assert.throws(() => move('a','a'),/位置已改变/);
});

test('batch operations collapse selected descendants and reject an invalid batch without changing input', () => {
  const data = sample(), before = structuredClone(data);
  assert.deepEqual(bookmarkSelection(data.nodes,['work','docs','guide','home']).map(node => node.id),['work','home']);
  const changes = bookmarkChanges(data.nodes,['work','docs','guide','home'],'delete');
  assert.deepEqual(changeLocalBookmarkBatch(data,changes).nodes.map(node => node.id),['personal']);
  assert.deepEqual(data,before);
  const moves = bookmarkChanges(data.nodes,['home','docs'],'move',{parentId:'personal'});
  assert.equal(changeLocalBookmarkBatch(data,moves).nodes.filter(node => node.parentId === 'personal').length,2);
  assert.throws(() => changeLocalBookmarkBatch(data,bookmarkChanges(data.nodes,['home','work'],'move',{parentId:'docs'})),/自身/);
  assert.deepEqual(data,before);
});

test('batch duplicate detection prevents any persistent partial local move', () => {
  const data = {nodes:[folder('a'),folder('b'),folder('dest'),link('one','a','https://same.example/'),link('two','b','https://same.example/')]};
  assert.throws(() => changeLocalBookmarkBatch(data,bookmarkChanges(data.nodes,['one','two'],'move',{parentId:'dest'})),/已收藏/);
  assert.deepEqual(data.nodes.slice(-2).map(node => node.parentId),['a','b']);
});

test('native reorder passes an index anchored to the current browser siblings', async () => {
  const {client,calls,setGranted,tree} = browserFixture(); setGranted(true);
  tree[0].children[0].children[0].children.push({id:'12',title:'Next',url:'https://next.example/'},{id:'13',title:'Last',url:'https://last.example/'});
  await client.mutate({type:'move',id:'11',parentId:'10',beforeId:'13'});
  await client.mutate({type:'move',id:'13',parentId:'10',beforeId:'11'});
  assert.deepEqual(calls.filter(Array.isArray),[['move','11',{parentId:'10',index:2}],['move','13',{parentId:'10',index:0}]]);
  await assert.rejects(client.mutate({type:'move',id:'11',parentId:'2',beforeId:'13'}),/位置已改变/);
});
