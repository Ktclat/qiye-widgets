// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { countdownEntries, countdownOccurrence, countdownPrimary, workdayTimeline, zoneClock, habitStats, habitWeek } from '../src/widget-life.js';
import { validateWidgetData } from '../src/widget-data.js';
import { validateWidgetConfig, newWidgetConfig } from '../src/widget-registry.js';
import { countdownBrowser, habitDesk, worldClockDesk } from '../src/widget-life-view.js';

const event={id:'birthday',title:'Birthday',date:'2024-02-29',category:'anniversary',repeat:'yearly',pinned:true,tone:'blue'};
test('countdown retains legacy configuration, explicit empty lists, and validated private events',()=>{
  const item={config:{title:'New year',date:'2027-01-01'},data:{}};
  assert.equal(countdownEntries(item)[0].title,'New year');
  assert.deepEqual(validateWidgetData('countdown',{},'data'),{});
  assert.deepEqual(validateWidgetData('countdown',{events:[event]},'data'),{events:[event]});
  item.data.events=[];assert.equal(countdownPrimary(item),null);
  assert.throws(()=>validateWidgetData('countdown',{events:[{...event,date:'2025-02-29'}]},'data'));
  assert.throws(()=>validateWidgetData('countdown',{events:[event,event]},'data'));
  assert.throws(()=>validateWidgetData('countdown',{events:[{...event,tone:'url(x)'}]},'data'));
});
test('recurring countdowns clamp leap days and month ends without losing the original anniversary',()=>{
  assert.equal(countdownOccurrence(event,new Date(2025,1,27)).key,'2025-02-28');
  assert.equal(countdownOccurrence(event,new Date(2028,1,28)).days,1);
  assert.equal(countdownOccurrence(event,new Date(2025,2,1)).key,'2026-02-28');
  assert.equal(countdownOccurrence({...event,date:'2026-01-31',repeat:'monthly'},new Date(2026,1,1)).key,'2026-02-28');
  assert.equal(countdownOccurrence({...event,date:'2026-01-31',repeat:'monthly'},new Date(2026,2,1)).key,'2026-03-31');
  assert.equal(countdownOccurrence({...event,date:'2027-01-01'},new Date(2026,9,15)).key,'2027-01-01');
  assert.equal(countdownOccurrence({...event,date:'2026-03-09',repeat:'none'},new Date(2026,2,8,23,59)).days,1);
});
test('work shifts distinguish before, working, finished, off days and overnight work',()=>{
  const config={startTime:'09:00',endTime:'18:00',payday:31,workdays:[1,2,3,4,5],dailyIncome:900};
  assert.equal(workdayTimeline(config,new Date(2026,9,15,8,30)).phase,'before');
  assert.equal(workdayTimeline(config,new Date(2026,9,15,8,30)).text,'00:30:00');
  const half=workdayTimeline(config,new Date(2026,9,15,13,30));assert.equal(half.progress,.5);assert.equal(half.earnings,450);
  assert.equal(workdayTimeline(config,new Date(2026,9,15,18)).phase,'finished');
  const night={...config,startTime:'22:00',endTime:'06:00',workdays:[5]};
  assert.equal(workdayTimeline(night,new Date(2026,9,17,2)).phase,'working');
  assert.equal(workdayTimeline(night,new Date(2026,9,17,2)).text,'04:00:00');
  assert.equal(workdayTimeline({...config,workdays:[]},new Date(2026,9,15,12)).phase,'rest');
});
test('world clock uses IANA daylight saving, half-hour offsets and local date boundaries',()=>{
  const winter=zoneClock('America/New_York',new Date('2026-01-15T12:00:00Z'),'Asia/Hong_Kong');
  const summer=zoneClock('America/New_York',new Date('2026-07-15T12:00:00Z'),'Asia/Hong_Kong');
  assert.equal(winter.offset,-300);assert.equal(summer.offset,-240);
  const india=zoneClock('Asia/Kolkata',new Date('2026-10-15T18:45:00Z'),'UTC');
  assert.equal(india.time,'00:15');assert.equal(india.offset,330);assert.equal(india.dayDifference,1);
  assert.equal(india.difference,330);assert.equal(india.isDay,false);
  assert.throws(()=>zoneClock('Invalid/City'));
});
test('new config fields round trip without changing legacy data, while invalid choices are rejected',()=>{
  for(const type of ['clock','workday'])assert.deepEqual(validateWidgetConfig(type,newWidgetConfig(type)),newWidgetConfig(type));
  const clock={...newWidgetConfig('clock'),cities:[{label:'Mumbai',timeZone:'Asia/Kolkata'}]};
  assert.deepEqual(validateWidgetConfig('clock',clock).cities,clock.cities);
  assert.throws(()=>validateWidgetConfig('clock',{...clock,cities:[]}));
  assert.throws(()=>validateWidgetConfig('clock',{...clock,cities:[...clock.cities,...clock.cities]}));
  const shift={...newWidgetConfig('workday'),startTime:'22:00',style:'ring',background:'#273a52',font:'mono',showPayday:false,showFriday:true,showEarnings:true,dailyIncome:900};
  assert.deepEqual(validateWidgetConfig('workday',shift),shift);
  assert.throws(()=>validateWidgetConfig('workday',{...shift,dailyIncome:-1}));
});
test('habit history computes current and longest streaks and forbids future week controls',()=>{
  const now=new Date(2026,9,15,12),habit={id:'read',name:'Read',dates:['2026-10-11','2026-10-12','2026-10-13','2026-10-14','2026-10-20']};
  assert.deepEqual(habitStats(habit,now),{current:4,longest:4,total:4,done:false});
  assert.equal(habitStats({...habit,dates:[...habit.dates,'2026-10-15']},now).current,5);
  assert.equal(habitStats({...habit,dates:['2026-10-11','2026-10-12']},now).current,0);
  assert.equal(habitWeek(0,now)[0].key,'2026-10-12');assert.equal(habitWeek(0,now)[4].future,true);
});
test('dedicated workspaces escape user text and render the right calendar day controls',()=>{
  const title='<img src=x onerror=alert(1)>',item={id:'test',title,config:newWidgetConfig('countdown'),data:{events:[{...event,title}]}};
  assert.ok(countdownBrowser(item,{active:'birthday',category:'all',filter:'all'}).includes('&lt;img'));
  const habits=habitDesk({...item,data:{habits:[{id:'h',name:title,dates:[]}]}},{active:'h',week:0,month:'2026-10',filter:'all'},new Date(2026,9,15));
  assert.ok(habits.includes('&lt;img'));assert.match(habits,/data-habit-date="2026-10-16"[^>]*disabled/);
  const clock=worldClockDesk({...item,config:{...newWidgetConfig('clock'),label:title}},{offset:0});
  assert.ok(clock.includes('&lt;img'));assert.ok(!clock.includes('<img src=x'));
});
