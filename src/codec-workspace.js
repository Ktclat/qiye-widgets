// SPDX-License-Identifier: GPL-3.0-only
import { t, formatNumber } from './i18n.js';
import { escapeText as esc } from './html.js';
import { icon } from './icons.js';
import { windowControls } from './widget-app-controls.js';
import { CODEC_ALGORITHMS, CODEC_INPUT_LIMIT, codecAlgorithm, convertText } from './codec.js';
import { BEAST_ALPHABET } from './codec-fun.js';

const CODEC_GROUPS = {encoding:'编码 / 解码', fun:'趣味编码', hash:'哈希摘要'};

export function codecCard(item) {
  return `<div class="widget-heading"><button type="button" class="widget-title" data-action="widget-open">${icon('code')}${esc(item.title)}</button><button type="button" class="widget-icon-button" data-action="widget-config" aria-label="${t('设置组件')}">${icon('more')}</button></div>
    <button type="button" class="codec-card-hero" data-action="widget-open" aria-label="${t('打开编码工具')}"><span class="codec-card-symbol" aria-hidden="true"><b>Aa</b><span>⇄</span><b>64</b></span><span>${t('文本转换，一步完成')}</span></button>
    <div class="codec-card-shortcuts">${[['base64','Base64'],['url','URL'],['md5','MD5']].map(([id,name]) => `<button type="button" data-action="widget-open" data-codec-algorithm="${id}" aria-label="${t('打开 {name}',{name})}">${name}</button>`).join('')}</div>
    <div class="codec-card-footer"><span>${t('编码 · 解码 · 哈希')}</span>${icon('right')}</div>`;
}

function algorithmOptions() {
  return Object.entries(CODEC_GROUPS).map(([group, label]) => `<optgroup label="${t(label)}">${CODEC_ALGORITHMS.filter(a => a.group === group).map(a => `<option value="${a.id}">${esc(t(a.name))}</option>`).join('')}</optgroup>`).join('');
}

export function codecWorkspace(item) {
  return `<div class="codec-app">
    <header class="codec-header"><div class="codec-heading">${icon('code')}<h2 id="dialog-title" title="${esc(item.title)}">${esc(item.title)}</h2></div>${windowControls()}</header>
    <div class="codec-layout">
      <nav class="codec-nav" aria-label="${t('编码算法')}">${Object.entries(CODEC_GROUPS).map(([group, label]) => `<section><h3>${t(label)}</h3>${CODEC_ALGORITHMS.filter(a => a.group === group).map(a => `<button type="button" data-codec-algorithm="${a.id}" aria-pressed="false"><span>${esc(t(a.name))}</span><small>${a.bits ? a.bits : '↔'}</small></button>`).join('')}</section>`).join('')}<p>${icon('shield')}${t('本机处理，无需联网')}</p></nav>
      <div class="codec-main">
        <label class="codec-mobile-select">${t('编码算法')}<select data-codec-select>${algorithmOptions()}</select></label>
        <div class="codec-method"><div><h3 data-codec-title>Base64</h3><span class="codec-badge" data-codec-badge></span><span class="codec-format" data-codec-format>UTF-8</span></div><div class="codec-direction" role="group" aria-label="${t('转换方向')}"><button type="button" data-codec-direction="encode" aria-pressed="true">${t('编码')}</button><button type="button" data-codec-direction="decode" aria-pressed="false">${t('解码')}</button></div></div>
        <p class="codec-hint" id="codec-hint"></p>
        <div class="codec-options"><label data-codec-url hidden>${t('URL 范围')}<select data-codec-url-mode><option value="component">${t('参数值 · encodeURIComponent')}</option><option value="uri">${t('完整 URL · encodeURI')}</option><option value="form">${t('表单值 · 空格转 +')}</option></select></label><label data-codec-case hidden><input type="checkbox" data-codec-uppercase>${t('大写十六进制')}</label><div class="codec-beast-options" data-codec-beast hidden><label data-codec-beast-field>${t('兽音字表')}<input type="text" data-codec-beast-alphabet aria-describedby="codec-beast-help codec-status" autocomplete="off" spellcheck="false"><button type="button" data-codec-action="reset-alphabet">${t('恢复默认')}</button></label><span id="codec-beast-help"></span></div></div>
        <p class="codec-fun-note" data-codec-fun-note hidden>${t('用于趣味文本分享；字符表公开，无密码保护。')}</p>
        <div class="codec-editors">
          <section class="codec-editor"><div class="codec-editor-bar"><label for="codec-input">${t('输入文本')}</label><div><button type="button" data-codec-action="example">${t('示例')}</button><button type="button" data-codec-action="clear">${t('清空')}</button></div></div><textarea id="codec-input" aria-describedby="codec-hint codec-status" placeholder="${t('在此输入或粘贴文本…')}" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea><div class="codec-editor-meta" data-codec-input-count></div></section>
          <section class="codec-editor codec-result"><div class="codec-editor-bar"><label for="codec-output">${t('输出结果')}</label><div><button type="button" data-codec-action="reuse" disabled title="${t('将结果放入输入框，继续转换')}">${icon('refresh')}<span>${t('用作输入')}</span></button><button type="button" data-codec-action="copy" disabled>${icon('copy')}<span>${t('复制')}</span></button></div></div><textarea id="codec-output" readonly placeholder="${t('转换结果将显示在这里')}" spellcheck="false" aria-busy="false"></textarea><div class="codec-editor-meta" data-codec-output-count></div></section>
        </div>
        <p class="codec-status" id="codec-status" role="status" aria-live="polite"></p>
        <div class="codec-actions"><label><input type="checkbox" data-codec-auto checked>${t('实时转换')}</label><span class="codec-shortcut">Ctrl / ⌘ + Enter</span><button type="button" class="codec-run" data-codec-action="run">${t('编码')}${icon('right')}</button></div>
        <footer class="codec-footer">${icon('shield')}<span>${t('内容仅留在当前窗口，关闭即清空，不写入备份或同步。')}</span></footer>
      </div>
    </div>
  </div>`;
}

