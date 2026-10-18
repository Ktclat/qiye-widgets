// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText } from './html.js';
import { icon } from './icons.js';
import { cityKey, weatherState, requestWeather, searchCities } from './weather.js';
import { readWeatherCredentials, validateWeatherCredentials, saveWeatherCredentials, requestWeatherPermission } from './weather-sources.js';
import { readWeatherCities, saveWeatherCities, weatherCityList } from './weather-cities.js';
import { weatherDetail, weatherLocation, weatherSettings, weatherCityCards } from './weather-view.js';

export function bindWeatherWorkspace(root, initial, host) {
  const events = new AbortController(), options = {signal:events.signal};
  const find = selector => root.querySelector(selector);
  const current = () => host.getState().items.find(item => item.id === initial.id);
  const alive = () => !events.signal.aborted && root.isConnected && current();
  let baseline = JSON.stringify([initial.title,initial.config]), busy = false;
  let cities = weatherCityList(readWeatherCities(),initial.config.city), metric = 'temperature';
  let panel='', expanded=false, search=null, results=[], returnFocus=null;
  let visiblePanel='', panelMotion=[];
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');

  function feedback(message = '') {
    if (!alive()) return;
    find('#weather-feedback').textContent = message;
    find('#weather-feedback').hidden = !message;
  }
  function renderCities() {
    if (!alive()) return;
    const focused = document.activeElement, city = focused?.dataset.weatherCity, remove = focused?.dataset.weatherRemove;
    find('#weather-city-list').innerHTML = weatherCityCards(current(),cities);
    if (city || remove) find(`[${city?'data-weather-city':'data-weather-remove'}="${city || remove}"]`)?.focus({preventScroll:true});
  }
  function renderForecast(reset = false) {
    if (!alive()) return;
    const scroll = find('.weather-horizontal-scroll')?.scrollLeft || 0;
    find('#weather-forecast').innerHTML = weatherDetail(current(),metric);
    find('#weather-location').innerHTML = weatherLocation(current());
    const item=current(), state=weatherState(item.config.city,item.config), refresh=find('#weather-refresh');
    refresh.hidden=!item.config.enabled || !state.data;
    refresh.disabled=state.status==='loading';
    refresh.setAttribute('aria-busy',String(state.status==='loading'));
    if (!reset && find('.weather-horizontal-scroll')) find('.weather-horizontal-scroll').scrollLeft = scroll;
    if (reset) find('.weather-scroll').scrollTop = 0;
    renderCities();
  }
  async function loadForecast(force = false) {
    if (!alive() || !current().config.enabled) return;
    const job = requestWeather(current().config.city,force,current().config);
    renderForecast();
    await job;
    renderForecast();
    if (alive()) host.refreshCards();
  }
  function remember(city) {
    cities = weatherCityList(cities,city);
    try { saveWeatherCities(cities); }
    catch { feedback(t('城市列表未能保存，当前城市设置已保存。')); }
  }
  function hideSearch() {
    search?.abort(); search=null;
    root.querySelectorAll('.weather-search-results').forEach(node=>node.hidden=true);
  }
  function updatePanels(visible=panel) {
    find('.weather-app').dataset.panel=panel;
    visiblePanel=visible;
    for(const [name,id] of [['cities','#weather-city-panel'],['settings','#weather-settings-panel']]) {
      const node=find(id);
      node.hidden=visible!==name;
      node.inert=panel!==name;
      node.setAttribute('aria-hidden',String(panel!==name));
    }
    for(const action of ['weather-cities','weather-add-city']) find(`[data-detail-action=${action}]`).setAttribute('aria-expanded',String(panel==='cities'));
    find('[data-detail-action=weather-settings]').setAttribute('aria-expanded',String(panel==='settings'));
  }
  function cancelPanelMotion() {
    panelMotion.forEach(animation=>animation.cancel());
    panelMotion=[];
  }
  function settlePanels() {
    cancelPanelMotion(); updatePanels();
  }
  function movePanel(next) {
    if(next===panel) return;
    const dialog=root.closest('dialog'), content=find('.weather-content'), slot=find('.weather-side-slot');
    const old=find('.weather-side-panel:not([hidden])');
    const before={width:getComputedStyle(dialog).width,slotWidth:getComputedStyle(slot).width,slotHeight:getComputedStyle(slot).height};
    const previousStyle=old?{opacity:getComputedStyle(old).opacity,transform:getComputedStyle(old).transform}:null;
    const previous=visiblePanel;
    // Sample before cancelling, so a rapid reversal starts at the current visual position.
    cancelPanelMotion(); panel=next;
    updatePanels(next || previous);
    if(reducedMotion.matches || document.body.classList.contains('reduce-effects')) {updatePanels();return;}
    const side=find('.weather-side-panel:not([hidden])');
    if(!side) return;
    const stacked=getComputedStyle(slot).gridColumnStart==='1';
    const property=stacked?'gridTemplateRows':'gridTemplateColumns';
    const from=stacked?before.slotHeight:before.slotWidth;
    const to=stacked?getComputedStyle(slot).height:getComputedStyle(slot).width;
    const timing={duration:next?460:280,easing:'cubic-bezier(.22,1,.36,1)'};
    const motion=[content.animate([{[property]:`minmax(0,1fr) ${from}`},{[property]:`minmax(0,1fr) ${to}`}],timing)];
    const width=getComputedStyle(dialog).width;
    if(width!==before.width) motion.push(dialog.animate([{width:before.width},{width}],timing));
    const shift=stacked?'translateY(18px)':'translateX(18px)';
    const start=old===side?previousStyle:{opacity:0,transform:`${shift} scale(.975)`};
    motion.push(side.animate(next?[
      {...start,offset:0},
      {opacity:1,transform:'scale(1.012)',offset:.64},
      {opacity:1,transform:'scale(.997)',offset:.84},
      {opacity:1,transform:'none',offset:1}
    ]:[start,{opacity:0,transform:`${shift} scale(.985)`}],{...timing,easing:'cubic-bezier(.25,.8,.25,1)'}));
    panelMotion=motion;
    Promise.all(motion.map(animation=>animation.finished)).then(()=>{
      if(panelMotion!==motion) return;
      panelMotion=[]; updatePanels();
    },()=>{}); // Cancelling an interrupted or disposed animation rejects finished.
  }
  function loadCities() {
    if(!alive()||!current().config.enabled) return;
    for(const city of cities) void requestWeather(city,false,current().config).then(renderCities);
  }
  function togglePanel(next,trigger,searchInput=false) {
    if(trigger) returnFocus=trigger;
    hideSearch(); movePanel(next);
    if(next==='settings') find('#weather-settings-title').focus({preventScroll:true});
    else if(next==='cities') {find(searchInput?'#weather-list-query':'#weather-city-title').focus({preventScroll:true});loadCities();}
    else returnFocus?.focus({preventScroll:true});
  }
  async function save(changes, credentials) {
    if (busy || !alive()) return false;
    busy = true; feedback();
    find('#weather-settings [type=submit]').disabled = true;
    try {
      const permission=requestWeatherPermission(changes.config.city,changes.config,credentials);
      await permission;
      const updated = await host.saveSettings(initial.id,changes,baseline);
      baseline = JSON.stringify([updated.title,updated.config]);
      if(credentials) saveWeatherCredentials(credentials);
      if (!alive()) return false;
      remember(updated.config.city);
      find('#dialog-title').textContent = updated.title;
      find('#weather-settings').outerHTML = weatherSettings(updated);
      renderForecast(true);
      if(panel==='settings') togglePanel('');
      void loadForecast();if(panel==='cities') loadCities();
      return true;
    } catch (error) {
      feedback(error.message);
      if (alive()) find('.weather-settings-status').textContent = error.message;
      return false;
    } finally {
      busy = false;
      if (alive()) find('#weather-settings [type=submit]').disabled = false;
    }
  }
  async function selectCity(city) {
    if (!city || busy) return;
    const clean = {name:city.name,latitude:city.latitude,longitude:city.longitude,...(city.countryCode?{countryCode:city.countryCode}:{})};
    if (await save({title:current().title,config:{...current().config,city:clean,enabled:true}})) {
      hideSearch();
      find('#weather-list-query').value='';
      if(root.clientWidth<=760) togglePanel('');
      find('[data-detail-action=weather-cities]').focus({preventScroll:true});
    }
  }
  async function searchCity(form) {
    const query=form.querySelector('input').value.trim(),output=form.querySelector('.weather-search-results');
    root.querySelectorAll('.weather-search-results').forEach(node=>node.hidden=node!==output);
    search?.abort(); results = [];
    output.hidden = false;
    if (query.length < 2) { output.textContent = t('请输入至少两个字符'); return; }
    const request = search = new AbortController(), timer = setTimeout(()=>request.abort(),8000);
    output.textContent = t('正在搜索…');
    try {
      const found = await searchCities(query,request.signal);
      if (request !== search || !alive()) return;
      results = found;
      output.innerHTML = `<p role="status">${t(found.length?'选择城市查看天气':'没有找到城市，请使用英文名称或填写坐标。')}</p>` + found.map((city,i)=>`<button type="button" data-weather-result="${i}"><strong>${escapeText(city.name)}</strong><span>${escapeText(city.region)}</span></button>`).join('');
      output.querySelector('button')?.focus();
    } catch {
      if (request === search && alive()) output.textContent = t('城市搜索失败，请重试或填写坐标。');
    } finally { clearTimeout(timer); }
  }

  root.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.weatherMetric) {
      metric = target.dataset.weatherMetric; renderForecast();
      find(`[data-weather-metric="${metric}"]`)?.focus({preventScroll:true}); return;
    }
    if (target.dataset.weatherCity) { void selectCity(cities.find(city=>cityKey(city)===target.dataset.weatherCity)); return; }
    if (target.dataset.weatherResult !== undefined) { void selectCity(results[Number(target.dataset.weatherResult)]); return; }
    if (target.dataset.weatherRemove) {
      const remaining = cities.filter(city=>cityKey(city)!==target.dataset.weatherRemove);
      try { saveWeatherCities(remaining); cities=remaining; renderCities(); find('[data-detail-action=weather-add-city]').focus(); }
      catch { feedback(t('城市列表未能保存，请重试。')); }
      return;
    }
    const action = target.dataset.detailAction;
    if (action === 'weather-cities' || action === 'weather-settings') {
      const next = action === 'weather-cities' ? 'cities' : 'settings';
      togglePanel(panel===next?'':next,target);
    } else if (action === 'weather-panel-close') togglePanel('');
    else if (action === 'weather-add-city') togglePanel('cities',target,true);
    else if (action === 'weather-refresh') void loadForecast(true);
    else if (action === 'weather-enable') void save({title:current().title,config:{...current().config,enabled:true}});
    else if (action === 'window-expand') {
      settlePanels();
      expanded = !expanded;
      root.closest('dialog').classList.toggle('widget-app-expanded',expanded);
      target.setAttribute('aria-pressed',String(expanded));
      const label = t(expanded?'还原窗口':'最大化窗口');
      target.setAttribute('aria-label',label); target.title = label;
      target.innerHTML = icon(expanded?'minimize':'maximize');
    }
  },options);
  root.addEventListener('submit', event => {
    event.preventDefault(); event.stopPropagation();
    if (event.target.matches('.weather-city-search')) { void searchCity(event.target); return; }
    if (event.target.id !== 'weather-settings') return;
    const data = new FormData(event.target);
    try {
      const previous=readWeatherCredentials(),clear=data.has('clearKeys');
      const credentials=validateWeatherCredentials({qweatherHost:clear?'':data.get('qweatherHost'),qweatherKey:clear?'':data.get('qweatherKey')||previous.qweatherKey,cwaKey:clear?'':data.get('cwaKey')||previous.cwaKey});
      const city={name:String(data.get('cityName')).trim(),latitude:Number(data.get('latitude')),longitude:Number(data.get('longitude'))};
      if(cityKey(city)===cityKey(current().config.city)&&current().config.city.countryCode) city.countryCode=current().config.city.countryCode;
      void save({title:String(data.get('title')).trim(),config:{city,source:String(data.get('source')),fallback:data.has('fallback'),unit:String(data.get('unit')),enabled:data.has('enabled')}},credentials);
    } catch(error) {find('.weather-settings-status').textContent=error.message;}

  },options);
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const openSearch=root.querySelector('.weather-search-results:not([hidden])');
    if(openSearch) {event.preventDefault();event.stopPropagation();hideSearch();openSearch.closest('form').querySelector('input').focus();}
    else if(panel) {event.preventDefault();event.stopPropagation();togglePanel('');}
  },options);
  root.addEventListener('pointerdown',event=>{
    if(!event.target.closest('.weather-city-search')) hideSearch();
  },options);
  window.addEventListener('resize',settlePanels,options);
  reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches) settlePanels();},options);
  updatePanels();
  renderForecast();
  void loadForecast();
  return () => { events.abort(); search?.abort(); cancelPanelMotion(); };
}
