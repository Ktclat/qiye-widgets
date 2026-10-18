// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';

// Independent format implementations. Protocol tables, upstream references and
// compatibility fixtures are documented in docs/THIRD_PARTY.md.
const BUDDHA = '滅苦婆娑耶陀跋多漫都殿悉夜爍帝吉利阿無南那怛喝羯勝摩伽謹波者穆僧室藝尼瑟地彌菩提蘇醯盧呼舍佛參沙伊隸麼遮闍度蒙孕薩夷迦他姪豆特逝朋輸楞栗寫數曳諦羅曰咒即密若般故不實真訶切一除能等是上明大神知三藐耨得依諸世槃涅竟究想夢倒顛離遠怖恐有礙心所以亦智道。集盡死老至';
const BUDDHA_MARKERS = '冥奢梵呐俱哆怯諳罰侄缽皤';
const BEAR = '食性很雜既溫和會誘捕動物家住山洞沒有冬眠偶爾襲擊人類呱哞嗄哈嘍啽唬咯呦嗷嗡哮嗥嗒嗚吖吃嗅嘶噔咬噗嘿嚁噤囑非常喜歡堅果魚肉蜂蜜註取象發達你覺出更盜森氏我誒怎寶麼圖現破嚄告訴樣呆萌笨拙意';
export const BEAST_ALPHABET = '嗷呜啊~';
class FunCodecError extends Error {}
const fail = message => { throw new FunCodecError(t(message)); };
const cleanCiphertext = text => text.replace(/\s/g, '');

async function buddha(text, encode) {
  if (!globalThis.crypto?.subtle) fail('当前环境无法处理佛曰，请使用扩展、HTTPS 或 localhost。');
  // The classic format fixes the key and IV, including their trailing spaces.
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('XDXDtudou@KeyFansClub^_^Encode!!'.padEnd(32, ' ')), 'AES-CBC', false, [encode ? 'encrypt' : 'decrypt']);
  const parameters = {name:'AES-CBC', iv:new TextEncoder().encode('Potato@Key@_@=_='.padEnd(16, ' '))};
  if (encode) {
    const bytes = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) { bytes[i*2] = text.charCodeAt(i) & 255; bytes[i*2+1] = text.charCodeAt(i) >>> 8; }
    const encrypted = new Uint8Array(await crypto.subtle.encrypt(parameters, key, bytes));
    const markers = crypto.getRandomValues(new Uint8Array(Math.min(encrypted.length, 65536)));
    let result = '佛曰：';
    for (let i = 0; i < encrypted.length; i++) {
      const byte = encrypted[i];
      if (byte >= 128) result += BUDDHA_MARKERS[markers[i % markers.length] % BUDDHA_MARKERS.length];
      result += BUDDHA[byte & 127];
    }
    return result;
  }
  const ciphertext = cleanCiphertext(text);
  if (!/^佛曰[:：]/.test(ciphertext)) fail('请输入以“佛曰：”开头的经典版密文；不支持“佛又曰”或“新佛曰”。');
  const body = ciphertext.slice(3), values = [];
  for (let i = 0; i < body.length; i++) {
    const high = BUDDHA_MARKERS.includes(body[i]);
    const low = BUDDHA.indexOf(body[high ? ++i : i] ?? '\0');
    if (low < 0) fail('佛曰密文含有无效字符或不完整的标记。');
    values.push(low + (high ? 128 : 0));
  }
  if (!values.length || values.length % 16) fail('佛曰密文长度不正确，请检查是否复制完整。');
  try {
    const decrypted = await crypto.subtle.decrypt(parameters, key, new Uint8Array(values));
    return new TextDecoder('utf-16le', {fatal:true, ignoreBOM:true}).decode(decrypted);
  } catch { return fail('佛曰解码失败，密文可能损坏或使用了其他版本。'); }
}

function beastAlphabet(value) {
  if (typeof value !== 'string' || value.length !== 4 || new Set(value).size !== 4 || /[\s\ud800-\udfff]/.test(value)) fail('兽音字表需要 4 个不同的字符，不能包含空白或 emoji。');
  return value;
}

