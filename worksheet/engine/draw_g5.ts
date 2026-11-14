// Geometry for the grade 5 widgets: solids of unit cubes, the coordinate
// grid, the decimal place-value chart and the fraction grid. Pure functions,
// like draw.ts.
import { type CoordinateGrid, type DecimalChart, type FractionGrid, type Solid, DecimalChart_Headings, FractionGrid_Shade } from '../proto/v1/nodes_pb.js';
import { commas } from './draw.js';
import { type Drawing, type Shape } from './drawing.js';
import { SHADE, fieldId, shown } from './field.js';
import * as L from './layout.js';

const f1 = (v: number) => Math.round(v * 10) / 10;

// solid draws boxes at a slant: lengths across, widths going back up and to
// the right, heights up. Boxes are drawn left to right, so a box in front
// of another's side covers it. The top is shaded light and the right side
// darker, so the three faces read as a box and its cubes can be counted.
const TOP_FACE = '#f0f0f0';
const SIDE_FACE = '#d6d6d6';
const LAYER_FRONT = '#b4b4b4';
const LAYER_SIDE = '#9c9c9c';

export function solid(sd: Solid): Drawing {
  const boxes = [...sd.boxes].sort((a, b) => a.x - b.x);
  const across = Math.max(1, ...boxes.map((b) => b.x + b.length));
  const deep = Math.max(1, ...boxes.map((b) => b.width));
  const tall = Math.max(1, ...boxes.map((b) => b.height));
  const slant = [0.55, 0.42];
  const u = sd.showCubes ? 24 : Math.min(22, 190 / (across + deep * slant[0]), 110 / (tall + deep * slant[1]));
  const first = boxes[0];
  const left = 6 + (first?.heightLabel ? first.heightLabel.length * 7.5 + 6 : 0);
  const rightLabels = Math.max(0, ...boxes.map((b, i) => Math.max(b.widthLabel.length, i > 0 ? b.heightLabel.length : 0)));
  const top = 6;
  const base = top + tall * u + deep * u * slant[1];
  const at = (x: number, z: number, h: number): [number, number] => [f1(left + x * u + z * u * slant[0]), f1(base - h * u - z * u * slant[1])];
  const face = (pts: [number, number][], fill: string) => ({ t: 'path' as const, d: 'M' + pts.map(([x, y]) => `${x} ${y}`).join(' L') + ' Z', fill, w: 1.6 });
  const line = (a: [number, number], b: [number, number]): Shape => ({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: 1 });
  const shapes: Shape[] = [];
  boxes.forEach((b, i) => {
    const [x0, x1, w, h] = [b.x, b.x + b.length, b.width, b.height];
    shapes.push(face([at(x0, 0, 0), at(x1, 0, 0), at(x1, 0, h), at(x0, 0, h)], 'white'));
    shapes.push(face([at(x0, 0, h), at(x1, 0, h), at(x1, w, h), at(x0, w, h)], TOP_FACE));
    shapes.push(face([at(x1, 0, 0), at(x1, w, 0), at(x1, w, h), at(x1, 0, h)], SIDE_FACE));
    if (sd.showCubes && sd.markBottomLayer) {
      shapes.push(face([at(x0, 0, 0), at(x1, 0, 0), at(x1, 0, 1), at(x0, 0, 1)], LAYER_FRONT));
      shapes.push(face([at(x1, 0, 0), at(x1, w, 0), at(x1, w, 1), at(x1, 0, 1)], LAYER_SIDE));
    }
    if (sd.showCubes) {
      for (let k = x0 + 1; k < x1; k++) {
        shapes.push(line(at(k, 0, 0), at(k, 0, h)), line(at(k, 0, h), at(k, w, h)));
      }
      for (let k = 1; k < h; k++) {
        shapes.push(line(at(x0, 0, k), at(x1, 0, k)), line(at(x1, 0, k), at(x1, w, k)));
      }
      for (let k = 1; k < w; k++) {
        shapes.push(line(at(x0, k, h), at(x1, k, h)), line(at(x1, k, 0), at(x1, k, h)));
      }
    }
    if (b.lengthLabel) {
      const [lx, ly] = at((x0 + x1) / 2, 0, 0);
      shapes.push({ t: 'text', x: lx, y: ly + 16, s: b.lengthLabel, size: 13 });
    }
    if (b.heightLabel) {
      const [hx, hy] = i === 0 ? at(x0, 0, h / 2) : at(x1, w, h / 2);
      shapes.push({ t: 'text', x: i === 0 ? hx - 5 : hx + 5, y: hy + 4, s: b.heightLabel, size: 13, anchor: i === 0 ? 'end' : 'start' });
    }
    if (b.widthLabel) {
      const [wx, wy] = at(x1, w / 2, 0);
      shapes.push({ t: 'text', x: wx + 6, y: wy + 8, s: b.widthLabel, size: 13, anchor: 'start' });
    }
  });
  const width = left + across * u + deep * u * slant[0] + (rightLabels ? rightLabels * 7.5 + 12 : 4);
  const labelled = boxes.some((b) => b.lengthLabel);
  return { width: Math.ceil(width), height: Math.ceil(base + (labelled ? 22 : 4)), shapes };
}

