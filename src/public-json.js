// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';

export function publicHttpsUrl(value) {
  let url;
  try { url=new URL(value); } catch { throw new Error(t('请输入有效的公开 HTTPS 地址。')); }
  url.hostname=url.hostname.replace(/\.$/,'');
  const hostname=url.hostname.toLowerCase();
  if(url.protocol!=='https:' || url.username || url.password || url.port && url.port!=='443' || hostname==='localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || !hostname.includes('.') || /^[\d.]+$/.test(hostname) || hostname.includes(':'))throw new Error(t('请输入不含账号密码的公开 HTTPS 域名地址。'));
  return url.href;
}

export async function requestPublicOrigin(value) {
  const url=publicHttpsUrl(value), api=globalThis.chrome;
  if(api?.runtime?.id && api.permissions){
    const permissions={origins:[new URL(url).origin+'/*']};
    if(!await api.permissions.contains(permissions) && !await api.permissions.request(permissions))throw new Error(t('未获准访问这个来源。'));
  }
  return url;
}

export async function fetchPublicJson(value,{signal,maxBytes=2*1024*1024,fetcher=globalThis.fetch,cache='no-cache'}={}) {
  const url=publicHttpsUrl(value), controller=new AbortController();
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)controller.abort();
  const timer=setTimeout(abort,12000);
  try {
    const response=await fetcher(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache,headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(t('来源返回 HTTP {status}',{status:response.status}));
    if(Number(response.headers.get('content-length'))>maxBytes)throw new Error(t('文件超过大小限制。'));
    const reader=response.body?.getReader();let text='';
    if(reader){const decoder=new TextDecoder();let bytes=0;try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel();throw new Error(t('文件超过大小限制。'));}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}}
    else {text=await response.text();if(new TextEncoder().encode(text).length>maxBytes)throw new Error(t('文件超过大小限制。'));}
    if(controller.signal.aborted)throw new Error(t('读取已取消或超时。'));
    try{return JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error(t('来源没有返回有效 JSON。'));}
  } catch(error) {
    if(controller.signal.aborted)throw new Error(t('读取已取消或超时。'));
    if(error instanceof TypeError)throw new Error(t('无法读取来源，请检查网络及服务器的跨域访问（CORS）设置，或改为导入文件。'));
    throw error;
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
