// Item generators for kindergarten to grade 2: counting, facts within 20,
// place value to 1000, length, time, simple data and flat shapes. Each picks
// its values from the ranges in its message and computes every answer.
import { create } from '@bufbuild/protobuf';

import {
  type Node,
  BaseTenBlocksSchema,
  ChoicesSchema,
  ClockSchema,
  Coins_Coin,
  CoinsSchema,
  ColumnArithmetic_Op,
  ColumnArithmeticSchema,
  DataTable_CellSchema,
  DataTable_RowSchema,
  DataTableSchema,
  DotArraySchema,
  FractionBarSchema,
  LinePlotSchema,
  LinesSchema,
  NumberBond_PartSchema,
  NumberBondSchema,
  NumberGrid_CellSchema,
  NumberGridSchema,
  PictureGroups_Picture,
  PictureGroupsSchema,
  NumberLine_TickBlankSchema,
  NumberLine_TickLabelSchema,
  NumberLineSchema,
  Polygon_PointSchema,
  PolygonSchema,
  RulerSchema,
  TapeDiagram_TapeSchema,
  TapeDiagramSchema,
  TenFrameSchema,
  UnitGridSchema,
  WorkSpace_Style,
  WorkSpaceSchema,
} from '../proto/v1/nodes_pb.js';
import {
  type CompareNumbers,
  type IntRange,
  type ItemKind,
  AddSubtractFact_Op,
  CountObjects_Mode,
  CountObjects_Picture,
  DataChart_Mode,
  Equation_Mode,
  Equation_Model,
  LengthMeasure_Mode,
  MentalMath_Mode,
  NumberForms_Mode,
  PairsAndArrays_Mode,
  PlaceValueBlocks_Mode,
  ShapeAttributes_Mode,
} from '../proto/v1/worksheet_pb.js';
import { type AtomSpec, blank, compare, math, node, row, stack, text } from './build.js';
import { COIN } from './draw_k2.js';
import { type Ctx, inRange, list, pickFresh, timeText } from './kinds.js';
import { type Rng } from './rng.js';

