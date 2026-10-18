// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { keys, string, number, array, unique, bool, enumeration } from './validation.js';

export const RADIX_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const RADIX_INPUT_LIMIT = 512;
export const COMMON_BASES = Object.freeze([2, 8, 10, 16]);
export const RADIX_WORD_BITS = Object.freeze([8, 16, 32, 64, 128]);
export const RADIX_INTEGER_DEFAULTS = Object.freeze({ mode: 'number', bits: 32, inputKind: 'value', padBits: true });
const prefixes = { 2: '0b', 8: '0o', 16: '0x' };

export function newBaseConverterData() {
  return { input: '255', base: 10, targets: [...COMMON_BASES], precision: 32, uppercase: true, groupDigits: false, prefixes: false, ...RADIX_INTEGER_DEFAULTS };
}

export function validateBaseConverterData(raw, path = 'data') {
  keys(raw, ['input', 'base', 'targets', 'precision', 'uppercase', 'groupDigits', 'prefixes', 'mode', 'bits', 'inputKind', 'padBits'], path);
  const targets = array(raw.targets, `${path}.targets`, 35, 1).map(base => number(base, `${path}.targets`, 2, 36, true));
  unique(targets, `${path}.targets`);
  return {
    input: string(raw.input, `${path}.input`, RADIX_INPUT_LIMIT, true),
    base: number(raw.base, `${path}.base`, 2, 36, true), targets,
    precision: number(raw.precision, `${path}.precision`, 1, 128, true),
    uppercase: bool(raw.uppercase, `${path}.uppercase`),
    groupDigits: bool(raw.groupDigits, `${path}.groupDigits`),
    prefixes: bool(raw.prefixes, `${path}.prefixes`),
    mode: enumeration(raw.mode === undefined ? 'number' : raw.mode, ['number', 'signed', 'unsigned'], `${path}.mode`),
    bits: enumeration(raw.bits === undefined ? 32 : raw.bits, RADIX_WORD_BITS, `${path}.bits`),
    inputKind: enumeration(raw.inputKind === undefined ? 'value' : raw.inputKind, ['value', 'bits'], `${path}.inputKind`),
    padBits: bool(raw.padBits === undefined ? true : raw.padBits, `${path}.padBits`),
  };
}

