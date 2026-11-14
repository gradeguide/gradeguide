// Geometry for the kindergarten to grade 2 widgets: ten frames, number
// bonds, pictures in groups, pieces of a hundred chart, coins, tally charts
// and strips to compare.
import {
  type Coins,
  type LengthStrips,
  type NumberBond,
  type NumberBond_Part,
  type NumberGrid,
  type PictureGroups,
  type TallyChart,
  type TenFrame,
  Coins_Coin,
  PictureGroups_Picture,
} from '../proto/v1/nodes_pb.js';
import { type Drawing, type Shape } from './drawing.js';
import { fieldId, shown } from './field.js';

const f1 = (v: number) => Math.round(v * 10) / 10;

// ring is a circle with an outline, as a path, since a circle shape has no
// stroke.
function ring(cx: number, cy: number, r: number, fill = 'white', w = 1.5): Shape {
  return { t: 'path', d: `M${f1(cx - r)} ${f1(cy)} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`, fill, w };
}

export const TEN_FRAME_CELL = 30;

export function tenFrame(t: TenFrame): Drawing {
  const c = TEN_FRAME_CELL;
  const frames = t.frames || Math.max(1, Math.ceil(t.filled / 10));
  const shapes: Shape[] = [];
  for (let f = 0; f < frames; f++) {
    const top = 1 + f * (2 * c + 10);
    for (let i = 0; i < 10; i++) {
      const x = 1 + (i % 5) * c;
      const y = top + Math.floor(i / 5) * c;
      shapes.push({ t: 'rect', x, y, w: c, h: c, sw: f1(1.4) });
      if (f * 10 + i < t.filled) {
        shapes.push({ t: 'circle', cx: x + c / 2, cy: y + c / 2, r: 10 });
      }
    }
  }
  return { width: 5 * c + 2, height: frames * (2 * c + 10) - 8, shapes };
}

export function numberBond(b: NumberBond, filled: boolean): Drawing {
  const r = 24;
  const at: [NumberBond_Part | undefined, number, number][] = [
    [b.whole, 90, 2 + r],
    [b.left, 2 + r, 100],
    [b.right, 178 - r, 100],
  ];
  const shapes: Shape[] = [
    { t: 'line', x1: 90, y1: 2 + r, x2: 2 + r, y2: 100, w: 1.5 },
    { t: 'line', x1: 90, y1: 2 + r, x2: 178 - r, y2: 100, w: 1.5 },
  ];
  for (const [p, x, y] of at) {
    shapes.push(ring(x, y, r));
    if (p?.field) {
      shapes.push({ t: 'box', x: x - 15, y: y - 13, w: 30, h: 26, field: fieldId(p.field), s: shown(p.field, filled), size: 16 });
    } else if (p?.text) {
      shapes.push({ t: 'text', x, y: y + 6, s: p.text, size: 18 });
    }
  }
  return { width: 180, height: 102 + r, shapes };
}

// Pictures are big enough for a five-year-old to touch each one.
export const PICTURE = 30;
const PICTURE_GAP = 9;
const GROUP_GAP = 26;
// The space between a group's frame and its pictures.
const FRAME_PAD = 8;
// Pictures per row within a group.
const PER_ROW = 5;

