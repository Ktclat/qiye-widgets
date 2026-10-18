// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { convertText, CODEC_ALGORITHMS } from '../src/codec.js';
import { convertFunText } from '../src/codec-fun.js';
import { setLocale } from '../src/i18n.js';

// External compatibility vectors, rather than only self-roundtrips:
// Borber/whisperer README, commit b50f7cf5da42f8884d6a32995f08680229ffc933.
const chinese = '起来！不愿做奴隶的人们！';
const classic = '佛曰：不呐佛故梵除梵蒙皤知奢數皤盧俱若諳度豆蒙娑故知孕他俱孕有呐孕奢礙冥逝姪罰那蒙顛佛冥夜依耶冥夢缽阿';
const bear = '熊曰：呋既既現訴類常人囑蜂唬麼類嗥冬告告囑誒象取噗達唬哮類樣嗡萌嗄森物嗥出家蜜達嗒呆既吃溫唬哞咯襲拙告你嘿物人';

test('classic Buddha decodes published text and emits compatible AES bytes', async () => {
  assert.equal(await convertText(classic, 'buddha', 'decode'), chinese);
  // These 12 interchangeable byte markers are randomized by the format.
  const normalize = value => value.replace(/[冥奢梵呐俱哆怯諳罰侄缽皤]/g, '冥');
  assert.equal(normalize(await convertText(chinese, 'buddha')), normalize(classic));
  assert.equal(await convertText(classic.replace('：', ':').split('').join('\n'), 'buddha', 'decode'), chinese);
});

test('Beast emits the original framed format and detects custom alphabets', async () => {
  // sgdrg15rdg/beast_js, commit 041c854ad442e9990eab83397d3052daa3ae2c4d.
  const vector = '~呜嗷呜嗷嗷嗷啊嗷嗷~啊呜~啊~呜呜嗷啊';
  assert.equal(await convertText('你好', 'beast'), vector);
  assert.equal(await convertText(vector, 'beast', 'decode'), '你好');
  const custom = await convertText('你好', 'beast', 'encode', {beastAlphabet:'喵呜咪~'});
  assert.equal(custom, vector.replace(/嗷/g,'喵').replace(/啊/g,'咪'));
  assert.equal(await convertText(custom, 'beast', 'decode', {beastAlphabet:'invalid'}), '你好');
  assert.equal(await convertText(custom.split('').join(' \n'), 'beast', 'decode'), '你好');
});

test('Bear decodes original-format vectors and accepts its abbreviated prefix', async () => {
  assert.equal(await convertText(bear, 'bear', 'decode'), chinese);
  assert.equal(await convertText(bear.slice(3).split('').join('\n'), 'bear', 'decode'), chinese);
  // Published regression vector from SheepChef/Abracadabra, main.test.js.
  assert.equal(await convertText('呋擊眠魚堅笨唬咬呱洞物沒呦山誒註歡動笨意非覺呆誘嘿吖盜噗嗥溫沒洞魚啽和現現很哞呦蜜呱和出偶人嗷誒訴偶冬果果很森喜嗅噤很覺家森類雜拙呆意雜常吃', 'bear', 'decode'), '我能看见，有些东西就在遥远的另一边');
  // Native zlib and the original encoder use the same raw DEFLATE settings for
  // this small fixture; this also exercises byte-to-symbol order independently.
  assert.equal(await convertText(chinese, 'bear'), bear);
});

test('all playful formats preserve whitespace, BOM, null, Unicode and block boundaries', async () => {
  for (const {id} of CODEC_ALGORITHMS.filter(a => a.group === 'fun')) {
    for (const input of ['', '\ufeff你好 😀\n\r\t\0 ', 'a'.repeat(7), 'a'.repeat(8), 'a'.repeat(9), '栖页'.repeat(2000)]) {
      assert.equal(await convertText(await convertText(input, id), id, 'decode'), input, id);
    }
  }
});

test('playful decoders reject other versions, damaged data and malformed alphabets', async () => {
  for (const text of ['', '新佛曰：不呐佛', '佛又曰：不呐佛', classic + '冥', classic + '?', '佛曰：'+'滅'.repeat(16)]) await assert.rejects(convertText(text,'buddha','decode'));
  for (const alphabet of ['', '嗷嗷嗷嗷', '嗷呜啊', 'ab c', '😀ab', 'a\ud800bc']) await assert.rejects(convertText('test','beast','encode',{beastAlphabet:alphabet}));
  for (const text of ['', '~呜嗷啊x', 'aaaaaaaaaaaa', '~呜嗷嗷嗷嗷嗷嗷嗷嗷X啊']) await assert.rejects(convertText(text,'beast','decode'));
  for (const text of ['', '熊曰：食', '熊曰：呋', bear+'?', bear.slice(0,-3), '呋'+'食'.repeat(20)]) await assert.rejects(convertText(text,'bear','decode'));
});

test('playful formats bound expansion and reject oversized decompressed text', async () => {
  const largestBeast = await convertText('a'.repeat(12499),'beast');
  assert.equal(largestBeast.length, 99996);
  assert.equal((await convertText(largestBeast,'beast','decode')).length, 12499);
  await assert.rejects(convertText('a'.repeat(12500),'beast'), /12,499/);
  await assert.rejects(convertText('a'.repeat(100000),'buddha'), /100,000/);
  for (const size of [100000, 100001, 300001]) {
    // Create a tiny, highly compressed fixture beyond the normal input limit.
    const encoded = await convertFunText('x'.repeat(size),'bear',true,{},400000);
    assert.ok(encoded.length < 1000);
    if (size === 100000) assert.equal((await convertText(encoded,'bear','decode')).length,size);
    else await assert.rejects(convertText(encoded,'bear','decode'), /100,000/);
  }
});

test('unsupported compression and crypto give actionable localized errors', async () => {
  const originalCompression = globalThis.CompressionStream, originalCrypto = globalThis.crypto;
  try {
    setLocale('en');
    globalThis.CompressionStream = undefined;
    await assert.rejects(convertText('abc','bear'), /update your browser/);
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:undefined});
    await assert.rejects(convertText('abc','buddha'), /HTTPS/);
    await assert.rejects(convertText('bad','beast','decode'), /Invalid Beast/);
  } finally {
    globalThis.CompressionStream = originalCompression;
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:originalCrypto});
    setLocale('zh-CN');
  }
});