// generateK2 writes an item of a kindergarten to grade 2 kind, or returns
// undefined for any other kind.
export function generateK2(kind: ItemKind, ctx: Ctx): Node[] | undefined {
  const { rng } = ctx;
  const f = ctx.fields;
  const k = kind.kind;
  switch (k.case) {
    case 'countObjects': {
      const mode = k.value.mode || CountObjects_Mode.COUNT;
      if (mode === CountObjects_Mode.COMPARE_GROUPS) {
        const [a, b] = pickFresh(ctx, k.case + mode, () => {
          const a = inRange(rng, k.value.count, 1, 10);
          // About one pair in five is the same size.
          const b = rng.next() < 0.2 ? a : inRange(rng, k.value.count, 1, 10);
          return [a, b];
        });
        const answer = a > b ? 'A' : a < b ? 'B' : 'same';
        return [
          row(math('A'), dots(1, a)),
          row(math('B'), dots(1, b)),
          node({ case: 'choices', value: create(ChoicesSchema, { options: ['A', 'B', 'same'], field: f.field('the row with more dots', answer) }) }),
        ];
      }
      if (mode === CountObjects_Mode.COINS) {
        const set = pickFresh(ctx, k.case + mode, () => {
          for (;;) {
            const set = Array.from({ length: rng.int(2, 6) }, () => rng.pick([Coins_Coin.PENNY, Coins_Coin.NICKEL, Coins_Coin.DIME, Coins_Coin.QUARTER]));
            const v = cents(set);
            if (v >= (k.value.count?.min || 5) && v <= (k.value.count?.max || 99)) {
              // Largest first, so the child counts on from the biggest coin.
              return set.sort((a, b) => cents([b]) - cents([a]));
            }
          }
        });
        const v = cents(set);
        return [node({ case: 'coins', value: create(CoinsSchema, { coins: set }) }), math('Total:', blank(f.field('cents in all', String(v), [`${v}¢`])), '¢')];
      }
      const n = pickFresh(ctx, k.case + mode, () => inRange(rng, k.value.count, 1, 10));
      const things = counted(rng, n, k.value.picture);
      if (mode === CountObjects_Mode.ONE_MORE) {
        return [things, math(blank(f.field('how many', String(n))), 'One more is', blank(f.field(`one more than ${n}`, String(n + 1))))];
      }
      return [things, math('How many?', blank(f.field('how many', String(n))))];
    }
    case 'compareNumbers': {
      return compareNumbers(k.value, ctx);
    }
    case 'countSequence': {
      if (k.value.chart) {
        return hundredChart(k.value.start, ctx);
      }
      const [step, start, keep] = pickFresh(ctx, k.case, () => {
        const step = rng.pick(list(k.value.steps, [1]));
        let start = inRange(rng, k.value.start, 1, 90);
        start = Math.max(step === 1 ? 0 : step, start - (start % step));
        // One of the later numbers is shown, so the child checks against it.
        return [step, Math.min(start, 1000 - 5 * step), rng.int(2, 5)];
      });
      const atoms: AtomSpec[] = [];
      for (let i = 0; i < 6; i++) {
        const x = start + i * step;
        if (i) {
          atoms.push(',');
        }
        atoms.push(i < 2 || i === keep ? x : blank(f.field(`counting by ${step}s from ${start}, number ${i + 1}`, String(x))));
      }
      return [math(...atoms)];
    }
    case 'addSubtractFact': {
      const max = k.value.max || 10;
      const op = k.value.op || AddSubtractFact_Op.ADD;
      if (k.value.threeAddends) {
        const [a, b, c] = pickFresh(ctx, k.case + 3, () => {
          for (;;) {
            const xs = [rng.int(1, 9), rng.int(1, 9), rng.int(1, 9)];
            if (xs[0] + xs[1] + xs[2] <= max) {
              return xs;
            }
          }
        });
        return [math(a, '+', b, '+', c, '=', blank(f.field(`${a} + ${b} + ${c}`, String(a + b + c))))];
      }
      const [a, b, sub] = pickFresh(ctx, k.case + max + op, () => {
        const sub = op === AddSubtractFact_Op.MIXED ? rng.next() < 0.5 : op === AddSubtractFact_Op.SUBTRACT;
        // Facts within 20 use one-digit numbers; smaller facts may use 0,
        // but not in pictures, where an empty group shows nothing.
        const lim = Math.min(9, max);
        const least = max > 10 ? 2 : k.value.pictures ? 1 : 0;
        for (;;) {
          const a = rng.int(least, lim);
          const b = rng.int(least, lim);
          if (a + b <= max && a + b > 0) {
            return [a, b, sub] as const;
          }
        }
      });
      const w = a + b;
      if (sub) {
        const field = f.field(`${w} − ${a}`, String(b));
        return k.value.pictures ? [pictures(rng, [w], a), math(w, '−', a, '=', blank(field))] : [math(w, '−', a, '=', blank(field))];
      }
      const field = f.field(`${a} + ${b}`, String(w));
      return k.value.pictures ? [pictures(rng, [a, b]), math(a, '+', b, '=', blank(field))] : [math(a, '+', b, '=', blank(field))];
    }
    case 'equation': {
      return equation(k.value.mode || Equation_Mode.MISSING_PART, k.value.total, k.value.model, ctx);
    }
    case 'placeValueBlocks': {
      return placeValueBlocks(k.value.mode || PlaceValueBlocks_Mode.READ_BLOCKS, k.value.number, ctx);
    }
    case 'mentalMath': {
      const mode = k.value.mode || MentalMath_Mode.PLUS_ONES;
      return k.value.chart && mode === MentalMath_Mode.TEN_MORE_LESS ? chartCross(ctx) : mentalMath(mode, ctx);
    }
    case 'numberForms': {
      const mode = k.value.mode || NumberForms_Mode.EXPANDED_TO_NUMBER;
      const n = pickFresh(ctx, k.case + mode, () => {
        // Expanded form to fill in needs a part for every place.
        const zeros = mode !== NumberForms_Mode.NUMBER_TO_EXPANDED;
        const h = rng.int(1, 9);
        const t = zeros && rng.next() < 0.2 ? 0 : rng.int(1, 9);
        const o = zeros && rng.next() < 0.2 ? 0 : rng.int(1, 9);
        return 100 * h + 10 * t + o;
      });
      const parts = placesOf(n);
      if (mode === NumberForms_Mode.NUMBER_TO_EXPANDED) {
        const [h, t, o] = parts;
        return [math(n, '=', blank(f.field(`hundreds in ${n}`, String(h))), '+', blank(f.field(`tens in ${n}`, String(t))), '+', blank(f.field(`ones in ${n}`, String(o))))];
      }
      if (mode === NumberForms_Mode.WORDS_TO_NUMBER) {
        return [text(numberWords(n)), math('=', blank(f.field(`${numberWords(n)} in digits`, String(n))))];
      }
      const atoms: AtomSpec[] = [];
      parts.forEach((p, i) => atoms.push(...(i ? ['+', p] : [p])));
      return [math(...atoms, '=', blank(f.field(parts.join(' + '), String(n))))];
    }
    case 'addInColumns': {
      const count = k.value.explain ? 2 : Math.min(4, Math.max(2, k.value.addends || 3));
      const xs = pickFresh(ctx, k.case + count + k.value.explain, () => {
        for (;;) {
          const xs = Array.from({ length: count }, () => rng.int(11, 79));
          const ones = xs.reduce((s, x) => s + (x % 10), 0);
          if (ones >= 10) {
            return xs;
          }
        }
      });
      const sum = xs.reduce((s, x) => s + x, 0);
      const nodes = [
        node({
          case: 'columnArithmetic',
          value: create(ColumnArithmeticSchema, { op: ColumnArithmetic_Op.ADD, operands: xs.map(BigInt), carryBoxes: true, answer: f.field(xs.join(' + '), String(sum)) }),
        }),
      ];
      if (k.value.explain) {
        const ones = xs.reduce((s, x) => s + (x % 10), 0);
        nodes.push(
          text('Why does a 1 go above the tens?'),
          node({
            case: 'lines',
            value: create(LinesSchema, {
              count: 2,
              field: f.field('why the sum regroups', `The ones make ${ones}, which is 1 ten and ${ones - 10} ones. The ten goes with the other tens.`),
            }),
          }),
        );
      }
      return nodes;
    }
    case 'clockNearest': {
      const step = k.value.step || 30;
      const [h, m] = pickFresh(ctx, k.case + step, () => [rng.int(1, 12), step >= 60 ? 0 : step * rng.int(0, 60 / step - 1)]);
      const also = m === 0 ? [`${h} o'clock`] : [];
      return [node({ case: 'clock', value: create(ClockSchema, { hour: h, minute: m }) }), math('The time is', blank(f.field('the time on the clock', timeText(h, m), also)))];
    }
    case 'dataChart': {
      return dataChart(k.value.mode || DataChart_Mode.TALLY, ctx);
    }
    case 'shapeAttributes': {
      return shapeAttributes(k.value.mode || ShapeAttributes_Mode.NAME, ctx);
    }
    case 'equalShares': {
      const ds = list(k.value.denominators, [2, 4]);
      if (k.value.unequal) {
        const [d, equal, cut] = pickFresh(ctx, k.case + 'u', () => [rng.pick(ds), rng.next() < 0.5, rng.int(0, 2)]);
        const widths = equal ? [] : UNEQUAL[d][cut];
        return [
          node({ case: 'fractionBar', value: create(FractionBarSchema, { parts: d, widths, shaded: [0] }) }),
          node({ case: 'choices', value: create(ChoicesSchema, { options: ['equal shares', 'not equal shares'], field: f.field('are the parts equal', equal ? 'equal shares' : 'not equal shares') }) }),
        ];
      }
      const [d, s] = pickFresh(ctx, k.case, () => {
        const d = rng.pick(ds);
        return [d, rng.int(0, d - 1)];
      });
      return [
        node({ case: 'fractionBar', value: create(FractionBarSchema, { parts: d, shaded: [s] }) }),
        node({ case: 'choices', value: create(ChoicesSchema, { options: ds.map((x) => SHARE[x]), field: f.field('the shaded share', SHARE[d]) }) }),
      ];
    }
    case 'pairsAndArrays': {
      const mode = k.value.mode || PairsAndArrays_Mode.ODD_EVEN;
      if (mode === PairsAndArrays_Mode.ODD_EVEN) {
        const n = pickFresh(ctx, k.case + mode, () => inRange(rng, k.value.size, 2, 20));
        const even = n % 2 === 0;
        const out = [dots(1, n), node({ case: 'choices', value: create(ChoicesSchema, { options: ['odd', 'even'], field: f.field(`is ${n} odd or even`, even ? 'even' : 'odd') }) })];
        if (even) {
          out.push(math(n, '=', blank(f.field(`half of ${n}`, String(n / 2))), '+', blank(f.field(`half of ${n}`, String(n / 2)))));
        }
        return out;
      }
      const [r, c] = pickFresh(ctx, k.case + mode, () => [inRange(rng, k.value.size, 2, 5), inRange(rng, k.value.size, 2, 5)]);
      if (mode === PairsAndArrays_Mode.SQUARES) {
        return [
          node({ case: 'unitGrid', value: create(UnitGridSchema, { rows: r, cols: c }) }),
          math(blank(f.field('rows', String(r))), 'rows', blank(f.field('columns', String(c))), 'columns'),
          math('Squares:', blank(f.field('squares in all', String(r * c)))),
        ];
      }
      const sum: AtomSpec[] = [];
      for (let i = 0; i < r; i++) {
        sum.push(...(i ? ['+', c] : [c]));
      }
      return [dots(r, c), math(...sum, '=', blank(f.field(`${r} rows of ${c}`, String(r * c))))];
    }
    case 'numberLineJumps': {
      const step = k.value.step || 1;
      const end = k.value.end || (step === 10 ? 100 : 20);
      const ticks = end / step;
      const sub = k.value.subtract;
      const [a, n] = pickFresh(ctx, k.case + step + sub, () => {
        const n = rng.int(step === 10 ? 1 : 2, step === 10 ? 5 : 6);
        const a = sub ? rng.int(n + 1, ticks) : rng.int(step === 10 ? 1 : 3, ticks - n);
        return [a, n];
      });
      const first = sub ? a - n : a;
      const jumpTicks = Array.from({ length: n }, (_, i) => first + i);
      const result = sub ? a - n : a + n;
      const label = `${a * step} ${sub ? '−' : '+'} ${n * step}`;
      // The child writes where the jumps land in a box under that mark. Every
      // other mark is labelled; a line with boxes is drawn wide enough for
      // two-digit labels.
      const labels = [];
      for (let i = 0; i <= ticks; i++) {
        if (i !== result) {
          labels.push(create(NumberLine_TickLabelSchema, { tick: i, value: { case: 'text', value: String(i * step) } }));
        }
      }
      const blanks = [create(NumberLine_TickBlankSchema, { tick: result, field: f.field(`where ${label} lands`, String(result * step)) })];
      const line = create(NumberLineSchema, { start: 0, end: ticks, partsPerUnit: 1, hideWholeLabels: true, labels, blanks, hasArrow: true, arrowTick: a, jumpTicks });
      return [node({ case: 'numberLine', value: line }), math(label, '=', blank(f.field(label, String(result * step))))];
    }
    case 'lengthMeasure': {
      return lengthMeasure(k.value.mode || LengthMeasure_Mode.LONGER, ctx);
    }
    default:
      return undefined;
  }
}