// picture draws one picture in the box at x, y of side PICTURE.
function picture(kind: PictureGroups_Picture, x: number, y: number): Shape[] {
  const s = PICTURE;
  const cx = x + s / 2;
  const cy = y + s / 2;
  const k = (v: number) => f1((v * s) / 24);
  switch (kind) {
    case PictureGroups_Picture.APPLE:
      return [
        {
          t: 'path',
          d: `M${cx} ${y + k(7)} C${x + k(4)} ${y + k(1)} ${x - k(1)} ${y + k(16)} ${cx - k(3)} ${y + s - 1} C${cx - k(1)} ${y + s} ${cx + k(1)} ${y + s} ${cx + k(3)} ${y + s - 1} C${x + s + k(1)} ${y + k(16)} ${x + s - k(4)} ${y + k(1)} ${cx} ${y + k(7)} Z`,
          w: 1.5,
        },
        { t: 'line', x1: cx, y1: y + k(7), x2: cx + 1, y2: y + 1, w: 1.5 },
        { t: 'path', d: `M${cx + 1} ${y + k(3)} q${k(4)} ${-k(4)} ${k(7)} ${-k(1)} q${-k(4)} ${k(3)} ${-k(7)} ${k(1)} Z`, w: 1.2 },
      ];
    case PictureGroups_Picture.HEART:
      return [{ t: 'path', d: `M${cx} ${y + s - 2} C${x - k(2)} ${y + k(12)} ${x + k(3)} ${y + k(1)} ${cx} ${y + k(7)} C${x + s - k(3)} ${y + k(1)} ${x + s + k(2)} ${y + k(12)} ${cx} ${y + s - 2} Z`, w: 1.5 }];
    case PictureGroups_Picture.BALL: {
      // A football: a dark patch in the middle and seams out to the edge.
      const r = s / 2 - 1;
      const p = r * 0.38;
      const patch: string[] = [];
      const seams: Shape[] = [];
      for (let i = 0; i < 5; i++) {
        const a = ((-90 + 72 * i) * Math.PI) / 180;
        patch.push(`${f1(cx + p * Math.cos(a))} ${f1(cy + p * Math.sin(a))}`);
        seams.push({ t: 'line', x1: f1(cx + p * Math.cos(a)), y1: f1(cy + p * Math.sin(a)), x2: f1(cx + r * Math.cos(a)), y2: f1(cy + r * Math.sin(a)), w: 1 });
      }
      return [ring(cx, cy, r, 'white', 1.5), ...seams, { t: 'path', d: 'M' + patch.join(' L') + ' Z', fill: '#444', w: 1 }];
    }
    default: {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const a = ((-90 + 36 * i) * Math.PI) / 180;
        const rr = i % 2 === 0 ? s / 2 : s / 5;
        pts.push(`${f1(cx + rr * Math.cos(a))} ${f1(cy + 1 + rr * Math.sin(a))}`);
      }
      return [{ t: 'path', d: 'M' + pts.join(' L') + ' Z', w: 1.5 }];
    }
  }
}

export function pictureGroups(g: PictureGroups): Drawing {
  const step = PICTURE + PICTURE_GAP;
  const pad = g.framed ? FRAME_PAD : 0;
  const shapes: Shape[] = [];
  const total = g.groups.reduce((a, b) => a + b, 0);
  let n = 0;
  let x = 1;
  let height = 0;
  const rowsOf = (size: number) => Math.ceil(size / PER_ROW);
  const tallest = Math.max(1, ...g.groups.map(rowsOf));
  for (const size of g.groups) {
    const cols = Math.min(PER_ROW, size);
    const w = cols * step - PICTURE_GAP;
    if (g.framed) {
      // Every frame is as tall as the tallest group, so they line up.
      shapes.push({ t: 'path', d: roundRect(x, 1, w + 2 * pad, tallest * step - PICTURE_GAP + 2 * pad, 10), w: 1.2 });
    }
    for (let i = 0; i < size; i++, n++) {
      const px = x + pad + (i % PER_ROW) * step;
      const py = 1 + pad + Math.floor(i / PER_ROW) * step;
      shapes.push(...picture(g.picture, px, py));
      if (n >= total - g.crossedOut) {
        shapes.push({ t: 'line', x1: px - 2, y1: py - 2, x2: px + PICTURE + 2, y2: py + PICTURE + 2, w: 2.2 });
      }
    }
    height = Math.max(height, (g.framed ? tallest : rowsOf(size)) * step - PICTURE_GAP + 2 * pad);
    x += w + 2 * pad + GROUP_GAP;
  }
  return { width: Math.max(2, x - GROUP_GAP + 4), height: height + 4, shapes };
}

