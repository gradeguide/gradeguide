// Geometry for the grade 6 to 8 widgets: node in, Drawing out, like
// draw.ts. measure.ts and the components both call drawG68, so a size
// estimate cannot drift from the drawing.
import {
  type Angle_ArcLabel,
  type AngleTriangle,
  type BoxPlot,
  type BoxSolid,
  type CoordinatePlane,
  type CoordinatePlane_Point,
  type CoordinatePlane_Segment,
  type DoubleNumberLine,
  type Field,
  type HeightShape,
  type Histogram,
  type Node,
  type PrismNet,
  type RoundSolid,
  type Transversal,
  RoundSolid_Kind,
} from '../proto/v1/nodes_pb.js';
import { type Drawing, type Shape } from './drawing.js';
import { fieldId, shown } from './field.js';
import * as L from './layout.js';

const f1 = (v: number) => Math.round(v * 10) / 10;
const rad = (d: number) => (d * Math.PI) / 180;

// drawG68 draws a grade 6 to 8 widget, or returns undefined for any other
// node.
export function drawG68(n: Node, filled: boolean, w: L.Writing = L.STANDARD_WRITING): Drawing | undefined {
  const k = n.kind;
  switch (k.case) {
    case 'doubleNumberLine':
      return doubleNumberLine(k.value, filled, w);
    case 'coordinatePlane':
      return coordinatePlane(k.value, filled);
    case 'boxPlot':
      return boxPlot(k.value, filled);
    case 'histogram':
      return histogram(k.value);
    case 'prismNet':
      return prismNet(k.value);
    case 'heightShape':
      return heightShape(k.value);
    case 'transversal':
      return transversal(k.value, filled);
    case 'roundSolid':
      return roundSolid(k.value);
    case 'boxSolid':
      return boxSolid(k.value);
    case 'angleTriangle':
      return angleTriangle(k.value, filled);
  }
  return undefined;
}

// fieldsG68 lists the fields in a grade 6 to 8 widget, in drawing order.
export function fieldsG68(n: Node): (Field | undefined)[] {
  const k = n.kind;
  switch (k.case) {
    case 'doubleNumberLine':
      return k.value.ticks.flatMap((t) => [t.topField, t.bottomField]);
    case 'coordinatePlane':
      return [...k.value.segments.map((s) => s.field), k.value.plotField];
    case 'boxPlot':
      return [k.value.drawField];
    case 'transversal':
      return k.value.labels.map((l) => l.field);
    case 'angleTriangle':
      return [...k.value.labels.map((l) => l.field), k.value.exterior?.field];
  }
  return [];
}

// boxFor sizes a write-in box for a field's longest accepted answer.
function boxWidth(f: Field | undefined, w: L.Writing): number {
  const answers = [f?.answer?.text ?? '', ...(f?.answer?.also ?? [])].filter((a) => !a.includes(' '));
  const chars = Math.max(2, ...answers.map((a) => a.length));
  return Math.min(80, Math.round(chars * w.row * 0.4 + 12));
}