function dots(rows: number, cols: number): Node {
  return node({ case: 'dotArray', value: create(DotArraySchema, { rows, cols }) });
}

// arrangement lays n dots in a line, or in an array of two to four rows
// when n has a factor that allows it.
function arrangement(rng: Rng, n: number): [number, number] {
  const arrays: [number, number][] = [];
  for (const r of [2, 3, 4]) {
    if (n % r === 0 && n / r >= 2 && n / r <= 10) {
      arrays.push([r, n / r]);
    }
  }
  // A long line is hard to keep track of, so past 12 a line is used only
  // when no array fits.
  if (n <= 12 || arrays.length === 0) {
    arrays.push([1, n]);
  }
  return rng.pick(arrays);
}

function compareNumbers(c: CompareNumbers, ctx: Ctx): Node[] {
  const { rng } = ctx;
  const [a, b] = pickFresh(ctx, 'compareNumbers' + c.symbols, () => {
    const a = inRange(rng, c.numbers, 1, 10);
    for (;;) {
      const b = inRange(rng, c.numbers, 1, 10);
      // With symbols, about one pair in eight is equal; otherwise never.
      if (b !== a || (c.symbols && rng.next() < 0.125)) {
        return [a, b];
      }
    }
  });
  if (c.symbols) {
    return [math(a, compare(ctx.fields.field(`<, > or = between ${a} and ${b}`, a > b ? '>' : a < b ? '<' : '=')), b)];
  }
  return [node({ case: 'choices', value: create(ChoicesSchema, { options: [String(a), String(b)], field: ctx.fields.field(`the greater of ${a} and ${b}`, String(Math.max(a, b))) }) })];
}

