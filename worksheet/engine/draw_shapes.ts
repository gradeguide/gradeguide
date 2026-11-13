// Geometry for the shape widgets: shapes on a grid of unit squares, and
// fraction circles.
import { type FractionCircle, type GridShape } from '../proto/v1/nodes_pb.js';
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
