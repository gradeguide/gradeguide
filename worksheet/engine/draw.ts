// Geometry for each widget: node in, Drawing out. Pure functions, so the
// same node always draws the same shapes.
import {
  type Angle,
  type AreaModel,
  type BaseTenBlocks,
  type Clock,
  type LineFigure,
  type LinePlot,
  type LongDivision,
  type NumberChart,
  type PlaceValueChart,
  type Protractor,
  type Ruler,
  type BarGraph,
  type ColumnArithmetic,
  type DataTable,
  type DotArray,
  type FractionBar,
  type FractionWall,
  type NumberLine,
  type Polygon,
  type TapeDiagram,
  type UnitGrid,
  ColumnArithmetic_Op,
  LineFigure_Kind,
} from '../proto/v1/nodes_pb.js';
import * as L from './layout.js';
import { type Drawing, type Shape } from './drawing.js';
import { SHADE, fieldId, shown } from './field.js';

const f1 = (v: number) => Math.round(v * 10) / 10;

// commas writes a whole number with thousands separators: 4300 is "4,300".
export function commas(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function numberLine(n: NumberLine, filled: boolean): Drawing {
  const ticks = (n.end - n.start) * n.partsPerUnit;
  const width = Math.min(L.CONTENT_WIDTH - 40, Math.max(260, ticks * (n.blanks.length > 0 ? 40 : 22)));
  const height = n.blanks.length > 0 ? L.NUMBER_LINE_BLANKS_HEIGHT : L.NUMBER_LINE_HEIGHT;
  const left = 16;
  const right = width - 16;
  const y = 22;
  const x = (i: number) => f1(left + ((right - left) * i) / ticks);
  const shapes: Shape[] = [{ t: 'line', x1: left - 8, y1: y, x2: right + 8, y2: y }];
  for (let i = 0; i <= ticks; i++) {
    const whole = i % n.partsPerUnit === 0;
    if (!whole && n.hidePartTicks) {
      continue;
    }
    const h = whole ? 9 : 6;
    shapes.push({ t: 'line', x1: x(i), y1: y - h, x2: x(i), y2: y + h, w: whole ? 2 : 1.5 });
    if (whole && !n.hideWholeLabels) {
      shapes.push({ t: 'text', x: x(i), y: y + 26, s: commas((n.start + i / n.partsPerUnit) * (n.scale || 1)), size: 15 });
    }
  }
  for (const j of n.jumpTicks) {
    shapes.push({ t: 'path', d: `M${x(j)} ${y - 4} Q${f1((x(j) + x(j + 1)) / 2)} ${y - 22} ${x(j + 1)} ${y - 4}`, w: 1.2 });
  }
  for (const l of n.labels) {
    const lx = x(l.tick);
    if (l.value.case === 'fraction') {
      shapes.push(
        { t: 'text', x: lx, y: y + 23, s: String(l.value.value.num), size: 12, italic: l.wrong },
        { t: 'line', x1: lx - 6, y1: y + 27, x2: lx + 6, y2: y + 27, w: 1.2 },
        { t: 'text', x: lx, y: y + 39, s: String(l.value.value.den), size: 12, italic: l.wrong },
      );
    } else if (l.value.case === 'text') {
      shapes.push({ t: 'text', x: lx, y: l.wrong ? y - 14 : y + 28, s: l.value.value + (l.wrong ? '?' : ''), size: 14, italic: l.wrong });
    }
  }
  for (const b of n.blanks) {
    shapes.push({ t: 'box', x: x(b.tick) - 17, y: y + 14, w: 34, h: 40, field: fieldId(b.field), s: shown(b.field, filled) });
  }
  if (n.hasArrow) {
    const ax = x(n.arrowTick);
    shapes.push({ t: 'path', d: `M${ax} ${y - 4} L${ax - 6} ${y - 16} L${ax + 6} ${y - 16} Z`, fill: '#222' });
  }
  return { width, height, shapes };
}

export function fractionBar(b: FractionBar): Drawing {
  const width = 170;
  const height = L.BAR_HEIGHT;
  const widths = b.widths.length === b.parts ? b.widths : Array(b.parts).fill(1);
  const total = widths.reduce((s, w) => s + w, 0);
  const shapes: Shape[] = [];
  let x = 1;
  widths.forEach((w, i) => {
    const pw = ((width - 2) * w) / total;
    shapes.push({ t: 'rect', x: f1(x), y: 1, w: f1(pw), h: height - 2, fill: b.shaded.includes(i) ? SHADE : 'white' });
    x += pw;
  });
  if (b.label) {
    shapes.push({ t: 'text', x: width + 8, y: height / 2 + 5, s: b.label, anchor: 'start' });
  }
  return { width: width + (b.label ? 50 : 0), height, shapes };
}

export function fractionWall(w: FractionWall): Drawing {
  const width = 330;
  const rows = [1, ...w.denominators];
  const shapes: Shape[] = [];
  rows.forEach((d, r) => {
    const pw = (width - 2) / d;
    for (let i = 0; i < d; i++) {
      const x = 1 + i * pw;
      const y = 1 + r * L.WALL_ROW;
      shapes.push({ t: 'rect', x: f1(x), y, w: f1(pw), h: L.WALL_ROW });
      if (w.labelPieces) {
        shapes.push({ t: 'text', x: f1(x + pw / 2), y: y + L.WALL_ROW / 2 + 5, s: d === 1 ? '1' : `1/${d}`, size: 12 });
      }
    }
  });
  return { width, height: rows.length * L.WALL_ROW + 2, shapes };
}

export function unitGrid(g: UnitGrid): Drawing {
  const cell = g.rows >= 10 ? L.HUNDREDTHS_CELL : L.GRID_CELL;
  const shapes: Shape[] = [];
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const i = r * g.cols + c;
      shapes.push({ t: 'rect', x: 1 + c * cell, y: 1 + r * cell, w: cell, h: cell, fill: i < g.shaded ? SHADE : 'white', sw: 1.2 });
    }
  }
  return { width: g.cols * cell + 4, height: g.rows * cell + 4, shapes };
}

