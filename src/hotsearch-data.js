// SPDX-License-Identifier: GPL-3.0-only
import { t, formatNumber } from './i18n.js';
import { fetchPublicJson, publicHttpsUrl } from './public-json.js';
import { HOTSEARCH_API, hotsearchSource, hotsearchApiBase } from './hotsearch-sources.js';

export const HOTSEARCH_TTL = 10 * 60000;
const MAX_AGE = 7 * 86400000;
const CACHE_KEY = 'qiye.hotsearch.v1';
function articleUrl(value) { try { return publicHttpsUrl(value); } catch { return ''; } }
export function hotsearchHeat(value) {
  if (typeof value === 'string' && /^\d+$/.test(value)) value = Number(value);
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return formatNumber(value, {notation:'compact', maximumFractionDigits:1});
  return typeof value === 'string' ? value.slice(0, 40) : '';
}
export function parseHotsearchResponse(raw, source, now = Date.now()) {
  const rows = source.github ? raw?.items : raw?.list ?? raw?.data;
  if (!Array.isArray(rows) || !source.github && raw.code !== undefined && raw.code !== 200) throw new Error(t('榜单服务返回的数据不完整。'));
  const seen = new Set();
  const items = rows.slice(0, 100).flatMap((row, index) => {
    const title = source.github ? row?.full_name : row?.title;
    const rawUrl = source.github ? row?.html_url : row?.url || row?.mobileUrl;
    const url = rawUrl ? articleUrl(rawUrl) : '';
    if (typeof title !== 'string' || !title.trim() || rawUrl && !url || seen.has(url || title)) return [];
    seen.add(url || title);
    const heat = source.github ? row.stargazers_count : row.hot_value ?? row.hot;
    const rank = Number.isInteger(row.index) && row.index > 0 && row.index <= 100 ? row.index : index+1;
    return [{rank, title:title.trim().slice(0, 500), url, heat:typeof heat === 'number' && Number.isFinite(heat) && heat >= 0 ? heat : typeof heat === 'string' ? heat.slice(0,40) : ''}];
  });
  if (rows.length && !items.length) throw new Error(t('榜单服务返回的数据不完整。'));
  const updatedAt = raw.update_time ? Date.parse(raw.update_time) : Number(raw.updateTime);
  return {items, fetchedAt:now, updatedAt:Number.isFinite(updatedAt) && updatedAt > 0 && updatedAt <= now ? updatedAt : now};
}
export function hotsearchRequestUrl(config, source, now = Date.now()) {
  if (source.github) {
    const since = new Date(now - (source.id === 'github-ai' ? 30 : 7) * 86400000).toISOString().slice(0,10);
    const q = `created:>=${since}` + (source.id === 'github-ai' ? ' topic:artificial-intelligence' : '');
    return 'https://api.github.com/search/repositories?' + new URLSearchParams({q, sort:'stars', order:'desc', per_page:'30'});
  }
  const base = hotsearchApiBase(config.apiBase);
  return base === HOTSEARCH_API ? `${base}/api/v1/misc/hotboard?type=${source.id}` : `${base}/${source.id}`;
}

