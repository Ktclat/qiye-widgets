// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { md2, md4, md5 } from './codec-hashes.js';
import { convertFunText } from './codec-fun.js';

export const CODEC_INPUT_LIMIT = 100000;
export const CODEC_ALGORITHMS = Object.freeze([
  {id:'base64', name:'Base64', group:'encoding', hint:'将 UTF-8 文本转为 Base64；解码时允许空白和省略的填充。'},
  {id:'base64url', name:'Base64 URL', group:'encoding', hint:'使用 URL 安全字符 - 和 _，编码结果不带 = 填充。'},
  {id:'url', name:'URL', group:'encoding', hint:'选择编码范围；仅表单模式会将空格与 + 相互转换。'},
  {id:'html', name:'HTML 实体', group:'encoding', hint:'转换 & < > 引号；解码支持 amp、lt、gt、quot、apos、nbsp 和数字实体。'},
  {id:'unicode', name:'Unicode 转义', group:'encoding', hint:'使用 \\uXXXX 转义，支持中文与 emoji；解码也支持 \\u{1F600}。'},
  {id:'hex', name:'Hex · UTF-8', group:'encoding', hint:'在 UTF-8 文本与十六进制字节之间转换；解码允许字节间空白。'},
  {id:'json', name:'JSON 字符串', group:'encoding', hint:'编码为带双引号的 JSON 字符串；解码还原换行、引号和反斜杠。'},
  {id:'buddha', name:'佛曰', group:'fun', badge:'经典版 · 佛曰：', format:'UTF-16LE', hint:'兼容经典“与佛论禅”，保留“佛曰：”前缀；不支持“佛又曰”或“新佛曰”。'},
  {id:'beast', name:'兽音译者', group:'fun', badge:'兽语 · 四字符', format:'UTF-16', hint:'把文本变成嗷呜兽语，支持中文与 emoji。解码会从首尾标记自动识别字表，请保留完整文本。'},
  {id:'bear', name:'熊曰 / 与熊论道', group:'fun', badge:'原版 · 熊曰：呋', format:'UTF-8', hint:'兼容原版“与熊论道”，先压缩再转换字符；解码支持“熊曰：呋”或“呋”开头的文本。'},
  ...['MD2','MD4','MD5','SHA-1','SHA-256','SHA-384','SHA-512'].map(name => ({
    id:name.toLowerCase(), name, group:'hash', bits:name.startsWith('MD') ? 128 : name === 'SHA-1' ? 160 : Number(name.slice(4)),
    hint:['MD2','MD4','MD5','SHA-1'].includes(name) ? '单向摘要，无法解码。此算法仅用于兼容旧系统，不适合密码存储或安全签名。' : '计算 UTF-8 文本的单向摘要，无法从摘要还原原文。',
  })),
].map(Object.freeze));

export function codecAlgorithm(id) { return CODEC_ALGORITHMS.find(algorithm => algorithm.id === id); }
const fail = message => { throw new Error(t(message)); };
const bytesHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

// TextEncoder silently replaces unpaired surrogates. Reject them to avoid
// producing a plausible digest of different text from the user's input.
function validUnicode(text) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('文本包含不完整的 Unicode 字符。');
    } else if (code >= 0xdc00 && code <= 0xdfff) fail('文本包含不完整的 Unicode 字符。');
  }
  return text;
}

function utf8Text(bytes) {
  try { return new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes); }
  catch { return fail('解码后的字节不是有效的 UTF-8 文本。'); }
}

function base64Encode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

function base64Decode(text, urlSafe) {
  const clean = text.replace(/[\t\n\r ]/g, '');
  if (!(urlSafe ? /^[\w-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/).test(clean)) fail('Base64 含有无效字符或填充。');
  const standard = clean.replace(/-/g, '+').replace(/_/g, '/');
  const body = standard.replace(/=+$/, '');
  if (body.length % 4 === 1 || (standard.includes('=') && standard.length % 4 !== 0)) fail('Base64 长度或填充不正确。');
  const padded = body + '='.repeat((4 - body.length % 4) % 4);
  let bytes;
  try { bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0)); }
  catch { return fail('Base64 长度或填充不正确。'); }
  if (base64Encode(bytes) !== padded) fail('Base64 含有非零填充位，请检查末尾字符。');
  return utf8Text(bytes);
}

