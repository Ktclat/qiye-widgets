// SPDX-License-Identifier: GPL-3.0-only
import { escapeText as e } from './html.js';
import { t, getLocale } from './i18n.js';
import { validateCommunityData } from './community-format.js';
import { windowControls } from './widget-app-controls.js';

export function communityCard(item) {
  const manifest=item.config.manifest;
  return `<button class="community-launcher" data-action="widget-open"><span aria-hidden="true">◈</span><strong>${e(item.title)}</strong><small>${e(manifest.author)}</small><span>${t('打开组件')} ↗</span></button>`;
}

export function communityWorkspace(item) {
  const m=item.config.manifest;
  return `<div class="community-workspace"><header class="utility-app-header"><h2 id="dialog-title">${e(item.title)}</h2>${windowControls(false)}</header><div class="community-runtime-layout"><aside><h3>${e(m.name)}</h3><p>${e(m.description)}</p><p>${e(m.author)} · ${e(m.release)}</p><p>${e(m.license)}</p><a href="${e(m.repository)}" target="_blank" rel="noopener noreferrer">${t('查看源码')}</a><p class="community-origin">${e(new URL(m.entry).origin)}</p><p>${t('点击运行后连接作者的网站。组件可联网，但只能通过接口读写自身数据，无法访问你的其他桌面内容。')}</p><button class="primary-button" data-community-run>${t('运行组件')}</button><button class="secondary-button" data-community-stop hidden>${t('停止')}</button><p data-community-status role="status"></p></aside><section class="community-frame-host"><p>${t('组件将在这里运行')}</p></section></div></div>`;
}

export function bindCommunityWorkspace(root,item,host) {
  const events=new AbortController(),options={signal:events.signal};let frame,port,readyTimer,observer,themeObserver,generation=0;
  const panel=root.querySelector('.community-frame-host'),status=root.querySelector('[data-community-status]'),run=root.querySelector('[data-community-run]'),stopButton=root.querySelector('[data-community-stop]');
  const latest=()=>host.getState().items.find(entry=>entry.id===item.id);
  const stop=()=>{generation++;clearTimeout(readyTimer);observer?.disconnect();themeObserver?.disconnect();port?.close();port=null;frame?.remove();frame=null;run.disabled=false;stopButton.hidden=true;};
  const environment=()=>({locale:getLocale(),theme:document.documentElement.dataset.theme||document.body.dataset.theme||host.getState().settings.theme,size:item.size,width:Math.round(panel.clientWidth),height:Math.round(panel.clientHeight)});
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.detailAction==='window-expand')root.closest('dialog').classList.toggle('widget-app-expanded');
    if(button===stopButton){stop();panel.textContent=t('组件已停止');status.textContent='';}
    if(button!==run)return;
    stop();const current=generation;run.disabled=true;stopButton.hidden=false;status.textContent=t('正在连接组件…');panel.replaceChildren();
    frame=document.createElement('iframe');frame.title=item.title;frame.sandbox='allow-scripts';frame.referrerPolicy='no-referrer';frame.setAttribute('credentialless','');frame.allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'";
    frame.addEventListener('load',()=>{
      if(current!==generation)return;
      port?.close();const channel=new MessageChannel();port=channel.port1;let ready=false,busy=false,lastWrite=0;
      port.onmessage=async event=>{
        if(current!==generation)return;const message=event.data;
        if(message?.type==='ready'&&message.version===1){ready=true;clearTimeout(readyTimer);status.textContent=t('组件正在运行');return;}
        if(!ready||message?.type!=='save'||typeof message.id!=='string'||message.id.length>80)return;
        const reply=payload=>{if(current===generation)channel.port1.postMessage({type:'saved',id:message.id,...payload});};
        if(busy||Date.now()-lastWrite<100){reply({error:t('保存过于频繁，请稍后重试。')});return;}
        busy=true;lastWrite=Date.now();
        try{const data=validateCommunityData({value:message.value}),before=latest();if(!before)throw new Error(t('组件已移除'));await host.saveData(item.id,data,JSON.stringify(before.data));reply({ok:true});}
        catch(error){reply({error:error.message});}finally{busy=false;}
      };
      frame.contentWindow.postMessage({type:'qiye:init',version:1,data:latest()?.data.value||'null',environment:environment()},'*',[channel.port2]);
      observer?.disconnect();observer=new ResizeObserver(()=>port?.postMessage({type:'environment',environment:environment()}));observer.observe(panel);
      themeObserver?.disconnect();themeObserver=new MutationObserver(()=>port?.postMessage({type:'environment',environment:environment()}));themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','lang']});
    },options);
    readyTimer=setTimeout(()=>{if(current===generation){stop();panel.textContent=t('组件未响应，可能不允许嵌入或没有实现接口。');status.textContent=t('连接失败，可重试或查看源码。');}},12000);
    frame.src=item.config.manifest.entry;panel.append(frame);
  },options);
  return ()=>{events.abort();stop();};
}
