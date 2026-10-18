// Migration test fixture from qiye@018b3b1. Never shipped in widget artifacts.
// SPDX-License-Identifier: GPL-3.0-only
import { WINDOW_SIZES } from '../../src/window-layout.js';
import { TILE_SIZES } from '../../src/widget-sizes.js';
import { t, localizeSeed } from '../../src/i18n.js';
import { invalid, plain, keys, string, id, number, bool, enumeration, array, color, opaqueColor, unique, byteLength } from '../../src/validation.js';
import { getWidgetDefinition, newWidgetConfig, validateWidgetConfig } from '../../src/widget-registry.js';
import { newWidgetData, validateWidgetData } from '../../src/widget-data.js';
import { migrateFocusTimer } from '../../src/pomodoro.js';
import { normalizeWallpaperPhoto } from '../../src/wallpapers.js';
import { validateAvatarDataUrl } from '../../src/avatar.js';
import { normalizeIconSelection } from '../../src/icon-selection.js';

/**
 * Shared, dependency-free storage boundary for every Qiye extension surface.
 * User text remains text: callers must render it using textContent or escape it.
 * URL fields, imported object shape, size limits and references are checked here.
 */

export const SCHEMA_VERSION = 5;
export const STORAGE_KEY = `qiye.state.v${SCHEMA_VERSION}`;
export const MAX_BACKUP_BYTES = 6 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

const LIMITS = Object.freeze({ groups: 30, items: 1200 });
const SIZES = new Set(TILE_SIZES);
const BASE_ENGINES = [
  { id: 'bing', name: '必应', letter: 'b', color: '#0EA5A6', url: 'https://www.bing.com/search?q={q}' },
  { id: 'baidu', name: '百度', letter: '百', color: '#3866F5', url: 'https://www.baidu.com/s?wd={q}' },
  { id: 'google', name: 'Google', letter: 'G', color: '#4285F4', url: 'https://www.google.com/search?q={q}' },
  { id: 'duckduckgo', name: 'DuckDuckGo', letter: 'D', color: '#E66A39', url: 'https://duckduckgo.com/?q={q}' },
  { id: 'bilibili', name: '哔哩哔哩', letter: '哔', color: '#F58DB0', url: 'https://search.bilibili.com/all?keyword={q}' }
];

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const ENGINES = deepFreeze(BASE_ENGINES);

function link(id, groupId, title, url, icon, color, folderId = null, iconMode = 'auto') {
  return { id, groupId, type: 'link', title, url, icon, iconMode, color, size: '1x1', folderId };
}

function widget(id, widgetType, title, size = '2x2', config = {}, groupId = 'home', data = newWidgetData(widgetType)) {
  return { id, groupId, type: 'widget', widget: widgetType, title, size, config: { ...newWidgetConfig(widgetType), ...config }, data };
}

