// SPDX-License-Identifier: GPL-3.0-only
import { t, getLocale } from './i18n.js';
import { escapeText as e } from './html.js';
import { icon } from './icons.js';
import { windowControls } from './widget-app-controls.js';
import { createWidgetDraft } from './widget-drafts.js';
import { calculateArithmetic } from './arithmetic.js';
import { baseConverterCard, baseConverterWorkspace, bindBaseConverter, setRadixSettings } from './base-converter-view.js';
import { CONVERTER_CATEGORIES, CURRENCY_CODES, converterCategory, converterLabel, convertUnit, formatConversion, parseConverterNumber, calculateBMI, dateDifference, addCalendarDate, timestampToDate, isoToTimestamp } from './converter.js';
import { currencyName, readCachedRate, cacheRate, fetchCurrencyRate, requestCurrencyPermission, currencyPermissionGranted, RATE_MAX_AGE } from './converter-rates.js';

const drafts = new Map();
const groups = {daily:'日常计算', measure:'度量换算', science:'科学与数字'};
const btn = (action, text, glyph = '') => `<button type="button" data-cv-action="${action}">${glyph ? icon(glyph) : ''}${e(t(text))}</button>`;
const numberField = (id, label, value = '', suffix = '') => `<label class="cv-field"><span>${e(t(label))}${suffix ? ` <small>${e(suffix)}</small>` : ''}</span><input id="${id}" inputmode="decimal" autocomplete="off" maxlength="100" value="${e(value)}" aria-describedby="cv-status"></label>`;

export function converterCard(item) {
  if (item.data.category === 'radix') return baseConverterCard({ ...item, data: item.data.radix });
  return `<div class="widget-heading"><button type="button" class="widget-title" data-action="widget-open">${icon('converter')}${e(item.title)}</button><button type="button" class="widget-icon-button" data-action="widget-config" aria-label="${t('设置组件')}">${icon('more')}</button></div>
    <button type="button" class="cv-card-face" data-action="widget-open" aria-label="${t('打开换算器')}"><span class="cv-card-equation"><b>1<span>m</span></b><i aria-hidden="true">⇄</i><b>100<span>cm</span></b></span><span class="cv-card-caption">${t('万物有尺度，换算很简单')}</span></button>
    <div class="cv-card-tags" aria-hidden="true"><span>±</span><span>01</span><span>¥</span><span>°C</span></div><div class="cv-card-bottom"><span>${t('20 类常用换算')}</span>${icon('arrowUpRight')}</div>`;
}

export function converterWorkspace(item) {
  return `<div class="cv-app"><header class="cv-header"><div class="cv-brand">${icon('converter')}<h2 id="dialog-title" tabindex="-1">${e(item.title)}</h2></div><label class="cv-search widget-search">${icon('search')}<input type="search" data-cv-search placeholder="${t('搜索换算…')}" aria-label="${t('搜索换算类型或单位')}"></label><button class="widget-app-button" type="button" data-cv-action="settings" aria-label="${t('换算设置')}" title="${t('换算设置')}" aria-expanded="false" aria-controls="cv-settings">${icon('sliders')}</button>${windowControls()}</header>
    <div class="cv-settings" id="cv-settings" hidden><label>${t('最大小数位数')}<select data-cv-precision>${Array.from({length:13},(_,n) => `<option value="${n}">${n}</option>`).join('')}</select></label><label><input type="checkbox" data-cv-online>${t('允许联网更新汇率')}</label><p>${t('只发送币种，不发送金额。其余计算均在本机完成。')}</p></div>
    <div class="cv-layout"><nav class="cv-nav" aria-label="${t('换算分类')}">${Object.entries(groups).map(([group,label]) => `<section data-cv-group="${group}"><h3>${t(label)}</h3>${CONVERTER_CATEGORIES.filter(c => c.group === group).map(c => `<button type="button" data-cv-category="${c.id}" aria-pressed="false"><span class="cv-nav-mark" aria-hidden="true">${e(c.mark)}</span><span>${e(converterLabel(c))}</span></button>`).join('')}</section>`).join('')}<p class="cv-nav-empty" hidden>${t('没有匹配的换算')}</p></nav>
    <section class="cv-main"><label class="cv-mobile-category">${t('换算分类')}<select data-cv-select>${CONVERTER_CATEGORIES.map(c => `<option value="${c.id}">${e(converterLabel(c))}</option>`).join('')}</select></label><div data-cv-panel></div><p class="cv-status" id="cv-status" role="status" aria-live="polite"></p></section></div>
    <footer class="cv-footer"><span>${icon('shield')}${t('栖页 · 随手换算')}</span><span data-cv-save role="status"></span><button type="button" data-cv-action="retry" hidden>${t('重试保存')}</button><span data-cv-feedback role="status" aria-live="polite"></span></footer></div>`;
}