export function doubleNumberLine(n: DoubleNumberLine, filled: boolean, w: L.Writing = L.STANDARD_WRITING): Drawing {
  const label = Math.max(n.topLabel.length, n.bottomLabel.length) * 7 + 12;
  const boxW = Math.max(40, ...n.ticks.flatMap((t) => [t.topField, t.bottomField]).filter(Boolean).map((f) => boxWidth(f, w)));
  const step = Math.max(56, boxW + 10);
  const left = label + boxW / 2 + 4;
  const right = left + step * Math.max(1, n.ticks.length - 1);
  const bh = Math.max(24, Math.round(w.row * 0.8));
  const top = bh + 22;
  const bottom = top + 56;
  const shapes: Shape[] = [
    { t: 'line', x1: label, y1: top, x2: right + 18, y2: top },
    { t: 'line', x1: label, y1: bottom, x2: right + 18, y2: bottom },
    { t: 'text', x: 0, y: top + 5, s: n.topLabel, size: 13, anchor: 'start' },
    { t: 'text', x: 0, y: bottom + 5, s: n.bottomLabel, size: 13, anchor: 'start' },
  ];
  n.ticks.forEach((t, i) => {
    const x = f1(left + i * step);
    shapes.push({ t: 'line', x1: x, y1: top - 7, x2: x, y2: top + 7, w: 2 }, { t: 'line', x1: x, y1: bottom - 7, x2: x, y2: bottom + 7, w: 2 });
    if (t.topField) {
      shapes.push({ t: 'box', x: x - boxW / 2, y: top - 10 - bh, w: boxW, h: bh, field: fieldId(t.topField), s: shown(t.topField, filled) });
    } else if (t.top) {
      shapes.push({ t: 'text', x, y: top - 14, s: t.top, size: 15 });
    }
    if (t.bottomField) {
      shapes.push({ t: 'box', x: x - boxW / 2, y: bottom + 10, w: boxW, h: bh, field: fieldId(t.bottomField), s: shown(t.bottomField, filled) });
    } else if (t.bottom) {
      shapes.push({ t: 'text', x, y: bottom + 26, s: t.bottom, size: 15 });
    }
  });
  return { width: f1(right + 22), height: bottom + 14 + bh, shapes };
}

const ANSWER_COLOR = '#1a4f8a';

