// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { validateAvatarDataUrl } from './avatar.js';

/** Persist an explicitly chosen native asset, never a proxy URL or executable
 * markup. Local uploads are re-encoded through the existing static image boundary.
 * This field is independent of the best-image cache so later renders cannot
 * silently replace a user's choice. */
export function normalizeIconSelection(value) {
 if (value === undefined || value === null || value === '') return null;
 if (typeof value !== 'string') return null;
 if (value.startsWith('data:')) {
  try { return validateAvatarDataUrl(value); } catch { return null; }
 }
 if (value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(value)) return null;
 try {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host=u.hostname.toLowerCase();
  if (!host.includes('.') || !/^[a-z0-9.-]+$/.test(host) || /^\d+(?:\.\d+){3}$/.test(host)
      || /(?:^|\.)(?:localhost|local|internal|lan|home|localdomain|intranet|onion)$/.test(host)) return null;
  u.hash='';return u.href;
 } catch { return null; }
}

export function iconSelectionLabel(url, width=0, height=0) {
 if (url?.startsWith('data:')) return t("本机上传");
 try { if (/\.svg$/i.test(new URL(url).pathname)) return t("SVG · 矢量"); } catch { /* Invalid URLs are not displayed. */ }
 return width > 0 && height > 0 ? `${width} × ${height}` : t("等待图片");
}
