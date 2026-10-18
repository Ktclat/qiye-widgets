// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { SITE_ICON_CATALOG } from './site-icon-catalog.js';
/* Site-owned favicons. No image proxy, remote JavaScript, or desktop-state fields. */

const FAVICON_CACHE_KEY = 'qiye.favicons.local.v2';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const FAILURE_TTL = 10 * 60 * 1000;
const MAX_ENTRIES = 200;
const MAX_CANDIDATES = 12;
const HTML_LIMIT = 384 * 1024;
const MANIFEST_LIMIT = 128 * 1024;
const REQUEST_TIMEOUT = 8_000;
const UPGRADE_TTL = 24 * 60 * 60 * 1000;
const MAX_UPGRADE_CANDIDATES = 3;
const MAX_TARGET_SIZE = 256;
const cache = new Map();
const pending = new Map();
const WARNINGS = Object.freeze({
  unsafe: '此网址不支持在线图标提取；请使用公开网站的 HTTPS 地址。',
  permission: '尚未允许读取此站点，已使用站点图标地址回退。',
  network: '无法读取站点图标声明；网页版可能受网站 CORS 限制，已使用站点图标地址回退。',
  timeout: '图标提取超时，已使用站点图标地址回退。',
  redirect: '站点跳转无法安全读取；可将网址改成跳转后的 HTTPS 地址再试。',
  large: '站点返回的内容过大，已使用站点图标地址回退。',
  content: '站点未返回可读取的网页或图标清单，已使用站点图标地址回退。',
  missing: '网页未声明可用图标，已使用站点图标地址回退。',
});

function extensionRuntime() {
  const runtime = globalThis.chrome?.runtime;
  return runtime?.id && typeof runtime.getURL === 'function' ? runtime : null;
}

/* URL() canonicalizes alternate IPv4 spellings before this check. Reject local
 * hostnames and IP literals, including public IPs, to keep extraction on ordinary
 * public HTTPS domains. DNS resolution remains subject to the browser's policy. */
function publicHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host.includes('.') && !host.includes(':') && !/^\d+(?:\.\d+){3}$/.test(host)
    && !/(?:^|\.)(?:localhost|local|internal|lan|home|localdomain|intranet|onion)$/.test(host);
}

function safeImageUrl(value, base) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value.trim(), base);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !publicHost(url.hostname)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

function sitePageUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol === 'http:' && !url.port) url.protocol = 'https:';
    const safe = safeImageUrl(url.href);
    if (!safe) return null;
    const result = new URL(safe);
    result.search = '';
    result.hash = '';
    return result.href;
  } catch { return null; }
}

function originKey(pageUrl){return new URL(pageUrl).origin+'/';}

function unique(values) { return [...new Set(values.filter(Boolean))].slice(0, MAX_CANDIDATES); }

function requestedSize({ targetSize = 64, pixelRatio = 1 } = {}) {
  const cssSize = Number.isFinite(targetSize) && targetSize > 0 ? Math.min(targetSize, MAX_TARGET_SIZE) : 64;
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? Math.min(pixelRatio, 4) : 1;
  return Math.min(MAX_TARGET_SIZE, Math.max(16, Math.ceil(cssSize * ratio)));
}

function browserFavicon(pageUrl, options) {
  try {
    const runtime = extensionRuntime();
    if (!runtime) return null;
    const url = new URL(runtime.getURL('/_favicon/'));
    if (url.protocol !== 'chrome-extension:' || url.hostname !== runtime.id) return null;
    url.searchParams.set('pageUrl', pageUrl);
    // Request enough physical pixels for this surface; Chrome may still return
    // a smaller cached source, which the caller measures after image load.
    const required = requestedSize(options);
    url.searchParams.set('size', String([16, 32, 64, 128, 256].find(size => size >= required)));
    return url.href;
  } catch { return null; }
}

function currentEntry(pageUrl) {
  const entry = cache.get(pageUrl);
  if (entry && Math.max(entry.checkedAt, entry.loadedAt) + CACHE_TTL > Date.now()) return entry;
  if (entry) cache.delete(pageUrl);
  return null;
}

