// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
export function invalid(path, reason) { throw new Error(`${t("数据校验失败：{v0}{v1}", {v0: path, v1: reason ? ` ${reason}` : ''})}`); }
export function plain(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, t("必须是对象"));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(path, t("不能包含特殊对象"));
  return value;
}
export function keys(value, allowed, path) {
  plain(value, path);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) invalid(path, t("包含不安全字段"));
    if (!allowed.includes(key)) invalid(`${path}.${key}`, t("不是支持的字段"));
  }
  return value;
}
export function string(value, path, max = 120, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) invalid(path, `${t("必须是{v0}文本，最多 {v1} 个字符", {v0: allowEmpty ? '' : t("非空"), v1: max})}`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) invalid(path, t("包含控制字符"));
  return value;
}
export function id(value, path) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) invalid(path, t("标识格式不正确"));
  return value;
}
export function number(value, path, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid(path, `${t("必须是 {v0}–{v1} 范围内的{v2}", {v0: min, v1: max, v2: integer ? t("整数") : t("数字")})}`);
  return value;
}
export function bool(value, path) { if (typeof value !== 'boolean') invalid(path, t("必须是布尔值")); return value; }
export function enumeration(value, values, path) { if (!values.includes(value)) invalid(path, t("包含不支持的值")); return value; }
export function array(value, path, max, min = 0) { if (!Array.isArray(value) || value.length < min || value.length > max) invalid(path, `${t("必须是 {v0}–{v1} 项的数组", {v0: min, v1: max})}`); return value; }
export function color(value, path) { if (typeof value !== 'string' || !/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) invalid(path, t("必须是十六进制颜色")); return value; }
export function opaqueColor(value, path) { if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) invalid(path, t("必须是六位十六进制颜色")); return value; }
export function date(value, path) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(path, t("日期格式须为 YYYY-MM-DD"));
  const [year, month, day] = value.split('-').map(Number);
  const check = new Date(`${value}T12:00:00Z`);
  if (year < 1900 || year > 2200 || check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) invalid(path, t("不是有效日期"));
  return value;
}
export function time(value, path) { if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) invalid(path, t("时间格式须为 HH:MM")); return value; }
export function unique(values, path) { if (new Set(values).size !== values.length) invalid(path, t("存在重复标识")); }
export function byteLength(value) { return new TextEncoder().encode(value).byteLength; }

