// SPDX-License-Identifier: GPL-3.0-only
import { t, formatDate } from './i18n.js';
import { escapeText as e } from './html.js';
import { icon } from './icons.js';
import { windowControls } from './widget-app-controls.js';
import { renderWidgetContent, bindWidgets, refreshLiveWidgets, daysUntil, workdayStatus } from './widgets.js';
import { parseDate, localDateKey } from './calendar.js';
import { LIFE_WIDGETS, lifeWorkspace } from './widget-life-view.js';
import { bindLifeWorkspace } from './widget-life-workspace.js';

export const UTILITY_WIDGETS = ['countdown','workday','focus','notes','todo','habit','clock','quote','hotlinks'];
const glyphs = {countdown:'flag',workday:'briefcase',focus:'timer',notes:'note',todo:'check',habit:'sparkles',clock:'globe',quote:'quote',hotlinks:'trending'};
const input = (name,label,value,type='text',attributes='') => `<label class="utility-field"><span>${e(label)}</span><input name="${name}" type="${type}" value="${e(value)}" ${attributes}></label>`;
const zones = ['Asia/Hong_Kong','Asia/Shanghai','Asia/Tokyo','Asia/Singapore','Asia/Kolkata','Australia/Sydney','Europe/London','Europe/Paris','America/New_York','America/Los_Angeles','UTC'];
const week = () => [t('日'),t('一'),t('二'),t('三'),t('四'),t('五'),t('六')];

export function workspaceHeader(item, expanded=false) {
  return `<header class="utility-app-header"><h2 id="dialog-title">${icon(glyphs[item.widget] || 'cloud')}${e(item.title)}</h2>${windowControls(expanded)}</header>`;
}

export function utilitySettings(item) {
  const c=item.config;
  let fields=input('title',t('卡片名称'),item.title,'text','required maxlength="30"');
  if(item.widget==='countdown') fields+=input('eventTitle',t('期待的事情'),c.title,'text','required maxlength="120"')+input('date',t('目标日期'),c.date,'date','required min="1900-01-01" max="2200-12-31"');
  if(item.widget==='workday') fields+=input('endTime',t('下班时间'),c.endTime,'time','required')+input('payday',t('每月发薪日'),c.payday,'number','required min="1" max="31"')+`<fieldset class="utility-week"><legend>${t('工作日')}</legend>${week().map((label,day)=>`<label><input type="checkbox" name="workdays" value="${day}" ${c.workdays.includes(day)?'checked':''}><span>${label}</span></label>`).join('')}</fieldset><p class="utility-help">${t('按所选星期计算；不自动计入法定调休。月底不足发薪日期时取当月最后一天。')}</p>`;
  if(item.widget==='focus') fields+=`<div class="utility-presets">${[5,15,25,45,60].map(n=>`<button type="button" data-duration="${n}">${t('{count} 分钟',{count:n})}</button>`).join('')}</div>`+input('duration',t('每次专注时长（分钟）'),item.data.focus.duration,'number','required min="1" max="180"')+`<p class="utility-help">${t('保存时会停止当前计时，并开始一轮新的时长。')}</p>`;
  if(item.widget==='clock') fields+=input('label',t('城市名称'),c.label,'text','required maxlength="60"')+`<label class="utility-field"><span>${t('时区')}</span><input name="timeZone" value="${e(c.timeZone)}" list="utility-timezones" required maxlength="80"><datalist id="utility-timezones">${zones.map(zone=>`<option value="${zone}"></option>`).join('')}</datalist></label>`;
  if(item.widget==='quote') fields+=`<label class="utility-field"><span>${t('自定义摘录')}</span><textarea name="text" maxlength="1000" rows="7">${e(c.text)}</textarea></label>`+input('author',t('作者'),c.author,'text','maxlength="120"');
  if(item.widget==='notes') fields+=`<label class="utility-field"><span>${t('便签颜色')}</span><select name="color">${[['yellow','暖黄'],['pink','浅粉'],['mint','薄荷']].map(([value,label])=>`<option value="${value}" ${c.color===value?'selected':''}>${t(label)}</option>`).join('')}</select></label>`;
  return `<form class="utility-settings" data-utility-form><h3>${t('设置组件')}</h3>${fields}<button type="submit" class="utility-primary">${t('保存设置')}</button><p class="utility-status" role="status"></p></form>`;
}