function dimension(value) { return Number.isInteger(value) && value > 0 && value <= 8192 ? value : 0; }

function iconQuality(detail = {}, options = {}) {
  const requiredSize = requestedSize(options);
  const suppliedWidth = dimension(options.width), suppliedHeight = dimension(options.height);
  const observed = detail.measuredAt + CACHE_TTL > Date.now() && detail.actualWidth && detail.actualHeight;
  const measured = !!(suppliedWidth && suppliedHeight || observed);
  const width = suppliedWidth && suppliedHeight ? suppliedWidth : observed ? detail.actualWidth : detail.width || 0;
  const height = suppliedWidth && suppliedHeight ? suppliedHeight : observed ? detail.actualHeight : detail.height || 0;
  const size = Math.min(width || 0, height || 0);
  const scalable = detail.scalable === true;
  const shapePenalty = width && height ? Math.abs(width - height) / Math.max(width, height) * 100 : 0;
  const adequate = scalable || size >= requiredSize;
  // Prefer a vector or the smallest sufficient bitmap over a needlessly large
  // image. Unknown sources can be tried ahead of a measured undersized bitmap.
  let score = scalable ? 1300 : size >= requiredSize ? 1000 - Math.min(100, Math.log2(size / requiredSize) * 25)
    : size ? 300 + size / requiredSize * 180 : 550;
  score += detail.kind === 'html' ? 20 : detail.kind === 'apple' ? 10 : 0;
  score -= shapePenalty + (detail.maskable ? 60 : 0);
  return { size, requiredSize, scalable, adequate, score, measured };
}

function detailFor(entry, url) {
  const detail = entry?.details?.find(item => item.url === url);
  if (detail) return detail;
  for(const icons of Object.values(SITE_ICON_CATALOG)){const known=icons.find(icon=>icon.url===url);if(known)return known;}
  let scalable = false;
  try { scalable = /\.svg$/i.test(new URL(url).pathname); } catch { /* No inferred metadata. */ }
  return { url, scalable, kind: /\/apple-touch-icon\.png(?:\?|$)/i.test(url) ? 'apple' : 'fallback' };
}

/** The caller supplies naturalWidth/naturalHeight after load. Declared sizes
 * help choose candidates; observed dimensions take precedence for bitmaps. */
export function getFaviconQuality(siteUrl, iconUrl, options = {}) {
  const pageUrl = sitePageUrl(siteUrl);
  return iconQuality(detailFor(pageUrl ? currentEntry(pageUrl) : null, iconUrl), options);
}

/** Synchronous only: no page fetches and no permission prompts during render.
 * SVG/touch icons and useful declarations precede a small conventional ICO. */
export function getFaviconCandidates(siteUrl, options = {}) {
  const pageUrl = sitePageUrl(siteUrl);
  if (!pageUrl) return [];
  const entry = currentEntry(pageUrl);
  const origin = new URL(pageUrl).origin;
  const audited=SITE_ICON_CATALOG[originKey(pageUrl)]||[];
  const known = [...(entry?.checkedAt + CACHE_TTL > Date.now() ? entry.candidates : []),...audited.map(icon=>icon.url)];
  const preferred = entry?.loadedAt + CACHE_TTL > Date.now() ? entry.preferred : null;
  const qualityOptions = { targetSize: options.targetSize, pixelRatio: options.pixelRatio };
  const conventional = [`${origin}/favicon.svg`, `${origin}/apple-touch-icon.png`, `${origin}/favicon.ico`, browserFavicon(pageUrl, options)].filter(Boolean);
  const extracted = unique([preferred, ...known]);
  const sorted = extracted.map((url, order) => ({ url, order, ...iconQuality(detailFor(entry, url), qualityOptions) }))
    .sort((a, b) => b.score - a.score || a.order - b.order).map(item => item.url);
  const declared = sorted.filter(url => !conventional.includes(url));
  // Known declarations come first, then conventional paths. A known tiny ICO
  // cannot hide a discovered SVG or a touch icon with sufficient resolution.
  const preferredQuality = preferred ? iconQuality(detailFor(entry, preferred), qualityOptions) : null;
  const coolingDown = entry?.upgradeAt + UPGRADE_TTL > Date.now() && entry.upgradeSize >= requestedSize(options);
  let keepPreferred = false;
  if (preferred && (preferredQuality.adequate || !preferredQuality.measured || coolingDown)) {
    const best = declared.find(url => iconQuality(detailFor(entry, url), qualityOptions).score > preferredQuality.score);
    keepPreferred = !best || !preferredQuality.measured || (coolingDown && !iconQuality(detailFor(entry,best),qualityOptions).adequate);
  }
  const first = keepPreferred ? [preferred, ...declared.filter(url => url !== preferred)] : declared;
  const last = conventional.filter(url => !keepPreferred || url !== preferred);
  return unique([...first.slice(0, MAX_CANDIDATES - last.length), ...last]);
}

