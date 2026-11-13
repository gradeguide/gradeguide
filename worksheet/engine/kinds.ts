// Item generators. Each item kind picks its values from the ranges in its
// message and writes the item's nodes, with every answer computed here.
import { create } from '@bufbuild/protobuf';

import {
  type Node,
  AngleSchema,
  Angle_ArcLabelSchema,
  AreaModel_CellSchema,
  AreaModelSchema,
  BaseTenBlocksSchema,
  ClockSchema,
  LineFigure_Kind,
  LineFigureSchema,
  LinePlotSchema,
  LongDivisionSchema,
  NumberChartSchema,
  PlaceValueChart_ColumnSchema,
  PlaceValueChartSchema,
  ProtractorSchema,
  RulerSchema,
  ChoicesSchema,
  ColumnArithmetic_Op,
  BarGraph_BarSchema,
  BarGraphSchema,
  ColumnArithmetic_PartialSchema,
  ColumnArithmeticSchema,
  DataTable_CellSchema,
  DataTable_RowSchema,
  DataTableSchema,
  DotArraySchema,
  FractionBarSchema,
  FractionSchema,
  LinesSchema,
  NumberLine_TickBlankSchema,
  NumberLine_TickLabelSchema,
  NumberLineSchema,
  Polygon_PointSchema,
  Polygon_SideLabelSchema,
  PolygonSchema,
  TapeDiagram_TapeSchema,
  TapeDiagramSchema,
  UnitGridSchema,
} from '../proto/v1/nodes_pb.js';
import {
  type IntRange,
  type ItemKind,
  ClassifyShape_Family,
  ClockTime_Mode,
  UnitConversion_Conversion,
  CompareFractions_Mode,
  RectangleMeasure_Ask,
  ShadedFraction_Model,
} from '../proto/v1/worksheet_pb.js';
import {
  type AtomSpec,
  type Fields,
  blank,
  compare,
  frac,
  fractionBlank,
  gcd,
  halfBlank,
  math,
  node,
  row,
  text,
} from './build.js';
import { commas, mixed } from './draw.js';
import { generateShapes } from './kinds_shapes.js';
import { generateG68 } from './kinds_g68.js';
import { type Rng } from './rng.js';

// Ctx is what a generator gets: random numbers, field ids, and a check that
// an item is not already on the worksheet.
export interface Ctx {
  rng: Rng;
  fields: Fields;
  // fresh reports whether key has not been used on this worksheet, and
  // records it.
  fresh(key: string): boolean;
}

const tries = 40;

// pickFresh calls choose until it returns values whose key is fresh, or
// gives up and keeps the last ones. A narrow range can have fewer distinct
// items than a worksheet asks for.
export function pickFresh<T>(ctx: Ctx, kind: string, choose: () => T): T {
  let v = choose();
  for (let i = 0; i < tries && !ctx.fresh(kind + ':' + JSON.stringify(v)); i++) {
    v = choose();
  }
  return v;
}

export function inRange(rng: Rng, r: IntRange | undefined, lo: number, hi: number): number {
  return rng.int(r?.min || lo, r?.max || hi);
}

export function list(xs: readonly number[], fallback: number[]): readonly number[] {
  return xs.length > 0 ? xs : fallback;
}

// simplest gives the other names a fraction reading may also take.
export function simplest(n: number, d: number): string[] {
  const g = gcd(n, d);
  if (g === 1) {
    return [];
  }
  return d / g === 1 ? [String(n / g)] : [frac(n / g, d / g)];
}

export const names = ['Ana', 'Ben', 'Kai', 'Mia', 'Omar', 'Lena', 'Raj', 'Zoe'];