function equation(mode: Equation_Mode, total: IntRange | undefined, model: Equation_Model, ctx: Ctx): Node[] {
  const { rng } = ctx;
  const f = ctx.fields;
  const [t, a, form] = pickFresh(ctx, 'equation' + mode, () => {
    const t = inRange(rng, total, 2, 10);
    return [t, rng.int(mode === Equation_Mode.MISSING_PART ? 0 : 1, t - 1), rng.int(0, 5)];
  });
  const b = t - a;
  switch (mode) {
    case Equation_Mode.MISSING_PART:
      if (model === Equation_Model.BOND) {
        // The bond's missing part is either side; the equation repeats it.
        const leftMissing = form % 2 === 0;
        const part = (x: number, missing: boolean) => create(NumberBond_PartSchema, missing ? { field: f.field(`${t} − ${t - x}`, String(x)) } : { text: String(x) });
        const bond = create(NumberBondSchema, { whole: create(NumberBond_PartSchema, { text: String(t) }), left: part(a, leftMissing), right: part(b, !leftMissing) });
        return [
          node({ case: 'numberBond', value: bond }),
          leftMissing ? math(t, '=', blank(f.field(`${t} − ${b}`, String(a))), '+', b) : math(t, '=', a, '+', blank(f.field(`${t} − ${a}`, String(b)))),
        ];
      }
      if (model === Equation_Model.TEN_FRAME) {
        return [
          node({ case: 'tenFrame', value: create(TenFrameSchema, { filled: a, frames: Math.max(1, Math.ceil(t / 10)) }) }),
          math(a, '+', blank(f.field(`${t} − ${a}`, String(b))), '=', t),
        ];
      }
      switch (form % 3) {
        case 0:
          return [math(t, '=', a, '+', blank(f.field(`${t} − ${a}`, String(b))))];
        case 1:
          return [math(t, '=', blank(f.field(`${t} − ${b}`, String(a))), '+', b)];
        default:
          return [math(a, '+', blank(f.field(`${t} − ${a}`, String(b))), '=', t)];
      }
    case Equation_Mode.TRUE_FALSE: {
      // Half are true. A false one is off by one. The other side is a number
      // or a different sum, and either side may come first.
      const holds = form % 2 === 0;
      const other = holds ? t : t + (rng.next() < 0.5 ? 1 : -1);
      const c = rng.int(0, other);
      const rhs: AtomSpec[] = form < 2 ? [other] : [c, '+', other - c];
      const lhs: AtomSpec[] = [a, '+', b];
      const atoms = form % 3 === 1 ? [...rhs, '=', ...lhs] : [...lhs, '=', ...rhs];
      return [math(...atoms), node({ case: 'choices', value: create(ChoicesSchema, { options: ['true', 'false'], field: f.field('is the equation true', holds ? 'true' : 'false') }) })];
    }
    case Equation_Mode.TURN_AROUND:
      return form % 2 === 0 ? [math(a, '+', b, '=', b, '+', blank(f.field(`${a} + ${b} = ${b} + ?`, String(a))))] : [math(a, '+', b, '=', blank(f.field(`${a} + ${b} = ? + ${a}`, String(b))), '+', a)];
    case Equation_Mode.THINK_ADDITION:
      return [math(t, '−', a, '=', blank(f.field(`${t} − ${a}`, String(b)))), math('because', a, '+', blank(f.field(`${a} + ? = ${t}`, String(b))), '=', t)];
    default:
      switch (form) {
        case 0:
          return [math(a, '+', blank(f.field(`${a} + ? = ${t}`, String(b))), '=', t)];
        case 1:
          return [math(blank(f.field(`? + ${b} = ${t}`, String(a))), '+', b, '=', t)];
        case 2:
          return [math(t, '−', blank(f.field(`${t} − ? = ${b}`, String(a))), '=', b)];
        case 3:
          return [math(blank(f.field(`? − ${a} = ${b}`, String(t))), '−', a, '=', b)];
        case 4:
          return [math(t, '=', blank(f.field(`${t} = ? + ${b}`, String(a))), '+', b)];
        default:
          return [math(b, '=', t, '−', blank(f.field(`${b} = ${t} − ?`, String(a))))];
      }
  }
}

function placeValueBlocks(mode: PlaceValueBlocks_Mode, range: IntRange | undefined, ctx: Ctx): Node[] {
  const { rng } = ctx;
  const f = ctx.fields;
  if (mode === PlaceValueBlocks_Mode.TEEN) {
    const [n, form] = pickFresh(ctx, 'teen', () => [rng.int(11, 19), rng.int(0, 1)]);
    const blocks = node({ case: 'baseTenBlocks', value: create(BaseTenBlocksSchema, { tens: 1, ones: n - 10 }) });
    return form === 0
      ? [blocks, math(n, '=', 10, '+', blank(f.field(`ones in ${n}`, String(n - 10))))]
      : [blocks, math(10, '+', n - 10, '=', blank(f.field(`10 + ${n - 10}`, String(n))))];
  }
  if (mode === PlaceValueBlocks_Mode.UNITS) {
    const hundreds = (range?.max ?? 99) > 99;
    const [form, x] = pickFresh(ctx, 'units' + hundreds, () => [rng.int(0, 3), rng.int(hundreds ? 1 : 2, 9)]);
    const [unit, size, small] = hundreds ? ['hundreds', 100, 'tens'] : ['tens', 10, 'ones'];
    switch (form) {
      case 0:
        return [math(10, small, '=', blank(f.field(`10 ${small} in ${unit}`, '1')), unit.replace(/s$/, ''))];
      case 1:
        return [math(x * size, '=', blank(f.field(`${unit} in ${x * size}`, String(x))), unit)];
      case 2:
        return [math(x, x === 1 ? unit.replace(/s$/, '') : unit, '=', blank(f.field(`${x} ${unit}`, String(x * size))))];
      default:
        return [math(blank(f.field(`${unit} in ${x * size}`, String(x))), unit, '=', x * size)];
    }
  }
  const n = pickFresh(ctx, 'blocks', () => {
    for (;;) {
      const n = inRange(rng, range, 11, 99);
      // Every place shows at least one block, so no column is empty.
      if (n % 10 !== 0 && (n < 100 || Math.floor(n / 10) % 10 !== 0)) {
        return n;
      }
    }
  });
  const h = Math.floor(n / 100);
  const t = Math.floor(n / 10) % 10;
  const o = n % 10;
  const blocks = node({ case: 'baseTenBlocks', value: create(BaseTenBlocksSchema, { hundreds: h, tens: t, ones: o }) });
  if (h) {
    return [
      blocks,
      math(blank(f.field('hundreds', String(h))), 'hundreds', blank(f.field('tens', String(t))), 'tens', blank(f.field('ones', String(o))), 'ones'),
      math('The number is', blank(f.field('the number the blocks show', String(n)))),
    ];
  }
  return [blocks, math(blank(f.field('tens', String(t))), 'tens', blank(f.field('ones', String(o))), 'ones', '=', blank(f.field('the number the blocks show', String(n))))];
}

