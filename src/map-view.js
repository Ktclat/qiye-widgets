// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as e } from './html.js';
import { icon } from './icons.js';
import { windowControls } from './widget-app-controls.js';
import { MAP_REGIONS, coordinateText, mapRegion, mapExternalUrl, sameMapPlace } from './map-model.js';
import { MAP_SOURCES, allMapSources, readMapLocal, resolveMapSource } from './map-sources.js';

const button=(action,label,glyph,extra='')=>`<button type="button" data-map-action="${action}" aria-label="${e(label)}" title="${e(label)}" ${extra}>${icon(glyph)}</button>`;
const sourceName=source=>source?.template?source.name:t(source?.name||'地图源');
export function mapCard(item) {
  const place=item.data.selected;
  return `<div class="widget-inner w-map" data-widget="map" data-widget-id="${e(item.id)}" data-display-size="${item.size}" title="${e(item.title)}">
    <div class="map-card-grid" aria-hidden="true"><i></i><i></i><i></i><span>${icon('mapPin')}</span></div>
    <button type="button" class="map-card-open" data-action="widget-open" aria-label="${e(t('打开地图'))}"><span class="map-card-eyebrow">${icon('map')}<span>${t('地图')}</span></span><strong>${e(place.name)}</strong><span class="map-card-coordinate">${Math.abs(place.latitude).toFixed(2)}° ${place.latitude<0?'S':'N'} · ${Math.abs(place.longitude).toFixed(2)}° ${place.longitude<0?'W':'E'}</span><span class="map-card-caption">${t('搜索地点 · 收藏 · 出发')}${icon('arrowUpRight')}</span></button>

  </div>`;
}
export function mapSourceOptions(selected,region,local,auto=true) {
  return `${auto?`<option value="auto" ${selected==='auto'?'selected':''}>${t('按地区自动选择')}</option>`:''}${allMapSources(local).map(source=>`<option value="${e(source.id)}" ${source.id===selected?'selected':''} ${source.regions&&!source.regions.includes(region)?'disabled':''}>${e(sourceName(source))}${source.credential&&!local[source.credential]?` · ${t('待配置')}`:''}</option>`).join('')}${selected!=='auto'&&!allMapSources(local).some(row=>row.id===selected)?`<option value="${e(selected)}" selected>${t('此设备尚未配置的地图源')}</option>`:''}`;
}
export function mapPlaceRows(places,kind='result') {
  return places.map((place,i)=>`<button type="button" class="map-place-row" data-map-${kind}="${i}"><span class="map-place-symbol">${icon(kind==='favorite'?'star':'mapPin')}</span><span><strong>${e(place.name)}</strong><small>${e(place.address||t(mapRegion(place.region)?.name||'世界'))}</small></span>${icon('chevronRight')}</button>`).join('');
}
export function mapSelection(place,favorites=[]) {
  const saved=favorites.some(row=>sameMapPlace(row,place));
  return `<div class="map-selection-title"><span class="map-location-dot"></span><span>${t('选中地点')}</span></div><h3>${e(place.name)}</h3><p>${e(place.address||t(mapRegion(place.region)?.name||'世界'))}</p><div class="map-coordinate-line"><code>${coordinateText(place)}</code><span>${place.crs==='gcj02'?'GCJ-02':'WGS84'}</span></div><div class="map-place-tools"><button type="button" data-map-action="favorite" aria-pressed="${saved}">${icon(saved?'check':'star')}${t(saved?'已收藏':'收藏地点')}</button>${button('copy',t('复制坐标'),'copy')}${button('recenter',t('回到选中地点'),'target')}</div><div class="map-external-links"><a href="${e(mapExternalUrl(place))}" target="_blank" rel="noopener noreferrer">${t('在高德中打开')}${icon('arrowUpRight')}</a><a href="${e(mapExternalUrl(place,'google'))}" target="_blank" rel="noopener noreferrer">Google Maps ${icon('arrowUpRight')}</a></div>`;
}
export function mapAttribution(source,enabled) {
  if(!source||!enabled)return '';
  return `${source.id==='hk'?'<img src="https://api.hkmapservice.gov.hk/mapapi/landsdlogo.jpg" alt="Lands Department" width="72" height="24" referrerpolicy="no-referrer">':''}<a href="${e(source.url)}" target="_blank" rel="noopener noreferrer">${e(source.credit)}</a>${source.id==='osm'?'<a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">'+t('报告地图问题')+'</a>':''}`;
}
const field=(label,name,value,attrs='')=>`<label class="map-field"><span>${e(t(label))}</span><input name="${e(name)}" value="${e(value)}" ${attrs}></label>`;
export function customMapSourceFields(source) {
  return `<fieldset class="map-custom-source" data-map-custom="${e(source.id)}"><legend>${t('自定义地图源')}</legend><div class="map-custom-heading">${field('名称','custom-name',source.name,'required maxlength="50"')}${button('remove-source',t('移除地图源'),'trash',`data-source-id="${e(source.id)}"`)}</div>${field('瓦片地址','custom-template',source.template,'required maxlength="2048" placeholder="https://example.com/{z}/{x}/{y}.png" spellcheck="false"')}${field('地图署名','custom-credit',source.credit,'required maxlength="160"')}<div class="map-custom-options"><label class="map-field"><span>${t('坐标系')}</span><select name="custom-crs"><option value="wgs84" ${source.crs==='wgs84'?'selected':''}>WGS84 / CGCS2000</option><option value="gcj02" ${source.crs==='gcj02'?'selected':''}>GCJ-02</option></select></label>${field('最小级别','custom-min',source.minZoom,'type="number" min="1" max="20" required')}${field('最大级别','custom-max',source.maxZoom,'type="number" min="1" max="20" required')}</div></fieldset>`;
}
export function mapSettings(local,enabled) {
  return `<div class="map-settings-heading"><div><small>MAP SOURCES</small><h3 id="map-settings-title">${t('地图源与偏好')}</h3></div>${button('settings-close',t('返回地图'),'close')}</div><form id="map-settings-form"><div class="map-settings-scroll"><label class="map-enable-setting"><span><strong>${t('启用地图服务')}</strong><small>${t('仅打开地图工作台时加载底图。')}</small></span><input type="checkbox" name="enabled" ${enabled?'checked':''}></label><label class="map-enable-setting map-notice-setting"><span><strong>${t('显示地图源提示')}</strong><small>${t('提示首选源未配置或图层不可用；关闭后仍可查看实际地图源。')}</small></span><input type="checkbox" name="showSourceNotices" ${local.showSourceNotices?'checked':''}></label>
    <div class="map-settings-section"><h4>${t('接入地图服务')}</h4><p>${t('密钥、地区偏好和自定义源仅保存在本机，不进入备份或同步。')}</p>${field('高德 Web 服务 Key','amapKey',local.amapKey,'type="password" maxlength="128" autocomplete="off" spellcheck="false"')}<p>${t('选择「Web 服务」类型的 Key；用于静态地图与地点搜索。')} <a href="https://console.amap.com/dev/key/app" target="_blank" rel="noopener noreferrer">${t('申请高德 Key')} ↗</a></p>${field('天地图 Key','tiandituKey',local.tiandituKey,'type="password" maxlength="128" autocomplete="off" spellcheck="false"')}<p><a href="https://console.tianditu.gov.cn/" target="_blank" rel="noopener noreferrer">${t('申请天地图 Key')} ↗</a></p></div>
    <div class="map-settings-section"><h4>${t('地区首选地图源')}</h4><p>${t('选择「按地区自动选择」时生效。缺少 Key 时会显示实际使用的备用源。')}</p>${MAP_REGIONS.map(region=>`<label class="map-region-preference"><span>${e(t(region.name))}</span><select name="preferred-${region.id}" aria-label="${e(t(region.name))}">${mapSourceOptions(local.preferences[region.id],region.id,local,false)}</select></label>`).join('')}</div>
    <div class="map-settings-section"><h4>${t('自定义地图源')}<span data-map-custom-count>${local.custom.length} / 8</span></h4><p>${t('支持 256 像素 Web Mercator XYZ / WMTS 瓦片。地址使用 {z}、{x}、{y}；服务需允许浏览器访问。')}</p><div data-map-custom-list>${local.custom.map(customMapSourceFields).join('')}</div><button type="button" class="map-add-source" data-map-action="add-source">${icon('plus')}${t('添加地图源')}</button></div>
    <div class="map-source-reference"><h4>${t('内置地图源')}</h4>${MAP_SOURCES.map(source=>`<a href="${e(source.url)}" target="_blank" rel="noopener noreferrer"><span>${e(t(source.name))}<small>${e(t(source.note))}</small></span>${icon('arrowUpRight')}</a>`).join('')}</div></div><footer class="map-settings-footer"><span data-map-settings-status role="status"></span><button type="submit">${t('保存地图设置')}</button></footer></form>`;
}
export function mapWorkspace(item) {
  const local=readMapLocal(),data=item.data,plan=resolveMapSource(item.config,data.region,local);
  return `<div class="map-app"><header class="map-header">
    <div class="map-brand">${icon('map')}<h2 id="dialog-title" tabindex="-1">${e(item.title)}</h2></div>
    <form id="map-search-form" class="map-header-search" role="search"><div class="map-search-input">${icon('search')}<input name="query" type="search" maxlength="120" placeholder="${t('搜索地点或输入经度, 纬度')}" aria-label="${t('搜索地图地点')}" aria-controls="map-place-panel" aria-expanded="false" autocomplete="off">${button('clear-search',t('清除搜索与选点'),'close','hidden')}${button('search-options',t('搜索选项'),'sliders','aria-expanded="false" aria-controls="map-search-options"')}<button type="submit" aria-label="${t('搜索')}">${icon('arrowRight')}</button></div>
      <div id="map-search-options" class="map-search-options" hidden><label><span>${t('地点搜索来源')}</span><select name="searchSource"><option value="local">${t('本地地点')}</option><option value="amap">${t('高德地点搜索')}</option></select></label><label><span>${t('输入坐标系')}</span><select name="coordinateSystem"><option value="wgs84">WGS84</option><option value="gcj02">GCJ-02</option></select></label><p data-map-search-hint>${t('常用城市、收藏与坐标可离线搜索。')}</p></div>
    </form>
    <div class="map-header-actions">${button('sources',t('地图源与图层'),'layers',`class="map-source-toggle" aria-expanded="false" aria-controls="map-source-menu"`)}${button('places',t('我的收藏'),'star','aria-expanded="false" aria-controls="map-place-panel"')}${button('settings',t('地图源与偏好'),'sliders','aria-expanded="false"')}${windowControls()}</div>
  </header>
    <section id="map-source-menu" class="map-source-menu" aria-label="${t('地图源与图层')}" hidden><label class="map-field"><span>${t('当前地图源')}</span><select data-map-source>${mapSourceOptions(item.config.source,data.region,local)}</select></label><p class="map-current-source">${t('实际使用')} <strong data-map-provider>${e(sourceName(plan.source))}</strong></p><div class="map-layer-switch" role="group" aria-label="${t('地图图层')}"><button type="button" data-map-layer="street" aria-pressed="${plan.layer==='street'}">${t('街道')}</button><button type="button" data-map-layer="satellite" aria-pressed="${plan.layer==='satellite'}">${t('卫星')}</button></div><div class="map-view-coordinates"><span>${t('当前视野')}</span><code data-map-center>${coordinateText(data.center)}</code></div></section>
    <div class="map-layout"><main class="map-stage">
      <div class="map-viewport" tabindex="0" role="region" aria-label="${t('交互地图；方向键平移，加减键缩放，点击选点')}"><div class="map-image-plane"></div><div class="map-selected-marker" hidden>${icon('mapPin')}</div><div class="map-scale"></div></div>
      <aside id="map-place-panel" class="map-sidebar" aria-label="${t('地点列表')}" hidden><div class="map-panel-heading"><h3 data-map-panel-title>${t('搜索结果')}</h3><span data-map-favorite-count hidden>${data.favorites.length}</span>${button('panel-close',t('关闭地点面板'),'close')}</div><div class="map-result-scroll"><p class="map-search-status" data-map-search-status role="status"></p><div data-map-results></div></div><section class="map-selection" data-map-selection aria-label="${t('选中地点')}" hidden></section></aside>
      <div class="map-source-notice" data-map-notice hidden role="status"><span data-map-notice-text></span>${button('dismiss-notice',t('关闭地图源提示'),'close')}</div>
      <div class="map-gate" data-map-gate><div class="map-gate-symbol">${icon('map')}</div><h3 data-map-gate-title>${t('开始浏览地图')}</h3><p data-map-gate-copy>${t('启用后，会向所选地图源发送当前地图范围。')}</p><button type="button" data-map-action="enable">${t('启用地图')}</button><button type="button" data-map-action="settings">${t('配置地图源')}</button></div>
      <div class="map-navigation"><span class="map-north" aria-label="${t('地图朝北')}">N<span>↑</span></span>${button('locate',t('我的位置'),'target')}${button('zoom-in',t('放大地图'),'plus')}${button('zoom-out',t('缩小地图'),'minus')}</div><div class="map-load-state" role="status" data-map-load hidden><span></span><button type="button" data-map-action="retry">${t('重试')}</button></div>
      <div class="map-save-state" data-map-save-state hidden><span data-map-save role="status"></span><button type="button" data-map-action="save-retry" hidden>${t('重试保存')}</button></div><span class="map-feedback" data-map-feedback role="status" aria-live="polite"></span>
      <div class="map-attribution" data-map-attribution></div></main></div>
    <div class="map-settings-shade" data-map-action="settings-close" hidden></div><section class="map-settings-panel" aria-labelledby="map-settings-title" hidden>${mapSettings(local,item.config.enabled)}</section></div>`;
}
