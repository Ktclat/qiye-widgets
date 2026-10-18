import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectImageFormat, outputFilename, readableBytes, convertImageFile,
  FILE_CONVERTER_FORMATS, FILE_CONVERTER_MAX_BYTES,
} from '../src/file-converter.js';
import { fileConverterWidget } from '../src/widget-file-converter.js';

const png = bytes => new Blob([new Uint8Array([137,80,78,71,13,10,26,10,...bytes])]);
const jpg = () => new Blob([new Uint8Array([255,216,255,224,0,0,0])]);
const webp = () => new Blob([new TextEncoder().encode('RIFF0000WEBP')]);
const pngBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/gW8AAAAASUVORK5CYII=', 'base64');
const input = Object.assign(new Blob([pngBytes]), {name:'image.png'});

test('detect format by file signature, not by extension', async () => {
  assert.equal(await detectImageFormat(png([])), 'png');
  assert.equal(await detectImageFormat(jpg()), 'jpeg');
  assert.equal(await detectImageFormat(webp()), 'webp');
  assert.equal(await detectImageFormat(new Blob(['png.png'])), null);
  assert.equal(await detectImageFormat(null), null);
  assert.equal(await detectImageFormat(new Blob([new Uint8Array([255,216])])), null);
});

test('safe deterministic output filename and readable sizes', () => {
  assert.equal(outputFilename('folder/graphic.png', 'webp'), 'graphic.webp');
  assert.equal(outputFilename('../a?.PNG','jpeg'), 'a_.jpg');
  assert.equal(outputFilename('test.png','png',['test.png','test (2).png']), 'test (3).png');
  assert.equal(outputFilename('','png'), 'converted.png');
  assert.equal(readableBytes(200), '200 B');
  assert.equal(readableBytes(2048), '2.0 KB');
  assert.throws(()=>outputFilename('a.png','bmp'), /不支持/);
});

test('validates format, byte size, quality and pre-aborted signal', async () => {
  await assert.rejects(convertImageFile(input,{format:'exe'}), /不支持/);
  await assert.rejects(convertImageFile(input,{quality:2}), /画质/);
  await assert.rejects(convertImageFile(new Blob(),{}), /30 MB/);
  await assert.rejects(convertImageFile({size:FILE_CONVERTER_MAX_BYTES + 1},{}), /30 MB/);
  await assert.rejects(convertImageFile(new Blob(['not a png']),{}), /PNG/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(convertImageFile(input,{signal:controller.signal}), {name:'AbortError'});
});

function fakeCanvas({mime = 'image/jpeg', pixels = 16} = {}) {
  const state = { painted: false, drawn: false, closed: false, reset: false, quality: null, mime:null };
  const canvas = {
    width:0, height:0,
    getContext() { return {
      set fillStyle(value) { state.fill = value; },
      fillRect() { state.painted = true; },
      drawImage() { state.drawn = true; },
    }; },
    toBlob(callback,type,quality) { state.mime=type; state.quality=quality; callback(new Blob(['encoded'],{type:mime})); },
  };
  const originalDocument = globalThis.document, originalBitmap = globalThis.createImageBitmap;
  globalThis.document = { createElement(type) { assert.equal(type,'canvas'); return canvas; } };
  globalThis.createImageBitmap = async () => ({ width:pixels, height:pixels, close(){state.closed=true;} });
  return {state,canvas,restore(){globalThis.document=originalDocument;globalThis.createImageBitmap=originalBitmap;state.reset=canvas.width===0&&canvas.height===0;}};
}

test('JPEG export flattens alpha onto white and releases pixels', async () => {
  const harness = fakeCanvas();
  try {
    const output=await convertImageFile(input,{format:'jpeg',quality:85});
    assert.equal(output.inputFormat, 'png');
    assert.equal(output.width,16);
    assert.equal(output.blob.type,FILE_CONVERTER_FORMATS.jpeg);
    assert.equal(harness.state.fill,'#fff');
    assert.equal(harness.state.painted,true);
    assert.equal(harness.state.drawn,true);
    assert.equal(harness.state.mime,'image/jpeg');
    assert.equal(harness.state.quality,.85);
    assert.equal(harness.state.closed,true);
    assert.equal(harness.canvas.width,0);
  } finally { harness.restore(); }
});

test('animation and oversized headers are rejected before bitmap allocation', async () => {
  const originalBitmap=globalThis.createImageBitmap;
  let decodes=0;
  globalThis.createImageBitmap=async()=>{decodes++;throw new Error('must not decode');};
  try {
    const animation=Buffer.alloc(20);animation.writeUInt32BE(8);animation.write('acTL',4);
    const apng=new Blob([pngBytes.subarray(0,33),animation,pngBytes.subarray(33)]);
    await assert.rejects(convertImageFile(apng),/动画/);
    const webp=Buffer.alloc(30);webp.write('RIFF');webp.writeUInt32LE(22,4);webp.write('WEBPVP8X',8);webp.writeUInt32LE(10,16);webp[20]=2;
    await assert.rejects(convertImageFile(new Blob([webp])),/动画/);
    const huge=Buffer.from(pngBytes);huge.writeUInt32BE(10000,16);huge.writeUInt32BE(10000,20);
    await assert.rejects(convertImageFile(new Blob([huge])),/像素/);
    assert.equal(decodes,0);
  } finally {globalThis.createImageBitmap=originalBitmap;}
});

test('a wrong MIME label does not override the actual signature', async () => {
  const harness=fakeCanvas();
  try {
    const result=await convertImageFile(new Blob([pngBytes],{type:'image/jpeg'}),{format:'jpeg'});
    assert.equal(result.inputFormat,'png');
  } finally {harness.restore();}
});

test('cancellation during encoding discards output and closes bitmap', async () => {
  const controller=new AbortController(), harness=fakeCanvas();
  harness.canvas.toBlob=callback=>{controller.abort();callback(new Blob(['encoded'],{type:'image/jpeg'}));};
  try {
    await assert.rejects(convertImageFile(input,{format:'jpeg',signal:controller.signal}),{name:'AbortError'});
    assert.equal(harness.state.closed,true);assert.equal(harness.canvas.width,0);
  } finally {harness.restore();}
});

test('rejects silent encoder fallback to PNG and oversized decoded pixels', async () => {
  const fallback = fakeCanvas({mime:'image/png'});
  try { await assert.rejects(convertImageFile(input,{format:'webp'}), /当前浏览器/);assert.equal(fallback.state.closed,true); }
  finally {fallback.restore();}
  const oversized = fakeCanvas({pixels:6000});
  try { await assert.rejects(convertImageFile(input,{format:'png'}), /2400/);assert.equal(oversized.state.closed,true); }
  finally {oversized.restore();}
});

test('api v3 has all Qiye card sizes, inert escaped previews, and sane defaults', () => {
  assert.equal(fileConverterWidget.apiVersion,3);
  assert.equal(fileConverterWidget.type,'file-converter');
  assert.deepEqual(fileConverterWidget.sizes, ['1x1','1x2','2x1','2x2','4x2']);
  const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  for (const size of fileConverterWidget.sizes) {
    const html=fileConverterWidget.render({item:{title:'<img src=x>'},config:{outputFormat:'webp',quality:90},size,escapeHtml:escape,t:x=>x});
    assert.match(html,/data-action="widget-open"/);
    assert.match(html,/&lt;img src=x&gt;/);
    assert.doesNotMatch(html,/<img/);
    assert.doesNotMatch(html,/<input/);
  }
  assert.deepEqual(fileConverterWidget.fields.map(x=>x.default), ['webp',90]);
});
