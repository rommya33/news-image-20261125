// news-image-20261125 — "The World in One Day"
// A one-day newspaper front page for Wednesday 25 November 2026, drawn from
// scratch: pixel buffer + hand-written 5x8 bitmap font + hand-rolled PNG
// encoder (IHDR/IDAT/IEND chunks, CRC-32, deflate via node:zlib). Node 22
// standard library only, no network, fully deterministic: the date is a
// fixed string, no clock, no randomness. Two runs write byte-identical
// entry.png. Every line of text is measured as it is drawn; if any headline
// or fact would be cut off or overflow its box, the program fails loudly
// instead of shipping a broken page.
import * as fs from "node:fs";
import * as zlib from "node:zlib";
import * as path from "node:path";

const W = 1024;
const H = 1024;
const buf = new Uint8Array(W * H * 3);

// ---- palette ----
const PAPER: RGB = [250, 246, 236];
const INK: RGB = [24, 24, 24];
const RED: RGB = [178, 34, 28];
const DARKRED: RGB = [140, 24, 20];
const BLUE: RGB = [31, 78, 121];
const GREEN: RGB = [38, 110, 52];
const ORANGE: RGB = [201, 106, 43];
const GOLD: RGB = [178, 141, 28];
const DARK: RGB = [35, 39, 46];
const GRAY: RGB = [107, 114, 128];
const LINE: RGB = [216, 210, 196];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

type RGB = [number, number, number];

function px(x: number, y: number, c: RGB): void {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const o = (iy * W + ix) * 3;
  buf[o] = c[0];
  buf[o + 1] = c[1];
  buf[o + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const o = (yy * W + xx) * 3;
      buf[o] = c[0];
      buf[o + 1] = c[1];
      buf[o + 2] = c[2];
    }
  }
}

function rect(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function hline(x0: number, x1: number, y: number, c: RGB, t = 1): void {
  fillRect(x0, y, x1 - x0, t, c);
}

function vline(x: number, y0: number, y1: number, c: RGB, t = 1): void {
  fillRect(x, y0, t, y1 - y0, c);
}

// Bresenham line, with a square brush of size t.
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  const half = Math.floor(t / 2);
  for (;;) {
    fillRect(x - half, y - half, t, t, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let yy = -r; yy <= r; yy++) {
    const hw = Math.floor(Math.sqrt(r * r - yy * yy));
    fillRect(cx - hw, cy + yy, hw * 2 + 1, 1, c);
  }
}

function circle(cx: number, cy: number, r: number, c: RGB, t = 1): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    fillRect(cx + Math.cos(rad) * r - half(t), cy + Math.sin(rad) * r - half(t), t, t, c);
  }
}

function half(t: number): number {
  return Math.floor(t / 2);
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let yy = -ry; yy <= ry; yy++) {
    const hw = Math.floor(rx * Math.sqrt(1 - (yy * yy) / (ry * ry)));
    fillRect(cx - hw, cy + yy, hw * 2 + 1, 1, c);
  }
}

function fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs: number[] = [];
    const edges: [number, number, number, number][] = [
      [x0, y0, x1, y1],
      [x1, y1, x2, y2],
      [x2, y2, x0, y0],
    ];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    if (xs.length >= 2) {
      const a = Math.min(...xs);
      const b = Math.max(...xs);
      fillRect(a, y, b - a + 1, 1, c);
    }
  }
}