/** Claim one bounded background quality upgrade. Keep the current image visible
 * while trying these candidates. A day-long, size-aware cooldown avoids probing
 * the same low-resolution-only site on every render; explicit extraction resets
 * it. This function returns URLs only and never performs any network request. */
export function takeFaviconUpgradeCandidates(siteUrl, iconUrl, options = {}) {
  const pageUrl = sitePageUrl(siteUrl);
  const entry = pageUrl && currentEntry(pageUrl);
  if (!entry) return [];
  const current = getFaviconQuality(pageUrl, iconUrl, options);
  if (current.adequate) return [];
  if (!options.force && entry.upgradeAt + UPGRADE_TTL > Date.now() && entry.upgradeSize >= current.requiredSize) return [];
  const candidates = getFaviconCandidates(pageUrl, options);
  entry.upgradeAt = Date.now();
  entry.upgradeSize = current.requiredSize;
  cache.set(pageUrl, entry);
  persistCache();
  const attempted = new Set(Array.isArray(options.attempted) ? options.attempted.slice(0, MAX_CANDIDATES) : []);
  attempted.add(iconUrl);
  return candidates.filter(url => {
    if (attempted.has(url)) return false;
    const quality = getFaviconQuality(pageUrl, url, { targetSize: options.targetSize, pixelRatio: options.pixelRatio });
    return !quality.measured || quality.score > current.score;
  }).slice(0, MAX_UPGRADE_CANDIDATES);
}

function trimCache() {
  const ordered = [...cache].sort((a, b) => Math.max(b[1].checkedAt, b[1].loadedAt) - Math.max(a[1].checkedAt, a[1].loadedAt));
  cache.clear();
  for (const [key, entry] of ordered.slice(0, MAX_ENTRIES)) {
    if (Math.max(entry.checkedAt, entry.loadedAt) + CACHE_TTL > Date.now()) cache.set(key, entry);
  }
}