export function generate(kind: ItemKind, ctx: Ctx): Node[] {
  const shaped = generateShapes(kind, ctx);
  if (shaped) {
    return shaped;
  }
  const g68 = generateG68(kind, ctx);
  if (g68) {
    return g68;
  }
  const { rng } = ctx;
  const k = kind.kind;
  switch (k.case) {
    case 'fractionAtArrow': {
      const units = k.value.units || 1;
      const [d, t] = pickFresh(ctx, k.case, () => {
        const d = rng.pick(list(k.value.denominators, [2, 3, 4, 6, 8]));
        let t = rng.int(1, d * units - 1);
        while (t % d === 0) {
          t = rng.int(1, d * units - 1);
        }
        return [d, t];
      });
      return [
        node({ case: 'numberLine', value: create(NumberLineSchema, { start: 0, end: units, partsPerUnit: d, hasArrow: true, arrowTick: t }) }),
        math(fractionBlank(ctx.fields.field('the fraction at the arrow', frac(t, d), simplest(t, d)))),
      ];
    }
    case 'labelTicks': {
      const d = pickFresh(ctx, k.case, () => rng.pick(list(k.value.denominators, [3, 4, 5, 6])));
      const blanks = [];
      for (let i = 1; i < d; i++) {
        blanks.push(create(NumberLine_TickBlankSchema, { tick: i, field: ctx.fields.field(`the fraction at mark ${i}`, frac(i, d), simplest(i, d)) }));
      }
      return [node({ case: 'numberLine', value: create(NumberLineSchema, { start: 0, end: 1, partsPerUnit: d, blanks }) })];
    }
    case 'equivalentOnNumberLines': {
      const [d, n, a] = pickFresh(ctx, k.case, () => {
        const d = rng.pick(list(k.value.denominators, [2, 3, 4]));
        return [d, rng.pick(list(k.value.factors, [2, 3])), reduced(rng, d)];
      });
      const label = create(NumberLine_TickLabelSchema, { tick: a, value: { case: 'fraction', value: create(FractionSchema, { num: a, den: d }) } });
      return [
        node({ case: 'numberLine', value: create(NumberLineSchema, { start: 0, end: 1, partsPerUnit: d, hasArrow: true, arrowTick: a, labels: [label] }) }),
        node({ case: 'numberLine', value: create(NumberLineSchema, { start: 0, end: 1, partsPerUnit: n * d, hasArrow: true, arrowTick: a * n }) }),
        math([a, d], '=', halfBlank(n * d, true, ctx.fields.field(`numerator of the fraction equal to ${frac(a, d)}`, String(a * n)))),
      ];
    }
    case 'shadedFraction': {
      const [d, s] = pickFresh(ctx, k.case, () => {
        const d = rng.pick(list(k.value.denominators, [2, 3, 4, 6, 8]));
        return [d, rng.int(1, d - 1)];
      });
      if (k.value.childShades) {
        const f = ctx.fields.field(`shading of ${frac(s, d)}`, `${s} of ${d} parts shaded`);
        return [math('Shade', [s, d]), node({ case: 'fractionBar', value: create(FractionBarSchema, { parts: d, shadeField: f }) })];
      }
      const answer = ctx.fields.field('the shaded fraction', frac(s, d), simplest(s, d));
      if (k.value.model === ShadedFraction_Model.GRID && d % 2 === 0 && d > 2) {
        return [node({ case: 'unitGrid', value: create(UnitGridSchema, { rows: 2, cols: d / 2, shaded: s }) }), math(fractionBlank(answer))];
      }
      const shaded = Array.from({ length: s }, (_, i) => i);
      return [node({ case: 'fractionBar', value: create(FractionBarSchema, { parts: d, shaded }) }), math(fractionBlank(answer))];
    }
    case 'equivalentMissing': {
      const [d, n, a, top] = pickFresh(ctx, k.case, () => {
        const d = rng.pick(list(k.value.denominators, [2, 3, 4, 5, 6]));
        return [d, rng.pick(list(k.value.factors, [2, 3, 4])), reduced(rng, d), !k.value.mixBlankSide || rng.next() < 0.5] as const;
      });
      const f = top
        ? halfBlank(n * d, true, ctx.fields.field(`numerator equal to ${frac(a, d)}`, String(a * n)))
        : halfBlank(a * n, false, ctx.fields.field(`denominator equal to ${frac(a, d)}`, String(n * d)));
      return [math([a, d], '=', f)];
    }
    case 'compareFractions': {
      const mode = k.value.mode || CompareFractions_Mode.ANY;
      const ds = list(k.value.denominators, [2, 3, 4, 6, 8]);
      const [a, b, c, d] = pickFresh(ctx, k.case, () => {
        if (mode === CompareFractions_Mode.SAME_DENOMINATOR) {
          const d = rng.pick(ds.filter((x) => x > 2).length ? ds.filter((x) => x > 2) : ds);
          const a = rng.int(1, d - 1);
          let c = rng.int(1, d - 1);
          while (c === a && d > 2) {
            c = rng.int(1, d - 1);
          }
          return [a, d, c, d];
        }
        if (mode === CompareFractions_Mode.SAME_NUMERATOR) {
          const b = rng.pick(ds);
          let d = rng.pick(ds);
          while (d === b) {
            d = rng.pick(ds);
          }
          const n = rng.int(1, Math.min(b, d) - 1);
          return [n, b, n, d];
        }
        // Any two different fractions; equivalent pairs are allowed, the
        // same fraction twice is not.
        for (;;) {
          const b = rng.pick(ds);
          const d = rng.pick(ds);
          const a = rng.int(1, b - 1);
          const c = rng.int(1, d - 1);
          if (a !== c || b !== d) {
            return [a, b, c, d];
          }
        }
      });
      const lhs = a * d;
      const rhs = c * b;
      const sign = lhs > rhs ? '>' : lhs < rhs ? '<' : '=';
      return [math([a, b], compare(ctx.fields.field(`<, > or = between ${frac(a, b)} and ${frac(c, d)}`, sign)), [c, d])];
    }
    case 'hundredthsGrid': {
      const n = pickFresh(ctx, k.case, () => (k.value.tenths ? 10 * rng.int(1, 9) : rng.int(1, 99)));
      const dec = `0.${String(n).padStart(2, '0')}`;
      const fracAlso = simplest(n, 100);
      if (n % 10 === 0) {
        fracAlso.push(frac(n / 10, 10));
      }
      const decAlso = n % 10 === 0 ? [`0.${n / 10}`] : [];
      return [
        node({ case: 'unitGrid', value: create(UnitGridSchema, { rows: 10, cols: 10, shaded: n }) }),
        math(fractionBlank(ctx.fields.field('the shaded part as a fraction', frac(n, 100), fracAlso)), '=', blank(ctx.fields.field('the shaded part as a decimal', dec, decAlso))),
      ];
    }
    case 'arrayFacts': {
      const [r, c] = pickFresh(ctx, k.case, () => [inRange(rng, k.value.rows, 2, 6), inRange(rng, k.value.cols, 2, 8)]);
      const f = ctx.fields;
      return [
        node({ case: 'dotArray', value: create(DotArraySchema, { rows: r, cols: c }) }),
        math(blank(f.field('rows', String(r))), '×', blank(f.field('columns', String(c))), '=', blank(f.field('dots', String(r * c)))),
        math(blank(f.field('dots', String(r * c))), '÷', blank(f.field('rows', String(r))), '=', blank(f.field('in each row', String(c)))),
      ];
    }
    case 'areaModelMultiply': {
      const ad = k.value.aDigits || 2;
      const bd = k.value.bDigits || 1;
      const [a, b] = pickFresh(ctx, k.case, () => [numberWithDigits(rng, ad), numberWithDigits(rng, bd)]);
      const cols = places(a);
      const rows = places(b);
      const cells = [];
      for (const r of rows) {
        for (const c of cols) {
          cells.push(create(AreaModel_CellSchema, { field: ctx.fields.field(`${r} × ${c}`, String(r * c)) }));
        }
      }
      return [
        node({ case: 'areaModel', value: create(AreaModelSchema, { rowParts: rows, colParts: cols, cells }) }),
        math(a, '×', b, '=', blank(ctx.fields.field(`${a} × ${b}`, String(a * b)))),
      ];
    }
    case 'columnAddSubtract': {
      const digits = k.value.digits || 3;
      const [x, y] = pickFresh(ctx, k.case, () => {
        for (;;) {
          let x = numberWithDigits(rng, digits, true);
          let y = numberWithDigits(rng, digits, true);
          if (k.value.subtract && y > x) {
            [x, y] = [y, x];
          }
          if (x === y) {
            continue;
          }
          if (!k.value.regroup || regroups(x, y, k.value.subtract)) {
            return [x, y];
          }
        }
      });
      const op = k.value.subtract ? ColumnArithmetic_Op.SUBTRACT : ColumnArithmetic_Op.ADD;
      const result = k.value.subtract ? x - y : x + y;
      const label = k.value.subtract ? `${x} − ${y}` : `${x} + ${y}`;
      return [
        node({
          case: 'columnArithmetic',
          value: create(ColumnArithmeticSchema, { op, operands: [BigInt(x), BigInt(y)], carryBoxes: true, answer: ctx.fields.field(label, String(result)) }),
        }),
      ];
    }
    case 'columnMultiply': {
      const [x, y] = pickFresh(ctx, k.case, () => [numberWithDigits(rng, k.value.topDigits || 3, true), rng.int(2, 9)]);
      return [
        node({
          case: 'columnArithmetic',
          value: create(ColumnArithmeticSchema, {
            op: ColumnArithmetic_Op.MULTIPLY,
            operands: [BigInt(x), BigInt(y)],
            carryBoxes: true,
            answer: ctx.fields.field(`${x} × ${y}`, String(x * y)),
          }),
        }),
      ];
    }
    case 'multiplyByTens': {
      const [a, b, p] = pickFresh(ctx, k.case, () => [
        inRange(rng, k.value.factors, 2, 9),
        inRange(rng, k.value.factors, 2, 9),
        rng.pick(list(k.value.places, [10, 100])),
      ]);
      const unit = p === 10 ? 'tens' : p === 100 ? 'hundreds' : 'thousands';
      const f = ctx.fields;
      return [
        math(a, '×', b * p, '=', a, '×', b, unit),
        math('=', blank(f.field(`${a} × ${b} ${unit}`, String(a * b))), unit, '=', blank(f.field(`${a} × ${b * p}`, String(a * b * p)))),
      ];
    }
    case 'breakApart': {
      const [a, b, first] = pickFresh(ctx, k.case, () => {
        const b = inRange(rng, k.value.factors, 6, 9);
        // Break at 5 when it splits b, else at 2.
        return [inRange(rng, k.value.factors, 6, 9), b, b > 5 ? 5 : 2];
      });
      const second = b - first;
      const f = ctx.fields;
      return [
        math(a, '×', b, '=', a, '×', first, '+', a, '×', blank(f.field(`${b} − ${first}`, String(second)))),
        math('=', blank(f.field(`${a} × ${first}`, String(a * first))), '+', blank(f.field(`${a} × ${second}`, String(a * second))), '=', blank(f.field(`${a} × ${b}`, String(a * b)))),
      ];
    }
    case 'partialProducts': {
      const [x, y] = pickFresh(ctx, k.case, () => [numberWithDigits(rng, k.value.topDigits || 2), rng.int(3, 9)]);
      // Smallest place first, the order the standard algorithm works in.
      const partials = places(x)
        .reverse()
        .map((part) => create(ColumnArithmetic_PartialSchema, { field: ctx.fields.field(`${y} × ${part}`, String(y * part)), note: `${y} × ${commas(part)}` }));
      return [
        node({
          case: 'columnArithmetic',
          value: create(ColumnArithmeticSchema, {
            op: ColumnArithmetic_Op.MULTIPLY,
            operands: [BigInt(x), BigInt(y)],
            partials,
            answer: ctx.fields.field(`${x} × ${y}`, String(x * y)),
          }),
        }),
      ];
    }
    case 'timesAsManyStatement': {
      const [t, sm, form] = pickFresh(ctx, k.case, () => [inRange(rng, k.value.times, 2, 9), inRange(rng, k.value.smaller, 2, 9), rng.int(0, 2)]);
      const p = t * sm;
      const f = ctx.fields;
      switch (form) {
        case 0:
          return [math(blank(f.field(`${t} times as many as ${sm}`, String(p))), `is ${t} times as many as ${sm}.`), math(blank(f.field(`${t} × ${sm}`, String(p))), '=', t, '×', sm)];
        case 1:
          return [math(`${p} is`, blank(f.field(`how many times ${sm}`, String(t))), `times as many as ${sm}.`), math(p, '=', blank(f.field(`${p} ÷ ${sm}`, String(t))), '×', sm)];
        default:
          return [math(`${p} is ${t} times as many as`, blank(f.field(`${p} ÷ ${t}`, String(sm)))), math(p, '=', t, '×', blank(f.field(`${p} ÷ ${t}`, String(sm))))];
      }
    }
    case 'numberPattern': {
      const [a, d] = pickFresh(ctx, k.case + k.value.findRule, () => [inRange(rng, k.value.start, 1, 20), inRange(rng, k.value.step, 2, 9)]);
      const terms = Array.from({ length: 6 }, (_, i) => a + i * d);
      const f = ctx.fields;
      if (k.value.findRule) {
        return [math(...terms.slice(0, 5).flatMap((x, i) => (i ? [',', x] : [x]))), math('Rule: add', blank(f.field(`the rule for ${terms.slice(0, 3).join(', ')}`, String(d))))];
      }
      const atoms: AtomSpec[] = [];
      terms.forEach((x, i) => {
        if (i) {
          atoms.push(',');
        }
        atoms.push(i < 3 ? x : blank(f.field(`term ${i + 1}`, String(x))));
      });
      return [text(`Rule: start at ${a}, add ${d}.`), math(...atoms)];
    }
    case 'fractionAddSubtract': {
      const ds = list(k.value.denominators, [3, 4, 5, 6, 8, 10, 12]);
      const sub = k.value.subtract;
      const f = ctx.fields;
      if (k.value.mixed) {
        const [d, w1, a, w2, b] = pickFresh(ctx, k.case + sub + 'm', () => {
          for (;;) {
            const d = rng.pick(ds);
            const w1 = rng.int(1, 4);
            const a = rng.int(1, d - 1);
            const w2 = rng.int(1, 3);
            const b = rng.int(1, d - 1);
            if (!sub || w1 * d + a > w2 * d + b) {
              return [d, w1, a, w2, b];
            }
          }
        });
        const n = sub ? w1 * d + a - (w2 * d + b) : w1 * d + a + w2 * d + b;
        const op = sub ? '−' : '+';
        const answer = mixedOf(n, d);
        return [math(w1, [a, d], op, w2, [b, d], '=', blank(f.field(`${w1} ${a}/${d} ${op} ${w2} ${b}/${d}`, answer, unique([frac(n, d), mixed(n, d)]).filter((x) => x !== answer))))];
      }
      const [d, a, b] = pickFresh(ctx, k.case + sub, () => {
        const d = rng.pick(ds);
        let a = rng.int(1, d - 1);
        let b = rng.int(1, d - 1);
        if (sub && a === b) {
          a = Math.min(d - 1, a + 1);
          b = Math.max(1, b - 1);
        }
        return sub && b > a ? [d, b, a] : [d, a, b];
      });
      const n = sub ? a - b : a + b;
      const answer = frac(n, d);
      return [math([a, d], sub ? '−' : '+', [b, d], '=', fractionBlank(f.field(`${frac(a, d)} ${sub ? '−' : '+'} ${frac(b, d)}`, answer, unique([mixedOf(n, d), mixed(n, d), ...simplest(n, d)]).filter((x) => x !== answer))))];
    }
    case 'decomposeFraction': {
      const [d, a, b] = pickFresh(ctx, k.case, () => {
        const d = rng.pick(list(k.value.denominators, [4, 5, 6, 8, 10]));
        const a = rng.int(2, d);
        return [d, a, rng.int(1, a - 1)];
      });
      return [math([a, d], '=', [b, d], '+', halfBlank(d, true, ctx.fields.field(`${frac(a, d)} − ${frac(b, d)}`, String(a - b))))];
    }
    case 'fractionTimesWhole': {
      const [d, a, n] = pickFresh(ctx, k.case, () => {
        const d = rng.pick(list(k.value.denominators, [3, 4, 5, 6, 8]));
        return [d, rng.int(1, d - 1), inRange(rng, k.value.wholes, 2, 5)];
      });
      const bars = Array.from({ length: n }, () =>
        node({ case: 'fractionBar', value: create(FractionBarSchema, { parts: d, shaded: Array.from({ length: a }, (_, i) => i) }) }),
      );
      const answer = frac(n * a, d);
      return [row(...bars), math(n, '×', [a, d], '=', fractionBlank(ctx.fields.field(`${n} × ${frac(a, d)}`, answer, unique([mixedOf(n * a, d), mixed(n * a, d), ...simplest(n * a, d)]).filter((x) => x !== answer))))];
    }
    case 'compareDecimals': {
      const [t, h, flip] = pickFresh(ctx, k.case, () => [rng.int(1, 9), rng.int(1, 99), rng.int(0, 1)]);
      const left = `0.${t}`;
      const right = `0.${String(h).padStart(2, '0')}`;
      const [x, y, xs, ys] = flip ? [h, t * 10, right, left] : [t * 10, h, left, right];
      const sign = x > y ? '>' : x < y ? '<' : '=';
      return [math(xs, compare(ctx.fields.field(`<, > or = between ${xs} and ${ys}`, sign)), ys)];
    }
    case 'unitConversion': {
      const conv = pickFresh(ctx, k.case, () => rng.pick(list(k.value.conversions, [1, 2, 3, 5, 6])));
      const [big, small, per] = CONVERSIONS[conv as UnitConversion_Conversion] ?? CONVERSIONS[UnitConversion_Conversion.FEET_INCHES];
      const rows = [1, 2, 3, 5, rng.pick([6, 8, 10])].map((n, i) =>
        create(DataTable_RowSchema, {
          cells: [
            create(DataTable_CellSchema, { kind: { case: 'text', value: String(n) } }),
            i === 0
              ? create(DataTable_CellSchema, { kind: { case: 'text', value: commas(n * per) } })
              : create(DataTable_CellSchema, { kind: { case: 'field', value: ctx.fields.field(`${n} ${big} in ${small}`, String(n * per), n * per >= 1000 ? [commas(n * per)] : []) } }),
          ],
        }),
      );
      return [
        text(`1 ${big.replace(/s$/, '').replace(/^feet$/, 'foot')} is ${commas(per)} ${small}.`),
        node({ case: 'dataTable', value: create(DataTableSchema, { header: [cap(big), cap(small)], rows }) }),
      ];
    }
    case 'angleTurn': {
      // Fresh by what is asked, so no turn or angle appears twice.
      const [form, i, deg] = pickFresh(ctx, k.case, () => {
        const form = rng.int(0, 1);
        return form === 0 ? [0, rng.int(0, 3), 0] : [1, 0, 5 * rng.int(3, 34)];
      });
      if (form === 0) {
        const [name, degrees] = [
          ['quarter', 90],
          ['half', 180],
          ['three-quarter', 270],
          ['full', 360],
        ][i] as [string, number];
        return [math(`A ${name} turn is`, blank(ctx.fields.field(`degrees in a ${name} turn`, String(degrees), [`${degrees}°`])), 'degrees.')];
      }
      return [
        node({ case: 'angle', value: create(AngleSchema, { rotation: 0, rays: [deg], arcs: [create(Angle_ArcLabelSchema, { text: `${deg}°` })] }) }),
        math('It turns through', blank(ctx.fields.field(`one-degree angles in ${deg}°`, String(deg))), 'one-degree angles.'),
      ];
    }
    case 'classifyShape': {
      const family = k.value.family || ClassifyShape_Family.TRIANGLES;
      const f = ctx.fields;
      if (family === ClassifyShape_Family.TRIANGLES) {
        // Fresh by kind alone, so a set shows each kind before repeating one.
        const kind = pickFresh(ctx, k.case + family, () => rng.int(0, 2));
        const [w, h] = [rng.int(5, 7), rng.int(3, 5)];
        const triangles: Pts[] = [
          [[0, 0], [w, 0], [w / 2 - 0.5, h + 1]],
          [[0, 0], [w, 0], [0, h]],
          [[2, 0], [w + 2, 0], [0, h - 1]],
        ];
        const pts = triangles[kind];
        const names = ['acute', 'right', 'obtuse'];
        return [
          node({ case: 'polygon', value: create(PolygonSchema, { points: big(pts), markRightAngles: kind === 1 }) }),
          node({ case: 'choices', value: create(ChoicesSchema, { options: names, field: f.field('kind of triangle', names[kind]) }) }),
        ];
      }
      const i = pickFresh(ctx, k.case + family, () => rng.int(0, QUADS.length - 1));
      const [pts, parallel, right] = QUADS[i];
      return [
        node({ case: 'polygon', value: create(PolygonSchema, { points: big(pts) }) }),
        math('Parallel pairs:', blank(f.field('pairs of parallel sides', String(parallel)))),
        math('Right angles:', blank(f.field('right angles', String(right)))),
      ];
    }
    case 'linesOfSymmetry': {
      const i = pickFresh(ctx, k.case, () => rng.int(0, SYMMETRIC.length - 1));
      const [pts, lines] = SYMMETRIC[i];
      return [
        node({ case: 'polygon', value: create(PolygonSchema, { points: big(pts) }) }),
        math('Lines of symmetry:', blank(ctx.fields.field('lines of symmetry', String(lines)))),
      ];
    }
    case 'missingFactor': {
      const [a, b, form] = pickFresh(ctx, k.case, () => [inRange(rng, k.value.factors, 2, 9), inRange(rng, k.value.factors, 2, 9), rng.int(0, 2)]);
      const p = a * b;
      const f = ctx.fields;
      switch (form) {
        case 0:
          return [math(blank(f.field(`${p} ÷ ${b}`, String(a))), '×', b, '=', p)];
        case 1:
          return [math(a, '×', blank(f.field(`${p} ÷ ${a}`, String(b))), '=', p)];
        default:
          return [math(p, '÷', blank(f.field(`${p} ÷ ${b}`, String(a))), '=', b)];
      }
    }
    case 'barGraphQuestions': {
      const [theme, values] = pickFresh(ctx, k.case, () => {
        const theme = rng.int(0, GRAPH_THEMES.length - 1);
        const vs: number[] = [];
        while (vs.length < 4) {
          const v = inRange(rng, k.value.values, 2, 12);
          if (!vs.includes(v)) {
            vs.push(v);
          }
        }
        return [theme, vs];
      });
      const [title, axis, labels, noun] = GRAPH_THEMES[theme];
      const bars = labels.map((label, i) => create(BarGraph_BarSchema, { label, value: values[i] }));
      const hi = values.indexOf(Math.max(...values));
      const lo = values.indexOf(Math.min(...values));
      const f = ctx.fields;
      return [
        node({ case: 'barGraph', value: create(BarGraphSchema, { title, valueAxis: axis, step: k.value.step, bars }) }),
        math(`How many ${noun} for ${labels[0]}?`, blank(f.field(`${noun} for ${labels[0]}`, String(values[0])))),
        math(`How many more for ${labels[hi]} than for ${labels[lo]}?`, blank(f.field(`${labels[hi]} minus ${labels[lo]}`, String(values[hi] - values[lo])))),
        math(`How many ${noun} in all?`, blank(f.field(`total ${noun}`, String(values.reduce((x, y) => x + y, 0))))),
      ];
    }
    case 'timesAsMany': {
      const [t, s, i] = pickFresh(ctx, k.case, () => [inRange(rng, k.value.times, 2, 5), inRange(rng, k.value.smaller, 2, 9), rng.int(0, names.length - 2)]);
      const small = names[i];
      const big = names[i + 1];
      return [
        text(`${small} has ${s} shells. ${big} has ${t} times as many. How many shells does ${big} have?`),
        node({
          case: 'tapeDiagram',
          value: create(TapeDiagramSchema, {
            tapes: [
              create(TapeDiagram_TapeSchema, { name: small, units: 1, unitText: String(s) }),
              create(TapeDiagram_TapeSchema, { name: big, units: t, unitText: String(s), totalField: ctx.fields.field(`shells ${big} has`, String(s * t)) }),
            ],
          }),
        }),
      ];
    }
    case 'classifyAngle': {
      const [deg, rot] = pickFresh(ctx, k.case, () => {
        const kind = rng.int(0, 2);
        const deg = kind === 0 ? 5 * rng.int(4, 16) : kind === 1 ? 90 : 5 * rng.int(20, 32);
        return [deg, 5 * rng.int(0, 8)];
      });
      const answer = deg < 90 ? 'acute' : deg === 90 ? 'right' : 'obtuse';
      return [
        node({ case: 'angle', value: create(AngleSchema, { rotation: rot, rays: [deg], markRightAngles: true }) }),
        node({ case: 'choices', value: create(ChoicesSchema, { options: ['acute', 'right', 'obtuse'], field: ctx.fields.field('kind of angle', answer) }) }),
      ];
    }
    case 'missingAngle': {
      const [whole, part] = pickFresh(ctx, k.case, () => {
        const whole = rng.pick(list(k.value.wholes, [90, 180]));
        return [whole, 5 * rng.int(3, whole / 5 - 3)];
      });
      return [
        text(whole === 90 ? 'The whole angle is a right angle, 90°.' : 'The rays make a straight line, 180°.'),
        node({
          case: 'angle',
          value: create(AngleSchema, {
            rotation: 0,
            rays: [part, whole],
            arcs: [
              create(Angle_ArcLabelSchema, { text: `${part}°` }),
              create(Angle_ArcLabelSchema, { field: ctx.fields.field(`the angle that makes ${whole}° with ${part}°`, `${whole - part}°`, [String(whole - part)]) }),
            ],
          }),
        }),
      ];
    }
    case 'rectangleMeasure': {
      const ask = k.value.ask || RectangleMeasure_Ask.PERIMETER;
      const [w, h] = pickFresh(ctx, k.case + ask, () => {
        const w = inRange(rng, k.value.side, 2, 12);
        let h = inRange(rng, k.value.side, 2, 12);
        while (h === w) {
          h = inRange(rng, k.value.side, 2, 12);
        }
        return [Math.max(w, h), Math.min(w, h)];
      });
      const pts = [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ].map(([x, y]) => create(Polygon_PointSchema, { x, y }));
      const side = (t: string) => create(Polygon_SideLabelSchema, { text: t });
      if (ask === RectangleMeasure_Ask.MISSING_SIDE) {
        const f = ctx.fields.field('the missing side', `${h} cm`, [String(h)]);
        return [
          text(`Area = ${w * h} square cm`),
          node({ case: 'polygon', value: create(PolygonSchema, { points: pts, sides: [side(`${w} cm`), create(Polygon_SideLabelSchema, { field: f }), side(''), side('')], markRightAngles: true }) }),
        ];
      }
      const shape = node({ case: 'polygon', value: create(PolygonSchema, { points: pts, sides: [side(`${w} cm`), side(`${h} cm`), side(''), side('')], markRightAngles: true }) });
      if (ask === RectangleMeasure_Ask.AREA) {
        return [shape, math('Area =', blank(ctx.fields.field('area in square cm', String(w * h))), 'sq cm')];
      }
      return [shape, math('Perimeter =', blank(ctx.fields.field('perimeter in cm', String(2 * (w + h)))), 'cm')];
    }
    case 'multiplicationFact': {
      const [a, b] = pickFresh(ctx, k.case + k.value.division, () => [inRange(rng, k.value.factors, 2, 9), inRange(rng, k.value.factors, 2, 9)]);
      if (k.value.division) {
        return [math(a * b, '÷', a, '=', blank(ctx.fields.field(`${a * b} ÷ ${a}`, String(b))))];
      }
      return [math(a, '×', b, '=', blank(ctx.fields.field(`${a} × ${b}`, String(a * b))))];
    }
    case 'findMistakeNumberLine': {
      const [d, i] = pickFresh(ctx, k.case, () => [rng.pick(list(k.value.denominators, [3, 4, 5, 6])), rng.int(0, names.length - 1)]);
      const wrong = create(NumberLine_TickLabelSchema, { tick: 1, value: { case: 'text', value: frac(1, d + 1) }, wrong: true });
      return [
        node({ case: 'numberLine', value: create(NumberLineSchema, { start: 0, end: 1, partsPerUnit: d, labels: [wrong] }) }),
        text(`${names[i]} labeled the first mark ${frac(1, d + 1)} because there are ${d + 1} marks. What should it be?`),
        math(fractionBlank(ctx.fields.field('the right label for the first mark', frac(1, d)))),
        node({
          case: 'lines',
          value: create(LinesSchema, {
            count: 2,
            field: ctx.fields.field('why', `There are ${d} equal jumps from 0 to 1, so each jump is ${frac(1, d)}. Count the jumps, not the marks.`),
          }),
        }),
      ];
    }
    case 'placeValueRead': {
      const digits = Math.min(6, Math.max(4, k.value.digits || 5));
      const [n, p] = pickFresh(ctx, k.case, () => {
        for (;;) {
          const n = numberWithDigits(rng, digits, true);
          const ds = String(n);
          // Ask about a nonzero digit that appears once, so "the 7" is clear.
          const ok = [...ds].map((c, i) => i).filter((i) => ds[i] !== '0' && ds.indexOf(ds[i]) === ds.lastIndexOf(ds[i]) && i < ds.length - 1);
          if (ok.length) {
            return [n, rng.pick(ok)];
          }
        }
      });
      const ds = String(n);
      const columns = ds.split('').map((c, i) => create(PlaceValueChart_ColumnSchema, { name: placeNames[ds.length - 1 - i], digit: c }));
      const value = Number(ds[p]) * 10 ** (ds.length - 1 - p);
      return [
        node({ case: 'placeValueChart', value: create(PlaceValueChartSchema, { columns }) }),
        math('The number is', blank(ctx.fields.field('the number in the chart', commas(n), [String(n)]))),
        math(`The ${ds[p]} is worth`, blank(ctx.fields.field(`value of the ${ds[p]}`, commas(value), [String(value)]))),
      ];
    }
    case 'baseTenRead': {
      const [th, h, t, o] = pickFresh(ctx, k.case, () => [k.value.thousands ? rng.int(1, 3) : 0, rng.int(1, 4), rng.int(0, 9), rng.int(0, 9)]);
      const n = th * 1000 + h * 100 + t * 10 + o;
      return [
        node({ case: 'baseTenBlocks', value: create(BaseTenBlocksSchema, { thousands: th, hundreds: h, tens: t, ones: o }) }),
        math('The blocks show', blank(ctx.fields.field('the number the blocks show', commas(n), [String(n)]))),
      ];
    }
    case 'roundOnNumberLine': {
      const digits = k.value.digits || 4;
      const [n, place] = pickFresh(ctx, k.case, () => {
        const place = rng.pick(list(k.value.places, [10, 100, 1000]).filter((pl) => pl < 10 ** digits));
        for (;;) {
          const n = numberWithDigits(rng, digits, true);
          const step = place / 10;
          const m = Math.round(n / step) * step;
          if (m % place !== 0 && m >= 10 ** (digits - 1)) {
            return [m, place];
          }
        }
      });
      const lower = Math.floor(n / place) * place;
      const rounded = n - lower >= place / 2 ? lower + place : lower;
      return [
        text(`Round ${commas(n)} to the nearest ${placeName[Math.log10(place)]}.`),
        node({ case: 'numberLine', value: create(NumberLineSchema, { start: lower / place, end: lower / place + 1, partsPerUnit: 10, scale: place, hasArrow: true, arrowTick: (n - lower) / (place / 10) }) }),
        math(commas(n), '≈', blank(ctx.fields.field(`${commas(n)} rounded to the nearest ${placeName[Math.log10(place)]}`, commas(rounded), [String(rounded)]))),
      ];
    }
    case 'longDivision': {
      const digits = k.value.dividendDigits || 3;
      const [q, d, r] = pickFresh(ctx, k.case, () => {
        for (;;) {
          const d = rng.int(2, 9);
          const r = k.value.remainders && rng.next() < 0.6 ? rng.int(1, d - 1) : 0;
          const q = rng.int(Math.ceil(10 ** (digits - 1) / d), Math.floor((10 ** digits - 1 - r) / d));
          if (q >= 10) {
            return [q, d, r];
          }
        }
      });
      return [
        node({
          case: 'longDivision',
          value: create(LongDivisionSchema, {
            dividend: BigInt(q * d + r),
            divisor: d,
            quotient: ctx.fields.field(`${q * d + r} ÷ ${d}`, String(q)),
            remainder: k.value.remainders ? ctx.fields.field(`remainder of ${q * d + r} ÷ ${d}`, String(r)) : undefined,
            workRows: 2 * digits,
          }),
        }),
      ];
    }
    case 'clockTime': {
      const elapsed = k.value.mode === ClockTime_Mode.ELAPSED;
      const [h, m, add] = pickFresh(ctx, k.case + k.value.mode, () =>
        elapsed ? [rng.int(7, 11), 5 * rng.int(0, 11), 5 * rng.int(5, 30)] : [rng.int(1, 12), rng.int(0, 59), 0],
      );
      const clockNode = node({ case: 'clock', value: create(ClockSchema, { hour: h, minute: m }) });
      if (!elapsed) {
        return [clockNode, math('The time is', blank(ctx.fields.field('the time on the clock', timeText(h, m))))];
      }
      const total = h * 60 + m + add;
      const end = timeText(((Math.floor(total / 60) - 1) % 12) + 1, total % 60);
      return [
        clockNode,
        text(`The game starts at the time shown and lasts ${durationText(add)}. When does it end?`),
        math('It ends at', blank(ctx.fields.field(`${durationText(add)} after ${timeText(h, m)}`, end))),
      ];
    }
    case 'measureWithRuler': {
      const [ppi, parts] = pickFresh(ctx, k.case, () => {
        const ppi = rng.pick(list(k.value.partsPerInch, [2, 4]));
        let parts = rng.int(ppi, 5 * ppi);
        while (parts % ppi === 0) {
          parts = rng.int(ppi, 5 * ppi);
        }
        return [ppi, parts];
      });
      const also = [`${parts}/${ppi}`];
      return [
        node({ case: 'ruler', value: create(RulerSchema, { inches: 6, partsPerInch: ppi, barParts: parts }) }),
        math('The bar is', blank(ctx.fields.field('length of the bar in inches', mixed(parts, ppi), also)), 'inches long.'),
      ];
    }
    case 'linePlotQuestions': {
      const ppu = k.value.partsPerUnit || 4;
      const ticks = 2 * ppu;
      const counts = pickFresh(ctx, k.case, () => {
        const counts = Array(ticks + 1).fill(0);
        const lo = rng.int(1, ppu - 1);
        const hi = rng.int(ppu + 1, ticks);
        for (let i = 0; i < rng.int(8, 12); i++) {
          counts[rng.int(lo, hi)]++;
        }
        counts[lo] = Math.max(1, counts[lo]);
        counts[hi] = Math.max(1, counts[hi]);
        return counts;
      });
      const ticksWith = counts.map((c, i) => [c, i]).filter(([c]) => c > 0);
      const [askCount, askTick] = ticksWith[Math.floor(ticksWith.length / 2)];
      const lo = ticksWith[0][1];
      const hi = ticksWith[ticksWith.length - 1][1];
      return [
        node({ case: 'linePlot', value: create(LinePlotSchema, { start: 0, end: 2, partsPerUnit: ppu, counts, caption: 'Length of each leaf (inches)' }) }),
        math(`How many leaves are ${mixed(askTick, ppu)} inch long?`, blank(ctx.fields.field(`leaves ${mixed(askTick, ppu)} inch long`, String(askCount)))),
        math('Longest minus shortest:', blank(ctx.fields.field('longest minus shortest leaf', mixed(hi - lo, ppu), [`${hi - lo}/${ppu}`])), 'inch'),
      ];
    }
    case 'readProtractor': {
      const deg = pickFresh(ctx, k.case, () => 5 * rng.int(3, 33));
      return [
        node({ case: 'protractor', value: create(ProtractorSchema, { degrees: deg }) }),
        math('The angle measures', blank(ctx.fields.field('the angle on the protractor', `${deg}°`, [String(deg)]))),
      ];
    }
    case 'nameLineFigure': {
      const kinds = k.value.pairs
        ? ([
            [LineFigure_Kind.PARALLEL, 'parallel'],
            [LineFigure_Kind.PERPENDICULAR, 'perpendicular'],
            [LineFigure_Kind.INTERSECTING, 'intersecting'],
          ] as const)
        : ([
            [LineFigure_Kind.SEGMENT, 'line segment'],
            [LineFigure_Kind.LINE, 'line'],
            [LineFigure_Kind.RAY, 'ray'],
          ] as const);
      // Each kind of figure once before any repeats, so a short set has all
      // of them.
      const i = pickFresh(ctx, k.case + k.value.pairs, () => rng.int(0, kinds.length - 1));
      const rot = 5 * rng.int(-6, 6);
      const letter = rng.int(0, 10);
      // Letter pairs that cannot be mistaken for a stroke or a zero.
      const pairs = ['AB', 'CD', 'EF', 'GH', 'JK', 'LM', 'PQ', 'RS', 'TU', 'WX', 'YZ'];
      const points = pairs[letter].split('');
      return [
        node({ case: 'lineFigure', value: create(LineFigureSchema, { kind: kinds[i][0], rotation: rot, points: k.value.pairs ? [] : points }) }),
        node({ case: 'choices', value: create(ChoicesSchema, { options: kinds.map((x) => x[1]), field: ctx.fields.field('name of the figure', kinds[i][1]) }) }),
      ];
    }
    case 'factorPairs': {
      const n = pickFresh(ctx, k.case, () => inRange(rng, k.value.number, 12, 60));
      const pairs: string[] = [];
      for (let a = 1; a * a <= n; a++) {
        if (n % a === 0) {
          pairs.push(`${a} × ${n / a}`);
        }
      }
      return [
        math(`Factor pairs of ${n}:`),
        node({ case: 'lines', value: create(LinesSchema, { count: 1, field: ctx.fields.field(`factor pairs of ${n}`, pairs.join(', ')) }) }),
        node({ case: 'choices', value: create(ChoicesSchema, { options: ['prime', 'composite'], field: ctx.fields.field(`is ${n} prime or composite`, pairs.length === 1 ? 'prime' : 'composite') }) }),
      ];
    }
    case 'shadeMultiples': {
      const of = pickFresh(ctx, k.case, () => rng.pick(list(k.value.of, [3, 4, 6, 7])));
      const multiples: number[] = [];
      for (let m = of; m <= 50; m += of) {
        multiples.push(m);
      }
      return [
        text(`Shade every multiple of ${of}.`),
        node({ case: 'numberChart', value: create(NumberChartSchema, { start: 1, rows: 5, cols: 10, shadeField: ctx.fields.field(`multiples of ${of} up to 50`, multiples.join(', ')) }) }),
      ];
    }
    case undefined:
      throw new Error('item kind not set');
  }
  throw new Error(`no generator for item kind ${k.case ?? 'none'}`);
}

