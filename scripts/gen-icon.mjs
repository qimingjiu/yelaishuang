// 生成夜来霜应用图标：夜空底 + 六出霜晶。纯 Node 实现，无第三方依赖。
// 产出 app-icon.png（1024，tauri icon 的源图）与 PWA 图标（192/512）。
// 全平台图标（ico/icns 等）由 `npm run icon` 调 tauri icon 生成。
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function writePNG(file, size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(file, png);
}

const TAU = Math.PI * 2;

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  return Math.hypot(dx, dy);
}

// 六出霜晶：六根主枝，各带两对侧枝
function crystalSegments(size) {
  const s = size / 1024;
  const cx = size / 2;
  const cy = size / 2;
  const R = 345 * s;
  const segs = [];
  for (let k = 0; k < 6; k++) {
    const a = k * (TAU / 6) - Math.PI / 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    segs.push([cx, cy, cx + dx * R, cy + dy * R]);
    for (const [t, len] of [
      [0.5, 0.34],
      [0.78, 0.24],
    ]) {
      for (const sign of [-1, 1]) {
        const b = a + sign * (TAU / 12) * 1.15;
        const ox = cx + dx * R * t;
        const oy = cy + dy * R * t;
        segs.push([ox, oy, ox + Math.cos(b) * R * len, oy + Math.sin(b) * R * len]);
      }
    }
  }
  return segs;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const segs = crystalSegments(size);
  const cx = size / 2;
  const cy = size / 2;
  const coreW = size * 0.011;
  const glowW = size * 0.03;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = y / size;
      let r = 13 + 12 * t;
      let g = 19 + 18 * t;
      let b = 32 + 28 * t;
      const dc = Math.hypot(x - cx, y - cy) / size;
      const halo = Math.max(0, 1 - dc * 3.4) ** 2 * 0.22;
      r += halo * 60;
      g += halo * 80;
      b += halo * 110;
      let d = Infinity;
      for (const [ax, ay, bx, by] of segs) {
        const dd = distToSegment(x + 0.5, y + 0.5, ax, ay, bx, by);
        if (dd < d) d = dd;
      }
      const glow = Math.max(0, 1 - d / glowW) ** 2 * 0.5;
      const core = Math.max(0, 1 - d / coreW);
      r = r * (1 - glow) + 159 * glow;
      g = g * (1 - glow) + 194 * glow;
      b = b * (1 - glow) + 232 * glow;
      r = r * (1 - core) + 244 * core;
      g = g * (1 - core) + 249 * core;
      b = b * (1 - core) + 255 * core;
      rgba[i] = Math.round(Math.min(255, r));
      rgba[i + 1] = Math.round(Math.min(255, g));
      rgba[i + 2] = Math.round(Math.min(255, b));
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

mkdirSync('public/icons', { recursive: true });
writePNG('app-icon.png', 1024, render(1024));
writePNG('public/icons/pwa-192.png', 192, render(192));
writePNG('public/icons/pwa-512.png', 512, render(512));
console.log('已生成 app-icon.png (1024)、public/icons/pwa-192.png、public/icons/pwa-512.png');
