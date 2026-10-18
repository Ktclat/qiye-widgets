// SPDX-License-Identifier: GPL-3.0-only
// Local-only image conversion engine. No file bytes leave the browser.
import { inspectImage, MAX_IMAGE_PIXELS } from './image-compression.js';
export const FILE_CONVERTER_FORMATS = Object.freeze({
  png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp',
});
export const FILE_CONVERTER_MAX_FILES = 20;
export const FILE_CONVERTER_MAX_BYTES = 30 * 1024 * 1024;
export const FILE_CONVERTER_MAX_TOTAL_BYTES = 120 * 1024 * 1024;
export const FILE_CONVERTER_MAX_PIXELS = MAX_IMAGE_PIXELS;

export async function detectImageFormat(file) {
  if (!file || typeof file.slice !== 'function') return null;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) return 'png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  if (bytes.length >= 12 && [82,73,70,70].every((b,i) => bytes[i] === b)
    && [87,69,66,80].every((b,i) => bytes[i + 8] === b)) return 'webp';
  return null;
}

export function outputFilename(filename, format, existing = []) {
  if (!Object.hasOwn(FILE_CONVERTER_FORMATS, format)) throw new Error('不支持的输出格式');
  const last = String(filename).split(/[\\/]/).pop() || '';
  const stem = last.replace(/\.[^.]+$/, '').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_').trim().replace(/[. ]+$/, '').slice(0, 90) || 'converted';
  const extension = format === 'jpeg' ? 'jpg' : format;
  const used = new Set(existing.map(name => name.toLowerCase()));
  let candidate = `${stem}.${extension}`;
  for (let suffix = 2; used.has(candidate.toLowerCase()); suffix++) candidate = `${stem} (${suffix}).${extension}`;
  return candidate;
}

export function readableBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function convertImageFile(file, { format = 'webp', quality = 90, signal } = {}) {
  if (!Object.hasOwn(FILE_CONVERTER_FORMATS, format)) throw new Error('不支持的输出格式');
  if (!Number.isInteger(quality) || quality < 50 || quality > 100) throw new Error('画质必须为 50–100');
  if (!file || !Number.isFinite(file.size) || file.size <= 0 || file.size > FILE_CONVERTER_MAX_BYTES) {
    throw new Error('单个文件必须大于 0 且不超过 30 MB');
  }
  if (signal?.aborted) throw new DOMException('已取消转换', 'AbortError');
  const inputFormat = await detectImageFormat(file);
  if (!inputFormat) throw new Error('仅支持有效的 PNG / JPG / WebP 文件');
  // Reuse the bounded container/animation/dimension checks. Detect the real
  // format even if the platform supplied an empty or incorrect MIME type.
  const source = file.slice(0, file.size, FILE_CONVERTER_FORMATS[inputFormat]);
  try { await inspectImage(source, {signal}); }
  catch (error) {
    if (/动画/.test(error.message)) throw new Error('暂不支持动画图片转换，以免丢失动画帧');
    throw error;
  }
  if (signal?.aborted) throw new DOMException('已取消转换', 'AbortError');

  let bitmap;
  let canvas;
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
    if (signal?.aborted) throw new DOMException('已取消转换', 'AbortError');
    if (!Number.isSafeInteger(bitmap.width) || !Number.isSafeInteger(bitmap.height)
      || bitmap.width < 1 || bitmap.height < 1
      || bitmap.width * bitmap.height > FILE_CONVERTER_MAX_PIXELS) {
      throw new Error('图片像素超出限制（最多 2400 万）');
    }
    canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法初始化图片编码器');
    if (format === 'jpeg') {
      // JPEG cannot store an alpha channel; avoid rendering transparency as black.
      context.fillStyle = '#fff';
      context.fillRect(0, 0, bitmap.width, bitmap.height);
    }
    context.drawImage(bitmap, 0, 0);
    const requestedType = FILE_CONVERTER_FORMATS[format];
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片编码失败')),
        requestedType, quality / 100);
    });
    if (signal?.aborted) throw new DOMException('已取消转换', 'AbortError');
    // Canvas silently falls back to PNG for an unsupported output encoder.
    if (blob.type !== requestedType || !blob.size) throw new Error('当前浏览器不支持所选输出格式');
    return { blob, width: bitmap.width, height: bitmap.height, inputFormat };
  } finally {
    bitmap?.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
