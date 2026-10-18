// SPDX-License-Identifier: GPL-3.0-only
import { MAP_DEFAULTS, validateMapConfig } from './map-model.js';
import { POMODORO_DEFAULTS, validatePomodoroConfig } from './pomodoro.js';
import { t, localizeSeed } from './i18n.js';
import { WORKDAY_COLORS, WORKDAY_FONTS, validateClockCities } from './widget-life.js';
import { keys, string, number, bool, enumeration, array, unique, date, time, invalid } from './validation.js';
import { TILE_SIZES, REQUIRED_WIDGET_SIZES } from './widget-sizes.js';
import { widgetExtensions } from './widget-extensions.js';
import { validateCommunityManifest } from './community-format.js';
import { publicHttpsUrl } from './public-json.js';
import { HOTSEARCH_DEFAULTS, validateHotsearchConfig } from './hotsearch-sources.js';

const builtins = [
  { type: 'codec', title: '编码工具', description: 'Base64、URL、Unicode 编解码，MD2 / MD4 / MD5、SHA 摘要，佛曰、兽语 / 兽音译者、熊曰 / 与熊论道', size: '2x2', icon: 'code' },
  { type: 'map', title: '地图', description: '探索大陆、港澳台，切换高德与多个地图源，收藏地点与打开导航', size: '4x2', icon: 'map' },
  { type: 'bookmarks', title: '书签', description: '分层整理独立收藏，授权后管理浏览器书签', size: '4x2', icon: 'bookmark' },
  { type: 'wallpaper', title: '在线壁纸', description: '浏览公开摄影图库，一键设为壁纸', size: '4x2', icon: 'image' },
  { type: 'weather', title: '天气', description: '启用后显示城市的实时天气', size: '2x2', icon: 'cloud' },
  { type: 'calendar', title: '日历', description: '公历月份与中国农历', size: '4x2', icon: 'calendar' },
  { type: 'memo', title: '备忘录', description: '多条笔记、搜索、置顶与自动保存', size: '2x2', icon: 'note' },
  { type: 'notes', title: '便签', description: '随手记录，自动保存到本机', size: '2x2', icon: 'note' },
  { type: 'todo', title: '待办清单', description: '添加、勾选和删除日常任务', size: '2x2', icon: 'check' },
  { type: 'countdown', title: '倒数日', description: '记住值得期待的日子', size: '2x2', icon: 'flag' },
  // Validation only: existing focus timers upgrade to Pomodoro on load/import.
  { type: 'focus', title: '专注计时', description: '可暂停的番茄钟，关闭页面继续计时', size: '2x2', icon: 'timer', internal: true },
  { type: 'pomodoro', title: '番茄钟', description: '一颗番茄，一件事。专注与休息交替，收获每天的小小成果', size: '2x2', icon: 'tomato' },
  { type: 'workday', title: '下班倒计时', description: '工作日下班与发薪日倒计时', size: '2x2', icon: 'briefcase' },
  { type: 'quote', title: '每日一句', description: '给日常留一点思考的空白', size: '4x2', icon: 'quote' },
  // Kept for validating old desktops and backups; the catalog offers its replacement.
  { type: 'hotlinks', title: '热搜入口', description: '直达各平台的热门内容页面', size: '4x2', icon: 'trending', internal: true },
  { type: 'hotsearch', title: '热搜榜', description: '订阅全网热榜，分类浏览与实时更新', size: '4x2', icon: 'trending' },
  { type: 'calculator', title: '计算器', description: '加减乘除、括号和百分比计算', size: '2x2', icon: 'calculator', internal: true },
  { type: 'converter', title: '换算器', description: '计算器、进制转换、货币汇率、BMI、日期与时间，以及长度、面积、质量、体积、温度、角度、力等常用单位换算', size: '2x2', icon: 'converter' },
  { type: 'base-converter', title: '进制转换', description: '2–36 进制实时互转，同时查看多个结果，支持大整数与小数', size: '4x2', icon: 'code', internal: true },
  { type: 'habit', title: '习惯打卡', description: '每日打卡和连续天数', size: '2x2', icon: 'sparkles' },
  { type: 'clock', title: '世界时钟', description: '查看城市时间与时差', size: '2x2', icon: 'globe' },
];

export const WIDGET_API_VERSION = 3;
const fieldTypes = ['text', 'number', 'select', 'checkbox'];
const builtinConfig = {
  map: MAP_DEFAULTS,
  bookmarks: { source: 'local' },
  pomodoro: POMODORO_DEFAULTS,
  hotsearch: HOTSEARCH_DEFAULTS,
  calendar: { weekStart: 0, showLunar: true, holidays: 'CN' },
  weather: { city: { name: '香港', latitude: 22.32, longitude: 114.17 }, enabled: false, unit: 'celsius', source: 'auto', fallback: true },
  countdown: { title: '新年，新的期待', date: '2027-01-01' },
  workday: { endTime: '18:00', payday: 10, workdays: [1, 2, 3, 4, 5] },
  clock: { timeZone: 'Asia/Hong_Kong', label: '香港' },
  quote: { text: '', author: '', quoteIndex: 0 },
  notes: { color: 'yellow' },
};