// sides sizes the parts of one side of an area model in proportion to
// their values, within total pixels, but never below least, so the child
// has room to write in the smallest cell.
function sides(parts: readonly number[], total: number, least: number): number[] {
  const sum = parts.reduce((a, b) => a + b, 0) || 1;
  return parts.map((p) => Math.max(least, Math.round((p / sum) * total)));
}

export function areaModel(a: AreaModel, filled: boolean, w: L.Writing = L.STANDARD_WRITING): Drawing {
  const top = 22;
  const left = 40;
  // Room to write the largest product in a cell, at the child's size.
  const digits = Math.max(...a.rowParts.flatMap((r) => a.colParts.map((c) => String(r * c).length)));
  const least = Math.round(digits * w.row * 0.5 + 28);
  const cws = sides(a.colParts, L.AREA_WIDTH, least);
  const chs = a.rowParts.length > 1 ? sides(a.rowParts, L.AREA_HEIGHT, w.row + 18) : [w.row + 18];
  const xs = cws.reduce<number[]>((acc, cw, j) => [...acc, acc[j] + cw], [left]);
  const ys = chs.reduce<number[]>((acc, ch, i) => [...acc, acc[i] + ch], [top]);
  const shapes: Shape[] = [];
  a.colParts.forEach((c, j) => shapes.push({ t: 'text', x: xs[j] + cws[j] / 2, y: 15, s: String(c), size: 14 }));
  a.rowParts.forEach((r, i) => {
    shapes.push({ t: 'text', x: left - 8, y: ys[i] + chs[i] / 2 + 5, s: String(r), size: 14, anchor: 'end' });
    a.colParts.forEach((c, j) => {
      const [x, y, cw, ch] = [xs[j], ys[i], cws[j], chs[i]];
      shapes.push({ t: 'rect', x, y, w: cw, h: ch });
      const cell = a.cells[i * a.colParts.length + j];
      if (cell?.field) {
        shapes.push({ t: 'box', x: x + 8, y: y + 8, w: cw - 16, h: ch - 16, field: fieldId(cell.field), s: shown(cell.field, filled) });
      } else if (!a.emptyCells) {
        shapes.push({ t: 'text', x: x + cw / 2, y: y + ch / 2 + 5, s: String(r * c) });
      }
    });
  });
  return { width: xs[xs.length - 1] + 2, height: ys[ys.length - 1] + 2, shapes };
}

export function dotArray(d: DotArray): Drawing {
  const g = L.DOT_GAP;
  const shapes: Shape[] = [];
  for (let r = 0; r < d.rows; r++) {
    for (let c = 0; c < d.cols; c++) {
      shapes.push({ t: 'circle', cx: 10 + c * g, cy: 10 + r * g, r: 5 });
    }
  }
  return { width: d.cols * g + 4, height: d.rows * g + 4, shapes };
}

export function tapeDiagram(t: TapeDiagram, filled: boolean): Drawing {
  const shapes: Shape[] = [];
  let y = 2;
  let width = 0;
  for (const tape of t.tapes) {
    shapes.push({ t: 'text', x: L.TAPE_NAME - 8, y: y + 20, s: tape.name, anchor: 'end' });
    for (let i = 0; i < tape.units; i++) {
      const x = L.TAPE_NAME + i * L.TAPE_UNIT;
      shapes.push({ t: 'rect', x, y, w: L.TAPE_UNIT, h: L.TAPE_ROW - 6 });
      if (tape.unitText) {
        shapes.push({ t: 'text', x: x + L.TAPE_UNIT / 2, y: y + 19, s: tape.unitText, size: 13 });
      }
    }
    const end = L.TAPE_NAME + tape.units * L.TAPE_UNIT;
    width = Math.max(width, end + 10);
    y += L.TAPE_ROW;
    if (tape.total || tape.totalField) {
      const mid = (L.TAPE_NAME + end) / 2;
      shapes.push({ t: 'path', d: `M${L.TAPE_NAME} ${y - 4} q0 8 8 8 L${mid - 6} ${y + 4} q6 0 6 6 q0 -6 6 -6 L${end - 8} ${y + 4} q8 0 8 -8`, w: 1.2 });
      if (tape.totalField) {
        shapes.push({ t: 'box', x: mid - 22, y: y + 10, w: 44, h: 18, field: fieldId(tape.totalField), s: shown(tape.totalField, filled) });
      } else {
        shapes.push({ t: 'text', x: mid, y: y + 24, s: tape.total });
      }
      y += 30;
    }
  }
  return { width, height: y, shapes };
}

