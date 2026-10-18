// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as e } from './html.js';
import { icon } from './icons.js';
import { windowControls } from './widget-app-controls.js';
import { createWidgetDraft } from './widget-drafts.js';
import { COMMON_BASES, RADIX_DIGITS, RADIX_INPUT_LIMIT, RADIX_WORD_BITS, RADIX_INTEGER_DEFAULTS, validateBaseConverterData, convertRadix, formatRadixResult, radixIntegerRange, changeRadixMode, changeRadixInputKind, prefixedBase } from './base-converter.js';

const drafts = new Map();
const codes = { 2: 'BIN', 8: 'OCT', 10: 'DEC', 16: 'HEX' };
const names = { 2: '二进制', 8: '八进制', 10: '十进制', 16: '十六进制' };
const modeNames = { number: '常规数值', signed: '有符号', unsigned: '无符号' };
const baseName = base => names[base] ? t(names[base]) : t('{base} 进制', { base });
const baseOptions = selected => Array.from({ length: 35 }, (_, i) => i + 2).map(base => `<option value="${base}" ${base === selected ? 'selected' : ''}>${baseName(base)}</option>`).join('');

export function baseConverterCard(item) {
  const conversion = convertRadix(item.data);
  const results = conversion.results.slice(0, 4);
  const mode = item.data.mode || 'number';
  return `<div class="radix-card-heading"><span>${icon('code')}${e(item.title || t('进制转换'))}</span><span>${mode === 'number' ? '2–36' : `${mode === 'signed' ? 'i' : 'u'}${item.data.bits || 32}`}</span></div>
    <button type="button" class="radix-card-open" data-action="widget-open" aria-label="${e(item.title || t('进制转换'))}">
      <span class="radix-card-values">${results.length ? results.map(result => `<span class="radix-card-row"><small>${codes[result.base] || result.base}</small><strong>${e(result.display)}</strong></span>`).join('') : `<span class="radix-card-empty">${t(conversion.error ? '检查输入数值' : '输入一个数，同时转换')}</span>`}</span>
      <span class="radix-card-footer">${t(item.widget === 'converter' ? '进制转换' : '打开转换器')}<span aria-hidden="true">↗</span></span>
    </button>`;
}

function resultRows(data, conversion) {
  return data.targets.map(base => {
    const result = conversion.results.find(entry => entry.base === base);
    const reusable = result?.exact && formatRadixResult(conversion, base, { ...data, groupDigits: false, prefixes: false }).text.length <= RADIX_INPUT_LIMIT;
    const status = !result ? '' : conversion.word ? t(result.inputKind === 'bits' ? data.mode === 'signed' && conversion.word.signed < 0n ? '补码' : '位模式' : modeNames[data.mode]) : result.recurring ? t('循环小数') : result.exact ? t('精确') : t('已截断');
    return `<article class="radix-result${base === data.base ? ' is-source' : ''}" data-result-base="${base}">
      <div class="radix-result-label"><span class="radix-base-badge">${codes[base] || 'B' + base}</span><span>${baseName(base)}</span></div>
      <div class="radix-result-number"><span class="radix-equality" aria-label="${t(result && !result.exact ? '近似值' : '等于')}">${result && !result.exact ? '≈' : '='}</span><output aria-label="${e(t('{base} 进制结果', { base }))}">${e(result?.display || '—')}</output><sub>${base}</sub></div>
      <div class="radix-result-tools"><span class="radix-result-status${result && !result.exact ? ' is-approximate' : ''}">${e(status)}</span><button type="button" data-radix-use="${base}" ${reusable ? '' : 'disabled'} aria-label="${e(t('将 {base} 进制结果用作输入', { base }))}" title="${t('将精确结果设为输入，保持数值不变')}">${icon('refresh')}</button><button type="button" data-radix-copy="${base}" ${result ? '' : 'disabled'} aria-label="${e(t('复制 {base} 进制结果', { base }))}" title="${t(result && !result.exact ? '复制近似值' : '复制')}">${icon('copy')}</button></div>
    </article>`;
  }).join('');
}

