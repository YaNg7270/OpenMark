#!/usr/bin/env node
/**
 * Generates the original OpenMark master icon as a 1024x1024 RGBA PNG.
 *
 * Why hand-rolled instead of a drawing library: the icon must be reproducible
 * on a clean checkout with zero extra dependencies (only Node's built-in
 * `zlib`), so we render the artwork analytically (signed-distance fields for
 * the rounded square, capsule distances for the strokes) and encode the PNG
 * ourselves.
 *
 * Run:  node scripts/generate-icon.mjs
 * Then: node_modules/.bin/tauri icon -o src-tauri/icons src-tauri/icons/source-icon.png
 *
 * Artwork: a rounded square with a vertical indigo -> sky gradient carrying a
 * bold white "M" plus a down arrow — the universal markdown glyph, drawn from
 * scratch for OpenMark.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 1024;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src-tauri/icons/source-icon.png');

// ---------------------------------------------------------------- PNG encoder

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Encode raw RGBA bytes (size*size*4) as an 8-bit RGBA PNG. */
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // One filter byte (0 = None) per scanline.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// -------------------------------------------------------------- distance math

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Coverage from a signed distance: 1 inside, 0 outside, smooth across ~1px. */
function coverage(d) {
  return clamp01(0.5 - d);
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp01(t);
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Signed distance to an axis-aligned rounded rectangle (negative inside). */
function roundedRectDistance(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

// ------------------------------------------------------------------- artwork

// Rounded square: 896px wide, 64px transparent margin all round.
const TILE = { cx: SIZE / 2, cy: SIZE / 2, half: 448, radius: 200 };

// Gradient endpoints (top -> bottom): indigo to sky.
const TOP = [79, 70, 229];
const BOTTOM = [14, 165, 233];

// The markdown glyph: an "M" and a down arrow, stroke-centred coordinates,
// tuned so the composition is centred on x = 512 and spans y = 346..700.
const STROKE = 40;
const ARROW_STROKE = 34;
const SEGMENTS = [
  // "M"
  [288, 700, 288, 380, STROKE],
  [288, 380, 392, 545, STROKE],
  [392, 545, 496, 380, STROKE],
  [496, 380, 496, 700, STROKE],
  // down arrow
  [672, 380, 672, 620, ARROW_STROKE],
  [600, 552, 672, 656, ARROW_STROKE],
  [744, 552, 672, 656, ARROW_STROKE],
];

const rgba = Buffer.alloc(SIZE * SIZE * 4);

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const px = x + 0.5;
    const py = y + 0.5;

    const tile = coverage(roundedRectDistance(px, py, TILE.cx, TILE.cy, TILE.half, TILE.half, TILE.radius));
    if (tile <= 0) continue; // stays fully transparent

    const t = clamp01(py / SIZE);
    let r = TOP[0] + (BOTTOM[0] - TOP[0]) * t;
    let g = TOP[1] + (BOTTOM[1] - TOP[1]) * t;
    let b = TOP[2] + (BOTTOM[2] - TOP[2]) * t;

    // Union of the strokes (max coverage, not sum, so overlaps stay opaque).
    let glyph = 0;
    for (const [ax, ay, bx, by, width] of SEGMENTS) {
      const d = segmentDistance(px, py, ax, ay, bx, by) - width / 2;
      const c = coverage(d);
      if (c > glyph) glyph = c;
    }

    r += (255 - r) * glyph;
    g += (255 - g) * glyph;
    b += (255 - b) * glyph;

    const o = (y * SIZE + x) * 4;
    rgba[o] = Math.round(r);
    rgba[o + 1] = Math.round(g);
    rgba[o + 2] = Math.round(b);
    rgba[o + 3] = Math.round(tile * 255);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, encodePng(rgba, SIZE));
console.log(`wrote ${OUT} (${SIZE}x${SIZE} RGBA)`);
