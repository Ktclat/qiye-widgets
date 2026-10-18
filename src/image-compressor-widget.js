// SPDX-License-Identifier: GPL-3.0-only
// A stateless local tool: no uploaded image or compression result is persisted.
export const imageCompressorWidget = {
  apiVersion: 3,
  type: 'image-compressor',
  title: '图片压缩',
  description: '本机无损 PNG 优化、WebP 高画质压缩、批量对比与下载',
  icon: 'wallpaper',
  size: '2x2',
  sizes: ['1x1','1x2','2x1','2x2','4x2'],
  fields: [],
  render({size, t}) {
    const compact = ['1x1','1x2','2x1'].includes(size);
    return '<button type="button" class="image-compressor-launch" data-image-compressor-open data-action="widget-open" aria-label="' + t('打开图片压缩工具') + '">' +
      '<span class="image-compressor-mark" aria-hidden="true">⇣</span>' +
      (compact ? '' : '<strong>' + t('图片压缩') + '</strong><small>PNG · WebP · JPEG</small>') +
      '<span class="image-compressor-launch-copy">' + t('本机处理 · 不上传') + '</span></button>';
  },
  mount({root, signal, openDetail}) {
    root.querySelector('[data-image-compressor-open]')?.addEventListener('click', event => {
      event.stopPropagation();
      openDetail();
    }, {signal});
  }
};
