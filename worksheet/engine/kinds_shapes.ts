// Item kinds that use the shape widgets: area by counting unit squares, and
// halves, thirds and fourths of a circle.
import { create } from '@bufbuild/protobuf';

import { type Node, FractionCircleSchema, GridShape_CellSchema, GridShapeSchema } from '../proto/v1/nodes_pb.js';
import { type ItemKind } from '../proto/v1/worksheet_pb.js';
import { blank, fractionBlank, frac, math, node } from './build.js';
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
  }
  return undefined;
}

