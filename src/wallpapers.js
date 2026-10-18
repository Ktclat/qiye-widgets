// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { DIRECT_WALLPAPERS } from './wallpaper-catalog.js';
/* Public wallpaper provider. No account, API key, or application server. */

export const wallpaperProviders = Object.freeze([
  Object.freeze({ id: 'picsum', name: 'Lorem Picsum', url: 'https://picsum.photos/', description: '公开摄影图库，保留摄影师与照片来源' }),
]);

const PHOTO_ID = /^\d{1,10}$/;
const REQUEST_LIMIT = 30;

function cleanWallpaperText(value, fallback, length = 120) {
  return (typeof value === 'string' ? value : '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, length) || fallback;
}

/** Stored image URLs are fixed HTTPS Picsum photos, never arbitrary imported URLs. */
export function isAllowedWallpaperUrl(value) {
  if (typeof value !== 'string' || value.length > 250) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'picsum.photos' || url.username || url.password || url.port || url.search || url.hash) return false;
    const match = /^\/id\/(\d{1,10})\/(\d{2,4})\/(\d{2,4})(?:\.(?:jpg|webp))?$/.exec(url.pathname);
    return Boolean(match && Number(match[2]) >= 64 && Number(match[2]) <= 3840 && Number(match[3]) >= 64 && Number(match[3]) <= 2160);
  } catch { return false; }
}

function wallpaperSourceUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    if (url.hostname === 'unsplash.com' && /^\/photos\/[^/\s]+\/?$/.test(url.pathname)) {
      url.search = '';
      return url.href;
    }
    return url.href === 'https://picsum.photos/images' ? url.href : null;
  } catch { return null; }
}

/** Safe, canonical data shared by the widget, background settings, and backups. */
export function normalizeWallpaperPhoto(value) {
  if(['deepin','wallhaven'].includes(value?.provider))return normalizeCatalogWallpaper(value);
  if(value?.provider === 'commons') return normalizeCommonsPhoto(value);
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.provider !== 'picsum') return null;
  const id = String(value.id ?? '');
  if (!PHOTO_ID.test(id)) return null;
  for (const key of ['url', 'thumbnail']) {
    if (value[key] !== undefined && (!isAllowedWallpaperUrl(value[key]) || new URL(value[key]).pathname.split('/')[2] !== id)) return null;
  }
  const sourceUrl = value.sourceUrl === undefined ? 'https://picsum.photos/images' : wallpaperSourceUrl(value.sourceUrl);
  if (!sourceUrl) return null;
  const dimension = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 100_000 ? Math.round(n) : null;
  return {
    provider: 'picsum', id,
    url: `https://picsum.photos/id/${id}/1920/1080`,
    thumbnail: `https://picsum.photos/id/${id}/640/360`,
    sourceUrl,
    title: cleanWallpaperText(value.title, `${t("摄影壁纸 · #{v0}", {v0: id})}`),
    author: cleanWallpaperText(value.author, t("摄影师未署名"), 100),
    license: 'Unsplash License', licenseUrl: 'https://unsplash.com/license',
    width: dimension(value.width), height: dimension(value.height),
  };
}

/** The API includes portrait photos too; desktop browsing keeps landscape originals. */
export function parsePicsumResponse(raw) {
  if (!Array.isArray(raw) || raw.length > 100) throw new Error(t("壁纸服务返回的数据格式不正确"));
  const seen = new Set();
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || !Number.isFinite(entry.width) || !Number.isFinite(entry.height) || entry.width < 1280 || entry.height < 720 || entry.width < entry.height) return [];
    const photo = normalizeWallpaperPhoto({ provider: 'picsum', id: entry.id, sourceUrl: entry.url, author: entry.author, width: entry.width, height: entry.height });
    if (!photo || seen.has(photo.id)) return [];
    seen.add(photo.id);
    return [photo];
  });
}

