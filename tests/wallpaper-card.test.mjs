import test from 'node:test';
import assert from 'node:assert/strict';
import { bindWidgets, refreshLiveWidgets, renderWidget } from '../src/widgets.js';
function widgetHarness() {
  const item = { id: 'wallpaper-home', widget: 'wallpaper', config: {} };
  const state = { settings: { wallpaperApiEnabled: false, weatherEnabled: false }, items: [item] };
  const handlers = new Map();
  const status = { textContent: '' };
  const applyButton = { disabled: true, textContent: '' };
  const root = {
    dataset: { widgetId: item.id }, classList: { toggle() {} }, _html: '', image: null,
    get innerHTML() { return this._html; },
    set innerHTML(value) {
      this._html = value;
      const id = /data-photo-id="([^"]+)"/.exec(value)?.[1];
      this.image = id ? { dataset: { widgetImage: 'wallpaper', photoId: id } } : null;
    },
    querySelector(selector) {
      if (selector === '[data-widget-image="wallpaper"]') return this.image;
      if (selector === '[data-action="widget-wallpaper-apply"]') return applyButton;
      if (selector === '[data-live="wallpaper-status"]') return status;
      return null;
    },
  };
  const container = {
    addEventListener(type, callback) { handlers.set(type, callback); }, removeEventListener(type) { handlers.delete(type); },
    contains() { return true; },
    querySelector: (selector) => selector === '[data-widget="wallpaper"]' ? root : null,
    querySelectorAll: (selector) => selector === '[data-widget="wallpaper"]' ? [root] : [],
  };
  const click = (action) => {
    const target = { dataset: { action }, tagName: 'BUTTON', disabled: false, closest: (selector) => selector === '[data-widget]' ? root : target };
    return handlers.get('click')({ target, preventDefault() {}, stopPropagation() {} });
  };
  return { item, state, root, container, handlers, click };
}

test('desktop wallpaper launchers stay offline even with saved consent', () => {
 const h=widgetHarness();h.state.settings.wallpaperApiEnabled=true;
 const original=globalThis.fetch;let fetches=0;globalThis.fetch=()=>{fetches++;throw Error('no implicit request');};
 const cleanup=bindWidgets(h.container,{getState:()=>h.state,save:async()=>{},toast(){}});
 try {refreshLiveWidgets(h.container,h.state);assert.equal(fetches,0);assert.match(renderWidget(h.item,h.state),/data-action="wallpaper"/);}
 finally {cleanup();globalThis.fetch=original;}
});

test('failed consent saving keeps the wallpaper widget offline', async () => {
  const harness = widgetHarness();
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = () => { fetches += 1; throw new Error('unexpected request'); };
  const cleanup = bindWidgets(harness.container, { getState: () => harness.state, save: async () => { throw new Error('保存失败'); }, toast() {} });
  try {
    await harness.click('widget-wallpaper-enable');
    assert.equal(harness.state.settings.wallpaperApiEnabled, false);
    assert.equal(fetches, 0);
    assert.doesNotMatch(renderWidget(harness.item, harness.state), /<img[^>]+src=/);
  } finally { cleanup(); globalThis.fetch = originalFetch; }
});