function mentalMath(mode: MentalMath_Mode, ctx: Ctx): Node[] {
  const { rng } = ctx;
  const f = ctx.fields;
  const [a, b, more] = pickFresh(ctx, 'mentalMath' + mode, (): [number, number, boolean] => {
    switch (mode) {
      case MentalMath_Mode.PLUS_TENS: {
        const a = rng.int(11, 79);
        return [a, 10 * rng.int(1, Math.floor((99 - a) / 10)), true];
      }
      case MentalMath_Mode.TEN_MORE_LESS: {
        const more = rng.next() < 0.5;
        return [more ? rng.int(10, 89) : rng.int(20, 99), 10, more];
      }
      case MentalMath_Mode.SUBTRACT_TENS: {
        const a = 10 * rng.int(2, 9);
        return [a, 10 * rng.int(1, a / 10 - 1), false];
      }
      case MentalMath_Mode.HUNDRED_MORE_LESS: {
        const by = rng.pick([10, 100]);
        const more = rng.next() < 0.5;
        const a = more ? rng.int(100, 900 - by) : rng.int(100 + by, 900);
        return [a, by, more];
      }
      default: {
        const a = rng.int(11, 89);
        return [a, rng.int(2, Math.min(9, 99 - a)), true];
      }
    }
  });
  const result = more ? a + b : a - b;
  if (mode === MentalMath_Mode.TEN_MORE_LESS || mode === MentalMath_Mode.HUNDRED_MORE_LESS) {
    const phrase = `${b} ${more ? 'more' : 'less'} than ${a}`;
    return [math(phrase, 'is', blank(f.field(phrase, String(result))))];
  }
  const op = more ? '+' : '−';
  return [math(a, op, b, '=', blank(f.field(`${a} ${op} ${b}`, String(result))))];
}

function dataChart(mode: DataChart_Mode, ctx: Ctx): Node[] {
  const { rng } = ctx;
  const f = ctx.fields;
  if (mode === DataChart_Mode.LINE_PLOT) {
    const [theme, counts] = pickFresh(ctx, 'linePlot', () => {
      const counts = Array(7).fill(0);
      const lo = rng.int(0, 2);
      const hi = rng.int(4, 6);
      const total = rng.int(7, 11);
      for (let i = 0; i < total; i++) {
        counts[rng.int(lo, hi)]++;
      }
      counts[lo] = Math.max(1, counts[lo]);
      counts[hi] = Math.max(1, counts[hi]);
      return [rng.int(0, PLOT_THEMES.length - 1), counts];
    });
    const [noun, caption] = PLOT_THEMES[theme];
    const start = 2;
    const with_ = counts.map((c, i) => [c, i]).filter(([c]) => c > 0);
    const [askCount, askTick] = with_[Math.floor(with_.length / 2)];
    const lo = with_[0][1];
    const hi = with_[with_.length - 1][1];
    const total = counts.reduce((s, c) => s + c, 0);
    return [
      node({ case: 'linePlot', value: create(LinePlotSchema, { start, end: start + 6, partsPerUnit: 1, counts, caption }) }),
      math(`How many ${noun} are ${start + askTick} inches long?`, blank(f.field(`${noun} ${start + askTick} inches long`, String(askCount)))),
      math(`How many ${noun} were measured?`, blank(f.field(`${noun} measured`, String(total)))),
      math('Longest minus shortest:', blank(f.field(`longest minus shortest ${noun}`, String(hi - lo))), 'inches'),
    ];
  }
  const [theme, values] = pickFresh(ctx, 'tally', () => {
    const vs: number[] = [];
    while (vs.length < 3) {
      const v = rng.int(2, 12);
      if (!vs.includes(v)) {
        vs.push(v);
      }
    }
    return [rng.int(0, TALLY_THEMES.length - 1), vs];
  });
  const [title, labels, noun] = TALLY_THEMES[theme];
  const rows = labels.map((l, i) =>
    create(DataTable_RowSchema, {
      cells: [create(DataTable_CellSchema, { kind: { case: 'text', value: l } }), create(DataTable_CellSchema, { kind: { case: 'text', value: tally(values[i]) } })],
    }),
  );
  const hi = values.indexOf(Math.max(...values));
  const lo = values.indexOf(Math.min(...values));
  return [
    node({ case: 'dataTable', value: create(DataTableSchema, { title, header: [noun === 'votes' ? 'Choice' : 'Kind', 'Tally'], rows }) }),
    math(`How many for ${labels[0]}?`, blank(f.field(`${noun} for ${labels[0]}`, String(values[0])))),
    math(`How many more for ${labels[hi]} than for ${labels[lo]}?`, blank(f.field(`${labels[hi]} minus ${labels[lo]}`, String(values[hi] - values[lo])))),
    math('How many in all?', blank(f.field(`total ${noun}`, String(values.reduce((x, y) => x + y, 0))))),
  ];
}

// tally writes n as tally marks: groups of five, each four strokes and a
// slash.
function tally(n: number): string {
  const groups: string[] = [];
  for (let left = n; left > 0; left -= 5) {
    groups.push(left >= 5 ? '||||/' : '|'.repeat(left));
  }
  return groups.join('  ');
}

