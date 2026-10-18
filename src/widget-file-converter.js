// SPDX-License-Identifier: GPL-3.0-only
// Inert API v3 card. The host handles data-action="widget-open"; all files stay in the workspace.
export const fileConverterWidget = {
  apiVersion: 3,
  type: 'file-converter',
  title: '文件转换',
  description: 'PNG、JPG、WebP 图片批量转换，纯本地处理',
  icon: 'converter',
  size: '2x2',
  sizes: ['1x1', '1x2', '2x1', '2x2', '4x2'],
  fields: [
    { key: 'outputFormat', label: '默认目标格式', type: 'select', default: 'webp',
      options: [ { value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPG' }, { value: 'webp', label: 'WebP' } ] },
    { key: 'quality', label: '默认输出画质', type: 'number', default: 90, min: 50, max: 100, integer: true },
  ],
  render({ item, config, size, escapeHtml, t }) {
    const title = escapeHtml(item.title);
    const label = escapeHtml(t('打开文件转换'));
    const target = String(config.outputFormat || 'webp').toUpperCase().replace('JPEG', 'JPG');
    const compact = size === '1x1' || size === '1x2' || size === '2x1';
    return `<button type="button" class="fc-launch ${compact ? 'fc-launch-compact' : 'fc-launch-large'}" data-action="widget-open" aria-label="${label}">
      <span class="fc-launch-symbol" aria-hidden="true">⇄</span>
      <span class="fc-launch-info"><strong>${title}</strong><small>${escapeHtml(t('图片格式转换'))}</small></span>
      ${compact ? '' : `<span class="fc-launch-formats" aria-hidden="true">PNG · JPG · WebP</span><span class="fc-launch-foot">${escapeHtml(t('本地处理 · 点击转换'))} <b>${target}</b></span>`}
    </button>`;
  },
};