export function columnArithmetic(c: ColumnArithmetic, filled: boolean, w: L.Writing = L.STANDARD_WRITING): Drawing {
  const nums = c.operands.map((x) => x.toString());
  // Without partials, one column more than the longest number, for a carry
  // into a new place. With partials, as wide as the longest answer row.
  const cols =
    c.partials.length > 0
      ? Math.max(...nums.map((s) => s.length), ...[...c.partials.map((p) => p.field), c.answer].map((f) => (f?.answer?.text ?? '').length))
      : Math.max(...nums.map((s) => s.length)) + 1;
  const dw = w.digit;
  const rh = dw * 1.25;
  const left = 22;
  const right = left + cols * dw;
  const shapes: Shape[] = [];
  const carry = Math.round(dw / 2);
  let y = c.carryBoxes ? carry + 6 : 2;
  if (c.carryBoxes) {
    for (let i = 1; i < cols; i++) {
      shapes.push({ t: 'rect', x: left + (i - 1) * dw + (dw - carry) / 2, y: 2, w: carry, h: carry, sw: 0.8, dash: '2 2' });
    }
  }
  const sign = c.op === ColumnArithmetic_Op.SUBTRACT ? '−' : c.op === ColumnArithmetic_Op.MULTIPLY ? '×' : '+';
  nums.forEach((s, r) => {
    if (r === nums.length - 1) {
      shapes.push({ t: 'text', x: left - 6, y: y + rh - 7, s: sign, size: 20 });
    }
    [...s].forEach((ch, i) => {
      shapes.push({ t: 'text', x: right - (s.length - i) * dw + dw / 2, y: y + rh - 7, s: ch, size: 20 });
    });
    y += rh;
  });
  // boxRow draws a row of digit boxes read as one field, right-aligned.
  const boxRow = (f: ColumnArithmetic['answer']) => {
    const ans = shown(f, filled);
    for (let i = 0; i < cols; i++) {
      const ch = ans.length >= cols - i ? ans[ans.length - (cols - i)] : '';
      shapes.push({ t: 'box', x: left + i * dw + 2, y, w: dw - 4, h: rh - 4, field: i === 0 ? fieldId(f) : null, s: ch ?? '', size: 17 });
    }
  };
  shapes.push({ t: 'line', x1: 4, y1: y + 3, x2: right + 2, y2: y + 3, w: 2 });
  y += 8;
  let width = right + 6;
  if (c.partials.length > 0) {
    for (const p of c.partials) {
      boxRow(p.field);
      shapes.push({ t: 'text', x: right + 10, y: y + rh / 2 + 4, s: p.note, size: 13, anchor: 'start', italic: true });
      width = Math.max(width, right + 14 + p.note.length * 7.5);
      y += rh;
    }
    shapes.push({ t: 'line', x1: 4, y1: y + 1, x2: right + 2, y2: y + 1, w: 2 });
    shapes.push({ t: 'text', x: left - 6, y: y - 6, s: '+', size: 20 });
    y += 6;
  }
  boxRow(c.answer);
  return { width, height: y + rh, shapes };
}

// niceStep picks a gridline step that gives at most six gridlines.
function niceStep(max: number): number {
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) {
    if (max / s <= 6) {
      return s;
    }
  }
  return Math.ceil(max / 6);
}

export function barGraph(b: BarGraph): Drawing {
  const shapes: Shape[] = [];
  const most = Math.max(1, ...b.bars.map((x) => x.value));
  const step = b.step || niceStep(most);
  const top = Math.ceil(most / step) * step;
  const left = 44;
  const plotTop = b.title ? 40 : 22;
  const plotH = 130;
  const barW = 40;
  const gap = Math.max(26, ...b.bars.map((x) => x.label.length * 7.5 - barW + 8));
  const plotW = b.bars.length * (barW + gap) + gap / 2;
  const base = plotTop + plotH;
  const yOf = (v: number) => base - (v / top) * plotH;
  if (b.title) {
    shapes.push({ t: 'text', x: left + plotW / 2, y: 16, s: b.title, size: 14 });
  }
  if (b.valueAxis) {
    shapes.push({ t: 'text', x: 4, y: plotTop - 8, s: b.valueAxis, size: 12, anchor: 'start', italic: true });
  }
  for (let v = 0; v <= top; v += step) {
    const y = yOf(v);
    if (v > 0) {
      shapes.push({ t: 'line', x1: left, y1: y, x2: left + plotW, y2: y, w: 0.6, dash: '3 3' });
    }
    shapes.push({ t: 'text', x: left - 6, y: y + 4, s: String(v), size: 12, anchor: 'end' });
  }
  b.bars.forEach((bar, i) => {
    const x = left + gap / 2 + i * (barW + gap);
    shapes.push({ t: 'rect', x, y: yOf(bar.value), w: barW, h: base - yOf(bar.value), fill: SHADE, sw: 1.2 });
    shapes.push({ t: 'text', x: x + barW / 2, y: base + 16, s: bar.label, size: 12 });
  });
  shapes.push({ t: 'line', x1: left, y1: plotTop - 4, x2: left, y2: base, w: 1.5 });
  shapes.push({ t: 'line', x1: left, y1: base, x2: left + plotW, y2: base, w: 1.5 });
  return { width: left + plotW + 4, height: base + 24, shapes };
}