async function readCache() {
  try {
    let raw;
    if (extensionRuntime() && globalThis.chrome?.storage?.local) raw = (await globalThis.chrome.storage.local.get(FAVICON_CACHE_KEY))?.[FAVICON_CACHE_KEY];
    else {
      const json = globalThis.localStorage?.getItem(FAVICON_CACHE_KEY);
      if (typeof json === 'string' && json.length <= 1024 * 1024) raw = JSON.parse(json);
    }
    if (!raw || raw.version !== 2 || !Array.isArray(raw.entries)) return;
    const now = Date.now();
    for (const item of raw.entries.slice(0, MAX_ENTRIES)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const pageUrl = sitePageUrl(item.pageUrl);
      if (!pageUrl || pageUrl !== item.pageUrl) continue;
      const time = value => Number.isFinite(value) && value >= 0 && value <= now ? value : 0;
      const entry = {
        preferred: safeImageUrl(item.preferred) || '',
        candidates: unique(Array.isArray(item.candidates) ? item.candidates.slice(0, MAX_CANDIDATES).map(url => safeImageUrl(url)) : []),
        checkedAt: time(item.checkedAt), loadedAt: time(item.loadedAt),
        failedUntil: Number.isFinite(item.failedUntil) && item.failedUntil >= 0 && item.failedUntil <= now + FAILURE_TTL ? item.failedUntil : 0,
        errorCode: Object.hasOwn(WARNINGS, item.errorCode) ? item.errorCode : '',
        source: ['html', 'manifest', 'fallback'].includes(item.source) ? item.source : 'fallback',
        details: [], upgradeAt: time(item.upgradeAt),
        upgradeSize: Number.isInteger(item.upgradeSize) && item.upgradeSize >= 16 && item.upgradeSize <= MAX_TARGET_SIZE ? item.upgradeSize : 0,
      };
      if (Array.isArray(item.details)) {
        for (const detail of item.details.slice(0, MAX_CANDIDATES)) {
          if (!detail || typeof detail !== 'object' || Array.isArray(detail)) continue;
          const url = safeImageUrl(detail.url);
          if (!url || entry.details.some(known => known.url === url)) continue;
          const measuredAt = time(detail.measuredAt);
          const actualWidth = dimension(detail.actualWidth), actualHeight = dimension(detail.actualHeight);
          entry.details.push({
            url, width: dimension(detail.width), height: dimension(detail.height),
            scalable: detail.scalable === true,
            kind: ['html', 'apple', 'manifest'].includes(detail.kind) ? detail.kind : 'fallback',
            maskable: detail.maskable === true,
            actualWidth, actualHeight, measuredAt: actualWidth && actualHeight ? measuredAt : 0,
          });
        }
      }
      if (!cache.has(pageUrl) && Math.max(entry.checkedAt, entry.loadedAt) + CACHE_TTL > now) cache.set(pageUrl, entry);
    }
    trimCache();
  } catch { /* Private browsing or storage quotas must not prevent local fallback. */ }
}

export const faviconCacheReady = readCache();
let writeQueued = false;
let writes = Promise.resolve();

function persistCache() {
  if (writeQueued) return;
  writeQueued = true;
  queueMicrotask(() => {
    writeQueued = false;
    writes = writes.catch(() => {}).then(async () => {
      await faviconCacheReady;
      trimCache();
      const value = { version: 2, entries: [...cache].map(([pageUrl, entry]) => ({ pageUrl, ...entry })) };
      try {
        if (extensionRuntime() && globalThis.chrome?.storage?.local) await globalThis.chrome.storage.local.set({ [FAVICON_CACHE_KEY]: value });
        else globalThis.localStorage?.setItem(FAVICON_CACHE_KEY, JSON.stringify(value));
      } catch { /* Best-effort cache; desktop data is stored separately. */ }
    });
  });
}

/** Call only after an <img> load succeeds. Internal Chrome URLs never persist. */
export function rememberFavicon(siteUrl, iconUrl, { width = 0, height = 0 } = {}) {
  const pageUrl = sitePageUrl(siteUrl);
  const safe = safeImageUrl(iconUrl);
  if (!pageUrl || !safe) return false;
  const entry = currentEntry(pageUrl) || { candidates: [], details: [], preferred: '', checkedAt: 0, loadedAt: 0, failedUntil: 0, errorCode: '', source: 'fallback', upgradeAt: 0, upgradeSize: 0 };
  const actualWidth = dimension(width), actualHeight = dimension(height);
  const existing = detailFor(entry, safe);
  const sameDimensions = !actualWidth || !actualHeight || actualWidth === (existing.actualWidth || 0) && actualHeight === (existing.actualHeight || 0);
  if (entry.preferred === safe && sameDimensions && entry.loadedAt + CACHE_TTL / 2 > Date.now()) return true;
  const detail = {
    ...existing,
    ...(actualWidth && actualHeight ? { actualWidth, actualHeight, measuredAt: Date.now() } : {}),
  };
  entry.details = [detail, ...(entry.details || []).filter(item => item.url !== safe)].slice(0, MAX_CANDIDATES);
  const previous = iconQuality(detailFor(entry, entry.preferred));
  const next = iconQuality(detail);
  // Remember every successful measurement, but a later small fallback must not
  // displace a sharper working source. Calls without dimensions remain compatible.
  if (!entry.preferred || entry.preferred === safe || !actualWidth || !actualHeight || !previous.measured && !previous.scalable || next.score > previous.score) entry.preferred = safe;
  entry.loadedAt = Date.now();
  cache.set(pageUrl, entry);
  persistCache();
  return true;
}