export function coordinatePlane(p: CoordinatePlane, filled: boolean): Drawing {
  const cols = Math.max(1, p.xMax - p.xMin);
  const rows = Math.max(1, p.yMax - p.yMin);
  const cell = p.cell || Math.max(11, Math.min(20, Math.floor(200 / Math.max(cols, rows))));
  const axes = !p.noAxes;
  const numbers = axes && !p.noNumbers;
  const left = numbers ? 34 : axes ? 22 : 4;
  // A sketch names its vertical axis above it, so it needs more room.
  const top = !axes ? 4 : numbers ? 18 : 26;
  const gx = (x: number) => f1(left + (x - p.xMin) * cell);
  const gy = (y: number) => f1(top + (p.yMax - y) * cell);
  const every = p.labelEvery || (Math.max(cols, rows) <= 12 ? 1 : Math.max(cols, rows) <= 24 ? 2 : 5);
  const shapes: Shape[] = [];
  if (!p.noGrid) {
    for (let x = p.xMin; x <= p.xMax; x++) {
      shapes.push({ t: 'line', x1: gx(x), y1: gy(p.yMin), x2: gx(x), y2: gy(p.yMax), w: axes ? 0.4 : 0.6 });
    }
    for (let y = p.yMin; y <= p.yMax; y++) {
      shapes.push({ t: 'line', x1: gx(p.xMin), y1: gy(y), x2: gx(p.xMax), y2: gy(y), w: axes ? 0.4 : 0.6 });
    }
  }
  // Axes run along zero, or along the plane's edge when zero is off it.
  const ax = p.yMin <= 0 && p.yMax >= 0 ? 0 : p.yMin;
  const ay = p.xMin <= 0 && p.xMax >= 0 ? 0 : p.xMin;
  let width = gx(p.xMax) + 4;
  if (axes) {
    shapes.push({ t: 'line', x1: gx(p.xMin), y1: gy(ax), x2: gx(p.xMax) + 8, y2: gy(ax), w: 1.8 });
    shapes.push({ t: 'line', x1: gx(ay), y1: gy(p.yMin), x2: gx(ay), y2: gy(p.yMax) - 8, w: 1.8 });
  }
  const xs = p.xScale || 1;
  const ys = p.yScale || 1;
  const neg = (v: number) => (v < 0 ? '−' + String(-v) : String(v));
  if (numbers) {
    for (let x = p.xMin; x <= p.xMax; x++) {
      if (x % every === 0 && !(x === ay && ax === 0 && ay === 0 && p.xMin < 0)) {
        shapes.push({ t: 'text', x: gx(x), y: gy(ax) + 14, s: neg(x * xs), size: 10 });
      }
    }
    for (let y = p.yMin; y <= p.yMax; y++) {
      if (y % every === 0 && !(y === ax && ay === 0 && p.yMin < 0)) {
        shapes.push({ t: 'text', x: gx(ay) - 4, y: gy(y) + 4, s: neg(y * ys), size: 10, anchor: 'end' });
      }
    }
  }
  if (axes && numbers) {
    width = gx(p.xMax) + 16;
    shapes.push({ t: 'text', x: gx(p.xMax) + 10, y: gy(ax) + 4, s: p.xLabel || 'x', size: 12, anchor: 'start', italic: !p.xLabel });
    shapes.push({ t: 'text', x: gx(ay), y: gy(p.yMax) - 10, s: p.yLabel || 'y', size: 12, italic: !p.yLabel });
  } else if (axes) {
    // A sketch's axes are named in words: along the bottom, and up the
    // left side.
    width = gx(p.xMax) + 12;
    shapes.push({ t: 'text', x: (gx(p.xMin) + gx(p.xMax)) / 2, y: gy(ax) + 16, s: p.xLabel || 'x', size: 12 });
    shapes.push({ t: 'text', x: gx(ay) - 4, y: 12, s: p.yLabel || 'y', size: 12, anchor: 'start' });
  }
  const inside = (x: number, y: number) => x >= p.xMin && x <= p.xMax && y >= p.yMin && y <= p.yMax;
  const drawSegment = (s: CoordinatePlane_Segment, color?: string) => {
    let [x1, y1, x2, y2] = [s.x1, s.y1, s.x2, s.y2];
    if (s.extend) {
      // Stretch to the grid's edge in both directions.
      const dx = x2 - x1;
      const dy = y2 - y1;
      let [lo, hi] = [-1e9, 1e9];
      const clip = (d: number, a: number, mn: number, mx: number) => {
        if (d === 0) {
          return;
        }
        const t1 = (mn - a) / d;
        const t2 = (mx - a) / d;
        lo = Math.max(lo, Math.min(t1, t2));
        hi = Math.min(hi, Math.max(t1, t2));
      };
      clip(dx, x1, p.xMin, p.xMax);
      clip(dy, y1, p.yMin, p.yMax);
      [x1, y1, x2, y2] = [s.x1 + lo * dx, s.y1 + lo * dy, s.x1 + hi * dx, s.y1 + hi * dy];
    }
    shapes.push({ t: 'line', x1: gx(x1), y1: gy(y1), x2: gx(x2), y2: gy(y2), w: 1.8, dash: s.dashed ? '5 3' : undefined, color });
    const mx = (gx(s.x1) + gx(s.x2)) / 2;
    const my = (gy(s.y1) + gy(s.y2)) / 2;
    const horizontal = s.y1 === s.y2;
    const side = s.labelBefore ? -1 : 1;
    const lx = horizontal ? mx : mx + side * 8;
    const ly = horizontal ? my + side * 16 : my;
    if (s.field) {
      shapes.push({ t: 'box', x: f1(horizontal ? lx - 20 : side > 0 ? lx : lx - 40), y: f1(horizontal ? ly - 11 : ly - 11), w: 40, h: 22, field: fieldId(s.field), s: shown(s.field, filled) });
    } else if (s.label) {
      shapes.push({ t: 'text', x: f1(lx), y: f1(ly + 4), s: s.label, size: 12, anchor: horizontal ? 'middle' : side > 0 ? 'start' : 'end', answer: !!color });
    }
  };
  const drawPoint = (q: CoordinatePlane_Point, color?: string) => {
    if (!inside(q.x, q.y)) {
      return;
    }
    shapes.push({ t: 'circle', cx: gx(q.x), cy: gy(q.y), r: 3.5, color });
    if (q.label) {
      shapes.push({ t: 'text', x: gx(q.x) + 6, y: gy(q.y) - 6, s: q.label, size: 13, anchor: 'start', answer: !!color });
    }
  };
  p.segments.forEach((s) => drawSegment(s));
  p.points.forEach((q) => drawPoint(q));
  if (filled) {
    p.answerSegments.forEach((s) => drawSegment(s, ANSWER_COLOR));
    p.answerPoints.forEach((q) => drawPoint(q, ANSWER_COLOR));
  }
  let height = gy(p.yMin) + (numbers ? 20 : axes ? 22 : 6);
  if (p.plotField) {
    const s = shown(p.plotField, filled);
    if (s) {
      shapes.push({ t: 'text', x: 0, y: height + 10, s, size: 12, anchor: 'start', answer: true });
    }
    height += 18;
  }
  return { width, height, shapes };
}