export function dataTable(t: DataTable, filled: boolean, w: L.Writing = L.STANDARD_WRITING): Drawing {
  const shapes: Shape[] = [];
  const ncols = Math.max(t.header.length, ...t.rows.map((r) => r.cells.length));
  const textOf = (r: number, c: number): string => {
    const cell = t.rows[r]?.cells[c];
    return cell?.kind.case === 'text' ? cell.kind.value : '';
  };
  const colW = Array.from({ length: ncols }, (_, c) =>
    Math.max(w.digit * 3, (t.header[c] ?? '').length * 8 + 16, ...t.rows.map((_, r) => textOf(r, c).length * 7.5 + 16)),
  );
  const rowH = Math.max(28, w.row);
  let y = t.title ? 22 : 0;
  if (t.title) {
    shapes.push({ t: 'text', x: colW.reduce((a, b) => a + b, 0) / 2 + 1, y: 15, s: t.title, size: 14 });
  }
  const xs = colW.reduce<number[]>((acc, cw, i) => [...acc, acc[i] + cw], [1]);
  const width = xs[ncols];
  shapes.push({ t: 'rect', x: 1, y, w: width - 1, h: 28, fill: '#eee', sw: 1.2 });
  t.header.forEach((h, c) => shapes.push({ t: 'text', x: xs[c] + colW[c] / 2, y: y + 19, s: h, size: 13 }));
  y += 28;
  for (const row of t.rows) {
    shapes.push({ t: 'rect', x: 1, y, w: width - 1, h: rowH, sw: 1.2 });
    row.cells.forEach((cell, c) => {
      const k = cell.kind;
      if (k.case === 'text') {
        shapes.push({ t: 'text', x: xs[c] + colW[c] / 2, y: y + rowH / 2 + 5, s: k.value, size: 14 });
      } else if (k.case === 'field') {
        shapes.push({ t: 'box', x: xs[c] + 6, y: y + 3, w: colW[c] - 12, h: rowH - 6, field: fieldId(k.value), s: shown(k.value, filled), size: 15 });
      }
    });
    y += rowH;
  }
  for (let c = 1; c < ncols; c++) {
    shapes.push({ t: 'line', x1: xs[c], y1: t.title ? 22 : 0, x2: xs[c], y2: y, w: 1.2 });
  }
  return { width: width + 2, height: y + 2, shapes };
}

const rad = (d: number) => (d * Math.PI) / 180;

export function angle(a: Angle, filled: boolean): Drawing {
  // A split angle is drawn larger, so its labels sit clear of the rays.
  const split = a.rays.length > 1;
  const r = split ? 120 : 82;
  const labelR = split ? 78 : 46;
  const dirs = [a.rotation, ...a.rays.map((d) => a.rotation + d)];
  const pt = (deg: number, len: number): [number, number] => [f1(len * Math.cos(rad(deg))), f1(-len * Math.sin(rad(deg)))];
  const shapes: Shape[] = [];
  for (const d of dirs) {
    const [x, y] = pt(d, r);
    shapes.push({ t: 'line', x1: 0, y1: 0, x2: x, y2: y, w: 2 });
    // An arrowhead marks each ray.
    const [b1x, b1y] = pt(d + 160, 9);
    const [b2x, b2y] = pt(d - 160, 9);
    shapes.push({ t: 'path', d: `M${f1(x + b1x)} ${f1(y + b1y)} L${x} ${y} L${f1(x + b2x)} ${f1(y + b2y)}`, w: 2 });
  }
  shapes.push({ t: 'circle', cx: 0, cy: 0, r: 3 });
  for (let i = 0; i + 1 < dirs.length; i++) {
    const from = dirs[i];
    const to = dirs[i + 1];
    const right = a.markRightAngles && Math.abs(to - from - 90) < 0.01;
    if (right) {
      const [p1x, p1y] = pt(from, 12);
      const [p2x, p2y] = pt(to, 12);
      shapes.push({ t: 'path', d: `M${p1x} ${p1y} L${f1(p1x + p2x)} ${f1(p1y + p2y)} L${p2x} ${p2y}`, w: 1.4 });
    } else {
      const ar = 18 + i * 4;
      const [sx, sy] = pt(from, ar);
      const [ex, ey] = pt(to, ar);
      shapes.push({ t: 'path', d: `M${sx} ${sy} A${ar} ${ar} 0 ${to - from > 180 ? 1 : 0} 0 ${ex} ${ey}`, w: 1.4 });
    }
    const label = a.arcs[i];
    if (label) {
      const [lx, ly] = pt((from + to) / 2, labelR);
      if (label.field) {
        shapes.push({ t: 'box', x: lx - 22, y: ly - 11, w: 44, h: 22, field: fieldId(label.field), s: shown(label.field, filled) });
      } else if (label.text) {
        shapes.push({ t: 'text', x: lx, y: ly + 5, s: label.text, size: 13 });
      }
    }
  }
  // Crop to what was drawn, with room for arrowheads and labels.
  const mids = dirs.slice(1).map((d, i) => (d + dirs[i]) / 2);
  const xs = [0, ...dirs.map((d) => pt(d, r)[0]), ...mids.map((d) => pt(d, labelR)[0] - 24), ...mids.map((d) => pt(d, labelR)[0] + 24)];
  const ys = [0, ...dirs.map((d) => pt(d, r)[1]), ...mids.map((d) => pt(d, labelR)[1] - 12), ...mids.map((d) => pt(d, labelR)[1] + 12)];
  const pad = 14;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - minX + pad;
  const h = Math.max(...ys) - minY + pad;
  const scale = Math.min(1, (split ? 170 : L.ANGLE_SIZE) / h, (split ? 300 : L.ANGLE_SIZE + 40) / w);
  return { width: f1(w * scale), height: f1(h * scale), viewBox: [f1(minX), f1(minY), f1(w), f1(h)], shapes };
}

