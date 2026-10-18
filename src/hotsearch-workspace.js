// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { icon } from './icons.js';
import { requestPublicOrigin } from './public-json.js';
import { hotsearchApiBase, hotsearchSource, filterHotsearchSources, moveHotsearchSubscription } from './hotsearch-sources.js';
import { hotsearchClient } from './hotsearch-data.js';
import { hotsearchSidebar, hotsearchMain, hotsearchManager, hotsearchCard, bindHotsearchLogos } from './hotsearch-view.js';

export function bindHotsearchWorkspace(root, initial, host) {
  const events = new AbortController(), options = {signal:events.signal};
  const find = selector => root.querySelector(selector);
  const current = () => host.getState().items.find(item => item.id===initial.id);
  const alive = () => !events.signal.aborted && root.isConnected && !!current();
  const view = {category:'subscribed', query:'', active:initial.config.activeSource, collapsed:new Set(), manageCategory:'all', manageQuery:''};
  let baseline = JSON.stringify([initial.title,initial.config]), saving = false, loading = null, expanded = false, dragged = '', managerOpen = false;
  let feedbackTimer, feedbackMessage='', feedbackTemporary=false, dragScope=null, dragPreview=null, dragFrame=0, dragClickUntil=0;
  const sortAnimations=new Set();
  function renderFeedback() {
    if (!alive()) return;
    for (const node of root.querySelectorAll('.hotsearch-feedback,.hotsearch-manager-feedback')) {
      node.textContent=feedbackMessage;
      node.hidden=!feedbackMessage || node.classList.contains('hotsearch-manager-feedback')!==managerOpen;
      node.classList.toggle('is-transient',feedbackTemporary);
    }
  }
  function feedback(message, duration=0) {
    clearTimeout(feedbackTimer);
    feedbackMessage=message; feedbackTemporary=duration>0;
    renderFeedback();
    if (message && duration && alive()) feedbackTimer=setTimeout(()=>feedback(''),duration);
  }
  function selectVisible() {
    const sources = filterHotsearchSources(current().config,view.category,view.query);
    if (!sources.some(source=>source.id===view.active)) view.active=sources[0]?.id || '';
  }
  function renderMain() {
    if (!alive()) return;
    const main = find('.hotsearch-main'), scroll = main.scrollTop;
    const positions = new Map([...main.querySelectorAll('[data-hot-board]')].map(board => [board.dataset.hotBoard, board.querySelector('.hotsearch-board-content').scrollTop]));
    main.innerHTML=hotsearchMain(current(),host.getState(),view);
    bindHotsearchLogos(main);
    main.scrollTop=scroll;
    for (const board of main.querySelectorAll('[data-hot-board]')) board.querySelector('.hotsearch-board-content').scrollTop=positions.get(board.dataset.hotBoard) || 0;
  }
  function renderManager() {
    const panel = find('#hotsearch-manager'), scroll = panel.scrollTop, active = document.activeElement;
    const queryFocused = active?.hasAttribute('data-hot-manage-query');
    const form = panel.querySelector('#hotsearch-settings');
    const draft = form && {apiBase:form.elements.apiBase.value, enabled:form.elements.enabled.checked, open:panel.querySelector('details').open};
    panel.innerHTML=hotsearchManager(current(),view);
    bindHotsearchLogos(panel);
    panel.scrollTop=scroll;
    if (draft) { panel.querySelector('details').open=draft.open; panel.querySelector('[name=apiBase]').value=draft.apiBase; panel.querySelector('[name=enabled]').checked=draft.enabled; }
    if (queryFocused) panel.querySelector('[data-hot-manage-query]').focus();
    renderFeedback();
  }
  function render() {
    if (!alive()) return;
    selectVisible();
    find('.hotsearch-sidebar').innerHTML=hotsearchSidebar(current(),view);
    bindHotsearchLogos(find('.hotsearch-sidebar'));
    find('.hotsearch-layout').classList.toggle('is-grid',current().config.layout==='grid');
    for (const button of root.querySelectorAll('[data-hot-category]')) button.setAttribute('aria-pressed',String(button.dataset.hotCategory===view.category));
    const grid=current().config.layout==='grid', layout=find('[data-hot-action=layout]');
    layout.innerHTML=icon(grid?'list':'grid'); layout.title=t(grid?'切换单榜视图':'切换多榜视图'); layout.setAttribute('aria-label',layout.title);
    find('.hotsearch-provider').textContent=' · '+new URL(current().config.apiBase).hostname+' / GitHub';
    renderMain();
  }
  function toggleManager(open) {
    managerOpen=open;
    find('.hotsearch-manager-overlay').hidden=!open;
    find('[data-hot-action=manage]').setAttribute('aria-expanded',String(open));
    for (const selector of ['.hotsearch-app-header','.hotsearch-toolbar','.hotsearch-layout','.hotsearch-app-footer']) find(selector).inert=open;
    if (open) { renderManager(); find('[data-hot-action=manage-close]').focus(); }
    else find('[data-hot-action=manage]').focus({preventScroll:true});
    renderFeedback();
  }
  async function save(patch) {
    if (!alive() || saving) return false;
    saving=true; feedback('');
    find('#hotsearch-manager').setAttribute('aria-busy','true');
    try {
      const item=current();
      const updated=await host.saveSettings(item.id,{title:item.title,config:{...item.config,...patch}},baseline);
      baseline=JSON.stringify([updated.title,updated.config]);
      return alive();
    } catch (error) { feedback(error.message || t('保存失败，请重试')); return false; }
    finally { saving=false; if (alive()) find('#hotsearch-manager').setAttribute('aria-busy','false'); }
  }
  async function load(force=false, only='', automatic=false) {
    if (!alive() || automatic && !current().config.enabled) return;
    loading?.abort();
    const controller=loading=new AbortController();
    const config={...current().config};
    let sources=filterHotsearchSources(config,view.category,view.query);
    if (config.layout==='list') sources=sources.filter(source=>source.id===view.active);
    if (only) sources=sources.filter(source=>source.id===only);
    const refresh=find('[data-hot-action=refresh]'); refresh.classList.remove('is-loading'); refresh.disabled=false;
    if (!automatic && sources.some(source=>!source.github)) {
      try { await requestPublicOrigin(config.apiBase); }
      catch (error) {
        if(alive() && !controller.signal.aborted) {
          feedback(error.message);
          for (const source of sources) {
            const status=hotsearchClient.state(config,source.id);
            if (!source.github && status.status!=='loading') { status.status='error';status.error=error.message; }
          }
          renderMain();
        }
        return;
      }
      if (!alive() || controller.signal.aborted) return;
    }
    feedback(''); refresh.classList.add('is-loading'); refresh.disabled=true;
    let index=0;
    async function worker() {
      while (!controller.signal.aborted && index<sources.length) {
        const source=sources[index++];
        const job=hotsearchClient.request(config,source.id,{force,manual:!automatic,signal:controller.signal});
        renderMain();
        await job;
        if (!controller.signal.aborted) renderMain();
      }
    }
    await Promise.all(Array.from({length:Math.min(3,sources.length)},worker));
    if (alive() && loading===controller) { refresh.classList.remove('is-loading'); refresh.disabled=false; host.refreshCards(); }
  }
  async function subscribe(id) {
    const ids=current().config.subscriptions;
    const subscriptions=ids.includes(id)?ids.filter(value=>value!==id):[...ids,id];
    const activeSource=!subscriptions.includes(current().config.activeSource)&&subscriptions.length?subscriptions[0]:current().config.activeSource;
    if (await save({subscriptions,activeSource})) { view.active=activeSource; render(); if(managerOpen)renderManager(); void load(); }
  }
  async function reorder(from,to) {
    if (!alive() || saving) return;
    const subscriptions=moveHotsearchSubscription(current().config.subscriptions,from,to);
    if (subscriptions.join()===current().config.subscriptions.join()) return;
    const containers=['.hotsearch-sidebar','.hotsearch-sort-list'];
    const positions=containers.map(selector=>new Map([...root.querySelectorAll(`${selector} [data-hot-sort]`)]
      .filter(row=>row.getClientRects().length).map(row=>[row.dataset.hotSort,row.getBoundingClientRect().top])));
    if (await save({subscriptions})) {
      render(); if(managerOpen)renderManager();
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) containers.forEach((selector,index)=>{
        for (const row of root.querySelectorAll(`${selector} [data-hot-sort]`)) {
          const before=positions[index].get(row.dataset.hotSort), offset=before-row.getBoundingClientRect().top;
          if (before===undefined || !offset || !row.getClientRects().length) continue;
          const animation=row.animate([{transform:`translateY(${offset}px)`},{transform:'none'}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'});
          sortAnimations.add(animation);
          animation.finished.catch(()=>{}).finally(()=>sortAnimations.delete(animation));
        }
      });
      (managerOpen?find('#hotsearch-manager'):root).querySelector(`[data-hot-drag="${from}"]`)?.focus({preventScroll:true});
      feedback(t('订阅顺序已保存'),2400);
    }
  }
  async function click(event) {
    if (event.detail && performance.now()<dragClickUntil) { event.preventDefault(); return; }
    const target=event.target.closest('button');
    if (event.target===find('.hotsearch-manager-overlay')) { toggleManager(false); return; }
    if (!target) return;
    if (target.dataset.hotSubscribe) { const id=target.dataset.hotSubscribe; await subscribe(id); (managerOpen?find('#hotsearch-manager'):root).querySelector(`[data-hot-subscribe="${id}"]`)?.focus({preventScroll:true}); return; }
    if (target.dataset.hotMove) {
      const ids=current().config.subscriptions, index=ids.indexOf(target.dataset.hotMove);
      await reorder(ids[index],ids[index+Number(target.dataset.direction)]); return;
    }
    if (target.dataset.hotSource) {
      if (await save({activeSource:target.dataset.hotSource})) { view.active=target.dataset.hotSource; render(); find(`[data-hot-source="${view.active}"]`)?.focus(); void load(); } return;
    }
    if (target.dataset.hotCategory) { view.category=target.dataset.hotCategory; render(); void load(); return; }
    if (target.dataset.hotRetry) { void load(true,target.dataset.hotRetry); return; }
    if (target.dataset.hotCollapse) {
      const id=target.dataset.hotCollapse; if(view.collapsed.has(id))view.collapsed.delete(id);else view.collapsed.add(id);
      renderMain(); find(`[data-hot-collapse="${id}"]`)?.focus(); return;
    }
    const action=target.dataset.hotAction;
    if (action==='manage' || action==='manage-close') toggleManager(action==='manage');
    else if (action==='search') {
      const input=find('#hotsearch-query'); input.hidden=!input.hidden; target.setAttribute('aria-expanded',String(!input.hidden));
      if(!input.hidden)input.focus();else {input.value='';view.query='';render();void load();}
    } else if (action==='layout') {
      if(await save({layout:current().config.layout==='list'?'grid':'list'})){render();void load();}
    } else if(action==='refresh') { void load(true); }
    else if(target.dataset.detailAction==='window-expand') {
      expanded=!expanded; root.closest('dialog').classList.toggle('widget-app-expanded',expanded);
      target.innerHTML=icon(expanded?'minimize':'maximize'); target.setAttribute('aria-pressed',String(expanded));
      target.title=t(expanded?'还原窗口':'最大化窗口');target.setAttribute('aria-label',target.title);
    }
  }
  root.addEventListener('click',event=>{void click(event).catch(error=>feedback(error.message));},options);
  root.addEventListener('input',event=>{
    if(event.target.id==='hotsearch-query'){view.query=event.target.value;render();void load();}
    else if(event.target.hasAttribute('data-hot-manage-query')){view.manageQuery=event.target.value;renderManager();}
  },options);
  root.addEventListener('change',event=>{if(event.target.hasAttribute('data-hot-manage-category')){view.manageCategory=event.target.value;renderManager();find('[data-hot-manage-category]').focus();}},options);
  root.addEventListener('submit',event=>{
    if(event.target.id!=='hotsearch-settings')return;
    event.preventDefault();event.stopPropagation();
    void (async()=>{
      try {
        const form=new FormData(event.target), apiBase=hotsearchApiBase(String(form.get('apiBase')).trim()), enabled=form.has('enabled');
        await requestPublicOrigin(apiBase);
        if(await save({apiBase,enabled})){render();feedback(t('数据源已保存'));toggleManager(false);void load();}
      }catch(error){feedback(error.message);}
    })();
  },options);
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape' && dragged){event.preventDefault();event.stopPropagation();clearDrag();return;}
    const id=event.target.dataset.hotDrag;
    if(id && event.altKey && ['ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault();event.stopPropagation();const ids=current().config.subscriptions,index=ids.indexOf(id);
      void reorder(id,ids[index+(event.key==='ArrowUp'?-1:1)]);return;
    }
    if(event.key==='Escape' && managerOpen){event.preventDefault();event.stopPropagation();toggleManager(false);}
    if(event.key==='Tab' && managerOpen){
      const nodes=[...find('#hotsearch-manager').querySelectorAll('button,input,select,summary,[tabindex="0"]')].filter(node=>!node.disabled&&node.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  },options);
  root.addEventListener('dragstart',event=>{
    const handle=event.target.closest('[data-hot-drag]');if(!handle)return;
    event.stopPropagation();
    if(saving || !event.dataTransfer){event.preventDefault();return;}
    clearDrag();
    const row=handle.closest('[data-hot-sort]'), rect=row.getBoundingClientRect();
    dragged=handle.dataset.hotDrag;dragScope=row.parentElement;
    event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',dragged);
    // Capture the whole platform row, rather than the small grip alone.
    const clone=row.cloneNode(true);
    for(const node of [clone,...clone.querySelectorAll('*')]) {
      for(const attribute of [...node.attributes]) if(attribute.name==='id' || attribute.name.startsWith('data-hot-')) node.removeAttribute(attribute.name);
      node.removeAttribute('draggable');
    }
    dragPreview=document.createElement('div');
    dragPreview.className='hotsearch-drag-preview'+(row.matches('li')?' hotsearch-sort-list':'');
    dragPreview.inert=true;dragPreview.setAttribute('aria-hidden','true');
    Object.assign(dragPreview.style,{width:rect.width+10+'px',left:rect.left-5+'px',top:rect.top-5+'px'});
    dragPreview.append(clone);root.append(dragPreview);
    event.dataTransfer.setDragImage(dragPreview,Math.max(0,event.clientX-rect.left+5),Math.max(0,event.clientY-rect.top+5));
    root.classList.add('is-sorting');
    dragFrame=requestAnimationFrame(()=>{dragPreview?.remove();dragPreview=null;row.classList.add('is-dragging');});
  },options);
  function clearDropTarget() {
    for(const row of root.querySelectorAll('.is-drop-target'))row.classList.remove('is-drop-target','is-drop-before','is-drop-after');
  }
  root.addEventListener('dragover',event=>{
    if(!dragged)return;
    const row=event.target.closest('[data-hot-sort]');clearDropTarget();
    if(!row || row.parentElement!==dragScope)return;
    event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';
    if(row.dataset.hotSort===dragged)return;
    const ids=current().config.subscriptions;
    row.classList.add('is-drop-target',ids.indexOf(dragged)<ids.indexOf(row.dataset.hotSort)?'is-drop-after':'is-drop-before');
  },options);
  function clearDrag() {
    if(dragged)dragClickUntil=performance.now()+250;
    dragged='';dragScope=null;cancelAnimationFrame(dragFrame);dragPreview?.remove();dragPreview=null;
    root.classList.remove('is-sorting');clearDropTarget();
    for(const row of root.querySelectorAll('.is-dragging'))row.classList.remove('is-dragging');
  }
  root.addEventListener('dragleave',event=>{if(!root.contains(event.relatedTarget))clearDropTarget();},options);
  root.addEventListener('drop',event=>{
    if(!dragged)return;
    event.preventDefault();event.stopPropagation();
    const row=event.target.closest('[data-hot-sort]'), from=dragged, to=row?.parentElement===dragScope?row.dataset.hotSort:'';
    clearDrag();if(to)void reorder(from,to);
  },options);
  root.addEventListener('dragend',clearDrag,options);
  const timer=setInterval(()=>{if(!document.hidden&&!managerOpen&&!dragged&&!saving)void load(false,'',true);},60000);
  render();void load();
  return ()=>{events.abort();loading?.abort();clearInterval(timer);clearTimeout(feedbackTimer);clearDrag();for(const animation of sortAnimations)animation.cancel();};
}

export function bindHotsearchCards(container,host) {
  const controller=new AbortController(), pending=new Map();
  const roots=()=>container.querySelectorAll('[data-widget=hotsearch]:not([data-compact])');
  const current=root=>host.getState().items.find(item=>item.id===root.dataset.widgetId);
  const alive=root=>!controller.signal.aborted && root.isConnected && !!current(root);
  function render(root) { if(alive(root)){root.innerHTML=hotsearchCard(current(root),host.getState());bindHotsearchLogos(root);} }
  async function load(root,manual=false) {
    if(!alive(root))return;
    const item=current(root);if(!item.config.enabled&&!manual||!item.config.subscriptions.length)return;
    const key=item.config.apiBase+':'+item.config.activeSource, previous=pending.get(root);
    if(previous?.key===key)return;
    previous?.controller.abort();
    const entry={key,controller:new AbortController()};pending.set(root,entry);
    try { const job=hotsearchClient.request(item.config,item.config.activeSource,{manual,signal:entry.controller.signal});render(root);await job;if(pending.get(root)===entry)render(root); }
    finally {if(pending.get(root)===entry)pending.delete(root);}
  }
  async function selectSource(root,id) {
    const item=current(root),previous=item.config;
    try {
      if(!hotsearchSource(id)?.github)await requestPublicOrigin(previous.apiBase);
      if(!alive(root)||current(root)!==item)return;
      item.config={...previous,activeSource:id};await host.save();render(root);
      const picker=root.querySelector('[data-hot-card-select]');
      const control=picker?.getClientRects().length?picker:root.querySelector(`[data-hot-card-source="${id}"]`);
      control?.focus({preventScroll:true});void load(root,true);
    } catch(error) {if(current(root)===item)item.config=previous;render(root);if(!error?.notified)host.toast?.(error.message);}
  }
  container.addEventListener('click',event=>{
    const button=event.target.closest('[data-hot-card-source]'),root=button?.closest('[data-widget=hotsearch]');
    if(!root||!alive(root))return;
    event.preventDefault();event.stopPropagation();void selectSource(root,button.dataset.hotCardSource);
  },{signal:controller.signal});
  container.addEventListener('change',event=>{
    const picker=event.target.closest('[data-hot-card-select]'),root=picker?.closest('[data-widget=hotsearch]');
    if(!root||!alive(root))return;
    event.preventDefault();event.stopPropagation();void selectSource(root,picker.value);
  },{signal:controller.signal});
  const tick=()=>{if(!globalThis.document?.hidden)for(const root of roots())void load(root);};
  const timer=setInterval(tick,60000);tick();
  return ()=>{controller.abort();for(const entry of pending.values())entry.controller.abort();pending.clear();clearInterval(timer);};
}