// numberScale draws a number line from start to end under the plot area,
// and returns where a value falls.
function numberScale(shapes: Shape[], start: number, end: number, step: number, y: number, caption: string): (v: number) => number {
  const span = Math.max(1, end - start);
  const unit = Math.min(48, 520 / span);
  const left = 20;
  const x = (v: number) => f1(left + (v - start) * unit);
  shapes.push({ t: 'line', x1: x(start) - 8, y1: y, x2: x(end) + 8, y2: y });
  for (let v = start; v <= end; v += step) {
    shapes.push({ t: 'line', x1: x(v), y1: y - 5, x2: x(v), y2: y + 5 }, { t: 'text', x: x(v), y: y + 20, s: String(v), size: 12 });
  }
  if (caption) {
    shapes.push({ t: 'text', x: (x(start) + x(end)) / 2, y: y + 38, s: caption, size: 12 });
  }
  return x;
}

export function boxPlot(b: BoxPlot, filled: boolean): Drawing {
  const shapes: Shape[] = [];
  const line = 78;
  const x = numberScale(shapes, b.start, b.end, b.step || 1, line, b.caption);
  const answer = b.drawField ? shown(b.drawField, filled) : 'drawn';
  if (answer) {
    const [t, m, bt] = [22, 39, 56];
    shapes.push(
      { t: 'line', x1: x(b.min), y1: m, x2: x(b.q1), y2: m },
      { t: 'line', x1: x(b.q3), y1: m, x2: x(b.max), y2: m },
      { t: 'line', x1: x(b.min), y1: t + 8, x2: x(b.min), y2: bt - 8 },
      { t: 'line', x1: x(b.max), y1: t + 8, x2: x(b.max), y2: bt - 8 },
      { t: 'rect', x: x(b.q1), y: t, w: f1(x(b.q3) - x(b.q1)), h: bt - t, fill: 'none' },
      { t: 'line', x1: x(b.median), y1: t, x2: x(b.median), y2: bt, w: 2 },
    );
  }
  return { width: f1(x(b.end) + 28), height: line + (b.caption ? 44 : 26), shapes };
}

export function histogram(h: Histogram): Drawing {
  const step = h.step || 1;
  const most = Math.max(step, ...h.bins.map((b) => b.count));
  const top = Math.ceil(most / step) * step;
  const plotTop = h.title ? 30 : 14;
  const plotH = 140;
  const left = 40;
  const bw = 54;
  const y = (v: number) => f1(plotTop + plotH - (v / top) * plotH);
  const shapes: Shape[] = [];
  if (h.title) {
    shapes.push({ t: 'text', x: left + (bw * h.bins.length) / 2, y: 16, s: h.title, size: 14 });
  }
  for (let v = 0; v <= top; v += step) {
    shapes.push({ t: 'line', x1: left, y1: y(v), x2: left + bw * h.bins.length, y2: y(v), w: v === 0 ? 1.5 : 0.4 });
    shapes.push({ t: 'text', x: left - 6, y: y(v) + 4, s: String(v), size: 11, anchor: 'end' });
  }
  shapes.push({ t: 'line', x1: left, y1: y(0), x2: left, y2: plotTop });
  h.bins.forEach((b, i) => {
    shapes.push({ t: 'rect', x: left + i * bw, y: y(b.count), w: bw, h: f1(y(0) - y(b.count)), fill: '#c8c8c8', sw: 1.2 });
    shapes.push({ t: 'text', x: left + i * bw + bw / 2, y: y(0) + 16, s: b.label, size: 11 });
  });
  if (h.valueAxis) {
    shapes.push({ t: 'text', x: 2, y: plotTop - 6, s: h.valueAxis, size: 11, anchor: 'start', italic: true });
  }
  return { width: left + bw * h.bins.length + 8, height: plotTop + plotH + 24, shapes };
}

