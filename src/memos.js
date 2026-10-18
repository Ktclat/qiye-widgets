// SPDX-License-Identifier: GPL-3.0-only
import { keys, array, id, string, bool, number, unique } from './validation.js';
import { getLocale } from './i18n.js';

export const MEMO_LIMIT = 200;
export function newMemo(id, now = Date.now()) { return {id, title:'', text:'', pinned:false, createdAt:now, updatedAt:now}; }
export function validateMemos(raw, path) {
  keys(raw, ['entries'], path);
  const entries = array(raw.entries, `${path}.entries`, MEMO_LIMIT).map((entry, index) => {
    const p = `${path}.entries[${index}]`;
    keys(entry, ['id','title','text','pinned','createdAt','updatedAt'], p);
    return {id:id(entry.id, `${p}.id`), title:string(entry.title, `${p}.title`, 120, true), text:string(entry.text, `${p}.text`, 100000, true), pinned:bool(entry.pinned, `${p}.pinned`), createdAt:number(entry.createdAt, `${p}.createdAt`, 0, 8640000000000000), updatedAt:number(entry.updatedAt, `${p}.updatedAt`, 0, 8640000000000000)};
  });
  unique(entries.map(entry => entry.id), `${path}.entries`);
  return {entries};
}
export function listMemos(entries, query = '', sort = 'updated') {
  const locale = getLocale(), term = query.trim().toLocaleLowerCase(locale);
  return entries.filter(entry => !term || `${entry.title}\n${entry.text}`.toLocaleLowerCase(locale).includes(term)).toSorted((a,b) => Number(b.pinned) - Number(a.pinned) || (sort === 'title' ? a.title.localeCompare(b.title, locale) : b.updatedAt - a.updatedAt) || a.id.localeCompare(b.id));
}