function decodeUnicode(text) {
  let result = '';
  for (let i = 0; i < text.length;) {
    if (text[i] !== '\\') { result += text[i++]; continue; }
    const match = /^\\u(?:([\da-f]{4})|\{([\da-f]{1,6})\})/i.exec(text.slice(i));
    if (!match) fail('Unicode 转义无效，请使用 \\uXXXX 或 \\u{XXXX}。');
    const code = parseInt(match[1] || match[2], 16);
    if (code > 0x10ffff) fail('Unicode 码点超出有效范围。');
    result += String.fromCodePoint(code);
    i += match[0].length;
  }
  return validUnicode(result);
}

function htmlDecode(text) {
  const entities = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:'\u00a0'};
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity) => {
    if (Object.hasOwn(entities, entity)) return entities[entity];
    if (!entity.startsWith('#')) return match;
    const code = /^#x/i.test(entity) ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) fail('HTML 数字实体包含无效的 Unicode 码点。');
    return String.fromCodePoint(code);
  });
}

export async function convertText(text, id, direction = 'encode', options = {}) {
  if (typeof text !== 'string' || text.length > CODEC_INPUT_LIMIT) fail('输入过长，最多支持 100,000 个 UTF-16 代码单元。');
  const algorithm = codecAlgorithm(id);
  if (!algorithm) fail('不支持的编码算法。');
  if (!['encode','decode'].includes(direction)) fail('不支持的转换方向。');
  validUnicode(text);
  const encode = direction === 'encode';
  if (algorithm.group === 'fun') return validUnicode(await convertFunText(text, id, encode, options, CODEC_INPUT_LIMIT));
  if (algorithm.group === 'hash') {
    if (!encode) fail('哈希摘要是单向的，无法解码。');
    const bytes = new TextEncoder().encode(text), legacy = {md2, md4, md5};
    let result;
    if (Object.hasOwn(legacy, id)) result = legacy[id](bytes);
    else {
      if (!globalThis.crypto?.subtle) fail('当前环境无法计算 SHA 摘要，请使用扩展、HTTPS 或 localhost。');
      result = bytesHex(new Uint8Array(await globalThis.crypto.subtle.digest(algorithm.name, bytes)));
    }
    return options.uppercase ? result.toUpperCase() : result;
  }
  if (id === 'base64' || id === 'base64url') {
    if (!encode) return base64Decode(text, id === 'base64url');
    const result = base64Encode(new TextEncoder().encode(text));
    return id === 'base64url' ? result.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : result;
  }
  if (id === 'url') {
    const mode = options.urlMode || 'component';
    if (!['component','uri','form'].includes(mode)) fail('不支持的 URL 编码范围。');
    try {
      if (mode === 'uri') return encode ? encodeURI(text) : decodeURI(text);
      if (mode === 'form') return encode ? encodeURIComponent(text).replace(/[!'()~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+') : decodeURIComponent(text.replace(/\+/g, ' '));
      return encode ? encodeURIComponent(text) : decodeURIComponent(text);
    } catch { return fail('URL 转义无效，请检查 % 后的十六进制字节和 UTF-8 序列。'); }
  }
  if (id === 'html') return encode ? text.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c])) : htmlDecode(text);
  if (id === 'unicode') return encode ? text.split('').map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('') : decodeUnicode(text);
  if (id === 'hex') {
    if (encode) return bytesHex(new TextEncoder().encode(text));
    const clean = text.replace(/\s/g, '');
    if (!/^(?:[\da-f]{2})*$/i.test(clean)) fail('十六进制输入必须由成对的 0–9、A–F 字符组成。');
    return utf8Text(Uint8Array.from(clean.match(/../g) || [], pair => parseInt(pair, 16)));
  }
  if (encode) return JSON.stringify(text);
  let result;
  try { result = JSON.parse(text); } catch { return fail('请输入带双引号的有效 JSON 字符串。'); }
  if (typeof result !== 'string') fail('只能解码 JSON 字符串，不能解码对象、数组或数字。');
  return validUnicode(result);
}
