// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { getWidgetDefinition, validateWidgetConfig } from './widget-registry.js';

function escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export function renderExtensionSettings(item) {
  const definition = getWidgetDefinition(item.widget);
  if (!definition || definition.builtin) return '';
  const config = validateWidgetConfig(item.widget, item.config);
  return definition.fields.filter(field => !field.hidden).map(field => {
    const name = `config-${field.key}`, value = config[field.key];
    const label = `<span>${escape(t(field.label))}</span>`;
    if (field.type === 'checkbox') return `<label class="setting-row">${label}<input type="checkbox" name="${name}" ${value ? 'checked' : ''}></label>`;
    if (field.type === 'select') return `<label class="field">${label}<select name="${name}">${field.options.map(option => `<option value="${escape(option.value)}" ${option.value === value ? 'selected' : ''}>${escape(t(option.label))}</option>`).join('')}</select></label>`;
    return `<label class="field">${label}<input name="${name}" type="${field.type === 'number' ? 'number' : 'text'}" value="${escape(value)}" ${field.required ? 'required' : ''} ${field.type === 'text' ? `maxlength="${field.maxLength ?? 1000}"` : `min="${field.min ?? -1000000}" max="${field.max ?? 1000000}" step="${field.integer ? '1' : 'any'}"`}></label>`;
  }).join('');
}

export function readExtensionSettings(type, data, previous) {
  const definition = getWidgetDefinition(type);
  const config = { ...previous };
  for (const field of definition.fields.filter(field => !field.hidden)) {
    const name = `config-${field.key}`;
    config[field.key] = field.type === 'checkbox' ? data.has(name) : field.type === 'number' ? (data.get(name) === '' ? NaN : Number(data.get(name))) : String(data.get(name) ?? '');
  }
  return validateWidgetConfig(type, config);
}