// ---- 5x8 bitmap font, written from scratch ----
// Each glyph is 5 bytes (one per column); bit 7 is the top row, bit 0 the bottom.
const FONT: Record<string, number[]> = {
  "A": [0x7E, 0x90, 0x90, 0x90, 0x7E],
  "B": [0xFE, 0x92, 0x92, 0x92, 0x6C],
  "C": [0x7C, 0x82, 0x82, 0x82, 0x82],
  "D": [0xFE, 0x82, 0x82, 0x82, 0x7C],
  "E": [0xFE, 0x92, 0x92, 0x92, 0x92],
  "F": [0xFE, 0x90, 0x90, 0x90, 0x90],
  "G": [0x7C, 0x82, 0x92, 0x92, 0x9E],
  "H": [0xFE, 0x10, 0x10, 0x10, 0xFE],
  "I": [0x82, 0x82, 0xFE, 0x82, 0x82],
  "J": [0x03, 0x03, 0x83, 0x82, 0xFC],
  "K": [0xFE, 0x10, 0x38, 0x44, 0x82],
  "L": [0xFE, 0x02, 0x02, 0x02, 0x02],
  "M": [0xFE, 0x70, 0x30, 0x70, 0xFE],
  "N": [0xFE, 0x60, 0x30, 0x18, 0xFE],
  "O": [0x7C, 0x82, 0x82, 0x82, 0x7C],
  "P": [0xFE, 0x90, 0x90, 0x90, 0x60],
  "Q": [0x7C, 0x82, 0x8A, 0x86, 0x79],
  "R": [0xFE, 0x90, 0x98, 0x94, 0x62],
  "S": [0x62, 0x92, 0x92, 0x92, 0x8E],
  "T": [0x80, 0x80, 0xFE, 0x80, 0x80],
  "U": [0xFC, 0x02, 0x02, 0x02, 0xFC],
  "V": [0xF8, 0x04, 0x02, 0x04, 0xF8],
  "W": [0xFC, 0x02, 0x1C, 0x02, 0xFC],
  "X": [0xC6, 0x28, 0x10, 0x28, 0xC6],
  "Y": [0xC0, 0x20, 0x1E, 0x20, 0xC0],
  "Z": [0x86, 0x8A, 0x92, 0xA2, 0xC2],
  "a": [0x16, 0x2A, 0x3A, 0x2A, 0x1C],
  "b": [0xFE, 0x22, 0x22, 0x22, 0x1C],
  "c": [0x1C, 0x22, 0x22, 0x22, 0x22],
  "d": [0x1C, 0x22, 0x22, 0x22, 0xFE],
  "e": [0x1C, 0x2A, 0x2A, 0x3A, 0x10],
  "f": [0x10, 0x7E, 0x90, 0x90, 0x00],
  "g": [0x19, 0x25, 0x25, 0x26, 0x18],
  "h": [0xFE, 0x20, 0x20, 0x20, 0x1E],
  "i": [0x12, 0x12, 0x9E, 0x12, 0x12],
  "j": [0x01, 0x01, 0x13, 0x9E, 0x9E],
  "k": [0xFE, 0x08, 0x1C, 0x22, 0x22],
  "l": [0x82, 0x82, 0xFE, 0x82, 0x82],
  "m": [0x3E, 0x1C, 0x20, 0x1C, 0x3E],
  "n": [0x3E, 0x20, 0x20, 0x20, 0x1E],
  "o": [0x1C, 0x22, 0x22, 0x22, 0x1C],
  "p": [0x3E, 0x24, 0x24, 0x24, 0x18],
  "q": [0x18, 0x24, 0x24, 0x24, 0x3F],
  "r": [0x3E, 0x30, 0x20, 0x10, 0x20],
  "s": [0x12, 0x2A, 0x2A, 0x2A, 0x26],
  "t": [0x20, 0xDC, 0x22, 0x22, 0x20],
  "u": [0x3C, 0x02, 0x03, 0x06, 0x3C],
  "v": [0x38, 0x04, 0x02, 0x04, 0x38],
  "w": [0x3C, 0x02, 0x1C, 0x02, 0x3C],
  "x": [0x22, 0x14, 0x08, 0x14, 0x22],
  "y": [0x38, 0x05, 0x02, 0x04, 0x38],
  "z": [0x26, 0x2A, 0x32, 0x22, 0x22],
  "0": [0x7C, 0x8A, 0x92, 0xA2, 0x7C],
  "1": [0x42, 0x42, 0xFE, 0x02, 0x02],
  "2": [0x46, 0x8A, 0x92, 0xA2, 0xC2],
  "3": [0x92, 0x92, 0x92, 0x92, 0x6C],
  "4": [0x10, 0x28, 0x48, 0xFE, 0x08],
  "5": [0xE4, 0xA2, 0xA2, 0xA2, 0x9A],
  "6": [0x7C, 0x92, 0x92, 0x92, 0x1C],
  "7": [0x80, 0x80, 0x80, 0xC0, 0xFE],
  "8": [0x7C, 0x92, 0x92, 0x92, 0x7C],
  "9": [0x60, 0x92, 0x92, 0x92, 0x7C],
  " ": [0x00, 0x00, 0x00, 0x00, 0x00],
  ".": [0x00, 0x00, 0x02, 0x00, 0x00],
  ",": [0x00, 0x00, 0x02, 0x03, 0x00],
  ":": [0x00, 0x00, 0x24, 0x00, 0x00],
  ";": [0x00, 0x00, 0x26, 0x01, 0x00],
  "!": [0x00, 0x00, 0xFA, 0x00, 0x00],
  "?": [0x40, 0x82, 0x92, 0x88, 0x60],
  "'": [0x00, 0x00, 0xC0, 0x00, 0x00],
  '"': [0x00, 0xC0, 0x00, 0xC0, 0x00],
  "-": [0x10, 0x10, 0x10, 0x10, 0x10],
  "–": [0x10, 0x10, 0x10, 0x10, 0x10],
  "—": [0x10, 0x10, 0x10, 0x10, 0x10],
  "(": [0x38, 0x44, 0x82, 0x00, 0x00],
  ")": [0x00, 0x00, 0x82, 0x44, 0x38],
  "/": [0x06, 0x0C, 0x10, 0x60, 0x80],
  "%": [0xC3, 0xC6, 0x0A, 0x12, 0xE1],
  "$": [0x64, 0xD6, 0xB2, 0xD6, 0x4C],
  "&": [0x66, 0x92, 0xAA, 0x8A, 0x4D],
  "+": [0x10, 0x10, 0x7C, 0x10, 0x10],
  "@": [0x78, 0x86, 0xAA, 0xBA, 0x78],
  "#": [0x24, 0xDA, 0x24, 0xDA, 0x24],
  "·": [0x00, 0x00, 0x10, 0x00, 0x00],
  "×": [0x22, 0x14, 0x08, 0x14, 0x22],
  "→": [0x10, 0x10, 0x54, 0x38, 0x10],
  "=": [0x28, 0x28, 0x28, 0x28, 0x28],
  "*": [0x54, 0x38, 0x7C, 0x38, 0x54],
  "€": [0x7C, 0x92, 0x92, 0xAA, 0x82],
  "£": [0x7E, 0x92, 0x92, 0x92, 0x92],
  "~": [0x10, 0x30, 0x10, 0x30, 0x10],
  "_": [0x01, 0x01, 0x01, 0x01, 0x01],
};