export function prismNet(n: PrismNet): Drawing {
  const [l, w, h] = [n.length, n.width, n.height];
  const s = Math.min(16, 230 / (2 * w + l), 250 / (2 * w + 2 * h));
  const x0 = 2;
  const y0 = 2;
  const shapes: Shape[] = [];
  const face = (x: number, y: number, fw: number, fh: number, a: number, b: number) => {
    shapes.push({ t: 'rect', x: f1(x0 + x * s), y: f1(y0 + y * s), w: f1(fw * s), h: f1(fh * s), fill: 'none' });
    shapes.push({ t: 'text', x: f1(x0 + (x + fw / 2) * s), y: f1(y0 + (y + fh / 2) * s + 4), s: `${a} × ${b}`, size: 11 });
  };
  // The middle column: top, front, bottom and back, with the two ends
  // beside the front.
  face(w, 0, l, w, l, w);
  face(w, w, l, h, l, h);
  face(w, w + h, l, w, l, w);
  face(w, 2 * w + h, l, h, l, h);
  face(0, w, w, h, w, h);
  face(w + l, w, w, h, w, h);
  const width = f1(x0 * 2 + (2 * w + l) * s);
  shapes.push({ t: 'text', x: width + 6, y: 14, s: `Lengths in ${n.unit || 'units'}`, size: 11, anchor: 'start', italic: true });
  return { width: width + 110, height: f1(y0 * 2 + (2 * w + 2 * h) * s), shapes };
}

export function heightShape(p: HeightShape): Drawing {
  const pts = p.points;
  const apex = p.apex ?? pts[pts.length - 1];
  const xsAll = [...pts.map((q) => q.x), apex.x];
  const minX = Math.min(...xsAll);
  const maxX = Math.max(...xsAll);
  const maxY = Math.max(...pts.map((q) => q.y));
  const scale = Math.min(L.POLYGON_MAX_WIDTH / Math.max(1, maxX - minX), L.POLYGON_MAX_HEIGHT / Math.max(1, maxY), 22);
  const pad = 40;
  const top = 20;
  const X = (x: number) => f1(pad + (x - minX) * scale);
  const Y = (y: number) => f1(top + (maxY - y) * scale);
  const shapes: Shape[] = [{ t: 'path', d: 'M' + pts.map((q) => `${X(q.x)} ${Y(q.y)}`).join(' L') + ' Z', w: 2 }];
  const [b0, b1] = [pts[0], pts[1]];
  const foot = apex.x;
  if (foot < Math.min(b0.x, b1.x) || foot > Math.max(b0.x, b1.x)) {
    const near = Math.abs(foot - b0.x) < Math.abs(foot - b1.x) ? b0.x : b1.x;
    shapes.push({ t: 'line', x1: X(near), y1: Y(0), x2: X(foot), y2: Y(0), w: 1.2, dash: '4 3' });
  }
  shapes.push({ t: 'line', x1: X(foot), y1: Y(apex.y), x2: X(foot), y2: Y(0), w: 1.4, dash: '5 3' });
  const dir = foot >= (b0.x + b1.x) / 2 ? -1 : 1;
  shapes.push({ t: 'path', d: `M${X(foot) + dir * 9} ${Y(0)} L${X(foot) + dir * 9} ${Y(0) - 9} L${X(foot)} ${Y(0) - 9}`, w: 1.2 });
  shapes.push({ t: 'text', x: (X(b0.x) + X(b1.x)) / 2, y: Y(0) + 18, s: p.baseLabel, size: 13 });
  // The height's label goes on the side of the dashed line facing the
  // middle of the base, inside the shape.
  shapes.push({ t: 'text', x: X(foot) + dir * 6, y: (Y(apex.y) + Y(0)) / 2 + 4, s: p.heightLabel, size: 13, anchor: dir > 0 ? 'start' : 'end' });
  if (p.topLabel && pts.length >= 4) {
    shapes.push({ t: 'text', x: (X(pts[2].x) + X(pts[3].x)) / 2, y: Y(pts[2].y) - 7, s: p.topLabel, size: 13 });
  }
  p.sideLabels.forEach((s, i) => {
    const a = pts[(i + 1) % pts.length];
    const b = pts[(i + 2) % pts.length];
    if (s) {
      shapes.push({ t: 'text', x: (X(a.x) + X(b.x)) / 2 + 14, y: (Y(a.y) + Y(b.y)) / 2, s, size: 12, anchor: 'start' });
    }
  });
  return { width: f1(pad * 2 + (maxX - minX) * scale + 20), height: f1(top + maxY * scale + 26), shapes };
}

