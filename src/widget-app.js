// SPDX-License-Identifier: GPL-3.0-only
import { bindWidgetCardInteractions } from './widget-card-interactions.js';
import { widgetSettings, bindWidgetSettings } from './widget-config-view.js';
import { t, setLocale } from './i18n.js';
import { themeTokens } from './theme.js';
import { newWidgetConfig, validateWidgetConfig } from './widget-registry.js';
import { newWidgetData, validateWidgetData } from './widget-data.js';
import { renderWidget, bindWidgets, refreshLiveWidgets } from './widgets.js';
import { createWidgetDetails } from './widget-details.js';
import { UTILITY_WIDGETS, utilityWorkspace, bindUtilityWorkspace } from './widget-workspaces.js';
import { converterWorkspace, bindConverterWorkspace } from './converter-view.js';
import { fileConverterWorkspace, bindFileConverterWorkspace } from './file-converter-workspace.js';
import { codecWorkspace, bindCodecWorkspace } from './codec-workspace.js';
import { imageCompressorWorkspace, bindImageCompressorWorkspace } from './image-compressor-workspace.js';
import { mapWorkspace } from './map-view.js';
import { bindMapWorkspace } from './map-workspace.js';
import { weatherWorkspace } from './weather-view.js';
import { bindWeatherWorkspace } from './weather-workspace.js';
import { hotsearchWorkspace } from './hotsearch-view.js';
import { bindHotsearchWorkspace } from './hotsearch-workspace.js';
import { bookmarkWorkspace } from './bookmarks-view.js';
import { bindBookmarkWorkspace } from './bookmarks-workspace.js';
import { pomodoroWorkspace } from './pomodoro-view.js';
import { bindPomodoro } from './pomodoro-runtime.js';
import { migrateFocusTimer } from './pomodoro.js';

