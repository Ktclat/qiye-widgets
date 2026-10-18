// SPDX-License-Identifier: GPL-3.0-only
import { t, getLocale } from './i18n.js';
import { keys, number, bool, enumeration } from './validation.js';
import { newBaseConverterData, validateBaseConverterData } from './base-converter.js';

const unit = (id, name, en, symbol, factor, offset = 0) => ({ id, name, en, symbol, factor, offset });
const category = (id, name, en, mark, group, units = []) => ({ id, name, en, mark, group, units });
// SI factors, international avoirdupois/length, US liquid and imperial volumes.
// Offset is in base units (kelvin for absolute temperatures).
export const CONVERTER_CATEGORIES = Object.freeze([
  category('calculator', '计算器', 'Calculator', '±', 'daily'),
  { ...category('radix', '进制转换', 'Base converter', '01', 'daily'), keywords: 'radix binary octal decimal hexadecimal BIN OCT DEC HEX 二进制 八进制 十进制 十六进制 补码 位宽' },
  category('currency', '货币汇率', 'Currency', '¥', 'daily'),
  category('bmi', 'BMI 计算', 'BMI', '♡', 'daily'),
  category('date', '日期计算', 'Date', '31', 'daily'),
  category('length', '长度', 'Length', '↔', 'measure', [
    unit('m','米','Metre','m',1), unit('cm','厘米','Centimetre','cm',.01), unit('mm','毫米','Millimetre','mm',.001), unit('km','千米','Kilometre','km',1000), unit('um','微米','Micrometre','μm',1e-6), unit('nm','纳米','Nanometre','nm',1e-9), unit('in','英寸','Inch','in',.0254), unit('ft','英尺','Foot','ft',.3048), unit('yd','码','Yard','yd',.9144), unit('mi','英里','Mile','mi',1609.344), unit('nmi','海里','Nautical mile','nmi',1852), unit('chi','市尺','Chinese chi','尺',1/3), unit('cun','市寸','Chinese cun','寸',1/30), unit('li','市里','Chinese li','里',500),
  ]),
  category('area', '面积', 'Area', '□', 'measure', [
    unit('m2','平方米','Square metre','m²',1), unit('km2','平方千米','Square kilometre','km²',1e6), unit('cm2','平方厘米','Square centimetre','cm²',1e-4), unit('mm2','平方毫米','Square millimetre','mm²',1e-6), unit('ha','公顷','Hectare','ha',10000), unit('mu','市亩','Chinese mu','亩',2000/3), unit('ft2','平方英尺','Square foot','ft²',.09290304), unit('in2','平方英寸','Square inch','in²',.00064516), unit('acre','英亩','Acre','ac',4046.8564224), unit('mi2','平方英里','Square mile','mi²',2589988.110336),
  ]),
  category('mass', '质量', 'Mass', '㎏', 'measure', [
    unit('kg','千克','Kilogram','kg',1), unit('g','克','Gram','g',.001), unit('mg','毫克','Milligram','mg',1e-6), unit('ug','微克','Microgram','μg',1e-9), unit('t','吨','Tonne','t',1000), unit('jin','市斤（500 克）','Chinese jin (500 g)','斤',.5), unit('liang','市两（50 克）','Chinese liang (50 g)','两',.05), unit('lb','磅','Pound','lb',.45359237), unit('oz','盎司（常衡）','Ounce (avoirdupois)','oz',.028349523125), unit('ozt','金衡盎司','Troy ounce','oz t',.0311034768), unit('st','英石','Stone','st',6.35029318), unit('ct','克拉','Carat','ct',.0002),
  ]),
  category('volume', '体积', 'Volume', '◈', 'measure', [
    unit('l','升','Litre','L',1), unit('ml','毫升','Millilitre','mL',.001), unit('m3','立方米','Cubic metre','m³',1000), unit('cm3','立方厘米','Cubic centimetre','cm³',.001), unit('ft3','立方英尺','Cubic foot','ft³',28.316846592), unit('in3','立方英寸','Cubic inch','in³',.016387064), unit('usgal','美制加仑','US gallon','gal US',3.785411784), unit('impgal','英制加仑','Imperial gallon','gal imp',4.54609), unit('usqt','美制夸脱','US quart','qt US',.946352946), unit('uspt','美制品脱','US pint','pt US',.473176473), unit('usfloz','美制液盎司','US fluid ounce','fl oz US',.0295735295625), unit('impfloz','英制液盎司','Imperial fluid ounce','fl oz imp',.0284130625), unit('uscup','美制杯','US cup','cup US',.2365882365), unit('ustbsp','美制汤匙','US tablespoon','tbsp US',.01478676478125), unit('ustsp','美制茶匙','US teaspoon','tsp US',.00492892159375),
  ]),
  category('temperature', '温度', 'Temperature', '°', 'measure', [unit('c','摄氏度','Celsius','°C',1,273.15), unit('f','华氏度','Fahrenheit','°F',5/9,459.67*5/9), unit('k','开尔文','Kelvin','K',1), unit('r','兰氏度','Rankine','°R',5/9)]),
  category('time', '时间', 'Time', '◷', 'measure', [unit('s','秒','Second','s',1), unit('min','分钟','Minute','min',60), unit('h','小时','Hour','h',3600), unit('d','天（24 小时）','Day (24 hours)','d',86400), unit('wk','周（7 天）','Week (7 days)','wk',604800), unit('ms','毫秒','Millisecond','ms',.001), unit('us','微秒','Microsecond','μs',1e-6), unit('ns','纳秒','Nanosecond','ns',1e-9)]),
  category('speed', '速度', 'Speed', '»', 'measure', [unit('kmh','千米 / 小时','Kilometres per hour','km/h',1/3.6), unit('ms','米 / 秒','Metres per second','m/s',1), unit('mph','英里 / 小时','Miles per hour','mph',.44704), unit('kn','节','Knot','kn',1852/3600), unit('fts','英尺 / 秒','Feet per second','ft/s',.3048)]),
  category('angle', '角度', 'Angle', '∠', 'measure', [unit('deg','度','Degree','°',Math.PI/180), unit('rad','弧度','Radian','rad',1), unit('grad','百分度','Gradian','gon',Math.PI/200), unit('turn','周','Turn','turn',2*Math.PI), unit('arcmin','角分','Arcminute','′',Math.PI/10800), unit('arcsec','角秒','Arcsecond','″',Math.PI/648000)]),
  category('force', '力', 'Force', 'F', 'science', [unit('n','牛顿','Newton','N',1), unit('kn','千牛','Kilonewton','kN',1000), unit('kgf','千克力','Kilogram-force','kgf',9.80665), unit('lbf','磅力','Pound-force','lbf',4.4482216152605), unit('dyn','达因','Dyne','dyn',1e-5)]),
  category('pressure', '压力', 'Pressure', 'P', 'science', [unit('pa','帕斯卡','Pascal','Pa',1), unit('kpa','千帕','Kilopascal','kPa',1000), unit('mpa','兆帕','Megapascal','MPa',1e6), unit('bar','巴','Bar','bar',100000), unit('mbar','毫巴 / 百帕','Millibar / hectopascal','hPa',100), unit('atm','标准大气压','Standard atmosphere','atm',101325), unit('psi','磅 / 平方英寸','Pounds per square inch','psi',6894.757293168), unit('mmhg','毫米汞柱（约定值）','Millimetre of mercury (conventional)','mmHg',133.322387415), unit('torr','托','Torr','Torr',101325/760)]),
  category('energy', '能量', 'Energy', 'E', 'science', [unit('j','焦耳','Joule','J',1), unit('kj','千焦','Kilojoule','kJ',1000), unit('cal','卡（热化学）','Calorie (thermochemical)','cal',4.184), unit('kcal','千卡（热化学）','Kilocalorie (thermochemical)','kcal',4184), unit('wh','瓦时','Watt-hour','Wh',3600), unit('kwh','千瓦时（度电）','Kilowatt-hour','kWh',3600000), unit('btu','英热单位（IT）','British thermal unit (IT)','Btu IT',1055.05585262), unit('ev','电子伏特','Electronvolt','eV',1.602176634e-19)]),
  category('power', '功率', 'Power', 'W', 'science', [unit('w','瓦特','Watt','W',1), unit('kw','千瓦','Kilowatt','kW',1000), unit('mw','兆瓦','Megawatt','MW',1e6), unit('hp','机械马力','Mechanical horsepower','hp',745.699871582), unit('ps','公制马力','Metric horsepower','PS',735.49875), unit('btuh','英热单位 / 小时（IT）','Btu per hour (IT)','Btu/h',1055.05585262/3600)]),
  category('data', '数据存储', 'Data storage', 'B', 'science', [unit('b','字节','Byte','B',1), unit('kb','千字节（十进制）','Kilobyte (decimal)','kB',1e3), unit('mb','兆字节（十进制）','Megabyte (decimal)','MB',1e6), unit('gb','吉字节（十进制）','Gigabyte (decimal)','GB',1e9), unit('tb','太字节（十进制）','Terabyte (decimal)','TB',1e12), unit('kib','千字节（二进制）','Kibibyte (binary)','KiB',1024), unit('mib','兆字节（二进制）','Mebibyte (binary)','MiB',1024**2), unit('gib','吉字节（二进制）','Gibibyte (binary)','GiB',1024**3), unit('tib','太字节（二进制）','Tebibyte (binary)','TiB',1024**4), unit('bit','比特','Bit','bit',1/8)]),
  category('frequency', '频率', 'Frequency', 'Hz', 'science', [unit('hz','赫兹','Hertz','Hz',1), unit('khz','千赫','Kilohertz','kHz',1000), unit('mhz','兆赫','Megahertz','MHz',1e6), unit('ghz','吉赫','Gigahertz','GHz',1e9), unit('rpm','转 / 分钟','Revolutions per minute','rpm',1/60)]),
  category('timestamp', '时间戳', 'Timestamp', '#', 'science'),
]);
export const CURRENCY_CODES = Object.freeze(['CNY','USD','EUR','HKD','TWD','MOP','GBP','JPY','KRW','AUD','CAD','CHF','SGD','NZD','THB','MYR','IDR','PHP','VND','INR','AED','SAR','TRY','RUB','BRL','MXN','ZAR','SEK','NOK','DKK','PLN','CZK','HUF','ISK','ILS','RON','CLP','PKR','BDT','EGP']);
export const converterCategory = id => CONVERTER_CATEGORIES.find(entry => entry.id === id);
export const converterLabel = entry => getLocale() === 'en' ? entry.en : entry.name;

