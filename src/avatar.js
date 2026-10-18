// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
/** Local avatar decoding and storage boundary. No network requests are used. */
export const MAX_AVATAR_BYTES = 256 * 1024;
export const MAX_AVATAR_FILE_BYTES = 4 * 1024 * 1024;
export const AVATAR_SIZE = 256;

const AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_AVATAR_PIXELS = 40 * 1024 * 1024;

function avatarError(message = t("头像仅支持有效的 PNG、JPEG 或 WebP 图片")) { throw new Error(message); }
function avatarTag(bytes, offset) { return String.fromCharCode(...bytes.subarray(offset, offset + 4)); }
function avatarDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) avatarError();
  if (width > 16384 || height > 16384 || width * height > MAX_AVATAR_PIXELS) avatarError(t("头像图片分辨率过大，请先缩小图片"));
  return { width, height };
}

// Check container signatures before image decoding. Imported data URLs must also
// be static; uploaded PNG/WebP animations are flattened by the canvas below.
function inspectAvatarBytes(bytes, mime, allowAnimation = false) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let dimensions = null;
  if (mime === 'image/png') {
    if (bytes.length < 45 || bytes[0] !== 0x89 || avatarTag(bytes, 1) !== 'PNG\r' ||
      bytes[5] !== 10 || bytes[6] !== 26 || bytes[7] !== 10) avatarError();
    let offset = 8, imageData = false, ended = false;
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset);
      if (size > bytes.length - offset - 12) avatarError();
      const type = avatarTag(bytes, offset + 4);
      if (offset === 8 && (type !== 'IHDR' || size !== 13)) avatarError();
      if (type === 'IHDR') {
        if (offset !== 8 || size !== 13) avatarError();
        dimensions = avatarDimensions(view.getUint32(offset + 8), view.getUint32(offset + 12));
      }
      if (type === 'acTL' && !allowAnimation) avatarError(t("头像必须是静态图片，请通过上传重新生成头像"));
      if (type === 'IDAT' && size > 0) imageData = true;
      offset += size + 12;
      if (type === 'IEND') {
        if (size !== 0 || offset !== bytes.length) avatarError();
        ended = true;
        break;
      }
    }
    if (!ended || !imageData || !dimensions) avatarError();
  } else if (mime === 'image/jpeg') {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) avatarError();
    let offset = 2;
    const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 1 < bytes.length) {
      if (bytes[offset++] !== 0xff) avatarError();
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) avatarError();
      const size = view.getUint16(offset);
      if (size < 2 || size > bytes.length - offset) avatarError();
      if (frames.has(marker)) {
        if (size < 8) avatarError();
        dimensions = avatarDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      }
      if (marker === 0xda) break; // Pixel data is checked by the browser decoder.
      offset += size;
    }
    if (!dimensions) avatarError();
  } else if (mime === 'image/webp') {
    if (bytes.length < 26 || avatarTag(bytes, 0) !== 'RIFF' || avatarTag(bytes, 8) !== 'WEBP' ||
      view.getUint32(4, true) !== bytes.length - 8) avatarError();
    let offset = 12, hasFrame = false;
    while (offset + 8 <= bytes.length) {
      const type = avatarTag(bytes, offset);
      const size = view.getUint32(offset + 4, true);
      const data = offset + 8;
      if (size > bytes.length - data) avatarError();
      if (type === 'VP8X') {
        if (size < 10) avatarError();
        if ((bytes[data] & 0x02) && !allowAnimation) avatarError(t("头像必须是静态图片，请通过上传重新生成头像"));
        const width = 1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16);
        const height = 1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16);
        dimensions = avatarDimensions(width, height);
      }
      if (type === 'ANIM' || type === 'ANMF') {
        if (!allowAnimation) avatarError(t("头像必须是静态图片，请通过上传重新生成头像"));
        if (type === 'ANMF') hasFrame = true;
      }
      if (type === 'VP8L') {
        if (size < 5 || bytes[data] !== 0x2f) avatarError();
        const width = 1 + bytes[data + 1] + ((bytes[data + 2] & 0x3f) << 8);
        const height = 1 + (bytes[data + 2] >> 6) + (bytes[data + 3] << 2) + ((bytes[data + 4] & 0x0f) << 10);
        dimensions ||= avatarDimensions(width, height);
        hasFrame = true;
      }
      if (type === 'VP8 ') {
        if (size < 10 || bytes[data + 3] !== 0x9d || bytes[data + 4] !== 1 || bytes[data + 5] !== 0x2a) avatarError();
        dimensions ||= avatarDimensions(view.getUint16(data + 6, true) & 0x3fff, view.getUint16(data + 8, true) & 0x3fff);
        hasFrame = true;
      }
      offset = data + size + (size % 2);
    }
    if (offset !== bytes.length || !hasFrame || !dimensions) avatarError();
  } else avatarError();
  return dimensions;
}