export function polygon(p: Polygon, filled: boolean): Drawing {
  const xs = p.points.map((q) => q.x);
  const ys = p.points.map((q) => q.y);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = maxY - Math.min(...ys) || 1;
  const scale = Math.min(L.POLYGON_MAX_WIDTH / spanX, L.POLYGON_MAX_HEIGHT / spanY, 22);
  const pad = 36;
  const pts = p.points.map((q): [number, number] => [f1(pad + (q.x - minX) * scale), f1(18 + (maxY - q.y) * scale)]);
  const shapes: Shape[] = [{ t: 'path', d: 'M' + pts.map(([x, y]) => `${x} ${y}`).join(' L') + ' Z', w: 2 }];
  const n = pts.length;
  // Centroid, to push side labels outward.
  const cx = pts.reduce((s, q) => s + q[0], 0) / n;
  const cy = pts.reduce((s, q) => s + q[1], 0) / n;
  p.sides.forEach((side, i) => {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const len = Math.hypot(mx - cx, my - cy) || 1;
    // A box for a side is pushed out further than a label, so it clears the
    // side it names.
    const ox = mx + ((mx - cx) / len) * (side.field ? 34 : 20);
    const oy = my + ((my - cy) / len) * 16;
    if (side.field) {
      shapes.push({ t: 'box', x: f1(ox - 24), y: f1(oy - 11), w: 48, h: 22, field: fieldId(side.field), s: shown(side.field, filled) });
    } else if (side.text) {
      shapes.push({ t: 'text', x: f1(ox), y: f1(oy + 5), s: side.text, size: 13 });
    }
  });
  if (p.markRightAngles) {
    for (let i = 0; i < n; i++) {
      const [px, py] = pts[i];
      const [ax, ay] = pts[(i + n - 1) % n];
      const [bx, by] = pts[(i + 1) % n];
      const ux = ax - px;
      const uy = ay - py;
      const vx = bx - px;
      const vy = by - py;
      const lu = Math.hypot(ux, uy);
      const lv = Math.hypot(vx, vy);
      if (Math.abs((ux * vx + uy * vy) / (lu * lv)) < 0.01) {
        const s = 9;
        const p1 = [px + (ux / lu) * s, py + (uy / lu) * s];
        const p2 = [px + (vx / lv) * s, py + (vy / lv) * s];
        shapes.push({ t: 'path', d: `M${f1(p1[0])} ${f1(p1[1])} L${f1(p1[0] + p2[0] - px)} ${f1(p1[1] + p2[1] - py)} L${f1(p2[0])} ${f1(p2[1])}`, w: 1.2 });
      }
    }
  }
  const boxes = p.sides.some((side) => side.field) ? 24 : 0;
  return { width: f1(pad * 2 + boxes + spanX * scale), height: f1(36 + spanY * scale), shapes };
}

export function placeValueChart(c: PlaceValueChart, filled: boolean): Drawing {
  const cw = 92;
  const shapes: Shape[] = [];
  c.columns.forEach((col, i) => {
    const x = 1 + i * cw;
    shapes.push({ t: 'rect', x, y: 1, w: cw, h: 26, fill: '#eee' });
    shapes.push({ t: 'text', x: x + cw / 2, y: 18, s: col.name, size: col.name.length > 14 ? 8.5 : 10 });
    shapes.push({ t: 'rect', x, y: 27, w: cw, h: 40 });
    if (col.field) {
      shapes.push({ t: 'box', x: x + cw / 2 - 15, y: 32, w: 30, h: 30, field: fieldId(col.field), s: shown(col.field, filled), size: 18 });
    } else {
      shapes.push({ t: 'text', x: x + cw / 2, y: 55, s: col.digit, size: 22 });
    }
  });
  return { width: c.columns.length * cw + 2, height: 69, shapes };
}