const placeName = ['one', 'ten', 'hundred', 'thousand', 'ten thousand', 'hundred thousand'];
// placeNames are the column headings of a place-value chart.
const placeNames = placeName.map((n) => n + 's');

// timeText writes a time as h:mm.
function timeText(h: number, m: number): string {
  return `${h}:${String(m).padStart(2, '0')}`;
}

// durationText writes minutes as "2 hours 15 minutes".
function durationText(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hs = h === 1 ? '1 hour' : `${h} hours`;
  return [h ? hs : '', m ? `${m} minutes` : ''].filter(Boolean).join(' ');
}

// reduced picks a numerator from 1 to d-1 sharing no factor with d, so the
// fraction an equivalence starts from is in lowest terms.
function reduced(rng: Rng, d: number): number {
  let a = rng.int(1, d - 1);
  while (gcd(a, d) !== 1) {
    a = rng.int(1, d - 1);
  }
  return a;
}

// numberWithDigits picks a number with exactly n digits. With zeros false,
// no digit is zero, so an area model has a part for every place.
function numberWithDigits(rng: Rng, n: number, zeros = false): number {
  let v = rng.int(1, 9);
  for (let i = 1; i < n; i++) {
    v = v * 10 + (zeros ? rng.int(0, 9) : rng.int(1, 9));
  }
  return v;
}

