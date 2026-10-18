// SPDX-License-Identifier: GPL-3.0-only
// Recover the best REAL ICO frame; never pretend an upscaled 16px source is HD.
const LIMIT=1024*1024,TTL=7*86400000,KEY='qiye.icon-artwork.v1';
const memory=new Map(),pending=new Map(),failed=new Map();
function allowed(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname.includes('.')&&!/^\d+(?:\.\d+){3}$/.test(u.hostname)&&!/(?:^|\.)(?:localhost|local|internal|lan|home|onion)$/.test(u.hostname);}catch{return false;}}
/** ICO frame selection is checked before a browser decoder sees any bytes. */
export function selectIcoFrame(value,requested=128){
 const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
 if(bytes.length<22||bytes.length>LIMIT)return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(view.getUint16(0,true)!==0||view.getUint16(2,true)!==1)return null;
 const count=view.getUint16(4,true);if(!count||count>64||6+count*16>bytes.length)return null;
 const frames=[];
 for(let i=0;i<count;i++){
  const at=6+i*16,w=bytes[at]||256,h=bytes[at+1]||256,size=view.getUint32(at+8,true),offset=view.getUint32(at+12,true);
  if(offset<6+count*16||size<8||offset+size>bytes.length)continue;
  const extent=Math.min(w,h),sufficient=extent>=requested;
  frames.push({at,width:w,height:h,size,offset,score:(sufficient?1000-Math.abs(extent-requested):extent)-Math.abs(w-h)*2});
 }
 if(!frames.length)return null;
 const f=frames.sort((a,b)=>b.score-a.score)[0],raw=bytes.slice(f.offset,f.offset+f.size);
 const isPng=raw[0]===137&&raw[1]===80&&raw[2]===78&&raw[3]===71;
 if(isPng)return {...f,mime:'image/png',bytes:raw};
 const ico=new Uint8Array(22+raw.length);ico.set([0,0,1,0,1,0]);ico.set(bytes.slice(f.at,f.at+16),6);
 new DataView(ico.buffer).setUint32(18,22,true);ico.set(raw,22);
 return {...f,mime:'image/x-icon',bytes:ico};
}
function validData(v){return typeof v==='string'&&v.length<=180000&&/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(v);}
try{
 const raw=globalThis.localStorage?.getItem(KEY);
 if(raw&&raw.length<2400000)for(const row of JSON.parse(raw).slice(0,16))if(allowed(row.url)&&validData(row.dataUrl)&&row.time<=Date.now()&&row.time+TTL>Date.now()&&row.width>0&&row.width<=256&&row.height>0&&row.height<=256)memory.set(row.url,row);
}catch{/* Storage is only a cache. */}
function store(row){
 memory.delete(row.url);memory.set(row.url,row);
 while(memory.size>16)memory.delete(memory.keys().next().value);
 let encoded=JSON.stringify([...memory.values()]);
 while(encoded.length>2400000&&memory.size>1){memory.delete(memory.keys().next().value);encoded=JSON.stringify([...memory.values()]);}
 try{globalThis.localStorage?.setItem(KEY,encoded);}catch{/* A failed cache write never touches desktop data. */}
}
/** One bounded, coalesced attempt, only for ICOs and only after a low-res load.
 * CORS/host permission denial retains the visible icon; it never uses a proxy. */
export function recoverIcoArtwork(url,{requiredSize=128,fetchImpl=globalThis.fetch}={}){
 if(!allowed(url)||!/(?:\.ico)(?:\?|$)/i.test(url))return Promise.resolve(null);
 if(memory.get(url)?.time+TTL>Date.now())return Promise.resolve(memory.get(url));
 if(failed.get(url)>Date.now())return Promise.resolve(null);
 if(pending.has(url))return pending.get(url);
 const work=(async()=>{
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),3500);
  let objectUrl='';
  try{
   const r=await fetchImpl(url,{signal:abort.signal,mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
   if(!r.ok||Number(r.headers?.get?.('content-length'))>LIMIT)return null;
   const chunks=[];let total=0;
   if(r.body?.getReader){const reader=r.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>LIMIT){await reader.cancel();return null;}chunks.push(value);}}finally{reader.releaseLock();}}
   else {const value=new Uint8Array(await r.arrayBuffer());if(value.byteLength>LIMIT)return null;chunks.push(value);total=value.byteLength;}
   const bytes=new Uint8Array(total);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}
   const frame=selectIcoFrame(bytes,Math.min(256,requiredSize));if(!frame)return null;
   if(abort.signal.aborted)return null;
   const im=new Image();objectUrl=URL.createObjectURL(new Blob([frame.bytes],{type:frame.mime}));
   await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=reject;abort.signal.addEventListener('abort',reject,{once:true});im.src=objectUrl;});
   if(!im.naturalWidth||im.naturalWidth>256||im.naturalHeight>256)return null;
   const canvas=document.createElement('canvas');canvas.width=im.naturalWidth;canvas.height=im.naturalHeight;
   const context=canvas.getContext('2d');if(!context)return null;context.drawImage(im,0,0);
   const dataUrl=canvas.toDataURL('image/png');if(!validData(dataUrl))return null;
   const row={url,dataUrl,width:canvas.width,height:canvas.height,time:Date.now()};store(row);return row;
  }catch{return null;}
  finally{clearTimeout(timer);if(objectUrl)URL.revokeObjectURL(objectUrl);failed.set(url,Date.now()+86400000);while(failed.size>200)failed.delete(failed.keys().next().value);pending.delete(url);}
 })();pending.set(url,work);return work;
}