export function baseTenBlocks(b: BaseTenBlocks): Drawing {
  const u = 4.4;
  const shapes: Shape[] = [];
  let x = 2;
  const top = 12;
  for (let i = 0; i < b.thousands; i++) {
    // A cube: a front face with its grid, and its top and side.
    const s = 10 * u;
    const d = 10;
    shapes.push({ t: 'path', d: `M${x} ${top} l${d} ${-d} l${s} 0 l0 ${s} l${-d} ${d}`, fill: '#e4e4e4', w: 1.2 });
    shapes.push({ t: 'path', d: `M${x + s} ${top} l${d} ${-d}`, w: 1.2 });
    shapes.push({ t: 'rect', x, y: top, w: s, h: s, fill: '#f4f4f4', sw: 1.4 });
    for (let k = 1; k < 10; k++) {
      shapes.push({ t: 'line', x1: f1(x + k * u), y1: top, x2: f1(x + k * u), y2: top + s, w: 0.4 });
      shapes.push({ t: 'line', x1: x, y1: f1(top + k * u), x2: x + s, y2: f1(top + k * u), w: 0.4 });
    }
    x += s + d + 10;
  }
  for (let i = 0; i < b.hundreds; i++) {
    const s = 10 * u;
    shapes.push({ t: 'rect', x, y: top, w: s, h: s, fill: '#f4f4f4', sw: 1.4 });
    for (let k = 1; k < 10; k++) {
      shapes.push({ t: 'line', x1: f1(x + k * u), y1: top, x2: f1(x + k * u), y2: top + s, w: 0.4 });
      shapes.push({ t: 'line', x1: x, y1: f1(top + k * u), x2: x + s, y2: f1(top + k * u), w: 0.4 });
    }
    x += s + 6;
  }
  x += b.hundreds ? 4 : 0;
  for (let i = 0; i < b.tens; i++) {
    shapes.push({ t: 'rect', x, y: top, w: u, h: 10 * u, fill: '#f4f4f4', sw: 1.2 });
    for (let k = 1; k < 10; k++) {
      shapes.push({ t: 'line', x1: x, y1: f1(top + k * u), x2: x + u, y2: f1(top + k * u), w: 0.4 });
    }
    x += u + 4;
  }
  x += b.tens ? 6 : 0;
  for (let i = 0; i < b.ones; i++) {
    const col = Math.floor(i / 5);
    const row = i % 5;
    shapes.push({ t: 'rect', x: f1(x + col * (u + 4)), y: f1(top + 10 * u - (row + 1) * (u + 3)), w: u, h: u, fill: '#f4f4f4', sw: 1 });
  }
  x += Math.ceil(b.ones / 5) * (u + 4);
  return { width: f1(x + 2), height: f1(top + 10 * u + 4), shapes };
}

export function longDivision(l: LongDivision, filled: boolean, w: L.Writing = L.STANDARD_WRITING): Drawing {
  const ds = l.dividend.toString();
  const dw = w.digit;
  // Room for the divisor: a one-digit divisor sits as it always has, and
  // each further digit moves the bracket right.
  const dl = String(l.divisor).length;
  const left = 28 + 12 * dl;
  const top = 34;
  const right = left + ds.length * dw + 10;
  const shapes: Shape[] = [];
  shapes.push({ t: 'text', x: left - 8 - 6 * dl, y: top + 24, s: String(l.divisor), size: 20 });
  shapes.push({ t: 'path', d: `M${left - 4} ${top + 32} Q${left + 4} ${top + 16} ${left - 4} ${top} L${right} ${top}`, w: 2 });
  [...ds].forEach((ch, i) => shapes.push({ t: 'text', x: left + 6 + i * dw + dw / 2, y: top + 24, s: ch, size: 20 }));
  shapes.push({ t: 'box', x: left + 4, y: 2, w: ds.length * dw, h: 26, field: fieldId(l.quotient), s: shown(l.quotient, filled), size: 17 });
  let width = right + 6;
  if (l.remainder) {
    shapes.push({ t: 'text', x: right + 12, y: 21, s: 'R', size: 16 });
    shapes.push({ t: 'box', x: right + 22, y: 2, w: 30, h: 26, field: fieldId(l.remainder), s: shown(l.remainder, filled), size: 17 });
    width = right + 56;
  }
  return { width, height: top + 34 + l.workRows * w.row * 0.75, shapes };
}

export function clock(c: Clock): Drawing {
  const r = 62;
  const cx = r + 4;
  const cy = r + 4;
  const shapes: Shape[] = [{ t: 'path', d: `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`, w: 2 }];
  for (let i = 0; i < 60; i++) {
    const a = rad(90 - i * 6);
    const len = i % 5 === 0 ? 6 : 3;
    shapes.push({ t: 'line', x1: f1(cx + (r - len) * Math.cos(a)), y1: f1(cy - (r - len) * Math.sin(a)), x2: f1(cx + r * Math.cos(a)), y2: f1(cy - r * Math.sin(a)), w: i % 5 === 0 ? 1.6 : 0.8 });
  }
  for (let h = 1; h <= 12; h++) {
    const a = rad(90 - h * 30);
    shapes.push({ t: 'text', x: f1(cx + (r - 16) * Math.cos(a)), y: f1(cy - (r - 16) * Math.sin(a) + 5), s: String(h), size: 13 });
  }
  const ha = rad(90 - ((c.hour % 12) + c.minute / 60) * 30);
  const ma = rad(90 - c.minute * 6);
  shapes.push({ t: 'line', x1: cx, y1: cy, x2: f1(cx + 30 * Math.cos(ha)), y2: f1(cy - 30 * Math.sin(ha)), w: 3.6 });
  shapes.push({ t: 'line', x1: cx, y1: cy, x2: f1(cx + 50 * Math.cos(ma)), y2: f1(cy - 50 * Math.sin(ma)), w: 1.8 });
  shapes.push({ t: 'circle', cx, cy, r: 3 });
  return { width: 2 * r + 8, height: 2 * r + 8, shapes };
}