function shapeAttributes(mode: ShapeAttributes_Mode, ctx: Ctx): Node[] {
  const { rng } = ctx;
  const f = ctx.fields;
  switch (mode) {
    case ShapeAttributes_Mode.SIDES_CORNERS: {
      const i = pickFresh(ctx, 'sides', () => rng.int(0, SIDED.length - 1));
      const [pts, name] = SIDED[i];
      const n = pts.length;
      return [
        row(
          polygon(turn(pts, 15 * rng.int(0, 5)), 0.8),
          stack(
            math('Sides:', blank(f.field('sides', String(n))), 'Corners:', blank(f.field('corners', String(n)))),
            node({ case: 'choices', value: create(ChoicesSchema, { options: ['triangle', 'quadrilateral', 'pentagon', 'hexagon'], field: f.field('name of the shape', name) }) }),
          ),
        ),
      ];
    }
    case ShapeAttributes_Mode.DRAW: {
      const name = pickFresh(ctx, 'draw', () => rng.pick(['triangle', 'square', 'rectangle', 'hexagon']));
      return [text(`Draw a ${name}.`), node({ case: 'workSpace', value: create(WorkSpaceSchema, { rows: 4, style: WorkSpace_Style.BLANK, field: f.field(`a ${name}`, DRAWN[name]) }) })];
    }
    case ShapeAttributes_Mode.DRAW_BY_SIDES: {
      const n = pickFresh(ctx, 'drawSides', () => rng.int(3, 6));
      const name = SIDE_NAMES[n];
      return [
        text(`Draw a shape with ${n} sides and ${n} corners.`),
        node({ case: 'workSpace', value: create(WorkSpaceSchema, { rows: 4, style: WorkSpace_Style.BLANK, field: f.field(`a shape with ${n} sides`, `A closed shape with ${n} straight sides and ${n} corners`) }) }),
        node({ case: 'choices', value: create(ChoicesSchema, { options: ['triangle', 'quadrilateral', 'pentagon', 'hexagon'], field: f.field(`name of a shape with ${n} sides`, name) }) }),
      ];
    }
    case ShapeAttributes_Mode.SORT: {
      const kinds = pickFresh(ctx, 'sort', () => {
        for (;;) {
          const ks = Array.from({ length: 8 }, () => rng.int(0, 2));
          if ([0, 1, 2].every((x) => ks.includes(x))) {
            return ks;
          }
        }
      });
      const shapes = kinds.map((x) => polygon(turn(SORTED[x][0], x === 2 ? 0 : 15 * rng.int(0, 2)), 0.5));
      const rows = SORTED.map(([, plural], x) =>
        create(DataTable_RowSchema, {
          cells: [
            create(DataTable_CellSchema, { kind: { case: 'text', value: plural } }),
            create(DataTable_CellSchema, { kind: { case: 'field', value: f.field(`how many ${plural}`, String(kinds.filter((y) => y === x).length)) } }),
          ],
        }),
      );
      return [row(...shapes), node({ case: 'dataTable', value: create(DataTableSchema, { header: ['Shape', 'How many'], rows }) })];
    }
    default: {
      const i = pickFresh(ctx, 'name', () => rng.int(0, NAMED.length - 1));
      const [pts, name] = NAMED[i];
      const scale = rng.pick([0.6, 0.8, 1]);
      return [
        row(
          polygon(turn(pts, name === 'circle' ? 0 : 15 * rng.int(0, 5)), scale),
          node({ case: 'choices', value: create(ChoicesSchema, { options: ['circle', 'triangle', 'square', 'rectangle', 'hexagon'], field: f.field('name of the shape', name) }) }),
        ),
      ];
    }
  }
}

function lengthMeasure(mode: LengthMeasure_Mode, ctx: Ctx): Node[] {
  const { rng } = ctx;
  const f = ctx.fields;
  const tapes = (lengths: number[]) =>
    node({
      case: 'tapeDiagram',
      value: create(TapeDiagramSchema, { tapes: lengths.map((units, i) => create(TapeDiagram_TapeSchema, { name: 'ABC'[i], units })) }),
    });
  const ruler = (inches: number) => node({ case: 'ruler', value: create(RulerSchema, { inches: 6, partsPerInch: 1, barParts: inches }) });
  switch (mode) {
    case LengthMeasure_Mode.ORDER_THREE: {
      const ls = pickFresh(ctx, 'order', () => {
        const ls = [rng.int(2, 7)];
        while (ls.length < 3) {
          const l = rng.int(2, 7);
          if (!ls.includes(l)) {
            ls.push(l);
          }
        }
        return ls;
      });
      const longest = 'ABC'[ls.indexOf(Math.max(...ls))];
      const shortest = 'ABC'[ls.indexOf(Math.min(...ls))];
      return [
        tapes(ls),
        row(math('Longest:'), node({ case: 'choices', value: create(ChoicesSchema, { options: ['A', 'B', 'C'], field: f.field('the longest strip', longest) }) })),
        row(math('Shortest:'), node({ case: 'choices', value: create(ChoicesSchema, { options: ['A', 'B', 'C'], field: f.field('the shortest strip', shortest) }) })),
      ];
    }
    case LengthMeasure_Mode.COUNT_UNITS: {
      const n = pickFresh(ctx, 'units', () => rng.int(3, 12));
      return [
        node({ case: 'tapeDiagram', value: create(TapeDiagramSchema, { tapes: [create(TapeDiagram_TapeSchema, { name: 'Strip', units: n })] }) }),
        math('It is', blank(f.field('units long', String(n))), 'units long.'),
      ];
    }
    case LengthMeasure_Mode.RULER_INCHES: {
      const n = pickFresh(ctx, 'ruler', () => rng.int(1, 6));
      return [ruler(n), math('The bar is', blank(f.field('length of the bar in inches', String(n))), 'inches long.')];
    }
    case LengthMeasure_Mode.HOW_MUCH_LONGER: {
      const [a, b] = pickFresh(ctx, 'longer', () => {
        const a = rng.int(3, 6);
        return [a, rng.int(1, a - 1)];
      });
      return [
        text('Bar A'),
        ruler(a),
        text('Bar B'),
        ruler(b),
        math('A:', blank(f.field('length of bar A', String(a))), 'in.', 'B:', blank(f.field('length of bar B', String(b))), 'in.'),
        math('A is', blank(f.field('how much longer A is than B', String(a - b))), 'inches longer.'),
      ];
    }
    case LengthMeasure_Mode.TWO_UNITS: {
      const [big, times] = pickFresh(ctx, 'twoUnits', () => [rng.int(2, 4), rng.int(2, 3)]);
      const small = big * times;
      return [
        node({ case: 'fractionBar', value: create(FractionBarSchema, { parts: big, label: 'big' }) }),
        node({ case: 'fractionBar', value: create(FractionBarSchema, { parts: small, label: 'small' }) }),
        math('Big units:', blank(f.field('big units', String(big))), 'Small units:', blank(f.field('small units', String(small)))),
        text('It takes more of the'),
        node({ case: 'choices', value: create(ChoicesSchema, { options: ['big units', 'small units'], field: f.field('which unit takes more', 'small units') }) }),
      ];
    }
    case LengthMeasure_Mode.ESTIMATE: {
      const i = pickFresh(ctx, 'estimate', () => rng.int(0, ESTIMATES.length - 1));
      const [thing, n, unit, other] = ESTIMATES[i];
      const options = rng.next() < 0.5 ? [`${n} ${unit}`, `${n} ${other}`] : [`${n} ${other}`, `${n} ${unit}`];
      return [text(`A ${thing} is about`), node({ case: 'choices', value: create(ChoicesSchema, { options, field: f.field(`length of a ${thing}`, `${n} ${unit}`) }) })];
    }
    default: {
      const [a, b] = pickFresh(ctx, 'longerOf2', () => {
        const a = rng.int(2, 7);
        let b = rng.int(2, 7);
        while (b === a) {
          b = rng.int(2, 7);
        }
        return [a, b];
      });
      return [tapes([a, b]), node({ case: 'choices', value: create(ChoicesSchema, { options: ['A', 'B'], field: f.field('the longer strip', a > b ? 'A' : 'B') }) })];
    }
  }
}

