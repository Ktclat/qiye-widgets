// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { inspectImage, optimizePngLossless, compressImage, createImageZip, downloadName, MAX_IMAGE_INPUT_BYTES } from '../src/image-compression.js';

// Tiny valid static PNG with one pixel. The compressor must not alter decoded scanlines.
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/gW8AAAAASUVORK5CYII=', 'base64'));
const file = (bytes, type='image/png') => new Blob([bytes], {type});
function chunks(bytes) {
  const result = []; let i = 8;
  while (i < bytes.length) {
    const n = new DataView(bytes.buffer, bytes.byteOffset+i, 4).getUint32(0);
    const type = Buffer.from(bytes.subarray(i+4, i+8)).toString('ascii');
    result.push({type, bytes:bytes.subarray(i+8, i+8+n)});
    i += n + 12;
    if (type === 'IEND') break;
  }
  return result;
}
function pngPixels(bytes) {
  return inflateSync(Buffer.concat(chunks(bytes).filter(c=>c.type==='IDAT').map(c=>Buffer.from(c.bytes))));
}
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^-1)>>>0;
}
function ancillary(name, data) {
  const out=new Uint8Array(data.length+12),view=new DataView(out.buffer);
  view.setUint32(0,data.length);
  out.set(Buffer.from(name),4);
  out.set(data,8);
  view.setUint32(out.length-4,crc32(out.subarray(4,out.length-4)));
  return out;
}
test('PNG signature, dimensions and static inspection', async () => {
  const result=await inspectImage(file(PNG));
  assert.equal(result.type,'image/png');
  assert.equal(result.png.width,1);
  assert.equal(result.png.height,1);
});
test('lossless PNG strips textual metadata without changing decoded image scanlines', async () => {
  const end=chunks(PNG).at(-1);
  const iendOffset=PNG.length-(end.bytes.length+12);
  const text=ancillary('tEXt',Buffer.from('Comment\0Private timestamp goes here'.repeat(5)));
  const source=file(Buffer.concat([PNG.subarray(0,iendOffset),text,PNG.subarray(iendOffset)]));
  const result=await compressImage(source,{mode:'lossless'});
  assert.equal(result.type,'image/png');
  assert.ok(result.outputBytes < source.size);
  assert.equal(chunks(new Uint8Array(await result.blob.arrayBuffer())).some(c=>c.type==='tEXt'),false);
  assert.deepEqual(pngPixels(new Uint8Array(await result.blob.arrayBuffer())),pngPixels(new Uint8Array(await source.arrayBuffer())));
});
test('no-change optimizer never enlarges a PNG', async () => {
  const source=file(PNG), result=await optimizePngLossless(source);
  assert.ok(result.size<=source.size);
});
test('invalid input and unsupported formats fail closed', async () => {
  await assert.rejects(inspectImage(file(new Uint8Array([1,2,3]))));
  await assert.rejects(inspectImage(file(PNG,'image/jpeg')));
  await assert.rejects(compressImage(file(PNG),{mode:'wrong'}));
  await assert.rejects(compressImage(file(PNG),{mode:'lossless',maxBytes:1}));
  const animated=ancillary('acTL',Uint8Array.of(0,0,0,1,0,0,0,1));
  const iendOffset=PNG.length-12;
  await assert.rejects(inspectImage(file(Buffer.concat([PNG.subarray(0,iendOffset),animated,PNG.subarray(iendOffset)]))),/动画/);
  const tooLarge=Object.create(Blob.prototype,{size:{value:MAX_IMAGE_INPUT_BYTES+1},type:{value:'image/png'}});
  await assert.rejects(inspectImage(tooLarge),/32 MiB/);
});
test('ZIP stores file content in a valid local entry and provides a safe filename', async () => {
  const zip=await createImageZip([{name:'../sample.png',blob:file(PNG)}]);
  const buffer=Buffer.from(await zip.arrayBuffer());
  assert.equal(buffer.toString('binary',0,2),'PK');
  assert.equal(buffer.readUInt32LE(0),0x04034b50);
  assert.equal(buffer.readUInt16LE(12),33); // Valid, deterministic 1980-01-01.
  const nameLength=buffer.readUInt16LE(26);
  const dataOffset=30+nameLength;
  assert.deepEqual(buffer.subarray(dataOffset,dataOffset+PNG.length),Buffer.from(PNG));
  assert.equal(downloadName('a/../../evil.png','image/webp'),'a_.._.._evil.webp');
});

test('JPEG and WebP dimensions are checked before decoding large images', async () => {
  const jpeg = new Uint8Array([255,216,255,192,0,8,8,0x27,0x10,0x27,0x10,1]);
  const webp = new Uint8Array(30);
  webp.set(Buffer.from('RIFF'),0); webp.set(Buffer.from('WEBPVP8X'),8);
  const view=new DataView(webp.buffer);view.setUint32(4,22,true);view.setUint32(16,10,true);
  webp.set([0x0f,0x27,0,0x0f,0x27,0],24);
  await assert.rejects(inspectImage(file(jpeg,'image/jpeg')),/像素/);
  await assert.rejects(inspectImage(file(webp,'image/webp')),/像素/);
  jpeg.set([0,1,0,1],7);
  assert.equal((await inspectImage(file(jpeg,'image/jpeg'))).type,'image/jpeg');
  await assert.rejects(inspectImage(file(Uint8Array.of(255,216,255,192),'image/jpeg')),/尺寸/);
});

test('cancellation and unsupported output release bitmap and canvas memory', async () => {
  const savedBitmap=globalThis.createImageBitmap, savedDocument=globalThis.document;
  let closed=0, canvas;
  const controller=new AbortController();
  try {
    globalThis.createImageBitmap=async()=>({width:1,height:1,close(){closed++;}});
    globalThis.document={createElement(){return canvas={width:0,height:0,getContext:()=>({drawImage(){}}),
      toBlob(callback){controller.abort();callback(new Blob(['encoded'],{type:'image/webp'}));}};}};
    await assert.rejects(compressImage(file(PNG),{signal:controller.signal}),{name:'AbortError'});
    assert.equal(closed,1);assert.equal(canvas.width,0);assert.equal(canvas.height,0);
    globalThis.document.createElement=()=>canvas={getContext:()=>({drawImage(){}}),toBlob(cb){cb(file(PNG));}};
    await assert.rejects(compressImage(file(PNG)),/编码格式/);
    assert.equal(closed,2);assert.equal(canvas.width,0);
  } finally {globalThis.createImageBitmap=savedBitmap;globalThis.document=savedDocument;}
});
