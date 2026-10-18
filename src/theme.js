// SPDX-License-Identifier: GPL-3.0-only
export function themeTokens(settings, dark = false) {
  const theme = settings.theme === 'auto' ? (dark ? 'dark' : 'light') : settings.theme;
  const accent = settings.useThemeColor ? settings.themeColor : (theme === 'dark' ? '#5aabff' : '#0874d9');
  const channels = accent.slice(1).match(/../g).map(hex => parseInt(hex, 16) / 255);
  const luminance = channels.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
    .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  return { theme, accent, ink: luminance > .179 ? '#111820' : '#ffffff' };
}