function glyph(ch: string): number[] {
  return FONT[ch] ?? FONT["?"] ?? [0x40, 0x82, 0x92, 0x88, 0x60];
}

function charW(scale: number): number {
  return 6 * scale;
}

function textW(s: string, scale: number): number {
  return s.length * charW(scale);
}

function drawChar(x: number, y: number, ch: string, scale: number, c: RGB, bold = false): void {
  const g = glyph(ch);
  for (let col = 0; col < 5; col++) {
    const bits = g[col];
    if (!bits) continue;
    for (let row = 0; row < 8; row++) {
      if ((bits >> (7 - row)) & 1) {
        const px0 = Math.round(x + col * scale);
        const px1 = Math.round(x + (col + 1) * scale);
        const py0 = Math.round(y + row * scale);
        const py1 = Math.round(y + (row + 1) * scale);
        fillRect(px0, py0, Math.max(1, px1 - px0), Math.max(1, py1 - py0), c);
        if (bold) {
          fillRect(px0 + 1, py0, Math.max(1, px1 - px0), Math.max(1, py1 - py0), c);
        }
      }
    }
  }
}

function drawText(x: number, y: number, s: string, scale: number, c: RGB, bold = false): void {
  let cx = x;
  for (const ch of s) {
    drawChar(cx, y, ch, scale, c, bold);
    cx += charW(scale);
  }
}

function drawTextCentered(cx: number, y: number, s: string, scale: number, c: RGB, bold = false): void {
  drawText(cx - textW(s, scale) / 2, y, s, scale, c, bold);
}

