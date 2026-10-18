import test from 'node:test';
import assert from 'node:assert/strict';
import { CONVERTER_CATEGORIES, newConverterData, validateConverterData, convertUnit, parseConverterNumber, formatConversion, calculateBMI, calendarStamp, dateDifference, addCalendarDate, timestampToDate, isoToTimestamp } from '../src/converter.js';
import { validateRate, readCachedRate, cacheRate } from '../src/converter-rates.js';
import { calculateArithmetic } from '../src/arithmetic.js';
import { DEFAULT_STATE, validateImport } from './fixtures/legacy-host.js';
import { listWidgetDefinitions } from '../src/widget-registry.js';

const near = (a,b) => assert.ok(Math.abs(a-b) <= Math.max(1,Math.abs(b))*1e-11, `${a} ≈ ${b}`);

test('converter replaces catalog calculator and migrates existing cards without changing identity or placement', () => {
  assert.equal(CONVERTER_CATEGORIES.length,20);
  assert.equal(listWidgetDefinitions().some(d => d.type === 'calculator'),false);
  assert.ok(listWidgetDefinitions().some(d => d.type === 'converter'));
  const state = structuredClone(DEFAULT_STATE);
  const item = state.items.find(i => i.widget === 'converter');
  item.widget = 'calculator'; item.title = 'My sums'; item.data = {}; item.size = '1x1';
  const migrated = validateImport(state).items.find(i => i.id === item.id);
  assert.equal(migrated.widget,'converter'); assert.equal(migrated.title,'My sums'); assert.equal(migrated.size,'1x1'); assert.equal(migrated.groupId,item.groupId);
  assert.deepEqual(migrated.data,newConverterData());
  item.title = '计算器'; assert.equal(validateImport(state).items.find(i => i.id === item.id).title,'换算器');
});

test('preferences round trip strictly and separate newly created cards', () => {
  const data = newConverterData(); assert.deepEqual(validateConverterData(data),data);
  data.pairs.length[0] = 'ft'; assert.equal(newConverterData().pairs.length[0],'m');
  assert.throws(() => validateConverterData({...data,precision:13}));
  assert.throws(() => validateConverterData({...data,online:'yes'}));
  assert.throws(() => validateConverterData({...data,pairs:{...data.pairs,length:['m','kg']}}));
  assert.throws(() => validateConverterData({...data,pairs:{}}));
  assert.throws(() => validateConverterData({...data,category:'script'}));
  const old = structuredClone(data); delete old.radix;
  assert.deepEqual(validateConverterData(old).radix,newConverterData().radix);
  data.radix.targets.push(36); assert.equal(newConverterData().radix.targets.includes(36),false);
  assert.throws(() => validateConverterData({...data,radix:null}));
  assert.throws(() => validateConverterData({...data,radix:{...data.radix,bits:7}}));
  assert.throws(() => validateConverterData({...data,radix:{...data.radix,input:'1'.repeat(513)}}));
});

test('legacy radix cards migrate losslessly and only one converter is offered', () => {
  assert.equal(listWidgetDefinitions().some(d => d.type === 'base-converter'),false);
  const state = structuredClone(DEFAULT_STATE);
  const item = state.items.find(i => i.widget === 'converter');
  const radix = { ...newConverterData().radix, input:'FFFFFFFFFFFFFFFF', base:16, mode:'signed', bits:64, inputKind:'bits', targets:[16,2,10,36], prefixes:true };
  Object.assign(item,{widget:'base-converter',title:'My hex desk',size:'4x2',data:radix});
  const migrated = validateImport(state).items.find(i => i.id === item.id);
  assert.equal(migrated.widget,'converter'); assert.equal(migrated.data.category,'radix');
  assert.deepEqual(migrated.data.radix,radix);
  for (const key of ['id','groupId','size','title','config']) assert.deepEqual(migrated[key],item[key]);
  assert.deepEqual(validateImport(validateImport(state)),validateImport(state));
  for (const [from,to] of [['进制转换','换算器'],['Base converter','Converter']]) {
    item.title=from; assert.equal(validateImport(state).items.find(i => i.id===item.id).title,to);
  }
  item.data.bits=7; assert.throws(() => validateImport(state));
});

test('unit factors match independent SI and customary reference examples', () => {
  for (const [c,a,b,x,y] of [
    ['length','in','cm',1,2.54], ['length','mi','km',1,1.609344], ['length','chi','cm',3,100],
    ['area','mu','m2',3,2000], ['area','ft2','m2',1,.09290304],
    ['mass','lb','kg',1,.45359237], ['mass','jin','g',2,1000], ['mass','ozt','g',1,31.1034768],
    ['volume','usgal','l',1,3.785411784], ['volume','impgal','l',1,4.54609], ['volume','m3','ml',1,1e6],
    ['temperature','c','f',0,32], ['temperature','f','c',212,100], ['temperature','k','c',0,-273.15],
    ['angle','deg','rad',180,Math.PI], ['angle','turn','deg',1,360], ['force','kgf','n',1,9.80665],
    ['pressure','atm','pa',1,101325], ['pressure','torr','atm',760,1], ['energy','kwh','kj',1,3600],
    ['energy','kcal','kj',1,4.184], ['power','ps','w',1,735.49875], ['frequency','rpm','hz',60,1],
    ['speed','kmh','ms',36,10], ['time','h','min',1.5,90], ['data','gb','mb',1,1000], ['data','gib','mib',1,1024], ['data','b','bit',1,8],
  ]) near(convertUnit(c,x,a,b),y);
});