export function readUtilitySettings(item, form) {
  const config=structuredClone(item.config), value=name=>String(form.get(name) || '').trim();
  if(item.widget==='countdown')Object.assign(config,{title:value('eventTitle'),date:value('date')});
  if(item.widget==='workday')Object.assign(config,{endTime:value('endTime'),payday:Number(value('payday')),workdays:form.getAll('workdays').map(Number)});
  if(item.widget==='clock')Object.assign(config,{label:value('label'),timeZone:value('timeZone')});
  if(item.widget==='quote')Object.assign(config,{text:value('text'),author:value('author')});
  if(item.widget==='notes')config.color=value('color');
  return {title:value('title'),config,...(item.widget==='focus'?{duration:Number(value('duration'))}:{})};
}

function countdownContent(item) {
  const date=parseDate(item.config.date), days=daysUntil(item.config.date);
  return `<div class="utility-countdown"><span>${t(days===0?'就是今天':days<0?'已经过去':'还有')}</span><div><strong data-live="countdown-number">${Math.abs(days)}</strong><span>${t('天')}</span></div><h3>${e(item.config.title)}</h3><p>${e(date?formatDate(date,{dateStyle:'full'}):item.config.date)}</p><div class="utility-stats"><article><span>${t('完整周数')}</span><strong>${Math.floor(Math.abs(days)/7)}</strong></article><article><span>${t('余下天数')}</span><strong>${Math.abs(days)%7}</strong></article></div></div>`;
}

function workdayContent(item) {
  const status=workdayStatus(item.config);
  return `<div class="utility-workday"><p data-live="workday-caption">${status.caption}</p><strong class="utility-big-time" data-live="workday-time">${status.text}</strong><p>${t('每天 {v0} 准时收工',{v0:e(item.config.endTime)})}</p><div class="utility-stats"><article><span>${t('距发薪日')}</span><strong data-live="workday-pay">${t('{v0} 天',{v0:status.paydays})}</strong></article><article><span>${t('每周工作天数')}</span><strong>${item.config.workdays.length}</strong></article></div><div class="utility-week-preview">${week().map((label,day)=>`<span class="${item.config.workdays.includes(day)?'is-workday':''} ${day===new Date().getDay()?'is-today':''}">${label}</span>`).join('')}</div></div>`;
}

function clockComparison(item) {
  return [...new Set([item.config.timeZone,...zones])].map(zone=>`<article><span>${e(zone.replaceAll('_',' '))}</span><strong>${e(formatDate(new Date(),{timeZone:zone,hour:'2-digit',minute:'2-digit',hour12:false}))}</strong><small>${e(formatDate(new Date(),{timeZone:zone,weekday:'short',month:'short',day:'numeric'}))}</small></article>`).join('');
}

function tools(item) {
  if(item.widget==='notes')return `<div class="utility-toolbar"><span data-utility-count>${t('{count} 字符',{count:item.data.notes.length})}</span><button type="button" data-utility-export>${t('导出 TXT')}</button></div>`;
  if(item.widget==='todo')return `<div class="utility-toolbar"><label>${t('显示任务')}<select data-todo-filter><option value="all">${t('全部')}</option><option value="active">${t('未完成')}</option><option value="done">${t('已完成')}</option></select></label><button type="button" data-clear-done>${t('清除已完成')}</button></div>`;
  if(item.widget==='habit')return `<section class="utility-habit-week"><h3>${t('最近七天')}</h3><div data-habit-week></div></section>`;
  if(item.widget==='clock')return `<section class="utility-world-list" data-world-list>${clockComparison(item)}</section>`;
  if(item.widget==='hotlinks')return `<label class="utility-field"><span>${t('筛选平台')}</span><input type="search" data-platform-filter></label>`;
  return '';
}

