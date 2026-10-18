// SPDX-License-Identifier: GPL-3.0-only
import { t, formatNumber } from './i18n.js';
import { escapeText as esc } from './html.js';
import { icon } from './icons.js';
import { windowControls } from './widget-app-controls.js';
import { MAX_IMAGE_INPUT_BYTES, compressImage, createImageZip, downloadName } from './image-compression.js';

const miB = 1024 * 1024;
const formatBytes = n => n < miB ? formatNumber(n / 1024, {maximumFractionDigits:1}) + ' KiB'
  : formatNumber(n / miB, {maximumFractionDigits:2}) + ' MiB';

export function imageCompressorWorkspace(item) {
  return '<div class="image-tool">' +
    '<header class="image-tool-header"><h2 id="dialog-title" tabindex="-1">' + icon('wallpaper') + esc(item.title) + '</h2>' + windowControls() + '</header>' +
    '<div class="image-tool-layout">' +
      '<aside class="image-tool-sidebar">' +
        '<div class="image-tool-intro"><strong>' + t('压缩设置') + '</strong><span>' + t('图片只在当前浏览器中处理，关闭窗口后清空。') + '</span></div>' +
        '<label>' + t('压缩模式') + '<select data-image-mode>' +
          '<option value="smart">' + t('智能 · 优先高画质') + '</option>' +
          '<option value="lossless">' + t('真正无损 · PNG') + '</option>' +
          '<option value="high">' + t('高画质 · 手动调整') + '</option>' +
          '<option value="compact">' + t('高压缩率') + '</option>' +
        '</select></label>' +
        '<label>' + t('输出格式') + '<select data-image-format>' +
          '<option value="webp">WebP</option><option value="jpeg">JPEG (' + t('仅 JPEG 原图') + ')</option>' +
        '</select></label>' +
        '<label class="image-tool-range-label"><span>' + t('画质参数') + ' <output data-image-quality-value>90</output></span>' +
          '<input type="range" data-image-quality min="60" max="100" step="1" value="90"></label>' +
        '<p class="image-tool-tip" data-image-mode-hint>' + t('保留原始分辨率，优先尝试高画质编码；输出变大时保留原图。') + '</p>' +
        '<button type="button" class="image-tool-run" data-image-run disabled>' + icon('right') + t('开始压缩') + '</button>' +
        '<button type="button" class="image-tool-button" data-image-cancel hidden>' + t('取消压缩') + '</button>' +
        '<div class="image-tool-privacy">' + icon('shield') + t('图片不会上传服务器，也不会写入桌面备份或 WebDAV。') + '</div>' +
      '</aside>' +
      '<main class="image-tool-main">' +
        '<input type="file" data-image-files accept="image/png,image/jpeg,image/webp" multiple hidden>' +
        '<button type="button" class="image-tool-drop" data-image-drop>' + icon('upload') +
          '<strong>' + t('选择图片或拖放到这里') + '</strong><span>PNG · JPEG · WebP · ' + t('最多 10 张') + '</span></button>' +
        '<div class="image-tool-feedback" data-image-status role="status" aria-live="polite">' + t('等待选择图片') + '</div>' +
        '<div class="image-tool-results" data-image-results hidden>' +
          '<div class="image-tool-result-heading"><strong>' + t('压缩结果') + '</strong><span data-image-summary></span></div>' +
          '<div class="image-tool-list" data-image-list role="list"></div>' +
          '<div class="image-tool-compare" data-image-compare hidden>' +
            '<div class="image-tool-preview" data-image-preview style="--split:50%">' +
              '<img data-image-original alt="' + t('压缩前图片') + '">' +
              '<img data-image-optimized alt="' + t('压缩后图片') + '">' +
              '<span class="image-tool-before">' + t('原图') + '</span><span class="image-tool-after">' + t('压缩后') + '</span>' +
              '<div class="image-tool-line" aria-hidden="true"></div></div>' +
            '<label class="image-tool-compare-range">' + t('滑动对比') +
              '<input type="range" min="0" max="100" value="50" data-image-split aria-label="' + t('压缩前后画质对比') + '"></label>' +
            '<div class="image-tool-result-actions">' +
              '<button type="button" class="image-tool-button" data-image-download>' + icon('download') + t('下载图片') + '</button>' +
              '<button type="button" class="image-tool-button" data-image-apply>' + icon('wallpaper') + t('设为壁纸') + '</button>' +
              '<button type="button" class="image-tool-button" data-image-zip hidden>' + icon('download') + t('下载全部 ZIP') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</main>' +
    '</div>' +
  '</div>';
}
function getFileName(file, type) {
  return downloadName(file.name || 'image', type);
}
function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function bindImageCompressorWorkspace(root, {applyWallpaper} = {}) {
  const controller = new AbortController(), {signal} = controller;
  const query = selector => root.querySelector(selector);
  const filesInput = query('[data-image-files]');
  const modeInput = query('[data-image-mode]');
  const formatInput = query('[data-image-format]');
  const qualityInput = query('[data-image-quality]');
  const status = query('[data-image-status]');
  const runButton = query('[data-image-run]');
  const cancelButton = query('[data-image-cancel]');
  const resultsNode = query('[data-image-results]');
  const listNode = query('[data-image-list]');
  const compareNode = query('[data-image-compare]');
  const previewNode = query('[data-image-preview]');
  const originalImg = query('[data-image-original]');
  const optimizedImg = query('[data-image-optimized]');
  const zipButton = query('[data-image-zip]');
  const applyButton = query('[data-image-apply]');
  const drop = query('[data-image-drop]');
  let files = [], outputs = [], revision = 0, job, selected = -1;
  let originalUrl = null, optimizedUrl = null;
  const alive = token => !signal.aborted && revision === token;
  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  }
  function freePreview() {
    originalImg.removeAttribute('src'); optimizedImg.removeAttribute('src');
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (optimizedUrl) URL.revokeObjectURL(optimizedUrl);
    originalUrl = optimizedUrl = null;
  }
  function clearOutput() {
    freePreview(); outputs = []; selected = -1;
    listNode.textContent = '';
    resultsNode.hidden = true; compareNode.hidden = true;
  }
  function abortPrevious() {
    ++revision;
    job?.abort();
    job = null;
    runButton.disabled = !files.length;
    cancelButton.hidden = true;
  }
  function setFiles(list) {
    abortPrevious(); clearOutput();
    const accepted = [...list];
    if (!accepted.length) { files = []; runButton.disabled = true; return; }
    if (accepted.length > 10) {
      files = []; runButton.disabled = true;
      message(t('每次最多处理 10 张图片'), true); return;
    }
    if (accepted.some(f => !['image/png','image/jpeg','image/webp'].includes(f.type) ||
        !f.size || f.size > MAX_IMAGE_INPUT_BYTES) ||
        accepted.reduce((sum, f) => sum + f.size, 0) > 100 * miB) {
      files = []; runButton.disabled = true;
      message(t('只接受静态 PNG/JPEG/WebP；单张不超过 32 MiB，总计不超过 100 MiB。'), true);
      return;
    }
    files = accepted;
    runButton.disabled = false;
    message(t('已选择 {count} 张图片 · {size}', {count:files.length,
      size:formatBytes(files.reduce((n, f) => n + f.size, 0))}));
  }
  function syncOptions() {
    const lossless = modeInput.value === 'lossless';
    formatInput.disabled = lossless;
    qualityInput.disabled = lossless;
    query('[data-image-quality-value]').textContent = qualityInput.value;
    query('[data-image-mode-hint]').textContent = lossless
      ? t('PNG 无损：保留像素与色彩信息，重压缩数据并清理文字/时间元数据；不支持 JPEG/WebP。')
      : t('不降低分辨率。视觉压缩并非像素无损；可能改变照片的元数据或色彩配置。');
  }
  function fileRow(entry, index) {
    const original = formatBytes(entry.file.size);
    if (entry.error) return '<div class="image-tool-row image-tool-row-error" role="listitem"><span>' +
      esc(entry.file.name) + '</span><small>' + esc(entry.error) + '</small></div>';
    const output = entry.output;
    const saved = entry.file.size ? Math.round((1 - output.outputBytes / entry.file.size) * 100) : 0;
    return '<button class="image-tool-row" type="button" role="listitem" data-image-row="' + index +
      '" aria-pressed="' + String(index === selected) + '"><span>' + esc(entry.file.name) +
      '</span><small>' + original + ' → ' + formatBytes(output.outputBytes) +
      ' · ' + (output.changed ? t('节省 {percent}%', {percent:saved}) : t('保留原图')) +
      '</small></button>';
  }
  function redraw() {
    resultsNode.hidden = !outputs.length;
    listNode.innerHTML = outputs.map(fileRow).join('');
    const good = outputs.filter(row => row.output);
    const saved = good.reduce((n, row) => n + row.output.savedBytes, 0);
    query('[data-image-summary]').textContent = t('完成 {done}/{total} · 节省 {size}', {
      done:good.length, total:outputs.length, size:formatBytes(saved)
    });
    zipButton.hidden = good.length < 2;
  }
  function choose(index) {
    freePreview(); selected = index;
    const entry = outputs[index];
    if (!entry?.output) { compareNode.hidden = true; redraw(); return; }
    compareNode.hidden = false;
    originalUrl = URL.createObjectURL(entry.file);
    optimizedUrl = URL.createObjectURL(entry.output.blob);
    originalImg.src = originalUrl;
    optimizedImg.src = optimizedUrl;
    query('[data-image-split]').value = '50';
    previewNode.style.setProperty('--split', '50%');
    applyButton.disabled = entry.output.outputBytes > 4 * miB || typeof applyWallpaper !== 'function';
    redraw();
  }
  async function processFiles() {
    if (!files.length) return;
    abortPrevious(); clearOutput();
    const token = revision, controllerTask = new AbortController();
    job = controllerTask; runButton.disabled = true; cancelButton.hidden = false;
    const mode = modeInput.value, format = formatInput.value;
    const quality = Number(qualityInput.value) / 100;
    for (let i = 0; i < files.length; i++) {
      if (!alive(token)) return;
      message(t('正在处理 {index}/{total}：{name}', {
        index:i + 1, total:files.length, name:files[i].name
      }));
      try {
        const output = await compressImage(files[i], {mode, format, quality, signal:controllerTask.signal});
        if (!alive(token) || controllerTask.signal.aborted) return;
        outputs.push({file:files[i],output});
      } catch (error) {
        if (!alive(token) || controllerTask.signal.aborted) return;
        outputs.push({file:files[i],error:t(error.message || '压缩失败')});
      }
      redraw();
    }
    if (!alive(token)) return;
    job = null;
    cancelButton.hidden = true;
    runButton.disabled = false;
    const first = outputs.findIndex(o => o.output);
    if (first >= 0) choose(first);
    const errors = outputs.filter(o => o.error).length;
    message(errors ? t('处理结束，{count} 张图片失败。', {count:errors})
      : t('压缩完成，可查看画质并下载。'), !!errors);
  }
  function configChanged() {
    abortPrevious(); clearOutput(); syncOptions();
    if (files.length) message(t('压缩设置已更新，请重新开始。'));
  }
  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    if (button.dataset.detailAction === 'window-expand') {
      const expanded = root.closest('dialog').classList.toggle('widget-app-expanded');
      button.setAttribute('aria-pressed', String(expanded));
      button.title = t(expanded ? '还原窗口' : '最大化窗口');
      button.setAttribute('aria-label', button.title);
      button.innerHTML = icon(expanded ? 'minimize' : 'maximize');
      return;
    }
    if (button.hasAttribute('data-image-drop')) { filesInput.click(); return; }
    if (button.hasAttribute('data-image-run')) { await processFiles(); return; }
    if (button.hasAttribute('data-image-cancel')) {
      abortPrevious();
      const first = outputs.findIndex(entry => entry.output);
      if (first >= 0) choose(first);
      message(t('压缩已取消，可重新开始。'));
      return;
    }
    if (button.hasAttribute('data-image-row')) {
      choose(Number(button.dataset.imageRow)); return;
    }
    if (button.hasAttribute('data-image-download')) {
      const entry = outputs[selected];
      if (entry?.output) downloadBlob(entry.output.blob, getFileName(entry.file, entry.output.type));
      return;
    }
    if (button.hasAttribute('data-image-apply')) {
      const entry = outputs[selected];
      if (!entry?.output || entry.output.outputBytes > 4 * miB || typeof applyWallpaper !== 'function') return;
      button.disabled = true; message(t('正在保存壁纸…'));
      try {
        const saved = await applyWallpaper(entry.output.blob);
        if (!signal.aborted && saved !== false) message(t('壁纸已保存，可在栖页桌面查看。'));
      } catch (error) {
        if (!signal.aborted) message(error.message || t('壁纸保存失败'), true);
      } finally { if (!signal.aborted) button.disabled = false; }
      return;
    }
    if (button.hasAttribute('data-image-zip')) {
      const entries = outputs.filter(o => o.output).map(o => ({name:o.file.name, blob:o.output.blob}));
      if (!entries.length) return;
      const token = revision; button.disabled = true;
      message(t('正在准备 ZIP 下载…'));
      try {
        const zip = await createImageZip(entries, {signal});
        if (!alive(token)) return;
        downloadBlob(zip, 'Qiye-images.zip');
        message(t('ZIP 已生成，图片仅在本机处理。'));
      } catch (error) {
        if (!signal.aborted) message(error.message || t('ZIP 生成失败'), true);
      } finally { if (!signal.aborted) button.disabled = false; }
    }
  }, {signal});
  filesInput.addEventListener('change', () => {
    setFiles(filesInput.files || []); filesInput.value = '';
  }, {signal});
  for (const eventName of ['dragenter','dragover']) {
    drop.addEventListener(eventName, event => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault(); drop.classList.add('is-dragging');
    }, {signal});
  }
  drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'), {signal});
  drop.addEventListener('drop', event => {
    event.preventDefault(); drop.classList.remove('is-dragging');
    setFiles(event.dataTransfer.files || []);
  }, {signal});
  modeInput.addEventListener('change', configChanged, {signal});
  formatInput.addEventListener('change', configChanged, {signal});
  qualityInput.addEventListener('input', configChanged, {signal});
  query('[data-image-split]').addEventListener('input', event => {
    previewNode.style.setProperty('--split', event.target.value + '%');
  }, {signal});
  syncOptions();
  return () => {
    abortPrevious(); controller.abort(); freePreview();
    files = []; outputs = [];
  };
}
