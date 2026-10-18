// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as e } from './html.js';
import { icon } from './icons.js';
import { createWidgetDraft } from './widget-drafts.js';
import { MAP_REGIONS, MAP_FAVORITE_LIMIT, regionPlace, mapRegion, regionAt, pointOnly, sameMapPlace, coordinateText, parseMapCoordinates, searchMapPlaces, validateMapPlace, validateMapData, convertMapPoint } from './map-model.js';
import { MAP_SOURCES, readMapLocal, saveMapLocal, validateMapLocal, resolveMapSource, requestMapPermission, hasMapPermission, searchAmapPlaces } from './map-sources.js';
import { mapPlaceRows, mapSelection, mapSourceOptions, mapSettings, customMapSourceFields, mapAttribution } from './map-view.js';
import { createMapCanvas } from './map-canvas.js';

const drafts=new Map();
export function bindMapWorkspace(root,initial,host,openingRegion) {
  const events=new AbortController(),options={signal:events.signal},find=selector=>root.querySelector(selector);
  let alive=true,local=readMapLocal(),config=structuredClone(initial.config),baseline=JSON.stringify([initial.title,initial.config]);
  let settingsOpen=false,sourceMenuOpen=false,searchOptionsOpen=false,panel='',selectionActive=false,expanded=false,results=[],tab='places',search=null,searchVersion=0,loadVersion=0,feedbackTimer,busy=false;
  let draft=drafts.get(initial.id),plan=resolveMapSource(config,initial.data.region,local);
  const feedback=message=>{
    if(!alive)return;clearTimeout(feedbackTimer);find('[data-map-feedback]').textContent=message;
    feedbackTimer=setTimeout(()=>{if(alive)find('[data-map-feedback]').textContent='';},6000);
  };
  const saveStatus=()=>{
    if(!alive)return;
    root.dataset.mapPersistence=draft.error?'error':draft.dirty?'saving':'saved';
    find('[data-map-save-state]').hidden=!draft.error;
    find('[data-map-save]').textContent=draft.error?t('保存失败，请重试'):'';
    find('[data-map-save]').title=draft.error?.message||'';find('[data-map-action=save-retry]').hidden=!draft.error;
    if(!draft.dirty&&!draft.error)host.refreshCards();
  };
  // Persist the same canonical field order returned by backup validation.
  // Otherwise the host's JSON baseline check can mistake a later edit for a conflict.
  if(!draft){draft=createWidgetDraft(initial,(id,data,base)=>host.saveData(id,validateMapData(data),base),()=>draft.notify?.());drafts.set(initial.id,draft);}
  draft.notify=saveStatus;
  const canvas=createMapCanvas(find('.map-viewport'),{
    onMove(center,zoom){
      if(!alive)return;
      const region=regionAt(convertMapPoint(center,'wgs84',draft.data.region)),changed=region!==draft.data.region;
      draft.data.center=center;draft.data.zoom=zoom;draft.data.region=region;draft.changed();updateCoordinates();
      if(changed)void loadMap();
    },
    onPick(point){
      if(!alive)return;
      draft.data.selected=validateMapPlace({...point,name:t('地图选点'),address:'',region:regionAt(convertMapPoint(point,'wgs84',draft.data.region))});
      selectionActive=true;panel='place';tab='places';find('[name=query]').value='';draft.changed();renderSelection();updatePanel();
    },
    onStatus(status,failed){
      if(!alive)return;const node=find('[data-map-load]');node.hidden=status==='ready';
      node.querySelector('span').textContent=status==='loading'?t('正在加载地图…'):t('部分地图未能加载，请重试或切换地图源。');
      node.querySelector('button').hidden=status!=='error';node.dataset.status=status;
    },
  });
  function updateCoordinates() {
    find('[data-map-center]').textContent=coordinateText(draft.data.center);
    find('[data-map-center]').title=`${draft.data.center.crs==='gcj02'?'GCJ-02':'WGS84'} · Z${draft.data.zoom}`;
    find('[data-map-action=zoom-in]').disabled=!config.enabled||!!plan.problem||draft.data.zoom>=plan.source?.maxZoom;
    find('[data-map-action=zoom-out]').disabled=!config.enabled||!!plan.problem||draft.data.zoom<=plan.source?.minZoom;
  }
  function renderSelection() {
    find('[data-map-selection]').innerHTML=selectionActive?mapSelection(draft.data.selected,draft.data.favorites):'';
    find('[data-map-favorite-count]').textContent=draft.data.favorites.length;
    canvas.mark(selectionActive?draft.data.selected:null);
  }
  function cancelSearch() {searchVersion++;search?.abort();search=null;find('#map-search-form [type=submit]').disabled=false;}
  function updatePanel() {
    find('.map-sidebar').hidden=!panel;find('.map-sidebar').dataset.mode=panel;
    find('[data-map-panel-title]').textContent=t(panel==='favorites'?'我的收藏':panel==='place'?'地点详情':'搜索结果');
    find('[data-map-favorite-count]').hidden=panel!=='favorites';
    find('.map-result-scroll').hidden=panel==='place';find('[data-map-selection]').hidden=panel!=='place';
    find('[data-map-action=places]').setAttribute('aria-expanded',String(panel==='favorites'));
    find('[name=query]').setAttribute('aria-expanded',String(panel==='results'));
    find('[data-map-action=clear-search]').hidden=!find('[name=query]').value&&!selectionActive;
    root.classList.toggle('map-has-panel',!!panel);
  }
  function toggleMenus() {
    find('#map-source-menu').hidden=!sourceMenuOpen;find('#map-search-options').hidden=!searchOptionsOpen;
    find('[data-map-action=sources]').setAttribute('aria-expanded',String(sourceMenuOpen));
    find('[data-map-action=search-options]').setAttribute('aria-expanded',String(searchOptionsOpen));
  }
  function closePanel(focus=true) {
    cancelSearch();panel='';selectionActive=false;results=[];tab='places';find('[name=query]').value='';
    find('[data-map-results]').replaceChildren();find('[data-map-search-status]').textContent='';
    renderSelection();updatePanel();
    if(focus)find('[name=query]').focus({preventScroll:true});
  }
  function renderList() {
    const query=find('[name=query]').value.trim();
    results=tab==='favorites'?draft.data.favorites.filter(place=>`${place.name} ${place.address}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())):query?searchMapPlaces(query,draft.data.favorites,draft.data.region):[];
    find('[data-map-results]').innerHTML=mapPlaceRows(results);
    find('[data-map-search-status]').textContent=results.length||(!query&&tab!=='favorites')?'':t(tab==='favorites'?'还没有匹配的收藏。选择地点后即可收藏。':'未找到本地地点。可输入经度, 纬度，或配置高德搜索。');
    updatePanel();
  }
  function showGate(title,copy,action='enable') {
    find('[data-map-gate]').hidden=false;find('[data-map-gate-title]').textContent=title;find('[data-map-gate-copy]').textContent=copy;
    const enable=find('[data-map-action=enable]');enable.hidden=action!=='enable';enable.textContent=t(config.enabled?'授权并加载':'启用地图');
    find('[data-map-load]').hidden=true;canvas.set(null);
  }
  async function loadMap() {
    const version=++loadVersion;
    plan=resolveMapSource(config,draft.data.region,local);
    find('[data-map-source]').innerHTML=mapSourceOptions(config.source,draft.data.region,local);
    find('[data-map-provider]').textContent=plan.source?.template?plan.source.name:t(plan.source?.name||'地图源');
    find('[data-map-notice]').hidden=!config.enabled||!plan.notice||!local.showSourceNotices;
    find('[data-map-notice-text]').textContent=plan.notice;
    const sourceLabel=plan.source?.template?plan.source.name:t(plan.source?.name||'地图源');
    find('[data-map-action=sources]').innerHTML=`${icon('layers')}<span>${e(sourceLabel)}</span>`;
    find('[data-map-action=sources]').title=`${t('地图源与图层')} · ${sourceLabel}`;
    find('[data-map-attribution]').innerHTML='';
    root.querySelectorAll('[data-map-region]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mapRegion===draft.data.region)));
    root.querySelectorAll('[data-map-layer]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.mapLayer===plan.layer));button.disabled=!plan.source?.layers.includes(button.dataset.mapLayer)||busy;});
    updateCoordinates();
    if(!config.enabled){showGate(t('开始浏览地图'),t('启用后，会向所选地图源发送当前地图范围。'));return;}
    if(plan.problem){showGate(t('配置当前地图源'),plan.problem,'settings');return;}
    // Clear the previous source before awaiting permissions, so old geography
    // cannot be presented with a new provider's name or attribution.
    canvas.set(null);
    try {
      const granted=await hasMapPermission(plan.source,plan.layer,local);
      if(!alive||version!==loadVersion)return;
      if(!granted){showGate(t('允许访问地图源'),t('点击授权后加载这个来源的地图。'));return;}
      const zoom=Math.max(plan.source.minZoom,Math.min(plan.source.maxZoom,draft.data.zoom));
      if(zoom!==draft.data.zoom){draft.data.zoom=zoom;draft.changed();}
      find('[data-map-gate]').hidden=true;find('[data-map-attribution]').innerHTML=mapAttribution(plan.source,true);
      canvas.set({...draft.data,...plan,local,selected:selectionActive?draft.data.selected:null});updateCoordinates();
    } catch {if(alive&&version===loadVersion)showGate(t('允许访问地图源'),t('未获准访问地图源，请重新授权。'));}
  }
  async function saveConfig(next,permission=Promise.resolve(true)) {
    if(busy)return false;busy=true;find('[data-map-source]').disabled=true;
    try {
      await permission;if(!alive)return false;
      const updated=await host.saveSettings(initial.id,{title:initial.title,config:next},baseline);
      baseline=JSON.stringify([updated.title,updated.config]);config=structuredClone(updated.config);
      if(alive){host.refreshCards();await loadMap();}return true;
    } catch(error){if(alive){feedback(error.message);find('[data-map-source]').value=config.source;}return false;}
    finally {busy=false;if(alive){find('[data-map-source]').disabled=false;root.querySelectorAll('[data-map-layer]').forEach(button=>button.disabled=!plan.source?.layers.includes(button.dataset.mapLayer));}}
  }
  function permissionFor(next=config,region=draft.data.region,settings=local) {
    const nextPlan=resolveMapSource(next,region,settings);
    return next.enabled&&!nextPlan.problem?requestMapPermission(nextPlan.source,nextPlan.layer,settings):Promise.resolve(true);
  }
  async function selectPlace(place,zoom=15) {
    if(busy)return;
    cancelSearch();
    const {id,...clean}=place;
    draft.data.selected=validateMapPlace(clean);draft.data.center=pointOnly(place);draft.data.region=place.region;draft.data.zoom=zoom;
    selectionActive=true;panel='place';tab='places';find('[name=query]').value=place.name;searchOptionsOpen=false;toggleMenus();
    draft.changed();renderSelection();updatePanel();
    // The result button becomes hidden. Keep focus inside the workspace so
    // Escape dismisses this place card before the parent dialog.
    const heading=find('[data-map-selection] h3');heading.tabIndex=-1;heading.focus({preventScroll:true});
    // Permission request is initiated within the selecting click's user gesture.
    try {await permissionFor();}catch(error){feedback(error.message);}
    if(alive)await loadMap();
  }
  function openSettings() {
    if(busy)return;
    sourceMenuOpen=false;searchOptionsOpen=false;toggleMenus();
    find('.map-settings-panel').innerHTML=mapSettings(local,config.enabled);settingsOpen=true;toggleSettings();
    find('#map-settings-title').tabIndex=-1;find('#map-settings-title').focus({preventScroll:true});
  }
  function toggleSettings() {
    find('.map-settings-panel').hidden=!settingsOpen;find('.map-settings-shade').hidden=!settingsOpen;
    root.querySelectorAll('.map-header,.map-source-menu,.map-layout').forEach(node=>node.inert=settingsOpen);
    find('[data-map-action=settings]').setAttribute('aria-expanded',String(settingsOpen));
  }
  function closeSettings() {settingsOpen=false;toggleSettings();find('[data-map-action=settings]').focus({preventScroll:true});}
  function readSettings() {
    const form=find('#map-settings-form'),data=new FormData(form);
    return validateMapLocal({showSourceNotices:form.elements.showSourceNotices.checked,amapKey:String(data.get('amapKey')),tiandituKey:String(data.get('tiandituKey')),preferences:Object.fromEntries(MAP_REGIONS.map(region=>[region.id,String(data.get(`preferred-${region.id}`))])),custom:[...form.querySelectorAll('[data-map-custom]')].map(node=>({id:node.dataset.mapCustom,name:node.querySelector('[name=custom-name]').value.trim(),template:node.querySelector('[name=custom-template]').value.trim(),credit:node.querySelector('[name=custom-credit]').value.trim(),crs:node.querySelector('[name=custom-crs]').value,minZoom:Number(node.querySelector('[name=custom-min]').value),maxZoom:Number(node.querySelector('[name=custom-max]').value)}))});
  }
  function updateCustomOptions() {
    const rows=[...root.querySelectorAll('[data-map-custom]')].map(node=>({id:node.dataset.mapCustom,name:node.querySelector('[name=custom-name]').value||t('自定义地图源'),template:'https://example.com/{z}/{x}/{y}.png',crs:'wgs84',minZoom:1,maxZoom:19,credit:''}));
    for(const region of MAP_REGIONS) {
      const select=find(`[name=preferred-${region.id}]`),value=select.value;
      select.innerHTML=mapSourceOptions(value,region.id,{...local,custom:rows},false);
      if(![...MAP_SOURCES,...rows].some(source=>source.id===value))select.value=MAP_SOURCES.find(source=>!source.regions||source.regions.includes(region.id)).id;
    }
    find('[data-map-custom-count]').textContent=`${rows.length} / 8`;find('[data-map-action=add-source]').disabled=rows.length>=8;
  }
  async function saveSettings(form) {
    if(busy)return;
    let nextLocal;
    try {nextLocal=readSettings();}catch(error){find('[data-map-settings-status]').textContent=error.message;return;}
    const next={...config,enabled:form.elements.enabled.checked};
    if(next.source.startsWith('custom-')&&!nextLocal.custom.some(source=>source.id===next.source))next.source='auto';
    const permission=permissionFor(next,draft.data.region,nextLocal);
    busy=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;
    const previous=local;
    try {
      await permission;if(!alive)return;
      // Save local secrets first; roll back if the desktop write fails.
      saveMapLocal(nextLocal);
      try {
        const updated=await host.saveSettings(initial.id,{title:initial.title,config:next},baseline);
        baseline=JSON.stringify([updated.title,updated.config]);config=structuredClone(updated.config);local=nextLocal;
      } catch(error){saveMapLocal(previous);throw error;}
      if(alive){closeSettings();feedback(t('地图设置已保存。'));host.refreshCards();await loadMap();}
    } catch(error){if(alive)find('[data-map-settings-status]').textContent=error.message;}
    finally {busy=false;if(alive)submit.disabled=false;}
  }
  async function searchPlaces(form) {
    cancelSearch();const token=searchVersion,query=form.elements.query.value.trim();
    if(!query){closePanel();return;}
    panel='results';selectionActive=false;renderSelection();updatePanel();searchOptionsOpen=false;toggleMenus();
    let point;
    try{point=parseMapCoordinates(query,form.elements.coordinateSystem.value);}catch(error){find('[data-map-search-status]').textContent=error.message;return;}
    if(point){await selectPlace({...point,name:t('坐标地点'),address:'',region:regionAt(point)},15);return;}
    if(form.elements.searchSource.value==='local'){tab='places';renderList();return;}
    if(draft.data.region!=='CN'){find('[data-map-search-status]').textContent=t('高德地点搜索用于中国大陆；其他地区可搜索内置地点或输入坐标。');return;}
    if(!local.amapKey){find('[data-map-search-status]').textContent=t('请先在地图源设置中填写 {name} Key。',{name:t('高德地图')});return;}
    const request=search=new AbortController();form.querySelector('[type=submit]').disabled=true;
    find('[data-map-search-status]').textContent=t('正在搜索地点…');find('[data-map-results]').replaceChildren();results=[];
    try {
      await requestMapPermission(MAP_SOURCES[0],'street',local);
      if(!alive||token!==searchVersion)return;
      const found=await searchAmapPlaces(query,local,{signal:request.signal});
      if(!alive||token!==searchVersion)return;
      results=found;tab='places';root.querySelectorAll('[data-map-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mapTab===tab)));
      find('[data-map-results]').innerHTML=mapPlaceRows(results);find('[data-map-search-status]').textContent=found.length?t('高德搜索 · {count} 个地点',{count:found.length}):t('没有找到地点，请换一个关键词。');
    } catch(error){if(alive&&token===searchVersion)find('[data-map-search-status]').textContent=error.message;}
    finally {if(alive&&token===searchVersion){form.querySelector('[type=submit]').disabled=false;search=null;}}
  }
  async function locate() {
    if(!navigator.geolocation){feedback(t('当前浏览器不支持定位。'));return;}
    const control=find('[data-map-action=locate]');control.disabled=true;
    try {
      if(globalThis.chrome?.runtime?.id&&chrome.permissions?.request) {
        if(!await chrome.permissions.request({permissions:['geolocation']}))throw new Error(t('未获准定位。可以搜索地点或输入坐标。'));
      }
      if(!alive)return;
      const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:10000,maximumAge:60000}));
      if(!alive)return;
      const point={longitude:position.coords.longitude,latitude:position.coords.latitude,crs:'wgs84'};
      // No origin prompt here: the geolocation callback has no user activation.
      draft.data.selected={...point,name:t('我的位置'),address:t('定位精度约 {metres} 米',{metres:Math.round(position.coords.accuracy)}),region:regionAt(point)};
      draft.data.center=point;draft.data.region=draft.data.selected.region;draft.data.zoom=15;
      selectionActive=true;panel='place';tab='places';find('[name=query]').value=t('我的位置');draft.changed();renderSelection();updatePanel();await loadMap();
    } catch(error){if(alive)feedback(error instanceof Error?error.message:t('定位失败。可以搜索地点或输入坐标。'));}
    finally{if(alive)control.disabled=false;}
  }
  async function action(event) {
    const target=event.target.closest('[data-map-action],[data-map-region],[data-map-result],[data-map-tab],[data-map-layer],[data-detail-action]');
    if(!target||!root.contains(target))return;
    event.preventDefault();event.stopPropagation();
    const name=target.dataset.mapAction;
    if(target.dataset.detailAction==='window-expand') {
      expanded=!expanded;root.closest('dialog').classList.toggle('widget-app-expanded',expanded);
      target.setAttribute('aria-pressed',String(expanded));target.setAttribute('aria-label',t(expanded?'还原窗口':'最大化窗口'));target.title=target.getAttribute('aria-label');target.innerHTML=icon(expanded?'minimize':'maximize');return;
    }
    if(target.dataset.mapRegion){find('#map-search-form [name=query]').value='';await selectPlace(regionPlace(target.dataset.mapRegion),mapRegion(target.dataset.mapRegion).zoom);if(alive)renderList();return;}
    if(target.hasAttribute('data-map-result')){const place=results[Number(target.dataset.mapResult)];if(place)await selectPlace(place);return;}
    if(target.dataset.mapTab){cancelSearch();tab=target.dataset.mapTab;renderList();return;}
    if(target.dataset.mapLayer){const next={...config,layer:target.dataset.mapLayer};await saveConfig(next,permissionFor(next));return;}
    if(name==='settings')openSettings();
    else if(name==='settings-close'&&!busy)closeSettings();
    else if(name==='sources'){sourceMenuOpen=!sourceMenuOpen;searchOptionsOpen=false;toggleMenus();}
    else if(name==='search-options'){searchOptionsOpen=!searchOptionsOpen;sourceMenuOpen=false;toggleMenus();}
    else if(name==='clear-search'||name==='panel-close')closePanel();
    else if(name==='dismiss-notice'){
      local={...local,showSourceNotices:false};find('[data-map-notice]').hidden=true;
      try{saveMapLocal(local);}catch(error){feedback(error.message);}
      find('[data-map-action=sources]').focus({preventScroll:true});
    }
    else if(name==='places'){
      if(panel==='favorites'){closePanel(false);return;}
      cancelSearch();tab='favorites';panel='favorites';selectionActive=false;find('[name=query]').value='';renderSelection();renderList();
    }
    else if(name==='enable'){const next={...config,enabled:true};await saveConfig(next,permissionFor(next));}
    else if(name==='retry')canvas.retry();
    else if(name==='save-retry')await draft.flush();
    else if(name==='zoom-in')canvas.zoom(1);
    else if(name==='zoom-out')canvas.zoom(-1);
    else if(name==='locate')await locate();
    else if(name==='recenter')await selectPlace(draft.data.selected,draft.data.zoom);
    else if(name==='favorite') {
      const place=draft.data.selected,index=draft.data.favorites.findIndex(row=>sameMapPlace(row,place));
      if(index>=0)draft.data.favorites.splice(index,1);
      else if(draft.data.favorites.length>=MAP_FAVORITE_LIMIT){feedback(t('最多收藏 {count} 个地点。',{count:MAP_FAVORITE_LIMIT}));return;}
      else draft.data.favorites.push({...place,id:host.uid()});
      draft.changed();renderSelection();if(tab==='favorites')renderList();find('[data-map-action=favorite]').focus({preventScroll:true});
    } else if(name==='copy') {
      try {await navigator.clipboard.writeText(`${coordinateText(draft.data.selected)} (${draft.data.selected.crs==='gcj02'?'GCJ-02':'WGS84'})`);feedback(t('坐标已复制'));}
      catch {feedback(t('无法访问剪贴板，请选中坐标后手动复制。'));const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(find('.map-coordinate-line'));selection.removeAllRanges();selection.addRange(range);}
    } else if(name==='add-source') {
      if(root.querySelectorAll('[data-map-custom]').length>=8)return;
      find('[data-map-custom-list]').insertAdjacentHTML('beforeend',customMapSourceFields({id:'custom-'+host.uid(),name:'',template:'',credit:'',crs:'wgs84',minZoom:2,maxZoom:19}));
      updateCustomOptions();find('[data-map-custom-list]').lastElementChild.querySelector('input').focus();
    } else if(name==='remove-source'){target.closest('[data-map-custom]').remove();updateCustomOptions();find('[data-map-action=add-source]').focus();}
  }
  root.addEventListener('click',event=>{void action(event).catch(error=>feedback(error.message));},options);
  root.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();if(event.target.id==='map-search-form')void searchPlaces(event.target).catch(error=>feedback(error.message));if(event.target.id==='map-settings-form')void saveSettings(event.target);},options);
  root.addEventListener('change',event=>{
    if(event.target.hasAttribute('data-map-source')){if(busy)return;const next={...config,source:event.target.value};void saveConfig(next,permissionFor(next));}
    if(event.target.name==='searchSource'){cancelSearch();find('[data-map-search-hint]').textContent=t(event.target.value==='amap'?'提交搜索时，将关键词发送给高德地图。':'常用城市、收藏与坐标可离线搜索。');if(find('[name=query]').value.trim()){panel='results';tab='places';renderList();}}
    if(event.target.name==='custom-name')updateCustomOptions();
  },options);
  root.addEventListener('input',event=>{
    if(event.target.name!=='query')return;
    cancelSearch();selectionActive=false;renderSelection();
    if(!event.target.value.trim()){closePanel(false);return;}
    panel=tab==='favorites'?'favorites':'results';updatePanel();
    if(find('[name=searchSource]').value==='local'||tab==='favorites')renderList();
    else{results=[];find('[data-map-results]').replaceChildren();find('[data-map-search-status]').textContent=t('按 Enter 搜索地点。');}
  },options);
  root.addEventListener('click',event=>{
    if(!event.target.closest('#map-source-menu,[data-map-action=sources]'))sourceMenuOpen=false;
    if(!event.target.closest('#map-search-options,[data-map-action=search-options]'))searchOptionsOpen=false;
    toggleMenus();
  },options);
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&(settingsOpen||sourceMenuOpen||searchOptionsOpen||panel)){
      event.preventDefault();event.stopImmediatePropagation();
      if(settingsOpen){if(!busy)closeSettings();}
      else if(sourceMenuOpen||searchOptionsOpen){const target=sourceMenuOpen?'sources':'search-options';sourceMenuOpen=false;searchOptionsOpen=false;toggleMenus();find(`[data-map-action=${target}]`).focus({preventScroll:true});}
      else closePanel();
    }
    if(['ArrowDown','ArrowUp'].includes(event.key)&&panel&&panel!=='place'){
      const rows=[...root.querySelectorAll('[data-map-result]')],index=rows.indexOf(event.target);
      if(rows.length&&(index>=0||event.target.name==='query')){event.preventDefault();rows[(index+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length].focus();}
    }
  },{...options,capture:true});
  globalThis.addEventListener('pagehide',()=>{void draft.flush();},options);
  updatePanel();toggleMenus();renderSelection();renderList();saveStatus();
  if(openingRegion&&mapRegion(openingRegion)){draft.data.selected=regionPlace(openingRegion);draft.data.region=openingRegion;draft.data.center=pointOnly(draft.data.selected);draft.data.zoom=mapRegion(openingRegion).zoom;draft.changed();renderSelection();renderList();}
  void loadMap();
  return ()=>{
    alive=false;loadVersion++;events.abort();cancelSearch();canvas.destroy();clearTimeout(feedbackTimer);draft.notify=null;
    void draft.flush().then(saved=>{if(saved){if(drafts.get(initial.id)===draft&&!draft.notify)drafts.delete(initial.id);host.refreshCards();}else host.toast(t('地图尚未保存，重新打开后可重试。'));});
  };
}
