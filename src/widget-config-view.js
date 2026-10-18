// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as esc } from './html.js';
import { getWidgetDefinition } from './widget-registry.js';
import { TILE_SIZES, sizeLabel } from './widget-sizes.js';
import { WEATHER_SOURCES, requestWeatherPermission } from './weather-sources.js';
import { pomodoroSettingsFields, readPomodoroSettings } from './pomodoro-view.js';
import { configurePomodoro, validatePomodoroConfig } from './pomodoro.js';
import { renderExtensionSettings, readExtensionSettings } from './widget-settings.js';
import { bindCitySearch } from './city-search.js';
function field(name,label,value,options={}){if(options.type==='number'&&!('step' in options))options={...options,step:'any'};return `<label class="field"><span>${esc(label)}</span><input name="${name}" value="${esc(value)}" ${Object.entries(options).map(([key,val])=>val===true?key:`${key}="${esc(val)}"`).join(' ')}></label>`;}
function selectField(name,label,value,options){return `<label class="field"><span>${esc(label)}</span><select name="${name}">${options.map(option=>`<option value="${esc(option.value)}" ${String(option.value)===String(value)?'selected':''}>${esc(option.label)}</option>`).join('')}</select></label>`;}
function dialogHeader(title){return `<header class="utility-app-header"><button type="button" data-plugin-back>‹</button><h2>${esc(title)}</h2><button type="button" data-close>×</button></header>`;}
function formActions(){return `<p id="form-error" role="status"></p><button type="submit" class="primary-button">${t('保存')}</button>`;}
export function widgetSettings(item) {
 if(!item) return dialogHeader(t("组件不存在"))+`<div class="plugin-config-body">${t("请关闭后重试。")}</div>`;
 const type = item.widget, c=item.config, definition=getWidgetDefinition(type);
 let content = field('title',t("卡片名称"),item.title,{required:true,maxlength:30});
 if(type==='weather') content += `<div class="detail-toolbar"><input id="city-query" class="text-input" placeholder="${t("搜索全球城市")}" aria-label="${t("搜索全球城市")}"><button type="button" class="secondary-button" data-city-search>${t("搜索城市")}</button></div><div id="city-results" role="status"></div>` + selectField('source',t("天气源"),c.source||'auto',WEATHER_SOURCES.map(source=>({value:source.id,label:t(source.name)}))) + `<label class="setting-row"><span>${t("故障时自动切换天气源")}</span><input type="checkbox" class="switch" name="fallback" ${c.fallback!==false?'checked':''}></label><p class="help-text">${t("个人密钥可在天气详情的「天气源与设置」中配置。")}</p>` + selectField('unit',t("温度单位"),c.unit,[{value:'celsius',label:t("摄氏度 °C")},{value:'fahrenheit',label:t("华氏度 °F")}]) + `<div class="two-columns">${selectField('cityPreset',t("选择城市"),'',[{value:'',label:t("选择常用城市")},{value:'香港|22.32|114.17',label:t("香港")},{value:'北京|39.9|116.4',label:t("北京")},{value:'上海|31.23|121.47',label:t("上海")},{value:'深圳|22.54|114.06',label:t("深圳")},{value:'广州|23.13|113.26',label:t("广州")},{value:'成都|30.67|104.07',label:t("成都")},{value:'台北|25.03|121.56',label:t("台北")},{value:'澳门|22.1987|113.5439',label:t("澳门")},{value:'新加坡|1.35|103.82',label:t("新加坡")},{value:'东京|35.68|139.69',label:t("东京")}])}${field('cityName',t("城市名称"),c.city.name,{required:true,maxlength:60})}</div><div class="two-columns">${field('latitude',t("纬度"),c.city.latitude,{type:'number',min:-90,max:90,required:true})}${field('longitude',t("经度"),c.city.longitude,{type:'number',min:-180,max:180,required:true})}</div><label class="setting-row"><span class="setting-copy"><strong>${t("启用天气服务")}</strong><small>${t("将城市坐标发送至所选天气源。每 30 分钟更新，离线时显示缓存或错误提示。")}</small></span><input class="switch" name="weatherEnabled" type="checkbox" ${c.enabled?'checked':''}></label>`;
 else if(type==='map') content += `<p class="help-text">${t('地图源、个人 Key 和地区偏好可在地图工作台右上角设置。')}</p>`;
 else if(type==='calendar') content += selectField('weekStart',t("每周开始日"),c.weekStart,[{value:'1',label:t("星期一")},{value:'0',label:t("星期日")}])+selectField('holidays',t("节假日地区"),c.holidays,[{value:'none',label:t("仅周末")},{value:'CN',label:t("中国大陆 · 2026")}])+`<label class="setting-row"><span>${t("显示农历")}</span><input type="checkbox" name="showLunar" ${c.showLunar?'checked':''}></label>`;
 else if(type==='countdown') content += field('eventTitle',t("纪念日 / 倒数日名称"),c.title,{required:true,maxlength:40})+field('date',t("目标日期"),c.date,{type:'date',required:true});
 else if(type==='focus') content += field('duration',t("每次专注时长（分钟）"),item.data.focus.duration,{type:'number',min:1,max:180,required:true,help:t("保存时会停止当前计时，并开始一轮新的时长。")});
 else if(type==='pomodoro') content += pomodoroSettingsFields(c);
 else if(type==='workday') content += `<div class="two-columns">${field('endTime',t("下班时间"),c.endTime,{type:'time',required:true})}${field('payday',t("每月发薪日"),c.payday,{type:'number',min:1,max:31,required:true})}</div><div class="field"><span>${t("工作日")}</span><div class="color-options">${[t("日"),t("一"),t("二"),t("三"),t("四"),t("五"),t("六")].map((d,i)=>`<label class="help-text"><input type="checkbox" name="workdays" value="${i}" ${c.workdays.includes(i)?'checked':''}>${t("周{v0}", {v0: d})}</label>`).join('')}</div></div>`;
 else if(type==='clock') content += field('label',t("城市显示名称"),c.label,{required:true,maxlength:30})+selectField('timeZone',t("时区"),c.timeZone,[{value:'Asia/Hong_Kong',label:t("香港 / 北京")},{value:'Asia/Tokyo',label:t("东京")},{value:'Asia/Singapore',label:t("新加坡")},{value:'Europe/London',label:t("伦敦")},{value:'Europe/Paris',label:t("巴黎")},{value:'America/New_York',label:t("纽约")},{value:'America/Los_Angeles',label:t("洛杉矶")},{value:'Australia/Sydney',label:t("悉尼")},{value:'UTC',label:'UTC'}]);
 else if(type==='quote') content += `<label class="field"><span>${t("自定义短句（可留空）")}</span><textarea name="text" maxlength="300" placeholder="${t("写下一句想对自己说的话")}">${esc(c.text || '')}</textarea></label>${field('author',t("署名"),c.author || '',{maxlength:40})}`;
 else if(type==='notes') content += selectField('color',t("便签颜色"),c.color,[{value:'yellow',label:t("奶油黄")},{value:'pink',label:t("浅樱粉")},{value:'mint',label:t("薄荷绿")}]);
 else if(definition && !definition.builtin) content += renderExtensionSettings(item);
 else content += `<p class="help-text">${t("直接在卡片中使用这个组件。右键卡片可以调整尺寸或位置。")}</p>`;
 if(type==='clock')content+=selectField('columns',t('城市布局'),c.columns||2,[1,2,3].map(n=>({value:n,label:t('每行 {count} 个',{count:n})})));
 content += selectField('size',t("卡片尺寸"),item.size || '2x2',(type==='community'?c.manifest.sizes:definition?.sizes || TILE_SIZES).map(value=>({value,label:sizeLabel(value)})));
 return dialogHeader(`${t("设置{v0}", {v0: item.title})}`,t("修改后会保存到当前浏览器。")) + `<div class="plugin-config-body"><form id="widget-form" data-id="${esc(item.id)}" data-type="${esc(type)}">${content}${formActions()}</form></div>`;
}

