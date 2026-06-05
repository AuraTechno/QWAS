// Генерация PNG-иконок из SVG или простого векторного дизайна.
// Без внешних зависимостей — pure Node.js.
// Использует встроенные zlib + ручную сборку PNG IDAT.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public');

function crc32(buf) {
  let c, t = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(width, height, pixelFn) {
  // RGBA raw scanlines, with filter byte (0) prefix per line
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const off = y * (rowBytes + 1) + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// === Brand colors ===
// Gradient: #5e8ee7 → #2b5278 (Telegram-like blue)
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function colorFor(t) {
  // t: 0..1 from top to bottom
  return [
    lerp(94, 43, t),     // R
    lerp(142, 82, t),    // G
    lerp(231, 120, t),   // B
    255                  // A
  ];
}

function drawPaperPlaneIcon(width, height) {
  // Простой paper plane (как в Telegram) внутри круга
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.45;
  const planeSize = Math.min(width, height) * 0.22;

  return (x, y) => {
    const dy = y / height;
    const c = colorFor(dy);

    // Distance from center
    const dx = x - cx;
    const dy2 = y - cy;
    const dist = Math.sqrt(dx * dx + dy2 * dy2);

    // Круг
    if (dist > r) {
      return [0, 0, 0, 0]; // transparent outside
    }

    // Paper plane geometry: triangle pointing top-right
    // Координаты в локальной системе (относительно центра)
    const lx = dx;
    const ly = dy2;
    // Поворот: -30 градусов
    const ang = -Math.PI / 6;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const rx = lx * cos - ly * sin;
    const ry = lx * sin + ly * cos;

    // Треугольник: вершины
    const v1 = { x: -planeSize * 0.5, y: planeSize * 0.4 };
    const v2 = { x: planeSize * 0.6, y: -planeSize * 0.1 };
    const v3 = { x: -planeSize * 0.4, y: -planeSize * 0.5 };

    const inTri = pointInTri(rx, ry, v1, v2, v3);
    if (inTri) {
      return [255, 255, 255, 230]; // white with slight transparency
    }

    return c;
  };
}

function pointInTri(px, py, v1, v2, v3) {
  const sign = (p1, p2, p3) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign({ x: px, y: py }, v1, v2);
  const d2 = sign({ x: px, y: py }, v2, v3);
  const d3 = sign({ x: px, y: py }, v3, v1);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

function drawLetterQ(width, height) {
  // Fallback: просто буква Q
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.42;
  const strokeW = Math.min(width, height) * 0.12;

  return (x, y) => {
    const dy = y / height;
    const c = colorFor(dy);
    const dx = x - cx;
    const dy2 = y - cy;
    const dist = Math.sqrt(dx * dx + dy2 * dy2);
    if (dist > r) return [0, 0, 0, 0];
    // Толщина кольца
    if (Math.abs(dist - r) < strokeW / 2) return [255, 255, 255, 240];
    // Хвостик Q
    const tailStart = r * 0.6;
    const tailEnd = r * 1.05;
    const tailAngle = Math.PI / 4; // 45 градусов
    const tx = dx * Math.cos(-tailAngle) - dy2 * Math.sin(-tailAngle);
    const ty = dx * Math.sin(-tailAngle) + dy2 * Math.cos(-tailAngle);
    if (tx > tailStart && ty > tailStart * 0.5 && ty < tailStart * 1.5) {
      const tailDist = Math.abs(tx - tailStart);
      if (tailDist < strokeW / 2 && tx < tailEnd) return [255, 255, 255, 240];
    }
    return c;
  };
}

function generate(size, fileName, variant = 'plane') {
  const fn = variant === 'letter' ? drawLetterQ(size, size) : drawPaperPlaneIcon(size, size);
  const buf = makePng(size, size, fn);
  const out = path.join(OUT, fileName);
  fs.writeFileSync(out, buf);
  console.log(`✓ ${fileName} (${size}x${size}, ${buf.length} bytes)`);
}

function generateMaskable(size, fileName) {
  // Maskable: вся площадь заполнена цветом, иконка в центре 80%
  const cx = size / 2;
  const cy = size / 2;
  const innerR = size * 0.4;
  const fn = (x, y) => {
    const dy = y / size;
    const c = colorFor(dy);
    const dx = x - cx;
    const dy2 = y - cy;
    const dist = Math.sqrt(dx * dx + dy2 * dy2);
    if (dist > size * 0.5) return [0, 0, 0, 0];

    // Paper plane в центре (только в innerR)
    if (dist <= innerR) {
      const lx = dx;
      const ly = dy2;
      const ang = -Math.PI / 6;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const rx = lx * cos - ly * sin;
      const ry = lx * sin + ly * cos;
      const planeSize = innerR * 1.0;
      const v1 = { x: -planeSize * 0.5, y: planeSize * 0.4 };
      const v2 = { x: planeSize * 0.6, y: -planeSize * 0.1 };
      const v3 = { x: -planeSize * 0.4, y: -planeSize * 0.5 };
      if (pointInTri(rx, ry, v1, v2, v3)) return [255, 255, 255, 230];
    }
    return c;
  };
  const buf = makePng(size, size, fn);
  const out = path.join(OUT, fileName);
  fs.writeFileSync(out, buf);
  console.log(`✓ ${fileName} (${size}x${size} maskable, ${buf.length} bytes)`);
}

console.log('Генерация PNG иконок для PWA…');
// Apple touch icons
generate(180, 'icon-180.png', 'plane');
generate(167, 'icon-167.png', 'plane');
generate(152, 'icon-152.png', 'plane');
generate(120, 'icon-120.png', 'plane');
// Manifest icons
generate(192, 'icon-192.png', 'plane');
generate(512, 'icon-512.png', 'plane');
// Maskable
generateMaskable(192, 'icon-192-maskable.png');
generateMaskable(512, 'icon-512-maskable.png');
// Favicon
generate(32, 'favicon-32.png', 'plane');
generate(16, 'favicon-16.png', 'plane');
console.log('Готово.');
