// SPDX-License-Identifier: GPL-3.0-only
import { englishMessages } from './messages-en.js';

const catalogues = { 'zh-CN': {}, en: englishMessages };
export const LANGUAGES = Object.freeze(['auto', ...Object.keys(catalogues)]);
export function resolveLocale(preference = 'auto', languages = globalThis.navigator?.languages || []) {
  if (preference !== 'auto' && LANGUAGES.includes(preference)) return preference;
  if (!languages.length) return 'zh-CN';
  const requested = languages[0].toLowerCase();
  return Object.keys(catalogues).find(code => code.toLowerCase() === requested)
    || Object.keys(catalogues).find(code => code.split('-')[0] === requested.split('-')[0]) || 'en';
}
let locale = resolveLocale();
export function getLocale() { return locale; }
export function setLocale(preference) {
  locale = resolveLocale(preference);
  if (globalThis.document) document.documentElement.lang = locale;
  return locale;
}
// Source messages are the Chinese catalogue. Values are substituted as text;
// callers inserting messages into HTML must escape values at that boundary.
export function t(message, values = {}) {
  const catalogue = catalogues[locale];
  const translated = Object.hasOwn(catalogue, message) ? catalogue[message] : message;
  const text = typeof translated === 'object' ? translated[new Intl.PluralRules(locale).select(values.count)] ?? translated.other : translated;
  return text.replace(/\{([\w]+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
export function formatDate(value, options = {}) { return new Intl.DateTimeFormat(locale, options).format(value); }
export function formatNumber(value, options = {}) { return new Intl.NumberFormat(locale, options).format(value); }
export function localizeDocument(root = document) {
  for (const element of root.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const attribute of ['title', 'aria-label', 'placeholder']) {
    for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`)) element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
  }
}

// Apply only to newly created defaults, never to existing user content.
export function localizeSeed(value) {
  if (typeof value === 'string') return t(value);
  if (Array.isArray(value)) return value.map(localizeSeed);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,localizeSeed(entry)]));
  return value;
}