test('all unit pairs are finite and reversible over ordinary values', () => {
  for (const c of CONVERTER_CATEGORIES.filter(c => c.units.length)) for (const from of c.units) for (const to of c.units) {
    const value = c.id === 'temperature' ? 300 : 1.25;
    const result = convertUnit(c.id,value,from.id,to.id);
    near(convertUnit(c.id,result,to.id,from.id),value);
  }
});

test('invalid inputs never become plausible zeroes or infinities', () => {
  assert.equal(parseConverterNumber(''),null); assert.equal(parseConverterNumber(' -1.2e+3 '),-1200);
  for (const text of ['1,000','12kg','0x10','1 2','Infinity','NaN','1e400','1e-400']) assert.throws(() => parseConverterNumber(text));
  assert.throws(() => convertUnit('temperature',-274,'c','f'));
  assert.throws(() => convertUnit('length',1e308,'km','nm'));
  assert.throws(() => convertUnit('mass',1,'kg','km'));
  assert.equal(convertUnit('temperature',-273.15,'c','k'),0);
  assert.notEqual(formatConversion(1e-12,6),'0'); assert.equal(formatConversion(-0),'0');
  assert.equal(formatConversion(1.230000000001,6),'1.23');
});

test('adult BMI uses raw thresholds and supports imperial units', () => {
  near(calculateBMI(180,81).value,25); assert.equal(calculateBMI(180,81).category,'超重');
  assert.equal(calculateBMI(200,74).category,'健康范围');
  assert.equal(calculateBMI(200,73.999).category,'偏低');
  near(calculateBMI(70,150,'imperial').value,21.52253815221916);
  assert.equal(calculateBMI('',70),null); assert.throws(() => calculateBMI(0,70)); assert.throws(() => calculateBMI(180,-1));
});

test('dates handle leap years, reversed intervals, inclusivity, weekdays and DST boundaries', () => {
  assert.equal(dateDifference('2024-02-28','2024-03-01').days,2);
  assert.equal(dateDifference('2026-03-07','2026-03-09').days,2);
  assert.equal(dateDifference('2026-03-09','2026-03-07').days,-2);
  assert.equal(dateDifference('2026-10-15','2026-10-15',true).days,1);
  assert.equal(dateDifference('2026-10-16','2026-10-19').weekdays,1);
  assert.equal(dateDifference('2026-10-16','2026-10-19',true).weekdays,2);
  assert.equal(dateDifference('2026-10-15','2026-10-29').weekdays,10);
  assert.throws(() => calendarStamp('2025-02-29')); assert.throws(() => calendarStamp('0000-01-01'));
  assert.equal(new Date(calendarStamp('0001-01-01')).getUTCFullYear(),1);
  assert.equal(addCalendarDate('2024-01-31',0,1),'2024-02-29');
  assert.equal(addCalendarDate('2024-02-29',1),'2025-02-28');
  assert.equal(addCalendarDate('2026-01-01',0,0,-1),'2025-12-31');
  assert.equal(addCalendarDate('2024-01-31',0,1,1),'2024-03-01');
  assert.throws(() => addCalendarDate('9999-12-31',0,0,1)); assert.throws(() => addCalendarDate('2026-01-01',0,.5));
});

test('timestamp conversions require explicit offsets and preserve negative epochs and milliseconds', () => {
  assert.equal(timestampToDate(0).toISOString(),'1970-01-01T00:00:00.000Z');
  assert.equal(timestampToDate(-1).toISOString(),'1969-12-31T23:59:59.000Z');
  assert.equal(timestampToDate('1.001').getTime(),1001);
  assert.equal(timestampToDate('-.001').getTime(),-1);
  assert.equal(timestampToDate('1.001e3','ms').getTime(),1001);
  assert.equal(isoToTimestamp('1970-01-01T08:00:00+08:00'),0);
  assert.equal(isoToTimestamp('1970-01-01T00:00:00.123Z','ms'),123);
  assert.throws(() => isoToTimestamp('2025-02-29T00:00:00Z'));
  assert.throws(() => isoToTimestamp('2026-01-01T00:00:00'));
  assert.throws(() => isoToTimestamp('2026-01-01T24:00:00Z'));
  assert.throws(() => timestampToDate(.0001)); assert.throws(() => timestampToDate('1e100'));
});

test('currency cache validates pair, date and numeric rates and survives disabled storage', () => {
  const rate = {base:'USD',quote:'CNY',rate:7.2,date:'2026-01-02'};
  assert.deepEqual(validateRate(rate,'USD','CNY'),rate);
  for (const bad of [{...rate,rate:0},{...rate,rate:Infinity},{...rate,rate:'7.2'},{...rate,quote:'EUR'},{...rate,date:'2026-02-30'}]) assert.throws(() => validateRate(bad,'USD','CNY'));
  const memory = new Map(), storage = {getItem:k => memory.get(k),setItem:(k,v) => memory.set(k,v)};
  cacheRate(rate,storage); assert.equal(readCachedRate('USD','CNY',storage).rate,7.2);
  assert.equal(readCachedRate('USD','JPY',storage),null); assert.equal(readCachedRate('USD','USD',storage).rate,1);
  const broken = {getItem(){throw Error('blocked');},setItem(){throw Error('quota');}};
  assert.equal(readCachedRate('USD','CNY',broken),null); assert.equal(cacheRate(rate,broken).rate,7.2);
});

test('arithmetic remains non-executable and can reuse scientific notation results', () => {
  assert.equal(calculateArithmetic('1e-10*100'),1e-8); assert.equal(calculateArithmetic('200×10%'),20);
  assert.equal(calculateArithmetic('(2+3)*4'),20);
  for(const value of ['eval(1)','1e309','1/0','2**3','2e','globalThis.x=1']) assert.throws(() => calculateArithmetic(value));
});