function formatToggle(key, label, checked) {
  return `<label class="radix-toggle"><input type="checkbox" data-radix-option="${key}" ${checked ? 'checked' : ''}><span>${t(label)}</span></label>`;
}

function integerLimits(data) {
  const range = radixIntegerRange(data.inputKind === 'bits' ? 'unsigned' : data.mode, data.bits);
  return `<span>${t(data.inputKind === 'bits' ? '位模式范围' : '数值范围')}</span><div><button type="button" data-radix-bound="min" title="${t('填入最小值')}"><small>${t('最小值')}</small><code>${range.min}</code></button><button type="button" data-radix-bound="max" title="${t('填入最大值')}"><small>${t('最大值')}</small><code>${range.max}</code></button></div>`;
}

function wordSummary(data, word) {
  const values = ['signed', 'unsigned'].map(mode => `<div class="radix-word-value${data.mode === mode ? ' is-active' : ''}"><span>${t(modeNames[mode])}<small>DEC</small></span><strong data-radix-word="${mode}">${word ? word[mode] : '—'}</strong></div>`).join('');
  const binary = word?.unsigned.toString(2).padStart(data.bits, '0');
  const groups = binary ? binary.match(/.{4}/g).map((digits, group) => `<span class="radix-bit-group"><small>${data.bits - group * 4 - 1}</small><code>${group === 0 ? `<b class="radix-high-bit" title="${t(data.mode === 'signed' ? '符号位' : '最高位')}">${digits[0]}</b>${digits.slice(1)}` : digits}</code></span>`).join('') : `<span class="radix-word-empty">${t('输入有效整数后显示位模式')}</span>`;
  return `<div class="radix-word-heading"><span>${t('同一位模式的两种解读')}</span><span>${t('{bits} 位', { bits: data.bits })}</span></div><div class="radix-word-values">${values}</div><div class="radix-bit-heading"><span>${t('位视图 · 高位 → 低位')}</span><span>${t(data.mode === 'signed' ? '符号位' : '最高位')}${word ? ` ${word.signBit}` : ' —'}</span></div><div class="radix-bit-strip" aria-label="${e(t('{bits} 位二进制位模式', { bits: data.bits }))}">${groups}</div>`;
}

