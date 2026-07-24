// Self-contained PNG icon generator (no deps) — brand mark: orange rounded
// square + white "M", matching the app header logo. Run: node scripts/gen-icons.cjs
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const ORANGE = [0xFF, 0x6B, 0x00];
const WHITE = [0xFF, 0xFF, 0xFF];

// CRC32 for PNG chunks
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return ~c >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
// distance from point to segment
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay; const l2 = dx*dx + dy*dy;
  let t = l2 ? ((px-ax)*dx + (py-ay)*dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const cx = ax + t*dx, cy = ay + t*dy; return Math.hypot(px-cx, py-cy);
}
function drawIcon(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  // safe inset for maskable (M within center ~66%); non-maskable fills more
  const pad = maskable ? size * 0.30 : size * 0.24;
  const w = size - pad * 2;              // M bounding box
  const x0 = pad, x1 = pad + w;
  const yTop = pad, yBot = size - pad;
  const xc = size / 2;
  const yMid = yTop + w * 0.52;
  const stroke = w * 0.15;               // stroke thickness
  // M strokes: left vertical, right vertical, two diagonals meeting at center
  const segs = [
    [x0, yTop, x0, yBot],
    [x1, yTop, x1, yBot],
    [x0, yTop, xc, yMid],
    [x1, yTop, xc, yMid],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // background orange (full-bleed square; iOS rounds corners itself)
      let r = ORANGE[0], g = ORANGE[1], b = ORANGE[2];
      // M coverage (anti-aliased by distance)
      let d = Infinity;
      for (const s of segs) d = Math.min(d, distSeg(x + 0.5, y + 0.5, s[0], s[1], s[2], s[3]));
      const cov = Math.max(0, Math.min(1, (stroke / 2 - d) + 0.5)); // ~1px AA
      if (cov > 0) { r = r + (WHITE[0]-r)*cov; g = g + (WHITE[1]-g)*cov; b = b + (WHITE[2]-b)*cov; }
      buf[i] = Math.round(r); buf[i+1] = Math.round(g); buf[i+2] = Math.round(b); buf[i+3] = 255;
    }
  }
  return buf;
}
const pub = path.join(__dirname, '..', 'public');
const out = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['apple-touch-icon.png', 180, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
];
for (const [name, size, opts] of out) {
  fs.writeFileSync(path.join(pub, name), encodePNG(size, size, drawIcon(size, opts)));
  console.log('wrote', name, size + 'x' + size);
}