export const DEFAULT_STATE = deepFreeze({
  schemaVersion: SCHEMA_VERSION,
  updatedAt: 0,
  settings: {
    language: 'auto', theme: 'dark', wallpaper: 'aurora', customWallpaper: null, customWallpaperType: 'image',
    blur: 0, dim: 14, showSeconds: false, hour12: false, pinClock: false, pinSearch: false, minimal: false, openNewTab: true,
    searchNewTab: true, rememberGroup: true, scrollGroups: true, sidebarWheelMode: 'scroll', hideScrollbar: false, hideEditorScrollbar: false,
    gridSize: 60, gap: 30, radius: 18, showLabels: true, clockSize: 70,
    sidebarWidth: 50, sidebarOpacity: 28, sidebarPosition: 'left', navigationMode: 'sidebar',
    sidebarVisibility: 'always', sidebarLabels: true, useThemeColor: false, avatar: null,
    toolbarVisibility: 'always', surfaceStyle: 'glass', surfaceOpacity: 72, surfaceBlur: 14,
    reducedEffects: false, animateGroups: true, uiFont: 'inter', uiScale: 100, windowSize: 100, settingsPresentation: 'sidebar', showWallpaperCredit: true, clockWeight: 400,
    clockOffsetX: 0, clockOffsetY: 0, searchOffsetX: 0, searchOffsetY: 0,
    searchWidth: 600, searchHeight: 46, searchOpacity: 65, searchRadius: 23,
    showSearchHistory: false, showWeekday: true, showLunar: true, showWallpaperButton: true,
    iconShape: 'original', iconBackdrop: 'none', autoExtractIcons: true,
    iconOpacity: 100, labelSize: 12, labelColor: '#ffffff', clockColor: '#ffffff',
    desktopMaxWidth: 1350, themeColor: '#79d7b4',
    showClock: true, showDate: true, showSearch: true, showAddTile: false,
    searchEngine: 'bing', customEngines: [], dailyWallpaper: false, quote: true,
    wallpaperApiEnabled: false, remoteWallpaper: null
  },
  activeGroupId: 'home',
  groups: [
    { id: 'home', name: '主页', icon: 'home' },
    { id: 'code', name: '编程', icon: 'code' },
    { id: 'design', name: '设计', icon: 'palette' },
    { id: 'work', name: '产品', icon: 'briefcase' },
    { id: 'ai', name: 'AI', icon: 'sparkles' },
    { id: 'life', name: '生活', icon: 'coffee' }
  ],
  items: [
    widget('weather-home', 'weather', '天气'),
    widget('calendar-home', 'calendar', '日历', '4x2'),
    widget('memo-home', 'memo', '备忘录'),
    link('site-google', 'home', 'Google', 'https://www.google.com/', 'G', '#FFFFFF'),
    link('site-bilibili', 'home', '哔哩哔哩', 'https://www.bilibili.com/', '哔', '#F18CAD'),
    link('site-github', 'home', 'GitHub', 'https://github.com/', 'github', '#24292F'),
    link('site-chatgpt', 'home', 'ChatGPT', 'https://chatgpt.com/', 'sparkles', '#10A37F'),
    widget('wallpaper-home', 'wallpaper', '发现壁纸', '4x2'),
    widget('notes-home', 'notes', '灵感便签', '2x2', { color: 'yellow' }, 'home', {
      notes: '把忽然想到的事，留在这一页。\n\n试试拖动卡片，让它成为你的日常。'
    }),
    widget('todo-home', 'todo', '今日待办', '2x2', {}, 'home', { todos: [
      { id: 'todo-explore', text: '换一张喜欢的壁纸', done: false },
      { id: 'todo-create', text: '添加一个常用网站', done: false },
      { id: 'todo-break', text: '给自己留一点休息时间', done: true }
    ] }),
    link('site-youtube', 'home', 'YouTube', 'https://www.youtube.com/', 'play', '#F44349'),
    link('site-zhihu', 'home', '知乎', 'https://www.zhihu.com/', '知', '#1677FF'),
    link('site-douban', 'home', '豆瓣', 'https://www.douban.com/', '豆', '#2DA854'),
    link('site-notion', 'home', 'Notion', 'https://www.notion.so/', 'N', '#F6F4F0'),
    widget('countdown-home', 'countdown', '下一份期待'),
    widget('focus-home', 'pomodoro', '番茄钟'),
    widget('workday-home', 'workday', '下班倒计时'),
    { id: 'folder-tools', groupId: 'home', type: 'folder', title: '随手工具', icon: 'folder', color: '#A6B1E1', size: '2x2' },
    link('tool-deepl', 'home', 'DeepL', 'https://www.deepl.com/translator', '译', '#234D68', 'folder-tools'),
    link('tool-figma', 'home', 'Figma', 'https://www.figma.com/', 'F', '#A259FF', 'folder-tools'),
    link('tool-unsplash', 'home', 'Unsplash', 'https://unsplash.com/', 'U', '#25282E', 'folder-tools'),
    link('tool-excalidraw', 'home', 'Excalidraw', 'https://excalidraw.com/', 'pen', '#8D8AEF', 'folder-tools'),
    link('work-mail', 'work', 'Gmail', 'https://mail.google.com/', 'mail', '#E96759'),
    link('work-outlook', 'work', 'Outlook', 'https://outlook.live.com/', 'mail', '#2483C6'),
    link('work-calendar', 'work', 'Google 日历', 'https://calendar.google.com/', 'calendar', '#4385EF'),
    link('work-drive', 'work', 'Google 云端硬盘', 'https://drive.google.com/', 'triangle', '#2FAC75'),
    widget('todo-work', 'todo', '工作清单', '2x2', {}, 'work'),
    widget('focus-work', 'pomodoro', '番茄钟', '2x2', {}, 'work'),
    link('code-mdn', 'code', 'MDN', 'https://developer.mozilla.org/zh-CN/', 'M', '#242933'),
    link('code-github', 'code', 'GitHub', 'https://github.com/', 'github', '#24292F'),
    link('code-stack', 'code', 'Stack Overflow', 'https://stackoverflow.com/', 'code', '#EF8A38'),
    link('code-npm', 'code', 'npm', 'https://www.npmjs.com/', 'npm', '#CB3837'),
    widget('notes-code', 'notes', '开发随记', '2x2', { color: 'mint' }, 'code'),
    widget('clock-code', 'clock', '世界时钟', '2x2', { timeZone: 'America/Los_Angeles', label: '旧金山' }, 'code'),
    link('design-figma', 'design', 'Figma', 'https://www.figma.com/', 'F', '#A259FF'),
    link('design-dribbble', 'design', 'Dribbble', 'https://dribbble.com/', 'D', '#EA4C89'),
    link('design-behance', 'design', 'Behance', 'https://www.behance.net/', 'Bē', '#1769FF'),
    link('design-unsplash', 'design', 'Unsplash', 'https://unsplash.com/', 'U', '#25282E'),
    link('design-excalidraw', 'design', 'Excalidraw', 'https://excalidraw.com/', 'pen', '#8D8AEF'),
    widget('notes-design', 'notes', '创意手记', '2x2', { color: 'pink' }, 'design'),
    link('ai-chatgpt', 'ai', 'ChatGPT', 'https://chatgpt.com/', 'sparkles', '#10A37F'),
    link('ai-claude', 'ai', 'Claude', 'https://claude.ai/', 'C', '#D97757'),
    link('ai-perplexity', 'ai', 'Perplexity', 'https://www.perplexity.ai/', 'P', '#20808D'),
    link('ai-deepseek', 'ai', 'DeepSeek', 'https://chat.deepseek.com/', 'D', '#4D6BFE'),
    link('ai-huggingface', 'ai', 'Hugging Face', 'https://huggingface.co/', '🤗', '#FFD21E'),
    widget('notes-ai', 'notes', '提示词手记', '2x2', { color: 'mint' }, 'ai'),
    link('life-music', 'life', '网易云音乐', 'https://music.163.com/', 'music', '#EB5757'),
    link('life-spotify', 'life', 'Spotify', 'https://open.spotify.com/', 'music', '#1DB954'),
    link('life-map', 'life', '高德地图', 'https://www.amap.com/', 'map', '#4D90FE'),
    link('life-douban', 'life', '豆瓣', 'https://www.douban.com/', '豆', '#2DA854'),
    widget('habit-life', 'habit', '小习惯', '2x2', {}, 'life', { habits: [
      { id: 'habit-water', name: '好好喝水', dates: [] },
      { id: 'habit-read', name: '读十分钟书', dates: [] }
    ] }),
    widget('quote-life', 'quote', '留一点空白', '2x2', {}, 'life'),
    widget('calculator-life', 'converter', '换算器', '2x2', {}, 'life')
  ]
});