function decodeAttribute(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', colon: ':', sol: '/', Tab: '\t', NewLine: '\n' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|colon|sol|Tab|NewLine);/gi, (entity, key) => {
    if (key[0] !== '#') return named[key] ?? named[key.toLowerCase()] ?? entity;
    const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\uFFFD';
  });
}

/* A bounded metadata tokenizer, not a DOM: fetched markup is never inserted,
 * executed, or handed to DOMParser (which can load embedded resources). */
function metadataTags(html) {
  const tags = [];
  const lower = html.toLowerCase();
  let index = 0;
  let templateDepth = 0;
  while (index < html.length && tags.length < 128) {
    const start = html.indexOf('<', index);
    if (start < 0) break;
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4);
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    const match = /^<\s*(\/?)\s*([a-z][a-z\d:-]*)/i.exec(html.slice(start, start + 100));
    if (!match) { index = start + 1; continue; }
    const tag = match[2].toLowerCase();
    const closing = Boolean(match[1]);
    let cursor = start + match[0].length;
    const attrs = Object.create(null);
    while (cursor < html.length) {
      while (/\s/.test(html[cursor] || '') && cursor < html.length) cursor++;
      if (html[cursor] === '>' || html[cursor] === '/' && html[cursor + 1] === '>') break;
      const nameStart = cursor;
      while (cursor < html.length && !/[\s=/>]/.test(html[cursor])) cursor++;
      const name = html.slice(nameStart, cursor).toLowerCase();
      if (!name) { cursor++; continue; }
      while (/\s/.test(html[cursor] || '') && cursor < html.length) cursor++;
      let value = '';
      if (html[cursor] === '=') {
        cursor++;
        while (/\s/.test(html[cursor] || '') && cursor < html.length) cursor++;
        const quote = html[cursor] === '"' || html[cursor] === "'" ? html[cursor++] : null;
        const valueStart = cursor;
        if (quote) while (cursor < html.length && html[cursor] !== quote) cursor++;
        else while (cursor < html.length && !/[\s>]/.test(html[cursor])) cursor++;
        value = html.slice(valueStart, cursor);
        if (quote && html[cursor] === quote) cursor++;
      }
      if (!Object.hasOwn(attrs, name)) attrs[name] = decodeAttribute(value);
    }
    const end = html.indexOf('>', cursor);
    index = end < 0 ? html.length : end + 1;
    if (!templateDepth && (tag === 'body' || closing && tag === 'head')) break;
    if (tag === 'template') { templateDepth = Math.max(0, templateDepth + (closing ? -1 : 1)); continue; }
    if (!closing && /^(?:script|style|title|textarea|xmp|iframe|noembed|noframes|noscript)$/.test(tag)) {
      const endTag = new RegExp(`</${tag}(?=[\\s/>])`, 'g');
      endTag.lastIndex = index;
      const rawEnd = endTag.exec(lower);
      index = rawEnd ? rawEnd.index : html.length;
      continue;
    }
    if (!templateDepth && !closing && (tag === 'link' || tag === 'base')) tags.push({ tag, attrs });
  }
  return tags;
}

