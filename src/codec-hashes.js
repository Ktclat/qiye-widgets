// SPDX-License-Identifier: GPL-3.0-only
// Independent implementations of the algorithms specified in RFC 1319, 1320
// and 1321. The MD2 permutation below is an algorithm constant, not source code.
const MD2_PI = new Uint8Array([
  41,46,67,201,162,216,124,1,61,54,84,161,236,240,6,19,
  98,167,5,243,192,199,115,140,152,147,43,217,188,76,130,202,
  30,155,87,60,253,212,224,22,103,66,111,24,138,23,229,18,
  190,78,196,214,218,158,222,73,160,251,245,142,187,47,238,122,
  169,104,121,145,21,178,7,63,148,194,16,137,11,34,95,33,
  128,127,93,154,90,144,50,39,53,62,204,231,191,247,151,3,
  255,25,48,179,72,165,181,209,215,94,146,42,172,86,170,198,
  79,184,56,210,150,164,125,182,118,252,107,226,156,116,4,241,
  69,157,112,89,100,113,135,32,134,91,207,101,230,45,168,2,
  27,96,37,173,174,176,185,246,28,70,97,105,52,64,126,15,
  85,71,163,35,221,81,175,58,195,92,249,206,186,197,234,38,
  44,83,13,110,133,40,132,9,211,223,205,244,65,129,77,82,
  106,220,55,200,108,193,171,250,36,225,123,8,12,189,177,74,
  120,136,149,139,227,99,232,109,233,203,213,254,59,0,29,57,
  242,239,183,14,102,88,208,228,166,119,114,248,235,117,75,10,
  49,68,80,180,143,237,31,26,219,153,141,51,159,17,131,20,
]);
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const rotate = (value, bits) => (value << bits) | (value >>> (32 - bits));

export function md2(bytes) {
  const padding = 16 - bytes.length % 16;
  const message = new Uint8Array(bytes.length + padding + 16);
  message.set(bytes);
  message.fill(padding, bytes.length, bytes.length + padding);
  const checksum = new Uint8Array(16), state = new Uint8Array(48);
  let previous = 0;
  for (let offset = 0; offset < message.length - 16; offset += 16) {
    for (let j = 0; j < 16; j++) {
      checksum[j] ^= MD2_PI[message[offset + j] ^ previous];
      previous = checksum[j];
    }
  }
  message.set(checksum, message.length - 16);
  for (let offset = 0; offset < message.length; offset += 16) {
    for (let j = 0; j < 16; j++) {
      state[j + 16] = message[offset + j];
      state[j + 32] = state[j] ^ state[j + 16];
    }
    let t = 0;
    for (let round = 0; round < 18; round++) {
      for (let j = 0; j < 48; j++) t = state[j] ^= MD2_PI[t];
      t = (t + round) & 255;
    }
  }
  return hex(state.subarray(0, 16));
}

function paddedWords(bytes) {
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bytes.length * 8, true);
  view.setUint32(padded.length - 4, Math.floor(bytes.length / 0x20000000), true);
  return view;
}

function wordsHex(words) {
  const bytes = new Uint8Array(16), view = new DataView(bytes.buffer);
  words.forEach((word, index) => view.setUint32(index * 4, word, true));
  return hex(bytes);
}

export function md4(bytes) {
  const view = paddedWords(bytes), state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  const shifts = [[3,7,11,19], [3,5,9,13], [3,9,11,15]];
  const lastOrder = [0,8,4,12,2,10,6,14,1,9,5,13,3,11,7,15];
  for (let offset = 0; offset < view.byteLength; offset += 64) {
    const words = Array.from({length:16}, (_, i) => view.getUint32(offset + i * 4, true));
    let [a, b, c, d] = state;
    for (let round = 0; round < 3; round++) {
      for (let step = 0; step < 16; step++) {
        const index = round === 0 ? step : round === 1 ? (step % 4) * 4 + (step >> 2) : lastOrder[step];
        const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
        const next = rotate((a + f + words[index] + [0, 0x5a827999, 0x6ed9eba1][round]) | 0, shifts[round][step % 4]);
        [a, b, c, d] = [d, next, b, c];
      }
    }
    [a,b,c,d].forEach((value, i) => { state[i] = (state[i] + value) | 0; });
  }
  return wordsHex(state);
}

const MD5_CONSTANTS = Array.from({length:64}, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) | 0);
export function md5(bytes) {
  const view = paddedWords(bytes), state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  const shifts = [[7,12,17,22], [5,9,14,20], [4,11,16,23], [6,10,15,21]];
  for (let offset = 0; offset < view.byteLength; offset += 64) {
    let [a, b, c, d] = state;
    for (let step = 0; step < 64; step++) {
      const round = step >> 4;
      const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c) : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
      const index = round === 0 ? step : round === 1 ? (5 * step + 1) % 16 : round === 2 ? (3 * step + 5) % 16 : (7 * step) % 16;
      const next = (b + rotate((a + f + MD5_CONSTANTS[step] + view.getUint32(offset + index * 4, true)) | 0, shifts[round][step % 4])) | 0;
      [a, b, c, d] = [d, next, b, c];
    }
    [a,b,c,d].forEach((value, i) => { state[i] = (state[i] + value) | 0; });
  }
  return wordsHex(state);
}