export function createDefaultState() { return localizeSeed(DEFAULT_STATE); }

function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function uid() {
  if (globalThis.crypto?.randomUUID) return `qy_${globalThis.crypto.randomUUID().replaceAll('-', '')}`;
  return `qy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Accept complete HTTP(S) URLs or a bare domain. Credentials and controls are never allowed. */
export function safeUrl(input) {
  if (typeof input !== 'string') return null;
  let value = input.trim();
  if (!value || value.length > 4096 || /[\s\u0000-\u001f\u007f\\]/u.test(value)) return null;
  if (!/^https?:\/\//i.test(value)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
    if (value.startsWith('//')) value = `https:${value}`;
    else if (/^[^/?#]+\.[^/?#]+/.test(value)) value = `https://${value}`;
    else return null;
  }
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch { return null; }
}

function url(value, path) { const result = safeUrl(value); if (!result) invalid(path, t("只支持安全的 http / https 地址")); return result; }

function validateMedia(value, type) {
  if (value === null) return null;
  if (typeof value !== 'string' || !value.startsWith('data:')) invalid('settings.customWallpaper', t("本地媒体仅支持 data URL；在线壁纸请使用壁纸小组件"));
  const match = /^data:(image\/(?:png|jpeg|webp|gif|avif)|video\/(?:mp4|webm));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0 || match[2].length === 0) invalid('settings.customWallpaper', t("仅支持 PNG、JPEG、WebP、GIF、AVIF、MP4 或 WebM 的 base64 数据"));
  if ((type === 'video') !== match[1].startsWith('video/')) invalid('settings.customWallpaperType', t("与媒体数据类型不一致"));
  const decodedSize = (match[2].length / 4) * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  if (decodedSize > MAX_MEDIA_BYTES) invalid('settings.customWallpaper', t("媒体文件不能超过 4 MiB"));
  return value;
}

