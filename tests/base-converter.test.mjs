import test from 'node:test';
import assert from 'node:assert/strict';
import { newBaseConverterData, validateBaseConverterData, parseRadix, formatRadix, convertRadix, prefixedBase, RADIX_WORD_BITS, RADIX_INTEGER_DEFAULTS, radixIntegerRange, formatRadixResult, changeRadixMode, changeRadixInputKind } from '../src/base-converter.js';
import { baseConverterWorkspace } from '../src/base-converter-view.js';
import { newWidgetConfig } from '../src/widget-registry.js';
import { newWidgetData } from '../src/widget-data.js';
import { renderWidget } from '../src/widgets.js';
import { DEFAULT_STATE, validateImport, exportState } from './fixtures/legacy-host.js';
import { TILE_SIZES } from '../src/widget-sizes.js';
import { setLocale } from '../src/i18n.js';
import { createWidgetDraft } from '../src/widget-drafts.js';

const convert = (input, from, to, options = {}) => formatRadix(parseRadix(input, from), to, options);

test('common bases convert simultaneously and handle exact values outside the safe integer range', () => {
  assert.deepEqual(convertRadix(newBaseConverterData()).results.map(result => result.text), ['11111111', '377', '255', 'FF']);
  assert.equal(convert('18446744073709551615', 10, 16).text, 'FFFFFFFFFFFFFFFF');
  assert.equal(convert('9007199254740993', 10, 16).text, '20000000000001');
  assert.equal(convert('-0xFFFFFFFFFFFFFFFF', 16, 10).text, '-18446744073709551615');
  assert.equal(convert('Z'.repeat(512), 36, 2).text, (36n ** 512n - 1n).toString(2));
});

test('all 35 bases round trip large positive and negative integers', () => {
  for (let base = 2; base <= 36; base++) {
    for (const value of [0n, 1n, -1n, 123456789012345678901234567890n, -(2n ** 200n)]) {
      assert.deepEqual(parseRadix(formatRadix({ numerator: value, denominator: 1n }, base).text, base), { numerator: value, denominator: 1n });
    }
  }
});

test('fractions, signs, prefixes, grouping and letter case are parsed without floating point', () => {
  for (const [input, base, numerator, denominator] of [
    ['-0', 10, 0n, 1n], ['+.5', 10, 1n, 2n], ['12.', 10, 12n, 1n],
    ['-0Xf.f', 16, -255n, 16n], ['0b1010.01', 2, 41n, 4n], ['0O7.4', 8, 15n, 2n],
    ['  1 000_000  ', 10, 1000000n, 1n], ['aBc', 16, 2748n, 1n], ['.1', 3, 1n, 3n],
    ['0b10', 16, 2832n, 1n], ['0x', 36, 33n, 1n],
  ]) assert.deepEqual(parseRadix(input, base), { numerator, denominator }, `${input} base ${base}`);
  assert.equal(convert('-10.625', 10, 2).text, '-1010.101');
  assert.equal(prefixedBase(' -0Xf '), 16);
  assert.equal(prefixedBase('123'), null);
});

test('recurring notation is exact and reusable, including nonrecurring leading digits', () => {
  assert.equal(convert('0.1', 10, 2).text, '0.0(0011)');
  assert.equal(convert('0.1', 10, 16).text, '0.1(9)');
  assert.equal(convert('0.(3)', 10, 3).text, '0.1');
  assert.deepEqual(parseRadix('-12.34(56)', 10), { numerator: -61111n, denominator: 4950n });
  assert.deepEqual(parseRadix('0.(9)', 10), { numerator: 1n, denominator: 1n });
  for (let from = 2; from <= 36; from++) {
    const original = parseRadix('1.1', from);
    for (let to = 2; to <= 36; to++) {
      const result = formatRadix(original, to, { precision: 128 });
      assert.equal(result.exact, true);
      assert.deepEqual(parseRadix(result.text, to), original, `base ${from} to ${to}`);
    }
  }
});

test('fractional precision distinguishes exact, recurring and truncated results at the boundary', () => {
  const truncated = convert('0.1', 10, 2, { precision: 4 });
  assert.equal(truncated.display, '0.0001…');
  assert.equal(truncated.exact, false);
  assert.equal(convert('0.1', 10, 2, { precision: 5 }).text, '0.0(0011)');
  assert.equal(convert('0.1', 10, 2, { precision: 5 }).exact, true);
  assert.equal(convert('0.125', 10, 2, { precision: 3 }).text, '0.001');
  assert.equal(convert('0.125', 10, 2, { precision: 3 }).exact, true);
  assert.equal(convert('-0.00001', 10, 2, { precision: 2 }).display, '-0.00…');
  assert.equal(convert('1234567890', 10, 10, { precision: 1 }).text, '1234567890');
});

