// SPDX-License-Identifier: GPL-3.0-only
import { getFaviconCandidates, getFaviconQuality, rememberFavicon, takeFaviconUpgradeCandidates, discoverFavicon } from './favicons.js';

import { normalizeIconSelection } from './icon-selection.js';

import { recoverIcoArtwork } from './icon-artwork.js';

// Metadata requests have their own two-slot queue; page HTML is never fetched
// from every render, and no permission prompt is opened automatically.
const metadataQueue=[];let metadataActive=0;
function queueMetadata(current,job){return new Promise(resolve=>{metadataQueue.push({current,job,resolve});pumpMetadata();});}
function pumpMetadata(){while(metadataActive<2&&metadataQueue.length){const work=metadataQueue.shift();if(!work.current()){work.resolve(null);continue;}metadataActive++;Promise.resolve().then(work.job).catch(()=>null).then(result=>work.resolve(result)).finally(()=>{metadataActive--;pumpMetadata();});}}

const faviconImageBindings = new WeakMap();
const faviconImageFailures = new Map();
const faviconImageWork = new Set();
const faviconImageQueue = [];
const FAVICON_IMAGE_TIMEOUT = 8_000;
const FAVICON_IMAGE_FAILURE_TTL = 5 * 60 * 1000;
const MAX_FAVICON_IMAGE_REQUESTS = 4;
let activeFaviconImageRequests = 0;

function pumpFaviconImageQueue() {
  while (activeFaviconImageRequests < MAX_FAVICON_IMAGE_REQUESTS && faviconImageQueue.length) {
    const job = faviconImageQueue.shift();
    if (!job.binding.current()) { job.binding.cancel(); continue; }
    activeFaviconImageRequests++;
    let released = false;
    job.start(() => {
      if (released) return;
      released = true;
      activeFaviconImageRequests--;
      pumpFaviconImageQueue();
    });
  }
}