// placesOf splits a three-digit number by place, largest first, leaving out
// zero places: 307 is [300, 7].
function placesOf(n: number): number[] {
  return [100 * Math.floor(n / 100), 10 * (Math.floor(n / 10) % 10), n % 10].filter((x) => x > 0);
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

// numberWords writes a number below 1000 in words, US style:
// "three hundred forty-seven".
export function numberWords(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let rest = '';
  if (r >= 10 && r < 20) {
    rest = TEENS[r - 10];
  } else if (r >= 20) {
    rest = TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : '');
  } else {
    rest = ONES[r];
  }
  return [h ? `${ONES[h]} hundred` : '', rest].filter(Boolean).join(' ') || 'zero';
}

type Pts = [number, number][];

function polygon(pts: Pts, scale = 1): Node {
  return node({ case: 'polygon', value: create(PolygonSchema, { points: pts.map(([x, y]) => create(Polygon_PointSchema, { x: x * scale, y: y * scale })) }) });
}

// turn rotates points about the origin by deg degrees.
function turn(pts: Pts, deg: number): Pts {
  const a = (deg * Math.PI) / 180;
  const r = (x: number) => Math.round(x * 100) / 100;
  return pts.map(([x, y]) => [r(x * Math.cos(a) - y * Math.sin(a)), r(x * Math.sin(a) + y * Math.cos(a))]);
}

function regular(n: number, radius: number, start = 90): Pts {
  return Array.from({ length: n }, (_, i): [number, number] => {
    const a = ((start + (360 * i) / n) * Math.PI) / 180;
    return [Math.round(radius * Math.cos(a) * 100) / 100, Math.round(radius * Math.sin(a) * 100) / 100];
  });
}

// Shapes a kindergartner names. A circle is drawn as a 24-sided polygon.
const NAMED: [Pts, string][] = [
  [regular(24, 2.5), 'circle'],
  [regular(24, 1.6), 'circle'],
  [regular(3, 2.6), 'triangle'],
  [[[0, 0], [5, 0], [1, 3]], 'triangle'],
  [[[0, 0], [4, 0], [4, 4], [0, 4]], 'square'],
  [[[0, 0], [3, 0], [3, 3], [0, 3]], 'square'],
  [[[0, 0], [6, 0], [6, 3], [0, 3]], 'rectangle'],
  [[[0, 0], [3, 0], [3, 5], [0, 5]], 'rectangle'],
  [regular(6, 2.5, 0), 'hexagon'],
  [regular(6, 2, 90), 'hexagon'],
];

// Shapes by number of sides, regular and not.
const SIDED: [Pts, string][] = [
  [regular(3, 2.6), 'triangle'],
  [[[0, 0], [6, 0], [2, 3]], 'triangle'],
  [[[0, 0], [4, 0], [4, 4], [0, 4]], 'quadrilateral'],
  [[[0, 0], [7, 0], [5, 3], [2, 3]], 'quadrilateral'],
  [[[0, 0], [6, 1], [5, 4], [1, 3]], 'quadrilateral'],
  [regular(5, 2.6), 'pentagon'],
  [[[0, 0], [5, 0], [5, 3], [2.5, 5], [0, 3]], 'pentagon'],
  [regular(6, 2.5, 0), 'hexagon'],
  [[[0, 0], [4, 0], [6, 2], [4, 4], [0, 4], [1, 2]], 'hexagon'],
];

