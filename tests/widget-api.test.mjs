import test from 'node:test';
import assert from 'node:assert/strict';
import { createWidgetRegistry, listWidgetDefinitions, newWidgetConfig } from '../src/widget-registry.js';
import { counterWidget } from '../src/widget-example.js';
import { newWidgetData, widgetContentSummary } from '../src/widget-data.js';
import { DEFAULT_STATE, validateImport, exportState } from './fixtures/legacy-host.js';
import { mountWidgetExtensions } from '../src/widget-runtime.js';
import { windowMetrics } from '../src/window-layout.js';
import { renderWidget } from '../src/widgets.js';
import { TILE_SIZES } from '../src/widget-sizes.js';

test('every builtin supports the five sizes, escapes compact titles and exposes a launcher', () => {
  for (const definition of listWidgetDefinitions()) {
    assert.deepEqual(definition.sizes,TILE_SIZES);
    for(const size of TILE_SIZES) {
      const item={id:'sample',widget:definition.type,title:'<img src=x>',size,config:newWidgetConfig(definition.type),data:newWidgetData(definition.type)};
      const html=renderWidget(item,DEFAULT_STATE);
      assert.ok(html.includes('data-widget='));
      if(['1x1','1x2','2x1'].includes(size)) {
        if (definition.builtin) {
          assert.ok(html.includes('data-action="widget-open"'));
          assert.ok(html.includes('&lt;img src=x&gt;'));
        } else {
          assert.ok(html.includes('data-action="widget-open"'));
        }
        assert.ok(!html.includes('<textarea'));
      }
    }
  }
});

test('extension sizes require both compact and full layouts with no duplicate entries', () => {
  for(const sizes of [['2x2'],['1x1'],['1x1','2x2','3x3'],['1x1','2x2','2x2']])assert.throws(()=>createWidgetRegistry([{...counterWidget,sizes}]));
  assert.deepEqual(createWidgetRegistry([{...counterWidget,sizes:TILE_SIZES}]).get('counter').sizes,TILE_SIZES);
});

test('window presentation and independent size persist under the current strict schema', () => {
  const state=structuredClone(DEFAULT_STATE);
  for(const presentation of ['window','sidebar'])for(const size of [75,100,125]) {
    Object.assign(state.settings,{settingsPresentation:presentation,windowSize:size});
    assert.deepEqual(validateImport(exportState(state)).settings,state.settings);
  }
  for(const size of [74,151,'100',NaN]) { state.settings.windowSize=size;assert.throws(()=>validateImport(state)); }
  state.settings.windowSize=100;state.settings.settingsPresentation='unknown';assert.throws(()=>validateImport(state));
});

test('packaged extension registration supplies defaults without changing builtins', () => {
  const registry = createWidgetRegistry([counterWidget]);
  assert.ok(listWidgetDefinitions().some(widget => widget.type === 'converter'));
  assert.ok(!listWidgetDefinitions().some(widget => widget.type === 'base-converter'));
  assert.ok(listWidgetDefinitions().some(entry => entry.type === 'bookmarks'));
  assert.ok(listWidgetDefinitions().some(entry => entry.type === 'pomodoro'));
  assert.equal(registry.list().length, listWidgetDefinitions().filter(widget => widget.builtin).length + 1);
  assert.ok(listWidgetDefinitions().some(widget => widget.type === 'image-compressor'));
  assert.ok(listWidgetDefinitions().some(widget => widget.type === 'file-converter'));
  assert.deepEqual(registry.newConfig('counter'), { label: '今天的小进步', count: 0 });
  assert.ok(Object.isFrozen(registry.get('counter').fields[0]));
  assert.deepEqual(registry.get('counter').sizes, ['1x1', '2x2']);
});