export function ruler(r: Ruler): Drawing {
  const inch = 64;
  const left = 14;
  const ppi = r.partsPerInch || 4;
  const barTop = 4;
  const top = 26;
  const shapes: Shape[] = [];
  shapes.push({ t: 'rect', x: left, y: barTop, w: f1((r.barParts * inch) / ppi), h: 14, fill: '#c8c8c8' });
  shapes.push({ t: 'rect', x: left - 8, y: top, w: r.inches * inch + 16, h: 44, sw: 1.2 });
  for (let i = 0; i <= r.inches * ppi; i++) {
    const x = f1(left + (i * inch) / ppi);
    const len = i % ppi === 0 ? 18 : (i * 2) % ppi === 0 ? 13 : (i * 4) % ppi === 0 ? 9 : 6;
    shapes.push({ t: 'line', x1: x, y1: top, x2: x, y2: top + len, w: i % ppi === 0 ? 1.6 : 1 });
    if (i % ppi === 0) {
      shapes.push({ t: 'text', x, y: top + 32, s: String(i / ppi), size: 12 });
    }
  }
  shapes.push({ t: 'text', x: left + r.inches * inch - 14, y: top + 40, s: 'inches', size: 9, anchor: 'end' });
  return { width: left + r.inches * inch + 12, height: top + 46, shapes };
}

// mixed writes n/d as a whole number, a fraction or a mixed number.
export function mixed(n: number, d: number): string {
  const g = gcdOf(n, d);
  n /= g;
  d /= g;
  if (d === 1) {
    return String(n);
  }
  const w = Math.floor(n / d);
  return w ? `${w} ${n - w * d}/${d}` : `${n}/${d}`;
}

