import test from 'node:test';
import assert from 'node:assert/strict';
import { createWidgetDraft } from '../src/widget-drafts.js';

test('widget draft drains edits made during a save without mutating its source', async () => {
  const item = {id:'memo', data:{entries:[]}}, calls = [];
  let finish;
  const draft = createWidgetDraft(item, async (id, data, expected) => {
    calls.push({id, data, expected});
    if (calls.length === 1) await new Promise(resolve => { finish = resolve; });
    return data;
  });
  draft.data.entries.push({text:'first'}); draft.changed();
  const job = draft.flush();
  await Promise.resolve();
  draft.data.entries[0].text = 'latest'; draft.changed();
  assert.equal(draft.flush(), job);
  finish();
  assert.equal(await job, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].data.entries[0].text, 'latest');
  assert.equal(calls[1].expected, JSON.stringify(calls[0].data));
  assert.deepEqual(item.data, {entries:[]});
  assert.equal(draft.dirty, false);
});

test('failed widget save retains the complete draft and original comparison base for retry', async () => {
  const item = {id:'memo', data:{entries:[]}}, bases = [];
  let fail = true;
  const draft = createWidgetDraft(item, async (id, data, expected) => {
    bases.push(expected);
    if (fail) throw new Error('Storage quota exceeded');
    return data;
  });
  draft.data.entries.push({text:'Keep me'}); draft.changed();
  assert.equal(await draft.flush(), false);
  assert.equal(draft.dirty, true);
  assert.match(draft.error.message, /quota/);
  assert.equal(draft.data.entries[0].text, 'Keep me');
  fail = false;
  assert.equal(await draft.flush(), true);
  assert.equal(bases[0], bases[1]);
  assert.equal(draft.error, null);
  assert.equal(draft.dirty, false);
});
