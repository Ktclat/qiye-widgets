// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';

/** A deliberately small arithmetic parser: no eval, Function, or executable input. */
export function calculateArithmetic(source) {
  const text = String(source).replace(/[×x]/g, '*').replace(/[÷]/g, '/').replace(/[−]/g, '-').replace(/\s+/g, '');
  if (!text || text.length > 256 || /[^\d.eE+\-*/()%]/.test(text)) throw new Error(t("请输入有效算式"));
  let position = 0;
  let depth = 0;
  function number() {
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(position));
    if (!match) throw new Error(t("算式还没有写完整"));
    position += match[0].length;
    return Number(match[0]);
  }
  function primary() {
    if (++depth > 48) throw new Error(t("括号层数过多"));
    let value;
    if (text[position] === '(') {
      position += 1;
      value = expression();
      if (text[position] !== ')') throw new Error(t("请检查括号"));
      position += 1;
    } else value = number();
    depth -= 1;
    while (text[position] === '%') { value /= 100; position += 1; }
    return value;
  }
  function unary() {
    let sign = 1;
    while (text[position] === '+' || text[position] === '-') { if (text[position] === '-') sign *= -1; position += 1; }
    return sign * primary();
  }
  function term() {
    let value = unary();
    while (text[position] === '*' || text[position] === '/') {
      const operator = text[position++];
      const right = unary();
      if (operator === '/' && right === 0) throw new Error(t("不能除以 0"));
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  }
  function expression() {
    let value = term();
    while (text[position] === '+' || text[position] === '-') {
      const operator = text[position++];
      const right = term();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }
  const value = expression();
  if (position !== text.length) throw new Error(t("请检查算式"));
  if (!Number.isFinite(value)) throw new Error(t("结果超出计算范围"));
  return Number(value.toPrecision(12));
}