function validateSettings(raw) {
  const defaults = DEFAULT_STATE.settings;
  keys(raw, Object.keys(defaults), 'settings');
  const v = raw;
  const customEngines = array(v.customEngines, 'settings.customEngines', 12).map((engine, i) => {
    const path = `settings.customEngines[${i}]`;
    keys(engine, ['id', 'name', 'letter', 'color', 'url'], path);
    const engineId = id(engine.id, `${path}.id`);
    if (ENGINES.some(e => e.id === engineId)) invalid(`${path}.id`, t("不能覆盖内置搜索引擎"));
    const template = string(engine.url, `${path}.url`, 4096);
    if (!template.includes('{q}') || template.split('{q}').length > 3) invalid(`${path}.url`, t("必须包含搜索词占位符 {q}"));
    const checked = url(template.replaceAll('{q}', 'qiye-search-token'), `${path}.url`);
    if (!checked.includes('qiye-search-token')) invalid(`${path}.url`, t("搜索词占位符无效"));
    const name = string(engine.name, `${path}.name`, 40);
    return { id: engineId, name, letter: string(engine.letter, `${path}.letter`, 4), color: color(engine.color, `${path}.color`), url: template };
  });
  unique(customEngines.map(e => e.id), 'settings.customEngines');
  if (![...ENGINES, ...customEngines].some(e => e.id === v.searchEngine)) invalid('settings.searchEngine', t("找不到对应搜索引擎"));
  const remoteWallpaper = v.remoteWallpaper === null ? null : normalizeWallpaperPhoto(v.remoteWallpaper);
  if (v.remoteWallpaper !== null && !remoteWallpaper) invalid('settings.remoteWallpaper', t("在线壁纸来源不受支持，请从壁纸小组件重新选择"));
  const customWallpaperType = enumeration(v.customWallpaperType, ['image', 'video'], 'settings.customWallpaperType');
  let avatar = null;
  if (v.avatar !== null) {
    try { avatar = validateAvatarDataUrl(v.avatar); }
    catch (error) { invalid('settings.avatar', error.message); }
  }
  return {
    language: enumeration(v.language, ['auto', 'zh-CN', 'en'], 'settings.language'),
    theme: enumeration(v.theme, ['dark', 'light', 'auto'], 'settings.theme'),
    wallpaper: enumeration(v.wallpaper, ['aurora', 'sunset', 'ocean', 'forest', 'lavender', 'midnight'], 'settings.wallpaper'),
    customWallpaper: validateMedia(v.customWallpaper, customWallpaperType), customWallpaperType,
    blur: number(v.blur, 'settings.blur', 0, 40), dim: number(v.dim, 'settings.dim', 0, 90),
    showSeconds: bool(v.showSeconds, 'settings.showSeconds'), hour12: bool(v.hour12, 'settings.hour12'),
    pinClock: bool(v.pinClock, 'settings.pinClock'), pinSearch: bool(v.pinSearch, 'settings.pinSearch'),
    minimal: bool(v.minimal, 'settings.minimal'), openNewTab: bool(v.openNewTab, 'settings.openNewTab'),
    searchNewTab: bool(v.searchNewTab, 'settings.searchNewTab'),
    rememberGroup: bool(v.rememberGroup, 'settings.rememberGroup'), scrollGroups: bool(v.scrollGroups, 'settings.scrollGroups'),
    sidebarWheelMode: enumeration(v.sidebarWheelMode, ['scroll', 'switch'], 'settings.sidebarWheelMode'),
    hideScrollbar: bool(v.hideScrollbar, 'settings.hideScrollbar'),
    hideEditorScrollbar: bool(v.hideEditorScrollbar, 'settings.hideEditorScrollbar'),
    iconShape: enumeration(v.iconShape, ['rounded','original'], 'settings.iconShape'),
    iconBackdrop: enumeration(v.iconBackdrop, ['adaptive','none'], 'settings.iconBackdrop'),
    autoExtractIcons: bool(v.autoExtractIcons, 'settings.autoExtractIcons'),
    gridSize: number(v.gridSize, 'settings.gridSize', 48, 120), gap: number(v.gap, 'settings.gap', 8, 40),
    radius: number(v.radius, 'settings.radius', 0, 48), showLabels: bool(v.showLabels, 'settings.showLabels'),
    clockSize: number(v.clockSize, 'settings.clockSize', 30, 160), searchEngine: v.searchEngine, customEngines,
    sidebarWidth: number(v.sidebarWidth, 'settings.sidebarWidth', 40, 120),
    sidebarOpacity: number(v.sidebarOpacity, 'settings.sidebarOpacity', 0, 100),
    sidebarPosition: enumeration(v.sidebarPosition, ['left', 'right'], 'settings.sidebarPosition'),
    navigationMode: enumeration(v.navigationMode, ['sidebar', 'top'], 'settings.navigationMode'),
    sidebarVisibility: enumeration(v.sidebarVisibility, ['always', 'auto', 'hidden'], 'settings.sidebarVisibility'),
    sidebarLabels: bool(v.sidebarLabels, 'settings.sidebarLabels'), useThemeColor: bool(v.useThemeColor, 'settings.useThemeColor'), avatar,
    toolbarVisibility: enumeration(v.toolbarVisibility, ['always', 'auto'], 'settings.toolbarVisibility'),
    surfaceStyle: enumeration(v.surfaceStyle, ['solid', 'glass', 'acrylic', 'mica'], 'settings.surfaceStyle'),
    surfaceOpacity: number(v.surfaceOpacity, 'settings.surfaceOpacity', 20, 100),
    surfaceBlur: number(v.surfaceBlur, 'settings.surfaceBlur', 0, 24),
    reducedEffects: bool(v.reducedEffects, 'settings.reducedEffects'),
    animateGroups: bool(v.animateGroups, 'settings.animateGroups'),
    uiFont: enumeration(v.uiFont, ['inter', 'system'], 'settings.uiFont'),
    uiScale: number(v.uiScale, 'settings.uiScale', 85, 120),
    windowSize: enumeration(v.windowSize, WINDOW_SIZES, 'settings.windowSize'),
    settingsPresentation: enumeration(v.settingsPresentation, ['sidebar', 'window'], 'settings.settingsPresentation'),
    showWallpaperCredit: bool(v.showWallpaperCredit, 'settings.showWallpaperCredit'),
    clockWeight: number(v.clockWeight, 'settings.clockWeight', 200, 700),
    clockOffsetX: number(v.clockOffsetX, 'settings.clockOffsetX', -30, 30),
    clockOffsetY: number(v.clockOffsetY, 'settings.clockOffsetY', -60, 160),
    searchOffsetX: number(v.searchOffsetX, 'settings.searchOffsetX', -30, 30),
    searchOffsetY: number(v.searchOffsetY, 'settings.searchOffsetY', -40, 160),
    searchWidth: number(v.searchWidth, 'settings.searchWidth', 360, 960),
    searchHeight: number(v.searchHeight, 'settings.searchHeight', 36, 64),
    searchOpacity: number(v.searchOpacity, 'settings.searchOpacity', 20, 100),
    searchRadius: number(v.searchRadius, 'settings.searchRadius', 0, 50),
    showSearchHistory: bool(v.showSearchHistory, 'settings.showSearchHistory'),
    showWeekday: bool(v.showWeekday, 'settings.showWeekday'), showLunar: bool(v.showLunar, 'settings.showLunar'),
    showWallpaperButton: bool(v.showWallpaperButton, 'settings.showWallpaperButton'),
    iconOpacity: number(v.iconOpacity, 'settings.iconOpacity', 20, 100),
    labelSize: number(v.labelSize, 'settings.labelSize', 10, 20),
    labelColor: opaqueColor(v.labelColor, 'settings.labelColor'),
    clockColor: opaqueColor(v.clockColor, 'settings.clockColor'),
    desktopMaxWidth: number(v.desktopMaxWidth, 'settings.desktopMaxWidth', 720, 2000),
    themeColor: opaqueColor(v.themeColor, 'settings.themeColor'),
    showClock: bool(v.showClock, 'settings.showClock'), showDate: bool(v.showDate, 'settings.showDate'),
    showSearch: bool(v.showSearch, 'settings.showSearch'),
    showAddTile: bool(v.showAddTile, 'settings.showAddTile'),
    dailyWallpaper: bool(v.dailyWallpaper, 'settings.dailyWallpaper'), quote: bool(v.quote, 'settings.quote'),
    wallpaperApiEnabled: bool(v.wallpaperApiEnabled, 'settings.wallpaperApiEnabled'),
    remoteWallpaper
  };
}

