// Item generators for grade 5. generate in kinds.ts calls generateG5 first;
// it returns undefined for a kind it does not know.
import { create } from '@bufbuild/protobuf';

import {
  type Field,
  type Node,
  ChoicesSchema,
  ColumnArithmetic_Op,
  ColumnArithmetic_PartialSchema,
  ColumnArithmeticSchema,
  CoordinateGrid_PointSchema,
  CoordinateGridSchema,
  DataTable_CellSchema,
  DataTable_RowSchema,
  DataTableSchema,
  DecimalChart_Headings,
  DecimalChart_RowSchema,
  DecimalChartSchema,
  FractionBarSchema,
  FractionGridSchema,
  LinePlotSchema,
  LongDivisionSchema,
  NumberLine_TickLabelSchema,
  NumberLineSchema,
  Polygon_PointSchema,
  Polygon_SideLabelSchema,
  PolygonSchema,
  Solid_BoxSchema,
  SolidSchema,
  WorkSpaceSchema,
} from '../proto/v1/nodes_pb.js';
import {
  type ItemKind,
  CoordinatePoints_Mode,
  DecimalArithmetic_Op,
  DecimalForms_Mode,
  FractionMultiply_Mode,
  PrismVolume_Mode,
  ShapeHierarchy_Mode,
} from '../proto/v1/worksheet_pb.js';
import { type AtomSpec, blank, compare, frac, fractionBlank, gcd, halfBlank, math, node, row, text } from './build.js';
import { commas, mixed } from './draw.js';
import { type Ctx, list, numberWithDigits, pickFresh, unique } from './kinds.js';

