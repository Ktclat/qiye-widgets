// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { keys, array, unique, enumeration, bool, string } from './validation.js';
import { publicHttpsUrl } from './public-json.js';

export const HOTSEARCH_API = 'https://uapis.cn';
export const HOTSEARCH_CATEGORIES = [
  ['subscribed', '我的订阅'], ['all', '全部'], ['general', '综合'], ['tech', '科技'],
  ['ai', '人工智能'], ['entertainment', '娱乐'], ['community', '社区'], ['shopping', '购物'], ['finance', '财经'], ['daily', '日报'],
];
// Default API: https://uapis.cn/docs/api-reference/get-misc-hotboard
// Custom services use DailyHotApi route names: https://github.com/imsyy/DailyHotApi
// GitHub uses its public search API and is explicitly labelled as newly created repositories.
// First-party favicons verified 2026-10-15; URLs only, no trademark artwork bundled.
export const HOTSEARCH_SOURCES = [
  {id:'zhihu', name:'知乎', label:'热榜', categories:['general','community'], iconUrl:'https://static.zhihu.com/heifetz/favicon.ico', url:'https://www.zhihu.com/hot'},
  {id:'weibo', name:'微博', label:'热搜榜', categories:['general','entertainment'], iconUrl:'https://s.weibo.com/favicon.ico', url:'https://s.weibo.com/top/summary'},
  {id:'52pojie', name:'吾爱破解', label:'热帖', categories:['tech','community'], iconUrl:'https://www.52pojie.cn/favicon.ico', url:'https://www.52pojie.cn/'},
  {id:'github', name:'GitHub', label:'本周新星', categories:['tech'], iconUrl:'https://github.githubassets.com/favicons/favicon.png', url:'https://github.com/trending', github:true},
  {id:'baidu', name:'百度', label:'热搜榜', categories:['general'], iconUrl:'https://www.baidu.com/favicon.ico', url:'https://top.baidu.com/board?tab=realtime'},
  {id:'toutiao', name:'今日头条', label:'热榜', categories:['general'], iconUrl:'https://www.toutiao.com/favicon.ico', url:'https://www.toutiao.com/'},
  {id:'thepaper', name:'澎湃新闻', label:'热榜', categories:['general'], iconUrl:'https://www.thepaper.cn/favicon.ico', url:'https://www.thepaper.cn/'},
  {id:'ithome', name:'IT之家', label:'热榜', categories:['tech'], iconUrl:'https://www.ithome.com/favicon.ico', url:'https://www.ithome.com/'},
  {id:'sspai', name:'少数派', label:'热榜', categories:['tech'], iconUrl:'https://cdn-static.sspai.com/favicon/sspai.ico', url:'https://sspai.com/'},
  {id:'juejin', name:'稀土掘金', label:'热榜', categories:['tech','community'], iconUrl:'https://juejin.cn/favicon.ico', url:'https://juejin.cn/'},
  {id:'github-ai', name:'GitHub AI', label:'本月 AI 新星', categories:['ai','tech'], iconUrl:'https://github.githubassets.com/favicons/favicon.png', url:'https://github.com/topics/artificial-intelligence', github:true},
  {id:'bilibili', name:'哔哩哔哩', label:'热门榜', categories:['entertainment'], iconUrl:'https://www.bilibili.com/favicon.ico', url:'https://www.bilibili.com/v/popular/rank/all'},
  {id:'douyin', name:'抖音', label:'热点榜', categories:['entertainment'], iconUrl:'https://lf1-cdn-tos.bytegoofy.com/goofy/ies/douyin_web/public/favicon.ico', url:'https://www.douyin.com/hot'},
  {id:'douban-movie', name:'豆瓣电影', label:'新片榜', categories:['entertainment'], iconUrl:'https://movie.douban.com/favicon.ico', url:'https://movie.douban.com/chart'},
  {id:'tieba', name:'百度贴吧', label:'热议榜', categories:['community'], iconUrl:'https://tieba.baidu.com/favicon.ico', url:'https://tieba.baidu.com/hottopic/browse/topicList'},
  {id:'v2ex', name:'V2EX', label:'主题榜', categories:['community','tech'], iconUrl:'https://www.v2ex.com/favicon.ico', url:'https://www.v2ex.com/?tab=hot'},
  {id:'hupu', name:'虎扑', label:'步行街热帖', categories:['community'], iconUrl:'https://www.hupu.com/favicon.ico', url:'https://bbs.hupu.com/all-gambia'},
  {id:'ithome-xijiayi', name:'IT之家 · 喜加一', label:'游戏优惠', categories:['shopping'], iconUrl:'https://www.ithome.com/favicon.ico', url:'https://www.ithome.com/'},
  {id:'36kr', name:'36氪', label:'热榜', categories:['finance','tech'], iconUrl:'https://www.36kr.com/favicon.ico', url:'https://36kr.com/'},
  {id:'huxiu', name:'虎嗅', label:'24小时', categories:['finance'], iconUrl:'https://www.huxiu.com/favicon.ico', url:'https://www.huxiu.com/'},
  {id:'zhihu-daily', name:'知乎日报', label:'推荐榜', categories:['daily'], iconUrl:'https://daily.zhihu.com/favicon.ico', url:'https://daily.zhihu.com/'},
  {id:'guokr', name:'果壳', label:'热门文章', categories:['daily','tech'], iconUrl:'https://www.guokr.com/favicon.ico', url:'https://www.guokr.com/'},
];