test('formatted integers can be grouped and prefixed without changing their value', () => {
  assert.equal(convert('-65535.5', 10, 16, { groupDigits: true, prefixes: true, uppercase: false }).text, '-0xffff.8');
  assert.equal(convert('65536', 10, 16, { groupDigits: true, prefixes: true }).text, '0x1 0000');
  assert.equal(convert('65535', 10, 2, { groupDigits: true }).text, '1111 1111 1111 1111');
  assert.equal(convert('1000000', 10, 10, { groupDigits: true }).text, '1 000 000');
});

test('invalid syntax and digits never silently produce partial or stale results', () => {
  for (const [input, base] of [['2', 2], ['0xFF', 10], ['0b2', 2], ['1e3', 10], ['Infinity', 10], ['1.2.3', 10], ['--1', 10], ['.', 10], ['-', 10], ['0x', 16], ['1-2', 10], ['1,000', 10], ['1 .2', 10], ['1_ .2', 10], ['_123', 10], ['1_', 10], ['(3)', 10], ['0.()', 10], ['1'.repeat(513), 10], ['<script>', 10]]) {
    assert.throws(() => parseRadix(input, base), input);
    const conversion = convertRadix({ ...newBaseConverterData(), input, base });
    assert.ok(conversion.error, input);
    assert.deepEqual(conversion.results, [], input);
  }
  assert.equal(parseRadix('', 10), null);
  for (const base of [1, 37, 2.5, '10', NaN]) assert.throws(() => parseRadix('10', base));
});

test('widget data validates limits, stays independent and survives desktop backup restore', () => {
  const data = newWidgetData('base-converter'), other = newWidgetData('base-converter');
  data.targets.push(36); data.input = '-FFFF.F'; data.base = 16;
  assert.deepEqual(other, newBaseConverterData());
  const state = structuredClone(DEFAULT_STATE);
  state.items.push({ id: 'base-test', type: 'widget', widget: 'base-converter', title: '进制转换', groupId: 'home', size: '4x2', config: newWidgetConfig('base-converter'), data });
  assert.deepEqual(validateImport(exportState(state)).items.find(item => item.id === 'base-test').data.radix, data);
  for (const changes of [{ targets: [] }, { targets: [2, 2] }, { targets: [37] }, { input: '1'.repeat(513) }, { base: 1 }, { base: '10' }, { precision: 0 }, { precision: 129 }, { uppercase: 1 }, { groupDigits: 'yes' }, { surprise: true }]) {
    assert.throws(() => validateBaseConverterData({ ...data, ...changes }));
  }
  for (const key of Object.keys(data).filter(key => !(key in RADIX_INTEGER_DEFAULTS))) { const incomplete = { ...data }; delete incomplete[key]; assert.throws(() => validateBaseConverterData(incomplete)); }
});

test('all five card sizes expose the converter and escape user content', () => {
  const item = { id: 'radix-test', widget: 'base-converter', title: '<img src=x>', config: {}, data: newBaseConverterData() };
  for (const size of TILE_SIZES) {
    const html = renderWidget({ ...item, size }, DEFAULT_STATE);
    assert.match(html, /data-action="widget-open"/);
    assert.match(html, /&lt;img src=x&gt;/);
    assert.doesNotMatch(html, /<img src=x>/);
    for (const mode of ['signed', 'unsigned']) {
      const integerHtml = renderWidget({ ...item, size, data: { ...item.data, mode, bits: 64 } }, DEFAULT_STATE);
      assert.match(integerHtml, new RegExp(`${mode === 'signed' ? 'i' : 'u'}64`));
    }
  }
  const html = baseConverterWorkspace({ ...item, data: { ...item.data, input: '</textarea><script>alert(1)</script>' } });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;\/textarea&gt;/);
  assert.equal((html.match(/data-result-base=/g) || []).length, 4);
});