/** Parse and validate before any storage mutation. Invalid records are never silently dropped. */
export function validateImport(raw) {
  let data;
  if (typeof raw === 'string') {
    if (raw.length > MAX_BACKUP_BYTES || byteLength(raw) > MAX_BACKUP_BYTES) invalid(t("备份"), t("文件不能超过 6 MiB"));
    try { data = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { invalid(t("备份"), t("不是有效 JSON 文件")); }
  } else {
    // Object callers include the live application. Serialization also rejects cycles.
    try {
      const serialized = JSON.stringify(raw);
      if (serialized === undefined || serialized.length > MAX_BACKUP_BYTES || byteLength(serialized) > MAX_BACKUP_BYTES) invalid(t("备份"), t("内容为空或超过 6 MiB"));
    } catch (error) {
      if (error?.message?.startsWith(t("数据校验失败"))) throw error;
      invalid(t("备份"), t("不能包含循环引用或无法保存的数据"));
    }
    data = raw;
  }
  plain(data, 'state');
  if (data.schemaVersion !== SCHEMA_VERSION) invalid('schemaVersion', `${t("仅支持当前数据格式（schemaVersion: {v0}）", {v0: SCHEMA_VERSION})}`);
  keys(data, Object.keys(DEFAULT_STATE), 'state');
  const settings = validateSettings(plain(data.settings, 'settings'));
  const groups = array(data.groups, 'groups', LIMITS.groups, 1).map((group, i) => {
    const path = `groups[${i}]`;
    keys(group, ['id', 'name', 'icon'], path);
    return { id: id(group.id, `${path}.id`), name: string(group.name, `${path}.name`, 40), icon: string(group.icon, `${path}.icon`, 40) };
  });
  unique(groups.map(g => g.id), 'groups');
  const groupIds = new Set(groups.map(g => g.id));
  const activeGroupId = id(data.activeGroupId, 'activeGroupId');
  if (!groupIds.has(activeGroupId)) invalid('activeGroupId', t("对应分组不存在"));
  const items = array(data.items, 'items', LIMITS.items).map((item, i) => {
    const path = `items[${i}]`;
    plain(item, path);
    const type = enumeration(item.type, ['link', 'folder', 'widget'], `${path}.type`);
    const allowed = type === 'link' ? ['id', 'groupId', 'type', 'title', 'url', 'icon', 'iconMode', 'iconUrl', 'color', 'size', 'folderId'] : type === 'folder' ? ['id', 'groupId', 'type', 'title', 'icon', 'color', 'size'] : ['id', 'groupId', 'type', 'widget', 'title', 'size', 'config', 'data'];
    keys(item, allowed, path);
    const groupId = id(item.groupId, `${path}.groupId`);
    if (!groupIds.has(groupId)) invalid(`${path}.groupId`, t("对应分组不存在"));
    const base = { id: id(item.id, `${path}.id`), groupId, type, title: string(item.title, `${path}.title`, 120) };
    const size = item.size;
    if (!SIZES.has(size)) invalid(`${path}.size`, t("卡片尺寸不受支持"));
    if (type === 'widget') {
      if (!getWidgetDefinition(item.widget)) invalid(`${path}.widget`, t("组件类型不受支持"));
      if (!getWidgetDefinition(item.widget).sizes.includes(size)) invalid(`${path}.size`, t("组件不支持此尺寸"));
      if(item.widget==='community'&&!item.config?.manifest?.sizes?.includes(size))invalid(`${path}.size`,t('组件不支持此尺寸'));
      const checked = { ...base, widget: item.widget, size, config: validateWidgetConfig(item.widget, item.config, `${path}.config`), data: validateWidgetData(item.widget, item.data, `${path}.data`) };
      // Validate legacy records before upgrading; keep identity, placement and custom names.
      if (checked.widget === 'focus') {
        Object.assign(checked, { widget: 'pomodoro' }, migrateFocusTimer(checked.data.focus));
        if (checked.title === '专注计时') checked.title = '番茄钟';
        else if (checked.title === 'Focus timer') checked.title = 'Pomodoro';
      }
      if (checked.widget === 'calculator') {
        checked.widget = 'converter';
        checked.data = newWidgetData('converter');
        if (['计算器','随手算'].includes(checked.title)) checked.title = '换算器';
        else if (['Calculator','Quick math','Quick calculations'].includes(checked.title)) checked.title = 'Converter';
      }
      if (checked.widget === 'base-converter') {
        checked.widget = 'converter';
        checked.data = { ...newWidgetData('converter'), category: 'radix', radix: checked.data };
        if (checked.title === '进制转换') checked.title = '换算器';
        else if (checked.title === 'Base converter') checked.title = 'Converter';
      }
      if (checked.widget === 'hotlinks') {
        checked.widget = 'hotsearch';
        checked.config = newWidgetConfig('hotsearch');
        if (checked.title === '热搜入口') checked.title = '热搜榜';
        else if (checked.title === 'Trending links') checked.title = 'Trending';
      }
      return checked;
    }
    const appearance = { icon: string(item.icon, `${path}.icon`, 80), color: color(item.color, `${path}.color`), size };
    if (type === 'folder') return { ...base, ...appearance };
    const iconMode = enumeration(item.iconMode, ['auto', 'text'], `${path}.iconMode`);
    const iconUrl = normalizeIconSelection(item.iconUrl);
    if (item.iconUrl !== undefined && item.iconUrl !== null && !iconUrl) invalid(`${path}.iconUrl`, t("需要安全的 HTTPS 图标地址或有效的本地静态图片"));
    return { ...base, url: url(item.url, `${path}.url`), ...appearance, iconMode, ...(iconUrl ? {iconUrl} : {}), folderId: item.folderId === null ? null : id(item.folderId, `${path}.folderId`) };
  });
  unique(items.map(item => item.id), 'items');
  const folderMap = new Map(items.filter(item => item.type === 'folder').map(item => [item.id, item]));
  for (const item of items) if (item.folderId !== undefined && item.folderId !== null) {
    const folder = folderMap.get(item.folderId);
    if (!folder || folder.groupId !== item.groupId) invalid(`items.${item.id}.folderId`, t("文件夹不存在或不属于同一分组"));
  }
  return {
    schemaVersion: SCHEMA_VERSION, updatedAt: number(data.updatedAt, 'updatedAt', 0, 8640000000000000),
    settings, activeGroupId, groups, items
  };
}

export function exportState(state) {
  const data = validateImport(state);
  const output = JSON.stringify(data, null, 2);
  if (byteLength(output) > MAX_BACKUP_BYTES) throw new Error(t("导出的备份超过 6 MiB；请先移除自定义壁纸后再导出。"));
  return output;
}

function hasExtensionStorage() { return !!globalThis.chrome?.storage?.local; }

function chromeCall(owner, method, ...args) {
  return new Promise((resolve, reject) => {
    try {
      const result = owner[method](...args, value => {
        const lastError = globalThis.chrome?.runtime?.lastError;
        if (lastError) reject(new Error(lastError.message || t("浏览器扩展操作失败")));
        else resolve(value);
      });
      if (result && typeof result.then === 'function') result.then(resolve, reject);
    } catch (error) { reject(error); }
  });
}

async function readStored() {
  if (hasExtensionStorage()) {
    const result = await chromeCall(globalThis.chrome.storage.local, 'get', STORAGE_KEY);
    return result?.[STORAGE_KEY];
  }
  if (!globalThis.localStorage) throw new Error(t("此环境无法访问本地存储。请在扩展或浏览器页面中打开栖页。"));
  const raw = globalThis.localStorage.getItem(STORAGE_KEY);
  return raw === null ? undefined : raw;
}

export async function loadState() {
  let stored;
  try { stored = await readStored(); } catch (error) { throw new Error(`${t("无法读取栖页数据：{v0}", {v0: error.message})}`); }
  if (stored === undefined) return createDefaultState();
  try { return validateImport(stored); } catch (error) { throw new Error(`${t("本地数据异常，原数据已保留。{v0}", {v0: error.message})}`); }
}

const subscribers = new Set();
let attachedListener = null;
let localQueue = Promise.resolve();
let lastEmitted = '';

function emitState(state) {
  const fingerprint = JSON.stringify(state);
  if (lastEmitted === fingerprint) return;
  lastEmitted = fingerprint;
  for (const subscriber of subscribers) {
    try { subscriber(clone(state)); } catch { /* One UI subscriber must not interrupt another. */ }
  }
}

function attachStorageListener() {
  if (attachedListener) return;
  if (globalThis.chrome?.storage?.onChanged) {
    const handler = (changes, areaName) => {
      if (areaName !== 'local' || !changes[STORAGE_KEY]?.newValue) return;
      try { emitState(validateImport(changes[STORAGE_KEY].newValue)); } catch { /* Keep the last validated state. */ }
    };
    globalThis.chrome.storage.onChanged.addListener(handler);
    attachedListener = () => globalThis.chrome?.storage?.onChanged?.removeListener(handler);
  } else if (globalThis.addEventListener) {
    const handler = event => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try { emitState(validateImport(event.newValue)); } catch { /* Keep the last validated state. */ }
    };
    globalThis.addEventListener('storage', handler);
    attachedListener = () => globalThis.removeEventListener('storage', handler);
  }
}

