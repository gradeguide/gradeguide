// Geometry for the kindergarten to grade 2 widgets: ten frames, number
// bonds, pictures in groups, pieces of a hundred chart, and coins.
import {
  type Coins,
  type NumberBond,
  type NumberBond_Part,
  type NumberGrid,
  type PictureGroups,
  type TenFrame,
  Coins_Coin,
  PictureGroups_Picture,
} from '../proto/v1/nodes_pb.js';
import { type Drawing, type Shape } from './drawing.js';
import { SHADE, fieldId, shown } from './field.js';

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

export const PICTURE = 24;
const PICTURE_GAP = 8;
const GROUP_GAP = 22;
// Pictures per row within a group.
const PER_ROW = 5;

// picture draws one picture in the box at x, y of side PICTURE.
function picture(kind: PictureGroups_Picture, x: number, y: number): Shape[] {
  const s = PICTURE;
  const cx = x + s / 2;
  const cy = y + s / 2;
  switch (kind) {
    case PictureGroups_Picture.APPLE:
      return [
        { t: 'path', d: `M${cx} ${y + 7} C${x + 4} ${y + 1} ${x - 1} ${y + 16} ${cx - 3} ${y + s - 1} C${cx - 1} ${y + s} ${cx + 1} ${y + s} ${cx + 3} ${y + s - 1} C${x + s + 1} ${y + 16} ${x + s - 4} ${y + 1} ${cx} ${y + 7} Z`, w: 1.4 },
        { t: 'line', x1: cx, y1: y + 7, x2: cx + 1, y2: y + 1, w: 1.4 },
        { t: 'path', d: `M${cx + 1} ${y + 3} q4 -4 7 -1 q-4 3 -7 1 Z`, w: 1.1 },
      ];
    case PictureGroups_Picture.HEART:
      return [{ t: 'path', d: `M${cx} ${y + s - 2} C${x - 2} ${y + 12} ${x + 3} ${y + 1} ${cx} ${y + 7} C${x + s - 3} ${y + 1} ${x + s + 2} ${y + 12} ${cx} ${y + s - 2} Z`, w: 1.4 }];
    case PictureGroups_Picture.BALL:
      return [ring(cx, cy, s / 2 - 1, 'white', 1.4), { t: 'path', d: `M${x + 2} ${cy - 3} Q${cx} ${cy + 6} ${x + s - 2} ${cy - 3}`, w: 1.1 }];
    default: {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const a = ((-90 + 36 * i) * Math.PI) / 180;
        const rr = i % 2 === 0 ? s / 2 : s / 5;
        pts.push(`${f1(cx + rr * Math.cos(a))} ${f1(cy + 1 + rr * Math.sin(a))}`);
      }
      return [{ t: 'path', d: 'M' + pts.join(' L') + ' Z', w: 1.4 }];
    }
  }
}

export function pictureGroups(g: PictureGroups): Drawing {
  const step = PICTURE + PICTURE_GAP;
  const shapes: Shape[] = [];
  const total = g.groups.reduce((a, b) => a + b, 0);
  let n = 0;
  let x = 1;
  let height = 0;
  for (const size of g.groups) {
    const cols = Math.min(PER_ROW, size);
    for (let i = 0; i < size; i++, n++) {
      const px = x + (i % PER_ROW) * step;
      const py = 1 + Math.floor(i / PER_ROW) * step;
      shapes.push(...picture(g.picture, px, py));
      if (n >= total - g.crossedOut) {
        shapes.push({ t: 'line', x1: px - 2, y1: py - 2, x2: px + PICTURE + 2, y2: py + PICTURE + 2, w: 2 });
      }
    }
    height = Math.max(height, Math.ceil(size / PER_ROW) * step);
    x += cols * step - PICTURE_GAP + GROUP_GAP;
  }
  return { width: Math.max(2, x - GROUP_GAP + 4), height: height + 2, shapes };
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

// Each coin's radius and value in cents.
export const COIN: Record<number, [number, number]> = {
  [Coins_Coin.PENNY]: [16, 1],
  [Coins_Coin.NICKEL]: [18, 5],
  [Coins_Coin.DIME]: [14, 10],
  [Coins_Coin.QUARTER]: [21, 25],
};

export function coins(c: Coins): Drawing {
  const shapes: Shape[] = [];
  let x = 1;
  for (const coin of c.coins) {
    const [r, cents] = COIN[coin] ?? COIN[Coins_Coin.PENNY];
    const cx = x + r;
    // Pennies are shaded, as copper is darker than silver.
    shapes.push(ring(cx, 22, r, coin === Coins_Coin.PENNY ? SHADE : 'white'));
    shapes.push(ring(cx, 22, r - 3, 'none', 0.6));
    shapes.push({ t: 'text', x: cx, y: 27, s: `${cents}¢`, size: r > 15 ? 13 : 11 });
    x += 2 * r + 8;
  }
  return { width: Math.max(2, x - 6), height: 46, shapes };
}