export const HOTSEARCH_DEFAULTS = {subscriptions:['zhihu','weibo','52pojie','github'], activeSource:'zhihu', layout:'list', enabled:false, apiBase:HOTSEARCH_API};
export function hotsearchSource(id) { return HOTSEARCH_SOURCES.find(source => source.id === id); }
// A window can browse an unsubscribed source; the desktop tabs stay subscribed.
export function hotsearchCardSource(config) {
  return hotsearchSource(config.subscriptions.includes(config.activeSource) ? config.activeSource : config.subscriptions[0] || config.activeSource);
}
export function hotsearchApiBase(value) {
  const url = new URL(publicHttpsUrl(value));
  if (url.search || url.hash) throw new Error(t('数据源地址不能包含查询参数或片段。'));
  return url.href.replace(/\/+$/, '');
}
export function validateHotsearchConfig(raw, path = 'config') {
  keys(raw, Object.keys(HOTSEARCH_DEFAULTS), path);
  const ids = HOTSEARCH_SOURCES.map(source => source.id);
  const subscriptions = array(raw.subscriptions, path+'.subscriptions', ids.length).map(id => enumeration(id, ids, path+'.subscriptions'));
  unique(subscriptions, path+'.subscriptions');
  return {subscriptions, activeSource:enumeration(raw.activeSource, ids, path+'.activeSource'),
    layout:enumeration(raw.layout, ['list','grid'], path+'.layout'), enabled:bool(raw.enabled, path+'.enabled'),
    apiBase:hotsearchApiBase(string(raw.apiBase, path+'.apiBase', 2048))};
}
export function filterHotsearchSources(config, category = 'subscribed', query = '') {
  const sources = category === 'subscribed' ? config.subscriptions.map(hotsearchSource).filter(Boolean)
    : HOTSEARCH_SOURCES.filter(source => category === 'all' || source.categories.includes(category));
  const needle = query.trim().toLocaleLowerCase();
  return sources.filter(source => `${source.id} ${source.name} ${t(source.name)} ${t(source.label)}`.toLocaleLowerCase().includes(needle));
}
export function moveHotsearchSubscription(ids, from, to) {
  const result = [...ids], start = result.indexOf(from), end = result.indexOf(to);
  if (start < 0 || end < 0 || start === end) return result;
  result.splice(start, 1); result.splice(end, 0, from);
  return result;
}
