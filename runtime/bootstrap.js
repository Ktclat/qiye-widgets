// SPDX-License-Identifier: GPL-3.0-only
window.addEventListener('message',function initialize(event){
 if(event.source!==parent||event.data?.type!=='qiye:init'||event.data.version!==2||!event.ports[0])return;
 window.removeEventListener('message',initialize);
 const port=event.ports[0],pending=new Map();let sequence=0,storage={...event.data.storage},storageTimer;
 const bridge={init:event.data,port,onState:null,call(method,params={}){
  // Initial render can call the host before the bundle posts its ready message.
  // Send calls after this synchronous bootstrap so the host accepts them in order.
  return Promise.resolve().then(()=>new Promise((resolve,reject)=>{const id=String(++sequence);const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Host response timed out'));},15000);pending.set(id,{resolve,reject,timeout});port.postMessage({type:'call',id,method,params});}));
 }};
 port.onmessage=async event=>{const message=event.data;if(message.type==='drag-state'){bridge.onDragState?.(message);return;}if(message.type==='command'){bridge.onCommand?.(message.command);return;}if(message.type==='flush'){try{await bridge.flush?.();port.postMessage({type:'flushed'});}catch(error){port.postMessage({type:'flushed',error:error.message});}return;}if(message.type==='view'){try{if(!bridge.onView)throw new Error('View switching unavailable');await bridge.onView(message);port.postMessage({type:'view-ready',id:message.id});}catch(error){port.postMessage({type:'view-ready',id:message.id,error:error.message});}return;}if(message.type==='state'){bridge.onState?.(message);return;}const job=pending.get(message.id);if(message.type!=='result'||!job)return;clearTimeout(job.timeout);pending.delete(message.id);message.error?job.reject(new Error(message.error)):job.resolve(message.value);};
 const persist=()=>{clearTimeout(storageTimer);storageTimer=setTimeout(()=>bridge.call('storage',{value:storage}).catch(error=>bridge.call('toast',{message:error.message})),150);};
 const scopedStorage={get length(){return Object.keys(storage).length;},key:index=>Object.keys(storage)[index]??null,getItem:key=>Object.hasOwn(storage,String(key))?storage[String(key)]:null,setItem(key,value){storage[String(key)]=String(value);persist();},removeItem(key){delete storage[String(key)];persist();},clear(){storage={};persist();}};
 Object.defineProperty(globalThis,'localStorage',{value:scopedStorage});
 Object.defineProperty(globalThis,'sessionStorage',{value:scopedStorage});
 if(event.data.environment.extension){
  const bookmarks=Object.fromEntries(['getTree','create','update','move','remove','removeTree'].map(action=>[action,(...args)=>bridge.call('bookmarks',{action,args})]));
  Object.defineProperty(globalThis,'chrome',{value:{bookmarks,permissions:{contains:descriptor=>descriptor.permissions?.includes('bookmarks')?bridge.call('bookmarks',{action:'contains'}):Promise.resolve(true),request:descriptor=>descriptor.permissions?.includes('bookmarks')?bridge.call('bookmarks',{action:'request'}).then(granted=>{if(!granted)throw new Error('请先点击窗口标题栏的“授权浏览器书签”。');return granted;}):Promise.resolve(true)}}});
 }
 bridge.flushStorage=()=>{clearTimeout(storageTimer);return bridge.call('storage',{value:storage});};
 Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success,error){bridge.call('geolocation').then(success,cause=>error?.({code:1,message:cause.message}));}}});
 globalThis.qiyeBridge=bridge;
 try {
 /* QIYE_BUNDLE */
 }catch(error){document.getElementById('widget-root').textContent=error.message;console.error(error);}
});