function gcdOf(a: number, b: number): number {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

export function linePlot(p: LinePlot): Drawing {
  const ticks = (p.end - p.start) * p.partsPerUnit;
  const step = 52;
  const left = 22;
  const most = Math.max(1, ...p.counts);
  const y = 16 + most * 15;
  const shapes: Shape[] = [{ t: 'line', x1: left - 10, y1: y, x2: left + ticks * step + 10, y2: y }];
  for (let i = 0; i <= ticks; i++) {
    const x = left + i * step;
    shapes.push({ t: 'line', x1: x, y1: y - 5, x2: x, y2: y + 5 });
    shapes.push({ t: 'text', x, y: y + 20, s: mixed(p.start * p.partsPerUnit + i, p.partsPerUnit), size: 12 });
    for (let k = 0; k < (p.counts[i] ?? 0); k++) {
      shapes.push({ t: 'text', x, y: y - 8 - k * 15, s: '×', size: 16 });
    }
  }
  if (p.caption) {
    shapes.push({ t: 'text', x: left + (ticks * step) / 2, y: y + 38, s: p.caption, size: 12 });
  }
  return { width: left * 2 + ticks * step, height: y + (p.caption ? 44 : 26), shapes };
}

export function protractor(p: Protractor): Drawing {
  const r = 112;
  const cx = r + 14;
  const cy = r + 16;
  const shapes: Shape[] = [
    { t: 'path', d: `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z`, fill: '#f7f7f7', w: 1.4 },
    { t: 'path', d: `M${cx - 30} ${cy} A30 30 0 0 1 ${cx + 30} ${cy}`, w: 0.8 },
  ];
  for (let d = 0; d <= 180; d++) {
    const a = rad(d);
    const len = d % 10 === 0 ? 12 : d % 5 === 0 ? 8 : 4;
    shapes.push({ t: 'line', x1: f1(cx + (r - len) * Math.cos(a)), y1: f1(cy - (r - len) * Math.sin(a)), x2: f1(cx + r * Math.cos(a)), y2: f1(cy - r * Math.sin(a)), w: d % 10 === 0 ? 1 : 0.5 });
    // Labels from 10 to 170; 0 and 180 would sit on the base line.
    if (d % 10 === 0 && d > 0 && d < 180) {
      shapes.push({ t: 'text', x: f1(cx + (r - 22) * Math.cos(a)), y: f1(cy - (r - 22) * Math.sin(a) + 3), s: String(d), size: 8 });
    }
  }
  const len = r + 10;
  const a = rad(p.degrees);
  shapes.push({ t: 'line', x1: cx, y1: cy, x2: cx + len, y2: cy, w: 2 });
  shapes.push({ t: 'line', x1: cx, y1: cy, x2: f1(cx + len * Math.cos(a)), y2: f1(cy - len * Math.sin(a)), w: 2 });
  shapes.push({ t: 'circle', cx, cy, r: 3 });
  return { width: 2 * cx, height: cy + 6, shapes };
}

function arrowHead(x: number, y: number, deg: number): Shape {
  const [b1x, b1y] = [9 * Math.cos(rad(deg + 155)), -9 * Math.sin(rad(deg + 155))];
  const [b2x, b2y] = [9 * Math.cos(rad(deg - 155)), -9 * Math.sin(rad(deg - 155))];
  return { t: 'path', d: `M${f1(x + b1x)} ${f1(y + b1y)} L${f1(x)} ${f1(y)} L${f1(x + b2x)} ${f1(y + b2y)}`, w: 2 };
}

export function lineFigure(f: LineFigure): Drawing {
  const w = 170;
  const h = 96;
  const cx = w / 2;
  const cy = h / 2;
  const turn = (deg: number, len: number): [number, number] => [f1(cx + len * Math.cos(rad(deg))), f1(cy - len * Math.sin(rad(deg)))];
  const rot = f.rotation;
  const shapes: Shape[] = [];
  const names = f.points;
  const dot = (p: [number, number], name?: string, below = true) => {
    shapes.push({ t: 'circle', cx: p[0], cy: p[1], r: 3.5 });
    if (name) {
      shapes.push({ t: 'text', x: p[0], y: p[1] + (below ? 17 : -8), s: name, size: 13, italic: true });
    }
  };
  // A straight figure through the centre at angle deg, from -a to b.
  const seg = (deg: number, a: number, b: number) => {
    const p = turn(deg + 180, a);
    const q = turn(deg, b);
    shapes.push({ t: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1], w: 2 });
    return [p, q] as const;
  };
  switch (f.kind) {
    case LineFigure_Kind.POINT:
      dot([cx, cy], names[0]);
      break;
    case LineFigure_Kind.SEGMENT: {
      const [p, q] = seg(rot, 60, 60);
      dot(p, names[0]);
      dot(q, names[1]);
      break;
    }
    case LineFigure_Kind.LINE: {
      const [p, q] = seg(rot, 72, 72);
      shapes.push(arrowHead(p[0], p[1], rot + 180), arrowHead(q[0], q[1], rot));
      dot(turn(rot + 180, 34), names[0]);
      dot(turn(rot, 34), names[1]);
      break;
    }
    case LineFigure_Kind.RAY: {
      const [p, q] = seg(rot, 60, 72);
      shapes.push(arrowHead(q[0], q[1], rot));
      dot(p, names[0]);
      dot(turn(rot, 30), names[1]);
      break;
    }
    case LineFigure_Kind.PARALLEL:
    case LineFigure_Kind.PERPENDICULAR:
    case LineFigure_Kind.INTERSECTING: {
      const second = f.kind === LineFigure_Kind.PARALLEL ? rot : f.kind === LineFigure_Kind.PERPENDICULAR ? rot + 90 : rot + 50;
      if (f.kind === LineFigure_Kind.PARALLEL) {
        const off = (d: number): [number, number] => [f1(16 * Math.cos(rad(rot + 90)) * d), f1(-16 * Math.sin(rad(rot + 90)) * d)];
        for (const side of [-1, 1]) {
          const [ox, oy] = off(side);
          const p = turn(rot + 180, 70);
          const q = turn(rot, 70);
          shapes.push({ t: 'line', x1: p[0] + ox, y1: p[1] + oy, x2: q[0] + ox, y2: q[1] + oy, w: 2 });
          shapes.push(arrowHead(p[0] + ox, p[1] + oy, rot + 180), arrowHead(q[0] + ox, q[1] + oy, rot));
        }
      } else {
        for (const deg of [rot, second]) {
          const [p, q] = seg(deg, 44, 44);
          shapes.push(arrowHead(p[0], p[1], deg + 180), arrowHead(q[0], q[1], deg));
        }
        if (f.kind === LineFigure_Kind.PERPENDICULAR) {
          const a = turn(rot, 10);
          const b = turn(rot + 90, 10);
          shapes.push({ t: 'path', d: `M${a[0]} ${a[1]} L${f1(a[0] + b[0] - cx)} ${f1(a[1] + b[1] - cy)} L${b[0]} ${b[1]}`, w: 1.2 });
        }
      }
      break;
    }
  }
  return { width: w, height: h, shapes };
}

export function numberChart(c: NumberChart, filled: boolean): Drawing {
  const cell = 27;
  const shade = new Set(c.shaded);
  if (filled && c.shadeField) {
    for (const v of (c.shadeField.answer?.text ?? '').split(/,\s*/)) {
      shade.add(Number(v));
    }
  }
  const shapes: Shape[] = [];
  for (let r = 0; r < c.rows; r++) {
    for (let k = 0; k < c.cols; k++) {
      const n = c.start + r * c.cols + k;
      const x = 1 + k * cell;
      const y = 1 + r * cell;
      shapes.push({ t: 'rect', x, y, w: cell, h: cell, fill: shade.has(n) ? SHADE : 'white', sw: 1 });
      shapes.push({ t: 'text', x: x + cell / 2, y: y + cell / 2 + 4, s: String(n), size: 11 });
    }
  }
  return { width: c.cols * cell + 2, height: c.rows * cell + 2, shapes };
}