function panelHeading(c, hint = '输入任意一侧，即时换算') {
  return `<div class="cv-section-title"><div><span class="cv-eyebrow">${e(c.en.toUpperCase())}</span><h3>${e(converterLabel(c))}</h3></div><span class="cv-mode-tag">${t(c.id === 'currency' ? '每日参考汇率' : '本地计算')}</span></div><p class="cv-intro">${t(hint)}</p>`;
}

function unitOptions(c, selected) {
  return (c.id === 'currency' ? CURRENCY_CODES.map(id => ({id, symbol:id, name:currencyName(id)})) : c.units.map(u => ({...u, name:converterLabel(u)}))).map(u => `<option value="${u.id}" ${selected === u.id ? 'selected' : ''}>${e(u.name)} · ${e(u.symbol)}</option>`).join('');
}

function conversionPanel(c, data) {
  const pair = data.pairs[c.id];
  const field = side => `<section class="cv-amount ${side ? 'cv-target' : ''}"><label><span>${t(side ? '换算为' : '从')}</span><select data-cv-unit="${side}" aria-label="${t(side ? '目标单位' : '来源单位')}">${unitOptions(c, pair[side])}</select></label><input data-cv-value="${side}" aria-label="${t(side ? '目标数值' : '来源数值')}" aria-describedby="cv-status" inputmode="decimal" maxlength="100" autocomplete="off" spellcheck="false" placeholder="0"><span class="cv-unit-symbol" data-cv-symbol="${side}"></span></section>`;
  return panelHeading(c) + `<div class="cv-conversion">${field(0)}<button type="button" class="cv-swap" data-cv-action="swap" aria-label="${t('交换单位')}" title="${t('交换单位')}">${icon('converter')}</button>${field(1)}</div><div class="cv-result-bar"><span data-cv-equation></span>${btn('copy','复制结果','copy')}</div>`
    + (c.id === 'currency' ? `<div class="cv-rate-info"><div><span class="cv-rate-dot" aria-hidden="true"></span><span data-cv-rate-status role="status"></span></div><p data-cv-rate-date></p><div class="cv-rate-actions">${btn('rate','启用并更新汇率','refresh')}<a href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">Frankfurter ↗</a></div><p>${t('每日参考汇率，不含银行手续费；节假日沿用最近公布值。')}</p></div>`
    : `<div class="cv-more-heading"><h4>${t('同时换算')}</h4><span>${t('按当前输入')}</span></div><div class="cv-equivalents" data-cv-equivalents></div><p class="cv-footnote">${t(c.id === 'temperature' ? '绝对温度换算；最低为 0 K（−273.15 °C）。' : c.id === 'time' ? '天按 24 小时、周按 7 天；月份和年份请使用日期计算。' : c.id === 'data' ? 'kB / MB 使用 1000 进位，KiB / MiB 使用 1024 进位。' : c.id === 'mass' ? '市斤为 500 克，市两为 50 克；金衡盎司与常衡盎司分别计算。' : c.id === 'volume' ? '美制、英制容量分别标注，烹饪单位采用美制。' : '结果按所选小数位显示；极大或极小值使用科学计数法。')}</p>`);
}

function calculatorPanel(c) {
  const keys = ['C','(',')','%','⌫','7','8','9','÷','√','4','5','6','×','x²','1','2','3','−','1/x','0','.','±','+','='];
  return panelHeading(c,'键盘输入算式，Enter 计算，Esc 清空') + `<div class="cv-calculator-layout"><section class="cv-calculator"><div class="cv-calc-screen"><label class="sr-only" for="cv-expression">${t('计算算式')}</label><input id="cv-expression" autocomplete="off" spellcheck="false" maxlength="256" placeholder="0" aria-describedby="cv-status"><output data-cv-calc-result aria-live="polite">0</output></div><div class="cv-calc-keys">${keys.map(key => `<button type="button" data-cv-key="${key}" class="${key === '=' ? 'cv-equal' : /[÷×−+]/.test(key) ? 'cv-operator' : ''}" aria-label="${e(t(({C:'清空','⌫':'删除一位','=':'计算结果','√':'平方根','x²':'平方','1/x':'倒数','±':'切换正负号'})[key] || key))}">${key}</button>`).join('')}</div><p class="cv-footnote">${t('百分号按 ÷100 计算，例如 200 × 10% = 20。')}</p></section><aside class="cv-history"><div><h4>${t('本次计算记录')}</h4>${btn('clear-history','清空')}</div><ol data-cv-history></ol><p data-cv-history-empty>${t('算过的答案，会留在这里。')}</p><span>${t('关闭窗口后清空')}</span></aside></div>`;
}