export function bindWidgetSettings(root,item,host,back){
 const controller=new AbortController(),form=root.querySelector('form');const cityCleanup=bindCitySearch(form);
 form.addEventListener('submit',async event=>{
  event.preventDefault();event.stopPropagation();const data=new FormData(form),value=name=>String(data.get(name)||'').trim(),type=item.widget;
  try{
   const c=item.config;
   if(type==='weather'){const latitude=Number(value('latitude')),longitude=Number(value('longitude'));if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180)throw new Error(t("请填写有效的经纬度。"));const city={name:value('cityName'),latitude,longitude};if(form.dataset.weatherCountryCode&&form.dataset.weatherCoordinates===`${latitude},${longitude}`)city.countryCode=form.dataset.weatherCountryCode;else if(latitude===c.city.latitude&&longitude===c.city.longitude&&c.city.countryCode)city.countryCode=c.city.countryCode;const updated={city,enabled:data.has('weatherEnabled'),unit:value('unit'),source:value('source'),fallback:data.has('fallback')};await requestWeatherPermission(city,updated);Object.assign(c,updated);}
   if(type==='calendar'){c.weekStart=Number(value('weekStart'));c.holidays=value('holidays');c.showLunar=data.has('showLunar');}
   if(type==='countdown'){c.title=value('eventTitle');c.date=value('date');}
   if(type==='focus'){const duration=Number(value('duration'));if(!Number.isInteger(duration)||duration<1||duration>180)throw new Error(t("专注时长需为 1–180 分钟。"));item.data.focus={duration,remaining:duration*60,endAt:null,running:false};}
   if(type==='pomodoro'){item.config=validatePomodoroConfig(readPomodoroSettings(data));item.data=configurePomodoro(item.data,item.config);}
   if(type==='workday'){c.endTime=value('endTime');c.payday=Number(value('payday'));c.workdays=data.getAll('workdays').map(Number);}
   if(type==='clock'){c.timeZone=value('timeZone');c.label=value('label');c.columns=Number(value('columns'));}
   if(type==='quote'){c.text=value('text');c.author=value('author');}
   if(type==='notes')c.color=value('color');
   if(!getWidgetDefinition(type).builtin)item.config=readExtensionSettings(type,data,c);
   item.title=value('title');item.size=value('size');

   await host.save();back();
  }catch(error){root.querySelector('#form-error').textContent=error.message;}
 },{signal:controller.signal});return ()=>{controller.abort();cityCleanup();};
}