test('registry rejects conflicting IDs, unsupported API, malformed fields and values', () => {
  for (const definition of [
    { ...counterWidget, type: 'todo' }, { ...counterWidget, apiVersion: 1 }, { ...counterWidget, type: '"><script>' },
    { ...counterWidget, render: null }, { ...counterWidget, sizes: ['1x1'] },
    { ...counterWidget, fields: [...counterWidget.fields, counterWidget.fields[0]] },
    { ...counterWidget, fields: [{ key: 'constructor', type: 'text', label: 'bad', default: '' }] },
    { ...counterWidget, fields: [{ key: 'count', type: 'number', label: 'bad', default: Infinity }] },
  ]) assert.throws(() => createWidgetRegistry([definition]));
  const registry = createWidgetRegistry([counterWidget]);
  assert.throws(() => registry.validateConfig('counter', {}));
  assert.throws(() => registry.validateConfig('counter', undefined));
  for (const config of [{ count: -1 }, { count: 0.1 }, { count: '1' }, { label: '' }, { label: 'a'.repeat(61) }, { surprise: true }, JSON.parse('{"__proto__":{}}')]) {
    assert.throws(() => registry.validateConfig('counter', { ...registry.newConfig('counter'), ...config }));
  }
});

test('widget defaults are independent objects with no shared desktop fields', () => {
  for (const [type, key] of [['notes', 'notes'], ['todo', 'todos'], ['habit', 'habits'], ['focus', 'focus']]) {
    const a = newWidgetData(type), b = newWidgetData(type);
    const original = structuredClone(b);
    if (type === 'notes') a.notes = 'only first';
    else if (type === 'focus') a.focus.duration = 3;
    else a[key].push({ id: 'first-only' });
    assert.deepEqual(b, original);
    assert.equal(Object.hasOwn(DEFAULT_STATE, key), false);
  }
});

test('every widget requires current config and data, rejecting shared fields and missing values', () => {
  for (const entry of listWidgetDefinitions()) {
    const state = structuredClone(DEFAULT_STATE);
    const item = { id: 'test', type: 'widget', widget: entry.type, groupId: 'home', title: 'Test', size: entry.size,
      config: newWidgetConfig(entry.type), data: newWidgetData(entry.type) };
    state.items = [item];
    assert.doesNotThrow(() => validateImport(state));
    for (const field of ['config', 'data']) {
      const incomplete = structuredClone(state); delete incomplete.items[0][field];
      assert.throws(() => validateImport(incomplete), /数据校验失败/, entry.type);
      for (const key of Object.keys(item[field])) {
        // Weather backups created before source selection inherit automatic mode.
        if(entry.type==='weather'&&field==='config'&&['source','fallback'].includes(key)) continue;
        // Older radix backups inherit General mode and default integer settings.
        if(entry.type==='base-converter'&&field==='data'&&['mode','bits','inputKind','padBits'].includes(key)) continue;
        // Converter backups predating the integrated radix workspace receive its defaults.
        if(entry.type==='converter'&&field==='data'&&key==='radix') continue;
        const partial = structuredClone(state); delete partial.items[0][field][key];
        assert.throws(() => validateImport(partial), /数据校验失败/, entry.type + '.' + key);
      }
    }
  }
  for (const key of ['notes', 'todos', 'habits', 'focus', 'countdown', 'workday']) {
    assert.throws(() => validateImport({ ...structuredClone(DEFAULT_STATE), [key]: {} }), /不是支持的字段/);
  }
});

test('backup and sync summaries aggregate independent cards', () => {
  const state = structuredClone(DEFAULT_STATE);
  assert.deepEqual(widgetContentSummary(state.items), { todos: 3, notesLength: state.items.find(i => i.id === 'notes-home').data.notes.length });
  state.items.find(i => i.id === 'todo-work').data.todos.push({ id: 'task', text: 'Work', done: false });
  state.items.find(i => i.id === 'notes-code').data.notes = 'code';
  assert.equal(widgetContentSummary(state.items).todos, 4);
  assert.equal(widgetContentSummary(state.items).notesLength, widgetContentSummary(DEFAULT_STATE.items).notesLength + 4);
});

test('new cards start empty and remain independent through backup round trips', () => {
  const state = structuredClone(DEFAULT_STATE);
  const notes = state.items.find(item => item.widget === 'notes');
  notes.data = newWidgetData('notes'); notes.data.notes = 'private note';
  const copy = structuredClone(notes); copy.id = 'notes-copy'; copy.data.notes = 'second note'; state.items.push(copy);
  const result = validateImport(exportState(state));
  assert.equal(result.items.find(item => item.id === notes.id).data.notes, 'private note');
  assert.equal(result.items.find(item => item.id === copy.id).data.notes, 'second note');
  assert.deepEqual(newWidgetData('todo'), { todos: [] });
  assert.deepEqual(newWidgetData('habit'), { habits: [] });
  assert.equal(newWidgetData('focus').focus.running, false);
});