export function newConverterData() {
  return { category: 'calculator', precision: 6, online: false, pairs: Object.fromEntries(CONVERTER_CATEGORIES.filter(c => c.units.length).map(c => [c.id, [c.units[0].id, c.units[1].id]]).concat([['currency',['CNY','USD']]])), radix: newBaseConverterData() };
}

export function validateConverterData(raw, path = 'data') {
  keys(raw, ['category','precision','online','pairs','radix'], path);
  const defaults = newConverterData();
  keys(raw.pairs, Object.keys(defaults.pairs), `${path}.pairs`);
  const pairs = {};
  for (const id of Object.keys(defaults.pairs)) {
    const pair = raw.pairs[id], choices = id === 'currency' ? CURRENCY_CODES : converterCategory(id).units.map(u => u.id);
    if (!Array.isArray(pair) || pair.length !== 2) throw new Error(t('换算单位设置无效。'));
    pairs[id] = pair.map(value => enumeration(value, choices, `${path}.pairs.${id}`));
  }
  return { category: enumeration(raw.category, CONVERTER_CATEGORIES.map(c => c.id), `${path}.category`), precision: number(raw.precision, `${path}.precision`, 0, 12, true), online: bool(raw.online, `${path}.online`), pairs, radix: raw.radix === undefined ? defaults.radix : validateBaseConverterData(raw.radix, `${path}.radix`) };
}

