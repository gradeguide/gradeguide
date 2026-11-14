// Item kinds that use the shape widgets: area by counting unit squares,
// halves, thirds and fourths of a circle, naming quadrilaterals, and reading
// a measuring jug.
import { create } from '@bufbuild/protobuf';

import {
  type Node,
  ChoicesSchema,
  FractionCircleSchema,
  GridShape_CellSchema,
  GridShapeSchema,
  MeasuringJugSchema,
  Polygon_PointSchema,
  Polygon_SideLabelSchema,
  PolygonSchema,
} from '../proto/v1/nodes_pb.js';
import { type ItemKind, ClassifyShape_Family, ReadVolume_Unit } from '../proto/v1/worksheet_pb.js';
import { blank, fractionBlank, frac, math, node, row } from './build.js';
import { type Ctx, inRange, list, pickFresh } from './kinds.js';

export function generateShapes(kind: ItemKind, ctx: Ctx): Node[] | undefined {
  const { rng } = ctx;
  const k = kind.kind;
  switch (k.case) {
    case 'areaByCounting': {
      const [w, h, cutW, cutH] = pickFresh(ctx, k.case, () => {
        const w = inRange(rng, k.value.side, 2, 6);
        const h = inRange(rng, k.value.side, 2, 5);
        // An L: a corner of cutW by cutH squares taken off the top right.
        const l = k.value.lShapes && w > 2 && h > 2 && rng.int(0, 1) === 1;
        return l ? [w, h, rng.int(1, w - 2), rng.int(1, h - 2)] : [w, h, 0, 0];
      });
      const cells = [];
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          if (!(r < cutH && c >= w - cutW)) {
            cells.push(create(GridShape_CellSchema, { col: c + 1, row: r + 1 }));
          }
        }
      }
      return [
        node({ case: 'gridShape', value: create(GridShapeSchema, { cols: w + 2, rows: h + 2, cells }) }),
        math('Area =', blank(ctx.fields.field('area in square units', String(cells.length))), 'square units'),
      ];
    }
    case 'circleFraction': {
      const [d, n] = pickFresh(ctx, k.case + k.value.childShades, () => {
        const d = rng.pick(list(k.value.denominators, [2, 3, 4]));
        return [d, rng.int(1, d - 1)];
      });
      if (k.value.childShades) {
        return [
          math('Shade', [n, d], 'of the circle.'),
          node({ case: 'fractionCircle', value: create(FractionCircleSchema, { parts: d, shadeField: ctx.fields.field(`shade ${frac(n, d)}`, frac(n, d)) }) }),
        ];
      }
      return [
        node({ case: 'fractionCircle', value: create(FractionCircleSchema, { parts: d, shaded: n }) }),
        math(fractionBlank(ctx.fields.field('fraction shaded', frac(n, d))), 'is shaded.'),
      ];
    }
    case 'classifyShape': {
      if (k.value.family !== ClassifyShape_Family.QUADRILATERAL_NAMES) {
        return undefined;
      }
      const i = pickFresh(ctx, k.case + k.value.family, () => rng.int(0, NAMED_QUADS.length - 1));
      const [pts, names] = NAMED_QUADS[i];
      const sides = pts.map((p, j) => {
        const q = pts[(j + 1) % pts.length];
        return create(Polygon_SideLabelSchema, { text: `${Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]))} cm` });
      });
      const ask = (name: string, yes: boolean) =>
        row(math(`A ${name}?`), node({ case: 'choices', value: create(ChoicesSchema, { options: ['yes', 'no'], field: ctx.fields.field(`is it a ${name}`, yes ? 'yes' : 'no') }) }));
      return [
        node({
          case: 'polygon',
          value: create(PolygonSchema, { points: pts.map(([x, y]) => create(Polygon_PointSchema, { x, y })), sides, markRightAngles: true }),
        }),
        ask('rectangle', names.includes('rectangle')),
        ask('rhombus', names.includes('rhombus')),
        ask('square', names.includes('square')),
      ];
    }
    case 'readVolume': {
      const ml = k.value.unit === ReadVolume_Unit.MILLILITERS;
      const [capacity, step, labelled, unit, word] = ml ? [500, 50, 2, 'mL', 'milliliters'] : [10, 1, 2, 'L', 'liters'];
      const level = pickFresh(ctx, k.case + k.value.unit, () => step * rng.int(1, capacity / step - 1));
      return [
        node({ case: 'measuringJug', value: create(MeasuringJugSchema, { capacity, step, labelled, level, unit }) }),
        // The box is sized for the number and a short unit; the word is printed.
        math(blank(ctx.fields.field(`${word} in the jug`, String(level), [`${level} ${unit}`])), word),
      ];
    }
  }
  return undefined;
}

type Pts = [number, number][];

// Quadrilaterals with whole-number sides, in centimeters, and the names that
// fit each. A square turned on its corner is still a square.
const NAMED_QUADS: [Pts, string[]][] = [
  [[[0, 0], [4, 0], [4, 4], [0, 4]], ['rectangle', 'rhombus', 'square']],
  [[[0, 3], [4, 0], [7, 4], [3, 7]], ['rectangle', 'rhombus', 'square']],
  [[[0, 0], [7, 0], [7, 3], [0, 3]], ['rectangle']],
  [[[0, 0], [3, 0], [3, 5], [0, 5]], ['rectangle']],
  [[[0, 0], [5, 0], [8, 4], [3, 4]], ['rhombus']],
  [[[0, 0], [6, 0], [9, 4], [3, 4]], []],
  [[[0, 0], [9, 0], [6, 4], [3, 4]], []],
];