const bridge=globalThis.qiyeBridge,init=bridge.init;
const cardInteractions=bindWidgetCardInteractions(bridge);
setLocale(init.environment.locale);
const kind=new URL(location.href).searchParams.get('widget')||'clock';
let revision=init.revision,queue=Promise.resolve(),cleanup=()=>{},dirty=false,pendingSaves=0,lastSaveError=null;
let envelope=init.legacy||JSON.parse(init.value||'null')||{config:newWidgetConfig(kind),data:newWidgetData(kind)};
if(init.legacy?.widget==='focus')envelope=migrateFocusTimer(init.legacy.data.focus);
if(init.legacy?.widget==='calculator')envelope={config:newWidgetConfig(kind),data:newWidgetData(kind)};
if(init.legacy?.widget==='base-converter')envelope={config:newWidgetConfig(kind),data:{...newWidgetData(kind),category:'radix',radix:init.legacy.data}};
if(init.legacy?.widget==='hotlinks')envelope={config:newWidgetConfig(kind),data:newWidgetData(kind)};
// Shared layouts intentionally contain no personal config; initialize missing defaults here.
const config=Object.keys(envelope.config||{}).length?envelope.config:newWidgetConfig(kind);
const data=Object.keys(envelope.data||{}).length?envelope.data:newWidgetData(kind);
let item={...init.item,type:'widget',widget:kind,config:validateWidgetConfig(kind,config),data:validateWidgetData(kind,data)};
const state={items:[item],settings:{...init.environment.settings,wallpaperApiEnabled:false}};
let mounted=false;
const toast=message=>bridge.call('toast',{message}).catch(()=>{});
function save() {
 const value={config:validateWidgetConfig(kind,item.config),data:validateWidgetData(kind,item.data)};dirty=true;pendingSaves++;
 const job=queue.then(async()=>{
  const result=await bridge.call('save',{value,expected:revision,title:item.title,size:item.size});revision=result.revision;lastSaveError=null;return structuredClone(state);
 });
 queue=job.catch(error=>{lastSaveError=error;});job.finally(()=>{if(--pendingSaves===0)dirty=false;}).catch(()=>{});
 return job;
}
const host={getState:()=>state,save,uid:()=>crypto.randomUUID(),toast,refreshCards:()=>{},rerender:()=>render(),
 async saveData(id,next,expected){if(JSON.stringify(item.data)!==expected)throw new Error(t('组件内容已在其他位置修改，请重新打开。'));const before=item.data;item.data=validateWidgetData(kind,next);try{await save();return structuredClone(item.data);}catch(error){item.data=before;throw error;}},
 async saveSettings(id,changes,expected){if(JSON.stringify([item.title,item.config])!==expected)throw new Error(t('组件设置已在其他位置修改，请重新打开。'));const before=structuredClone(item);Object.assign(item,{title:changes.title,config:validateWidgetConfig(kind,changes.config)});try{await save();return structuredClone(item);}catch(error){Object.assign(item,before);throw error;}},
 openDialog(name){if(init.environment.mode==='card')bridge.call('open').catch(toast);else if(name==='widget-config')showSettings();else render();},
 applyWallpaper:photo=>bridge.call('wallpaper',{photo}),wallpaperEnabledChanged:()=>{},
};
function environment(env) {
 setLocale(env.locale);Object.assign(state.settings,env.settings);document.documentElement.dataset.theme=env.theme;
 const tokens=themeTokens({...state.settings,theme:env.theme});document.documentElement.dataset.accent=state.settings.useThemeColor?'custom':'default';for(const [key,value] of Object.entries({'--accent':tokens.accent,'--accent-ink':tokens.ink,'--radius':state.settings.radius+'px','--tile-size':state.settings.gridSize+'px','--surface-opacity':(state.settings.surfaceOpacity||72)/100}))document.documentElement.style.setProperty(key,value);
 document.body.dataset.theme=env.theme;
 if(mounted)refreshLiveWidgets(document.getElementById('widget-root'),state);
}
function render() {
 cleanup();cleanup=()=>{};const root=document.getElementById('widget-root');root.inert=false;
 if(init.environment.mode==='card'){
  document.body.className='embedded-card';root.className='tile tile-widget size-'+item.size;root.dataset.size=item.size;
  root.innerHTML=renderWidget(item,state);for(const button of root.querySelectorAll('[data-action=widget-config]'))button.remove();cleanup=bindWidgets(root,host);
 } else {
  document.body.className='embedded-window';root.className='widget-app-body';root.closest('dialog').className='app-dialog widget-app-dialog '+({calendar:'calendar-app-dialog',memo:'memo-app-dialog',weather:'weather-app-dialog',map:'map-app-dialog',bookmarks:'bookmarks-app-dialog',hotsearch:'hotsearch-app-dialog',converter:'converter-app-dialog','file-converter':'file-converter-app-dialog','image-compressor':'image-tool-dialog',codec:'codec-app-dialog',pomodoro:'pomodoro-app-dialog'}[kind]||'utility-app-dialog');
  const views={converter:converterWorkspace,'file-converter':fileConverterWorkspace,codec:codecWorkspace,'image-compressor':imageCompressorWorkspace,map:mapWorkspace,weather:weatherWorkspace,hotsearch:hotsearchWorkspace,bookmarks:bookmarkWorkspace,pomodoro:pomodoroWorkspace};
  const binders={converter:bindConverterWorkspace,'file-converter':bindFileConverterWorkspace,map:bindMapWorkspace,weather:bindWeatherWorkspace,hotsearch:bindHotsearchWorkspace,bookmarks:bindBookmarkWorkspace};
  if(['calendar','memo'].includes(kind)){const details=createWidgetDetails(host);root.innerHTML=details.render(item);details.mount(root);cleanup=()=>details.close();}
  else if(UTILITY_WIDGETS.includes(kind)){root.innerHTML=utilityWorkspace(item,state);cleanup=bindUtilityWorkspace(root,item,host);}
  else if(views[kind]){
   // The timer renderer takes a timestamp, while other views may consume host state.
   root.innerHTML=kind==='pomodoro'?pomodoroWorkspace(item):views[kind](item,state);
   if(kind==='codec')cleanup=bindCodecWorkspace(root);
   else if(kind==='image-compressor')cleanup=bindImageCompressorWorkspace(root,{applyWallpaper:blob=>bridge.call('wallpaper',{blob})});
   else if(kind==='pomodoro')cleanup=bindPomodoro(root,host);
   else cleanup=binders[kind](root,item,host);
  }else if(kind==='wallpaper'){root.innerHTML=`<div class="utility-app-header"><h2>${t('在线壁纸')}</h2><button data-close>×</button></div><button class="primary-button" data-open-wallpaper>${t('打开壁纸中心')}</button>`;}
  else {root.innerHTML=renderWidget({...item,size:'2x2'},state);cleanup=bindWidgets(root,host);}
 }
 mounted=true;
}
bridge.onState=message=>{
 Object.assign(init.environment,message.environment);environment(message.environment);
 if(message.environment.size&&message.environment.size!==item.size){item.size=message.environment.size;render();}
 // Do not overwrite an editor draft. Its next save uses optimistic concurrency.
 if(init.environment.mode==='card'&&message.revision!==revision&&!dirty){
  const next=message.legacy||JSON.parse(message.value||'null');if(next){item.config=validateWidgetConfig(kind,next.config);item.data=validateWidgetData(kind,next.data);revision=message.revision;render();}
 }
};
document.addEventListener('click',async event=>{
 if(event.target.closest('[data-plugin-settings]')){event.preventDefault();event.stopImmediatePropagation();showSettings();return;}
 if(event.target.closest('[data-plugin-back]')){event.preventDefault();event.stopImmediatePropagation();render();return;}
 const target=event.target.closest('[data-close],[data-detail-action="window-expand"],[data-action="wallpaper"],[data-open-wallpaper]');
 if(target){event.preventDefault();event.stopImmediatePropagation();if(target.hasAttribute('data-close')){try{await flush();}catch(error){toast(error.message);return;}}bridge.call(target.hasAttribute('data-close')?'close':target.dataset.detailAction==='window-expand'?'expand':'wallpaper').catch(toast);}
 const link=event.target.closest('a[href]');if(link&&/^https:/.test(link.href)){event.preventDefault();bridge.call('openUrl',{url:link.href}).catch(toast);}
},true);
document.addEventListener('pointerdown',()=>document.body.classList.add('pointer-focus'),true);
document.addEventListener('keydown',()=>document.body.classList.remove('pointer-focus'),true);
document.addEventListener('keydown',async event=>{if(event.key==='Escape'&&!event.defaultPrevented&&init.environment.mode==='window'){try{await flush();bridge.call('close').catch(toast);}catch(error){toast(error.message);}}});
window.addEventListener('pagehide',()=>{cardInteractions.destroy();cleanup();});
environment(init.environment);render();
setInterval(()=>refreshLiveWidgets(document.getElementById('widget-root'),state),1000);
// The host can move this initialized frame between its card and window slots.
// Every transition disposes the previous view and confirms pending saves. The
// fresh render clears transient editors (codec/files) while keeping saved data.
let switching=false;
bridge.onView=async message=>{
 if(switching||!['card','window'].includes(message.environment?.mode))throw new Error('Invalid view transition');
 switching=true;cardInteractions.cancel();
 try{
  await flush();
  Object.assign(init.environment,message.environment);
  environment(init.environment);render();await runCommand(message.environment.command);
 }catch(error){render();throw error;}finally{switching=false;}
};
const contextMenus={
 notes:[['notes-export','导出 TXT','download']],
 todo:[['todo-add','添加待办','plus'],['todo-clear','清除已完成','trash']],
 clock:[['clock-add','添加城市','plus'],['clock-1','每行 1 个','list'],['clock-2','每行 2 个','grid'],['clock-3','每行 3 个','grid']],
 hotsearch:[['hot-refresh','刷新榜单','refresh'],['hot-manage','管理订阅','list']]
};
const contextMenu=[{id:'settings',label:t('设置组件'),icon:'settings'},...(contextMenus[kind]||[]).map(([id,label,icon])=>({id,label:t(label),icon}))];
async function runCommand(command){
 if(command==='settings'){await showSettings();return;}
 const selectors={'notes-export':'[data-life-action=notes-export]','todo-clear':'[data-clear-done]','clock-add':'[data-life-action=clock-add]','clock-1':'[data-clock-columns="1"]','clock-2':'[data-clock-columns="2"]','clock-3':'[data-clock-columns="3"]','hot-refresh':'[data-hot-action=refresh]','hot-manage':'[data-hot-action=manage]'};
 if(command==='todo-add')document.querySelector('[data-widget-form=todo] input')?.focus();
 else if(selectors[command])document.querySelector(selectors[command])?.click();
}
bridge.onCommand=runCommand;
bridge.port.postMessage({type:'ready',version:2,features:['view-switch'],contextMenu});
void runCommand(init.environment.command);


async function showSettings(){if(await cleanup()===false){toast(t('内容尚未保存，重新打开组件可继续编辑。'));return;}const root=document.getElementById('widget-root');root.inert=false;root.innerHTML=widgetSettings(item);cleanup=bindWidgetSettings(root,item,host,render);}

async function flush(){
 const saved=await cleanup();await queue;
 if(saved===false)throw lastSaveError||new Error(t('内容尚未保存，重新打开组件可继续编辑。'));
 if(lastSaveError){render();throw lastSaveError;}
 await bridge.flushStorage();
}
bridge.flush=flush;