const SIDE_NAMES: Record<number, string> = { 3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon' };

// What a drawn shape must have, for whoever marks it.
const DRAWN: Record<string, string> = {
  triangle: 'A closed shape with 3 straight sides',
  square: 'A closed shape with 4 equal straight sides and square corners',
  rectangle: 'A closed shape with 4 straight sides and square corners',
  hexagon: 'A closed shape with 6 straight sides',
};

// Shapes to sort, with their plural names.
const SORTED: [Pts, string][] = [
  [regular(3, 1.2), 'triangles'],
  [[[0, 0], [2, 0], [2, 2], [0, 2]], 'squares'],
  [regular(24, 1.1), 'circles'],
];

const SHARE: Record<number, string> = { 2: 'one half', 3: 'one third', 4: 'one fourth' };

// Unequal cuts for each number of parts.
const UNEQUAL: Record<number, number[][]> = {
  2: [[1, 2], [1, 3], [2, 3]],
  3: [[1, 1, 2], [1, 2, 3], [2, 1, 1]],
  4: [[1, 1, 1, 2], [1, 2, 1, 2], [2, 1, 1, 3]],
};

// Tally themes: title, three labels, and what is counted.
const TALLY_THEMES: [string, string[], string][] = [
  ['Favorite snack', ['Apples', 'Crackers', 'Yogurt'], 'votes'],
  ['Birds at the feeder', ['Robins', 'Finches', 'Jays'], 'birds'],
  ['How we get to school', ['Walk', 'Bus', 'Car'], 'children'],
  ['Weather this month', ['Sunny', 'Cloudy', 'Rainy'], 'days'],
];

// Line plot themes: what is measured, and the caption.
const PLOT_THEMES: [string, string][] = [
  ['pencils', 'Length of each pencil (inches)'],
  ['leaves', 'Length of each leaf (inches)'],
  ['shells', 'Length of each shell (inches)'],
  ['crayons', 'Length of each crayon (inches)'],
];

// Things to estimate: the thing, its rough length, its unit, and a unit
// that would be far wrong.
const ESTIMATES: [string, number, string, string][] = [
  ['pencil', 7, 'inches', 'feet'],
  ['door', 7, 'feet', 'inches'],
  ['crayon', 3, 'inches', 'feet'],
  ['paper clip', 3, 'centimeters', 'meters'],
  ['school bus', 12, 'meters', 'centimeters'],
  ['bed', 2, 'meters', 'centimeters'],
  ['spoon', 15, 'centimeters', 'meters'],
  ['table', 3, 'feet', 'inches'],
  ['car', 4, 'meters', 'centimeters'],
  ['shoe', 8, 'inches', 'feet'],
];

// cents is what a set of coins is worth.
function cents(set: readonly Coins_Coin[]): number {
  return set.reduce((t, c) => t + (COIN[c] ?? [0, 0])[1], 0);
}

const PICTURES = [PictureGroups_Picture.STAR, PictureGroups_Picture.APPLE, PictureGroups_Picture.HEART, PictureGroups_Picture.BALL];

// pictures draws groups of one kind of picture, the last crossedOut of them
// crossed out.
function pictures(rng: Rng, groups: number[], crossedOut = 0): Node {
  return node({ case: 'pictureGroups', value: create(PictureGroupsSchema, { picture: rng.pick(PICTURES), groups, crossedOut }) });
}

// counted draws n things to count: dots, ten frames, or pictures in small
// groups.
function counted(rng: Rng, n: number, how: CountObjects_Picture): Node {
  if (how === CountObjects_Picture.TEN_FRAME) {
    return node({ case: 'tenFrame', value: create(TenFrameSchema, { filled: n }) });
  }
  if (how === CountObjects_Picture.GROUPS) {
    const groups: number[] = [];
    for (let left = n; left > 0; ) {
      const g = Math.min(left, rng.int(2, 5));
      groups.push(g);
      left -= g;
    }
    return pictures(rng, groups);
  }
  const [r, c] = arrangement(rng, n);
  return dots(r, c);
}

// hundredChart is four rows of a hundred chart with a path of boxes to fill
// in, moving right (one more) or down (ten more).
function hundredChart(range: IntRange | undefined, ctx: Ctx): Node[] {
  const { rng } = ctx;
  const [first, path] = pickFresh(ctx, 'hundredChart', () => {
    const first = 10 * Math.floor((inRange(rng, range, 1, 61) - 1) / 10) + 1;
    // The path starts in the top row and takes nine steps.
    let row = 0;
    let col = rng.int(0, 4);
    const path = [[row, col]];
    while (path.length < 9) {
      if (row < 3 && (col === 9 || rng.next() < 0.35)) {
        row++;
      } else if (col < 9) {
        col++;
      } else {
        break;
      }
      path.push([row, col]);
    }
    // The first cell of the path stays printed, as the place to start.
    return [first, path.slice(1).map(([r, c]) => first + 10 * r + c)];
  });
  const blanks = path.map((n) => create(NumberGrid_CellSchema, { number: n, field: ctx.fields.field(`hundred chart, ${n}`, String(n)) }));
  return [node({ case: 'numberGrid', value: create(NumberGridSchema, { start: first, rows: 4, cols: 10, blanks }) })];
}

// chartCross is a plus-shaped piece of a hundred chart around a number,
// with 10 less above, 10 more below, and 1 less and 1 more beside it.
function chartCross(ctx: Ctx): Node[] {
  const { rng } = ctx;
  const n = pickFresh(ctx, 'chartCross', () => {
    for (;;) {
      const n = rng.int(12, 89);
      if (n % 10 >= 2) {
        return n;
      }
    }
  });
  const start = n - 11;
  const blank = (x: number, what: string) => create(NumberGrid_CellSchema, { number: x, field: ctx.fields.field(`${what} ${n}`, String(x)) });
  return [
    node({
      case: 'numberGrid',
      value: create(NumberGridSchema, {
        start,
        rows: 3,
        cols: 3,
        rowStep: 10,
        hidden: [start, start + 2, start + 20, start + 22],
        blanks: [blank(n - 10, '10 less than'), blank(n - 1, '1 less than'), blank(n + 1, '1 more than'), blank(n + 10, '10 more than')],
      }),
    }),
  ];
}
