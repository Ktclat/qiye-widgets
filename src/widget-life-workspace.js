// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { localDateKey, parseDate } from './calendar.js';
import { bindWidgets } from './widgets.js';
import { icon } from './icons.js';
import { validateWidgetData } from './widget-data.js';
import { CLOCK_CITIES, countdownEntries, clockCities, validateClockCities } from './widget-life.js';
import { countdownBrowser, countdownEditor, workdayStudio, workdayFace, notesDesk, worldClockDesk, clockEditor, habitDesk } from './widget-life-view.js';

const uid=()=>globalThis.crypto.randomUUID();
export function readWorkdayForm(form,previous) {
  const value=name=>String(form.get(name)||'').trim();
  return {title:value('title'),config:{...previous,startTime:value('startTime'),endTime:value('endTime'),payday:Number(value('payday')),
    workdays:form.getAll('workdays').map(Number),style:value('style'),background:value('background'),font:value('font'),
    showPayday:form.has('showPayday'),showFriday:form.has('showFriday'),showEarnings:form.has('showEarnings'),dailyIncome:Number(value('dailyIncome'))}};
}

export function bindLifeWorkspace(root,initial,host) {
  const controller=new AbortController(),options={signal:controller.signal},kind=initial.widget;
  const current=()=>host.getState().items.find(item=>item.id===initial.id);
  const alive=()=>!controller.signal.aborted&&root.isConnected&&!!current();
  const content=root.querySelector('[data-life-content]'),editor=root.querySelector('[data-life-editor]');
  const view={active:kind==='countdown'?countdownEntries(initial)[0]?.id:initial.data.habits?.[0]?.id,category:'all',filter:'all',week:0,month:localDateKey().slice(0,7),add:false,offset:0,deleted:null};
  let feedbackTimer;
  let busy=false,editing=false,returnFocus=null,lastDay=localDateKey(),cleanupNotes=()=>{};
  const feedback=message=>{clearTimeout(feedbackTimer);const node=root.querySelector('.life-feedback');node.textContent=message;node.hidden=!message;if(message)feedbackTimer=setTimeout(()=>{node.hidden=true;},message===t('倒数日已删除')?8000:3000);};
  function draw() {
    if(!alive())return;
    const scroll=content.scrollTop,focused=document.activeElement;
    const attrs=focused&&content.contains(focused)?[...focused.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value]):[];
    content.innerHTML=kind==='countdown'?countdownBrowser(current(),view):kind==='workday'?workdayStudio(current()):kind==='notes'?notesDesk(current()):kind==='clock'?worldClockDesk(current(),view):habitDesk(current(),view);
    content.scrollTop=scroll;
    if(attrs.length){const selector=attrs.map(([name,value])=>`[${name}="${CSS.escape(value)}"]`).join('');content.querySelector(selector)?.focus({preventScroll:true});}
  }
  function openEditor(html) {
    returnFocus=document.activeElement;editing=true;editor.innerHTML=html;
    content.inert=true;root.querySelector('.utility-app-header').inert=true;
    (editor.querySelector('input:not([type=hidden])')||editor.querySelector('button'))?.focus();
  }
  function closeEditor() {
    editing=false;editor.innerHTML='';content.inert=false;root.querySelector('.utility-app-header').inert=false;
    (returnFocus?.isConnected?returnFocus:root.querySelector('#dialog-title'))?.focus({preventScroll:true});
  }
  async function run(action) {
    if(busy||!alive())return;
    busy=true;root.setAttribute('aria-busy','true');feedback('');
    for(const node of root.querySelectorAll('.life-form-error,.life-editor-feedback'))node.textContent='';
    try{await action();}
    catch(error){if(alive()){const inline=editor.querySelector('.life-editor-feedback')||content.querySelector('.life-form-error');if(inline)inline.textContent=error.message;else feedback(error.message||t('保存失败，请重试'));}}
    finally{busy=false;if(alive())root.removeAttribute('aria-busy');}
  }
  async function dataSave(patch) {
    const item=current(),safe=validateWidgetData(kind,{...item.data,...patch},'data');
    await host.saveData(item.id,safe,JSON.stringify(item.data));
  }
  async function settingsSave(patch) {
    const item=current();return host.saveSettings(item.id,{title:item.title,config:item.config,...patch},JSON.stringify([item.title,item.config]));
  }
  async function saveCities(cities) {
    const safe=validateClockCities(cities,'config.cities');
    await settingsSave({config:{...current().config,cities:safe,label:safe[0].label,timeZone:safe[0].timeZone}});
    if(alive()){if(editing)closeEditor();draw();}
  }
  async function addHabit(name) {
    if(current().data.habits.length>=100)throw new Error(t('习惯最多支持 100 项'));
    const habit={id:uid(),name:name.trim(),dates:[]};
    await dataSave({habits:[...current().data.habits,habit]});view.active=habit.id;view.add=false;view.filter='all';draw();
  }
  function updatePreview() {
    const form=content.querySelector('[data-life-form=workday]');if(!form)return;
    const {config}=readWorkdayForm(new FormData(form),current().config);
    if(!/^\d\d:\d\d$/.test(config.startTime)||!/^\d\d:\d\d$/.test(config.endTime))return;
    const preview=form.querySelector('[data-workday-preview]');preview.className='workday-preview font-'+config.font;preview.innerHTML=workdayFace(config);
  }
  function tick() {
    if(!alive()||document.hidden)return;
    if(kind==='workday')updatePreview();
    else if(kind==='clock'&&!editing){
      // Update time surfaces only; keep city actions and the comparison slider focused.
      const next=document.createElement('template');next.innerHTML=worldClockDesk(current(),view);
      const oldCards=content.querySelectorAll('.world-city'),newCards=next.content.querySelectorAll('.world-city');
      oldCards.forEach((card,i)=>{const fresh=newCards[i];if(!fresh)return;card.className=fresh.className;for(const selector of ['.world-city-time','footer','header>div:first-child>span'])card.querySelector(selector).innerHTML=fresh.querySelector(selector).innerHTML;});
      content.querySelector('.world-clock-toolbar>div').innerHTML=next.content.querySelector('.world-clock-toolbar>div').innerHTML;
    }
    const day=localDateKey();if(day!==lastDay){if(view.month===lastDay.slice(0,7))view.month=day.slice(0,7);lastDay=day;if(['habit','countdown'].includes(kind)&&!editing)draw();}
  }
  async function click(event) {
    const button=event.target.closest('button');
    if(event.target.classList.contains('life-overlay')){closeEditor();return;}
    if(!button)return;
    const action=button.dataset.lifeAction;
    if(button.dataset.detailAction==='window-expand'){
      const dialog=root.closest('dialog'),expanded=dialog.classList.toggle('widget-app-expanded');
      button.innerHTML=icon(expanded?'minimize':'maximize');button.setAttribute('aria-pressed',String(expanded));button.setAttribute('aria-label',t(expanded?'还原窗口':'最大化窗口'));return;
    }
    if(action==='edit-close'){closeEditor();return;}
    if(button.dataset.countdownSelect){view.active=button.dataset.countdownSelect;draw();return;}
    if(button.dataset.countdownCategory){view.category=button.dataset.countdownCategory;draw();return;}
    if(button.dataset.countdownFilter){view.filter=button.dataset.countdownFilter;draw();return;}
    if(action==='countdown-new'||action==='countdown-edit'){
      openEditor(countdownEditor(action==='countdown-edit'?countdownEntries(current()).find(e=>e.id===button.dataset.id):{category:view.category==='all'?'anniversary':view.category}));return;
    }
    if(action==='countdown-pin')return run(async()=>{await dataSave({events:countdownEntries(current()).map(entry=>entry.id===button.dataset.id?{...entry,pinned:!entry.pinned}:entry)});draw();});
    if(action==='countdown-delete')return run(async()=>{
      const entries=countdownEntries(current()),deleted=entries.find(e=>e.id===button.dataset.id);
      await dataSave({events:entries.filter(e=>e.id!==button.dataset.id)});view.deleted=deleted;view.active='';draw();
      feedback(t('倒数日已删除'));const undo=document.createElement('button');undo.type='button';undo.dataset.lifeAction='countdown-undo';undo.textContent=t('撤销');root.querySelector('.life-feedback').append(undo);
    });
    if(action==='countdown-undo'&&view.deleted)return run(async()=>{await dataSave({events:[...countdownEntries(current()),view.deleted]});view.active=view.deleted.id;view.deleted=null;draw();});
    if(action==='workday-weekdays'){for(const input of content.querySelectorAll('[name=workdays]'))input.checked=Number(input.value)>=1&&Number(input.value)<=5;updatePreview();return;}
    if(button.dataset.noteColor)return run(async()=>{await settingsSave({config:{...current().config,color:button.dataset.noteColor}});content.querySelector('[data-note-paper]').className='notes-desk notes-paper-'+button.dataset.noteColor;root.querySelector('.life-notes').className='utility-app life-app life-notes notes-paper-'+button.dataset.noteColor;for(const swatch of content.querySelectorAll('[data-note-color]'))swatch.setAttribute('aria-pressed',String(swatch===button));});
    if(action==='notes-export'){
      const item=current(),url=URL.createObjectURL(new Blob([item.data.notes],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');
      link.href=url;link.download=item.title.replace(/[\\/:*?"<>|]/g,'_')+'.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    if(button.dataset.clockColumns)return run(async()=>{await settingsSave({config:{...current().config,columns:Number(button.dataset.clockColumns)}});draw();});
    if(action==='clock-add'){openEditor(clockEditor(current()));return;}
    if(button.dataset.clockAddZone)return run(()=>saveCities([...clockCities(current().config),{label:t(CLOCK_CITIES.find(c=>c[1]===button.dataset.clockAddZone)[0]),timeZone:button.dataset.clockAddZone}]));
    if(action==='clock-remove')return run(()=>saveCities(clockCities(current().config).filter(c=>c.timeZone!==button.dataset.zone)));
    if(action==='clock-primary')return run(()=>saveCities([...clockCities(current().config)].sort((a,b)=>Number(b.timeZone===button.dataset.zone)-Number(a.timeZone===button.dataset.zone))));
    if(action==='clock-now'){view.offset=0;draw();return;}
    if(action==='habit-add'){view.add=!view.add;draw();content.querySelector('[data-life-form=habit-add] input')?.focus();return;}
    if(button.dataset.habitSuggestion)return run(()=>addHabit(button.dataset.habitSuggestion));
    if(button.dataset.habitSelect){view.active=button.dataset.habitSelect;draw();return;}
    if(button.dataset.habitFilter){view.filter=button.dataset.habitFilter;draw();return;}
    if(action==='habit-week-prev'||action==='habit-week-next'){view.week=Math.min(0,view.week+(action==='habit-week-prev'?-1:1));draw();return;}
    if(action==='habit-month-prev'||action==='habit-month-next'){
      const month=parseDate(view.month+'-01');month.setMonth(month.getMonth()+(action==='habit-month-prev'?-1:1));
      if(month.getFullYear()>=1900&&localDateKey(month).slice(0,7)<=localDateKey().slice(0,7))view.month=localDateKey(month).slice(0,7);draw();return;
    }
    if(button.dataset.habitDate&&button.dataset.habitDate<=localDateKey())return run(async()=>{
      const id=button.dataset.id,day=button.dataset.habitDate;
      const habits=current().data.habits.map(h=>h.id===id?{...h,dates:h.dates.includes(day)?h.dates.filter(d=>d!==day):[...h.dates,day].sort()}:h);
      await dataSave({habits});view.active=id;draw();
    });
    if(action==='habit-delete')return run(async()=>{const deleted=current().data.habits.find(h=>h.id===button.dataset.id);await dataSave({habits:current().data.habits.filter(h=>h.id!==button.dataset.id)});view.deleted=deleted;view.active='';draw();});
    if(action==='habit-undo'&&view.deleted)return run(async()=>{await dataSave({habits:[...current().data.habits,view.deleted]});view.active=view.deleted.id;view.deleted=null;draw();});
  }
  root.addEventListener('click',event=>{void click(event).catch(error=>feedback(error.message));},options);
  root.addEventListener('submit',event=>{
    const form=event.target;if(!form.dataset.lifeForm)return;event.preventDefault();event.stopPropagation();
    const values=new FormData(form),value=name=>String(values.get(name)||'').trim();
    void run(async()=>{
      if(form.dataset.lifeForm==='countdown'){
        const entries=countdownEntries(current()),id=form.dataset.id||uid();
        const entry={id,title:value('eventTitle'),date:value('date'),category:value('category'),repeat:value('repeat'),tone:value('tone'),pinned:values.has('pinned')};
        await dataSave({events:form.dataset.id?entries.map(e=>e.id===id?entry:e):[...entries,entry]});view.active=id;view.category='all';view.filter='all';closeEditor();draw();
      } else if(form.dataset.lifeForm==='workday'){
        await settingsSave(readWorkdayForm(values,current().config));feedback(t('设置已保存'));updatePreview();
      } else if(form.dataset.lifeForm==='clock')await saveCities([...clockCities(current().config),{label:value('label'),timeZone:value('timeZone')}]);
      else if(form.dataset.lifeForm==='habit-add')await addHabit(value('name'));
      else if(form.dataset.lifeForm==='habit-rename'){await dataSave({habits:current().data.habits.map(h=>h.id===form.dataset.id?{...h,name:value('name')}:h)});draw();}
    });
  },options);
  root.addEventListener('input',event=>{
    if(kind==='workday')updatePreview();
    if(event.target.matches('[data-widget-input=notes]'))content.querySelector('[data-note-count]').textContent=t('{count} 字符',{count:Array.from(event.target.value).length});
    if(event.target.hasAttribute('data-clock-offset')){view.offset=Number(event.target.value);tick();const reset=content.querySelector('[data-life-action=clock-now]');reset.disabled=view.offset===0;}
    if(event.target.hasAttribute('data-clock-search')){
      const query=event.target.value;editor.innerHTML=clockEditor(current(),query);const input=editor.querySelector('[data-clock-search]');input.focus();
    }
  },options);
  root.addEventListener('change',event=>{
    if(event.target.name==='noteTitle')void run(async()=>{await settingsSave({title:event.target.value.trim()});});
  },options);
  root.addEventListener('keydown',event=>{
    if(editing&&event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!busy)closeEditor();}
    if(editing&&event.key==='Tab'){
      const nodes=[...editor.querySelectorAll('button,input,select,summary')].filter(n=>!n.disabled&&n.getClientRects().length),first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    if(kind==='notes'&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void host.save().catch(error=>feedback(error.message));}
  },options);
  draw();
  if(kind==='notes')cleanupNotes=bindWidgets(root,{...host,openDialog:()=>{}});
  const timer=kind==='notes'?null:setInterval(tick,1000);
  return ()=>{controller.abort();clearTimeout(feedbackTimer);clearInterval(timer);return cleanupNotes();};
}
