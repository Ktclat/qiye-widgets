import assert from 'node:assert/strict';

export function widgetData(state, type = 'notes') {
  const item = state.items.find(item => item.type === 'widget' && item.widget === type);
  assert.ok(item, `fixture must contain a ${type} widget`);
  return item.data;
}

export function withNote(state, text, updatedAt = state.updatedAt) {
  const result = structuredClone(state);
  result.updatedAt = updatedAt;
  widgetData(result).notes = text;
  return result;
}