test('converter labels and validation errors follow the English locale', () => {
  setLocale('en');
  try {
    const html = baseConverterWorkspace({ id: 'radix-en', title: 'Base converter', data: newBaseConverterData() });
    assert.match(html, /Input base/);
    assert.match(html, /Hexadecimal/);
    assert.doesNotMatch(html, /[\u4e00-\u9fff]/);
    assert.throws(() => parseRadix('8', 8), /not a base 8 digit/);
    for (const mode of ['signed', 'unsigned']) {
      const integerHtml = baseConverterWorkspace({ id: 'word-en', title: 'Base converter', data: { ...newBaseConverterData(), mode, bits: 8, input: 'FF', base: 16, inputKind: 'bits' } });
      assert.doesNotMatch(integerHtml, /[\u4e00-\u9fff]/);
      assert.match(integerHtml, /One bit pattern, two interpretations/);
    }
  } finally { setLocale('zh-CN'); }
});

const wordData = changes => ({ ...newBaseConverterData(), mode: 'signed', bits: 8, input: '-1', ...changes });

test('consecutive draft saves keep the persisted comparison stable across integer switches', async () => {
  let current = newBaseConverterData();
  const draft = createWidgetDraft({ id: 'radix-save', data: current }, async (id, data, expected) => {
    assert.equal(JSON.stringify(current), expected, 'the application compares the in-memory data with the last normalized save');
    current = structuredClone(data);
    return validateBaseConverterData(data);
  });
  draft.data = validateBaseConverterData(draft.data);
  for (const edit of [
    data => ({ ...data, input: '-1' }),
    data => changeRadixMode(data, 'signed'),
    data => changeRadixInputKind(data, 'bits'),
    data => changeRadixMode(data, 'unsigned'),
    data => ({ ...data, bits: 64, prefixes: true }),
    data => changeRadixMode(data, 'number'),
  ]) {
    draft.data = edit(draft.data); draft.changed();
    assert.equal(await draft.flush(), true);
    assert.equal(draft.error, null);
  }
});

test('signed and unsigned bounds remain exact for every supported width', () => {
  for (const bits of RADIX_WORD_BITS) {
    const half = 1n << BigInt(bits - 1), mask = (half << 1n) - 1n;
    for (const mode of ['signed', 'unsigned']) {
      const { min, max } = radixIntegerRange(mode, bits);
      assert.equal(min, mode === 'signed' ? -half : 0n);
      assert.equal(max, mode === 'signed' ? half - 1n : mask);
      for (const value of [min, 0n, 1n, max, ...(mode === 'signed' ? [-1n] : [])]) {
        const result = convertRadix(wordData({ mode, bits, input: String(value) }));
        assert.equal(result.error, '');
        assert.equal(result.value.numerator, value);
        assert.equal(result.word.unsigned, BigInt.asUintN(bits, value));
        assert.equal(result.word.signed, BigInt.asIntN(bits, value));
        assert.equal(result.results.find(row => row.base === 2).text.length, bits);
        assert.equal(result.results.find(row => row.base === 8).text.length, Math.ceil(bits / 3));
        assert.equal(result.results.find(row => row.base === 16).text.length, bits / 4);
      }
      for (const input of [String(min - 1n), String(max + 1n), '0.5', '0.(3)']) {
        const result = convertRadix(wordData({ mode, bits, input }));
        assert.ok(result.error, `${mode}/${bits}/${input}`);
        assert.equal(result.word, null);
        assert.equal(result.value, null);
        assert.deepEqual(result.results, []);
      }
    }
  }
});

test('every 8-bit pattern decodes to the same signed and unsigned interpretations in every base', () => {
  for (let value = 0n; value < 256n; value++) {
    for (let base = 2; base <= 36; base++) {
      const result = convertRadix(wordData({ input: value.toString(base), base, inputKind: 'bits' }));
      assert.equal(result.error, '');
      assert.equal(result.word.unsigned, value);
      assert.equal(result.word.signed, BigInt.asIntN(8, value));
    }
  }
});

test('bit patterns reject overflows and negative values without wrapping', () => {
  for (const bits of RADIX_WORD_BITS) {
    const modulus = 1n << BigInt(bits);
    for (const input of ['-1', String(modulus), String(modulus * 10n), '0.1']) {
      const result = convertRadix(wordData({ bits, input, inputKind: 'bits' }));
      assert.ok(result.error);
      assert.deepEqual(result.results, []);
    }
  }
  assert.ok(convertRadix(wordData({ input: 'FF', base: 16, inputKind: 'value' })).error);
  assert.equal(convertRadix(wordData({ input: 'FF', base: 16, inputKind: 'bits' })).word.signed, -1n);
  assert.equal(convertRadix(wordData({ input: '0.0', inputKind: 'bits' })).word.unsigned, 0n);
});

