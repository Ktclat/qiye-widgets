// SPDX-License-Identifier: GPL-3.0-only
export const WINDOW_SIZES = Object.freeze([75, 100, 125, 150]);

// Percentages allocate space; text and controls keep their natural CSS size.
export function windowMetrics(percent, width, height) {
  const ratio = Math.max(75, Math.min(150, Number(percent) || 100)) / 100;
  const availableWidth = Math.max(1, width - 24);
  const availableHeight = Math.max(1, height - 24);
  return { width: availableWidth, height: availableHeight,
    windowWidth: Math.min(980 * ratio, availableWidth),
    windowHeight: Math.min(640 * ratio, availableHeight),
    hotsearchWidth: Math.min(1000 * ratio, availableWidth),
    hotsearchHeight: Math.min(660 * ratio, availableHeight),
    settingsWidth: Math.min(880 * ratio, availableWidth),
    drawerWidth: Math.min(560 * ratio, width),
    formWidth: Math.min(640 * ratio, availableWidth),
    catalogWidth: Math.min(1060 * ratio, availableWidth) };
}

export function applyWindowSize(dialog, percent, viewport = globalThis) {
  const metrics = windowMetrics(percent, viewport.innerWidth, viewport.innerHeight);
  for (const [key, value] of Object.entries(metrics)) {
    const name = key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
    dialog.style.setProperty('--' + (['width', 'height'].includes(key) ? 'dialog-' : '') + name, `${value}px`);
  }
  dialog.classList.toggle('compact-dialog', metrics.width < 620);
  return metrics;
}