function beast(text, encode, options) {
  if (encode) {
    const alphabet = beastAlphabet(options.beastAlphabet ?? BEAST_ALPHABET);
    let result = alphabet[3] + alphabet[1] + alphabet[0];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      for (let nibble = 0; nibble < 4; nibble++) {
        const value = ((code >>> (12 - nibble * 4)) + i * 4 + nibble) & 15;
        result += alphabet[value >>> 2] + alphabet[value & 3];
      }
    }
    return result + alphabet[2];
  }
  const body = cleanCiphertext(text);
  if (body.length < 4 || (body.length - 4) % 8) fail('兽音长度不正确，请保留完整的三个起始字符和一个结束字符。');
  const alphabet = beastAlphabet(body[2] + body[1] + body.at(-1) + body[0]);
  let result = '', code = 0;
  for (let i = 3, nibble = 0; i < body.length - 1; i += 2, nibble++) {
    const high = alphabet.indexOf(body[i]), low = alphabet.indexOf(body[i+1]);
    if (high < 0 || low < 0) fail('兽音密文中出现了字表以外的字符。');
    code = (code << 4) | ((high * 4 + low - nibble) & 15);
    if (nibble % 4 === 3) { result += String.fromCharCode(code); code = 0; }
  }
  return result;
}

function bearSymbols(bytes) {
  const symbols = [];
  let buffer = 0, bits = 0;
  for (const byte of bytes) {
    buffer |= byte << bits;
    bits += 8;
    if (bits > 13) {
      let pair = buffer & 8191;
      const take = pair > 88 ? 13 : 14;
      if (take === 14) pair = buffer & 16383;
      symbols.push(BEAR[pair % 91], BEAR[Math.floor(pair / 91)]);
      buffer >>>= take; bits -= take;
    }
  }
  if (bits) {
    symbols.push(BEAR[buffer % 91]);
    if (bits > 7 || buffer > 90) symbols.push(BEAR[Math.floor(buffer / 91)]);
  }
  return symbols.reverse().join('');
}

function bearBytes(symbols) {
  let buffer = 0, bits = 0, first = -1;
  const bytes = [];
  for (let i = symbols.length - 1; i >= 0; i--) {
    const value = BEAR.indexOf(symbols[i]);
    if (value < 0) fail('熊曰密文含有无效字符。');
    if (first < 0) { first = value; continue; }
    const pair = first + value * 91;
    buffer |= pair << bits;
    bits += (pair & 8191) > 88 ? 13 : 14;
    while (bits >= 8) { bytes.push(buffer & 255); buffer >>>= 8; bits -= 8; }
    first = -1;
  }
  if (first >= 0) bytes.push((buffer | first << bits) & 255);
  const result = new Uint8Array(bytes);
  if (bearSymbols(result) !== symbols) fail('熊曰密文尾部不完整或填充无效。');
  return result;
}

async function rawDeflate(bytes, encode, limit) {
  let transform;
  try { transform = encode ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw'); }
  catch { return fail('当前浏览器不支持熊曰所需的压缩格式，请升级浏览器。'); }
  // Bound each native inflate write as well as collected output: a single
  // compressed blob chunk could otherwise enqueue a very large expansion.
  let cursor = 0;
  const source = new ReadableStream({pull(controller) {
    if (cursor === bytes.length) { controller.close(); return; }
    const end = Math.min(bytes.length, cursor + 1024);
    controller.enqueue(bytes.subarray(cursor, end)); cursor = end;
  }});
  const reader = source.pipeThrough(transform).getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        fail('解码结果过长，最多支持 100,000 个 UTF-16 代码单元。');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

async function bear(text, encode, limit) {
  if (encode) return '熊曰：呋' + bearSymbols(await rawDeflate(new TextEncoder().encode(text), true, limit * 4));
  const ciphertext = cleanCiphertext(text).replace(/^熊曰[:：]/, '');
  if (!ciphertext.startsWith('呋')) fail('请输入以“熊曰：呋”或“呋”开头的原版熊曰密文。');
  const compressed = bearBytes(ciphertext.slice(1));
  let bytes;
  try { bytes = await rawDeflate(compressed, false, limit * 3); }
  catch (error) {
    // Preserve actionable feature/limit messages; native stream errors denote
    // damaged, truncated or trailing compressed data.
    if (error instanceof FunCodecError) throw error;
    return fail('熊曰解码失败，密文可能损坏或使用了其他版本。');
  }
  try { return new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes); }
  catch { return fail('熊曰解码后的内容不是有效的 UTF-8 文本。'); }
}

export async function convertFunText(text, id, encode, options, limit) {
  if (id === 'beast' && encode && text.length * 8 + 4 > limit) fail('兽音最多编码 12,499 个 UTF-16 代码单元；每个代码单元会变成 8 个字符。');
  const result = id === 'buddha' ? await buddha(text, encode) : id === 'beast' ? beast(text, encode, options) : await bear(text, encode, limit);
  if (result.length > limit) fail(encode ? '转换结果过长，请缩短输入（最多 100,000 个 UTF-16 代码单元）。' : '解码结果过长，最多支持 100,000 个 UTF-16 代码单元。');
  return result;
}