test('all result bases round trip by carrying their input interpretation', () => {
  for (const bits of RADIX_WORD_BITS) for (const mode of ['signed', 'unsigned']) {
    for (const input of [mode === 'signed' ? '-1' : String((1n << BigInt(bits)) - 1n), '0', '17']) {
      const data = wordData({ bits, mode, input }), conversion = convertRadix(data);
      for (let base = 2; base <= 36; base++) {
        const row = formatRadixResult(conversion, base, data);
        const reused = convertRadix({ ...data, base, input: row.text, inputKind: row.inputKind });
        assert.equal(reused.value.numerator, conversion.value.numerator);
        assert.equal(reused.word.unsigned, conversion.word.unsigned);
      }
    }
  }
});

test('mode and input-kind switches preserve the valid bit pattern or numeric value', () => {
  for (const base of [2, 8, 10, 16, 36]) {
    const signed = wordData({ base, input: '-1' });
    const unsigned = changeRadixMode(signed, 'unsigned');
    assert.equal(convertRadix(unsigned).word.unsigned, 255n);
    assert.equal(convertRadix(changeRadixMode(unsigned, 'signed')).value.numerator, -1n);
    const raw = changeRadixInputKind(signed, 'bits');
    assert.equal(raw.inputKind, 'bits');
    assert.equal(convertRadix(raw).word.unsigned, 255n);
    assert.equal(changeRadixInputKind(raw, 'value').input, '-1');
    const general = changeRadixMode(raw, 'number');
    assert.equal(general.inputKind, 'value');
    assert.equal(convertRadix(general).value.numerator, -1n);
    assert.equal(convertRadix(general).word, null);
  }
  const wider = convertRadix(wordData({ input: 'FF', base: 16, inputKind: 'bits', bits: 16 }));
  assert.equal(wider.word.signed, 255n, 'width changes reinterpret the original input');
  assert.equal(convertRadix(changeRadixInputKind(wordData({ input: '255' }), 'bits')).word.signed, -1n, 'an invalid numeric value can be explicitly interpreted as bits');
});

test('word formatting pads only binary, octal and hex and keeps copied values reusable', () => {
  const data = wordData({ bits: 16, input: '15', groupDigits: true, prefixes: true, uppercase: false });
  const conversion = convertRadix(data);
  assert.deepEqual(conversion.results.map(row => row.text), ['0b0000 0000 0000 1111', '0o000 017', '15', '0x000f']);
  assert.equal(formatRadixResult(conversion, 16, { ...data, padBits: false }).text, '0xf');
  const negative = convertRadix(wordData({ input: '-1' }));
  assert.deepEqual(negative.results.map(row => row.text), ['11111111', '377', '-1', 'FF']);
  assert.equal(formatRadixResult(negative, 3).text, '100110');
  const precise64 = convertRadix(wordData({ mode: 'unsigned', bits: 64, input: '18446744073709551615' }));
  assert.equal(precise64.results.find(row => row.base === 16).text, 'FFFFFFFFFFFFFFFF');
});

test('legacy backups gain safe defaults while new integer settings are strictly validated and persisted', () => {
  const legacy = newBaseConverterData();
  for (const key of Object.keys(RADIX_INTEGER_DEFAULTS)) delete legacy[key];
  assert.deepEqual(validateBaseConverterData(legacy), newBaseConverterData());
  for (const patch of [{ mode: 'float' }, { mode: null }, { bits: 0 }, { bits: 256 }, { bits: '8' }, { inputKind: 'auto' }, { padBits: 'true' }]) {
    assert.throws(() => validateBaseConverterData({ ...wordData({}), ...patch }));
  }
  const state = structuredClone(DEFAULT_STATE), data = wordData({ bits: 128, input: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', base: 16, inputKind: 'bits', padBits: false });
  state.items.push({ id: 'word-backup', type: 'widget', widget: 'base-converter', title: '进制转换', groupId: 'home', size: '4x2', config: {}, data });
  const restored = validateImport(exportState(state)).items.find(item => item.id === 'word-backup');
  assert.deepEqual(restored.data.radix, data);
  assert.equal(convertRadix(restored.data.radix).word.signed, -1n);
});