// roundRect is a rectangle with rounded corners, as a path.
function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${f1(x + r)} ${f1(y)} h${f1(w - 2 * r)} a${r} ${r} 0 0 1 ${r} ${r} v${f1(h - 2 * r)} a${r} ${r} 0 0 1 ${-r} ${r} h${f1(-(w - 2 * r))} a${r} ${r} 0 0 1 ${-r} ${-r} v${f1(-(h - 2 * r))} a${r} ${r} 0 0 1 ${r} ${-r} Z`;
}

export const GRID_CELL_K2 = 32;

export function numberGrid(g: NumberGrid, filled: boolean): Drawing {
  const c = GRID_CELL_K2;
  const blanks = new Map(g.blanks.map((b) => [b.number, b.field]));
  const hidden = new Set(g.hidden);
  const shapes: Shape[] = [];
  for (let r = 0; r < g.rows; r++) {
    for (let k = 0; k < g.cols; k++) {
      const n = g.start + r * (g.rowStep || g.cols) + k;
      if (hidden.has(n)) {
        continue;
      }
      const x = 1 + k * c;
      const y = 1 + r * c;
      shapes.push({ t: 'rect', x, y, w: c, h: c, sw: 1 });
      if (blanks.has(n)) {
        const f = blanks.get(n);
        shapes.push({ t: 'box', x: x + 2, y: y + 4, w: c - 4, h: c - 8, field: fieldId(f), s: shown(f, filled), size: 13 });
      } else {
        shapes.push({ t: 'text', x: x + c / 2, y: y + c / 2 + 5, s: String(n), size: 13 });
      }
    }
  }
  return { width: g.cols * c + 2, height: g.rows * c + 2, shapes };
}

// Each coin's radius and value in cents. The radii keep the real coins'
// sizes in proportion: a dime is the smallest and a quarter the largest.
export const COIN: Record<number, [number, number]> = {
  [Coins_Coin.PENNY]: [23.8, 1],
  [Coins_Coin.NICKEL]: [26.5, 5],
  [Coins_Coin.DIME]: [22.4, 10],
  [Coins_Coin.QUARTER]: [30.3, 25],
};

// The word on each coin, as it would be read by a child.
const COIN_NAME: Record<number, string> = {
  [Coins_Coin.PENNY]: 'penny',
  [Coins_Coin.NICKEL]: 'nickel',
  [Coins_Coin.DIME]: 'dime',
  [Coins_Coin.QUARTER]: 'quarter',
};

const COPPER = '#d9b79a';

export function coins(c: Coins): Drawing {
  const shapes: Shape[] = [];
  let x = 1;
  const h = 2 * COIN[Coins_Coin.QUARTER][0] + 4;
  for (const coin of c.coins) {
    const [r] = COIN[coin] ?? COIN[Coins_Coin.PENNY];
    const cx = x + r;
    const cy = h / 2;
    // A penny is copper; the others are silver, drawn white.
    shapes.push(ring(cx, cy, r, coin === Coins_Coin.PENNY ? COPPER : 'white', 1.4));
    if (coin === Coins_Coin.DIME || coin === Coins_Coin.QUARTER) {
      // Ridges round the edge, which a child can feel on a real dime or
      // quarter.
      const ticks = Math.round(r * 2.2);
      for (let i = 0; i < ticks; i++) {
        const a = (2 * Math.PI * i) / ticks;
        shapes.push({
          t: 'line',
          x1: f1(cx + (r - 3) * Math.cos(a)),
          y1: f1(cy + (r - 3) * Math.sin(a)),
          x2: f1(cx + r * Math.cos(a)),
          y2: f1(cy + r * Math.sin(a)),
          w: 0.7,
        });
      }
    } else {
      shapes.push(ring(cx, cy, r - 3, 'none', 0.6));
    }
    shapes.push({ t: 'text', x: cx, y: cy + 3.5, s: COIN_NAME[coin] ?? 'penny', size: 9.5 });
    x += 2 * r + 8;
  }
  return { width: Math.max(2, f1(x - 6)), height: h, shapes };
}

const TALLY_ROW = 34;
const TALLY_LABEL = 96;
const TALLY_STROKE = 8;

// tallyMarks draws n as tally marks from x, centred on y: groups of four
// strokes with a fifth across them.
function tallyMarks(n: number, x: number, y: number): [Shape[], number] {
  const shapes: Shape[] = [];
  const top = y - 10;
  const bottom = y + 10;
  for (let left = n; left > 0; left -= 5) {
    const strokes = Math.min(4, left);
    for (let i = 0; i < strokes; i++) {
      shapes.push({ t: 'line', x1: x + i * TALLY_STROKE, y1: top, x2: x + i * TALLY_STROKE, y2: bottom, w: 1.8 });
    }
    if (left >= 5) {
      shapes.push({ t: 'line', x1: x - 4, y1: bottom - 2, x2: x + 3 * TALLY_STROKE + 4, y2: top + 2, w: 1.8 });
    }
    x += strokes * TALLY_STROKE + 14;
  }
  return [shapes, x];
}

export function tallyChart(t: TallyChart): Drawing {
  const shapes: Shape[] = [];
  const most = Math.max(1, ...t.rows.map((r) => r.count));
  const marksWidth = Math.ceil(most / 5) * (4 * TALLY_STROKE + 14) + 12;
  const width = TALLY_LABEL + marksWidth;
  let y = 1;
  if (t.title) {
    shapes.push({ t: 'text', x: width / 2, y: y + 13, s: t.title, size: 13 });
    y += 22;
  }
  const head = t.header.length ? 24 : 0;
  if (head) {
    shapes.push({ t: 'rect', x: 1, y, w: width - 2, h: head, fill: '#eeeeee', sw: 1 });
    shapes.push({ t: 'text', x: TALLY_LABEL / 2, y: y + 16, s: t.header[0] ?? '', size: 11 });
    shapes.push({ t: 'text', x: TALLY_LABEL + marksWidth / 2, y: y + 16, s: t.header[1] ?? '', size: 11 });
  }
  const top = y;
  y += head;
  for (const row of t.rows) {
    shapes.push({ t: 'rect', x: 1, y, w: width - 2, h: TALLY_ROW, sw: 1 });
    shapes.push({ t: 'text', x: TALLY_LABEL / 2, y: y + TALLY_ROW / 2 + 5, s: row.label, size: 13 });
    shapes.push(...tallyMarks(row.count, TALLY_LABEL + 12, y + TALLY_ROW / 2)[0]);
    y += TALLY_ROW;
  }
  shapes.push({ t: 'line', x1: TALLY_LABEL, y1: top, x2: TALLY_LABEL, y2: y, w: 1 });
  return { width, height: y + 2, shapes };
}

export const STRIP_UNIT = 30;
const STRIP_NAME = 26;
const STRIP_H = 18;

// pencil draws a pencil from x to x + len: an eraser, a body and a
// sharpened tip.
function pencil(x: number, y: number, len: number): Shape[] {
  const h = STRIP_H;
  const tip = Math.min(18, len / 3);
  const eraser = Math.min(10, len / 5);
  return [
    { t: 'rect', x, y, w: f1(eraser), h, fill: '#dddddd', sw: 1.2 },
    { t: 'rect', x: f1(x + eraser), y, w: f1(len - eraser - tip), h, sw: 1.2 },
    { t: 'path', d: `M${f1(x + len - tip)} ${y} L${f1(x + len)} ${y + h / 2} L${f1(x + len - tip)} ${y + h} Z`, w: 1.2 },
    { t: 'path', d: `M${f1(x + len - 5)} ${f1(y + h / 2 - 2.5)} L${f1(x + len)} ${y + h / 2} L${f1(x + len - 5)} ${f1(y + h / 2 + 2.5)} Z`, fill: '#444', w: 0.8 },
  ];
}

export function lengthStrips(l: LengthStrips): Drawing {
  const shapes: Shape[] = [];
  const u = STRIP_UNIT;
  let y = 2;
  let longest = 0;
  for (const s of l.strips) {
    if (s.name) {
      shapes.push({ t: 'text', x: STRIP_NAME - 10, y: y + STRIP_H / 2 + 5, s: s.name, size: 14, anchor: 'end' });
    }
    shapes.push(...pencil(STRIP_NAME, y, s.units * u));
    longest = Math.max(longest, s.units);
    y += STRIP_H + 14;
  }
  if (l.cubes && l.strips.length) {
    // The cubes start where the pencil starts and touch, with no gaps.
    const n = l.strips[0].units;
    y -= 6;
    for (let i = 0; i < n; i++) {
      shapes.push({ t: 'rect', x: STRIP_NAME + i * u, y, w: u, h: u - 4, fill: i % 2 ? '#e4e4e4' : 'white', sw: 1.2 });
    }
    y += u;
  }
  // A line at the left shows where every strip starts.
  shapes.push({ t: 'line', x1: STRIP_NAME, y1: 0, x2: STRIP_NAME, y2: y - 10, w: 0.8, dash: '3 3' });
  return { width: STRIP_NAME + longest * u + 4, height: y - 8, shapes };
}
