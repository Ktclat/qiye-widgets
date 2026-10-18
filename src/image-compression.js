// SPDX-License-Identifier: GPL-3.0-only
// Shared, offline image compressor. Temporary blobs never enter desktop state.
export const MAX_IMAGE_INPUT_BYTES = 32 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 24_000_000;
const MAX_PNG_RAW_BYTES = 128 * 1024 * 1024;
const PNG_SIGNATURE = [137,80,78,71,13,10,26,10];

function cancelled(signal) {
  if (signal?.aborted) throw new DOMException('Image compression cancelled', 'AbortError');
}
function pngNumber(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}
function writeNumber(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value);
}
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const chunk = new Uint8Array(12 + data.length);
  writeNumber(chunk, 0, data.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  writeNumber(chunk, chunk.length - 4, crc32(chunk.subarray(4, chunk.length - 4)));
  return chunk;
}
function joinBytes(parts, total) {
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.length; }
  return joined;
}
function parsePng(bytes) {
  if (bytes.length < 45 || !PNG_SIGNATURE.every((v, i) => bytes[i] === v)) throw new Error('PNG 文件签名无效');
  const chunks = [];
  let offset = 8, sawIHDR = false, sawIDAT = false, sawIEND = false, animated = false;
  let width = 0, height = 0;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('PNG 数据不完整');
    const length = pngNumber(bytes, offset), end = offset + 12 + length;
    if (length > bytes.length - offset - 12 || end > bytes.length) throw new Error('PNG 块越界');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error('PNG 块类型无效');
    if (!sawIHDR) {
      if (type !== 'IHDR' || length !== 13) throw new Error('PNG 缺少有效 IHDR');
      width = pngNumber(bytes, offset + 8);
      height = pngNumber(bytes, offset + 12);
      if (!width || !height || width * height > MAX_IMAGE_PIXELS) throw new Error('图片像素数量超出安全限制');
      sawIHDR = true;
    } else if (type === 'IHDR') throw new Error('PNG IHDR 重复');
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') animated = true;
    if (type === 'IDAT') sawIDAT = true;
    chunks.push({type, start: offset, end, data: bytes.subarray(offset + 8, end - 4)});
    offset = end;
    if (type === 'IEND') {
      if (length || offset !== bytes.length) throw new Error('PNG 结束块无效');
      sawIEND = true;
      break;
    }
  }
  if (!sawIDAT || !sawIEND) throw new Error('PNG 缺少图像数据或结束块');
  return {chunks, animated, width, height};
}
function webpAnimated(bytes) {
  if (bytes.length < 20) return false;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4);
    const size = view.getUint32(0, true), data = offset + 8;
    if (data + size > bytes.length) throw new Error('WebP 块越界');
    if (type === 'ANIM' || type === 'ANMF') return true;
    if (type === 'VP8X' && size >= 1 && (bytes[data] & 2)) return true;
    offset = data + size + (size % 2);
  }
  return false;
}
function identify(bytes, declared) {
  if (PNG_SIGNATURE.every((v, i) => bytes[i] === v)) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  throw new Error('仅支持静态 PNG、JPEG 和 WebP 图片');
}
export async function inspectImage(file, {signal} = {}) {
  if (!(file instanceof Blob) || !file.size || file.size > MAX_IMAGE_INPUT_BYTES)
    throw new Error('图片须为不超过 32 MiB 的有效文件');
  cancelled(signal);
  const bytes = new Uint8Array(await file.arrayBuffer());
  cancelled(signal);
  const type = identify(bytes);
  if (file.type && file.type !== type) throw new Error('图片声明格式与实际格式不一致');
  let png;
  if (type === 'image/png') {
    png = parsePng(bytes);
    if (png.animated) throw new Error('APNG 动画暂不支持压缩，以免丢失动画帧');
  } else if (type === 'image/webp' && webpAnimated(bytes))
    throw new Error('动画 WebP 暂不支持压缩，以免丢失动画帧');
  if (type !== 'image/png') {
    const {width, height} = rasterDimensions(bytes, type);
    if (!width || !height || width * height > MAX_IMAGE_PIXELS)
      throw new Error('图片像素数量超出安全限制');
  }
  return {type, bytes, png};
}
// Inspect dimensions before asking the browser to allocate decoded pixel memory.
function rasterDimensions(bytes, type) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'image/jpeg') {
    for (let at = 2; at < bytes.length;) {
      if (bytes[at++] !== 255) break;
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (at + 2 > bytes.length) break;
      const length = view.getUint16(at);
      if (length < 2 || at + length > bytes.length) break;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4,0xc8,0xcc].includes(marker)) {
        if (length < 8) break;
        return {width:view.getUint16(at + 5), height:view.getUint16(at + 3)};
      }
      at += length;
    }
  } else if (bytes.length >= 20 && view.getUint32(4, true) === bytes.length - 8) {
    const uint24 = at => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
    for (let at = 12; at + 8 <= bytes.length;) {
      const name = String.fromCharCode(...bytes.subarray(at, at + 4));
      const size = view.getUint32(at + 4, true), start = at + 8;
      if (start + size > bytes.length) break;
      if (name === 'VP8X' && size === 10)
        return {width:1 + uint24(start + 4), height:1 + uint24(start + 7)};
      if (name === 'VP8 ' && size >= 10 && bytes[start + 3] === 0x9d && bytes[start + 4] === 1 && bytes[start + 5] === 0x2a)
        return {width:view.getUint16(start + 6, true) & 0x3fff, height:view.getUint16(start + 8, true) & 0x3fff};
      if (name === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
        const bits = view.getUint32(start + 1, true);
        return {width:1 + (bits & 0x3fff), height:1 + ((bits >>> 14) & 0x3fff)};
      }
      at = start + size + size % 2;
    }
  }
  throw new Error('图片尺寸信息无效');
}
async function readBounded(stream, limit, signal) {
  const reader = stream.getReader();
  let size = 0;
  const parts = [];
  try {
    for (;;) {
      cancelled(signal);
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('PNG 解压数据超过安全限制');
      parts.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  return joinBytes(parts, size);
}
async function recompressPngIdat(chunks, width, height, signal) {
  if (!globalThis.DecompressionStream || !globalThis.CompressionStream) return null;
  const parts = chunks.filter(c => c.type === 'IDAT').map(c => c.data);
  const total = parts.reduce((n, p) => n + p.length, 0);
  if (total > 16 * 1024 * 1024) return null;
  const compressed = joinBytes(parts, total);
  const maxRaw = Math.min(MAX_PNG_RAW_BYTES, width * height * 9 + height * 2 + 65536);
  const raw = await readBounded(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate')), maxRaw, signal);
  cancelled(signal);
  const encoded = await readBounded(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate')), total + 1024 * 1024, signal);
  return encoded.length < compressed.length ? encoded : null;
}
/**
 * Lossless PNG: preserves every PNG image/color chunk, optionally recompresses
 * DEFLATE scanlines and removes only textual/time metadata. Never rasterizes pixels.
 */
export async function optimizePngLossless(file, inspected, {signal} = {}) {
  const {bytes, png} = inspected || await inspectImage(file, {signal});
  if (!png) throw new Error('真正无损优化目前仅支持 PNG');
  cancelled(signal);
  let recompressed = null;
  try {
    recompressed = await recompressPngIdat(png.chunks, png.width, png.height, signal);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    // Encoders may reject some legal PNG variations. Retain the original IDAT.
  }
  const parts = [bytes.subarray(0, 8)];
  let emitted = false;
  for (const chunk of png.chunks) {
    cancelled(signal);
    // Text annotations and timestamps do not participate in image decoding.
    if (['tEXt','zTXt','iTXt','tIME'].includes(chunk.type)) continue;
    if (chunk.type === 'IDAT' && recompressed) {
      if (!emitted) { parts.push(pngChunk('IDAT', recompressed)); emitted = true; }
      continue;
    }
    parts.push(bytes.subarray(chunk.start, chunk.end));
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  // The standard PNG signature, IDATs and all required image metadata survive.
  if (total >= bytes.length) return file;
  // An unchanged IDAT stream is also truly pixel-lossless.
  const result = new Blob([joinBytes(parts, total)], {type:'image/png'});
  return result.size < file.size ? result : file;
}
function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    if (!canvas.toBlob) { reject(new Error('当前浏览器不支持图片编码')); return; }
    canvas.toBlob(blob => blob && blob.type === type ? resolve(blob)
      : reject(new Error('当前浏览器不支持所选编码格式')), type, quality);
  });
}
function result(file, blob, type, method) {
  return {blob, type, method, originalBytes:file.size, outputBytes:blob.size,
    savedBytes:Math.max(0, file.size - blob.size), changed:blob !== file};
}
export async function compressImage(file, options = {}) {
  const {mode = 'smart', quality = 0.9, format = 'webp', maxBytes = Infinity, signal} = options;
  if (!['smart','high','compact','lossless'].includes(mode) ||
      !['webp','jpeg'].includes(format) || !Number.isFinite(quality) ||
      quality < 0.6 || quality > 1 || !(maxBytes > 0))
    throw new Error('图片压缩选项无效');
  const inspected = await inspectImage(file, {signal});
  const initial = result(file, file, inspected.type, 'original');
  if (mode === 'lossless') {
    const blob = await optimizePngLossless(file, inspected, {signal});
    if (blob.size > maxBytes) throw new Error('无损优化后仍超出文件大小上限，请切换高画质模式');
    return result(file, blob, 'image/png', blob === file ? 'original' : 'png-lossless');
  }
  if (format === 'jpeg' && inspected.type !== 'image/jpeg')
    throw new Error('为避免透明度丢失，JPEG 输出目前仅接受 JPEG 原图');
  cancelled(signal);
  if (!globalThis.createImageBitmap || !globalThis.document)
    throw new Error('当前环境缺少图片解码或 Canvas 支持');
  const bitmap = await createImageBitmap(file, {imageOrientation:'from-image'});
  let canvas;
  try {
    cancelled(signal);
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS)
      throw new Error('图片像素数量超出安全限制');
    canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', {alpha:true});
    if (!ctx) throw new Error('无法初始化图片画布');
    ctx.drawImage(bitmap, 0, 0);
    const targetType = format === 'jpeg' ? 'image/jpeg' : 'image/webp';
    const startingQuality = mode === 'compact' ? Math.min(quality, 0.78) : quality;
    let best = initial;
    const qualitySteps = mode === 'smart'
      ? [startingQuality, 0.84, 0.76, 0.68, 0.62]
      : [startingQuality];
    for (const q of [...new Set(qualitySteps)]) {
      cancelled(signal);
      const blob = await canvasBlob(canvas, targetType, q);
      cancelled(signal);
      if (blob.size < best.outputBytes) best = result(file, blob, targetType, 'lossy');
      if (best.changed && best.outputBytes <= maxBytes && mode === 'smart') break;
    }
    if (best.outputBytes > maxBytes) throw new Error('高画质压缩后仍超出 4 MiB 限制；请使用图片压缩工具手动调整');
    return best;
  } finally {
    bitmap.close?.();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
export function downloadName(name, type) {
  const safe = String(name || 'image').replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_').replace(/\.(png|jpe?g|webp)$/i, '').slice(0, 90) || 'image';
  return safe + (type === 'image/png' ? '.png' : type === 'image/jpeg' ? '.jpg' : '.webp');
}
function zipPart(length) { return new Uint8Array(length); }
function zip16(view, at, n) { view.setUint16(at, n, true); }
function zip32(view, at, n) { view.setUint32(at, n, true); }
/** Standards-compliant STORE ZIP of already-compressed images; no dependencies. */
export async function createImageZip(entries, {signal} = {}) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 10)
    throw new Error('批量下载支持 1–10 张图片');
  const encoder = new TextEncoder(), local = [], central = [];
  let offset = 0, size = 0;
  for (let i = 0; i < entries.length; i++) {
    cancelled(signal);
    const entry = entries[i];
    if (!(entry.blob instanceof Blob)) throw new Error('ZIP 输入不是图片文件');
    const name = encoder.encode(String(i + 1).padStart(2, '0') + '-' + downloadName(entry.name, entry.blob.type));
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    size += data.length;
    if (size > 100 * 1024 * 1024) throw new Error('ZIP 总容量不能超过 100 MiB');
    const crc = crc32(data);
    const head = zipPart(30 + name.length), hv = new DataView(head.buffer);
    zip32(hv, 0, 0x04034b50); zip16(hv, 4, 20); zip16(hv, 6, 0x0800);
    zip16(hv, 12, 33); // Deterministic valid DOS date: 1980-01-01.
    zip16(hv, 8, 0); zip32(hv, 14, crc); zip32(hv, 18, data.length);
    zip32(hv, 22, data.length); zip16(hv, 26, name.length); head.set(name, 30);
    const cent = zipPart(46 + name.length), cv = new DataView(cent.buffer);
    zip32(cv, 0, 0x02014b50); zip16(cv, 4, 20); zip16(cv, 6, 20);
    zip16(cv, 14, 33);
    zip16(cv, 8, 0x0800); zip16(cv, 10, 0); zip32(cv, 16, crc);
    zip32(cv, 20, data.length); zip32(cv, 24, data.length);
    zip16(cv, 28, name.length); zip32(cv, 42, offset); cent.set(name, 46);
    local.push(head, data); central.push(cent);
    offset += head.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = zipPart(22), ev = new DataView(end.buffer);
  zip32(ev, 0, 0x06054b50);
  zip16(ev, 8, entries.length); zip16(ev, 10, entries.length);
  zip32(ev, 12, centralSize); zip32(ev, 16, offset);
  return new Blob([...local, ...central, end], {type:'application/zip'});
}