export function transversal(t: Transversal, filled: boolean): Drawing {
  const deg = t.degrees || 60;
  const [y1, y2] = [44, 134];
  const cx = 150;
  const cy = (y1 + y2) / 2;
  const shift = (y2 - y1) / 2 / Math.tan(rad(deg));
  const c1 = cx + shift;
  const c2 = cx - shift;
  const shapes: Shape[] = [
    { t: 'line', x1: 10, y1, x2: 290, y2: y1, w: 2 },
    { t: 'line', x1: 10, y1: y2, x2: 290, y2: y2, w: 2 },
  ];
  const ext = 34 / Math.sin(rad(deg));
  const ux = Math.cos(rad(deg));
  const uy = Math.sin(rad(deg));
  shapes.push({ t: 'line', x1: f1(c1 + ux * ext), y1: f1(y1 - uy * ext), x2: f1(c2 - ux * ext), y2: f1(y2 + uy * ext), w: 2 });
  // Arrow marks show the two lines are parallel.
  for (const y of [y1, y2]) {
    shapes.push({ t: 'path', d: `M262 ${y - 5} L270 ${y} L262 ${y + 5}`, w: 1.6 });
  }
  // The bisector of each of the four angles at a crossing.
  const mids = [deg / 2, (deg + 180) / 2, 180 + deg / 2, (deg + 540) / 2];
  for (const l of t.labels) {
    const [px, py] = l.position < 4 ? [c1, y1] : [c2, y2];
    const m = mids[l.position % 4];
    const lx = f1(px + 38 * Math.cos(rad(m)));
    const ly = f1(py - 24 * Math.sin(rad(m)));
    if (l.field) {
      shapes.push({ t: 'box', x: lx - 20, y: ly - 10, w: 40, h: 20, field: fieldId(l.field), s: shown(l.field, filled), size: 12 });
    } else {
      shapes.push({ t: 'text', x: lx, y: ly + 4, s: l.text, size: 13 });
    }
  }
  return { width: 300, height: 180, shapes };
}