export function prefixedBase(input) {
  const match = /^[+-]?0([box])/i.exec(String(input).trim());
  return match ? { b: 2, o: 8, x: 16 }[match[1].toLowerCase()] : null;
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

// Parse into a reduced rational. No floating point conversion is involved.
// Parentheses denote recurring digits, so exact results can be used as inputs.
export function parseRadix(input, base) {
  if (!Number.isInteger(base) || base < 2 || base > 36) throw new Error(t('进制必须是 2–36 之间的整数。'));
  const raw = String(input).trim();
  if (!raw) return null;
  if (String(input).length > RADIX_INPUT_LIMIT) throw new Error(t('最多输入 {count} 个字符。', { count: RADIX_INPUT_LIMIT }));
  let text = raw.toUpperCase(), sign = 1n;
  if (/^[+-]/.test(text)) { if (text[0] === '-') sign = -1n; text = text.slice(1); }
  const prefixBase = prefixedBase(text);
  // In higher bases B, O and X can be ordinary digits. Only consume a matching
  // prefix; reject mismatches where the prefix letter is not a legal digit.
  if (prefixBase === base) text = text.slice(2);
  else if (prefixBase && RADIX_DIGITS.indexOf(text[1]) >= base) {
    throw new Error(t('前缀对应 {base} 进制，请切换输入进制。', { base: prefixBase }));
  }
  // Allow visual digit groups, but do not silently join separated numbers/signs.
  if (/[\s_]/.test(text)) {
    if (!/^[0-9A-Z.()]+(?:[\s_]+[0-9A-Z.()]+)*$/.test(text)
        || /(?:^|[^0-9A-Z])[\s_]|[\s_](?:$|[^0-9A-Z])/.test(text)) {
      throw new Error(t('分隔符只能放在两个数字之间。'));
    }
    text = text.replace(/[\s_]+/g, '');
  }
  const match = /^([0-9A-Z]*)(?:\.([0-9A-Z]*)(?:\(([0-9A-Z]+)\))?)?$/.exec(text);
  if (!match || !(match[1] || match[2] || match[3])) {
    throw new Error(t('请输入有效数值；支持负号、小数点和括号内的循环节。'));
  }
  for (const digit of (match[1] + (match[2] || '') + (match[3] || ''))) {
    if (RADIX_DIGITS.indexOf(digit) >= base) throw new Error(t('“{digit}”不属于 {base} 进制；可用字符为 {digits}。', { digit, base, digits: RADIX_DIGITS.slice(0, base) }));
  }
  const radix = BigInt(base);
  const integer = digits => [...digits].reduce((value, digit) => value * radix + BigInt(RADIX_DIGITS.indexOf(digit)), 0n);
  const fraction = match[2] || '', recurring = match[3] || '';
  let denominator = radix ** BigInt(fraction.length);
  let numerator = integer(match[1]) * denominator + integer(fraction);
  if (recurring) {
    const cycle = radix ** BigInt(recurring.length) - 1n;
    numerator = numerator * cycle + integer(recurring);
    denominator *= cycle;
  }
  const divisor = gcd(numerator, denominator);
  return { numerator: sign * numerator / divisor, denominator: denominator / divisor };
}

export function formatRadix(value, base, options = {}) {
  if (!Number.isInteger(base) || base < 2 || base > 36) throw new Error(t('进制必须是 2–36 之间的整数。'));
  const precision = Math.max(1, Math.min(128, Math.trunc(options.precision) || 32));
  const negative = value.numerator < 0n, magnitude = negative ? -value.numerator : value.numerator;
  const radix = BigInt(base), whole = (magnitude / value.denominator).toString(base).padStart(options.integerDigits || 0, '0');
  let remainder = magnitude % value.denominator, fraction = '', repeatAt = -1;
  const seen = new Map();
  while (remainder) {
    if (seen.has(remainder)) { repeatAt = seen.get(remainder); break; }
    if (fraction.length >= precision) break;
    seen.set(remainder, fraction.length);
    remainder *= radix;
    fraction += RADIX_DIGITS[Number(remainder / value.denominator)];
    remainder %= value.denominator;
  }
  const truncated = remainder !== 0n && repeatAt < 0;
  const tail = repeatAt < 0 ? fraction : `${fraction.slice(0, repeatAt)}(${fraction.slice(repeatAt)})`;
  let integer = options.uppercase === false ? whole : whole.toUpperCase();
  if (options.groupDigits) {
    const group = base === 2 || base === 16 ? 4 : 3;
    integer = integer.replace(new RegExp(`\\B(?=(.{${group}})+$)`, 'g'), ' ');
  }
  const prefix = options.prefixes ? prefixes[base] || '' : '';
  const digits = options.uppercase === false ? tail.toLowerCase() : tail;
  const text = `${negative ? '-' : ''}${prefix}${integer}${digits ? '.' + digits : ''}`;
  return { base, text, display: text + (truncated ? '…' : ''), exact: !truncated, recurring: repeatAt >= 0, fractionDigits: fraction.length };
}

export function radixIntegerRange(mode, bits) {
  enumeration(mode, ['signed', 'unsigned'], 'mode');
  enumeration(bits, RADIX_WORD_BITS, 'bits');
  const modulus = 1n << BigInt(bits), half = modulus >> 1n;
  return { min: mode === 'signed' ? -half : 0n, max: mode === 'signed' ? half - 1n : modulus - 1n, modulus, half };
}

function integerWord(value, data) {
  const { mode, bits, inputKind } = data;
  const range = radixIntegerRange(mode, bits);
  if (value.denominator !== 1n) throw new Error(t('整数模式不接受小数，请切换到“常规数值”。'));
  enumeration(inputKind, ['value', 'bits'], 'inputKind');
  const input = value.numerator, rawBits = inputKind === 'bits';
  const min = rawBits ? 0n : range.min, max = rawBits ? range.modulus - 1n : range.max;
  if (input < min || input > max) {
    throw new Error(t('超出 {bits} 位{kind}范围：{min} 至 {max}。不会自动截断。', {
      bits, kind: t(rawBits ? '位模式' : mode === 'signed' ? '有符号整数' : '无符号整数'), min: String(min), max: String(max),
    }));
  }
  const unsigned = input < 0n ? input + range.modulus : input;
  const signed = unsigned >= range.half ? unsigned - range.modulus : unsigned;
  return { bits, signed, unsigned, value: mode === 'signed' ? signed : unsigned, signBit: unsigned >= range.half ? 1 : 0 };
}

// Decimal displays the selected interpretation; other bases display the same
// unsigned bit pattern. A result carries its input kind for exact reuse.
export function formatRadixResult(conversion, base, options = {}) {
  const bitPattern = Boolean(conversion.word && base !== 10);
  const value = bitPattern ? { numerator: conversion.word.unsigned, denominator: 1n } : conversion.value;
  const groupBits = { 2: 1, 8: 3, 16: 4 }[base];
  const integerDigits = bitPattern && options.padBits !== false && groupBits ? Math.ceil(conversion.word.bits / groupBits) : 0;
  return { ...formatRadix(value, base, { ...options, integerDigits }), inputKind: bitPattern ? 'bits' : 'value' };
}

export function convertRadix(raw) {
  const data = { ...RADIX_INTEGER_DEFAULTS, ...raw };
  try {
    const parsed = parseRadix(data.input, data.base);
    const word = parsed && data.mode !== 'number' ? integerWord(parsed, data) : null;
    const value = word ? { numerator: word.value, denominator: 1n } : parsed;
    const conversion = { value, word, results: [], error: '' };
    if (value) conversion.results = data.targets.map(base => formatRadixResult(conversion, base, data));
    return conversion;
  } catch (error) { return { value: null, word: null, results: [], error: error.message }; }
}

export function changeRadixMode(raw, mode) {
  enumeration(mode, ['number', 'signed', 'unsigned'], 'mode');
  const data = validateBaseConverterData(raw), conversion = convertRadix(data);
  const next = { ...data, mode };
  if (mode === 'number' || data.mode === 'number') next.inputKind = 'value';
  if (conversion.word && next.inputKind === 'value') {
    const value = mode === 'number' ? conversion.word.value : conversion.word[mode];
    next.input = formatRadix({ numerator: value, denominator: 1n }, data.base, { uppercase: data.uppercase }).text;
  }
  return next;
}

export function changeRadixInputKind(raw, inputKind) {
  enumeration(inputKind, ['value', 'bits'], 'inputKind');
  const data = validateBaseConverterData(raw), conversion = convertRadix(data);
  const next = { ...data, inputKind };
  if (conversion.word) {
    const value = inputKind === 'bits' ? conversion.word.unsigned : conversion.word.value;
    next.input = formatRadix({ numerator: value, denominator: 1n }, data.base, { uppercase: data.uppercase }).text;
  }
  return next;
}