export function subscribeState(callback) {
  if (typeof callback !== 'function') throw new TypeError(t("订阅者必须是函数"));
  subscribers.add(callback);
  attachStorageListener();
  return () => {
    subscribers.delete(callback);
    if (!subscribers.size && attachedListener) { attachedListener(); attachedListener = null; }
  };
}

function withWriteLock(operation) {
  // Web Locks coordinates the new tab, popup and worker in supported browsers.
  const task = () => globalThis.navigator?.locks?.request
    ? globalThis.navigator.locks.request(STORAGE_KEY, operation)
    : operation();
  const result = localQueue.then(task, task);
  localQueue = result.catch(() => {});
  return result;
}

async function persistValidated(state, previousRevision = state.updatedAt) {
  const updatedAt = Math.max(Date.now(), previousRevision + 1);
  if (updatedAt > 8640000000000000) throw new Error(t("本地数据版本超出可保存范围，请导出备份后明确重置或恢复。"));
  const next = { ...state, updatedAt };
  try {
    if (hasExtensionStorage()) await chromeCall(globalThis.chrome.storage.local, 'set', { [STORAGE_KEY]: next });
    else {
      if (!globalThis.localStorage) throw new Error(t("本地存储不可用"));
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch (error) { throw new Error(`${t("保存失败，原数据未主动清除。可能空间不足或存储被禁用：{v0}", {v0: error.message})}`); }
  emitState(next);
  return clone(next);
}

export async function saveState(state, options = {}) {
  // Validate and snapshot now: later UI mutations cannot alter an enqueued write.
  const next = validateImport(state);
  return withWriteLock(async () => {
    // A lock serializes writes, but an old complete snapshot could still erase a
    // link added by another surface. Reject it instead of guessing at deletions.
    // Explicit restore/reset can replace even a damaged old record.
    let current;
    if (options.replace !== true) {
      current = await loadState();
      if (current.updatedAt !== next.updatedAt) {
        const error = new Error(t("另一个标签页已更新栖页，此次改动尚未保存。已保留最新数据，请在刷新后的内容上重试。"));
        error.code = 'STATE_CONFLICT';
        error.currentState = clone(current);
        throw error;
      }
    } else {
      // A restore gets a new local revision, not the historical backup revision.
      // This also prevents a rapid reset from reusing an old snapshot's version.
      try { current = await loadState(); } catch { /* Explicit replacement may repair damaged storage. */ }
    }
    return persistValidated(next, current?.updatedAt || 0);
  });
}

/** Transactional read/append used by the popup and context menu. */
export async function appendLink(linkData, groupId) {
  const checkedUrl = safeUrl(linkData?.url);
  if (!checkedUrl) throw new Error(t("只能添加 http 或 https 网页。浏览器内部页面无法收藏到栖页。"));
  const iconMode = enumeration(linkData.iconMode === undefined ? 'auto' : linkData.iconMode, ['auto', 'text'], 'link.iconMode');
  const title = typeof linkData.title === 'string' && linkData.title.trim() ? linkData.title.trim().slice(0, 120) : new URL(checkedUrl).hostname;
  return withWriteLock(async () => {
    const state = await loadState();
    const targetGroup = groupId || state.activeGroupId;
    if (!state.groups.some(group => group.id === targetGroup)) throw new Error(t("目标分组已不存在，请重新选择。"));
    const existing = state.items.find(item => item.type === 'link' && item.groupId === targetGroup && item.url === checkedUrl && !item.folderId);
    if (existing) return { state, item: clone(existing), duplicate: true };
    const item = link(uid(), targetGroup, title, checkedUrl, title.slice(0, 1), '#6BA39A', null, iconMode);
    state.items.push(item);
    const saved = await persistValidated(validateImport(state));
    return { state: saved, item: clone(item), duplicate: false };
  });
}

async function requireOptionalPermission(permission) {
  if (!globalThis.chrome?.permissions) throw new Error(t("此功能需要先在 Chrome 或 Edge 中安装栖页扩展。"));
  const descriptor = { permissions: [permission] };
  const granted = await chromeCall(globalThis.chrome.permissions, 'contains', descriptor);
  if (granted) return;
  const accepted = await chromeCall(globalThis.chrome.permissions, 'request', descriptor);
  if (!accepted) throw new Error(`${t("未授予{v0}权限，现有数据未改变。", {v0: permission === 'bookmarks' ? t("书签") : t("浏览记录")})}`);
}

export async function requestBookmarks() {
  await requireOptionalPermission('bookmarks');
  if (!globalThis.chrome?.bookmarks) throw new Error(t("当前浏览器未提供书签接口。"));
  const tree = await chromeCall(globalThis.chrome.bookmarks, 'getTree');
  const out = [];
  const queue = [...(tree || [])];
  const seen = new Set();
  while (queue.length && out.length < 5000) {
    const node = queue.shift();
    const checkedUrl = safeUrl(node?.url);
    if (checkedUrl && !seen.has(checkedUrl)) {
      seen.add(checkedUrl);
      out.push({ title: typeof node.title === 'string' && node.title.trim() ? node.title.slice(0, 120) : new URL(checkedUrl).hostname, url: checkedUrl });
    }
    if (Array.isArray(node?.children)) queue.push(...node.children);
  }
  return out;
}

export async function searchHistory(query) {
  const text = string(query, t("搜索词"), 200, true).trim();
  if (!text) return [];
  await requireOptionalPermission('history');
  if (!globalThis.chrome?.history) throw new Error(t("当前浏览器未提供历史记录接口。"));
  const results = await chromeCall(globalThis.chrome.history, 'search', { text, startTime: 0, maxResults: 50 });
  return (results || []).flatMap(entry => {
    const checkedUrl = safeUrl(entry.url);
    return checkedUrl ? [{ id: String(entry.id || ''), title: String(entry.title || new URL(checkedUrl).hostname).slice(0, 200), url: checkedUrl, lastVisitTime: Number(entry.lastVisitTime) || 0, visitCount: Number(entry.visitCount) || 0 }] : [];
  });
}

export async function addCurrentTab(options = {}) {
  if (!globalThis.chrome?.tabs) throw new Error(t("请在安装后的栖页扩展弹窗中添加当前页面。"));
  const tabs = await chromeCall(globalThis.chrome.tabs, 'query', { active: true, currentWindow: true });
  const tab = tabs?.[0];
  if (!tab?.url) throw new Error(t("无法读取当前页面。请在普通网页上点击栖页扩展图标重试。"));
  return appendLink({ url: tab.url, title: options.title || tab.title }, options.groupId);
}