function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`;
}

export function roundSolid(r: RoundSolid): Drawing {
  const shapes: Shape[] = [];
  const R = 46;
  const cx = 60;
  // The label sits at labelY, clear of any ellipse drawn through y.
  const radius = (y: number, labelY = y - 5) => {
    if (r.diameter) {
      shapes.push({ t: 'line', x1: cx - R, y1: y, x2: cx + R, y2: y, w: 1.4 }, { t: 'text', x: cx, y: labelY, s: r.radiusLabel, size: 12 });
    } else {
      shapes.push({ t: 'line', x1: cx, y1: y, x2: cx + R, y2: y, w: 1.4 }, { t: 'text', x: cx + R / 2, y: labelY, s: r.radiusLabel, size: 12 });
    }
    shapes.push({ t: 'circle', cx, cy: y, r: 2.5 });
  };
  const heightLabel = (ya: number, yb: number) => shapes.push({ t: 'text', x: cx + R + 8, y: (ya + yb) / 2 + 4, s: r.heightLabel, size: 12, anchor: 'start' });
  switch (r.kind) {
    case RoundSolid_Kind.CYLINDER: {
      const [top, bottom, ry] = [30, 120, 13];
      shapes.push({ t: 'path', d: ellipse(cx, top, R, ry), w: 1.8 }, { t: 'path', d: `M${cx - R} ${bottom} A${R} ${ry} 0 0 0 ${cx + R} ${bottom}`, w: 1.8 });
      shapes.push({ t: 'line', x1: cx - R, y1: top, x2: cx - R, y2: bottom, w: 1.8 }, { t: 'line', x1: cx + R, y1: top, x2: cx + R, y2: bottom, w: 1.8 });
      radius(top, top - ry - 4);
      heightLabel(top, bottom);
      return { width: 170, height: bottom + ry + 4, shapes };
    }
    case RoundSolid_Kind.CONE: {
      const [apex, base, ry] = [8, 110, 13];
      shapes.push({ t: 'path', d: ellipse(cx, base, R, ry), w: 1.8 });
      shapes.push({ t: 'line', x1: cx - R, y1: base, x2: cx, y2: apex, w: 1.8 }, { t: 'line', x1: cx + R, y1: base, x2: cx, y2: apex, w: 1.8 });
      shapes.push({ t: 'line', x1: cx, y1: apex, x2: cx, y2: base, w: 1.2, dash: '4 3' });
      radius(base, base + ry + 13);
      // Inside the cone, right of the dashed height and low enough that the
      // label clears the slanted side.
      shapes.push({ t: 'text', x: cx + 3, y: base - 18, s: r.heightLabel, size: 12, anchor: 'start' });
      return { width: 170, height: base + ry + 18, shapes };
    }
    default: {
      const cy = R + 6;
      shapes.push({ t: 'path', d: ellipse(cx, cy, R, R), w: 1.8 });
      if (r.kind === RoundSolid_Kind.SPHERE) {
        // The equator, below the radius so the label above stays clear.
        shapes.push({ t: 'path', d: `M${cx - R} ${cy} A${R} 12 0 0 0 ${cx + R} ${cy}`, w: 0.8 });
      }
      radius(cy);
      return { width: 170, height: 2 * R + 12, shapes };
    }
  }
}

export function boxSolid(b: BoxSolid): Drawing {
  const [l, w, h] = [b.length || 3, b.width || 2, b.height || 2];
  const s = Math.min(150 / (l + w * 0.6), 100 / (h + w * 0.4));
  const [dx, dy] = [w * s * 0.55, w * s * 0.35];
  const x0 = 46;
  const y0 = 8 + dy;
  const L_ = l * s;
  const H = h * s;
  const shapes: Shape[] = [
    { t: 'rect', x: f1(x0), y: f1(y0), w: f1(L_), h: f1(H), fill: 'none', sw: 1.8 },
    { t: 'path', d: `M${f1(x0)} ${f1(y0)} L${f1(x0 + dx)} ${f1(y0 - dy)} L${f1(x0 + L_ + dx)} ${f1(y0 - dy)} L${f1(x0 + L_)} ${f1(y0)}`, w: 1.8 },
    { t: 'path', d: `M${f1(x0 + L_ + dx)} ${f1(y0 - dy)} L${f1(x0 + L_ + dx)} ${f1(y0 + H - dy)} L${f1(x0 + L_)} ${f1(y0 + H)}`, w: 1.8 },
    { t: 'text', x: f1(x0 + L_ / 2), y: f1(y0 + H + 16), s: b.lengthLabel, size: 12 },
    { t: 'text', x: f1(x0 - 6), y: f1(y0 + H / 2 + 4), s: b.heightLabel, size: 12, anchor: 'end' },
    { t: 'text', x: f1(x0 + L_ + dx / 2 + 6), y: f1(y0 + H - dy / 2 + 12), s: b.widthLabel, size: 12, anchor: 'start' },
  ];
  return { width: f1(x0 + L_ + dx + 70), height: f1(y0 + H + 22), shapes };
}

// angleTriangle draws a triangle from its two base angles. Each corner gets
// an arc and its label on the angle's bisector, far enough in to clear the
// sides; an exterior angle runs the base on past the bottom right corner.
export function angleTriangle(t: AngleTriangle, filled: boolean): Drawing {
  const l = t.left || 60;
  const r = t.right || 60;
  // Math coordinates, y upward, base from (0, 0) to (base, 0). The base is
  // as long as fits a 320 px column and 150 px of height.
  const ext = t.exterior ? 70 : 0;
  const pad = 24;
  const reach = (b: number) => (b * Math.sin(rad(r))) / Math.sin(rad(l + r));
  const ax1 = reach(1) * Math.cos(rad(l));
  const span = Math.max(1, ax1) - Math.min(0, ax1);
  const base = Math.min(240, 150 / (reach(1) * Math.sin(rad(l))), (320 - 2 * pad - ext) / span);
  const d = reach(base);
  const apex = [d * Math.cos(rad(l)), d * Math.sin(rad(l))];
  const minX = Math.min(0, apex[0]);
  const maxX = Math.max(base + ext, apex[0]);
  const top = 26;
  const height = apex[1];
  const X = (x: number) => f1(pad + x - minX);
  const Y = (y: number) => f1(top + height - y);
  const shapes: Shape[] = [{ t: 'path', d: `M${X(0)} ${Y(0)} L${X(base)} ${Y(0)} L${X(apex[0])} ${Y(apex[1])} Z`, w: 2 }];
  if (t.exterior) {
    shapes.push({ t: 'line', x1: X(base), y1: Y(0), x2: X(base + ext), y2: Y(0), w: 2 });
  }
  // An arc at (vx, vy) from direction a1 to a2, counterclockwise, and the
  // label on its bisector.
  const corner = (vx: number, vy: number, a1: number, a2: number, label: Angle_ArcLabel | undefined, least = 30) => {
    if (!label || (!label.text && !label.field)) {
      return;
    }
    const ar = 16;
    const p1 = [X(vx + ar * Math.cos(rad(a1))), Y(vy + ar * Math.sin(rad(a1)))];
    const p2 = [X(vx + ar * Math.cos(rad(a2))), Y(vy + ar * Math.sin(rad(a2)))];
    shapes.push({ t: 'path', d: `M${p1[0]} ${p1[1]} A${ar} ${ar} 0 0 0 ${p2[0]} ${p2[1]}`, w: 1.2 });
    const half = (a2 - a1) / 2;
    // Far enough along the bisector that the label clears both sides: a
    // box needs more room than a number.
    const dist = Math.min(80, Math.max(least, (label.field ? 20 : 14) / Math.sin(rad(half))));
    const lx = X(vx + dist * Math.cos(rad(a1 + half)));
    const ly = Y(vy + dist * Math.sin(rad(a1 + half)));
    if (label.field) {
      shapes.push({ t: 'box', x: f1(lx - 22), y: f1(ly - 10), w: 44, h: 20, field: fieldId(label.field), s: shown(label.field, filled), size: 12 });
    } else {
      shapes.push({ t: 'text', x: lx, y: f1(ly + 4), s: label.text, size: 13 });
    }
  };
  const [lb, rb, tb] = t.labels;
  corner(0, 0, 0, l, lb);
  corner(base, 0, 180 - r, 180, rb);
  corner(apex[0], apex[1], 180 + l, 360 - r, tb);
  // The exterior label sits well out, so it reads as outside the triangle.
  corner(base, 0, 0, 180 - r, t.exterior, 44);
  return { width: f1(pad * 2 + maxX - minX), height: f1(top + height + 20), shapes };
}