export function baseConverterWorkspace(item, { embedded = false } = {}) {
  const data = { ...RADIX_INTEGER_DEFAULTS, ...(embedded ? item.data : drafts.get(item.id)?.data || item.data) };
  const integer = data.mode !== 'number';
  return `<div class="radix-app${embedded ? ' radix-embedded' : ''}${integer ? ' is-integer' : ''}">
    ${embedded ? '' : `<header class="radix-header"><div class="radix-app-mark" aria-hidden="true">${icon('code')}</div><h2 id="dialog-title" tabindex="-1">${e(item.title)}</h2><button type="button" class="widget-app-button" data-radix-settings aria-label="${t('结果格式')}" title="${t('结果格式')}" aria-expanded="false" aria-controls="radix-settings">${icon('sliders')}</button>${windowControls()}</header>`}
    <div class="radix-workbench">
      <div class="radix-mode-bar"><div class="radix-mode-switch" role="group" aria-label="${t('数值模式')}">${Object.entries(modeNames).map(([mode, label]) => `<button type="button" data-radix-mode="${mode}" aria-pressed="${data.mode === mode}">${t(label)}</button>`).join('')}</div><label class="radix-width" data-radix-word-only ${integer ? '' : 'hidden'}><span>${t('位宽')}</span><select data-radix-width>${RADIX_WORD_BITS.map(bits => `<option value="${bits}" ${bits === data.bits ? 'selected' : ''}>${t('{bits} 位', { bits })}</option>`).join('')}</select></label><span class="radix-mode-caption" data-radix-number-only ${integer ? 'hidden' : ''}>${t('大整数 · 小数 · 循环节')}</span></div>
      <section class="radix-format-settings" id="radix-settings" aria-label="${t('结果格式')}" hidden><div class="radix-format"><div class="radix-fraction-options" data-radix-number-only ${integer ? 'hidden' : ''}><label class="radix-precision"><span>${t('最大小数位数')}</span><input type="number" min="1" max="128" step="1" value="${data.precision}" data-radix-precision aria-describedby="radix-precision-help"></label><p id="radix-precision-help" class="radix-help">${t('1–128 位；超出时截断，不四舍五入。')}</p></div>${formatToggle('uppercase', '字母大写 A–Z', data.uppercase)}${formatToggle('groupDigits', '整数位分组', data.groupDigits)}${formatToggle('prefixes', '显示 0b / 0o / 0x 前缀', data.prefixes)}<div data-radix-word-only ${integer ? '' : 'hidden'}>${formatToggle('padBits', '按位宽补零（2 / 8 / 16 进制）', data.padBits)}</div></div></section>
      <section class="radix-source" aria-label="${t('转换输入')}">
        <div class="radix-source-toolbar"><label class="radix-base-select"><span>${t('输入进制')}</span><select data-radix-base>${baseOptions(data.base)}</select></label><div class="radix-source-presets" role="group" aria-label="${t('常用输入进制')}">${COMMON_BASES.map(base => `<button type="button" data-radix-source="${base}" aria-pressed="${base === data.base}" title="${baseName(base)}">${codes[base]}<small>${base}</small></button>`).join('')}</div></div>
        <div class="radix-input-kind" role="group" aria-label="${t('输入方式')}" data-radix-word-only ${integer ? '' : 'hidden'}><button type="button" data-radix-input-kind="value" aria-pressed="${data.inputKind === 'value'}">${t('数值输入')}</button><button type="button" data-radix-input-kind="bits" aria-pressed="${data.inputKind === 'bits'}">${t('位模式输入')}</button><span data-radix-kind-hint></span></div>
        <div class="radix-input-shell"><label class="sr-only" for="radix-input">${t('待转换数值')}</label><textarea id="radix-input" rows="2" maxlength="${RADIX_INPUT_LIMIT}" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="radix-input-status radix-input-help">${e(data.input)}</textarea><span class="radix-input-base" aria-hidden="true">${data.base}</span></div>
        <div class="radix-input-meta"><p id="radix-input-status" class="radix-input-status" role="status" aria-live="polite"></p><div class="radix-input-actions"><span data-radix-length></span><button type="button" data-radix-paste>${icon('copy')}${t('粘贴')}</button><button type="button" data-radix-clear>${t('清空')}</button></div></div>
        <p id="radix-input-help" class="sr-only" data-radix-input-help></p>
      </section>
      <section class="radix-results-panel" aria-label="${t('转换结果')}">
        <div class="radix-section-heading"><h3>${t('同步转换')}<span data-radix-count>${data.targets.length}</span></h3><div class="radix-result-actions"><button type="button" data-radix-targets-toggle aria-expanded="false" aria-controls="radix-targets">${icon('plus')}${t('调整进制')}</button><button type="button" data-radix-copy-all>${icon('copy')}${t('复制全部')}</button></div></div>
        <div class="radix-target-picker" id="radix-targets" hidden><div role="group" aria-label="${t('显示的常用进制')}">${COMMON_BASES.map(base => `<button type="button" data-radix-target="${base}" aria-pressed="${data.targets.includes(base)}">${baseName(base)}</button>`).join('')}<span data-radix-custom-targets></span></div><div class="radix-add-target"><label class="sr-only" for="radix-extra-base">${t('更多进制')}</label><select id="radix-extra-base" data-radix-extra>${baseOptions(36)}</select><button type="button" data-radix-add>${icon('plus')}${t('添加')}</button></div></div>
        <div class="radix-results" data-radix-results>${resultRows(data, convertRadix(data))}</div>
        <p class="radix-results-note" data-radix-results-note></p>
        <div class="radix-word-summary" data-radix-word-summary data-radix-word-only ${integer ? '' : 'hidden'}>${integer ? wordSummary(data, convertRadix(data).word) : ''}</div>
      </section>
      <details class="radix-guide"><summary>${t('输入规则与示例')}<span>2–36</span></summary><div class="radix-guide-content"><p>${t('当前可用数字')} <code data-radix-digits></code></p><p>${t('A–Z 代表 10–35，不区分大小写。括号表示循环节，例如 0.(3)。')}</p><p>${t('支持负数、小数、空格或下划线分组；粘贴 0b / 0o / 0x 前缀时自动识别进制。')}</p><div data-radix-word-only ${integer ? '' : 'hidden'}><p>${t('常规数值保留负号与小数；整数模式使用指定位宽，有符号数以二进制补码解释。')}</p><p>${t('十进制结果显示所选数值，其余进制显示原始位模式。切换有符号与无符号时保留各位。')}</p><p>${t('改变位宽或输入进制会重新解释当前输入；超出范围不会截断。')}</p></div><div class="radix-limits" data-radix-limits data-radix-word-only ${integer ? '' : 'hidden'}>${integer ? integerLimits(data) : ''}</div><div class="radix-examples" data-radix-number-only ${integer ? 'hidden' : ''}><span>${t('试一试')}</span><button type="button" data-radix-example="255">255</button><button type="button" data-radix-example="-42">−42</button><button type="button" data-radix-example="0.1">0.1</button></div><div class="radix-examples" data-radix-word-only ${integer ? '' : 'hidden'}><span>${t('试一试')}</span><button type="button" data-radix-word-example="zero">0</button><button type="button" data-radix-word-example="sign">${t('仅最高位为 1')}</button><button type="button" data-radix-word-example="ones">${t('全部位为 1')}</button></div></div></details>
    </div>
    ${embedded ? '' : `<footer class="radix-footer"><span data-radix-save role="status">${t('已保存在本机')}</span><button type="button" data-radix-retry hidden>${t('重试保存')}</button><span class="radix-feedback" data-radix-feedback role="status" aria-live="polite"></span><span class="radix-range">BASE 2 — 36</span></footer>`}
  </div>`;
}