function bmiPanel(c) {
  return panelHeading(c,'了解身高与体重的比例') + `<div class="cv-bmi-inputs"><label class="cv-system">${t('单位制')}<select id="cv-bmi-system"><option value="metric">${t('公制 · cm / kg')}</option><option value="imperial">${t('英制 · in / lb')}</option></select></label>${numberField('cv-height','身高','','cm')}${numberField('cv-weight','体重','','kg')}</div><div class="cv-bmi-result"><span>BODY MASS INDEX</span><output data-cv-bmi>—</output><strong data-cv-bmi-label>${t('输入身高和体重')}</strong><div class="cv-bmi-scale"><span></span><span></span><span></span><span></span></div><div class="cv-bmi-ticks"><span>&lt;18.5</span><span>18.5–24.9</span><span>25–29.9</span><span>≥30</span></div></div><p class="cv-bmi-range" data-cv-bmi-range></p><p class="cv-footnote">${t('采用 CDC 成人（20 岁及以上）分级；BMI 是筛查指标，不作诊断，不适用于儿童或孕期评估。')} <a href="https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html" target="_blank" rel="noopener noreferrer">CDC ↗</a></p>`;
}

function datePanel(c, today) {
  return panelHeading(c,'两个日期的距离，或某一天之后') + `<div class="cv-segments" role="group" aria-label="${t('日期计算方式')}"><button type="button" data-cv-date-mode="difference" aria-pressed="true">${t('日期间隔')}</button><button type="button" data-cv-date-mode="add" aria-pressed="false">${t('日期加减')}</button></div><div class="cv-date-fields"><label class="cv-field"><span>${t('开始日期')}</span><input type="date" id="cv-date-start" min="0001-01-01" max="9999-12-31" value="${today}" aria-describedby="cv-status"></label><label class="cv-field" data-cv-date-end-field><span>${t('结束日期')}</span><input type="date" id="cv-date-end" min="0001-01-01" max="9999-12-31" value="${today}" aria-describedby="cv-status"></label></div><label class="cv-inclusive" data-cv-inclusive-field><input type="checkbox" id="cv-inclusive">${t('包含开始当天')}</label><div class="cv-offsets" data-cv-offsets hidden>${['years','months','days'].map((key,i) => numberField('cv-'+key, ['年','月','天'][i],'0')).join('')}</div><div class="cv-date-result"><span data-cv-date-label>${t('相隔')}</span><output data-cv-date-result>0</output><span data-cv-date-unit>${t('天')}</span><p data-cv-date-meta></p></div><p class="cv-footnote" data-cv-date-note>${t('按公历日期计算，不受夏令时影响；平日仅扣除周六、周日，不含法定节假日调休。')}</p>`;
}

function timestampPanel(c) {
  return panelHeading(c,'Unix 时间戳与带时区的 ISO 时间互转') + `<div class="cv-time-settings"><label>${t('时间戳单位')}<select id="cv-timestamp-unit"><option value="s">${t('秒')}</option><option value="ms">${t('毫秒')}</option></select></label><label>${t('显示时区')}<select id="cv-timezone">${['Asia/Hong_Kong','UTC','Asia/Shanghai','Asia/Tokyo','Europe/London','America/New_York','America/Los_Angeles','Australia/Sydney'].map(zone => `<option>${zone}</option>`).join('')}</select></label>${btn('now','现在')}</div>${numberField('cv-timestamp','Unix 时间戳')}<label class="cv-field cv-iso-field"><span>${t('ISO 日期时间（含时区）')}</span><input id="cv-iso" maxlength="40" autocomplete="off" spellcheck="false" placeholder="2026-01-01T00:00:00Z" aria-describedby="cv-status"></label><div class="cv-time-result"><span>${t('所选时区时间')}</span><output data-cv-zoned>—</output></div><p class="cv-footnote">${t('Z 表示 UTC；也可输入 +08:00 等偏移。时区显示自动处理夏令时。')}</p>`;
}