function rankIcon({ url, sizes = '', type = '', kind = 'html', purpose = '' }, order, options) {
  const mime = String(type).toLowerCase().split(';')[0].trim();
  if (mime && !/^image\/(?:png|jpeg|gif|webp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(mime)) return null;
  const purposes = String(purpose).toLowerCase().split(/\s+/);
  if (purposes.includes('monochrome') && !purposes.includes('any') && !purposes.includes('maskable')) return null;
  const scalable = mime === 'image/svg+xml' || /\.svg$/i.test(new URL(url).pathname);
  const detail = { url, width: 0, height: 0, scalable, kind, maskable: purposes.includes('maskable') && !purposes.includes('any') };
  let bestScore = -Infinity;
  for (const token of String(sizes).slice(0, 250).split(/\s+/)) {
    const dimensions = /^(\d{1,4})x(\d{1,4})$/i.exec(token);
    if (!dimensions) continue;
    const width = Number(dimensions[1]), height = Number(dimensions[2]);
    if (!width || !height || width > 8192 || height > 8192) continue;
    const { score } = iconQuality({ ...detail, width, height }, options);
    if (score > bestScore) { bestScore = score; detail.width = width; detail.height = height; }
  }
  const { score, adequate } = iconQuality(detail, options);
  return { ...detail, score, adequate, source: kind === 'manifest' ? 'manifest' : 'html', order };
}

function parseHtmlIcons(html, pageUrl, options) {
  const tags = metadataTags(html);
  const firstBase = tags.find(tag => tag.tag === 'base' && Object.hasOwn(tag.attrs, 'href'));
  const base = firstBase ? safeImageUrl(firstBase.attrs.href, pageUrl) || pageUrl : pageUrl;
  let manifest = null;
  const icons = [];
  for (const { tag, attrs } of tags) {
    if (tag !== 'link' || typeof attrs.href !== 'string' || !attrs.href.trim()) continue;
    const rel = String(attrs.rel || '').toLowerCase().split(/\s+/);
    const url = safeImageUrl(attrs.href, base);
    if (!url) continue;
    const kind = rel.includes('icon') || rel.includes('fluid-icon') ? 'html' : rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed') ? 'apple' : null;
    if (kind) {
      const icon = rankIcon({ url, sizes: attrs.sizes, type: attrs.type, kind }, icons.length, options);
      if (icon) icons.push(icon);
    }
    if (!manifest && rel.includes('manifest') && new URL(url).origin === new URL(pageUrl).origin) manifest = sitePageUrl(url);
  }
  return { icons, manifest };
}

function parseManifestIcons(text, manifestUrl, offset, options) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('content'); }
  if (!value || typeof value !== 'object' || !Array.isArray(value.icons)) return [];
  return value.icons.slice(0, 64).flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const url = safeImageUrl(item.src, manifestUrl);
    if (!url) return [];
    const icon = rankIcon({ url, sizes: item.sizes, type: item.type, purpose: item.purpose, kind: 'manifest' }, offset + index, options);
    return icon ? [icon] : [];
  });
}

