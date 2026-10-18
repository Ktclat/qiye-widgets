// SPDX-License-Identifier: GPL-3.0-only
// Civil dates and IANA time zones stay separate from elapsed timer durations.
import { t } from './i18n.js';
import { dayStamp, localDateKey, parseDate } from './calendar.js';
import { keys, array, id, string, date, bool, enumeration, unique, invalid } from './validation.js';

const DAY = 86400000;
export const COUNTDOWN_CATEGORIES = [
  ['anniversary','纪念日','heart','#ff5370'], ['holiday','节日','gift','#ffb526'],
  ['life','生活','home','#a786ff'], ['work','工作','briefcase','#479aff'],
  ['goal','目标','target','#38c28a'], ['other','其他','flag','#8994a8'],
];
export const LIFE_TONES = ['blue','rose','amber','mint','violet'];
export const CLOCK_CITIES = [
  ['香港','Asia/Hong_Kong'],['北京','Asia/Shanghai'],['东京','Asia/Tokyo'],['新加坡','Asia/Singapore'],
  ['首尔','Asia/Seoul'],['孟买','Asia/Kolkata'],['迪拜','Asia/Dubai'],['悉尼','Australia/Sydney'],
  ['奥克兰','Pacific/Auckland'],['伦敦','Europe/London'],['巴黎','Europe/Paris'],['柏林','Europe/Berlin'],
  ['纽约','America/New_York'],['旧金山','America/Los_Angeles'],['多伦多','America/Toronto'],['圣保罗','America/Sao_Paulo'],['UTC','UTC'],
];
export const WORKDAY_COLORS = ['#273a52','#23272e','#3b4e40','#5d4642','#514365','#376375','#ece8df'];
export const WORKDAY_FONTS = ['system','mono','serif'];

export function countdownEntries(item) {
  return item.data.events ?? [{id:'primary',title:item.config.title,date:item.config.date,category:'anniversary',repeat:'none',pinned:true,tone:'blue'}];
}
export function validateCountdownData(raw, path) {
  keys(raw,['events'],path);
  if (raw.events===undefined) return {};
  const events=array(raw.events,path+'.events',100).map((entry,index)=>{
    const at=path+'.events['+index+']';
    keys(entry,['id','title','date','category','repeat','pinned','tone'],at);
    return {id:id(entry.id,at+'.id'),title:string(entry.title,at+'.title',120),date:date(entry.date,at+'.date'),
      category:enumeration(entry.category,COUNTDOWN_CATEGORIES.map(c=>c[0]),at+'.category'),repeat:enumeration(entry.repeat,['none','yearly','monthly'],at+'.repeat'),
      pinned:bool(entry.pinned,at+'.pinned'),tone:enumeration(entry.tone,LIFE_TONES,at+'.tone')};
  });
  unique(events.map(event=>event.id),path+'.events');
  return {events};
}
function civilDate(year,month,day) { return new Date(year,month,Math.min(day,new Date(year,month+1,0).getDate()),12); }
export function countdownOccurrence(entry, now=new Date()) {
  const original=parseDate(entry.date);
  if (!original) return null;
  let occurrence=original;
  // Recurrence never moves an event before the date the user entered.
  if (dayStamp(original)<dayStamp(now) && entry.repeat==='yearly') {
    occurrence=civilDate(now.getFullYear(),original.getMonth(),original.getDate());
    if(dayStamp(occurrence)<dayStamp(now))occurrence=civilDate(now.getFullYear()+1,original.getMonth(),original.getDate());
  } else if(dayStamp(original)<dayStamp(now) && entry.repeat==='monthly') {
    occurrence=civilDate(now.getFullYear(),now.getMonth(),original.getDate());
    if(dayStamp(occurrence)<dayStamp(now))occurrence=civilDate(now.getFullYear(),now.getMonth()+1,original.getDate());
  }
  return {date:occurrence,key:localDateKey(occurrence),days:Math.round((dayStamp(occurrence)-dayStamp(now))/DAY)};
}
export function orderedCountdowns(item, now=new Date()) {
  return countdownEntries(item).map(event=>({...event,occurrence:countdownOccurrence(event,now)})).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||Math.abs(a.occurrence.days)-Math.abs(b.occurrence.days));
}
export function countdownPrimary(item, now=new Date()) { return orderedCountdowns(item,now)[0] || null; }