function fieldValue(field, value, path) {
  if (field.type === 'text') return string(value, path, field.maxLength ?? 1000, !field.required);
  if (field.type === 'number') return number(value, path, field.min ?? -1000000, field.max ?? 1000000, field.integer === true);
  if (field.type === 'checkbox') return bool(value, path);
  return enumeration(value, field.options.map(option => option.value), path);
}

export function createWidgetRegistry(extensions = []) {
  const definitions = new Map(builtins.map(entry => [entry.type, Object.freeze({ ...entry, builtin: true, sizes: TILE_SIZES })]));
  definitions.set('community',Object.freeze({type:'community',title:'社区组件',description:'作者提供的独立网页组件',size:'2x2',icon:'globe',builtin:true,internal:true,sizes:TILE_SIZES}));
  for (const source of extensions) {
    const entry = { ...source };
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(entry.type) || ['constructor', 'prototype'].includes(entry.type)) throw new Error(t("组件 type 必须是小写字母、数字或连字符"));
    if (definitions.has(entry.type)) throw new Error(`${t("组件重复注册：{v0}", {v0: entry.type})}`);
    if (entry.apiVersion !== WIDGET_API_VERSION) throw new Error(`${t("组件 {v0} 的 API 版本不受支持", {v0: entry.type})}`);
    for (const key of ['title', 'description']) string(entry[key], `widget.${key}`, 160);
    if (typeof entry.render !== 'function') throw new Error(`${t("组件 {v0} 缺少 render", {v0: entry.type})}`);
    for (const hook of ['mount', 'update']) if (entry[hook] !== undefined && typeof entry[hook] !== 'function') throw new Error(`${t("组件 {v0} 的 {v1} 必须是函数", {v0: entry.type, v1: hook})}`);
    entry.sizes = Object.freeze([...(entry.sizes || REQUIRED_WIDGET_SIZES)]);
    if (entry.sizes.some(size => !TILE_SIZES.includes(size)) || REQUIRED_WIDGET_SIZES.some(size => !entry.sizes.includes(size))) throw new Error(t('组件必须支持 1x1 和 2x2，其他尺寸可选'));
    unique(entry.sizes, 'widget.sizes');
    entry.size ||= '2x2';
    if (!entry.sizes.includes(entry.size)) throw new Error(t("组件默认尺寸不在 sizes 中"));
    entry.fields = Object.freeze((entry.fields || []).map(field => {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(field.key) || ['constructor', 'prototype', '__proto__'].includes(field.key)) throw new Error(t("组件配置字段无效"));
      enumeration(field.type, fieldTypes, `${entry.type}.${field.key}.type`);
      string(field.label, `${entry.type}.${field.key}.label`, 80);
      const copy = { ...field };
      if (field.type === 'select') {
        copy.options = Object.freeze(array(field.options, 'field.options', 40, 1).map(option => Object.freeze({ value: string(option.value, 'option.value', 80, true), label: string(option.label, 'option.label', 80) })));
        unique(copy.options.map(option => option.value), 'field.options');
      }
      if (field.type === 'text' && field.maxLength !== undefined) number(field.maxLength, 'field.maxLength', 1, 100000, true);
      if (field.type === 'number') {
        number(field.min ?? -1000000, 'field.min', -1e12, 1e12);
        number(field.max ?? 1000000, 'field.max', field.min ?? -1000000, 1e12);
      }
      fieldValue(copy, field.default, `${entry.type}.${field.key}.default`);
      return Object.freeze(copy);
    }));
    unique(entry.fields.map(field => field.key), `${entry.type}.fields`);
    entry.builtin = false;
    definitions.set(entry.type, Object.freeze(entry));
  }
  const list = Object.freeze([...definitions.values()].filter(entry=>!entry.internal));
  return Object.freeze({
    get: type => definitions.get(type),
    list: () => list,
    newConfig(type) {
      const definition = definitions.get(type);
      if (!definition) invalid('widget', `${t("未知组件 {v0}", {v0: type})}`);
      return localizeSeed(definition.builtin ? builtinConfig[type] || {} : Object.fromEntries(definition.fields.map(field => [field.key, field.default])));
    },
    validateConfig(type, raw, path = 'config') {
      const definition = definitions.get(type);
      if (!definition) invalid(path, `${t("未知组件 {v0}", {v0: type})}`);
      if (definition.builtin) return validateBuiltinConfig(type, raw, path);
      keys(raw, definition.fields.map(field => field.key), path);
      return Object.fromEntries(definition.fields.map(field => [field.key, fieldValue(field, raw[field.key], `${path}.${field.key}`)]));
    },
  });
}