test('per-card data enforces limits, references and running timer invariants', () => {
  for (const [widget, data] of [
    ['notes', { notes: 'x'.repeat(100001) }], ['notes', { todos: [] }],
    ['focus', { focus: { duration: 25, remaining: 0, running: true, endAt: null } }],
    ['todo', { todos: [{ id: 'x', text: 'a', done: false }, { id: 'x', text: 'b', done: true }] }],
    ['habit', { habits: [{ id: 'x', name: 'a', dates: ['2026-02-30'] }] }],
  ]) {
    const state = structuredClone(DEFAULT_STATE);
    state.items = [{ id: 'test', groupId: 'home', type: 'widget', widget, title: 'Test', size: '2x2', config: newWidgetConfig(widget), data }];
    assert.throws(() => validateImport(state), /数据校验失败/);
  }
});

test('unsupported widget sizes are rejected instead of silently changed', () => {
  const state = structuredClone(DEFAULT_STATE);
  state.items.find(item => item.widget === 'notes').size = '3x3';
  assert.throws(() => validateImport(state), /卡片尺寸不受支持/);
});

test('window sizing and attribution options are required, validate and round trip', () => {
  const state = structuredClone(DEFAULT_STATE);
  delete state.settings.windowSize; delete state.settings.showWallpaperCredit;
  assert.throws(() => validateImport(state));
  for (const scale of [75, 100, 150]) {
    state.settings.windowSize = scale; state.settings.showWallpaperCredit = false;
    assert.equal(validateImport(exportState(state)).settings.windowSize, scale);
    assert.equal(validateImport(state).settings.showWallpaperCredit, false);
    for (const width of [360, 768, 1440]) {
      const result = windowMetrics(scale, width, 600);
      assert.ok(result.windowWidth <= width - 24);
      assert.ok(result.windowHeight <= 576.001);
    }
  }
  for (const scale of [0, 74, 151, Infinity, '100']) { state.settings.windowSize = scale; assert.throws(() => validateImport(state)); }
});

function runtimeHarness({ failSave = false, failUpdate = false } = {}) {
  let api, disposed = 0, updates = 0, saves = 0;
  const notices = [];
  const registry = createWidgetRegistry([{ ...counterWidget,
    mount(value) { api = value; return () => disposed++; },
    update() { updates++; if (failUpdate) throw new Error('update failed'); },
  }]);
  const state = { items: [{ id: 'counter-1', widget: 'counter', config: registry.newConfig('counter') }] };
  const root = { dataset: { widget: 'counter', widgetId: 'counter-1' }, isConnected: true };
  const runtime = mountWidgetExtensions({ querySelectorAll: () => [root] }, {
    getState: () => state,
    save: async () => { saves++; if (failSave) throw new Error('disk full'); },
    toast: text => notices.push(text),
  }, registry);
  return { api, state, root, runtime, notices, counts: () => ({ disposed, updates, saves }) };
}

test('extension lifecycle saves validated config and ignores work after removal', async () => {
  const h = runtimeHarness();
  const copy = h.api.getConfig(); copy.count = 900;
  assert.equal(h.state.items[0].config.count, 0);
  assert.equal(await h.api.updateConfig({ count: 1 }), true);
  assert.equal(h.state.items[0].config.count, 1);
  await assert.rejects(h.api.updateConfig({ count: -1 }));
  assert.equal(h.counts().saves, 1);
  h.runtime.cleanup(); h.runtime.cleanup();
  assert.equal(h.api.signal.aborted, true);
  assert.equal(h.counts().disposed, 1);
  assert.equal(await h.api.updateConfig({ count: 2 }), false);
});

test('failed extension saves restore config; failing updates are reported once', async () => {
  const h = runtimeHarness({ failSave: true });
  await assert.rejects(h.api.updateConfig({ count: 10 }), /disk full/);
  assert.equal(h.state.items[0].config.count, 0);
  const broken = runtimeHarness({ failUpdate: true });
  broken.runtime.update(); broken.runtime.update();
  assert.equal(broken.notices.length, 1);
  assert.equal(broken.counts().updates, 1);
});