async function boundedText(response, limit, headOnly=false) {
  const headEnd=text=>{const match=/<\/head\s*>|<body(?:\s|>)/i.exec(text);return match?match.index+match[0].length:0;};
  if ((!headOnly || !response.body?.getReader) && Number(response.headers?.get?.('content-length')) > limit) throw new Error('large');
  if (!response.body?.getReader) {
    let text = await response.text();
    if(headOnly&&headEnd(text))text=text.slice(0,headEnd(text));
    if (new TextEncoder().encode(text).byteLength > limit) throw new Error('large');
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let length = 0, text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if(headOnly){const end=headEnd(text);if(end&&new TextEncoder().encode(text.slice(0,end)).length<=limit){await reader.cancel().catch(()=>{});return text.slice(0,end);}}
      if (length > limit) { await reader.cancel().catch(() => {}); throw new Error('large'); }
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

async function fetchMetadata(url, kind, signal) {
  const origin = new URL(url).origin;
  const seen = new Set();
  for (let redirects = 0; redirects <= 2; redirects++) {
    if (seen.has(url)) throw new Error('redirect');
    seen.add(url);
    const response = await globalThis.fetch(url, {
      method: 'GET', signal, credentials: 'omit', referrerPolicy: 'no-referrer',
      redirect: 'manual', mode: 'cors', cache: 'no-store',
      headers: { Accept: kind === 'html' ? 'text/html,application/xhtml+xml;q=0.9' : 'application/manifest+json,application/json;q=0.9' },
    });
    if (response.type === 'opaqueredirect') throw new Error('redirect');
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers?.get?.('location');
      const safe = typeof location === 'string' ? safeImageUrl(location, url) : null;
      const next = safe && sitePageUrl(safe);
      if (!next || new URL(next).origin !== origin || redirects === 2) throw new Error('redirect');
      url = next;
      continue;
    }
    if (response.url && (!safeImageUrl(response.url) || new URL(response.url).origin !== origin)) throw new Error('redirect');
    if (!response.ok) throw new Error('network');
    const mime = (response.headers?.get?.('content-type') || '').toLowerCase().split(';')[0].trim();
    if (mime && !(kind === 'html' ? ['text/html', 'application/xhtml+xml'].includes(mime) : /^(?:application\/(?:manifest\+json|json)|text\/json)$/.test(mime))) throw new Error('content');
    return { text: await boundedText(response, kind === 'html' ? HTML_LIMIT : MANIFEST_LIMIT, kind === 'html'), url };
  }
  throw new Error('redirect');
}

function resultFor(pageUrl, source, errorCode = '', options) {
  const candidates = pageUrl ? getFaviconCandidates(pageUrl, options) : [];
  return { url: candidates[0] || null, candidates, variants: pageUrl ? getFaviconVariants(pageUrl, options) : [], source, ...(errorCode ? { warning: t(WARNINGS[errorCode] || WARNINGS.network) } : {}) };
}

/** Explicit action or opt-in bounded automatic metadata discovery. When requested, the permission API is invoked
 * synchronously, before cache initialization or any asynchronous work. Web pages
 * can read only sites that opt into CORS; no proxy bypass is attempted. */
export function discoverFavicon(siteUrl, { requestPermission = false, force = false, targetSize = 64, pixelRatio = 1, allCandidates = false } = {}) {
  const options = { targetSize, pixelRatio, allCandidates };
  const pageUrl = sitePageUrl(siteUrl);
  if (!pageUrl) return Promise.resolve(resultFor(null, 'fallback', 'unsafe', options));
  const requestKey = pageUrl + (allCandidates ? '#all' : '#best');
  if (pending.has(requestKey)) return pending.get(requestKey);
  const runtime = extensionRuntime();
  const origins = [`${new URL(pageUrl).origin}/*`];
  let permission;
  if (runtime && requestPermission) {
    try { permission = Promise.resolve(globalThis.chrome?.permissions?.request?.({ origins })).catch(() => false); }
    catch { permission = Promise.resolve(false); }
  }
  const job = (async () => {
    await faviconCacheReady;
    if (runtime) {
      let granted = false;
      try { granted = permission ? await permission : await globalThis.chrome?.permissions?.contains?.({ origins }); }
      catch { /* A revoked or unavailable permission is an ordinary fallback. */ }
      if (granted !== true) return resultFor(pageUrl, 'fallback', 'permission', options);
    }
    const previous = currentEntry(pageUrl);
    if (!force && previous) {
      if (previous.failedUntil > Date.now()) return resultFor(pageUrl, 'fallback', previous.errorCode || 'network', options);
      if (previous.checkedAt + CACHE_TTL > Date.now() && previous.candidates.length) return resultFor(pageUrl, 'cache', '', options);
    }
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, REQUEST_TIMEOUT); });
    try {
      const operation = (async () => {
        const html = await fetchMetadata(pageUrl, 'html', controller.signal);
        const metadata = parseHtmlIcons(html.text, html.url, options);
        const measuredIcon = icon => {
          const observed = previous?.details?.find(detail => detail.url === icon.url && detail.measuredAt);
          const detail = observed ? { ...icon, actualWidth: observed.actualWidth, actualHeight: observed.actualHeight, measuredAt: observed.measuredAt } : icon;
          const { score, adequate } = iconQuality(detail, options);
          return { ...detail, score, adequate };
        };
        let icons = metadata.icons.map(measuredIcon);
        let manifestError = '';
        if (metadata.manifest && (allCandidates || !icons.some(icon => icon.adequate))) {
          try {
            const manifest = await fetchMetadata(metadata.manifest, 'manifest', controller.signal);
            icons = [...icons, ...parseManifestIcons(manifest.text, manifest.url, icons.length, options).map(measuredIcon)];
          } catch (error) { manifestError = Object.hasOwn(WARNINGS, error?.message) ? error.message : 'network'; }
        }
        if (!icons.length) throw new Error(manifestError || 'missing');
        icons.sort((a, b) => b.score - a.score || a.order - b.order);
        return icons;
      })();
      const icons = await Promise.race([operation, deadline]);
      const candidates = unique(icons.map(icon => icon.url));
      const details = [];
      for (const icon of [...icons, ...(previous?.details || [])]) {
        if (details.some(detail => detail.url === icon.url) || details.length >= MAX_CANDIDATES) continue;
        const { score: _score, adequate: _adequate, order: _order, source: _source, ...detail } = icon;
        details.push(detail);
      }
      cache.set(pageUrl, { preferred: previous?.preferred || '', candidates, details, checkedAt: Date.now(), loadedAt: previous?.loadedAt || 0, failedUntil: 0, errorCode: '', source: icons[0].source, upgradeAt: 0, upgradeSize: 0 });
      persistCache();
      return resultFor(pageUrl, icons[0].source, '', options);
    } catch (error) {
      const code = controller.signal.aborted ? 'timeout' : Object.hasOwn(WARNINGS, error?.message) ? error.message : 'network';
      const entry = currentEntry(pageUrl) || { preferred: '', candidates: [], loadedAt: 0, source: 'fallback' };
      cache.set(pageUrl, { ...entry, checkedAt: entry.checkedAt || Date.now(), failedUntil: Date.now() + FAILURE_TTL, errorCode: code });
      persistCache();
      return resultFor(pageUrl, 'fallback', code, options);
    } finally {
      clearTimeout(timer);
      controller.abort(); // Also stop unread bodies rejected by their headers.
    }
  })();
  pending.set(requestKey, job);
  job.finally(() => { if (pending.get(requestKey) === job) pending.delete(requestKey); });
  return job;
}