const registry = createWidgetRegistry(widgetExtensions);
export function getWidgetDefinition(type) { return registry.get(type); }
export function listWidgetDefinitions() { return registry.list(); }
export function newWidgetConfig(type) { return registry.newConfig(type); }
export function validateWidgetConfig(type, raw, path) { return registry.validateConfig(type, raw, path); }

function validateBuiltinConfig(widgetType, raw, path) {
  if (widgetType === 'map') return validateMapConfig(raw, path);
  if (widgetType === 'pomodoro') return validatePomodoroConfig(raw, path);
  if (widgetType === 'hotsearch') return validateHotsearchConfig(raw, path);
  if(widgetType==='community'){
    keys(raw,['manifest','source'],path);
    return {manifest:validateCommunityManifest(raw.manifest),source:publicHttpsUrl(string(raw.source,path+'.source',2048))};
  }
  const optional = widgetType==='workday'?['startTime','style','background','font','showPayday','showFriday','showEarnings','dailyIncome']:widgetType==='clock'?['cities']:[];
  const v = keys(raw, [...Object.keys(builtinConfig[widgetType] || {}),...optional], path);
  const out = {};
  if (widgetType === 'bookmarks') out.source = enumeration(v.source, ['local','browser'], `${path}.source`);
  if (widgetType === 'calendar') {
    out.weekStart = enumeration(v.weekStart, [0,1], `${path}.weekStart`);
    out.showLunar = bool(v.showLunar, `${path}.showLunar`);
    out.holidays = enumeration(v.holidays, ['none','CN'], `${path}.holidays`);
  }
  if (widgetType === 'weather') {
    keys(v.city, ['name','latitude','longitude','countryCode'], `${path}.city`);
    out.city = {name:string(v.city.name, `${path}.city.name`, 60), latitude:number(v.city.latitude, `${path}.city.latitude`, -90,90), longitude:number(v.city.longitude, `${path}.city.longitude`, -180,180)};
    out.enabled = bool(v.enabled, `${path}.enabled`);
    out.unit = enumeration(v.unit, ['celsius','fahrenheit'], `${path}.unit`);
    out.source = enumeration(v.source ?? 'auto', ['auto','openmeteo','qweather','hko','cwa','smg'], `${path}.source`);
    out.fallback = v.fallback === undefined ? true : bool(v.fallback, `${path}.fallback`);
    if(v.city.countryCode !== undefined) {
      if(!/^[A-Z]{2}$/.test(v.city.countryCode)) invalid(`${path}.city.countryCode`, t('地区代码无效。'));
      out.city.countryCode=v.city.countryCode;
    }
  }
  if (widgetType === 'countdown') {
    out.title = string(v.title, `${path}.title`, 120);
    out.date = date(v.date, `${path}.date`);
  }
  if (widgetType === 'workday') {
    if(v.startTime!==undefined)out.startTime=time(v.startTime,`${path}.startTime`);
    if(v.style!==undefined)out.style=enumeration(v.style,['digital','ring','simple'],`${path}.style`);
    if(v.background!==undefined)out.background=enumeration(v.background,WORKDAY_COLORS,`${path}.background`);
    if(v.font!==undefined)out.font=enumeration(v.font,WORKDAY_FONTS,`${path}.font`);
    for(const key of ['showPayday','showFriday','showEarnings'])if(v[key]!==undefined)out[key]=bool(v[key],`${path}.${key}`);
    if(v.dailyIncome!==undefined)out.dailyIncome=number(v.dailyIncome,`${path}.dailyIncome`,0,10000000);
    out.endTime = time(v.endTime, `${path}.endTime`);
    out.payday = number(v.payday, `${path}.payday`, 1, 31, true);
    out.workdays = array(v.workdays, `${path}.workdays`, 7).map(day => number(day, `${path}.workdays`, 0, 6, true));
    unique(out.workdays, `${path}.workdays`);
  }
  if (widgetType === 'clock') {
    if(v.cities!==undefined)out.cities=validateClockCities(v.cities,`${path}.cities`);
    out.timeZone = string(v.timeZone, `${path}.timeZone`, 80);
    try { new Intl.DateTimeFormat('en', { timeZone: out.timeZone }).format(); } catch { invalid(`${path}.timeZone`, t("不是有效时区")); }
    out.label = string(v.label, `${path}.label`, 60);
  }
  if (widgetType === 'quote') {
    out.text = string(v.text, `${path}.text`, 1000, true);
    out.author = string(v.author, `${path}.author`, 120, true);
    out.quoteIndex = number(v.quoteIndex, `${path}.quoteIndex`, 0, 1000000, true);
  }
  if (widgetType === 'notes') out.color = enumeration(v.color, ['yellow', 'pink', 'mint'], `${path}.color`);
  return out;
}

