// The World in One Day — 25 November 2026 (v2)
// A one-image newspaper of Wednesday 25 November 2026, drawn from scratch.
// Node 22, standard library only. No network, no clock, no randomness:
// the same run always writes the same bytes.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
const PAPER: RGB = [246, 241, 229];
const INK: RGB = [26, 26, 26];
const GREY: RGB = [110, 105, 95];
const RED: RGB = [185, 28, 28];
const ORANGE: RGB = [194, 65, 12];
const GREEN: RGB = [21, 128, 61];
const RULE: RGB = [26, 26, 26];
const FAINT: RGB = [180, 172, 156];

type RGB = [number, number, number];

// ---------------------------------------------------------------- CRC-32
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(rgb: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 5x7 font
// Every glyph is 7 rows of 5 bits, most-significant bit on the left.
const GLYPHS: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  "3": [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  a: [0, 0, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111],
  b: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b11110],
  c: [0, 0, 0b01110, 0b10001, 0b10000, 0b10001, 0b01110],
  d: [0b00001, 0b00001, 0b01111, 0b10001, 0b10001, 0b10001, 0b01111],
  e: [0, 0, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110],
  f: [0b00110, 0b01000, 0b01000, 0b11110, 0b01000, 0b01000, 0b01000],
  g: [0, 0b01111, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
  h: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001],
  i: [0b00100, 0, 0b01100, 0b00100, 0b00100, 0b00100, 0b01110],
  j: [0b00010, 0, 0b00110, 0b00010, 0b00010, 0b10010, 0b01100],
  k: [0b10000, 0b10000, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  l: [0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  m: [0, 0, 0b11010, 0b10101, 0b10101, 0b10101, 0b10101],
  n: [0, 0, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001],
  o: [0, 0, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110],
  p: [0, 0, 0b11110, 0b10001, 0b10001, 0b11110, 0b10000],
  q: [0, 0, 0b01111, 0b10001, 0b10001, 0b01111, 0b00001],
  r: [0, 0, 0b10110, 0b11001, 0b10000, 0b10000, 0b10000],
  s: [0, 0, 0b01111, 0b10000, 0b01110, 0b00001, 0b11110],
  t: [0b01000, 0b01000, 0b11100, 0b01000, 0b01000, 0b01000, 0b00110],
  u: [0, 0, 0b10001, 0b10001, 0b10001, 0b10011, 0b01101],
  v: [0, 0, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  w: [0, 0, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  x: [0, 0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001],
  y: [0, 0, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
  z: [0, 0, 0b11111, 0b00010, 0b00100, 0b01000, 0b11111],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0b01100, 0b01100],
  ",": [0, 0, 0, 0, 0b01100, 0b00100, 0b01000],
  "-": [0, 0, 0, 0b01110, 0, 0, 0],
  "—": [0, 0, 0, 0b11111, 0, 0, 0],
  ":": [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  ";": [0, 0b01100, 0b01100, 0, 0b01100, 0b00100, 0b01000],
  "'": [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
  '"': [0b01010, 0b01010, 0, 0, 0, 0, 0],
  "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  "?": [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0, 0b00100],
  "(": [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ")": [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  "/": [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  "%": [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
  "+": [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  "=": [0, 0, 0b11111, 0, 0b11111, 0, 0],
  "&": [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  $: [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  "£": [0b00110, 0b01000, 0b01000, 0b11110, 0b01000, 0b01000, 0b11111],
  "€": [0b00111, 0b01000, 0b10000, 0b11110, 0b10000, 0b01000, 0b00111],
  "·": [0, 0, 0, 0b01100, 0b01100, 0, 0],
  "@": [0b01110, 0b10001, 0b10111, 0b10101, 0b10110, 0b10000, 0b01110],
  "#": [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
  _: [0, 0, 0, 0, 0, 0, 0b11111],
  "×": [0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0],
  "~": [0, 0, 0b01101, 0b10110, 0, 0, 0],
};

// ---------------------------------------------------------------- canvas
const buf = new Uint8Array(W * H * 3);

function px(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) px(xx, yy, c);
}

function hline(x: number, y: number, w: number, c: RGB, t = 1): void {
  for (let k = 0; k < t; k++) rect(x, y + k, w, 1, c);
}

function vline(x: number, y: number, h: number, c: RGB, t = 1): void {
  for (let k = 0; k < t; k++) rect(x + k, y, 1, h, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    px(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function thickLine(x0: number, y0: number, x1: number, y1: number, c: RGB, t: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const r = Math.floor(t / 2);
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + (dx * s) / steps);
    const y = Math.round(y0 + (dy * s) / steps);
    for (let a = -r; a <= r; a++)
      for (let b = -r; b <= r; b++) px(x + a, y + b, c);
  }
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r) px(cx + x, cy + y, c);
}

function ring(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    px(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
  }
}

function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minX = Math.min(x0, x1, x2);
  const maxX = Math.max(x0, x1, x2);
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const a = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / d;
      const b = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / d;
      const g = 1 - a - b;
      if (a >= 0 && b >= 0 && g >= 0) px(x, y, c);
    }
}

// ---------------------------------------------------------------- text
function glyphOf(ch: string): number[] {
  const g = GLYPHS[ch];
  if (!g) throw new Error(`no glyph for ${JSON.stringify(ch)}`);
  return g;
}

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

function drawChar(x: number, y: number, ch: string, scale: number, c: RGB): void {
  const g = glyphOf(ch);
  for (let r = 0; r < 7; r++)
    for (let col = 0; col < 5; col++)
      if (g[r] & (1 << (4 - col)))
        for (let a = 0; a < scale; a++)
          for (let b = 0; b < scale; b++) px(x + col * scale + a, y + r * scale + b, c);
}

function drawText(x: number, y: number, s: string, scale: number, c: RGB): void {
  for (let i = 0; i < s.length; i++) drawChar(x + i * 6 * scale, y, s[i], scale, c);
}

function drawTextCentered(cx: number, y: number, s: string, scale: number, c: RGB): void {
  drawText(cx - Math.floor(textWidth(s, scale) / 2), y, s, scale, c);
}

// Greedy word wrap. Throws when a word alone is wider than maxW.
function wrap(s: string, scale: number, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (textWidth(w, scale) > maxW) throw new Error(`word too wide: ${w}`);
    const next = cur ? cur + " " + w : w;
    if (textWidth(next, scale) <= maxW) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draw wrapped text inside a box; fails loudly when it does not fit.
function block(
  x: number,
  y: number,
  s: string,
  scale: number,
  maxW: number,
  maxLines: number,
  lineH: number,
  c: RGB,
): void {
  const lines = wrap(s, scale, maxW);
  if (lines.length > maxLines)
    throw new Error(`truncation: ${JSON.stringify(s)} needs ${lines.length} lines, max ${maxLines}`);
  for (let i = 0; i < lines.length; i++) drawText(x, y + i * lineH, lines[i], scale, c);
}

function lineChecked(x: number, y: number, s: string, scale: number, maxW: number, c: RGB): void {
  if (textWidth(s, scale) > maxW) throw new Error(`line too wide: ${JSON.stringify(s)}`);
  drawText(x, y, s, scale, c);
}

// ---------------------------------------------------------------- scenes
// Each hero scene is 320 wide, 136 tall, and drawn in its own visual idiom
// so the three read as three different pictures, not three variations.

function sceneRefinery(x: number, y: number): void {
  // Dusk sky: three warm bands, sun low on the right.
  rect(x, y, 320, 46, [245, 158, 11]);
  rect(x, y + 46, 320, 46, [234, 88, 12]);
  rect(x, y + 92, 320, 44, [154, 52, 18]);
  disc(x + 252, y + 34, 20, [253, 224, 130]);
  disc(x + 252, y + 34, 13, [254, 240, 180]);
  // Ground.
  rect(x, y + 108, 320, 28, [31, 41, 55]);
  // Storage tanks.
  rect(x + 18, y + 66, 64, 42, [55, 65, 81]);
  rect(x + 18, y + 66, 64, 6, [107, 114, 128]);
  rect(x + 100, y + 74, 56, 34, [55, 65, 81]);
  rect(x + 100, y + 74, 56, 5, [107, 114, 128]);
  rect(x + 172, y + 80, 48, 28, [55, 65, 81]);
  rect(x + 172, y + 80, 48, 5, [107, 114, 128]);
  // Flare stack with flame.
  rect(x + 246, y + 42, 6, 66, [75, 85, 99]);
  tri(x + 242, y + 42, x + 256, y + 42, x + 249, y + 24, [249, 115, 22]);
  tri(x + 245, y + 42, x + 253, y + 42, x + 249, y + 32, [253, 224, 71]);
  // Orange glow at the first tank's base.
  rect(x + 14, y + 104, 72, 5, [255, 122, 0]);
  rect(x + 28, y + 106, 44, 3, [255, 210, 63]);
  // A tall smoke column rising from the first tank, kept inside the scene.
  disc(x + 50, y + 60, 13, [24, 24, 24]);
  disc(x + 58, y + 44, 15, [24, 24, 24]);
  disc(x + 68, y + 28, 16, [31, 31, 31]);
  disc(x + 80, y + 14, 13, [31, 31, 31]);
  disc(x + 62, y + 50, 6, [74, 74, 74]);
  disc(x + 72, y + 32, 7, [74, 74, 74]);
  disc(x + 84, y + 18, 6, [82, 82, 82]);
  // Two drone silhouettes in the sky.
  rect(x + 194, y + 20, 18, 3, [17, 24, 39]);
  hline(x + 190, y + 17, 26, [17, 24, 39]);
  rect(x + 226, y + 48, 16, 3, [17, 24, 39]);
  hline(x + 223, y + 45, 22, [17, 24, 39]);
}

function sceneMarket(x: number, y: number): void {
  // Pale trading-floor background with a grid.
  rect(x, y, 320, 136, [238, 242, 247]);
  for (let gy = y + 22; gy < y + 120; gy += 22) hline(x, gy, 320, [203, 213, 225]);
  for (let gx = x + 40; gx < x + 320; gx += 40) vline(gx, y, 120, [203, 213, 225]);
  // Axes.
  vline(x + 28, y + 8, 104, [51, 65, 85], 2);
  hline(x + 28, y + 112, 280, [51, 65, 85], 2);
  // Axis labels: the fall and the close.
  drawText(x + 32, y + 12, "-4.6%", 1, [220, 38, 38]);
  drawText(x + 32, y + 100, "-0.6%", 1, [22, 163, 74]);
  // Skyline along the bottom.
  const sky: RGB = [30, 58, 95];
  rect(x + 40, y + 96, 22, 16, sky);
  rect(x + 66, y + 88, 18, 24, sky);
  rect(x + 88, y + 100, 26, 12, sky);
  rect(x + 118, y + 92, 16, 20, sky);
  rect(x + 138, y + 102, 24, 10, sky);
  rect(x + 166, y + 94, 20, 18, sky);
  rect(x + 190, y + 104, 26, 8, sky);
  px(x + 46, y + 100, [250, 204, 21]);
  px(x + 72, y + 94, [250, 204, 21]);
  px(x + 96, y + 104, [250, 204, 21]);
  px(x + 124, y + 98, [250, 204, 21]);
  px(x + 172, y + 100, [250, 204, 21]);
  // The plunge in red, the claw-back in green — thick, high contrast.
  thickLine(x + 34, y + 30, x + 90, y + 58, [220, 38, 38], 4);
  thickLine(x + 90, y + 58, x + 150, y + 104, [220, 38, 38], 4);
  thickLine(x + 150, y + 104, x + 220, y + 78, [22, 163, 74], 4);
  thickLine(x + 220, y + 78, x + 296, y + 56, [22, 163, 74], 4);
  tri(x + 296, y + 48, x + 288, y + 60, x + 302, y + 62, [22, 163, 74]);
  // Tariff document, bottom right.
  rect(x + 232, y + 84, 72, 40, [255, 255, 255]);
  rect(x + 232, y + 84, 72, 1, [100, 116, 139]);
  rect(x + 232, y + 123, 72, 1, [100, 116, 139]);
  rect(x + 232, y + 84, 1, 40, [100, 116, 139]);
  rect(x + 303, y + 84, 1, 40, [100, 116, 139]);
  drawText(x + 238, y + 88, "TARIFFS", 1, [185, 28, 28]);
  drawText(x + 238, y + 98, "14 NATIONS", 1, INK);
  hline(x + 238, y + 110, 60, [148, 163, 184]);
  hline(x + 238, y + 115, 60, [148, 163, 184]);
  disc(x + 292, y + 92, 5, [220, 38, 38]);
}

function sceneCourt(x: number, y: number): void {
  // Dark navy courtroom.
  rect(x, y, 320, 136, [22, 35, 63]);
  // One tall column on the far left.
  rect(x + 10, y + 12, 18, 114, [217, 210, 192]);
  rect(x + 6, y + 8, 26, 6, [217, 210, 192]);
  rect(x + 6, y + 122, 26, 5, [217, 210, 192]);
  // The big verdict badge, top centre.
  rect(x + 88, y + 12, 138, 34, [185, 28, 28]);
  rect(x + 88, y + 12, 138, 2, [255, 255, 255]);
  rect(x + 88, y + 44, 138, 2, [255, 255, 255]);
  drawTextCentered(x + 157, y + 20, "10 OF 12", 2, [255, 255, 255]);
  drawTextCentered(x + 157, y + 52, "SENTENCING 14 SEP 2027", 1, [250, 204, 21]);
  // Scales of justice, gold, below the badge on the left — larger now.
  const gold: RGB = [212, 160, 23];
  vline(x + 116, y + 62, 48, gold, 3);
  hline(x + 92, y + 66, 50, gold, 3);
  line(x + 94, y + 68, x + 86, y + 92, gold);
  line(x + 100, y + 68, x + 108, y + 92, gold);
  tri(x + 82, y + 92, x + 112, y + 92, x + 97, y + 104, gold);
  line(x + 134, y + 68, x + 128, y + 92, gold);
  line(x + 140, y + 68, x + 148, y + 92, gold);
  tri(x + 124, y + 92, x + 152, y + 92, x + 138, y + 104, gold);
  disc(x + 116, y + 60, 4, gold);
  // Telecom tower on the right, with signal rings.
  line(x + 252, y + 126, x + 272, y + 34, [15, 23, 42]);
  line(x + 292, y + 126, x + 272, y + 34, [15, 23, 42]);
  hline(x + 258, y + 104, 28, [15, 23, 42]);
  hline(x + 262, y + 84, 20, [15, 23, 42]);
  hline(x + 266, y + 64, 12, [15, 23, 42]);
  ring(x + 272, y + 30, 9, [250, 204, 21]);
  ring(x + 272, y + 30, 15, [250, 204, 21]);
  disc(x + 272, y + 30, 3, [250, 204, 21]);
  // Judge's bench along the bottom, gavel resting on it — larger now.
  rect(x + 60, y + 110, 200, 16, [91, 58, 30]);
  rect(x + 60, y + 110, 200, 3, [146, 96, 48]);
  thickLine(x + 178, y + 108, x + 204, y + 88, [139, 90, 43], 5);
  rect(x + 200, y + 80, 22, 12, [139, 90, 43]);
  rect(x + 168, y + 106, 24, 6, [60, 36, 18]);
}

// ---------------------------------------------------------------- layout
const MX = 24; // left margin
const COLS = [24, 352, 680];
const COLW = 320;
const QCOLS = [24, 270, 516, 762];
const QCOLW = 238;

interface Hero {
  tag: string;
  tagColor: RGB;
  status: "CLAIMED" | "CONFIRMED";
  headline: string;
  fact: string;
  source: string;
  scene: (x: number, y: number) => void;
}

const HEROES: Hero[] = [
  {
    tag: "MIDDLE EAST",
    tagColor: [124, 45, 18],
    status: "CLAIMED",
    headline: "Houthis claim refinery hit",
    fact: "4 drones downed; Brent $93.60.",
    source: "First reported 25 Nov · Reuters",
    scene: sceneRefinery,
  },
  {
    tag: "MARKETS",
    tagColor: [30, 58, 95],
    status: "CONFIRMED",
    headline: "Nasdaq plunges 4.6%, recovers",
    fact: "Nasdaq -4.6% intraday, closed -0.6%.",
    source: "First reported 25 Nov · AP",
    scene: sceneMarket,
  },
  {
    tag: "US-CHINA",
    tagColor: [91, 33, 182],
    status: "CONFIRMED",
    headline: "Huawei guilty 10 of 12 counts",
    fact: "Guilty of fraud and trade-secret theft.",
    source: "Reported worldwide 25 Nov · Reuters",
    scene: sceneCourt,
  },
];

interface Mid {
  tag: string;
  tagColor: RGB;
  headline: string;
  fact: string;
}

const MIDS: Mid[] = [
  { tag: "EUROPE", tagColor: [29, 78, 216], headline: "Poland plans no-fly zone", fact: "Warsaw plans zone along Ukraine border." },
  { tag: "EGYPT", tagColor: [146, 64, 14], headline: "31 killed in Cairo fire", fact: "Tanker overturns, fire hits 27 vehicles." },
  { tag: "GAZA", tagColor: [153, 27, 27], headline: "Hamas security chief killed", fact: "Abu al-Auf and family die in Shati strike." },
  { tag: "SPACE · CHINA", tagColor: [109, 40, 217], headline: "Pakistan's first astronaut flies", fact: "Shenzhou-24 docks with Zeeshan Ali." },
  { tag: "SUDAN", tagColor: [15, 118, 110], headline: "19 killed in Blue Nile", fact: "RSF drones hit Damazin and Roseires." },
  { tag: "TECH", tagColor: [22, 101, 52], headline: "FCC clears SpaceX data centres", fact: "Up to 1m satellites, a first for US space data." },
];

interface Brief {
  headline: string;
  fact: string;
}

const BRIEFS: Brief[] = [
  { headline: "Judges urge drop of Netanyahu case", fact: "A recommendation, not a ruling; Case 4000." },
  { headline: "Iraq court backs federal control", fact: "Federal forces may deploy to Kurdish borders, oil fields." },
  { headline: "Solomons pick Australia over China", fact: "$740m over 10 years; no foreign military bases." },
  { headline: "North Korea expels Swiss diplomat", fact: "Envoy given 48 hours to leave; office closed." },
  { headline: "Bangladesh garment pay rises 36%", fact: "Minimum wage 12,500 to 17,000 taka a month." },
  { headline: "China probes Shanghai party chief", fact: "Chen Jining investigated for 'serious violations'." },
  { headline: "EU, UK fine fragrance cartel", fact: "Givaudan, Firmenich, IFF fixed prices for Unilever." },
  { headline: "26 miners trapped in flooded mine", fact: "9 dead by Wednesday evening; rescue ongoing." },
];

interface Micro {
  headline: string;
  fact: string;
}

const MICROS: Micro[] = [
  { headline: "Ukraine hits Savasleyka base", fact: "3 MiG-31 + 2 Su-34 damaged." },
  { headline: "Murmansk governor jailed", fact: "First sitting governor held for graft." },
  { headline: "Ramaphosa wins Farmgate case", fact: "Court voids 2022 impeachment panel." },
  { headline: "At least 30 killed, Niger State", fact: "Militants hit Borgu villages." },
  { headline: "Duran Duran's Andy Taylor dies", fact: "Guitarist, 65, after cancer." },
  { headline: "Cartagena siege ends", fact: "All hostages freed; 1 gunman dead." },
  { headline: "Mississippi crash: six found", fact: "Coast Guard recovers all six." },
  { headline: "US Army detonates lead azide", fact: "Controlled blast in Iowa." },
  { headline: "Ukraine needs €115bn for 2027", fact: "€90bn secured from EU." },
  { headline: "Ukraine sinks Russian corvette", fact: "2 Libyans die off Benghazi." },
  { headline: "UK warns firms of sabotage", fact: "Russian proxy arson threat." },
  { headline: "Greece general strike hits", fact: "Ferries, metro, flights halted." },
  { headline: "Macy's parade postponed", fact: "Storms delay it to Saturday." },
  { headline: "US tells citizens: leave Iran", fact: "'Do not travel' warning issued." },
  { headline: "Iran claims downed US drones", fact: "MQ-9, Lucas over Hormuz." },
  { headline: "DOJ charges 800+ in scam sweep", fact: "400+ cases in global crackdown." },
];

function tag(x: number, y: number, s: string, c: RGB, scale: number): number {
  const w = textWidth(s, scale) + 12;
  rect(x, y, w, 7 * scale + 8, c);
  drawText(x + 6, y + 4, s, scale, [255, 255, 255]);
  return w;
}

function draw(): void {
  rect(0, 0, W, H, PAPER);

  // ---- masthead: title, then the date, bigger and redder than before.
  drawTextCentered(512, 16, "THE WORLD IN ONE DAY", 6, INK);
  drawTextCentered(512, 64, "Wednesday 25 November 2026", 4, RED);
  drawTextCentered(
    512,
    98,
    "33 stories · Asia · Middle East · Americas · Europe · Africa",
    2,
    GREY,
  );
  hline(MX, 118, 976, RULE, 3);

  // ---- heroes
  for (let i = 0; i < 3; i++) {
    const h = HEROES[i];
    const x = COLS[i];
    const tw = tag(x, 126, h.tag, h.tagColor, 2);
    const statusColor: RGB = h.status === "CLAIMED" ? ORANGE : GREEN;
    tag(x + tw + 6, 126, h.status, statusColor, 2);
    h.scene(x, 150);
    block(x, 294, h.headline, 4, COLW, 3, 34, INK);
    block(x, 402, h.fact, 2, COLW, 2, 17, INK);
    lineChecked(x, 440, h.source, 1, COLW, GREY);
  }
  hline(MX, 458, 976, RULE, 2);

  // ---- mid: roomier, headline one step larger
  for (let i = 0; i < 6; i++) {
    const m = MIDS[i];
    const x = COLS[i % 3];
    const y = 464 + Math.floor(i / 3) * 108;
    tag(x, y, m.tag, m.tagColor, 1);
    block(x, y + 14, m.headline, 3, COLW, 2, 26, INK);
    block(x, y + 70, m.fact, 2, COLW, 2, 17, INK);
  }
  hline(MX, 682, 976, RULE, 2);

  // ---- in brief
  rect(MX, 688, 976, 22, INK);
  drawText(MX + 8, 693, "IN BRIEF", 2, [255, 255, 255]);
  for (let i = 0; i < 8; i++) {
    const b = BRIEFS[i];
    const x = QCOLS[i % 4];
    const y = 714 + Math.floor(i / 4) * 56;
    block(x, y, b.headline, 2, QCOLW, 2, 17, INK);
    block(x, y + 36, b.fact, 1, QCOLW, 2, 10, INK);
  }

  // ---- also today (micro)
  rect(MX, 828, 976, 20, INK);
  drawText(MX + 8, 832, "ALSO TODAY", 2, [255, 255, 255]);
  for (let i = 0; i < 16; i++) {
    const m = MICROS[i];
    const x = QCOLS[i % 4];
    const y = 852 + Math.floor(i / 4) * 23;
    lineChecked(x, y, m.headline, 1, QCOLW, INK);
    lineChecked(x, y + 11, m.fact, 1, QCOLW, GREY);
  }

  // ---- honesty box
  const hy = 954;
  rect(MX, hy, 484, 46, PAPER);
  rect(MX, hy, 484, 3, ORANGE);
  rect(MX, hy + 43, 484, 3, ORANGE);
  rect(MX, hy, 3, 46, ORANGE);
  rect(MX + 481, hy, 3, 46, ORANGE);
  drawText(MX + 8, hy + 6, "CLAIMED — NOT YET CONFIRMED", 2, ORANGE);
  lineChecked(MX + 8, hy + 24, "Iran claims tankers hit mines in Hormuz — unverified.", 1, 468, INK);
  lineChecked(MX + 8, hy + 35, "Houthis claim Ras Tanura hit — Saudi: 4 drones downed.", 1, 468, INK);
  rect(516, hy, 484, 46, PAPER);
  rect(516, hy, 484, 3, GREEN);
  rect(516, hy + 43, 484, 3, GREEN);
  rect(516, hy, 3, 46, GREEN);
  rect(997, hy, 3, 46, GREEN);
  drawText(524, hy + 6, "CONFIRMED — AS REPORTED", 2, GREEN);
  lineChecked(524, hy + 24, "Nasdaq closed -0.6% after -4.6% intraday; Nvidia -3.9%.", 1, 468, INK);
  lineChecked(524, hy + 35, "Huawei guilty 10 of 12; Poland's no-fly zone is a plan.", 1, 468, INK);

  // ---- footer
  lineChecked(
    MX,
    1006,
    "Sources: Reuters, AP, CNN, BBC, AFP, Euronews, WSJ, Xinhua, ESA, WHO, DFAT, Le Monde, Al Jazeera, France24, BusinessWorld, Daily Summary.",
    1,
    976,
    GREY,
  );
  lineChecked(
    MX,
    1016,
    "Events first reported 25 Nov 2026 unless dated · Preliminary counts may rise · Drawn by program",
    1,
    976,
    GREY,
  );
}

function main(): void {
  draw();
  const png = encodePNG(buf, W, H);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.png");
  writeFileSync(outPath, png);
  console.log(`OK entry.png ${png.length} bytes 1024x1024 no truncations`);
  console.log(`wrote ${outPath}`);
}

main();