export function parseConverterNumber(raw) {
  const text = String(raw).trim();
  if (!text) return null;
  if (text.length > 100 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) || !Number.isFinite(Number(text))) throw new Error(t('请输入有效数字，支持小数与科学计数法。'));
  const value = Number(text);
  if (value === 0 && /[1-9]/.test(text.split(/[eE]/)[0])) throw new Error(t('数值超出可计算范围。'));
  return value;
}

export function convertUnit(categoryId, raw, fromId, toId) {
  const value = parseConverterNumber(raw);
  if (value === null) return null;
  const units = converterCategory(categoryId)?.units || [], from = units.find(u => u.id === fromId), to = units.find(u => u.id === toId);
  if (!from || !to) throw new Error(t('换算单位设置无效。'));
  const base = value * from.factor + from.offset;
  if (categoryId === 'temperature' && base < -1e-10) throw new Error(t('温度不能低于绝对零度。'));
  // Keep identity conversions and zero stable, including offset temperatures.
  const result = fromId === toId ? value : (base - to.offset) / to.factor;
  if (!Number.isFinite(result) || (value !== 0 && result === 0 && from.offset === 0 && to.offset === 0)) throw new Error(t('数值超出可计算范围。'));
  return Math.abs(result) < 1e-12 && categoryId === 'temperature' ? 0 : result;
}