export function generateG5(kind: ItemKind, ctx: Ctx): Node[] | undefined {
  const { rng } = ctx;
  const f = ctx.fields;
  const k = kind.kind;
  switch (k.case) {
    case 'numericalExpression': {
      const brackets = k.value.brackets;
      const [form, a, b, c, d] = pickFresh(ctx, k.case + brackets, () => [rng.int(0, brackets ? 2 : 4), rng.int(2, 9), rng.int(2, 9), rng.int(2, 9), rng.int(2, 9)]);
      let expr: string;
      let value: number;
      if (!brackets) {
        switch (form) {
          case 0:
            [expr, value] = [`(${a} + ${b}) × ${c}`, (a + b) * c];
            break;
          case 1:
            [expr, value] = [`${a} × (${b} + ${c})`, a * (b + c)];
            break;
          case 2:
            [expr, value] = [`(${a + b + c} − ${b}) × ${d}`, (a + c) * d];
            break;
          case 3:
            [expr, value] = [`${b * c + a * 10} − (${b} × ${c})`, a * 10];
            break;
          default:
            [expr, value] = [`(${a * c} + ${b * c}) ÷ ${c}`, a + b];
        }
      } else {
        switch (form) {
          case 0:
            [expr, value] = [`${a} × [${b} + (${c} × ${d})]`, a * (b + c * d)];
            break;
          case 1:
            [expr, value] = [`[(${a} + ${b}) × ${c}] − ${d}`, (a + b) * c - d];
            break;
          default:
            [expr, value] = [`${a} + [(${b} + ${c}) × ${d}]`, a + (b + c) * d];
        }
      }
      return [math(expr, '=', blank(f.field(`value of ${expr}`, String(value))))];
    }
    case 'expressionInWords': {
      const [form, a, b, c] = pickFresh(ctx, k.case, () => [rng.int(0, 4), rng.int(2, 9), rng.int(2, 9), rng.int(2, 9)]);
      switch (form) {
        case 0:
          return [text(`Add ${a} and ${b}, then multiply by ${c}.`), math(blank(f.field('the expression', `(${a} + ${b}) × ${c}`, [`${c} × (${a} + ${b})`])))];
        case 1:
          return [text(`Multiply ${a} by ${b}, then add ${c}.`), math(blank(f.field('the expression', `${a} × ${b} + ${c}`, [`(${a} × ${b}) + ${c}`, `${c} + ${a} × ${b}`])))];
        case 2:
          return [
            text(`Subtract ${b} from ${a * c + b}, then divide by ${c}.`),
            math(blank(f.field('the expression', `(${a * c + b} − ${b}) ÷ ${c}`))),
          ];
        case 3:
          return [text(`Double the sum of ${a} and ${b}.`), math(blank(f.field('the expression', `2 × (${a} + ${b})`, [`(${a} + ${b}) × 2`])))];
        default: {
          const big = 1000 * a + 100 * b + 10 * c + rng.int(1, 9);
          const small = rng.int(101, 999);
          return [math(`${c} × (${commas(big)} + ${small}) is`, blank(f.field(`times as large as ${commas(big)} + ${small}`, String(c))), `times as large as ${commas(big)} + ${small}.`)];
        }
      }
    }
    case 'twoPatterns': {
      const [a, times] = pickFresh(ctx, k.case, () => [rng.int(2, 6), rng.int(2, 4)]);
      const b = a * times;
      const rows = [0, 1, 2, 3, 4].map((step) => {
        const cell = (v: number, rule: string) =>
          step < 2
            ? create(DataTable_CellSchema, { kind: { case: 'text', value: String(v) } })
            : create(DataTable_CellSchema, { kind: { case: 'field', value: f.field(`step ${step} of add ${rule}`, String(v)) } });
        return create(DataTable_RowSchema, {
          cells: [create(DataTable_CellSchema, { kind: { case: 'text', value: String(step) } }), cell(step * a, String(a)), cell(step * b, String(b))],
        });
      });
      return [
        node({ case: 'dataTable', value: create(DataTableSchema, { header: ['Step', `Add ${a}`, `Add ${b}`], rows }) }),
        math(`Each term of "Add ${b}" is`, blank(f.field(`how many times the add ${a} term`, String(times))), `times the term of "Add ${a}".`),
      ];
    }
    case 'placeValueTenTimes': {
      const [digits, point, i, gap, d] = pickFresh(ctx, k.case, () => {
        const whole = rng.int(1, 2);
        const len = whole + rng.int(2, 3);
        const d = rng.int(1, 9);
        const gap = rng.next() < 0.7 ? 1 : 2;
        const i = rng.int(0, len - 1 - gap);
        const digits = Array.from({ length: len }, (_, j) => {
          let x = rng.int(0, 9);
          while (x === d || (j === 0 && x === 0)) {
            x = rng.int(0, 9);
          }
          return x;
        });
        digits[i] = d;
        digits[i + gap] = d;
        return [digits, whole, i, gap, d] as const;
      });
      const shown = digits.slice(0, point).join('') + '.' + digits.slice(point).join('');
      const value = (j: number) => placeValue(d, point - 1 - j);
      const ratio = String(10 ** gap);
      const fracRatio = frac(1, 10 ** gap);
      const swap = rng.next() < 0.4;
      return [
        chart(point - 1, digits.length - point, [{ number: shown }]),
        text(`In ${shown}, look at the two ${d}s.`),
        math(`The first ${d} is worth`, blank(f.field(`value of the first ${d} in ${shown}`, value(i)))),
        math(`The second ${d} is worth`, blank(f.field(`value of the second ${d} in ${shown}`, value(i + gap)))),
        swap
          ? math(`The second ${d} is worth`, blank(f.field(`second ${d} compared with the first`, fracRatio, [gap === 1 ? '0.1' : '0.01'])), `of the first.`)
          : math(`The first ${d} is worth`, blank(f.field(`first ${d} compared with the second`, ratio)), `times the second.`),
      ];
    }
    case 'powersOfTen': {
      if (!k.value.decimals) {
        const [form, n, a] = pickFresh(ctx, k.case, () => [rng.int(0, 2), rng.int(2, 5), rng.int(2, 99)]);
        if (form === 0) {
          return [math(`10${sup(n)} =`, blank(f.field(`10 to the power ${n}`, commas(10 ** n), [String(10 ** n)])))];
        }
        if (form === 1) {
          return [math(`${a} × 10${sup(n)} =`, blank(f.field(`${a} × 10 to the power ${n}`, commas(a * 10 ** n), [String(a * 10 ** n)])))];
        }
        return [math(`${commas(a * 10 ** n)} ÷ 10${sup(n)} =`, blank(f.field(`${a * 10 ** n} ÷ 10 to the power ${n}`, String(a))))];
      }
      const [divide, m, s, n, exp] = pickFresh(ctx, k.case + 'd', () => {
        for (;;) {
          const s = rng.int(0, 2);
          let m = s === 0 ? rng.int(2, 99) : numberWithDigits(rng, rng.int(2, 3), true);
          if (m % 10 === 0 && s > 0) {
            m++;
          }
          const divide = rng.next() < 0.5;
          const n = rng.int(1, 3);
          // Both numbers fit a chart from thousands to thousandths.
          const t = divide ? s + n : s - n;
          if (t <= 3 && String(m).length - t <= 4) {
            return [divide, m, s, n, rng.next() < 0.3] as const;
          }
        }
      });
      const by = exp ? `10${sup(n)}` : commas(10 ** n);
      const x = decimal(m, s);
      const answer = decimal(m, divide ? s + n : s - n);
      if (k.value.chart) {
        const label = `${x} ${divide ? '÷' : '×'} ${commas(10 ** n)}`;
        return [
          text(`${x} ${divide ? '÷' : '×'} ${by}`),
          chart(3, 3, [{ number: x }, { field: f.field(label, answer, answer.includes(',') ? [answer.replace(/,/g, '')] : []), note: `${divide ? '÷' : '×'} ${commas(10 ** n)}` }], true),
        ];
      }
      return [math(`${x} ${divide ? '÷' : '×'} ${by} =`, blank(f.field(`${x} ${divide ? '÷' : '×'} ${commas(10 ** n)}`, answer, answer.includes(',') ? [answer.replace(/,/g, '')] : [])))];
    }
    case 'decimalForms': {
      const mode = k.value.mode || DecimalForms_Mode.WORDS;
      if (mode === DecimalForms_Mode.COMPARE) {
        const [x, px, y, py] = pickFresh(ctx, k.case + mode, () => {
          const w = rng.pick([0, 0, rng.int(1, 9)]);
          const form = rng.int(0, 3);
          if (form === 0) {
            // Equal, with zeros on the end of one: 0.4 and 0.400.
            const t = rng.int(1, 99);
            const p = t % 10 === 0 ? 1 : 2;
            const v = w * 1000 + t * 10;
            return [v, p, v, 3] as const;
          }
          if (form === 1) {
            // The one with more digits is smaller: 0.4 and 0.389.
            const t = rng.int(2, 9);
            return [w * 1000 + t * 100, 1, w * 1000 + (t - 1) * 100 + rng.int(11, 99), 3] as const;
          }
          const a = w * 1000 + rng.int(1, 999);
          let b = w * 1000 + rng.int(1, 999);
          while (b === a) {
            b = w * 1000 + rng.int(1, 999);
          }
          return [a, 3, b, rng.pick([2, 3])] as const;
        });
        const flip = rng.next() < 0.5;
        const xs = fixed(x, 3, px);
        const ys = fixed(py === 2 ? Math.round(y / 10) * 10 : y, 3, py);
        const yv = py === 2 ? Math.round(y / 10) * 10 : y;
        const [l, r, lv, rv] = flip ? [ys, xs, yv, x] : [xs, ys, x, yv];
        const sign = lv > rv ? '>' : lv < rv ? '<' : '=';
        return [math(l, compare(f.field(`<, > or = between ${l} and ${r}`, sign)), r)];
      }
      const [w, m, p] = pickFresh(ctx, k.case + mode, () => {
        const w = rng.pick([0, rng.int(1, 9), rng.int(10, 99)]);
        const p = rng.pick([2, 3, 3]);
        let m = rng.int(1, 10 ** p - 1);
        while (m % 10 === 0) {
          m = rng.int(1, 10 ** p - 1);
        }
        return [w, m, p];
      });
      const num = `${w}.${String(m).padStart(p, '0')}`;
      if (mode === DecimalForms_Mode.WORDS) {
        const unit = ['', 'tenth', 'hundredth', 'thousandth'][p] + (m === 1 ? '' : 's');
        const said = (w ? `${words(w)} and ` : '') + `${words(m)} ${unit}`;
        return [math(said, '=', blank(f.field(`${said} as a number`, num)))];
      }
      // Digits and their places, largest first; 1 is ones, 1/10 is tenths.
      const ds = (String(w === 0 ? '' : w) + String(m).padStart(p, '0')).split('').map(Number);
      const wholeDigits = w === 0 ? 0 : String(w).length;
      const placeAtoms = (i: number, digit: AtomSpec): AtomSpec[] => {
        const e = wholeDigits - 1 - i;
        return e >= 0 ? [digit, '×', commas(10 ** e)] : [digit, '×', [1, 10 ** -e]];
      };
      if (mode === DecimalForms_Mode.EXPANDED) {
        const atoms: AtomSpec[] = [];
        ds.forEach((digit, i) => {
          if (digit === 0) {
            return;
          }
          if (atoms.length) {
            atoms.push('+');
          }
          atoms.push(...placeAtoms(i, digit));
        });
        return [math(...atoms, '=', blank(f.field('the number in expanded form', num)))];
      }
      // The chart: the number in a place-value chart; write it, and the
      // value of a digit that appears once.
      const once = ds.map((x, idx) => idx).filter((idx) => ds[idx] !== 0 && ds.indexOf(ds[idx]) === ds.lastIndexOf(ds[idx]));
      const ask = once.length ? rng.pick(once) : ds.findIndex((x) => x !== 0);
      const e = wholeDigits - 1 - ask;
      return [
        chart(Math.max(0, wholeDigits - 1), p, [{ number: num }]),
        math('The number is', blank(f.field('the number in the chart', num))),
        math(`The ${ds[ask]} is worth`, blank(f.field(`value of the ${ds[ask]} in ${num}`, placeValue(ds[ask], e)))),
      ];
    }
    case 'roundDecimal': {
      const [p, m] = pickFresh(ctx, k.case, () => {
        const p = rng.pick(list(k.value.places, [0, 1, 2]));
        const s = k.value.numberLine ? p + 1 : Math.min(3, p + rng.int(1, 2));
        let m = rng.int(10 ** s, 30 * 10 ** s);
        while (m % 10 === 0) {
          m = rng.int(10 ** s, 30 * 10 ** s);
        }
        return [p, [m, s] as const] as const;
      });
      const [n, s] = m;
      const step = 10 ** (s - p);
      const lower = Math.floor(n / step);
      const rounded = n - lower * step >= step / 2 ? lower + 1 : lower;
      const num = fixed(n, s, s);
      const answer = fixed(rounded, p, p);
      const place = ['whole number', 'tenth', 'hundredth'][p];
      const nodes = [text(`Round ${num} to the nearest ${place}.`)];
      if (k.value.numberLine) {
        const label = (tick: number, v: number, places: number) =>
          create(NumberLine_TickLabelSchema, { tick, value: { case: 'text', value: fixed(v, places, places) } });
        nodes.push(
          node({
            case: 'numberLine',
            value: create(NumberLineSchema, {
              start: 0,
              end: 1,
              partsPerUnit: 10,
              hideWholeLabels: true,
              hasArrow: true,
              arrowTick: n % 10,
              labels: [label(0, lower, p), label(5, lower * 10 + 5, p + 1), label(10, lower + 1, p)],
            }),
          }),
        );
      }
      nodes.push(math(num, '≈', blank(f.field(`${num} to the nearest ${place}`, answer, trimDecimal(answer) !== answer ? [trimDecimal(answer)] : []))));
      return nodes;
    }
    case 'multiDigitMultiply': {
      const [x, y] = pickFresh(ctx, k.case, () => [numberWithDigits(rng, k.value.topDigits || 3, true), numberWithDigits(rng, k.value.bottomDigits || 2)]);
      // One partial product per digit of the bottom number, ones first, as
      // the standard algorithm writes them.
      const partials = String(y)
        .split('')
        .reverse()
        .map((digit, i) => {
          const part = Number(digit) * 10 ** i;
          return create(ColumnArithmetic_PartialSchema, { field: f.field(`${part} × ${x}`, String(part * x)), note: `${commas(part)} × ${commas(x)}` });
        });
      return [
        node({
          case: 'columnArithmetic',
          value: create(ColumnArithmeticSchema, { op: ColumnArithmetic_Op.MULTIPLY, operands: [BigInt(x), BigInt(y)], partials, answer: f.field(`${x} × ${y}`, String(x * y)) }),
        }),
      ];
    }
    case 'divideByTwoDigits': {
      const digits = k.value.dividendDigits || 4;
      const [q, d, r] = pickFresh(ctx, k.case, () => {
        for (;;) {
          let d = rng.int(12, 89);
          if (d % 10 === 0) {
            d++;
          }
          const r = k.value.remainders && rng.next() < 0.6 ? rng.int(1, d - 1) : 0;
          const lo = Math.ceil(10 ** (digits - 1) / d);
          const hi = Math.floor((10 ** digits - 1 - r) / d);
          if (hi >= Math.max(lo, 10)) {
            return [rng.int(Math.max(lo, 10), hi), d, r];
          }
        }
      });
      const n = q * d + r;
      return [
        node({
          case: 'longDivision',
          value: create(LongDivisionSchema, {
            dividend: BigInt(n),
            divisor: d,
            quotient: f.field(`${n} ÷ ${d}`, String(q)),
            remainder: k.value.remainders ? f.field(`remainder of ${n} ÷ ${d}`, String(r)) : undefined,
            workRows: 2 * String(q).length + 1,
          }),
        }),
      ];
    }
    case 'decimalArithmetic': {
      const op = k.value.op || DecimalArithmetic_Op.ADD;
      if (op === DecimalArithmetic_Op.ADD || op === DecimalArithmetic_Op.SUBTRACT) {
        const sub = op === DecimalArithmetic_Op.SUBTRACT;
        const [p, x, y] = pickFresh(ctx, k.case + op, () => {
          const p = rng.int(1, 2);
          let x = rng.int(10 ** p, 99 * 10 ** p);
          let y = rng.int(10 ** (p - 1), 50 * 10 ** p);
          if (sub && y >= x) {
            [x, y] = [y + 1, x];
          }
          return [p, x, y];
        });
        const v = sub ? x - y : x + y;
        const answer = fixed(v, p, p);
        return [
          node({
            case: 'columnArithmetic',
            value: create(ColumnArithmeticSchema, {
              op: sub ? ColumnArithmetic_Op.SUBTRACT : ColumnArithmetic_Op.ADD,
              operands: [BigInt(x), BigInt(y)],
              carryBoxes: true,
              decimalPlaces: p,
              answer: f.field(`${fixed(x, p, p)} ${sub ? '−' : '+'} ${fixed(y, p, p)}`, answer, trimDecimal(answer) !== answer ? [trimDecimal(answer)] : []),
            }),
          }),
        ];
      }
      const divide = op === DecimalArithmetic_Op.DIVIDE;
      // Each value is [scaled integer, places].
      const [a, b, c] = pickFresh(ctx, k.case + op, () => {
        const form = rng.int(0, 2);
        if (!divide) {
          if (form === 0) {
            return [[rng.int(11, 99), 1], [rng.int(2, 9), 0], 0] as const;
          }
          if (form === 1) {
            return [[rng.int(11, 99), 2], [rng.int(2, 9), 0], 0] as const;
          }
          return [[rng.int(2, 29), 1], [rng.int(2, 9), 1], 0] as const;
        }
        if (form === 0) {
          // A decimal by a whole number: q × d ÷ d.
          const d = rng.int(2, 9);
          const q = rng.int(11, 199);
          return [[q * d, 2], [d, 0], [q, 2]] as const;
        }
        if (form === 1) {
          const d = rng.int(2, 9);
          const q = rng.int(11, 99);
          return [[q * d, 1], [d, 0], [q, 1]] as const;
        }
        // By a decimal, with a whole-number quotient: 3.6 ÷ 0.4.
        const d = rng.int(2, 15);
        const q = rng.int(2, 12);
        return [[q * d, 1], [d, 1], [q, 0]] as const;
      });
      const xs = decimal(a[0], a[1]);
      const ys = decimal(b[0], b[1]);
      const answer = divide ? decimal((c as readonly [number, number])[0], (c as readonly [number, number])[1]) : decimal(a[0] * b[0], a[1] + b[1]);
      const sign = divide ? '÷' : '×';
      return [math(`${xs} ${sign} ${ys} =`, blank(f.field(`${xs} ${sign} ${ys}`, answer))), workSpace(3)];
    }
    case 'unlikeFractions': {
      const ds = list(k.value.denominators, [2, 3, 4, 5, 6, 8, 10, 12]);
      const sub = k.value.subtract;
      const mixedNumbers = k.value.mixed;
      const [a, b, c, d] = pickFresh(ctx, k.case + sub + mixedNumbers, () => {
        for (;;) {
          const b = rng.pick(ds);
          const d = rng.pick(ds);
          if (b === d) {
            continue;
          }
          const w1 = mixedNumbers ? rng.int(2, 5) : 0;
          const w2 = mixedNumbers ? rng.int(1, 3) : 0;
          const a = w1 * b + rng.int(1, b - 1);
          const c = w2 * d + rng.int(1, d - 1);
          if (gcd(a % b, b) !== 1 || gcd(c % d, d) !== 1) {
            continue;
          }
          if (!sub || a * d > c * b) {
            return [a, b, c, d];
          }
        }
      });
      const n = sub ? a * d - c * b : a * d + c * b;
      const den = b * d;
      const opText = sub ? '−' : '+';
      const operand = (x: number, y: number): AtomSpec[] => (mixedNumbers ? [Math.floor(x / y), [x % y, y]] : [[x, y]]);
      const lcd = (b * d) / gcd(b, d);
      const answer = mixed(n, den);
      const also = unique([fracSimplest(n, den), frac((n * lcd) / den, lcd), frac(n, den), mixedRaw((n * lcd) / den, lcd)]).filter((x) => x !== answer);
      const label = `${mixedNumbers ? mixed(a, b) : frac(a, b)} ${opText} ${mixedNumbers ? mixed(c, d) : frac(c, d)}`;
      if (k.value.model && !mixedNumbers) {
        // Both fractions as (b × d)ths: a/b shades a columns, c/d shades c rows.
        const grid = (sc: number, sr: number) => node({ case: 'fractionGrid', value: create(FractionGridSchema, { cols: b, rows: d, shadedCols: sc, shadedRows: sr }) });
        return [
          row(grid(a, 0), grid(0, c)),
          math([a, b], opText, [c, d], '=', halfBlank(den, true, f.field(`${frac(a, b)} in ${den}ths`, String(a * d))), opText, halfBlank(den, true, f.field(`${frac(c, d)} in ${den}ths`, String(c * b)))),
          math('=', blank(f.field(label, answer, also))),
        ];
      }
      return [math(...operand(a, b), opText, ...operand(c, d), '=', blank(f.field(label, answer, also)))];
    }
    case 'fractionAsDivision': {
      const [form, a, b, i] = pickFresh(ctx, k.case, () => {
        const b = rng.int(2, 9);
        let a = rng.int(2, 3 * b);
        while (a % b === 0) {
          a = rng.int(2, 3 * b);
        }
        return [rng.int(0, 2), a, b, rng.int(0, SHARES.length - 1)];
      });
      const answer = frac(a, b);
      const also = unique([fracSimplest(a, b), mixed(a, b), mixedRaw(a, b)]).filter((x) => x !== answer);
      if (form === 0) {
        return [math(a, '÷', b, '=', fractionBlank(f.field(`${a} ÷ ${b}`, answer, also)))];
      }
      if (form === 1) {
        return [math([a, b], '=', blank(f.field(`numerator of ${frac(a, b)} as a division`, String(a))), '÷', blank(f.field(`denominator of ${frac(a, b)} as a division`, String(b))))];
      }
      const [things, unit, people] = SHARES[i];
      return [
        text(`${b} ${people} share ${a} ${things} equally. How much does each get?`),
        math('Each gets', blank(f.field(`${a} ${things} shared by ${b}`, answer, also)), unit),
      ];
    }
    case 'fractionMultiply': {
      const mode = k.value.mode || FractionMultiply_Mode.WHOLE;
      const [a, b, c, d] = pickFresh(ctx, k.case + mode, () => {
        const b = rng.int(2, mode === FractionMultiply_Mode.WHOLE ? 8 : 6);
        let a = rng.int(1, b - 1);
        while (gcd(a, b) !== 1) {
          a = rng.int(1, b - 1);
        }
        if (mode === FractionMultiply_Mode.WHOLE) {
          // Half the time the whole number is a multiple of the denominator.
          return [a, b, rng.next() < 0.5 ? b * rng.int(1, 4) : rng.int(2, 12), 1];
        }
        const d = rng.int(2, 6);
        let c = rng.int(1, d - 1);
        while (gcd(c, d) !== 1) {
          c = rng.int(1, d - 1);
        }
        return [a, b, c, d];
      });
      const n = a * c;
      const den = b * d;
      const answer = mixed(n, den);
      const also = unique([fracSimplest(n, den), frac(n, den), mixedRaw(n, den)]).filter((x) => x !== answer);
      if (mode === FractionMultiply_Mode.AREA) {
        const unit = rng.pick(['m', 'ft', 'in']);
        const pts = [
          [0, 0],
          [(8 * a) / b, 0],
          [(8 * a) / b, (8 * c) / d],
          [0, (8 * c) / d],
        ].map(([x, y]) => create(Polygon_PointSchema, { x, y }));
        const side = (t: string) => create(Polygon_SideLabelSchema, { text: t });
        return [
          node({ case: 'polygon', value: create(PolygonSchema, { points: pts, sides: [side(`${frac(a, b)} ${unit}`), side(`${frac(c, d)} ${unit}`), side(''), side('')], markRightAngles: true }) }),
          math('Area =', blank(f.field(`${frac(a, b)} × ${frac(c, d)} square ${unit}`, answer, also)), `square ${unit}`),
        ];
      }
      if (k.value.model && mode === FractionMultiply_Mode.FRACTION) {
        return [
          node({ case: 'fractionGrid', value: create(FractionGridSchema, { cols: b, rows: d, shadedCols: a, shadedRows: c }) }),
          math([a, b], '×', [c, d], '=', fractionBlank(f.field(`${frac(a, b)} × ${frac(c, d)}`, frac(n, den), unique([fracSimplest(n, den)]).filter((x) => x !== frac(n, den))))),
        ];
      }
      const right: AtomSpec = mode === FractionMultiply_Mode.WHOLE ? c : [c, d];
      return [math([a, b], '×', right, '=', blank(f.field(`${frac(a, b)} × ${mode === FractionMultiply_Mode.WHOLE ? c : frac(c, d)}`, answer, also)))];
    }
    case 'scalingCompare': {
      const [n, a, b, byWhole] = pickFresh(ctx, k.case, () => {
        const b = rng.int(2, 8);
        const kind = rng.int(0, 5);
        // Less than 1, more than 1, and now and then exactly 1.
        const a = kind < 2 ? rng.int(1, b - 1) : kind < 5 ? rng.int(b + 1, 2 * b + 1) : b;
        return [rng.int(4, 40), a, b, rng.next() < 0.3] as const;
      });
      if (byWhole) {
        // n × a/b against a/b: n is more than 1, so the product is larger.
        return [math(n, '×', [a, b], compare(f.field(`<, > or = between ${n} × ${frac(a, b)} and ${frac(a, b)}`, '>')), [a, b])];
      }
      const sign = a < b ? '<' : a > b ? '>' : '=';
      return [math([a, b], '×', n, compare(f.field(`<, > or = between ${frac(a, b)} × ${n} and ${n}`, sign)), n)];
    }
    case 'unitFractionDivide': {
      if (k.value.wholeByUnit) {
        const [n, b] = pickFresh(ctx, k.case + 'w', () => [rng.int(2, 6), rng.int(2, 5)]);
        const nodes: Node[] = [];
        if (n <= 4) {
          nodes.push(row(...Array.from({ length: n }, () => node({ case: 'fractionBar', value: create(FractionBarSchema, { parts: b }) }))));
        }
        nodes.push(math(n, '÷', [1, b], '=', blank(f.field(`${n} ÷ ${frac(1, b)}`, String(n * b)))));
        return nodes;
      }
      const [b, n] = pickFresh(ctx, k.case, () => [rng.int(2, 8), rng.int(2, 6)]);
      return [math([1, b], '÷', n, '=', fractionBlank(f.field(`${frac(1, b)} ÷ ${n}`, frac(1, b * n))))];
    }
    case 'convertMeasure': {
      const [i, toSmall, m, s] = pickFresh(ctx, k.case, () => {
        const i = rng.int(0, MEASURES.length - 1);
        const [, , per, metric] = MEASURES[i];
        const toSmall = rng.next() < 0.5;
        if (metric) {
          const places = Math.round(Math.log10(per));
          if (toSmall) {
            const s = rng.int(0, Math.min(2, places));
            let m = rng.int(2, 9 * 10 ** s);
            while (s > 0 && m % 10 === 0) {
              m++;
            }
            return [i, true, m, s] as const;
          }
          let m = rng.int(per / 10 + 1, 9 * per);
          while (m % per === 0) {
            m++;
          }
          return [i, false, m, 0] as const;
        }
        return toSmall ? ([i, true, rng.int(2, 9), 0] as const) : ([i, false, rng.int(1, 6) * per + rng.int(1, per - 1), 0] as const);
      });
      const [big, small, per, metric] = MEASURES[i];
      if (toSmall) {
        const x = decimal(m, s);
        const v = (m * per) / 10 ** s;
        return [math(`${x} ${big} =`, blank(f.field(`${x} ${big} in ${small}`, commas(v), v >= 1000 ? [String(v)] : [])), small)];
      }
      if (metric) {
        const v = decimal(m, Math.round(Math.log10(per)));
        return [math(`${commas(m)} ${small} =`, blank(f.field(`${m} ${small} in ${big}`, v)), big)];
      }
      const w = Math.floor(m / per);
      return [math(`${m} ${small} =`, blank(f.field(`whole ${big} in ${m} ${small}`, String(w))), big, blank(f.field(`${small} left over from ${m} ${small}`, String(m - w * per))), small)];
    }
    case 'linePlotShare': {
      const [counts, theme] = pickFresh(ctx, k.case, () => {
        for (;;) {
          const counts = Array(9).fill(0);
          const n = rng.int(5, 9);
          for (let j = 0; j < n; j++) {
            counts[rng.int(1, 7)]++;
          }
          const total = counts.reduce((s, c, t) => s + c * t, 0);
          if (total % n === 0) {
            return [counts as number[], rng.int(0, PLOT_THEMES.length - 1)] as const;
          }
        }
      });
      const [caption, things, unit] = PLOT_THEMES[theme];
      const n = counts.reduce((s, c) => s + c, 0);
      const total = counts.reduce((s, c, t) => s + c * t, 0);
      const ask = counts.findIndex((c, t) => t > 0 && c > 0);
      const totalAlso = unique([frac(total, 8), mixedRaw(total, 8), fracSimplest(total, 8)]).filter((x) => x !== mixed(total, 8));
      const share = total / n;
      const shareAlso = unique([frac(share, 8), frac(total, 8 * n), fracSimplest(share, 8)]).filter((x) => x !== mixed(share, 8));
      return [
        node({ case: 'linePlot', value: create(LinePlotSchema, { start: 0, end: 1, partsPerUnit: 8, counts, caption }) }),
        math(`${cap(things)} with ${mixed(ask, 8)} ${unit}:`, blank(f.field(`${things} with ${mixed(ask, 8)} ${unit}`, String(counts[ask])))),
        math('Total of all the amounts:', blank(f.field(`total ${unit}s`, mixed(total, 8), totalAlso)), `${unit}s`),
        text(`Share the total equally among the ${n} ${things}. How much does each get?`),
        math(blank(f.field(`equal share of ${mixed(total, 8)} among ${n}`, mixed(share, 8), shareAlso)), `${unit}s`),
      ];
    }
    case 'prismVolume': {
      const mode = k.value.mode || PrismVolume_Mode.COUNT;
      const box = (x: number, length: number, width: number, height: number, labels: string[] = []) =>
        create(Solid_BoxSchema, { x, length, width, height, lengthLabel: labels[0] ?? '', widthLabel: labels[1] ?? '', heightLabel: labels[2] ?? '' });
      if (mode === PrismVolume_Mode.COUNT || mode === PrismVolume_Mode.LAYERS) {
        const [l, w, h] = pickFresh(ctx, k.case + mode, () => [rng.int(2, 5), rng.int(2, 3), rng.int(2, 4)]);
        const solid = node({ case: 'solid', value: create(SolidSchema, { boxes: [box(0, l, w, h)], showCubes: true }) });
        if (mode === PrismVolume_Mode.COUNT) {
          return [solid, math('Volume =', blank(f.field(`cubes in a ${l} by ${w} by ${h} box`, String(l * w * h))), 'cubic units')];
        }
        return [
          solid,
          math('Cubes in the bottom layer:', blank(f.field(`cubes in a ${l} by ${w} layer`, String(l * w)))),
          math('Layers:', blank(f.field('layers', String(h)))),
          math('Volume =', blank(f.field(`cubes in a ${l} by ${w} by ${h} box`, String(l * w * h))), 'cubic units'),
        ];
      }
      const unit = rng.pick(['cm', 'in', 'ft', 'm']);
      if (mode === PrismVolume_Mode.FORMULA) {
        const [l, w, h, base] = pickFresh(ctx, k.case + mode, () => [rng.int(3, 12), rng.int(2, 8), rng.int(2, 10), rng.next() < 0.3] as const);
        const v = l * w * h;
        if (base) {
          return [
            node({ case: 'solid', value: create(SolidSchema, { boxes: [box(0, l, w, h, ['', '', `${h} ${unit}`])] }) }),
            text(`The base has an area of ${l * w} square ${unit}.`),
            math('Volume =', blank(f.field(`${l * w} × ${h}`, String(v))), `cubic ${unit}`),
          ];
        }
        return [
          node({ case: 'solid', value: create(SolidSchema, { boxes: [box(0, l, w, h, [`${l} ${unit}`, `${w} ${unit}`, `${h} ${unit}`])] }) }),
          math('Volume =', blank(f.field(`${l} × ${w} × ${h}`, String(v))), `cubic ${unit}`),
        ];
      }
      const [l1, h1, l2, h2, w] = pickFresh(ctx, k.case + mode, () => {
        const h1 = rng.int(2, 6);
        let h2 = rng.int(2, 6);
        while (h2 === h1) {
          h2 = rng.int(2, 6);
        }
        return [rng.int(3, 6), h1, rng.int(2, 4), h2, rng.int(2, 4)];
      });
      const v1 = l1 * w * h1;
      const v2 = l2 * w * h2;
      return [
        node({
          case: 'solid',
          value: create(SolidSchema, { boxes: [box(0, l1, w, h1, [`${l1} ${unit}`, '', `${h1} ${unit}`]), box(l1, l2, w, h2, [`${l2} ${unit}`, `${w} ${unit}`, `${h2} ${unit}`])] }),
        }),
        math('Left box:', blank(f.field(`${l1} × ${w} × ${h1}`, String(v1))), `cubic ${unit}`),
        math('Right box:', blank(f.field(`${l2} × ${w} × ${h2}`, String(v2))), `cubic ${unit}`),
        math('Whole shape:', blank(f.field(`${v1} + ${v2}`, String(v1 + v2))), `cubic ${unit}`),
      ];
    }
    case 'coordinatePoints': {
      const mode = k.value.mode || CoordinatePoints_Mode.READ;
      if (mode === CoordinatePoints_Mode.PROBLEM) {
        const [i, r] = pickFresh(ctx, k.case + mode, () => [rng.int(0, GRAPH_STORIES.length - 1), rng.pick([2, 3, 4, 5, 10])]);
        const [xTitle, yTitle, xNoun, yNoun] = GRAPH_STORIES[i];
        const points = [0, 1, 2, 3, 4].map((x) => create(CoordinateGrid_PointSchema, { x, y: r * x }));
        const later = rng.int(6, 8);
        return [
          node({ case: 'coordinateGrid', value: create(CoordinateGridSchema, { xMax: 8, yMax: 8 * r, yStep: r, xTitle, yTitle, points }) }),
          math(`${cap(yNoun)} after 3 ${xNoun}:`, blank(f.field(`${yNoun} after 3 ${xNoun}`, String(3 * r)))),
          math(`If the pattern goes on, ${yNoun} after ${later} ${xNoun}:`, blank(f.field(`${yNoun} after ${later} ${xNoun}`, String(later * r)))),
        ];
      }
      const pts = pickFresh(ctx, k.case + mode, () => {
        const out: [number, number][] = [];
        while (out.length < 3) {
          const p: [number, number] = [rng.int(0, 10), rng.int(0, 10)];
          // Different points, and not (0, 0), and no swapped pair, so (2, 5)
          // and (5, 2) never appear together.
          if ((p[0] || p[1]) && !out.some(([x, y]) => (x === p[0] && y === p[1]) || (x === p[1] && y === p[0]))) {
            out.push(p);
          }
        }
        return out;
      });
      const letters = mode === CoordinatePoints_Mode.READ ? ['A', 'B', 'C'] : ['P', 'Q', 'R'];
      const at = (i: number) => `(${pts[i][0]}, ${pts[i][1]})`;
      if (mode === CoordinatePoints_Mode.PLOT) {
        const answer = letters.map((l, i) => `${l} ${at(i)}`).join('; ');
        return [
          text(`Plot and label ${letters.map((l, i) => `${l} ${at(i)}`).join(', ')}.`),
          node({ case: 'coordinateGrid', value: create(CoordinateGridSchema, { xMax: 10, yMax: 10, plotField: f.field('points plotted', answer) }) }),
        ];
      }
      const points = pts.map(([x, y], i) => create(CoordinateGrid_PointSchema, { x, y, label: letters[i] }));
      return [
        node({ case: 'coordinateGrid', value: create(CoordinateGridSchema, { xMax: 10, yMax: 10, points }) }),
        ...letters.map((l, i) => math(`${l} is at`, blank(f.field(`coordinates of ${l}`, at(i), [`${pts[i][0]}, ${pts[i][1]}`, at(i).replace(' ', '')])))),
      ];
    }
    case 'shapeHierarchy': {
      if (k.value.mode === ShapeHierarchy_Mode.ALWAYS_SOMETIMES_NEVER) {
        const i = pickFresh(ctx, k.case + 'asn', () => rng.int(0, STATEMENTS.length - 1));
        const [statement, answer] = STATEMENTS[i];
        return [text(statement), node({ case: 'choices', value: create(ChoicesSchema, { options: ['always', 'sometimes', 'never'], field: f.field(statement, answer) }) })];
      }
      const i = pickFresh(ctx, k.case, () => rng.int(0, NAMED_QUADS.length - 1));
      const [pts, sides, name] = NAMED_QUADS[i];
      return [
        node({
          case: 'polygon',
          value: create(PolygonSchema, {
            points: pts.map(([x, y]) => create(Polygon_PointSchema, { x, y })),
            sides: sides.map((s) => create(Polygon_SideLabelSchema, { text: `${s} cm` })),
            markRightAngles: true,
          }),
        }),
        node({ case: 'choices', value: create(ChoicesSchema, { options: QUAD_NAMES, field: f.field('most exact name of the shape', name) }) }),
      ];
    }
  }
  return undefined;
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

// sup writes n in superscript digits, for an exponent: 3 is "³".
function sup(n: number): string {
  return [...String(n)].map((c) => SUPERSCRIPT[Number(c)]).join('');
}

// decimal writes m ÷ 10^s with no zeros on the end: decimal(470, 1) is
// "47" and decimal(5, 2) is "0.05". A negative s multiplies, with commas.
export function decimal(m: number, s: number): string {
  if (s <= 0) {
    return commas(m * 10 ** -s);
  }
  return trimDecimal(fixed(m, s, s));
}

// fixed writes m ÷ 10^s with exactly places digits after the point.
export function fixed(m: number, s: number, places: number): string {
  const v = places >= s ? m * 10 ** (places - s) : Math.round(m / 10 ** (s - places));
  if (places === 0) {
    return String(v);
  }
  const t = String(v).padStart(places + 1, '0');
  return `${t.slice(0, -places)}.${t.slice(-places)}`;
}

export function trimDecimal(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

// placeValue writes the value of digit d at the place 10^e: 7 at e = -2 is
// "0.07".
function placeValue(d: number, e: number): string {
  return e >= 0 ? commas(d * 10 ** e) : `0.${'0'.repeat(-e - 1)}${d}`;
}

// fracSimplest writes n/d in lowest terms, as a whole number if it is one.
function fracSimplest(n: number, d: number): string {
  const g = gcd(n, d);
  return d / g === 1 ? String(n / g) : frac(n / g, d / g);
}

// mixedRaw writes n/d as a mixed number without reducing the fraction part.
function mixedRaw(n: number, d: number): string {
  const w = Math.floor(n / d);
  const r = n - w * d;
  return w === 0 ? frac(r, d) : r === 0 ? String(w) : `${w} ${frac(r, d)}`;
}

// chart draws a decimal place-value chart from 10^high down to `decimals`
// places after the point.
function chart(high: number, decimals: number, rows: { number?: string; field?: Field; note?: string }[], powers = false): Node {
  return node({
    case: 'decimalChart',
    value: create(DecimalChartSchema, {
      high,
      decimals,
      headings: powers ? DecimalChart_Headings.POWERS : DecimalChart_Headings.NAMES,
      rows: rows.map((r) => create(DecimalChart_RowSchema, r)),
    }),
  });
}

function workSpace(rows: number): Node {
  return node({ case: 'workSpace', value: create(WorkSpaceSchema, { rows }) });
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

// words writes a whole number below 1,000 in words: 326 is "three hundred
// twenty-six".
export function words(n: number): string {
  if (n < 20) {
    return ONES[n];
  }
  if (n < 100) {
    return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  }
  return `${ONES[Math.floor(n / 100)]} hundred` + (n % 100 ? ' ' + words(n % 100) : '');
}

// Equal-share stories: what is shared, its unit, and who shares it.
const SHARES: [string, string, string][] = [
  ['pizzas', 'of a pizza', 'friends'],
  ['pounds of rice', 'pounds', 'families'],
  ['feet of ribbon', 'feet', 'children'],
  ['liters of juice', 'liters', 'tables'],
];

// Units to convert: the larger, the smaller, how many of the smaller make
// one of the larger, and whether the units are metric.
const MEASURES: [string, string, number, boolean][] = [
  ['m', 'cm', 100, true],
  ['km', 'm', 1000, true],
  ['cm', 'mm', 10, true],
  ['kg', 'g', 1000, true],
  ['L', 'mL', 1000, true],
  ['ft', 'in', 12, false],
  ['yd', 'ft', 3, false],
  ['gal', 'qt', 4, false],
  ['lb', 'oz', 16, false],
  ['hr', 'min', 60, false],
];

// Line plot themes: caption, what each X is, and the unit.
const PLOT_THEMES: [string, string, string][] = [
  ['Water in each beaker (liters)', 'beakers', 'liter'],
  ['Weight of each bag of beads (pounds)', 'bags', 'pound'],
  ['Length of each piece of string (yards)', 'pieces', 'yard'],
];

// Graph stories: x axis title, y axis title, and how the questions name
// each.
const GRAPH_STORIES: [string, string, string, string][] = [
  ['Hours worked', 'Dollars earned', 'hours', 'dollars'],
  ['Days', 'Pages read', 'days', 'pages'],
  ['Boxes', 'Pencils', 'boxes', 'pencils'],
  ['Minutes', 'Laps swum', 'minutes', 'laps'],
];

const QUAD_NAMES = ['trapezoid', 'parallelogram', 'rectangle', 'rhombus', 'square'];

// Quadrilaterals with whole-number sides: vertices, side lengths in order,
// and the most exact name.
const NAMED_QUADS: [[number, number][], number[], string][] = [
  [[[0, 0], [4, 0], [4, 4], [0, 4]], [4, 4, 4, 4], 'square'],
  [[[0, 0], [3, 0], [3, 3], [0, 3]], [3, 3, 3, 3], 'square'],
  [[[0, 0], [6, 0], [6, 3], [0, 3]], [6, 3, 6, 3], 'rectangle'],
  [[[0, 0], [7, 0], [7, 2], [0, 2]], [7, 2, 7, 2], 'rectangle'],
  [[[0, 0], [5, 0], [8, 4], [3, 4]], [5, 5, 5, 5], 'rhombus'],
  [[[0, 4], [3, 0], [6, 4], [3, 8]], [5, 5, 5, 5], 'rhombus'],
  [[[0, 0], [6, 0], [9, 4], [3, 4]], [6, 5, 6, 5], 'parallelogram'],
  [[[0, 0], [8, 0], [11, 4], [3, 4]], [8, 5, 8, 5], 'parallelogram'],
  [[[0, 0], [8, 0], [5, 4], [0, 4]], [8, 5, 5, 4], 'trapezoid'],
  [[[0, 0], [9, 0], [6, 4], [3, 4]], [9, 5, 3, 5], 'trapezoid'],
];

// Statements about the quadrilateral family, and whether each is always,
// sometimes or never true. None depends on how trapezoids are defined.
const STATEMENTS: [string, string][] = [
  ['A square is ___ a rectangle.', 'always'],
  ['A rectangle is ___ a square.', 'sometimes'],
  ['A rhombus is ___ a square.', 'sometimes'],
  ['A square is ___ a rhombus.', 'always'],
  ['A parallelogram is ___ a rectangle.', 'sometimes'],
  ['A rectangle is ___ a parallelogram.', 'always'],
  ['A rhombus ___ has four sides of equal length.', 'always'],
  ['A parallelogram ___ has four right angles.', 'sometimes'],
  ['A rectangle ___ has four sides of equal length.', 'sometimes'],
  ['A square ___ has two pairs of parallel sides.', 'always'],
  ['A triangle is ___ a quadrilateral.', 'never'],
  ['A rhombus is ___ a parallelogram.', 'always'],
  ['A pentagon ___ has four sides.', 'never'],
  ['A quadrilateral is ___ a rectangle.', 'sometimes'],
];
