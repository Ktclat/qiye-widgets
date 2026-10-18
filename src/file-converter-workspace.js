// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as e } from './html.js';
import { icon } from './icons.js';
import { windowControls } from './widget-app-controls.js';
import {
  FILE_CONVERTER_MAX_FILES, FILE_CONVERTER_MAX_BYTES, FILE_CONVERTER_MAX_TOTAL_BYTES,
  detectImageFormat, convertImageFile, outputFilename, readableBytes,
} from './file-converter.js';
const INPUT_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
const labelForFormat = format => format === 'jpeg' ? 'JPG' : format.toUpperCase();
const formatOptions = selected => ['png','jpeg','webp'].map(format =>
  `<option value="${format}"${selected === format ? ' selected' : ''}>${labelForFormat(format)}</option>`).join('');

export function fileConverterWorkspace(item) {
  const format = item.config.outputFormat;
  const quality = item.config.quality;
  return `<div class="fc-app">
    <header class="fc-header">
      <div class="fc-brand">${icon('converter')}<h2 id="dialog-title" tabindex="-1">${e(item.title)}</h2><span class="fc-tag">${t('本地转换')}</span></div>
      <div class="fc-header-actions"><button type="button" class="widget-app-button" data-fc-action="clear" title="${t('清空文件')}" aria-label="${t('清空文件')}">${icon('trash')}</button>${windowControls()}</div>
    </header>
    <div class="fc-content">
      <section class="fc-intro"><div><h3>${t('图片格式转换')}</h3><p>${t('选择图片、设定格式，即可在浏览器内转换；无需上传到服务器。')}</p></div><span class="fc-privacy">${icon('shield')} ${t('文件仅在本机处理')}</span></section>
      <section class="fc-drop" data-fc-drop tabindex="0" aria-label="${t('选择或拖入图片文件')}">
        <div class="fc-drop-symbol">${icon('upload')}</div>
        <strong>${t('拖入文件到这里')}</strong>
        <p>${t('或点击下方按钮添加图片')}</p>
        <button type="button" class="fc-primary" data-fc-action="pick">${icon('plus')}${t('选择文件')}</button>
        <input type="file" data-fc-input accept="${INPUT_ACCEPT}" multiple hidden>
        <small>${t('支持 PNG / JPG / WebP · 最多 20 个文件 · 单个 30 MB')}</small>
      </section>
      <div class="fc-options">
        <label class="fc-field"><span>${t('转换为')}</span><select data-fc-format aria-label="${t('目标格式')}">${formatOptions(format)}</select></label>
        <label class="fc-field fc-quality"><span>${t('输出画质')} <output data-fc-quality-label>${quality}%</output></span><input data-fc-quality type="range" min="50" max="100" step="1" value="${quality}" aria-label="${t('输出画质')}"></label>
        <div class="fc-option-note">${t('JPG 会将透明区域填充为白色；PNG 不使用画质滑块。')}</div>
      </div>
      <section class="fc-results" aria-label="${t('待转换文件列表')}">
        <div class="fc-results-head"><strong>${t('文件列表')} <span data-fc-count>0</span></strong><span data-fc-total>${t('尚未添加文件')}</span></div>
        <div class="fc-empty" data-fc-empty>${icon('image')}<span>${t('添加文件后将在这里展示转换任务')}</span></div>
        <ol class="fc-list" data-fc-list aria-live="polite" hidden></ol>
      </section>
      <div class="fc-bottom"><div class="fc-progress"><progress data-fc-progress max="1" value="0"></progress><span data-fc-status role="status" aria-live="polite">${t('准备就绪 · 不上传文件')}</span></div>
        <div class="fc-operations"><button type="button" data-fc-action="cancel" class="fc-secondary" hidden>${t('取消转换')}</button><button type="button" data-fc-action="download-all" class="fc-secondary" disabled>${icon('download')}${t('下载全部')}</button><button type="button" data-fc-action="run" class="fc-primary" disabled>${icon('converter')}${t('开始转换')}</button></div></div>
    </div>
  </div>`;
}