export function formatConversion(value, precision = 6) {
  if (value === null || !Number.isFinite(value)) return '';
  if (value === 0 || Object.is(value, -0)) return '0';
  const magnitude = Math.abs(value);
  // Do not turn a meaningful tiny value into zero just to honor decimal places.
  if (magnitude >= 1e12 || magnitude < 10 ** -Math.max(precision, 1)) return value.toExponential(Math.max(precision, 2)).replace(/(\.\d*?[1-9])0+e/, '$1e').replace(/\.0+e/, 'e');
  return String(Number(value.toFixed(precision)));
}

export function calculateBMI(height, weight, system = 'metric') {
  let h = parseConverterNumber(height), w = parseConverterNumber(weight);
  if (h === null || w === null) return null;
  if (h <= 0 || w <= 0) throw new Error(t('身高和体重必须大于 0。'));
  h *= system === 'imperial' ? .0254 : .01;
  w *= system === 'imperial' ? .45359237 : 1;
  const value = w / h ** 2;
  if (!Number.isFinite(value)) throw new Error(t('数值超出可计算范围。'));
  return { value, category: value < 18.5 ? '偏低' : value < 25 ? '健康范围' : value < 30 ? '超重' : '肥胖', low: 18.5 * h ** 2, high: 25 * h ** 2 };
}

const DAY = 86400000;
export function calendarStamp(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(t('请选择有效日期。'));
  const [year, month, day] = text.split('-').map(Number), date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (year < 1 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(t('请选择有效日期。'));
  return date.getTime();
}

export function dateDifference(start, end, inclusive = false) {
  const a = calendarStamp(start), b = calendarStamp(end);
  const delta = Math.round((b - a) / DAY), sign = delta < 0 ? -1 : 1;
  const count = Math.abs(delta) + (inclusive ? 1 : 0);
  // Count weekdays in (start, end], or [start, end] when inclusive; reversed dates are signed.
  const lower = Math.min(a,b), first = new Date(lower).getUTCDay() + (inclusive ? 0 : 1);
  let weekdays = Math.floor(count / 7) * 5;
  for (let i = 0; i < count % 7; i++) if (![0,6].includes((first + i) % 7)) weekdays++;
  return { days: count * sign, weeks: Math.floor(count / 7), remainder: count % 7, weekdays: weekdays * sign };
}

export function addCalendarDate(start, years = 0, months = 0, days = 0) {
  const date = new Date(calendarStamp(start));
  if (![years, months, days].every(n => Number.isSafeInteger(n) && Math.abs(n) <= 3650000)) throw new Error(t('日期偏移必须是范围内的整数。'));
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + years, date.getUTCMonth() + months);
  const next = new Date(date); next.setUTCMonth(next.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, next.getUTCDate()) + days);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new Error(t('结果超出 0001–9999 年范围。'));
  return date.toISOString().slice(0,10);
}

export function timestampToDate(raw, unit = 's') {
  const value = parseConverterNumber(raw);
  if (value === null) return null;
  // Decimal scaling avoids 1.001 seconds becoming 1000.9999999999999 ms.
  const [mantissa, exponent = '0'] = String(raw).trim().toLowerCase().split('e');
  const decimals = mantissa.split('.')[1]?.length || 0;
  const digits = BigInt(mantissa.replace('.', ''));
  const scale = Number(exponent) - decimals + (unit === 's' ? 3 : 0);
  let milliseconds = 0n;
  if (digits !== 0n) {
    if (scale >= 0) milliseconds = digits * 10n ** BigInt(scale);
    else {
      const divisor = 10n ** BigInt(-scale);
      if (digits % divisor !== 0n) throw new Error(t('时间戳需精确到整数毫秒。'));
      milliseconds = digits / divisor;
    }
  }
  const ms = Number(milliseconds);
  if (!Number.isSafeInteger(ms)) throw new Error(t('结果超出 0001–9999 年范围。'));
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new Error(t('结果超出 0001–9999 年范围。'));
  return date;
}

export function isoToTimestamp(raw, unit = 's') {
  const value = String(raw).trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) throw new Error(t('请输入带 Z 或时区偏移的 ISO 时间。'));
  calendarStamp(value.slice(0,10));
  if (Number(value.slice(11,13)) > 23 || Number(value.slice(14,16)) > 59 || Number(value.slice(17,19)) > 59) throw new Error(t('请输入有效时间。'));
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(t('请输入有效时间。'));
  timestampToDate(ms,'ms');
  return ms / (unit === 's' ? 1000 : 1);
}