/** Fetch only documented provider endpoints. A caller must first receive user intent. */
export async function fetchWallpaperPage({ page = 1, limit = REQUEST_LIMIT, signal, fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  if (!Number.isInteger(page) || page < 1 || page > 1000 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error(t("壁纸分页参数不正确"));
  if (typeof fetchImpl !== 'function') throw new Error(t("当前环境无法连接壁纸服务"));
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, Math.max(1, Math.min(30_000, Number(timeoutMs) || 10_000)));
  try {
    const response = await fetchImpl(`https://picsum.photos/v2/list?page=${page}&limit=${limit}`, {
      signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(response.status === 429 ? t("壁纸服务请求较多，请稍后重试") : `${t("壁纸服务暂不可用（{v0}）", {v0: response.status})}`);
    const contentType = response.headers?.get?.('content-type');
    if (contentType && !/\bjson\b/i.test(contentType)) throw new Error(t("壁纸服务返回的不是图片清单"));
    return parsePicsumResponse(await response.json());
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') throw new Error(signal?.aborted ? t("壁纸请求已取消") : t("壁纸加载超时，请稍后重试"));
    if (error instanceof TypeError) throw new Error(t("无法连接壁纸服务，请检查网络后重试"));
    if (error instanceof SyntaxError) throw new Error(t("壁纸服务返回的数据无法读取"));
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

/** Small state machine: a failed next page preserves the last working photograph. */
export function createWallpaperBrowser({ fetchPage = fetchWallpaperPage, initialPhoto = null, startPage = 1, onChange = () => {} } = {}) {
  const initial = normalizeWallpaperPhoto(initialPhoto);
  const state = { status: initial ? 'ready' : 'idle', imageStatus: initial ? 'loading' : 'idle', photo: initial, photos: initial ? [initial] : [], index: initial ? 0 : -1, page: Number.isInteger(startPage) && startPage >= 1 && startPage <= 1000 ? startPage : 1, error: '', applying: false };
  let pending = null;
  let attemptedPage = state.page;
  const emit = (reason = 'render') => onChange(reason);
  const select = (index) => { state.index = index; state.photo = state.photos[index]; state.status = 'ready'; state.imageStatus = 'loading'; state.error = ''; emit(); };
  const readPage = (page) => {
    if (pending) return pending;
    attemptedPage = page;
    state.status = 'loading'; state.error = ''; emit();
    const job = Promise.resolve().then(async () => {
      try {
        let photos = await fetchPage({ page });
        if (!Array.isArray(photos)) throw new Error(t("壁纸服务返回的数据格式不正确"));
        let actualPage = page;
        if (!photos.length && page > 1) { photos = await fetchPage({ page: 1 }); actualPage = 1; }
        const safe = Array.isArray(photos) ? photos.map(normalizeWallpaperPhoto).filter(Boolean) : [];
        if (!safe.length) throw new Error(t("这一组暂无适合桌面的照片，请稍后重试"));
        state.photos = safe; state.page = actualPage;
        select(0);
        return state.photo;
      } catch (error) {
        state.status = 'error'; state.error = String(error?.message || t("暂时无法获取壁纸")); emit();
        return null;
      } finally { pending = null; }
    });
    pending = job;
    return job;
  };
  return {
    getState: () => ({ ...state, photos: [...state.photos] }),
    load: () => state.photo ? Promise.resolve(state.photo) : readPage(state.page),
    next: () => {
      if (pending || state.applying) return pending || Promise.resolve(null);
      if (state.index + 1 < state.photos.length) { select(state.index + 1); return Promise.resolve(state.photo); }
      return readPage(state.photo ? (state.page % 1000) + 1 : state.page);
    },
    nextPage: () => state.applying ? Promise.resolve(null) : readPage(state.photo ? (state.page % 1000) + 1 : state.page),
    retry: () => readPage(attemptedPage),
    markImageReady: (id) => { if (state.photo?.id === id && state.imageStatus !== 'ready') { state.imageStatus = 'ready'; emit('image'); } },
    markImageError: (id) => { if (state.photo?.id === id) { state.imageStatus = 'error'; emit('image'); } },
    apply: async (onApply) => {
      if (!state.photo || state.imageStatus !== 'ready' || state.applying || typeof onApply !== 'function') return false;
      state.applying = true; emit('image');
      try { await onApply({ ...state.photo }); return true; }
      finally { state.applying = false; emit('image'); }
    },
  };
}

// Wikimedia Commons integration: only bitmap files with recognized open
// licences and upload.wikimedia.org URLs cross the storage boundary.
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
function commonsMediaUrl(value) {
 if(typeof value!=='string' || value.length>2048)return null;
 try{const u=new URL(value);return u.protocol==='https:' && u.hostname==='upload.wikimedia.org' && !u.username && !u.password && !u.port && !u.search && !u.hash && u.pathname.startsWith('/wikipedia/commons/') && /\.(?:jpe?g|png|webp)$/i.test(u.pathname)?u.href:null;}catch{return null;}
}
function commonsSourceUrl(value) {
 try{const u=new URL(value);return u.protocol==='https:' && u.hostname==='commons.wikimedia.org' && !u.username && !u.password && !u.port && !u.search && !u.hash && u.pathname.startsWith('/wiki/File:')?u.href:null;}catch{return null;}
}
function commonsLicenseUrl(value) {
 try{const u=new URL(value);return u.protocol==='https:' && u.hostname==='creativecommons.org' && !u.username && !u.password && !u.port && !u.search && !u.hash && /^\/(?:licenses\/(?:by|by-sa)\/[1-4]\.0|publicdomain\/(?:zero|mark)\/1\.0)\/$/.test(u.pathname)?u.href:null;}catch{return null;}
}
export function normalizeCommonsPhoto(value) {
 if(!value || value.provider!=='commons' || typeof value.id!=='string' || !/^File:.{1,500}$/u.test(value.id))return null;
 const url=commonsMediaUrl(value.url),thumbnail=commonsMediaUrl(value.thumbnail),sourceUrl=commonsSourceUrl(value.sourceUrl),licenseUrl=commonsLicenseUrl(value.licenseUrl);
 if(!url || !thumbnail || !sourceUrl || !licenseUrl)return null;
 // The source must describe this very file, not an unrelated attribution page.
 try{if(decodeURIComponent(new URL(sourceUrl).pathname.slice(6)).replaceAll('_',' ')!==value.id.replaceAll('_',' '))return null;}catch{return null;}
 const width=Number(value.width),height=Number(value.height);
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<640||height<360||width>30000||height>30000)return null;
 return {provider:'commons',id:value.id,url,thumbnail,sourceUrl,width,height,title:cleanWallpaperText(value.title,value.id.slice(5)),author:cleanWallpaperText(value.author,t("见原始文件页"),180),license:cleanWallpaperText(value.license,t("见许可"),60),licenseUrl};
}
function plainMetadata(value) {
 return String(value?.value||'').replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim().slice(0,300);
}
export function parseCommonsResponse(raw) {
 const pages=raw?.query?.pages;
 if(!Array.isArray(pages) || pages.length>50)throw new Error(t("Commons 返回的图片清单不正确"));
 const result=[];
 for(const p of pages){
  const info=p?.imageinfo?.[0],m=info?.extmetadata;
  if(!info || !m || !['image/jpeg','image/png','image/webp'].includes(info.mime) || info.width<1280 || info.height<720 || info.width<info.height)continue;
  let licenseUrl=plainMetadata(m.LicenseUrl).replace(/^http:/,'https:');
  const short=plainMetadata(m.LicenseShortName);
  if(!licenseUrl && /^(?:public domain|CC0)$/i.test(short))licenseUrl=short==='CC0'?'https://creativecommons.org/publicdomain/zero/1.0/':'https://creativecommons.org/publicdomain/mark/1.0/';
  const photo=normalizeCommonsPhoto({provider:'commons',id:p.title,url:info.thumburl,thumbnail:info.thumburl,sourceUrl:info.descriptionurl,width:info.width,height:info.height,title:p.title?.slice(5).replaceAll('_',' '),author:plainMetadata(m.Artist),license:short,licenseUrl});
  if(photo)result.push(photo);
 }
 return {photos:result,continue:raw?.continue && typeof raw.continue==='object'?raw.continue:null};
}
async function commonsRequest(params,{signal,fetchImpl=globalThis.fetch}={}) {
 const controller=new AbortController(),abort=()=>controller.abort();
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,12000);
 try{
  const url=new URL(COMMONS_API);url.search=new URLSearchParams({action:'query',format:'json',formatversion:'2',origin:'*',...params});
  const res=await fetchImpl(url.href,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/json'}});
  if(!res.ok)throw new Error(`${t("Commons 暂不可用（{v0}），可切换其他来源", {v0: res.status})}`);
  if(Number(res.headers?.get?.('content-length'))>2*1024*1024)throw new Error(t("Commons 响应过大"));
  const text=await res.text();if(text.length>2*1024*1024)throw new Error(t("Commons 响应过大"));
  const body=JSON.parse(text);if(body.error)throw new Error(t("Commons 查询失败，请稍后重试"));
  return body;
 }catch(e){if(controller.signal.aborted)throw new Error(t("壁纸请求已取消或超时"));throw e;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function fetchCommonsWallpaperPage({page=1,signal,fetchImpl=globalThis.fetch}={}) {
 if(!Number.isInteger(page)||page<1||page>50)throw new Error(t("无效的壁纸页码"));
 const body=await commonsRequest({generator:'search',gsrsearch:'filetype:bitmap landscape nature',gsrnamespace:'6',gsrlimit:'18',gsroffset:String((page-1)*18),prop:'imageinfo',iiprop:'url|size|mime|extmetadata',iiurlwidth:'640',iiextmetadatafilter:'Artist|LicenseShortName|LicenseUrl'}, {signal,fetchImpl});
 return parseCommonsResponse(body).photos;
}
export async function resolveCommonsWallpaper(photo,{signal,fetchImpl=globalThis.fetch}={}) {
 const safe=normalizeCommonsPhoto(photo);if(!safe)throw new Error(t("无效的 Commons 壁纸"));
 const body=await commonsRequest({titles:safe.id,prop:'imageinfo',iiprop:'url',iiurlwidth:'1920'}, {signal,fetchImpl});
 const url=commonsMediaUrl(body?.query?.pages?.[0]?.imageinfo?.[0]?.thumburl);
 if(!url)throw new Error(t("无法获取高清壁纸，原背景已保留"));
 return {...safe,url};
}

/** Catalog snapshots preserve the verified author/license/URL relationship.
 * Imported backups cannot turn this into an arbitrary remote-image loader. */
export function normalizeCatalogWallpaper(value){
 if(!value||typeof value!=='object')return null;
 const item=DIRECT_WALLPAPERS.find(p=>p.provider===value.provider&&p.id===value.id);
 if(!item)return null;
 for(const key of ['url','thumbnail','sourceUrl','licenseUrl'])if(value[key]!==undefined&&value[key]!==item[key])return null;
 return {...item};
}
export async function fetchCatalogWallpaperPage(provider,{page=1,signal}={}){
 if(!['deepin','wallhaven'].includes(provider)||!Number.isInteger(page)||page<1||page>50)throw Error(t("壁纸页码无效"));
 if(signal?.aborted)throw Error(t("已取消"));
 const perPage=provider==='deepin'?4:12;
 return DIRECT_WALLPAPERS.filter(p=>p.provider===provider).slice((page-1)*perPage,page*perPage).map(p=>({...p}));
}
export function catalogWallpaperPages(provider){return Math.max(1,Math.ceil(DIRECT_WALLPAPERS.filter(p=>p.provider===provider).length/(provider==='deepin'?4:12)));}