export function bindFileConverterWorkspace(root, item, host) {
  const controller = new AbortController();
  const events = { signal:controller.signal };
  const q = selector => root.querySelector(selector);
  const input = q('[data-fc-input]');
  const select = q('[data-fc-format]');
  const quality = q('[data-fc-quality]');
  const drop = q('[data-fc-drop]');
  const list = q('[data-fc-list]');
  const status = q('[data-fc-status]');
  let entries = [], serial = 0, busy = false, accepting = false, closed = false;
  let conversion = null;
  let saving = Promise.resolve(), optionsRevision = 0;
  const revoke = entry => {
    if (entry.url) URL.revokeObjectURL(entry.url);
    entry.url = null;
    entry.blob = null;
    entry.outputName = null;
  };
  const live = () => !closed && root.isConnected;
  const setStatus = message => { if (live()) status.textContent = message; };
  const failed = error => setStatus(t(error?.message || '操作失败'));
  const optionSnapshot = () => ({ format:select.value, quality:Number(quality.value) });

  function refresh(message) {
    if (!live()) return;
    const count = entries.length;
    const done = entries.filter(entry => entry.state === 'done').length;
    const processed = entries.filter(entry => entry.state === 'done' || entry.state === 'error').length;
    const ready = entries.some(entry => entry.state !== 'done');
    q('[data-fc-count]').textContent = String(count);
    q('[data-fc-total]').textContent = count ? `${done} / ${count} ${t('已完成')}` : t('尚未添加文件');
    q('[data-fc-empty]').hidden = count > 0;
    list.hidden = count === 0;
    q('[data-fc-progress]').max = count || 1;
    q('[data-fc-progress]').value = processed;
    select.disabled = busy;
    quality.disabled = busy || select.value === 'png';
    q('[data-fc-quality-label]').textContent = `${quality.value}%`;
    q('[data-fc-action="pick"]').disabled = busy || accepting;
    input.disabled = busy || accepting;
    q('[data-fc-action="run"]').disabled = busy || accepting || !ready;
    q('[data-fc-action="download-all"]').disabled = busy || !done;
    q('[data-fc-action="cancel"]').hidden = !busy;
    q('[data-fc-action="clear"]').disabled = busy || accepting;
    drop.setAttribute('aria-busy', String(busy || accepting));
    root.classList.toggle('fc-has-files', count > 0);
    list.innerHTML = entries.map(entry => {
      const tag = entry.state === 'done' ? t('完成') : entry.state === 'running' ? t('转换中…') : entry.state === 'error' ? t('失败') : t('待处理');
      const description = entry.state === 'done'
        ? `${entry.width} × ${entry.height} · ${readableBytes(entry.blob.size)}`
        : entry.state === 'error' ? entry.error : readableBytes(entry.file.size);
      return `<li class="fc-row" data-fc-id="${entry.id}">
        <span class="fc-file-icon">${labelForFormat(entry.inputFormat)}</span>
        <span class="fc-file-info"><strong title="${e(entry.file.name)}">${e(entry.file.name)}</strong><small>${e(description)}</small></span>
        <span class="fc-state fc-state-${entry.state}" aria-label="${e(tag)}">${e(tag)}</span>
        <span class="fc-file-actions">${entry.state === 'done' ? `<button type="button" data-fc-action="download" data-fc-id="${entry.id}" title="${t('下载结果')}">${icon('download')}<span>${t('下载')}</span></button>` : ''}
        <button type="button" data-fc-action="remove" data-fc-id="${entry.id}" title="${t('移除文件')}" aria-label="${t('移除文件')}"${busy || accepting ? ' disabled' : ''}>${icon('close')}</button></span>
      </li>`;
    }).join('');
    if (message) setStatus(message);
  }

  async function addFiles(files) {
    if (busy || accepting || closed) return;
    accepting = true;
    refresh();
    let added = 0, rejected = 0;
    let size = entries.reduce((sum, entry) => sum + entry.file.size, 0);
    try {
      for (const file of Array.from(files)) {
        if (closed) return;
        if (entries.length >= FILE_CONVERTER_MAX_FILES || !file.size
          || file.size > FILE_CONVERTER_MAX_BYTES || size + file.size > FILE_CONVERTER_MAX_TOTAL_BYTES) { rejected++; continue; }
        let detected;
        try { detected = await detectImageFormat(file); } catch { detected = null; }
        if (closed) return;
        if (!detected) { rejected++; continue; }
        entries.push({ id:++serial, file, inputFormat:detected, state:'queued', blob:null, url:null, outputName:null, error:'' });
        size += file.size;
        added++;
      }
    } finally {
      accepting = false;
      refresh(rejected ? t('已添加 {added} 个文件，跳过 {rejected} 个无效或超限文件。',{added,rejected})
        : t('已添加 {count} 个文件。',{count:added}));
    }
  }

  function clearResults() {
    for (const entry of entries) {
      revoke(entry);
      entry.state = 'queued';
      entry.error = '';
    }
  }

  function saveOptions() {
    const revision = ++optionsRevision;
    const {format,quality:value} = optionSnapshot();
    saving = saving.catch(()=>{}).then(async () => {
      const current = host.getState().items.find(row => row.id === item.id);
      if (!current) return;
      if (current.config.outputFormat === format && current.config.quality === value) return;
      await host.saveSettings(item.id, {
        title:current.title, config:{ ...current.config, outputFormat:format, quality:value },
      }, JSON.stringify([current.title,current.config]));
    }).catch(error => {
      if (live() && revision === optionsRevision) {
        const current = host.getState().items.find(row => row.id === item.id);
        if (current) { select.value = current.config.outputFormat; quality.value = current.config.quality; }
        clearResults(); refresh(); failed(error);
      }
    });
  }

  async function start() {
    if (busy || accepting || !entries.some(entry => entry.state !== 'done')) return;
    busy = true;
    conversion = new AbortController();
    const signal = conversion.signal;
    const {format,quality:value} = optionSnapshot();
    refresh(t('正在本地转换文件…'));
    try {
      for (const entry of entries) {
        if (signal.aborted || closed) break;
        if (entry.state === 'done') continue;
        entry.state = 'running';
        entry.error = '';
        refresh();
        try {
          const {blob,width,height} = await convertImageFile(entry.file,{format,quality:value,signal});
          if (closed || signal.aborted) break;
          if (entries.reduce((total,row)=>total + (row.blob?.size || 0), 0) + blob.size > FILE_CONVERTER_MAX_TOTAL_BYTES)
            throw new Error('转换结果合计超过 120 MiB，请下载并移除部分结果后重试');
          entry.blob = blob;
          entry.width = width;
          entry.height = height;
          entry.outputName = outputFilename(entry.file.name,format,entries.filter(row=>row.state==='done').map(row=>row.outputName));
          entry.url = URL.createObjectURL(blob);
          entry.state = 'done';
        } catch(error) {
          if (signal.aborted || error?.name === 'AbortError' || closed) break;
          entry.error = t(error.message || '转换失败');
          entry.state = 'error';
        }
        refresh();
      }
    } finally {
      const canceled = signal.aborted;
      for (const entry of entries) if (entry.state === 'running') { entry.state = 'queued'; revoke(entry); }
      conversion = null;
      busy = false;
      refresh(canceled ? t('已取消，尚未完成的文件可重新转换。') : t('本轮转换结束，可逐个或批量下载。'));
    }
  }

  function download(entry) {
    if (!entry?.url || !entry.outputName) return;
    const link = document.createElement('a');
    link.href = entry.url;
    link.download = entry.outputName;
    link.style.display = 'none';
    root.append(link);
    link.click();
    link.remove();
  }

  root.addEventListener('click', event => {
    const windowButton = event.target.closest('[data-detail-action="window-expand"]');
    if (windowButton) {
      const dialog = root.closest('dialog');
      const expanded = dialog.classList.toggle('widget-app-expanded');
      windowButton.setAttribute('aria-pressed', String(expanded));
      windowButton.setAttribute('aria-label',t(expanded ? '还原窗口' : '最大化窗口'));
      windowButton.title = t(expanded ? '还原窗口' : '最大化窗口');
      windowButton.innerHTML = icon(expanded ? 'minimize' : 'maximize');
      return;
    }
    const button = event.target.closest('[data-fc-action]');
    if (!button) {
      if (event.target !== input && drop.contains(event.target) && !busy && !accepting) input.click();
      return;
    }
    const action = button.dataset.fcAction;
    if (action === 'pick' && !busy && !accepting) input.click();
    else if (action === 'clear' && !busy && !accepting) {
      for (const entry of entries) revoke(entry);
      entries = [];
      refresh(t('文件已清空。'));
    } else if (action === 'run') void start();
    else if (action === 'cancel') conversion?.abort();
    else if (action === 'download-all') {
      for (const entry of entries) if (entry.state === 'done') download(entry);
      setStatus(t('已请求批量下载；浏览器可能要求允许下载多个文件。'));
    } else if (action === 'download') download(entries.find(entry => entry.id === Number(button.dataset.fcId)));
    else if (action === 'remove' && !busy && !accepting) {
      const id = Number(button.dataset.fcId);
      entries = entries.filter(entry => { if (entry.id === id) { revoke(entry); return false; } return true; });
      refresh();
    }
  }, events);

  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    input.value = ''; // Allow choosing the same file again.
    void addFiles(files);
  }, events);
  drop.addEventListener('dragover', event => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault(); event.stopPropagation();
    if (busy || accepting) { event.dataTransfer.dropEffect = 'none'; return; }
    event.dataTransfer.dropEffect = 'copy';
    drop.classList.add('fc-drop-active');
  }, events);
  drop.addEventListener('dragleave', event => {
    if (!drop.contains(event.relatedTarget)) drop.classList.remove('fc-drop-active');
  }, events);
  drop.addEventListener('drop', event => {
    event.preventDefault(); event.stopPropagation();
    drop.classList.remove('fc-drop-active');
    if (!busy) void addFiles(event.dataTransfer?.files || []);
  }, events);
  drop.addEventListener('keydown', event => {
    if (event.target === drop && !busy && !accepting && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); input.click();
    }
  }, events);
  quality.addEventListener('input', () => { q('[data-fc-quality-label]').textContent = `${quality.value}%`; }, events);
  for (const field of [select,quality]) field.addEventListener('change', () => {
    if (busy) return;
    clearResults();
    refresh(t('转换设置已更新，点击开始转换。'));
    saveOptions();
  }, events);
  refresh();
  return () => {
    closed = true;
    controller.abort();
    conversion?.abort();
    for (const entry of entries) revoke(entry);
    entries = [];
    input.value = '';
  };
}
