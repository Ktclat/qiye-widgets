// SPDX-License-Identifier: GPL-3.0-only
import { getLocale } from './i18n.js';

// Local aliases keep common Chinese searches useful even when geocoding is unavailable.
const places = [
  ['香港','香港','Hong Kong','HK',22.32,114.17],['九龙','九龍','Kowloon','HK',22.32,114.18],
  ['沙田','沙田','Sha Tin','HK',22.38,114.19],['屯门','屯門','Tuen Mun','HK',22.39,113.97],
  ['大埔','大埔','Tai Po','HK',22.45,114.16],['元朗','元朗','Yuen Long','HK',22.44,114.03],
  ['荃湾','荃灣','Tsuen Wan','HK',22.37,114.11],['将军澳','將軍澳','Tseung Kwan O','HK',22.31,114.26],
  ['澳门','澳門','Macau Macao','MO',22.1987,113.5439],['氹仔','氹仔','Taipa','MO',22.158,113.556],
  ['路环','路環','Coloane','MO',22.119,113.558],
  ['台北','臺北 台北 台北市 臺北市','Taipei','TW',25.033,121.5654],
  ['新北','新北 新北市','New Taipei','TW',25.012,121.465],['桃园','桃園 桃園市','Taoyuan','TW',24.993,121.301],
  ['台中','臺中 台中 台中市','Taichung','TW',24.148,120.674],['台南','臺南 台南 台南市','Tainan','TW',22.999,120.227],
  ['高雄','高雄 高雄市','Kaohsiung','TW',22.627,120.301],['基隆','基隆','Keelung','TW',25.128,121.739],
  ['新竹','新竹','Hsinchu','TW',24.813,120.967],['嘉义','嘉義','Chiayi','TW',23.48,120.449],
  ['宜兰','宜蘭','Yilan','TW',24.757,121.753],['花莲','花蓮','Hualien','TW',23.987,121.601],
  ['台东','臺東 台東','Taitung','TW',22.755,121.15],['屏东','屏東','Pingtung','TW',22.676,120.494],
  ['南投','南投','Nantou','TW',23.91,120.684],['彰化','彰化','Changhua','TW',24.051,120.516],
  ['苗栗','苗栗','Miaoli','TW',24.56,120.821],['云林','雲林','Yunlin','TW',23.709,120.543],
  ['澎湖','澎湖','Penghu','TW',23.566,119.578],['金门','金門','Kinmen','TW',24.432,118.318],
  ['连江','連江 馬祖 马祖','Lienchiang Matsu','TW',26.16,119.95],
  ['北京','北京 北京市','Beijing','CN',39.9,116.4],['上海','上海 上海市','Shanghai','CN',31.23,121.47],
  ['深圳','深圳 深圳市','Shenzhen','CN',22.54,114.06],['广州','廣州 广州市','Guangzhou','CN',23.13,113.26],
  ['珠海','珠海','Zhuhai','CN',22.27,113.58],['成都','成都','Chengdu','CN',30.67,104.07],
  ['重庆','重慶','Chongqing','CN',29.56,106.55],['杭州','杭州','Hangzhou','CN',30.27,120.15],
  ['南京','南京','Nanjing','CN',32.06,118.8],['武汉','武漢','Wuhan','CN',30.59,114.3],
  ['西安','西安','Xian Xi’an','CN',34.34,108.94],['天津','天津','Tianjin','CN',39.08,117.2],
  ['苏州','蘇州','Suzhou','CN',31.3,120.58],['郑州','鄭州','Zhengzhou','CN',34.75,113.62],
  ['长沙','長沙','Changsha','CN',28.23,112.94],['济南','濟南','Jinan','CN',36.65,117.12],
  ['青岛','青島','Qingdao','CN',36.07,120.38],['厦门','廈門','Xiamen','CN',24.48,118.08],
  ['福州','福州','Fuzhou','CN',26.07,119.3],['合肥','合肥','Hefei','CN',31.82,117.23],
  ['昆明','昆明','Kunming','CN',25.04,102.72],['贵阳','貴陽','Guiyang','CN',26.65,106.63],
  ['南宁','南寧','Nanning','CN',22.82,108.37],['海口','海口','Haikou','CN',20.04,110.2],
  ['沈阳','瀋陽','Shenyang','CN',41.8,123.43],['大连','大連','Dalian','CN',38.91,121.61],
  ['长春','長春','Changchun','CN',43.82,125.32],['哈尔滨','哈爾濱','Harbin','CN',45.8,126.53],
  ['石家庄','石家莊','Shijiazhuang','CN',38.04,114.51],['太原','太原','Taiyuan','CN',37.87,112.55],
  ['南昌','南昌','Nanchang','CN',28.68,115.86],['兰州','蘭州','Lanzhou','CN',36.06,103.83],
  ['西宁','西寧','Xining','CN',36.62,101.78],['银川','銀川','Yinchuan','CN',38.49,106.23],
  ['呼和浩特','呼和浩特','Hohhot','CN',40.84,111.75],['乌鲁木齐','烏魯木齊','Urumqi','CN',43.83,87.62],
  ['拉萨','拉薩','Lhasa','CN',29.65,91.14]
];
const regionNames = {HK:['中国香港','Hong Kong, China'],MO:['中国澳门','Macao, China'],TW:['中国台湾','Taiwan, China'],CN:['中国内地','Mainland China']};
export function localWeatherCities(query) {
  const q = query.trim().toLowerCase().replace(/\s+/g,' '), english = getLocale() !== 'zh-CN';
  if (!q) return [];
  return places.filter(p=>p.slice(0,3).some(v=>v.toLowerCase().includes(q))).slice(0,8).map(([name,,en,countryCode,latitude,longitude])=>({name:english?en.split(' Macao')[0]:name,latitude,longitude,countryCode,region:regionNames[countryCode][english?1:0]}));
}
function inside(city, polygon) {
  const x=city.longitude,y=city.latitude; let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const [xi,yi]=polygon[i],[xj,yj]=polygon[j];
    if ((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) result=!result;
  }
  return result;
}
export function weatherRegion(city) {
  if (city.countryCode) return city.countryCode;
  // Tight local boundaries avoid routing neighbouring Shenzhen/Zhuhai to HK/Macao.
  if (inside(city,[[113.528,22.216],[113.558,22.217],[113.588,22.16],[113.585,22.105],[113.545,22.105],[113.528,22.18]])) return 'MO';
  if (inside(city,[[113.835,22.18],[113.87,22.35],[113.96,22.47],[114.05,22.50],[114.12,22.54],[114.23,22.55],[114.31,22.49],[114.44,22.32],[114.32,22.15],[114.0,22.14]])) return 'HK';
  if (inside(city,[[120,21.8],[120,23.5],[120.8,25.35],[121.7,25.35],[122.1,24.6],[121.6,23],[120.9,21.8]])) return 'TW';
  if (city.latitude>=18 && city.latitude<=54 && city.longitude>=73 && city.longitude<=135) return 'CN';
  return '';
}
export function weatherTimezone(city) {
  return ({HK:'Asia/Hong_Kong',MO:'Asia/Macau',TW:'Asia/Taipei',CN:'Asia/Shanghai'})[weatherRegion(city)] || 'UTC';
}