function faviconTargetSize(visual, image, options) {
  if (Number.isFinite(options.targetSize) && options.targetSize > 0) return Math.min(256, options.targetSize);
  if (visual.closest?.('.engine-mark')) return 24;
  const bounds = visual.getBoundingClientRect?.() || {};
  const imageBounds = image.getBoundingClientRect?.() || {};
  let style;
  try { style = globalThis.getComputedStyle?.(image); } catch { /* Detached test or transient DOM. */ }
  const pixels = (value, available) => {
    if (typeof value !== 'string' || !value.trim() || /^(?:auto|none|normal)$/.test(value)) return 0;
    const number = parseFloat(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return value.endsWith('%') ? available > 0 ? available * number / 100 : 0 : number;
  };
  const constrained = (axis, limit, available, rendered) => {
    const size = pixels(style?.[axis], available) || rendered || 0;
    const maximum = pixels(style?.[limit], available);
    return maximum ? Math.min(size || maximum, maximum) : size;
  };
  const width = constrained('width', 'maxWidth', bounds.width, imageBounds.width);
  const height = constrained('height', 'maxHeight', bounds.height, imageBounds.height);
  return Math.min(256, Math.max(16, Math.ceil(Math.max(width, height) || 64)));
}

function markFaviconImageFailure(url) {
  faviconImageFailures.set(url, Date.now() + FAVICON_IMAGE_FAILURE_TTL);
  if (faviconImageFailures.size > 500) faviconImageFailures.delete(faviconImageFailures.keys().next().value);
}

/** Hydrate inert favicon markup. Image requests share a four-slot queue, and
 * quality upgrades use a separate image so a usable icon never flashes away. */
export function bindFaviconImages(root = document, options = {}) {
  // Switching groups can detach a whole grid while its requests are queued.
  // Release those slots immediately instead of waiting for their timeouts.
  for (const binding of [...faviconImageWork]) if (!binding.current()) binding.cancel();
  for (const visual of root.querySelectorAll('.site-visual[data-favicon-site]')) {
    const previous = faviconImageBindings.get(visual);
    if (previous && !options.force) continue;
    previous?.cancel();
    let image = visual.querySelector('.site-favicon');
    const siteUrl = visual.dataset.faviconSite;
    if (!image || !siteUrl) continue;
    const sizeOptions = {
      targetSize: faviconTargetSize(visual, image, options),
      pixelRatio: Number.isFinite(options.pixelRatio) && options.pixelRatio > 0 ? options.pixelRatio : globalThis.devicePixelRatio || 1,
    };
    const selected = normalizeIconSelection(visual.dataset.faviconSelected);
    const provided = selected ? [selected] : Array.isArray(options.candidates) ? options.candidates : getFaviconCandidates(siteUrl, sizeOptions);
    const candidates = [...new Set(provided)].filter(url => typeof url === 'string' && url).slice(0, 12);
    const tried = new Set();
    let candidateIndex = 0, upgradeIndex = 0, upgrades = null, stopped = false, requestTicket = 0;
    let best = null, enhanced=false;
    const autoDiscover=options.autoDiscover ?? (globalThis.document?.documentElement?.dataset?.iconDiscovery==='auto');
    if (previous?.siteUrl === siteUrl && !image.hidden && image.naturalWidth && image.naturalHeight) {
      const url = image.currentSrc || image.src;
      best = { url, width: image.naturalWidth, height: image.naturalHeight, quality: getFaviconQuality(siteUrl, url, { ...sizeOptions, width: image.naturalWidth, height: image.naturalHeight }) };
    }
    const binding = {
      siteUrl,
      current: () => !stopped && visual.isConnected && faviconImageBindings.get(visual) === binding,
      abort: null,
      cancel: () => {
        if (stopped) return;
        stopped = true;
        requestTicket++;
        for (let index = faviconImageQueue.length - 1; index >= 0; index--) if (faviconImageQueue[index].binding === binding) faviconImageQueue.splice(index, 1);
        binding.abort?.();
        faviconImageWork.delete(binding);
      },
    };
    faviconImageBindings.set(visual, binding);
    faviconImageWork.add(binding);
    const complete = () => {
      faviconImageWork.delete(binding);
      if (!best) { image.hidden = true; image.removeAttribute('src'); visual.classList.remove('is-loaded'); visual.dataset.iconQuality='missing'; }
      report();
    };
    const report=()=>{
      if(!binding.current())return;
      const information=best?{siteUrl,url:best.sourceUrl||best.url,width:best.width,height:best.height,requiredSize:best.quality.requiredSize,scalable:best.quality.scalable,adequate:best.quality.adequate}:{siteUrl,url:null,adequate:false};
      visual.dataset.iconQuality=best?(best.quality.adequate?'sharp':'low'):'missing';
      visual.dataset.iconWidth=String(best?.width||0);visual.dataset.iconHeight=String(best?.height||0);
      visual.dataset.iconSource=information.url||'';
      try{options.onStatus?.(information);}catch{/* Observer callbacks cannot interrupt loading. */}
    };
    const enhance=async()=>{
      if(enhanced||selected||!autoDiscover||!binding.current()){complete();return;}
      enhanced=true;
      try{
        const result=await queueMetadata(binding.current,async()=>{
          const recovered=best&&!best.quality.adequate?await recoverIcoArtwork(best.sourceUrl||best.url,{requiredSize:best.quality.requiredSize}):null;
          const metadata=(!recovered||Math.min(recovered.width,recovered.height)<sizeOptions.targetSize*sizeOptions.pixelRatio)?await discoverFavicon(siteUrl,{...sizeOptions,requestPermission:false}):null;
          return {recovered,metadata};
        });
        if(!binding.current()){binding.cancel();return;}
        const choices=[];
        if(result?.recovered&&(!best||Math.min(result.recovered.width,result.recovered.height)>Math.min(best.width,best.height)))choices.push({url:result.recovered.dataUrl,sourceUrl:result.recovered.url});
        for(const url of result?.metadata?.candidates||[])if(!tried.has(url))choices.push({url});
        let index=0;
        const next=()=>{
          if(!binding.current()){binding.cancel();return;}
          if(best?.quality.adequate||index>=Math.min(3,choices.length)){complete();return;}
          const choice=choices[index++];load(choice.url,!!best,next,choice.sourceUrl);
        };
        next();
      }catch{complete();}
    };
    const nextUsable = (values, start) => {
      for (let index = start; index < values.length; index++) {
        const url = values[index];
        if (tried.has(url) || !options.force && (faviconImageFailures.get(url) || 0) > Date.now()) continue;
        return { url, index: index + 1 };
      }
      return null;
    };
    const load = (url, background, done, sourceUrl=null) => {
      const job = { binding, start: release => {
        const ticket = ++requestTicket;
        let target;
        try { target = background ? new globalThis.Image() : image; }
        catch { release(); complete(); return; }
        let settled = false, timer = null;
        const active = () => !settled && ticket === requestTicket && binding.current();
        const cleanup = abort => {
          if (settled) return false;
          settled = true;
          clearTimeout(timer);
          target.onload = null;
          target.onerror = null;
          if (abort) target.removeAttribute('src');
          binding.abort = null;
          release();
          return true;
        };
        binding.abort = () => cleanup(true);
        const failed = () => {
          if (!active()) { if (!binding.current()) binding.cancel(); else cleanup(true); return; }
          markFaviconImageFailure(url);
          cleanup(true);
          done(false);
        };
        target.onload = () => {
          if (!active()) { if (!binding.current()) binding.cancel(); else cleanup(true); return; }
          const width = target.naturalWidth, height = target.naturalHeight;
          if (!width || !height) { failed(); return; }
          const quality = getFaviconQuality(siteUrl, sourceUrl||url, { ...sizeOptions, width, height });
          cleanup(false);
          faviconImageFailures.delete(url);
          try { Promise.resolve(selected ? undefined : rememberFavicon(siteUrl, sourceUrl||url, { width, height })).catch(() => {}); }
          catch { /* Cache quotas do not hide a successfully loaded image. */ }
          if (!best || quality.score > best.quality.score) {
            if (background) {
              // Reuse the already loaded image instead of assigning its URL a
              // second time; this also keeps the concurrency bound meaningful.
              target.className = image.className || 'site-favicon';
              target.alt = '';
              target.draggable = false;
              image.replaceWith(target);
              image = target;
            }
            best = { url, sourceUrl, width, height, quality };
            image.hidden = false;
            visual.classList.add('is-loaded');
          }
          report();
          done(true);
        };
        target.onerror = failed;
        timer = setTimeout(failed, FAVICON_IMAGE_TIMEOUT);
        target.referrerPolicy = 'no-referrer';
        target.decoding = 'async';
        target.draggable = false;
        if (!background) { target.hidden = true; visual.classList.remove('is-loaded'); }
        tried.add(url);
        try { target.src = url; } catch { failed(); }
      } };
      // Already validated local artwork needs no network slot. A blocked remote
      // site must not hold up an upload or a captured browser-cache image.
      if (url.startsWith('data:')) {
        if (binding.current()) job.start(() => {}); else binding.cancel();
      } else {
        faviconImageQueue.push(job);
        pumpFaviconImageQueue();
      }
    };
    const advanceUpgrade = () => {
      if (!binding.current()) { binding.cancel(); return; }
      if (selected || best?.quality.adequate) { complete(); return; }
      if (!upgrades) {
        upgrades = takeFaviconUpgradeCandidates(siteUrl, best.url, {
          ...sizeOptions, width: best.width, height: best.height, attempted: [...tried], force: !!options.force,
        }).slice(0, 3);
      }
      const next = nextUsable(upgrades, upgradeIndex);
      if (!next) { enhance(); return; }
      upgradeIndex = next.index;
      load(next.url, true, advanceUpgrade);
    };
    const advanceInitial = () => {
      if (!binding.current()) { binding.cancel(); return; }
      const next = nextUsable(candidates, candidateIndex);
      if (!next) { enhance(); return; }
      candidateIndex = next.index;
      load(next.url, !!best, loaded => loaded ? advanceUpgrade() : advanceInitial());
    };
    advanceInitial();
  }
}