async function fetchHotboard(url, options) {
 const bridge=globalThis.qiyeBridge,parsed=new URL(url);
 if(bridge?.init.environment.hostFeatures?.includes('hotboard')&&parsed.origin===HOTSEARCH_API&&parsed.pathname==='/api/v1/misc/hotboard'){
  if(options.signal?.aborted)throw new Error('Aborted');
  return bridge.call('hotboard',{platform:parsed.searchParams.get('type')});
 }
 return fetchPublicJson(url,options);
}
export function createHotsearchClient({fetcher = fetchHotboard, storage = () => globalThis.localStorage, now = () => Date.now()} = {}) {
  const states = new Map(), requests = new Map();
  const keyOf = (config, id) => (hotsearchSource(id)?.github ? 'github' : hotsearchApiBase(config.apiBase)) + ':' + id;
  function read(key) {
    try {
      const data = JSON.parse(storage()?.getItem(CACHE_KEY) || '{}')[key];
      if (!data || !Number.isFinite(data.fetchedAt) || data.fetchedAt > now() || now()-data.fetchedAt >= MAX_AGE || !Number.isFinite(data.updatedAt) || data.updatedAt > data.fetchedAt || !Array.isArray(data.items) || data.items.length > 100) return null;
      if (!data.items.every(row => Number.isInteger(row.rank) && row.rank > 0 && row.rank <= 100 && typeof row.title === 'string' && row.title.length <= 500 && row.title.trim() && (row.url === '' || articleUrl(row.url)) && (typeof row.heat === 'string' && row.heat.length <= 40 || typeof row.heat === 'number' && Number.isFinite(row.heat) && row.heat >= 0))) return null;
      return data;
    } catch { return null; }
  }
  function cache(key, data) {
    try {
      const previous = JSON.parse(storage()?.getItem(CACHE_KEY) || '{}');
      const entries = Object.entries(previous).filter(([k,v]) => k !== key && Number.isFinite(v?.fetchedAt) && now()-v.fetchedAt < MAX_AGE).sort((a,b) => b[1].fetchedAt-a[1].fetchedAt).slice(0,47);
      storage()?.setItem(CACHE_KEY, JSON.stringify({...Object.fromEntries(entries), [key]:data}));
    } catch { /* Cache failure must not discard the fetched list. */ }
  }
  function state(config, id) {
    const key = keyOf(config,id);
    if (!states.has(key)) {
      if (states.size >= 96) for (const old of states.keys()) { if (!requests.has(old)) { states.delete(old); break; } }
      states.set(key, {status:'idle', data:read(key), error:'', lastAttempt:0});
    }
    return states.get(key);
  }
  function request(config, id, {force = false, manual = false, signal} = {}) {
    const source = hotsearchSource(id);
    if (!source || !config.enabled && !manual || signal?.aborted) return Promise.resolve();
    const key = keyOf(config,id), current = state(config,id);
    let job = requests.get(key);
    if (job?.controller.signal.aborted) { job = null; current.lastAttempt = 0; current.status = 'idle'; }
    if (!job) {
      if (current.lastAttempt && now()-current.lastAttempt < (force ? 3000 : 60000) || !force && current.data && now()-current.data.fetchedAt < HOTSEARCH_TTL) return Promise.resolve();
      const controller = new AbortController();
      job = {controller, consumers:new Set()};
      current.status = 'loading'; current.error = ''; current.lastAttempt = now();
      requests.set(key,job);
      const ownJob = job;
      job.promise = (async () => {
        try {
          const raw = await fetcher(hotsearchRequestUrl(config,source,now()), {signal:controller.signal, maxBytes:1024*1024});
          if (controller.signal.aborted) return;
          current.data = parseHotsearchResponse(raw,source,now());
          current.status = 'success'; current.error = ''; cache(key,current.data);
        } catch (error) {
          if (!controller.signal.aborted) { current.status = 'error'; current.error = t('暂时无法获取榜单，请稍后重试或打开平台。')+' '+String(error?.message||'').slice(0,160); }
        } finally {
          if (requests.get(key) === ownJob) {
            if (controller.signal.aborted) { current.status = 'idle'; current.lastAttempt = 0; }
            requests.delete(key);
          }
        }
      })();
    }
    const consumer = {}, ownJob = job;
    ownJob.consumers.add(consumer);
    const release = () => { ownJob.consumers.delete(consumer); if (!ownJob.consumers.size && requests.get(key) === ownJob) ownJob.controller.abort(); };
    signal?.addEventListener('abort', release, {once:true});
    return ownJob.promise.finally(() => { signal?.removeEventListener('abort',release); release(); });
  }
  return {state, request};
}
export const hotsearchClient = createHotsearchClient();