// coordinateGrid draws the first quadrant with its points. On an answer
// sheet, the points a child was asked to plot are drawn from the plot
// field's answer, such as "P (2, 6); Q (7, 3)".
export function coordinateGrid(g: CoordinateGrid, filled: boolean): Drawing {
  const xs = g.xStep || 1;
  const ys = g.yStep || 1;
  const cols = Math.ceil(g.xMax / xs);
  const rows = Math.ceil(g.yMax / ys);
  // A grid to plot on has larger cells, for a pencil point.
  const cell = g.plotField ? Math.min(26, 260 / Math.max(cols, rows)) : Math.min(22, 230 / Math.max(cols, rows));
  const left = 34;
  const top = 24;
  const bottom = top + rows * cell;
  const right = left + cols * cell;
  const px = (x: number) => f1(left + (x / xs) * cell);
  const py = (y: number) => f1(bottom - (y / ys) * cell);
  const shapes: Shape[] = [];
  for (let i = 0; i <= cols; i++) {
    shapes.push({ t: 'line', x1: px(i * xs), y1: top, x2: px(i * xs), y2: bottom, w: i === 0 ? 2 : 0.6 });
    shapes.push({ t: 'text', x: px(i * xs), y: bottom + 15, s: String(i * xs), size: 11 });
  }
  for (let j = 0; j <= rows; j++) {
    shapes.push({ t: 'line', x1: left, y1: py(j * ys), x2: right, y2: py(j * ys), w: j === 0 ? 2 : 0.6 });
    shapes.push({ t: 'text', x: left - 6, y: py(j * ys) + 4, s: String(j * ys), size: 11, anchor: 'end' });
  }
  if (g.yTitle) {
    shapes.push({ t: 'text', x: 4, y: 12, s: g.yTitle, size: 12, anchor: 'start', italic: true });
  }
  if (g.xTitle) {
    shapes.push({ t: 'text', x: f1((left + right) / 2), y: bottom + 32, s: g.xTitle, size: 12, italic: true });
  }
  // Without titles, the axes are named x and y, as grade 5 names them.
  if (!g.xTitle) {
    shapes.push({ t: 'text', x: right + 10, y: bottom + 5, s: 'x', size: 14, italic: true });
  }
  if (!g.yTitle) {
    shapes.push({ t: 'text', x: left, y: top - 8, s: 'y', size: 14, italic: true });
  }
  const dot = (x: number, y: number, label: string, answer: boolean) => {
    shapes.push({ t: 'circle', cx: px(x), cy: py(y), r: 3.5, fill: answer ? '#1a4f8a' : '#222' });
    if (label) {
      shapes.push({ t: 'text', x: px(x) + 6, y: py(y) - 5, s: label, size: 13, anchor: 'start', answer });
    }
  };
  g.points.forEach((p) => dot(p.x, p.y, p.label, false));
  if (filled && g.plotField) {
    for (const m of (g.plotField.answer?.text ?? '').matchAll(/(?:([A-Z]) )?\((\d+), (\d+)\)/g)) {
      dot(Number(m[2]), Number(m[3]), m[1] ?? '', true);
    }
  }
  return { width: Math.ceil(right + (g.xTitle ? 16 : 22)), height: Math.ceil(bottom + (g.xTitle ? 38 : 22)), shapes };
}

const PLACE_NAMES: Record<number, string> = { 3: 'thousands', 2: 'hundreds', 1: 'tens', 0: 'ones', [-1]: 'tenths', [-2]: 'hundredths', [-3]: 'thousandths' };
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

// placeDigits maps a number such as "4.07" to its digits by place: 0 is
// ones, -1 tenths. Commas are ignored.
export function placeDigits(n: string): Map<number, string> {
  const [whole, part = ''] = n.replace(/,/g, '').split('.');
  const out = new Map<number, string>();
  [...whole].forEach((c, i) => out.set(whole.length - 1 - i, c));
  [...part].forEach((c, i) => out.set(-1 - i, c));
  return out;
}