export function bindConverterWorkspace(root, item, host) {
  const controller = new AbortController(), events = {signal:controller.signal};
  const q = selector => root.querySelector(selector);
  let active = true, noticeTimer, rateController, rateTimer, rateRevision = 0, rate = null, rateBusy = false, rateError = '', copyValue = '', radixCleanup;
  let draft = drafts.get(item.id);
  const notifySave = () => {
    if (!active) return;
    q('[data-cv-save]').textContent = t(draft.error ? '保存失败，请重试' : draft.dirty ? '保存中…' : draft.data.category === 'radix' ? '已保存在本机' : '偏好已保存');
    q('[data-cv-action=retry]').hidden = !draft.error;
    if (!draft.dirty && !draft.error) host.refreshCards();
  };
  if (!draft) { draft = createWidgetDraft(item, (...args) => host.saveData(...args), () => draft.notify?.()); drafts.set(item.id,draft); }
  draft.notify = notifySave;
  const data = draft.data;
  const session = {values:{}, expression:'', history:[], calculated:false, bmi:{height:'',weight:'',system:'metric'}, dateMode:'difference', dates:{}, timestamp:null};
  const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const status = message => { q('#cv-status').textContent = message; };
  const feedback = message => { clearTimeout(noticeTimer); q('[data-cv-feedback]').textContent = message; noticeTimer = setTimeout(() => { if(active) q('[data-cv-feedback]').textContent = ''; },3000); };
  const format = value => formatConversion(value, data.precision);
  const valueState = () => session.values[data.category] ||= {text:'1',side:0};

  function cancelRate() { rateRevision++; rateController?.abort(); clearTimeout(rateTimer); rateBusy = false; }

  function showRateStatus() {
    if (data.category !== 'currency') return;
    const old = rate && !rate.identity && Date.now() - rate.fetchedAt > RATE_MAX_AGE;
    q('[data-cv-rate-status]').textContent = rateBusy ? t('正在更新汇率…') : rate?.identity ? t('相同币种，无需联网') : rateError || (rate ? t(old ? '缓存汇率已超过 24 小时' : data.online ? '已获取参考汇率' : '正在使用缓存汇率') : t('启用后获取每日参考汇率'));
    q('[data-cv-rate-date]').textContent = rate?.date ? `${t('汇率日期')} ${rate.date} · ${t('获取时间')} ${new Date(rate.fetchedAt).toLocaleString(getLocale())}` : '';
    const button = q('[data-cv-action=rate]');
    button.disabled = rateBusy || !!rate?.identity;
    button.innerHTML = icon('refresh') + e(t(data.online ? '更新汇率' : '启用并更新汇率'));
  }

  async function loadRate(force = false) {
    cancelRate(); rateError = '';
    const revision = rateRevision, pair = [...data.pairs.currency];
    rate = readCachedRate(...pair);
    updateNumbers();
    if (!data.online || rate?.identity || (!force && rate && Date.now() - rate.fetchedAt < RATE_MAX_AGE)) return;
    rateBusy = true; showRateStatus();
    const request = new AbortController(); rateController = request;
    rateTimer = setTimeout(() => request.abort(),10000);
    try {
      if (!await currencyPermissionGranted()) throw new Error(t('请点击更新汇率，授予访问权限。'));
      if (!active || revision !== rateRevision) return;
      const result = await fetchCurrencyRate(...pair, request.signal);
      if (!active || revision !== rateRevision) return;
      rate = cacheRate(result);
    } catch (error) {
      if (!active || revision !== rateRevision) return;
      rateError = t(rate ? '更新失败，继续使用标注日期的缓存汇率。' : '汇率获取失败，请检查网络后重试。');
      if (error.message === t('请点击更新汇率，授予访问权限。')) rateError = error.message;
    } finally {
      if (active && revision === rateRevision) { clearTimeout(rateTimer); rateBusy = false; updateNumbers(); }
    }
  }

  function updateNumbers() {
    const c = converterCategory(data.category);
    if (!c.units.length && c.id !== 'currency') return;
    const pair = data.pairs[c.id], current = valueState(), other = 1-current.side;
    for (const side of [0,1]) q(`[data-cv-symbol="${side}"]`).textContent = c.id === 'currency' ? pair[side] : c.units.find(u => u.id === pair[side]).symbol;
    const input = q(`[data-cv-value="${current.side}"]`), output = q(`[data-cv-value="${other}"]`);
    input.value = current.text;
    copyValue = ''; status('');
    input.setAttribute('aria-invalid','false'); output.setAttribute('aria-invalid','false');
    const convert = id => c.id === 'currency' ? (rate ? parseConverterNumber(current.text) * (current.side ? 1/rate.rate : rate.rate) : null) : convertUnit(c.id, current.text, pair[current.side], id);
    try {
      const source = parseConverterNumber(current.text), value = source === null ? null : convert(pair[other]);
      if (value !== null && !Number.isFinite(value)) throw new Error(t('数值超出可计算范围。'));
      output.value = format(value); copyValue = output.value;
      const unitRate = c.id === 'currency' ? rate?.rate : convertUnit(c.id, '1', pair[0], pair[1]);
      const symbols = [0,1].map(side => q(`[data-cv-symbol="${side}"]`).textContent);
      q('[data-cv-equation]').textContent = unitRate == null ? '—' : `1 ${symbols[0]} ≈ ${format(unitRate)} ${symbols[1]}`;
      if (c.id !== 'currency') q('[data-cv-equivalents]').innerHTML = c.units.filter(u => !pair.includes(u.id)).slice(0,6).map(u => `<div><span>${e(converterLabel(u))}</span><strong>${source === null ? '—' : e(format(convert(u.id)))} <small>${e(u.symbol)}</small></strong></div>`).join('');
    } catch (error) {
      output.value = ''; q('[data-cv-equation]').textContent = '—';
      if (q('[data-cv-equivalents]')) q('[data-cv-equivalents]').textContent = '';
      status(error.message); input.setAttribute('aria-invalid','true');
    }
    q('[data-cv-action=copy]').disabled = !copyValue;
    showRateStatus();
  }

  function calc(commit = false) {
    const input = q('#cv-expression'); session.expression = input.value;
    status('');
    try {
      const result = calculateArithmetic(input.value || '0');
      q('[data-cv-calc-result]').textContent = String(result);
      if (commit && input.value.trim()) {
        session.history.unshift({expression:input.value,result:String(result)}); session.history = session.history.slice(0,20);
        input.value = String(result); session.expression = input.value; session.calculated = true; renderHistory();
      }
    } catch (error) { q('[data-cv-calc-result]').textContent = '—'; if (commit) status(error.message); }
  }

  function renderHistory() {
    q('[data-cv-history]').innerHTML = session.history.map((row,index) => `<li><button type="button" data-cv-history="${index}" title="${t('用作输入')}"><span>${e(row.expression)} =</span><strong>${e(row.result)}</strong></button></li>`).join('');
    q('[data-cv-history-empty]').hidden = !!session.history.length;
  }

  function calcKey(key) {
    const input = q('#cv-expression');
    if (key === '=') { calc(true); return; }
    if (key === 'C') input.value = '';
    else if (['√','x²','1/x','±'].includes(key)) {
      try {
        const v = calculateArithmetic(input.value || '0');
        if ((key === '√' && v < 0) || (key === '1/x' && v === 0)) throw new Error(t('当前数值不支持此运算。'));
        const result = key === '√' ? Math.sqrt(v) : key === 'x²' ? v*v : key === '1/x' ? 1/v : -v;
        if (!Number.isFinite(result)) throw new Error(t('数值超出可计算范围。'));
        input.value = String(Number(result.toPrecision(12)));
      } catch(error) { status(error.message); return; }
    } else {
      if (session.calculated && /[\d.(]/.test(key)) input.value = '';
      const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? input.value.length;
      if (key === '⌫') input.setRangeText('',start === end ? Math.max(0,start-1) : start,end,'end');
      else if (input.value.length - (end-start) + key.length <= 256) input.setRangeText(key,start,end,'end');
    }
    session.calculated = false; calc(); input.focus({preventScroll:true});
  }

  function updateBMI() {
    status(''); const {system} = session.bmi;
    q('#cv-height').closest('label').querySelector('small').textContent = system === 'metric' ? 'cm' : 'in';
    q('#cv-weight').closest('label').querySelector('small').textContent = system === 'metric' ? 'kg' : 'lb';
    q('[data-cv-bmi]').textContent = '—'; q('[data-cv-bmi-label]').textContent = t('输入身高和体重'); q('[data-cv-bmi-range]').textContent = '';
    try {
      const result = calculateBMI(session.bmi.height, session.bmi.weight, system);
      if (!result) return;
      q('[data-cv-bmi]').textContent = result.value.toFixed(1); q('[data-cv-bmi-label]').textContent = t(result.category);
      const factor = system === 'metric' ? 1 : 1/.45359237, unit = system === 'metric' ? 'kg' : 'lb';
      q('[data-cv-bmi-range]').textContent = t('此身高对应 BMI 健康范围：{low} 至小于 {high} {unit}', {low:(result.low*factor).toFixed(1), high:(result.high*factor).toFixed(1),unit});
    } catch(error) { status(error.message); }
  }

  function updateDates() {
    status(''); const add = session.dateMode === 'add';
    for (const b of root.querySelectorAll('[data-cv-date-mode]')) b.setAttribute('aria-pressed',String(b.dataset.cvDateMode === session.dateMode));
    q('[data-cv-date-end-field]').hidden = add; q('[data-cv-inclusive-field]').hidden = add; q('[data-cv-offsets]').hidden = !add;
    q('[data-cv-date-result]').textContent = '—'; q('[data-cv-date-meta]').textContent = '';
    q('[data-cv-date-label]').textContent = t(add ? '计算后的日期' : '相隔'); q('[data-cv-date-unit]').textContent = add ? '' : t('天');
    q('[data-cv-date-note]').textContent = t(add ? '可输入负数往前推算；先加减年月并收敛到月底，再加减天数。' : '按公历日期计算，不受夏令时影响；平日仅扣除周六、周日，不含法定节假日调休。');
    for (const id of ['date-start','date-end','years','months','days']) session.dates[id] = q('#cv-'+id).value;
    session.dates.inclusive = q('#cv-inclusive').checked;
    if (!q('#cv-date-start').value || (!add && !q('#cv-date-end').value)) return;
    try {
      if (add) q('[data-cv-date-result]').textContent = addCalendarDate(q('#cv-date-start').value, ...['years','months','days'].map(id => parseConverterNumber(q('#cv-'+id).value) ?? 0));
      else {
        const result = dateDifference(q('#cv-date-start').value,q('#cv-date-end').value,q('#cv-inclusive').checked);
        q('[data-cv-date-result]').textContent = result.days;
        q('[data-cv-date-meta]').textContent = t('{weeks} 周 {days} 天 · {weekdays} 个平日',{weeks:result.weeks,days:result.remainder,weekdays:result.weekdays});
      }
    } catch(error) { status(error.message); }
  }

  function updateTimestamp(source = 'timestamp') {
    status(''); q('[data-cv-zoned]').textContent = '—';
    try {
      const unit = q('#cv-timestamp-unit').value;
      if (source === 'iso') { const value = isoToTimestamp(q('#cv-iso').value,unit); q('#cv-timestamp').value = value === null ? '' : String(value); }
      const date = timestampToDate(q('#cv-timestamp').value,unit);
      if (!date) { if (source !== 'iso') q('#cv-iso').value = ''; return; }
      if (source !== 'iso') q('#cv-iso').value = date.toISOString();
      q('[data-cv-zoned]').textContent = new Intl.DateTimeFormat(getLocale(),{timeZone:q('#cv-timezone').value,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'}).format(date);
    } catch(error) { if(source === 'iso') q('#cv-timestamp').value = ''; else q('#cv-iso').value = ''; status(error.message); }
    session.timestamp = {value:q('#cv-timestamp').value, iso:q('#cv-iso').value, unit:q('#cv-timestamp-unit').value, zone:q('#cv-timezone').value};
  }

  function showCategory(id, save = false) {
    const c = converterCategory(id); if (!c) return;
    radixCleanup?.(); radixCleanup = null;
    cancelRate(); data.category = id; status('');
    q('.cv-app').classList.toggle('cv-radix-active', id === 'radix');
    q('#cv-settings').hidden = true;
    const settingsButton = q('[data-cv-action=settings]');
    settingsButton.setAttribute('aria-expanded','false');
    settingsButton.setAttribute('aria-controls',id === 'radix' ? 'radix-settings' : 'cv-settings');
    settingsButton.setAttribute('aria-label',t(id === 'radix' ? '结果格式' : '换算设置'));
    settingsButton.title = settingsButton.getAttribute('aria-label');
    for (const b of root.querySelectorAll('[data-cv-category]')) b.setAttribute('aria-pressed',String(b.dataset.cvCategory === id));
    q('[data-cv-select]').value = id;
    q('[data-cv-panel]').innerHTML = id === 'radix' ? baseConverterWorkspace({ ...item, data: data.radix }, { embedded: true }) : c.units.length || id === 'currency' ? conversionPanel(c,data) : id === 'calculator' ? calculatorPanel(c) : id === 'bmi' ? bmiPanel(c) : id === 'date' ? datePanel(c,today) : timestampPanel(c);
    if (id === 'radix') {
      // One persistence queue owns all categories, even while a save is in flight.
      const radixDraft = {
        get data() { return data.radix; }, set data(value) { data.radix = value; },
        get dirty() { return draft.dirty; }, get error() { return draft.error; },
        changed: () => draft.changed(), flush: () => draft.flush(),
      };
      radixCleanup = bindBaseConverter(q('[data-cv-panel]'), { ...item, data: data.radix }, { ...host, draft: radixDraft, feedback });
    }
    else if (id === 'currency') loadRate();
    else if (c.units.length) updateNumbers();
    else if (id === 'calculator') { q('#cv-expression').value = session.expression; calc(); renderHistory(); }
    else if (id === 'bmi') { q('#cv-height').value = session.bmi.height; q('#cv-weight').value = session.bmi.weight; q('#cv-bmi-system').value = session.bmi.system; updateBMI(); }
    else if (id === 'date') { for (const [key,value] of Object.entries(session.dates)) { if(key === 'inclusive') q('#cv-inclusive').checked = value; else q('#cv-'+key).value = value; } updateDates(); }
    else if (id === 'timestamp') {
      q('#cv-timestamp').value = session.timestamp?.value ?? String(Math.floor(Date.now()/1000));
      q('#cv-timestamp-unit').value = session.timestamp?.unit || 's'; q('#cv-timezone').value = session.timestamp?.zone || 'Asia/Hong_Kong'; updateTimestamp();
    }
    if (save) draft.changed();
    q('.cv-main').scrollTop = 0;
  }

  async function enableRates() {
    try {
      if (!await requestCurrencyPermission()) throw new Error(t('未获准访问汇率来源。'));
      if (!active) return;
      data.online = true; q('[data-cv-online]').checked = true; draft.changed();
      if (data.category === 'currency') await loadRate(true);
    } catch(error) { if(active) { q('[data-cv-online]').checked = data.online; feedback(error.message); } }
  }

  root.addEventListener('click', async event => {
    const b = event.target.closest('button'); if (!b) return;
    if (b.dataset.cvCategory) { showCategory(b.dataset.cvCategory,true); return; }
    if (b.dataset.cvKey) { calcKey(b.dataset.cvKey); return; }
    if (b.dataset.cvHistory !== undefined) { q('#cv-expression').value = session.history[Number(b.dataset.cvHistory)].result; session.calculated = true; calc(); return; }
    if (b.dataset.cvDateMode) { session.dateMode = b.dataset.cvDateMode; updateDates(); return; }
    const action = b.dataset.cvAction;
    if (action === 'settings') {
      if (data.category === 'radix') setRadixSettings(root, q('#radix-settings').hidden);
      else { const open = q('#cv-settings').hidden; q('#cv-settings').hidden = !open; b.setAttribute('aria-expanded',String(open)); }
    }
    else if (action === 'retry') await draft.flush();
    else if (action === 'swap') { data.pairs[data.category].reverse(); valueState().side = 1-valueState().side; draft.changed(); showCategory(data.category); }
    else if (action === 'copy' && copyValue) { try { await navigator.clipboard.writeText(copyValue); if(active) feedback(t('已复制')); } catch { if(active) feedback(t('复制失败，请选择结果手动复制。')); } }
    else if (action === 'rate') await enableRates();
    else if (action === 'clear-history') { session.history = []; renderHistory(); }
    else if (action === 'now') { q('#cv-timestamp').value = String(q('#cv-timestamp-unit').value === 's' ? Math.floor(Date.now()/1000) : Date.now()); updateTimestamp(); }
  }, events);

  root.addEventListener('input', event => {
    const target = event.target;
    if (target.matches('[data-cv-search]')) {
      const text = target.value.trim().toLocaleLowerCase(); let count = 0;
      for (const c of CONVERTER_CATEGORIES) {
        const matches = `${c.name} ${c.en} ${c.keywords || ''} ${c.units.map(u => `${u.name} ${u.en} ${u.symbol}`).join(' ')}`.toLocaleLowerCase().includes(text);
        q(`[data-cv-category="${c.id}"]`).hidden = !matches; q(`[data-cv-select] option[value="${c.id}"]`).hidden = !matches; if(matches) count++;
      }
      for (const section of root.querySelectorAll('[data-cv-group]')) section.hidden = !section.querySelector('button:not([hidden])');
      q('.cv-nav-empty').hidden = !!count;
    } else if (target.dataset.cvValue !== undefined) { session.values[data.category] = {text:target.value,side:Number(target.dataset.cvValue)}; updateNumbers(); }
    else if (target.id === 'cv-expression') { session.calculated = false; calc(); }
    else if (target.id === 'cv-height' || target.id === 'cv-weight') { session.bmi[target.id === 'cv-height' ? 'height' : 'weight'] = target.value; updateBMI(); }
    else if (['cv-date-start','cv-date-end','cv-years','cv-months','cv-days'].includes(target.id)) updateDates();
    else if (target.id === 'cv-timestamp' || target.id === 'cv-iso') updateTimestamp(target.id === 'cv-iso' ? 'iso' : 'timestamp');
  }, events);

  root.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('[data-cv-select]')) showCategory(target.value,true);
    else if (target.dataset.cvUnit !== undefined) { data.pairs[data.category][Number(target.dataset.cvUnit)] = target.value; draft.changed(); if(data.category === 'currency') loadRate(); else updateNumbers(); }
    else if (target.matches('[data-cv-precision]')) { data.precision = Number(target.value); draft.changed(); updateNumbers(); }
    else if (target.matches('[data-cv-online]')) {
      if(target.checked) enableRates();
      else { data.online = false; cancelRate(); draft.changed(); showRateStatus(); }
    } else if (target.id === 'cv-bmi-system') {
      const old = session.bmi.system; session.bmi.system = target.value;
      try {
        for (const key of ['height','weight']) { const value = parseConverterNumber(session.bmi[key]); if(value !== null) session.bmi[key] = String(Number((value * (key === 'height' ? old === 'metric' ? 1/2.54 : 2.54 : old === 'metric' ? 1/.45359237 : .45359237)).toPrecision(12))); }
      } catch { /* Invalid text remains editable. */ }
      q('#cv-height').value = session.bmi.height; q('#cv-weight').value = session.bmi.weight; updateBMI();
    } else if (target.id === 'cv-inclusive') updateDates();
    else if (target.id === 'cv-timestamp-unit') {
      try { const date = timestampToDate(q('#cv-timestamp').value,target.value === 'ms' ? 's' : 'ms'); if(date) q('#cv-timestamp').value = String(date.getTime() / (target.value === 'ms' ? 1 : 1000)); } catch { /* Show validation below. */ }
      updateTimestamp();
    } else if (target.id === 'cv-timezone') updateTimestamp();
  }, events);

  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && data.category === 'radix' && !q('#radix-settings').hidden) {
      event.preventDefault(); event.stopPropagation(); setRadixSettings(root, false); q('[data-cv-action=settings]').focus(); return;
    }
    if (event.target.id === 'cv-expression' && ['Enter','=','Escape'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); calcKey(event.key === 'Escape' ? 'C' : '='); }
    if (event.target.matches('[data-cv-search]') && event.key === 'Enter') { const b = root.querySelector('[data-cv-category]:not([hidden])'); if(b) { showCategory(b.dataset.cvCategory,true); q('#cv-expression,[data-cv-value],#cv-height,#cv-date-start,#cv-timestamp,#radix-input')?.focus(); } }
  }, events);
  window.addEventListener('pagehide', () => { void draft.flush(); }, events);
  q('[data-cv-precision]').value = String(data.precision); q('[data-cv-online]').checked = data.online;
  notifySave(); showCategory(data.category);
  return () => {
    radixCleanup?.();
    active = false; controller.abort(); cancelRate(); clearTimeout(noticeTimer); draft.notify = null;
    draft.flush().then(saved => { if(saved && !draft.dirty && !draft.notify) drafts.delete(item.id); host.refreshCards(); });
  };
}
