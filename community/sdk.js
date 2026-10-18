// SPDX-License-Identifier: GPL-3.0-only
// Runs inside the author's isolated iframe, never in the Qiye host page.
export function connectWidget() {
  return new Promise(resolve=>{
    function initialize(event) {
      if(event.source!==parent||event.data?.type!=='qiye:init'||event.data.version!==1||!event.ports[0])return;
      window.removeEventListener('message',initialize);
      const port=event.ports[0],pending=new Map(),listeners=new Set();let serial=0;
      const api={data:JSON.parse(event.data.data),environment:event.data.environment,
        save(value){const id=String(++serial),encoded=JSON.stringify(value);if(typeof encoded!=='string'||new TextEncoder().encode(encoded).length>65536)return Promise.reject(new Error('Data must be JSON, at most 64 KiB'));
          return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Save timed out'));},10000);pending.set(id,{resolve:()=>{clearTimeout(timeout);api.data=value;resolve();},reject:error=>{clearTimeout(timeout);reject(error);}});port.postMessage({type:'save',id,value:encoded});});},
        onEnvironment(callback){listeners.add(callback);return ()=>listeners.delete(callback);}
      };
      port.onmessage=event=>{const m=event.data;if(m?.type==='environment'){api.environment=m.environment;for(const listener of listeners)listener(m.environment);}if(m?.type==='saved'&&pending.has(m.id)){const waiter=pending.get(m.id);pending.delete(m.id);if(m.ok)waiter.resolve();else waiter.reject(new Error(m.error||'Save failed'));}};
      port.postMessage({type:'ready',version:1});resolve(api);
    }
    window.addEventListener('message',initialize);
  });
}
