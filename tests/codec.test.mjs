// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CODEC_ALGORITHMS, CODEC_INPUT_LIMIT, convertText } from '../src/codec.js';
import { codecWorkspace } from '../src/codec-workspace.js';
import { DEFAULT_STATE, exportState, validateImport } from './fixtures/legacy-host.js';
import { getWidgetDefinition, newWidgetConfig } from '../src/widget-registry.js';
import { newWidgetData } from '../src/widget-data.js';
import { renderWidget } from '../src/widgets.js';
import { setLocale } from '../src/i18n.js';
import { englishMessages } from '../src/messages-en.js';

// Published test vectors: RFC 1319 §A.5 and RFC 1320 §A.5.
const messages = ['', 'a', 'abc', 'message digest', 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', '1234567890'.repeat(8)];
const vectors = {
  md2:['8350e5a3e24c153df2275c9f80692773','32ec01ec4a6dac72c0ab96fb34c0b5d1','da853b0d3f88d99b30283a69e6ded6bb','ab4f496bfb2a530b219ff33031fe06b0','4e8ddff3650292ab5a4108c3aa47940b','da33def2a42df13975352846c30338cd','d5976f79d83d3a0dc9806c3c66f3efd8'],
  md4:['31d6cfe0d16ae931b73c59d7e0c089c0','bde52cb31de33e46245e05fbdbd6fb24','a448017aaf21d8525fc10ae87aa6729d','d9130a8164549fe818874806e1c7014b','d79e1c308aa5bbcdeea8ed63df412da9','043f8582f241db351ce627e153e7f0e4','e33b4ddc9c38f2199c3e7b164fcc0536'],
};
for (const [id, results] of Object.entries(vectors)) test(`${id} matches every RFC vector including empty and multi-block messages`, async () => {
  for (let i = 0; i < messages.length; i++) assert.equal(await convertText(messages[i], id), results[i]);
});

for (const id of ['md5','sha-1','sha-256','sha-384','sha-512']) test(`${id} matches independent crypto hashes for UTF-8 and padding boundaries`, async () => {
  for (const text of [...messages, '中文 👋\n', '\ufeffhello', ...[55,56,63,64,65,127,128,100000].map(n => 'a'.repeat(n))]) {
    const expected = createHash(id.replace('-', '')).update(text, 'utf8').digest('hex');
    assert.equal(await convertText(text, id), expected);
    assert.equal(await convertText(text, id, 'encode', {uppercase:true}), expected.toUpperCase());
  }
});

test('every reversible algorithm preserves Unicode, BOM, whitespace, quotes and literal escapes', async () => {
  for (const algorithm of CODEC_ALGORITHMS.filter(a => a.group === 'encoding')) {
    for (const text of ['', '你好，Qiye 👋', '\ufeffA\u0000\r\nB\t  ', '  & < > " \' \\u0041 \\n &#39; &copy;  ']) {
      const encoded = await convertText(text, algorithm.id);
      assert.equal(await convertText(encoded, algorithm.id, 'decode'), text, algorithm.id);
    }
  }
});

test('Base64 follows the standard and accepts omitted padding and line breaks', async () => {
  for (const [text, encoded] of [['f','Zg=='],['fo','Zm8='],['foo','Zm9v'],['foobar','Zm9vYmFy'],['你好','5L2g5aW9']]) {
    assert.equal(await convertText(text,'base64'), encoded);
    assert.equal(await convertText(encoded.replace(/=/g,''),'base64','decode'), text);
  }
  assert.equal(await convertText(' 5L2g\r\n5aW9\t','base64','decode'),'你好');
  assert.equal(await convertText('\uffff','base64url'),'77-_');
  assert.equal(await convertText('77-_','base64url','decode'),'\uffff');
  assert.equal(await convertText('Zg==','base64url','decode'),'f');
});

test('invalid Base64 characters, lengths, padding bits and binary UTF-8 are reported', async () => {
  for (const text of ['A','===','Zg=','Z=g=','Zg===','Zm9v=','Z!g==','Zh==','Zm9=','/w==','wK8=','7aCA']) await assert.rejects(convertText(text,'base64','decode'));
  await assert.rejects(convertText('77-_','base64','decode'));
  await assert.rejects(convertText('77+/','base64url','decode'));
});

test('URL scopes distinguish reserved characters and plus signs', async () => {
  assert.equal(await convertText('a b+c/?&=','url'),'a%20b%2Bc%2F%3F%26%3D');
  assert.equal(await convertText('a+b%2Bc','url','decode'),'a+b+c');
  assert.equal(await convertText('a b+c~','url','encode',{urlMode:'form'}),'a+b%2Bc%7E');
  assert.equal(await convertText('a+b%2Bc','url','decode',{urlMode:'form'}),'a b+c');
  const url = 'https://example.com/?q=你好&x=a+b#片段';
  assert.equal(await convertText(url,'url','encode',{urlMode:'uri'}), encodeURI(url));
  assert.equal(await convertText('%2F%3F%26%3D','url','decode',{urlMode:'uri'}),'%2F%3F%26%3D');
  for (const mode of ['component','form','uri']) {
    assert.equal(await convertText(await convertText(url,'url','encode',{urlMode:mode}),'url','decode',{urlMode:mode}),url);
    for (const text of ['%','%GG','%E4%BD','%C0%AF']) await assert.rejects(convertText(text,'url','decode',{urlMode:mode}), /URL/);
  }
});

test('HTML entities decode once as plain text and document unsupported named entities', async () => {
  assert.equal(await convertText('&lt;img src=x onerror=alert(1)&gt; &amp;lt; &#x1F600; &#20320; &nbsp; &copy;','html','decode'),'<img src=x onerror=alert(1)> &lt; 😀 你 \u00a0 &copy;');
  for (const text of ['&#x110000;','&#55296;']) await assert.rejects(convertText(text,'html','decode'));
});

test('Unicode, hex and JSON decoding reject malformed input without replacement or code execution', async () => {
  assert.equal(await convertText('\\u4f60\\u597d \\u{1f600}','unicode','decode'),'你好 😀');
  assert.equal(await convertText('E4 BD A0 e5 a5 bd','hex','decode'),'你好');
  for (const [id, cases] of Object.entries({unicode:['\\uZZZZ','\\u123','\\u{110000}','\\ud800','\\n'],hex:['abc','0x41','gg','ff','eda080'],json:['{\"a\":1}','[]','123','null','undefined','"\\ud800"','"unterminated']})) {
    for (const text of cases) await assert.rejects(convertText(text,id,'decode'));
  }
});

test('hashes reject decoding, invalid Unicode and oversized input', async () => {
  for (const algorithm of CODEC_ALGORITHMS) {
    await assert.rejects(convertText('\ud800',algorithm.id));
    if (algorithm.group === 'hash') await assert.rejects(convertText('abc',algorithm.id,'decode'), /单向/);
  }
  await assert.rejects(convertText('a'.repeat(CODEC_INPUT_LIMIT+1),'md2'), /100,000/);
  await assert.rejects(convertText('abc','unknown'));
  await assert.rejects(convertText('abc','base64','sideways'));
  await assert.rejects(convertText('abc','url','encode',{urlMode:'unknown'}));
});

test('codec supports all widget sizes, safe custom titles and empty persisted data', () => {
  const definition = getWidgetDefinition('codec');
  const item = {id:'codec-test',type:'widget',widget:'codec',title:'</h2><script>alert(1)</script>',groupId:DEFAULT_STATE.groups[0].id,size:definition.size,config:newWidgetConfig('codec'),data:newWidgetData('codec')};
  assert.deepEqual(item.config,{});
  assert.deepEqual(item.data,{});
  const state = structuredClone(DEFAULT_STATE); state.items.push(item);
  assert.equal(validateImport(exportState(state)).items.at(-1).widget,'codec');
  for (const size of definition.sizes) {
    const html = renderWidget({...item,size},state);
    assert.match(html,/data-widget="codec"/);
    assert.match(html,/data-action="widget-open"/);
    assert.doesNotMatch(html,/<script>/);
  }
  assert.doesNotMatch(codecWorkspace(item),/<script>/);
});

test('algorithm descriptions and workspace controls have English translations', () => {
  for (const algorithm of CODEC_ALGORITHMS) assert.ok(englishMessages[algorithm.hint], algorithm.id);
  try {
    setLocale('en');
    const html = codecWorkspace({title:'Encoding tools'});
    assert.doesNotMatch(html,/[\u3400-\u9fff]/);
    assert.match(html,/Live conversion/);
  } finally { setLocale('zh-CN'); }
});
