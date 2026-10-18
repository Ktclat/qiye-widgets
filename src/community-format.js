// SPDX-License-Identifier: GPL-3.0-only
import { keys, string, array, unique, byteLength, invalid } from './validation.js';
import { publicHttpsUrl } from './public-json.js';
import { TILE_SIZES } from './widget-sizes.js';

export function validateCommunityManifest(raw) {
  keys(raw,['format','version','id','name','description','author','release','entry','repository','license','sizes','previews'],'manifest');
  if(raw.format!=='qiye-widget'||raw.version!==1)invalid('manifest','qiye-widget v1 required');
  const text=(key,max)=>string(raw[key],'manifest.'+key,max);
  const id=text('id',80),release=text('release',30);
  if(!/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/.test(id)||!/^\d+\.\d+\.\d+$/.test(release))invalid('manifest','invalid id or release');
  const sizes=array(raw.sizes,'manifest.sizes',5,2);
  if(sizes.some(size=>!TILE_SIZES.includes(size))||!sizes.includes('1x1')||!sizes.includes('2x2'))invalid('manifest.sizes','1x1 and 2x2 required');
  unique(sizes,'manifest.sizes');
  const previews=array(raw.previews,'manifest.previews',5).map(preview=>{
    keys(preview,['size','url'],'manifest.previews');if(!sizes.includes(preview.size))invalid('manifest.previews','unsupported size');
    return {size:preview.size,url:publicHttpsUrl(string(preview.url,'preview.url',2048))};
  });unique(previews.map(p=>p.size),'manifest.previews');
  return {format:'qiye-widget',version:1,id,name:text('name',80),description:text('description',500),author:text('author',80),release,entry:publicHttpsUrl(text('entry',2048)),repository:publicHttpsUrl(text('repository',2048)),license:text('license',80),sizes:[...sizes],previews};
}

export function validateCommunitySource(raw) {
  if(byteLength(JSON.stringify(raw))>512*1024)invalid('source','512 KiB maximum');
  if(raw?.format==='qiye-widget'){const manifest=validateCommunityManifest(raw);return {format:'qiye-widget-source',version:1,name:manifest.author,widgets:[manifest]};}
  keys(raw,['format','version','name','widgets'],'source');
  if(raw.format!=='qiye-widget-source'||raw.version!==1)invalid('source','qiye-widget-source v1 required');
  const widgets=array(raw.widgets,'source.widgets',50).map(validateCommunityManifest);unique(widgets.map(w=>w.id),'source.widgets');
  return {format:'qiye-widget-source',version:1,name:string(raw.name,'source.name',80),widgets};
}

export function validateCommunityData(raw) {
  keys(raw,['value'],'data');const value=string(raw.value,'data.value',65536,true);
  if(byteLength(value)>65536)invalid('data.value','64 KiB maximum');
  try{JSON.parse(value);}catch{invalid('data.value','JSON required');}
  return {value};
}