// decimalChart draws a place-value chart with a column per place and a
// narrow column for the decimal point.
export function decimalChart(c: DecimalChart, filled: boolean, w: L.Writing = L.STANDARD_WRITING): Drawing {
  const powers = c.headings === DecimalChart_Headings.POWERS;
  const places = Array.from({ length: c.high + c.decimals + 1 }, (_, i) => c.high - i);
  const colW = Math.max(w.digit + 10, powers ? 46 : 68);
  const pointW = c.decimals > 0 ? 12 : 0;
  const headH = powers ? 40 : 28;
  const rowH = Math.max(30, w.row + 2);
  const x = (p: number) => 1 + (c.high - p) * colW + (p < 0 ? pointW : 0);
  const tableW = places.length * colW + pointW;
  const shapes: Shape[] = [{ t: 'rect', x: 1, y: 1, w: tableW, h: headH, fill: '#eee', sw: 1.2 }];
  for (const p of places) {
    const cx = x(p) + colW / 2;
    if (powers) {
      if (p > 0) {
        shapes.push({ t: 'text', x: cx, y: 17, s: `10${SUPERSCRIPT[p]}`, size: 13 });
      }
      shapes.push({ t: 'text', x: cx, y: 34, s: p >= 0 ? commas(10 ** p) : `1/${10 ** -p}`, size: 10 });
    } else {
      shapes.push({ t: 'text', x: cx, y: 18, s: PLACE_NAMES[p] ?? '', size: 10 });
    }
  }
  let y = 1 + headH;
  let noteW = 0;
  for (const r of c.rows) {
    shapes.push({ t: 'rect', x: 1, y, w: tableW, h: rowH, sw: 1.2 });
    const digits = placeDigits(r.field ? shown(r.field, filled) : r.number);
    places.forEach((p, i) => {
      const cx = x(p) + colW / 2;
      if (r.field) {
        shapes.push({ t: 'box', x: x(p) + (colW - w.digit) / 2, y: y + 3, w: w.digit, h: rowH - 6, field: i === 0 ? fieldId(r.field) : null, s: digits.get(p) ?? '', size: 16 });
      } else if (digits.has(p)) {
        shapes.push({ t: 'text', x: cx, y: y + rowH / 2 + 6, s: digits.get(p) ?? '', size: 18 });
      }
    });
    if (pointW) {
      shapes.push({ t: 'circle', cx: x(0) + colW + pointW / 2, cy: y + rowH / 2 + 5, r: 2.4, fill: '#222' });
    }
    if (r.note) {
      shapes.push({ t: 'text', x: tableW + 10, y: y + rowH / 2 + 5, s: r.note, size: 14, anchor: 'start', italic: true });
      noteW = Math.max(noteW, r.note.length * 7 + 12);
    }
    y += rowH;
  }
  for (const p of places.slice(1)) {
    shapes.push({ t: 'line', x1: x(p), y1: 1, x2: x(p), y2: y, w: 1 });
  }
  if (pointW) {
    shapes.push({ t: 'line', x1: x(0) + colW, y1: 1, x2: x(0) + colW, y2: y, w: 1 });
  }
  return { width: Math.ceil(tableW + 2 + noteW), height: Math.ceil(y + 2), shapes };
}

// fractionGrid draws one whole as a square cut into cols × rows cells. The
// shaded columns run from the left and the shaded rows from the bottom, so
// a shaded rectangle sits in the bottom-left corner with its labels beside
// it.
export function fractionGrid(g: FractionGrid): Drawing {
  const side = 110;
  const charW = 7;
  const left = 1 + (g.rowsLabel ? g.rowsLabel.length * charW + 10 : 0);
  const top = 1 + (g.wholeLabel ? 18 : 0);
  const cw = side / g.cols;
  const ch = side / g.rows;
  const shapes: Shape[] = [];
  for (let r = 0; r < g.rows; r++) {
    for (let k = 0; k < g.cols; k++) {
      const inCol = k < g.shadedCols;
      const inRow = r < g.shadedRows;
      let fill = 'white';
      if (inCol && inRow) {
        fill = '#8a8a8a';
      } else if ((inCol && g.shade !== FractionGrid_Shade.OVERLAP) || (inRow && g.shade === FractionGrid_Shade.UNSPECIFIED)) {
        fill = SHADE;
      }
      shapes.push({ t: 'rect', x: f1(left + k * cw), y: f1(top + (g.rows - 1 - r) * ch), w: f1(cw), h: f1(ch), fill, sw: 1 });
    }
  }
  shapes.push({ t: 'rect', x: left, y: top, w: side, h: side, fill: 'none', sw: 2 });
  if (g.shade === FractionGrid_Shade.OVERLAP && g.shadedCols > 0 && g.shadedRows > 0) {
    shapes.push({ t: 'rect', x: left, y: f1(top + side - g.shadedRows * ch), w: f1(g.shadedCols * cw), h: f1(g.shadedRows * ch), fill: 'none', sw: 2.6 });
  }
  if (g.colsLabel) {
    shapes.push({ t: 'text', x: f1(left + (g.shadedCols * cw) / 2), y: top + side + 16, s: g.colsLabel, size: 13 });
  }
  if (g.rowsLabel) {
    shapes.push({ t: 'text', x: left - 6, y: f1(top + side - (g.shadedRows * ch) / 2 + 4), s: g.rowsLabel, size: 13, anchor: 'end' });
  }
  let width = left + side + 1;
  if (g.wholeLabel) {
    shapes.push({ t: 'text', x: left + side / 2, y: top - 5, s: g.wholeLabel, size: 13 });
    shapes.push({ t: 'text', x: left + side + 6, y: top + side / 2 + 4, s: g.wholeLabel, size: 13, anchor: 'start' });
    width += g.wholeLabel.length * charW + 10;
  }
  const colsLabelW = g.colsLabel ? g.colsLabel.length * charW : 0;
  width = Math.max(width, left + (g.shadedCols * cw) / 2 + colsLabelW / 2 + 2);
  return { width: Math.ceil(width), height: Math.ceil(top + side + 1 + (g.colsLabel ? 22 : 0)), shapes };
}