/** A strict, bounded data URL boundary shared by imports, storage and uploads. */
export function validateAvatarDataUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('data:')) avatarError(t("头像仅支持本地 PNG、JPEG 或 WebP 的 data URL"));
  // Reject large strings before allocating decoded bytes.
  if (value.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 32) avatarError(t("头像不能超过 256 KiB"));
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) avatarError(t("头像仅支持 PNG、JPEG 或 WebP 的 base64 数据"));
  const size = match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  if (size > MAX_AVATAR_BYTES) avatarError(t("头像不能超过 256 KiB"));
  let binary;
  try { binary = atob(match[2]); } catch { avatarError(t("头像的 base64 数据无效")); }
  if (btoa(binary) !== match[2]) avatarError(t("头像的 base64 数据无效"));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  inspectAvatarBytes(bytes, match[1]);
  return value;
}

async function decodeLocalAvatar(file) {
  if (typeof globalThis.createImageBitmap === 'function') {
    const image = await globalThis.createImageBitmap(file, { imageOrientation: 'from-image' });
    return { image, width: image.width, height: image.height, release: () => image.close() };
  }
  if (!globalThis.Image || !globalThis.URL?.createObjectURL) avatarError(t("当前浏览器无法读取本地图片"));
  const objectUrl = globalThis.URL.createObjectURL(file);
  const image = new globalThis.Image();
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(t("头像读取超时，请选择另一张图片"))), 15000);
      image.onload = () => { clearTimeout(timeout); resolve(); };
      image.onerror = () => { clearTimeout(timeout); reject(new Error(t("头像图片无法解码，请选择另一张图片"))); };
      image.src = objectUrl;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight, release: () => { image.src = ''; } };
  } finally {
    image.onload = image.onerror = null;
    globalThis.URL.revokeObjectURL(objectUrl);
  }
}

function createAvatarCanvas(size) {
  if (!globalThis.document?.createElement) avatarError(t("当前浏览器无法处理本地图片"));
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
}

/**
 * Flatten a local PNG/JPEG/WebP into a centered 256 px square. Dependencies may
 * be supplied by non-browser callers; output still passes the storage boundary.
 */
export async function normalizeAvatarFile(file, { decodeImage = decodeLocalAvatar, createCanvas = createAvatarCanvas } = {}) {
  if (!(file instanceof Blob) || !AVATAR_TYPES.has(file.type)) avatarError(t("请选择 PNG、JPEG 或 WebP 图片作为头像"));
  if (!file.size) avatarError(t("头像文件为空"));
  if (file.size > MAX_AVATAR_FILE_BYTES) avatarError(t("上传的头像文件不能超过 4 MiB"));
  const bytes = new Uint8Array(await file.arrayBuffer());
  inspectAvatarBytes(bytes, file.type, true);
  let decoded;
  try {
    try { decoded = await decodeImage(file); }
    catch { avatarError(t("头像图片无法解码，请选择另一张图片")); }
    if (!decoded?.image) avatarError(t("头像图片无法解码，请选择另一张图片"));
    const { width, height } = avatarDimensions(decoded.width, decoded.height);
    const canvas = createCanvas(AVATAR_SIZE);
    const context = canvas?.getContext?.('2d', { alpha: true });
    if (!context || typeof canvas.toDataURL !== 'function') avatarError(t("当前浏览器无法处理本地图片"));
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const side = Math.min(width, height);
    context.drawImage(decoded.image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    // Browsers that cannot encode WebP return PNG automatically.
    let result = canvas.toDataURL('image/webp', 0.9);
    if (result.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 32) result = canvas.toDataURL('image/webp', 0.75);
    return validateAvatarDataUrl(result);
  } finally {
    try { decoded?.release?.(); } catch { /* Decoding resources must not mask the result. */ }
  }
}
