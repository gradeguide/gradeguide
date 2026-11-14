// Geometry for the shape widgets: shapes on a grid of unit squares,
// fraction circles, and measuring jugs.
import { type FractionCircle, type GridShape, type MeasuringJug } from '../proto/v1/nodes_pb.js';
import { type Drawing, type Shape } from './drawing.js';
import { SHADE, fieldId } from './field.js';

// The side of a unit square, in pixels: large enough to count and to mark.
const UNIT = 26;

export function gridShape(g: GridShape): Drawing {
  const shapes: Shape[] = [];
  for (let r = 0; r <= g.rows; r++) {
    shapes.push({ t: 'line', x1: 2, y1: 2 + r * UNIT, x2: 2 + g.cols * UNIT, y2: 2 + r * UNIT, w: 0.6, dash: '2 3' });
  }
  for (let c = 0; c <= g.cols; c++) {
    shapes.push({ t: 'line', x1: 2 + c * UNIT, y1: 2, x2: 2 + c * UNIT, y2: 2 + g.rows * UNIT, w: 0.6, dash: '2 3' });
  }
  for (const cell of g.cells) {
    shapes.push({ t: 'rect', x: 2 + cell.col * UNIT, y: 2 + cell.row * UNIT, w: UNIT, h: UNIT, fill: SHADE, sw: 1.2 });
  }
  return { width: g.cols * UNIT + 4, height: g.rows * UNIT + 4, shapes };
}

const R = 46;

export function fractionCircle(f: FractionCircle): Drawing {
  const cx = R + 2;
  const cy = R + 2;
  const shapes: Shape[] = [];
  const at = (i: number): [number, number] => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / f.parts;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  };
  for (let i = 0; i < f.parts; i++) {
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const large = f.parts === 1 ? 1 : 0;
    const d = f.parts === 1 ? `M${cx - R} ${cy} a${R} ${R} 0 1 0 ${2 * R} 0 a${R} ${R} 0 1 0 ${-2 * R} 0` : `M${cx} ${cy} L${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
    shapes.push({ t: 'path', d, fill: i < f.shaded ? SHADE : 'white', w: 1.5 });
  }
  return { width: 2 * R + 4, height: 2 * R + 4, shapes };
}

// fieldOf is the field a fraction circle is, when the child shades it.
export function circleField(f: FractionCircle): string | null {
  return fieldId(f.shadeField);
}

// A jug's scale runs JUG_SCALE pixels from empty to full.
const JUG_SCALE = 160;

export function measuringJug(j: MeasuringJug): Drawing {
  const left = 44;
  const right = 120;
  const bottom = 184;
  const top = bottom - JUG_SCALE - 12;
  const at = (v: number) => bottom - (v / Math.max(1, j.capacity)) * JUG_SCALE;
  const shapes: Shape[] = [];
  if (j.level > 0) {
    shapes.push({ t: 'rect', x: left, y: at(j.level), w: right - left, h: bottom - at(j.level), fill: SHADE, sw: 0 });
  }
  // The jug: open at the top, with a lip on the right for pouring.
  shapes.push({ t: 'path', d: `M${left} ${top} L${left} ${bottom} L${right} ${bottom} L${right} ${top} L${right + 8} ${top - 6}`, w: 2 });
  const step = Math.max(1, j.step);
  const every = Math.max(1, j.labelled);
  for (let v = step, i = 1; v <= j.capacity; v += step, i++) {
    const y = at(v);
    const major = i % every === 0;
    shapes.push({ t: 'line', x1: left, y1: y, x2: left + (major ? 16 : 9), y2: y, w: major ? 1.4 : 1 });
    if (major) {
      shapes.push({ t: 'text', x: left - 5, y: y + 4, s: String(v), size: 12, anchor: 'end' });
    }
  }
  shapes.push({ t: 'text', x: (left + right) / 2, y: bottom + 16, s: j.unit, size: 12 });
  return { width: right + 14, height: bottom + 22, shapes };
}
