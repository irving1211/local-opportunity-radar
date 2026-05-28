// Dependency-free PNG icon generator (no ImageMagick / sharp available).
// Draws the Radar mark (indigo bg + white concentric rings + sweep) at native sizes.
import zlib from "node:zlib";
import { writeFileSync } from "node:fs";

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(size, draw) {
  const w = size, h = size;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = draw(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// colors
const INDIGO = [94, 106, 210];
const WHITE = [255, 255, 255];
const mix = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];

function makeDraw(size) {
  const cx = size / 2, cy = size / 2;
  const S = size;
  const rings = [0.135, 0.245, 0.355].map((k) => k * S);
  const lw = Math.max(2, S * 0.022);
  return (x, y) => {
    const dx = x - cx, dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let col = INDIGO.slice(); // opaque indigo background (works for maskable + any)
    // sweep wedge (subtle) between angle -90..-40 deg
    const ang = Math.atan2(dy, dx); // -PI..PI
    if (ang > -Math.PI / 2 && ang < -Math.PI / 4 && dist < 0.4 * S) col = mix(col, WHITE, 0.14);
    // rings
    for (let i = 0; i < rings.length; i++) {
      if (Math.abs(dist - rings[i]) < lw / 2) col = mix(col, WHITE, 0.92 - i * 0.18);
    }
    // sweep line at -45deg
    const lineAng = -Math.PI / 4;
    const proj = dx * Math.cos(lineAng) + dy * Math.sin(lineAng);
    const perp = Math.abs(-dx * Math.sin(lineAng) + dy * Math.cos(lineAng));
    if (proj > 0 && proj < 0.4 * S && perp < lw * 0.7) col = WHITE;
    // center dot
    if (dist < S * 0.04) col = WHITE;
    return [col[0], col[1], col[2], 255];
  };
}

for (const size of [180, 192, 512]) {
  const buf = png(size, makeDraw(size));
  writeFileSync(new URL(`./icon-${size}.png`, import.meta.url), buf);
  console.log(`wrote icon-${size}.png (${buf.length} bytes)`);
}
