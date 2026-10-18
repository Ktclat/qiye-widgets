// SPDX-License-Identifier: GPL-3.0-only
import { DEFAULT_STATE, validateImport, uid } from './legacy-host.js';
import { getWidgetDefinition, newWidgetConfig } from '../../src/widget-registry.js';
import { newWidgetData } from '../../src/widget-data.js';
import { keys, array, string, byteLength, invalid } from '../../src/validation.js';
import { publicHttpsUrl } from '../../src/public-json.js';
import { t } from '../../src/i18n.js';

export const LAYOUT_MAX_BYTES=2*1024*1024;
export const APPEARANCE_KEYS=['theme','surfaceStyle','useThemeColor','themeColor','wallpaper','blur','dim','gridSize','gap','desktopMaxWidth','iconShape','iconBackdrop','radius','iconOpacity','labelSize','clockSize','searchWidth','searchHeight','pinClock','pinSearch'];

export function validateLayout(raw) {
  const encoded=typeof raw==='string'?raw:JSON.stringify(raw);
  if(typeof encoded!=='string'||byteLength(encoded)>LAYOUT_MAX_BYTES)invalid('layout',t('文件超过大小限制。'));
  let value;try{value=JSON.parse(encoded);}catch{invalid('layout',t('来源没有返回有效 JSON。'));}
  keys(value,['format','version','title','description','groups','items','appearance'],'layout');
  if(value.format!=='qiye-layout'||value.version!==1)invalid('layout',t('仅支持当前桌面分享格式。'));
  const title=string(value.title,'layout.title',80),description=string(value.description,'layout.description',1000,true);
  const groups=array(value.groups,'layout.groups',30,1);
  const items=array(value.items,'layout.items',1200).map((source,index)=>{
    const item=structuredClone(source),path='layout.items['+index+']';
    if(item.type==='widget'){
      keys(item,['id','groupId','type','widget','title','size','config'],path);
      if(!getWidgetDefinition(item.widget))invalid(path,t('缺少组件：{name}',{name:item.widget}));
      item.data=newWidgetData(item.widget);
      if(['weather','hotsearch'].includes(item.widget))item.config={...item.config,enabled:false};
    } else if(item.type==='link'){
      let url;try{url=new URL(item.url);}catch{invalid(path,t('网站地址无效。'));}
      if(url.username||url.password)invalid(path,t('分享的网站地址不能包含账号密码。'));
    }
    return item;
  });
  let appearance=null;
  if(value.appearance!==null){keys(value.appearance,APPEARANCE_KEYS,'layout.appearance');appearance=structuredClone(value.appearance);}
  const desktop=validateImport({...structuredClone(DEFAULT_STATE),groups,items,activeGroupId:groups[0].id,settings:{...DEFAULT_STATE.settings,...appearance}});
  return {format:'qiye-layout',version:1,title,description,groups:desktop.groups,items:desktop.items.map(({data,...item})=>item),appearance};
}

export function createLayout(state,{groupIds=[state.activeGroupId],appearance=false,title=t('我的桌面分享'),description=''}={}) {
  const groups=state.groups.filter(group=>groupIds.includes(group.id));
  const selected=new Set(groups.map(group=>group.id));
  const items=state.items.filter(item=>selected.has(item.groupId)).map(item=>{
    if(item.type!=='widget')return structuredClone(item);
    const definition=getWidgetDefinition(item.widget);
    return {id:item.id,groupId:item.groupId,type:'widget',widget:item.widget,title:t(definition.title),size:item.size,config:item.widget==='community'?structuredClone(item.config):newWidgetConfig(item.widget)};
  });
  return validateLayout({format:'qiye-layout',version:1,title,description,groups,items,appearance:appearance?Object.fromEntries(APPEARANCE_KEYS.map(key=>[key,state.settings[key]])):null});
}

export function layoutImportPlan(state,raw,{groupIds,mode='new',targetGroupId=state.activeGroupId,skipDuplicates=true,appearance=false}={}) {
  const layout=validateLayout(raw), chosen=layout.groups.filter(group=>!groupIds||groupIds.includes(group.id));
  if(!chosen.length)throw new Error(t('请至少选择一个分组。'));
  if(!['new','merge'].includes(mode)||mode==='merge'&&!state.groups.some(group=>group.id===targetGroupId))throw new Error(t('请选择有效的导入位置。'));
  const next=structuredClone(state),groupMap=new Map(),itemMap=new Map(),selected=new Set(chosen.map(group=>group.id));
  for(const group of chosen){const id=mode==='merge'?targetGroupId:uid();groupMap.set(group.id,id);if(mode==='new')next.groups.push({...group,id});}
  const source=layout.items.filter(item=>selected.has(item.groupId));
  const seen=new Set(state.items.filter(item=>item.type==='link').map(item=>item.url));let skipped=0;
  for(const item of source){
    if(skipDuplicates&&item.type==='link'&&seen.has(item.url)){skipped++;continue;}
    itemMap.set(item.id,uid());if(item.type==='link')seen.add(item.url);
  }
  for(const original of source){
    if(!itemMap.has(original.id))continue;
    const item={...structuredClone(original),id:itemMap.get(original.id),groupId:groupMap.get(original.groupId)};
    if(item.type==='link'&&item.folderId)item.folderId=itemMap.get(item.folderId)||null;
    if(item.type==='widget')item.data=newWidgetData(item.widget);
    next.items.push(item);
  }
  if(appearance&&layout.appearance)Object.assign(next.settings,layout.appearance);
  next.activeGroupId=groupMap.get(chosen[0].id);
  return {state:validateImport(next),added:itemMap.size,skipped,groups:mode==='new'?chosen.length:0};
}

export function layoutShareLink(source) {
  return 'https://ktclat.github.io/qiye/#import='+encodeURIComponent(publicHttpsUrl(source));
}