export function utilityWorkspace(item,state) {
  if(LIFE_WIDGETS.includes(item.widget))return lifeWorkspace(item,state);
  const content=item.widget==='countdown'?countdownContent(item):item.widget==='workday'?workdayContent(item):renderWidgetContent(item,state);
  return `<div class="utility-app" data-utility-type="${item.widget}">${workspaceHeader(item)}<div class="utility-layout"><section class="utility-main"><section class="utility-panel widget-inner w-${item.widget}" data-widget="${item.widget}" data-widget-id="${e(item.id)}" data-widget-day="${localDateKey()}">${content}</section>${tools(item)}</section>${utilitySettings(item)}</div></div>`;
}

export function bindUtilityWorkspace(root,item,host) {
  if(LIFE_WIDGETS.includes(item.widget))return bindLifeWorkspace(root,item,host);
  const controller=new AbortController(), options={signal:controller.signal};
  const initial=JSON.stringify([item.title,item.config]), form=root.querySelector('[data-utility-form]');
  const latest=()=>host.getState().items.find(entry=>entry.id===item.id);
  const cleanup=bindWidgets(root,{...host,openDialog:(kind,data)=>{if(kind!=='widget-detail')host.openDialog(kind,data);}});
  const refresh=()=>{
    refreshLiveWidgets(root,host.getState());
    const current=latest();if(!current)return;
    const world=root.querySelector('[data-world-list]');if(world)world.innerHTML=clockComparison(current);
    const weekRoot=root.querySelector('[data-habit-week]');
    if(weekRoot){const days=Array.from({length:7},(_,i)=>{const day=new Date();day.setDate(day.getDate()-6+i);return localDateKey(day);});weekRoot.innerHTML=current.data.habits.map(h=>`<div><span>${e(h.name)}</span>${days.map(day=>`<span title="${day}" aria-label="${day}: ${t(h.dates.includes(day)?'已完成':'未完成')}" class="${h.dates.includes(day)?'done':''}">${h.dates.includes(day)?'✓':'·'}</span>`).join('')}</div>`).join('');}
    const filter=root.querySelector('[data-todo-filter]')?.value;
    if(filter)for(const row of root.querySelectorAll('.w-todo-row'))row.hidden=filter!=='all'&&(row.classList.contains('is-done')!==(filter==='done'));
  };
  const timer=setInterval(refresh,1000);refresh();
  let saving=false;
  form.addEventListener('submit',async event=>{
    event.preventDefault();event.stopPropagation();if(saving)return;
    saving=true;form.querySelector('[type=submit]').disabled=true;
    try{await host.saveSettings(item.id,readUtilitySettings(item,new FormData(form)),initial);if(root.isConnected)host.openDialog('widget-detail',{item:latest()});}
    catch(error){if(root.isConnected)form.querySelector('[role=status]').textContent=error.message;}
    finally{saving=false;if(root.isConnected)form.querySelector('[type=submit]').disabled=false;}
  },options);
  root.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.detailAction==='window-expand'){root.closest('dialog').classList.toggle('widget-app-expanded');button.setAttribute('aria-pressed',String(root.closest('dialog').classList.contains('widget-app-expanded')));}
    if(button.dataset.duration){form.elements.duration.value=button.dataset.duration;form.elements.duration.focus();}
    if(button.hasAttribute('data-utility-export')){const url=URL.createObjectURL(new Blob([latest().data.notes],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Qiye-note.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    if(button.hasAttribute('data-clear-done')){try{await host.saveData(item.id,{todos:latest().data.todos.filter(todo=>!todo.done)},JSON.stringify(latest().data));if(root.isConnected)host.openDialog('widget-detail',{item:latest()});}catch(error){host.toast(error.message);}}
    refresh();
  },options);
  root.addEventListener('change',refresh,options);
  root.addEventListener('input',event=>{
    if(event.target.matches('[data-widget-input=notes]'))root.querySelector('[data-utility-count]').textContent=t('{count} 字符',{count:event.target.value.length});
    if(event.target.hasAttribute('data-platform-filter'))for(const link of root.querySelectorAll('.w-hotlink'))link.hidden=!link.textContent.toLocaleLowerCase().includes(event.target.value.trim().toLocaleLowerCase());
  },options);
  return ()=>{controller.abort();clearInterval(timer);cleanup();};
}