export function workdayTimeline(config, now=new Date()) {
  const toMinutes=value=>{const [h,m]=value.split(':').map(Number);return h*60+m;};
  const startMinutes=toMinutes(config.startTime||'09:00'),endMinutes=toMinutes(config.endTime||'18:00');
  const days=config.workdays||[1,2,3,4,5], overnight=endMinutes<=startMinutes;
  const at=(base,minute)=>new Date(base.getFullYear(),base.getMonth(),base.getDate(),Math.floor(minute/60),minute%60);
  let base=new Date(now),start=at(base,startMinutes),end=at(base,endMinutes);
  if(overnight) {
    if(now.getHours()*60+now.getMinutes()<endMinutes)base.setDate(base.getDate()-1);
    start=at(base,startMinutes);end=at(base,endMinutes);end.setDate(end.getDate()+1);
  }
  const isWorkday=days.includes(base.getDay());
  const phase=!isWorkday?'rest':now<start?'before':now<end?'working':'finished';
  const seconds=Math.max(0,Math.ceil(((phase==='before'?start:end)-now)/1000));
  const duration=Math.max(1,end-start),progress=!isWorkday?0:Math.min(1,Math.max(0,(now-start)/duration));
  const time=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
  const payday=Math.min(31,Math.max(1,config.payday||10));
  let payDate=civilDate(now.getFullYear(),now.getMonth(),payday);
  if(dayStamp(payDate)<dayStamp(now))payDate=civilDate(now.getFullYear(),now.getMonth()+1,payday);
  const friday=(5-now.getDay()+7)%7;
  return {phase,isWorkday,remaining:seconds,progress,start,end,friday,earnings:(config.dailyIncome||0)*progress,
    text:phase==='rest'?t('休息日'):phase==='finished'?t('已下班'):time,
    caption:t(phase==='rest'?'今天，把时间留给生活':phase==='finished'?'今天辛苦了，好好休息':phase==='before'?'距离上班还有':'距离下班还有'),
    paydays:Math.round((dayStamp(payDate)-dayStamp(now))/DAY)};
}

const zoneFormatters=new Map();
export function zoneClock(timeZone, now=new Date(), localZone=Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const partsFor=zone=>{
    if(!zoneFormatters.has(zone)){
      if(zoneFormatters.size>=100)zoneFormatters.delete(zoneFormatters.keys().next().value);
      zoneFormatters.set(zone,new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
    }
    return Object.fromEntries(zoneFormatters.get(zone).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  };
  const p=partsFor(timeZone),local=partsFor(localZone);
  const stamp=q=>Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute,q.second);
  const offset=Math.round((stamp(p)-Math.floor(now.getTime()/1000)*1000)/60000),difference=Math.round((stamp(p)-stamp(local))/60000);
  const dayDifference=Math.round((Date.UTC(p.year,p.month-1,p.day)-Date.UTC(local.year,local.month-1,local.day))/DAY);
  return {...p,offset,difference,dayDifference,isDay:p.hour>=6&&p.hour<18,time:`${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`,
    secondHand:p.second*6,minuteHand:p.minute*6+p.second/10,hourHand:(p.hour%12)*30+p.minute/2};
}
export function offsetLabel(minutes, prefix='UTC') {
  if(!minutes)return prefix;
  return prefix+(minutes<0?'−':'+')+String(Math.floor(Math.abs(minutes)/60)).padStart(2,'0')+':'+String(Math.abs(minutes)%60).padStart(2,'0');
}
export function clockCities(config) {
  return config.cities ?? [{label:config.label,timeZone:config.timeZone},...['Europe/London','America/New_York','Asia/Tokyo'].filter(zone=>zone!==config.timeZone).map(timeZone=>({label:t(CLOCK_CITIES.find(c=>c[1]===timeZone)[0]),timeZone}))];
}
export function validateClockCities(raw,path) {
  const cities=array(raw,path,12,1).map((city,i)=>{
    const at=path+'['+i+']';keys(city,['label','timeZone'],at);
    const timeZone=string(city.timeZone,at+'.timeZone',80);
    try{new Intl.DateTimeFormat('en',{timeZone}).format();}catch{invalid(at+'.timeZone',t('不是有效时区'));}
    return {label:string(city.label,at+'.label',60),timeZone};
  });unique(cities.map(c=>c.timeZone),path);return cities;
}
export function habitStats(habit, now=new Date()) {
  const today=localDateKey(now),dates=[...new Set(habit.dates)].filter(day=>day<=today).sort(),set=new Set(dates);
  let current=0,cursor=new Date(now),longest=0,run=0,previous=null;
  if(!set.has(today))cursor.setDate(cursor.getDate()-1);
  while(set.has(localDateKey(cursor))){current++;cursor.setDate(cursor.getDate()-1);}
  for(const day of dates){const stamp=dayStamp(parseDate(day));run=previous!==null&&stamp-previous===DAY?run+1:1;longest=Math.max(longest,run);previous=stamp;}
  return {current,longest,total:dates.length,done:set.has(today)};
}
export function habitWeek(offset=0, now=new Date()) {
  const monday=new Date(now);monday.setDate(monday.getDate()-(monday.getDay()+6)%7+offset*7);
  return Array.from({length:7},(_,i)=>{const day=new Date(monday);day.setDate(day.getDate()+i);return {date:day,key:localDateKey(day),future:dayStamp(day)>dayStamp(now)};});
}