export function setRadixSettings(root, open) {
  root.querySelector('#radix-settings').hidden = !open;
  const button = root.querySelector('[data-radix-settings]') || root.closest('.cv-app')?.querySelector('[data-cv-action=settings]') || root.querySelector('[data-cv-action=settings]');
  button?.setAttribute('aria-expanded', String(open));
}

export function bindBaseConverter(root, item, host) {
  const controller = new AbortController(), options = { signal: controller.signal };
  let active = true, conversion, noticeTimer, limitsKey = '';
  const sharedDraft = Boolean(host.draft);
  let draft = host.draft || drafts.get(item.id);
  const feedback = message => {
    if (!active) return;
    if (host.feedback) { host.feedback(message); return; }
    clearTimeout(noticeTimer);
    root.querySelector('[data-radix-feedback]').textContent = message;
    noticeTimer = setTimeout(() => { if (active) root.querySelector('[data-radix-feedback]').textContent = ''; }, 5000);
  };
  const saveStatus = () => {
    if (!active) return;
    const status = root.querySelector('[data-radix-save]');
    if (!status) return;
    status.textContent = t(draft.error ? '保存失败，请重试' : draft.dirty ? '保存中…' : '已保存在本机');
    status.title = draft.error?.message || '';
    root.querySelector('[data-radix-retry]').hidden = !draft.error;
    if (!draft.dirty && !draft.error) host.refreshCards();
  };
  // A failed write keeps its draft available when this widget is reopened.
  if (!draft) {
    draft = createWidgetDraft(item, (...args) => host.saveData(...args), () => draft.notify?.());
    drafts.set(item.id, draft);
  }
  draft.data = validateBaseConverterData(draft.data);
  if (!sharedDraft) draft.notify = saveStatus;
  const input = root.querySelector('#radix-input');
  const update = () => {
    const data = draft.data;
    conversion = convertRadix(data);
    const integer = data.mode !== 'number';
    root.querySelector('.radix-app').classList.toggle('is-integer', integer);
    for (const node of root.querySelectorAll('[data-radix-word-only]')) node.hidden = !integer;
    for (const node of root.querySelectorAll('[data-radix-number-only]')) node.hidden = integer;
    for (const button of root.querySelectorAll('[data-radix-mode]')) button.setAttribute('aria-pressed', String(button.dataset.radixMode === data.mode));
    for (const button of root.querySelectorAll('[data-radix-input-kind]')) button.setAttribute('aria-pressed', String(button.dataset.radixInputKind === data.inputKind));
    root.querySelector('[data-radix-width]').value = String(data.bits);
    root.querySelector('[data-radix-precision]').disabled = integer;
    root.querySelector('[data-radix-input-help]').textContent = t(!integer ? '支持负数、小数、空格或下划线分组；粘贴 0b / 0o / 0x 前缀时自动识别进制。' : data.inputKind === 'bits' ? '按当前进制输入原始位模式。例如 8 位十六进制 FF，可解读为 −1 或 255。' : '按当前进制输入数值并校验范围；要读取 FF 这样的补码，请选择“位模式输入”。');
    root.querySelector('[data-radix-kind-hint]').textContent = t(data.inputKind === 'bits' ? '读取原始位模式' : '保留数值的正负号');
    const nextLimitsKey = `${data.mode}/${data.bits}/${data.inputKind}`;
    if (integer && nextLimitsKey !== limitsKey) root.querySelector('[data-radix-limits]').innerHTML = integerLimits(data);
    limitsKey = nextLimitsKey;
    root.querySelector('[data-radix-word-summary]').innerHTML = integer ? wordSummary(data, conversion.word) : '';
    root.querySelector('[data-radix-results-note]').textContent = t(integer ? '十进制是所选数值，其余进制是位模式；“用作输入”会自动选择对应的输入方式。' : '括号内为循环节；≈ 和 … 表示截断值。“用作输入”仅用于精确结果。');
    root.querySelector('[data-radix-base]').value = String(data.base);
    root.querySelector('.radix-input-base').textContent = data.base;
    root.querySelector('[data-radix-length]').textContent = `${data.input.length} / ${RADIX_INPUT_LIMIT}`;
    root.querySelector('[data-radix-digits]').textContent = RADIX_DIGITS.slice(0, data.base);
    input.setAttribute('aria-invalid', String(Boolean(conversion.error)));
    const status = root.querySelector('#radix-input-status');
    status.classList.toggle('is-error', Boolean(conversion.error));
    const magnitude = conversion.value ? (conversion.value.numerator < 0n ? -conversion.value.numerator : conversion.value.numerator) : 0n;
    status.textContent = conversion.error || (!conversion.value ? t('输入数值后，结果会实时显示。') : integer ? t('{bits} 位{kind} · 范围内，精确转换', { bits: data.bits, kind: t(modeNames[data.mode]) }) : conversion.value.denominator === 1n ? t('整数 · {bits} 个二进制位（绝对值）', { bits: magnitude.toString(2).length }) : t('小数 · 已精确解析'));
    root.querySelector('[data-radix-results]').innerHTML = resultRows(data, conversion);
    root.querySelector('[data-radix-count]').textContent = data.targets.length;
    root.querySelector('[data-radix-custom-targets]').innerHTML = data.targets.filter(base => !COMMON_BASES.includes(base)).map(base => `<button type="button" data-radix-remove="${base}" ${data.targets.length === 1 ? 'disabled' : ''} aria-label="${e(t('移除 {base} 进制结果', { base }))}">${baseName(base)} ×</button>`).join('');
    root.querySelector('[data-radix-copy-all]').disabled = !conversion.value;
    for (const button of root.querySelectorAll('[data-radix-source]')) button.setAttribute('aria-pressed', String(Number(button.dataset.radixSource) === data.base));
    for (const button of root.querySelectorAll('[data-radix-target]')) {
      const selected = data.targets.includes(Number(button.dataset.radixTarget));
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = selected && data.targets.length === 1;
    }
    for (const option of root.querySelector('[data-radix-extra]').options) option.disabled = data.targets.includes(Number(option.value));
    const extra = root.querySelector('[data-radix-extra]');
    if (!extra.value || data.targets.includes(Number(extra.value))) extra.value = [...extra.options].find(option => !option.disabled)?.value || '';
    extra.disabled = data.targets.length === 35;
    root.querySelector('[data-radix-add]').disabled = extra.disabled;
  };
  const changed = () => { draft.changed(); update(); };
  const setInput = (value, base = draft.data.base) => {
    draft.data.input = value; draft.data.base = base; input.value = value; changed(); input.focus();
  };
  const acceptPaste = text => {
    if (text.length > RADIX_INPUT_LIMIT) { feedback(t('最多输入 {count} 个字符。', { count: RADIX_INPUT_LIMIT })); return; }
    setInput(text, prefixedBase(text) || draft.data.base);
  };
  const copy = async (text, truncated = false) => {
    try {
      await navigator.clipboard.writeText(text);
      feedback(t(truncated ? '已复制截断值，请留意小数精度。' : '已复制'));
    } catch { feedback(t('无法访问剪贴板，请选中结果后手动复制。')); }
  };
  root.addEventListener('input', event => {
    if (event.target === input && !event.isComposing) { draft.data.input = input.value; changed(); }
  }, options);
  input.addEventListener('compositionend', () => { draft.data.input = input.value; changed(); }, options);
  input.addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text');
    if (text === undefined) return;
    const start = input.selectionStart, end = input.selectionEnd;
    const next = input.value.slice(0, start) + text + input.value.slice(end);
    if (next.length > RADIX_INPUT_LIMIT) { event.preventDefault(); feedback(t('最多输入 {count} 个字符。', { count: RADIX_INPUT_LIMIT })); return; }
    if (start === 0 && end === input.value.length && prefixedBase(text)) { event.preventDefault(); acceptPaste(text); }
  }, options);
  root.addEventListener('change', event => {
    const target = event.target;
    if (target.hasAttribute('data-radix-base')) { draft.data.base = Number(target.value); changed(); }
    if (target.hasAttribute('data-radix-width')) { draft.data.bits = Number(target.value); changed(); }
    if (target.hasAttribute('data-radix-option')) { draft.data[target.dataset.radixOption] = target.checked; changed(); }
    if (target.hasAttribute('data-radix-precision')) {
      if (!target.value || !target.checkValidity()) { target.reportValidity(); return; }
      draft.data.precision = Number(target.value); changed();
    }
  }, options);
  root.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.hasAttribute('data-radix-settings')) setRadixSettings(root, root.querySelector('#radix-settings').hidden);
    if (button.hasAttribute('data-radix-targets-toggle')) {
      const picker = root.querySelector('#radix-targets');
      picker.hidden = !picker.hidden; button.setAttribute('aria-expanded', String(!picker.hidden));
    }
    if (button.dataset.detailAction === 'window-expand') {
      const dialog = root.closest('dialog'), expanded = dialog.classList.toggle('widget-app-expanded');
      button.setAttribute('aria-pressed', String(expanded));
      button.setAttribute('aria-label', t(expanded ? '还原窗口' : '最大化窗口'));
      button.title = button.getAttribute('aria-label'); button.innerHTML = icon(expanded ? 'minimize' : 'maximize');
    }
    if (button.hasAttribute('data-radix-clear')) setInput('');
    if (button.hasAttribute('data-radix-mode') && button.dataset.radixMode !== draft.data.mode) {
      draft.data = changeRadixMode(draft.data, button.dataset.radixMode);
      input.value = draft.data.input; changed();
    }
    if (button.hasAttribute('data-radix-input-kind') && button.dataset.radixInputKind !== draft.data.inputKind) {
      draft.data = changeRadixInputKind(draft.data, button.dataset.radixInputKind);
      input.value = draft.data.input; changed();
    }
    if (button.hasAttribute('data-radix-bound')) {
      const range = radixIntegerRange(draft.data.inputKind === 'bits' ? 'unsigned' : draft.data.mode, draft.data.bits);
      const value = range[button.dataset.radixBound];
      setInput(draft.data.uppercase ? value.toString(draft.data.base).toUpperCase() : value.toString(draft.data.base));
    }
    if (button.hasAttribute('data-radix-word-example')) {
      const { modulus, half } = radixIntegerRange('unsigned', draft.data.bits);
      const value = button.dataset.radixWordExample === 'ones' ? modulus - 1n : button.dataset.radixWordExample === 'sign' ? half : 0n;
      draft.data.inputKind = 'bits';
      setInput(draft.data.uppercase ? value.toString(16).toUpperCase() : value.toString(16), 16);
    }
    if (button.hasAttribute('data-radix-paste')) {
      try { const text = await navigator.clipboard.readText(); if (active) acceptPaste(text); }
      catch { feedback(t('请在输入框中使用 Ctrl/⌘ + V 粘贴。')); input.focus(); }
    }
    if (button.hasAttribute('data-radix-example')) setInput(button.dataset.radixExample, 10);
    if (button.hasAttribute('data-radix-source')) { draft.data.base = Number(button.dataset.radixSource); changed(); }
    if (button.hasAttribute('data-radix-target')) {
      const base = Number(button.dataset.radixTarget);
      draft.data.targets = draft.data.targets.includes(base) ? draft.data.targets.filter(value => value !== base) : [...draft.data.targets, base];
      changed();
    }
    if (button.hasAttribute('data-radix-add')) {
      const base = Number(root.querySelector('[data-radix-extra]').value);
      if (base >= 2 && base <= 36 && !draft.data.targets.includes(base)) { draft.data.targets.push(base); changed(); }
    }
    if (button.hasAttribute('data-radix-remove') && draft.data.targets.length > 1) {
      draft.data.targets = draft.data.targets.filter(value => value !== Number(button.dataset.radixRemove)); changed();
      root.querySelector('[data-radix-extra]').focus();
    }
    if (button.hasAttribute('data-radix-use') && conversion.value) {
      const base = Number(button.dataset.radixUse);
      const result = formatRadixResult(conversion, base, { ...draft.data, groupDigits: false, prefixes: false });
      if (result.exact && result.text.length <= RADIX_INPUT_LIMIT) { draft.data.inputKind = result.inputKind; setInput(result.text, base); }
    }
    if (button.hasAttribute('data-radix-copy') && conversion.value) {
      const result = formatRadixResult(conversion, Number(button.dataset.radixCopy), { ...draft.data, groupDigits: false });
      await copy(result.text, !result.exact);
    }
    if (button.hasAttribute('data-radix-copy-all') && conversion.value) {
      const context = conversion.word ? [`${t(modeNames[draft.data.mode])} · ${t('{bits} 位', { bits: draft.data.bits })}`, `${t('有符号')}: ${conversion.word.signed} / ${t('无符号')}: ${conversion.word.unsigned}`] : [];
      await copy([...context, ...draft.data.targets.map(base => {
        const result = formatRadixResult(conversion, base, { ...draft.data, groupDigits: false });
        return `${baseName(base)} (${base}): ${result.exact ? '' : '≈ '}${result.display}`;
      })].join('\n'), conversion.results.some(result => !result.exact));
    }
    if (button.hasAttribute('data-radix-retry')) await draft.flush();
  }, options);
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const picker = root.querySelector('#radix-targets');
    if (!picker.hidden) {
      event.preventDefault(); event.stopPropagation(); picker.hidden = true;
      const button = root.querySelector('[data-radix-targets-toggle]');
      button.setAttribute('aria-expanded', 'false'); button.focus();
    } else if (!root.querySelector('#radix-settings').hidden) {
      event.preventDefault(); event.stopPropagation(); setRadixSettings(root, false);
      (root.querySelector('[data-radix-settings]') || root.closest('.cv-app')?.querySelector('[data-cv-action=settings]'))?.focus();
    }
  }, options);
  const flush = () => { void draft.flush(); };
  window.addEventListener('pagehide', flush, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); }, options);
  update(); saveStatus();
  return () => {
    active = false; controller.abort(); clearTimeout(noticeTimer);
    if (sharedDraft) return;
    if (draft.notify === saveStatus) draft.notify = null;
    void draft.flush().then(saved => {
      if (saved && !draft.notify) drafts.delete(item.id);
      if (saved) host.refreshCards();
      else host.toast(t('内容尚未保存，重新打开组件可继续编辑。'));
    });
  };
}