// places splits n by place value, largest first: 345 is [300, 40, 5].
function places(n: number): number[] {
  const out: number[] = [];
  let p = 1;
  while (n > 0) {
    const d = n % 10;
    if (d) {
      out.unshift(d * p);
    }
    n = Math.floor(n / 10);
    p *= 10;
  }
  return out;
}

// regroups reports whether x + y carries, or x - y borrows, in some column.
function regroups(x: number, y: number, subtract: boolean): boolean {
  while (x > 0 || y > 0) {
    const a = x % 10;
    const b = y % 10;
    if (subtract ? a < b : a + b >= 10) {
      return true;
    }
    x = Math.floor(x / 10);
    y = Math.floor(y / 10);
  }
  return false;
}

// mixedOf writes n/d as a mixed number without reducing the fraction part,
// as a child adding same-denominator fractions would: 9/4 is "2 1/4".
export function mixedOf(n: number, d: number): string {
  const w = Math.floor(n / d);
  const r = n - w * d;
  return w === 0 ? frac(r, d) : r === 0 ? String(w) : `${w} ${frac(r, d)}`;
}

export function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

// Each conversion: the larger unit, the smaller, and how many of the
// smaller make one of the larger.
const CONVERSIONS: Record<number, [string, string, number]> = {
  [UnitConversion_Conversion.FEET_INCHES]: ['feet', 'inches', 12],
  [UnitConversion_Conversion.YARDS_FEET]: ['yards', 'feet', 3],
  [UnitConversion_Conversion.HOURS_MINUTES]: ['hours', 'minutes', 60],
  [UnitConversion_Conversion.MINUTES_SECONDS]: ['minutes', 'seconds', 60],
  [UnitConversion_Conversion.METERS_CENTIMETERS]: ['meters', 'centimeters', 100],
  [UnitConversion_Conversion.KILOGRAMS_GRAMS]: ['kilograms', 'grams', 1000],
  [UnitConversion_Conversion.POUNDS_OUNCES]: ['pounds', 'ounces', 16],
  [UnitConversion_Conversion.LITERS_MILLILITERS]: ['liters', 'milliliters', 1000],
};