// Greedy word wrap. Returns lines that fit maxW. Throws if a single word
// cannot fit at all (that is a content bug, not something to hide).
function wrap(text: string, maxW: number, scale: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (textW(w, scale) > maxW) {
      throw new Error(`WORD TOO LONG: "${w}" at scale ${scale} in "${text}"`);
    }
    const next = cur ? cur + " " + w : w;
    if (textW(next, scale) <= maxW) {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draw wrapped text; FAILS (throws) when it needs more than maxLines.
function drawWrapped(
  x: number,
  y: number,
  w: number,
  text: string,
  scale: number,
  c: RGB,
  lineH: number,
  maxLines: number,
  label: string,
  bold = false,
): void {
  const lines = wrap(text, w, scale);
  if (lines.length > maxLines) {
    throw new Error(
      `TRUNCATED ${label}: "${text}" needs ${lines.length} lines, max ${maxLines}`,
    );
  }
  lines.forEach((ln, i) => drawText(x, y + i * lineH, ln, scale, c, bold));
}

// Single line that must fit; fails loudly otherwise.
function drawLine(x: number, y: number, maxW: number, text: string, scale: number, c: RGB, label: string, bold = false): void {
  if (textW(text, scale) > maxW) {
    throw new Error(`TOO WIDE ${label}: "${text}" is ${textW(text, scale)}px, max ${maxW}px`);
  }
  drawText(x, y, text, scale, c, bold);
}

// ---- hero scenes ----

// Refinery at dusk: black smoke column rising from a tank, orange glow,
// distillation column, drone silhouette. Never a dark cloud: the smoke is
// a clear vertical column with a defined source at the tank.
function drawRefinery(x: number, y: number, w: number, h: number): void {
  // dusk sky bands
  fillRect(x, y, w, 34, [245, 176, 65]);
  fillRect(x, y + 34, w, 30, [232, 122, 42]);
  fillRect(x, y + 64, w, h - 64, [198, 88, 30]);
  // pale sun
  fillCircle(x + 268, y + 24, 13, [253, 232, 192]);
  // ground
  fillRect(x, y + 92, w, h - 92, [38, 33, 28]);
  // storage tanks
  fillRect(x + 18, y + 66, 74, 26, [58, 56, 52]);
  fillEllipse(x + 55, y + 66, 37, 7, [96, 94, 88]);
  fillRect(x + 104, y + 70, 52, 22, [66, 63, 58]);
  fillEllipse(x + 130, y + 70, 26, 6, [104, 102, 96]);
  // distillation column
  fillRect(x + 196, y + 34, 16, 58, [72, 70, 66]);
  hline(x + 192, x + 216, y + 44, [110, 108, 102], 2);
  hline(x + 192, x + 216, y + 56, [110, 108, 102], 2);
  hline(x + 192, x + 216, y + 68, [110, 108, 102], 2);
  // flare stack
  fillRect(x + 226, y + 26, 6, 66, [52, 50, 46]);
  fillTriangle(x + 224, y + 26, x + 234, y + 26, x + 229, y + 14, [255, 140, 26]);
  // orange glow at the tank base (the strike's fire)
  fillEllipse(x + 55, y + 90, 30, 8, [255, 122, 26]);
  fillEllipse(x + 55, y + 90, 16, 5, [255, 194, 26]);
  // black smoke column rising from the tank, drifting right
  const smoke: [number, number, number][] = [
    [55, 58, 11],
    [58, 46, 13],
    [63, 34, 12],
    [69, 23, 10],
    [76, 13, 8],
  ];
  for (const [sx, sy, r] of smoke) {
    fillCircle(x + sx, y + sy, r, [31, 27, 24]);
  }
  fillCircle(x + 58, y + 46, 7, [58, 53, 48]);
  fillCircle(x + 69, y + 23, 5, [58, 53, 48]);
  // drone silhouette
  const dx = x + 262;
  const dy = y + 52;
  fillRect(dx, dy, 16, 4, [26, 26, 26]);
  fillRect(dx + 6, dy + 4, 4, 4, [26, 26, 26]);
  hline(dx - 6, dx + 22, dy - 3, [26, 26, 26], 2);
  hline(dx - 4, dx + 20, dy - 6, [26, 26, 26], 1);
}

// Market: chart with axes, red plunge then green recovery, skyline below,
// tariff document with a seal.
function drawMarket(x: number, y: number, w: number, h: number): void {
  // sky
  fillRect(x, y, w, h, [220, 230, 242]);
  // chart panel
  fillRect(x + 12, y + 8, w - 24, 78, WHITE);
  rect(x + 12, y + 8, w - 24, 78, [180, 188, 200], 1);
  // faint grid
  hline(x + 34, x + w - 18, y + 30, [226, 232, 240], 1);
  hline(x + 34, x + w - 18, y + 52, [226, 232, 240], 1);
  hline(x + 34, x + w - 18, y + 72, [226, 232, 240], 1);
  // axes
  vline(x + 34, y + 16, y + 78, [90, 98, 112], 2);
  hline(x + 34, x + w - 18, y + 78, [90, 98, 112], 2);
  // red plunge
  line(x + 40, y + 22, x + 96, y + 34, RED, 3);
  line(x + 96, y + 34, x + 148, y + 70, RED, 3);
  fillTriangle(x + 148, y + 70, x + 140, y + 64, x + 142, y + 74, RED);
  // green recovery
  line(x + 148, y + 70, x + 210, y + 52, GREEN, 3);
  line(x + 210, y + 52, x + 268, y + 34, GREEN, 3);
  line(x + 268, y + 34, x + 300, y + 28, GREEN, 3);
  fillTriangle(x + 300, y + 28, x + 292, y + 26, x + 294, y + 34, GREEN);
  // skyline
  const skyline: [number, number, number][] = [
    [0, 26, 18],
    [30, 18, 22],
    [56, 30, 16],
    [78, 14, 26],
    [110, 24, 18],
    [134, 16, 24],
    [164, 28, 16],
    [186, 20, 22],
    [214, 30, 16],
    [236, 18, 24],
    [266, 26, 18],
    [290, 20, 22],
  ];
  for (const [bx, bw, bh] of skyline) {
    fillRect(x + bx, y + h - bh, bw, bh, [46, 58, 78]);
    fillRect(x + bx + 5, y + h - bh + 5, 4, 4, [245, 215, 110]);
    fillRect(x + bx + 12, y + h - bh + 9, 4, 4, [245, 215, 110]);
  }
  // tariff document, bottom right over the skyline
  const docX = x + w - 78;
  const docY = y + h - 44;
  fillRect(docX, docY, 66, 38, WHITE);
  rect(docX, docY, 66, 38, [120, 128, 142], 1);
  hline(docX + 6, docX + 44, docY + 8, INK, 1);
  hline(docX + 6, docX + 52, docY + 14, INK, 1);
  hline(docX + 6, docX + 40, docY + 20, INK, 1);
  hline(docX + 6, docX + 48, docY + 26, INK, 1);
  fillCircle(docX + 52, docY + 28, 7, RED);
  fillCircle(docX + 52, docY + 28, 4, [255, 255, 255]);
}

// Courtroom: gavel, scales of justice, telecom tower, "10 OF 12" badge.
function drawCourt(x: number, y: number, w: number, h: number): void {
  // navy chamber
  fillRect(x, y, w, h, [30, 42, 68]);
  // wood bench
  fillRect(x, y + 96, w, h - 96, [90, 58, 34]);
  fillRect(x, y + 96, w, 4, [122, 80, 46]);
  // scales of justice, left
  const sx = x + 62;
  const sy = y + 22;
  vline(sx, sy, sy + 62, GOLD, 3);
  hline(sx - 34, sx + 34, sy + 6, GOLD, 3);
  fillCircle(sx, sy + 2, 4, GOLD);
  // left pan
  line(sx - 30, sy + 6, sx - 40, sy + 26, GOLD, 1);
  line(sx - 30, sy + 6, sx - 20, sy + 26, GOLD, 1);
  fillTriangle(sx - 44, sy + 26, sx - 16, sy + 26, sx - 30, sy + 34, GOLD);
  // right pan
  line(sx + 30, sy + 6, sx + 40, sy + 26, GOLD, 1);
  line(sx + 30, sy + 6, sx + 20, sy + 26, GOLD, 1);
  fillTriangle(sx + 16, sy + 26, sx + 44, sy + 26, sx + 30, sy + 34, GOLD);
  // base
  fillRect(sx - 16, sy + 62, 32, 5, GOLD);
  // telecom tower, right
  const tx = x + 216;
  const ty = y + 96;
  line(tx - 34, ty, tx, y + 18, [160, 168, 180], 2);
  line(tx + 34, ty, tx, y + 18, [160, 168, 180], 2);
  hline(tx - 26, tx + 26, y + 74, [160, 168, 180], 2);
  hline(tx - 18, tx + 18, y + 56, [160, 168, 180], 2);
  hline(tx - 10, tx + 10, y + 38, [160, 168, 180], 2);
  vline(tx, y + 8, y + 18, [160, 168, 180], 2);
  fillCircle(tx, y + 8, 3, RED);
  // signal arcs
  circle(tx, y + 8, 12, [245, 215, 110], 1);
  circle(tx, y + 8, 20, [245, 215, 110], 1);
  // gavel, bottom right over the bench
  const gx = x + 268;
  const gy = y + 100;
  line(gx - 26, gy + 12, gx + 8, gy - 6, [122, 80, 46], 4);
  fillRect(gx - 2, gy - 12, 22, 12, [96, 62, 34]);
  fillRect(gx - 2, gy - 12, 22, 3, [140, 96, 52]);
  // "10 OF 12" badge, top left
  fillRect(x + 10, y + 10, 92, 22, WHITE);
  rect(x + 10, y + 10, 92, 22, RED, 2);
  drawLine(x + 16, y + 15, 80, "10 OF 12", 1.5, RED, "badge 10 of 12", true);
}

// ---- layout ----
const M = 10; // margin
const COLW = 328; // hero / mid column width
const GUT = 10; // gutter

function tagChip(x: number, y: number, text: string, bg: RGB): number {
  const s = 1.375;
  const w = textW(text, s) + 12;
  fillRect(x, y, w, 18, bg);
  drawText(x + 6, y + 4, text, s, WHITE, true);
  return w;
}

function hero(
  col: number,
  y: number,
  tag: string,
  tagBg: RGB,
  status: string,
  statusBg: RGB,
  headline: string,
  fact: string,
  source: string,
  scene: (x: number, y: number, w: number, h: number) => void,
): void {
  const x = M + col * (COLW + GUT);
  tagChip(x, y, tag, tagBg);
  const sw = textW(status, 1.375) + 12;
  tagChip(x + COLW - sw, y, status, statusBg);
  const sceneY = y + 24;
  const sceneH = 118;
  rect(x, sceneY, COLW, sceneH, INK, 1);
  scene(x + 1, sceneY + 1, COLW - 2, sceneH - 2);
  const headY = sceneY + sceneH + 8;
  drawWrapped(x, headY, COLW, headline, 3.625, INK, 36, 2, `hero headline "${headline}"`, true);
  const factY = headY + 76;
  drawWrapped(x, factY, COLW, fact, 1.75, [64, 64, 64], 17, 3, `hero fact "${fact}"`);
  drawLine(x, factY + 52, COLW, source, 1.375, GRAY, `hero source "${source}"`);
  hline(x, x + COLW, factY + 66, LINE, 1);
}

function mid(
  col: number,
  row: number,
  y0: number,
  tag: string,
  tagBg: RGB,
  headline: string,
  fact: string,
): void {
  const x = M + col * (COLW + GUT);
  const y = y0 + row * 128;
  tagChip(x, y, tag, tagBg);
  drawWrapped(x, y + 24, COLW, headline, 2.5, INK, 26, 2, `mid headline "${headline}"`, true);
  drawWrapped(x, y + 80, COLW, fact, 1.75, [64, 64, 64], 18, 2, `mid fact "${fact}"`);
  hline(x, x + COLW, y + 122, LINE, 1);
}

function briefItem(
  col: number,
  row: number,
  y0: number,
  headline: string,
  fact: string,
): void {
  const bw = 246;
  const x = M + col * (bw + GUT);
  const y = y0 + row * 60;
  fillRect(x, y + 2, 4, 4, RED);
  drawWrapped(x + 10, y, bw - 10, headline, 1.5, INK, 15, 2, `brief headline "${headline}"`, true);
  drawWrapped(x + 10, y + 32, bw - 10, fact, 1.375, [64, 64, 64], 14, 2, `brief fact "${fact}"`);
}

function microItem(
  col: number,
  row: number,
  y0: number,
  headline: string,
  fact: string,
): void {
  const bw = 246;
  const x = M + col * (bw + GUT);
  const y = y0 + row * 22;
  fillRect(x, y + 2, 3, 3, RED);
  drawLine(x + 8, y, bw - 8, headline, 1.375, INK, `micro headline "${headline}"`, true);
  drawLine(x + 8, y + 11, bw - 8, fact, 1.25, [64, 64, 64], `micro fact "${fact}"`);
}

function sectionBar(y: number, text: string): void {
  fillRect(M, y, W - 2 * M, 20, INK);
  drawText(M + 8, y + 5, text, 1.5, WHITE, true);
}

function draw(): void {
  // paper
  fillRect(0, 0, W, H, PAPER);

  // ---- masthead ----
  // small globe mark
  const gx = 34;
  const gy = 30;
  circle(gx, gy, 16, INK, 2);
  fillEllipse(gx, gy, 7, 16, PAPER);
  fillRect(gx - 16, gy - 1, 32, 2, INK);
  drawTextCentered(512, 8, "THE WORLD IN ONE DAY", 5.5, INK, true);
  drawTextCentered(512, 52, "Wednesday 25 November 2026", 3.75, RED, true);
  drawTextCentered(
    512,
    84,
    "33 stories from every region  ·  Asia  ·  Middle East  ·  Americas  ·  Europe  ·  Africa",
    1.5,
    GRAY,
  );
  hline(M, W - M, 96, INK, 2);

  // ---- heroes ----
  const heroY = 102;
  hero(
    0, heroY, "MIDDLE EAST", [178, 106, 43], "CLAIMED", ORANGE,
    "Houthis claim refinery hit",
    "Claimed hit on Ras Tanura; 4 drones downed; Brent $93.60.",
    "First reported 25 Nov · Reuters",
    drawRefinery,
  );
  hero(
    1, heroY, "MARKETS", BLUE, "CONFIRMED", GREEN,
    "Nasdaq plunges 4.6%, recovers",
    "Nasdaq -4.6% intraday, closed -0.6%; Trump tariffs target 14 nations.",
    "First reported 25 Nov · AP",
    drawMarket,
  );
  hero(
    2, heroY, "US-CHINA", [90, 40, 90], "CONFIRMED", GREEN,
    "Huawei guilty 10 of 12 counts",
    "Jury finds Huawei guilty of fraud, trade-secret theft; sentencing 14 Sep 2027.",
    "Reported worldwide 25 Nov · Reuters",
    drawCourt,
  );

  // ---- mid ----
  const midY = 400;
  mid(0, 0, midY, "EUROPE", BLUE, "Poland plans no-fly zone", "Warsaw plans zone along Ukraine border after missiles fell.");
  mid(1, 0, midY, "EGYPT", [150, 90, 20], "31 killed in Cairo tanker fire", "Tanker overturns, fire hits 27 vehicles; at least 31 dead.");
  mid(2, 0, midY, "GAZA", [120, 40, 40], "Hamas security chief killed", "Abu al-Auf, wife and daughters die in Shati strike.");
  mid(0, 1, midY, "SPACE · CHINA", [40, 90, 120], "Pakistan's first astronaut flies", "Shenzhou-24 docks at Tiangong with Zeeshan Ali aboard.");
  mid(1, 1, midY, "SUDAN", [110, 60, 110], "19 killed in Blue Nile strikes", "RSF drones hit Damazin and Roseires; 19 dead, 20 hurt.");
  mid(2, 1, midY, "TECH", [30, 90, 90], "FCC clears SpaceX data centres", "Up to 1m satellites, a first for US space data.");

  // ---- brief ----
  sectionBar(662, "IN BRIEF");
  const briefY = 688;
  briefItem(0, 0, briefY, "Judges urge drop of Netanyahu bribery case", "A recommendation, not a ruling; Case 4000.");
  briefItem(1, 0, briefY, "Solomons pick Australia over China", "$740m over 10 years; no foreign military bases.");
  briefItem(2, 0, briefY, "Bangladesh garment pay rises 36%", "Minimum wage 12,500 to 17,000 taka a month.");
  briefItem(3, 0, briefY, "EU, UK fine fragrance cartel €570m+", "Givaudan, Firmenich, IFF fixed prices for Unilever.");
  briefItem(0, 1, briefY, "Iraq court backs federal border control", "Federal forces may deploy to Kurdish borders, oil fields.");
  briefItem(1, 1, briefY, "North Korea expels Swiss diplomat", "Envoy given 48 hours to leave; office closed.");
  briefItem(2, 1, briefY, "China probes Shanghai party chief", "Chen Jining investigated for 'serious violations'.");
  briefItem(3, 1, briefY, "26 miners trapped in flooded mine", "9 dead by Wednesday evening; rescue ongoing.");

  // ---- micro ----
  sectionBar(814, "ALSO TODAY");
  const microY = 840;
  microItem(0, 0, microY, "Ukraine hits Savasleyka base", "3 MiG-31 and 2 Su-34 damaged.");
  microItem(1, 0, microY, "Murmansk governor jailed", "Graft probe; first since 2022.");
  microItem(2, 0, microY, "Ramaphosa wins Farmgate case", "Court voids 2022 panel report.");
  microItem(3, 0, microY, "At least 30 killed, Nigeria", "Militants hit Borgu villages.");
  microItem(0, 1, microY, "Duran Duran's Taylor dies", "Guitarist, 65, dies of cancer.");
  microItem(1, 1, microY, "Cartagena siege ends", "All hostages freed; 1 dead.");
  microItem(2, 1, microY, "Mississippi crash: six found", "Cessna down in Gulf; 6 dead.");
  microItem(3, 1, microY, "US Army detonates lead azide", "Controlled blast in Iowa.");
  microItem(0, 2, microY, "Ukraine needs €115bn", "Zelensky: €25bn gap remains.");
  microItem(1, 2, microY, "Ukraine sinks corvette", "Off Libya; 2 Libyans die.");
  microItem(2, 2, microY, "UK warns of Russian sabotage", "MI5 warns backers of Ukraine.");
  microItem(3, 2, microY, "Greece general strike hits", "Ferries, metro, flights hit.");
  microItem(0, 3, microY, "Macy's parade postponed", "Delayed to Saturday by storms.");
  microItem(1, 3, microY, "US tells citizens to leave", "'Do not travel,' US warns.");
  microItem(2, 3, microY, "Iran: US drones downed", "Over Hormuz; unverified claim.");
  microItem(3, 3, microY, "DOJ charges 800+ in scams", "400+ cases in global sweep.");

  // ---- honesty box ----
  const hbY = 934;
  rect(M, hbY, W - 2 * M, 50, INK, 1);
  vline(512, hbY, hbY + 50, LINE, 1);
  drawText(M + 8, hbY + 6, "CLAIMED — NOT YET CONFIRMED", 1.5, RED, true);
  drawText(520, hbY + 6, "CONFIRMED — AS REPORTED", 1.5, GREEN, true);
  drawLine(M + 8, hbY + 24, 480, "Iran claims tankers hit mines in Hormuz — unverified.", 1.375, INK, "honesty claimed 1");
  drawLine(M + 8, hbY + 38, 480, "Houthis claim Ras Tanura hit — Saudi: 4 drones downed.", 1.375, INK, "honesty claimed 2");
  drawLine(520, hbY + 24, 480, "Nasdaq closed -0.6% after -4.6% intraday; Nvidia -3.9%.", 1.375, INK, "honesty confirmed 1");
  drawLine(520, hbY + 38, 480, "Huawei guilty 10 of 12; Poland's no-fly zone is a plan.", 1.375, INK, "honesty confirmed 2");

  // ---- footer ----
  const ftY = 990;
  drawLine(
    M, ftY, W - 2 * M,
    "Sources: Reuters, AP, CNN, BBC, AFP, Euronews, WSJ, Xinhua, ESA, WHO, DFAT, Le Monde, Al Jazeera, France24, BusinessWorld, Daily Summary",
    1.125, GRAY, "footer sources",
  );
  drawLine(
    M, ftY + 12, W - 2 * M,
    "Events first reported 25 Nov 2026 unless dated · Preliminary counts may rise · Drawn by program",
    1.125, GRAY, "footer note",
  );
}

// ---- CRC-32 + PNG encoder ----
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function main(): void {
  draw();
  const png = encodePNG();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, png);
  console.log(`OK entry.png ${png.length} bytes 1024x1024 no truncations`);
  console.log(`wrote ${outPath}`);
}

main();