export function bindCodecWorkspace(root, initialAlgorithm = 'base64') {
  const controller = new AbortController(), listener = {signal:controller.signal};
  const query = selector => root.querySelector(selector);
  const input = query('#codec-input'), output = query('#codec-output'), status = query('#codec-status');
  query('[data-codec-beast-alphabet]').value = BEAST_ALPHABET;
  let algorithm = codecAlgorithm(initialAlgorithm) || codecAlgorithm('base64');
  let direction = 'encode', revision = 0, timer, messageTimer, hasResult = false, composing = false;
  const isHash = () => algorithm.group === 'hash';
  const mode = () => isHash() ? 'encode' : direction;
  const options = () => ({urlMode:query('[data-codec-url-mode]').value, uppercase:query('[data-codec-uppercase]').checked, beastAlphabet:query('[data-codec-beast-alphabet]').value});
  const count = text => t('{chars} 字符 · {bytes} 字节', {chars:formatNumber(Array.from(text).length), bytes:formatNumber(new TextEncoder().encode(text).length)});
  function resultActions() {
    query('[data-codec-action=copy]').disabled = !hasResult;
    query('[data-codec-action=reuse]').disabled = !hasResult || output.value.length > CODEC_INPUT_LIMIT;
  }
  function message(text, error = false) {
    clearTimeout(messageTimer);status.textContent = text;
    if(text&&!error)messageTimer=setTimeout(()=>{status.textContent='';},3000);
    status.classList.toggle('is-error', error);
    input.setAttribute('aria-invalid', String(error));
  }
  function invalidate() {
    revision++;
    clearTimeout(timer);
    hasResult = false;
    output.value = '';
    output.setAttribute('aria-busy', 'false');
    query('[data-codec-input-count]').textContent = count(input.value);
    query('[data-codec-output-count]').textContent = count('');
    resultActions();
  }
  async function run() {
    invalidate();
    const current = revision;
    output.setAttribute('aria-busy', 'true');
    message(t('正在转换…'));
    try {
      const result = await convertText(input.value, algorithm.id, mode(), options());
      if (controller.signal.aborted || revision !== current) return;
      output.value = result;
      hasResult = true;
      query('[data-codec-output-count]').textContent = count(result);
      message(t(isHash() ? '摘要已生成' : '转换完成'));
    } catch (error) {
      if (controller.signal.aborted || revision !== current) return;
      message(error.message, true);
    } finally {
      if (!controller.signal.aborted && revision === current) { output.setAttribute('aria-busy', 'false'); resultActions(); }
    }
  }
  function schedule() {
    invalidate();
    if (!input.value) { message(t(isHash() ? '输入文本，或点击“生成摘要”计算空文本。' : '输入文本，或载入示例开始。')); return; }
    if (!query('[data-codec-auto]').checked || composing) { message(t('已修改，等待转换')); return; }
    message(t('等待转换…'));
    timer = setTimeout(run, 180);
  }
  function updateMethod() {
    for (const button of root.querySelectorAll('[data-codec-algorithm]')) button.setAttribute('aria-pressed', String(button.dataset.codecAlgorithm === algorithm.id));
    query('[data-codec-select]').value = algorithm.id;
    query('[data-codec-title]').textContent = t(algorithm.name);
    query('[data-codec-badge]').textContent = isHash() ? t('单向 · {bits} 位',{bits:algorithm.bits}) : t(algorithm.badge || '可逆转换');
    query('.codec-app').dataset.codecFamily = algorithm.group;
    query('#codec-hint').textContent = t(algorithm.hint);
    query('.codec-direction').hidden = isHash();
    for (const button of root.querySelectorAll('[data-codec-direction]')) button.setAttribute('aria-pressed', String(button.dataset.codecDirection === direction));
    query('.codec-options').hidden = !['url','beast'].includes(algorithm.id) && !isHash();
    query('[data-codec-url]').hidden = algorithm.id !== 'url';
    query('[data-codec-case]').hidden = !isHash();
    query('[data-codec-beast]').hidden = algorithm.id !== 'beast';
    query('[data-codec-beast-field]').hidden = direction === 'decode';
    query('#codec-beast-help').textContent = t(direction === 'decode' ? '解码时自动识别字表，无需填写。' : '按顺序填写 4 个不同的字符。');
    query('[data-codec-fun-note]').hidden = algorithm.group !== 'fun';
    query('[data-codec-format]').textContent = isHash() ? 'UTF-8 → HEX' : algorithm.format || 'UTF-8';
    query('[data-codec-action=run]').innerHTML = t(isHash() ? '生成摘要' : direction === 'encode' ? '编码' : '解码') + icon('right');
    schedule();
  }
  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    if (button.dataset.codecAlgorithm) { algorithm = codecAlgorithm(button.dataset.codecAlgorithm); updateMethod(); }
    if (button.dataset.codecDirection) { direction = button.dataset.codecDirection; updateMethod(); }
    if (button.dataset.detailAction === 'window-expand') {
      const expanded = root.closest('dialog').classList.toggle('widget-app-expanded');
      button.setAttribute('aria-pressed', String(expanded));
      button.setAttribute('aria-label', t(expanded ? '还原窗口' : '最大化窗口'));
      button.title = button.getAttribute('aria-label');
      button.innerHTML = icon(expanded ? 'minimize' : 'maximize');
    }
    const action = button.dataset.codecAction;
    if (action === 'reset-alphabet') { query('[data-codec-beast-alphabet]').value = BEAST_ALPHABET; schedule(); }
    if (action === 'run') await run();
    if (action === 'clear') { input.value = ''; schedule(); input.focus(); }
    if (action === 'reuse' && hasResult && output.value.length <= CODEC_INPUT_LIMIT) { input.value = output.value; schedule(); input.focus(); }
    if (action === 'example') {
      invalidate();
      const current = revision, example = algorithm.id === 'url' ? 'https://example.com/search?q=栖页 &lang=中文' : algorithm.id === 'html' ? '<span title="Qiye">你好 & hello</span>' : isHash() ? 'abc' : '你好，Qiye 👋';
      try {
        const sample = mode() === 'decode' ? await convertText(example, algorithm.id, 'encode', {...options(), beastAlphabet:BEAST_ALPHABET}) : example;
        if (controller.signal.aborted || revision !== current) return;
        input.value = sample; schedule(); input.focus();
      } catch (error) {
        if (!controller.signal.aborted && revision === current) message(error.message, true);
      }
    }
    if (action === 'copy' && hasResult) {
      const current = revision;
      try {
        await navigator.clipboard.writeText(output.value);
        if (!controller.signal.aborted && revision === current) message(t('已复制结果'));
      } catch {
        if (controller.signal.aborted || revision !== current) return;
        output.focus(); output.select(); message(t('无法自动复制，结果已选中，请按 Ctrl / ⌘ + C。'));
      }
    }
  }, listener);
  input.addEventListener('compositionstart', () => { composing = true; invalidate(); }, listener);
  input.addEventListener('compositionend', () => { composing = false; schedule(); }, listener);
  input.addEventListener('input', schedule, listener);
  query('[data-codec-beast-alphabet]').addEventListener('input', schedule, listener);
  root.addEventListener('change', event => {
    if (event.target.matches('[data-codec-select]')) { algorithm = codecAlgorithm(event.target.value); updateMethod(); }
    else if (event.target.matches('[data-codec-auto],[data-codec-url-mode],[data-codec-uppercase]')) schedule();
  }, listener);
  root.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); void run(); }
  }, listener);
  updateMethod();
  return () => { controller.abort(); revision++; clearTimeout(timer); clearTimeout(messageTimer); input.value = ''; output.value = ''; query('[data-codec-beast-alphabet]').value = ''; };
}