type Pts = [number, number][];

// big turns grid points into polygon points at twice the size, so a shape
// the child draws on is drawn as large as a polygon may be.
function big(pts: Pts) {
  return pts.map(([x, y]) => create(Polygon_PointSchema, { x: 2 * x, y: 2 * y }));
}

// Quadrilaterals with their pairs of parallel sides and right angles.
const QUADS: [Pts, number, number][] = [
  [[[0, 0], [4, 0], [4, 4], [0, 4]], 2, 4],
  [[[0, 0], [6, 0], [6, 3], [0, 3]], 2, 4],
  [[[0, 0], [5, 0], [7, 3], [2, 3]], 2, 0],
  [[[0, 2], [3, 0], [6, 2], [3, 4]], 2, 0],
  [[[0, 0], [7, 0], [5, 3], [2, 3]], 1, 0],
  [[[0, 0], [6, 0], [4, 3], [0, 3]], 1, 2],
  [[[0, 3], [2, 0], [4, 3], [2, 5]], 0, 0],
  [[[0, 0], [6, 1], [5, 4], [1, 3]], 0, 0],
];

// Shapes with how many lines of symmetry each has.
const SYMMETRIC: [Pts, number][] = [
  [[[0, 0], [4, 0], [4, 4], [0, 4]], 4],
  [[[0, 0], [6, 0], [6, 3], [0, 3]], 2],
  [[[0, 0], [4, 0], [2, 3.46]], 3],
  [[[0, 0], [4, 0], [2, 5]], 1],
  [[[0, 0], [6, 0], [1, 4]], 0],
  [[[0, 2], [3, 0], [6, 2], [3, 4]], 2],
  [[[0, 0], [7, 0], [5, 3], [2, 3]], 1],
  [[[0, 0], [5, 0], [7, 3], [2, 3]], 0],
  [[[0, 3], [2, 0], [4, 3], [2, 5]], 1],
  [[[1, 0], [3, 0], [4, 1.73], [3, 3.46], [1, 3.46], [0, 1.73]], 6],
];

// Bar graph themes: title, value axis, four labels, and what is counted.
const GRAPH_THEMES: [string, string, string[], string][] = [
  ['Favorite fruit', 'Votes', ['Apples', 'Bananas', 'Grapes', 'Pears'], 'votes'],
  ['Books read this week', 'Books', ['Mon', 'Tue', 'Wed', 'Thu'], 'books'],
  ['Pets in our class', 'Pets', ['Dogs', 'Cats', 'Fish', 'Birds'], 'pets'],
  ['Cans collected', 'Cans', ['Room 1', 'Room 2', 'Room 3', 'Room 4'], 'cans'],
];