/** Safe diagnostic data for UI; no network and no credentials. */
export function describeFavicon(siteUrl,iconUrl,options={}){
 const pageUrl=sitePageUrl(siteUrl),entry=pageUrl?currentEntry(pageUrl):null;
 const quality=getFaviconQuality(siteUrl,iconUrl,options);
 return {source:entry?.source||'site',url:iconUrl,quality,warning:entry?.errorCode?WARNINGS[entry.errorCode]:''};
}

/** All distinct source assets for the picker. Do not substitute a third-party
 * favicon aggregation service; fallback paths are labelled as guesses until
 * the browser has successfully decoded them. Each asset is an inert image. */
export function getFaviconVariants(siteUrl, options={}) {
 const pageUrl=sitePageUrl(siteUrl);if(!pageUrl)return [];
 const entry=currentEntry(pageUrl), audited=SITE_ICON_CATALOG[originKey(pageUrl)]||[];
 const declared=entry?.checkedAt + CACHE_TTL > Date.now()?entry.candidates:[];
 return getFaviconCandidates(pageUrl,options).filter(url=>safeImageUrl(url)).map(url=>{
  const detail=detailFor(entry,url), known=audited.some(v=>v.url===url);
  return {url,kind:detail.kind||'fallback',scalable:!!detail.scalable,
   width:detail.actualWidth||detail.width||0,height:detail.actualHeight||detail.height||0,
   source:declared.includes(url)?t("网站声明"):known?t("已核对站点资源"):t("常规路径")};
 });
}
