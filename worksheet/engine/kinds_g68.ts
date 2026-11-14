// Item generators for grades 6 to 8. Each picks its values, writes the
// item's nodes, and computes every answer here, as kinds.ts does for the
// earlier grades. Negative numbers print with a minus sign (−); every answer
// that has one also accepts a hyphen.
import { create } from '@bufbuild/protobuf';

import {
  type Field,
  type Node,
  Angle_ArcLabelSchema,
  AngleSchema,
  AngleTriangleSchema,
  BoxPlotSchema,
  BoxSolidSchema,
  ChoicesSchema,
  CoordinatePlane_PointSchema,
  CoordinatePlane_SegmentSchema,
  CoordinatePlaneSchema,
  DoubleNumberLine_TickSchema,
  DoubleNumberLineSchema,
  HeightShapeSchema,
  Histogram_BinSchema,
  HistogramSchema,
  PrismNetSchema,
  RoundSolid_Kind,
  RoundSolidSchema,
  Transversal_LabelSchema,
  TransversalSchema,
  DataTable_CellSchema,
  DataTable_RowSchema,
  DataTableSchema,
  LinePlotSchema,
  LongDivisionSchema,
  NumberLine_TickLabelSchema,
  NumberLineSchema,
  Polygon_PointSchema,
  Polygon_SideLabelSchema,
  PolygonSchema,
  WorkSpaceSchema,
} from '../proto/v1/nodes_pb.js';
import {
  type ItemKind,
  Classify_Topic,
  CoordinateGeometry_Mode,
  DataSetStats_Mode,
  DecimalOperations_Op,
  EquivalentExpressions_Mode,
  Exponents_Mode,
  GcfLcm_Ask,
  Integers_Mode,
  LinearRelation_Mode,
  PercentOf_Ask,
  Probability_Mode,
  Pythagorean_Mode,
  RoundMeasure_Ask,
  RuleTable_Mode,
  ScientificNotation_Mode,
  ShapeArea_Shape,
  SignedArithmetic_Numbers,
  SolveEquation_Form,
  WriteExpression_Mode,
  AngleFacts_Mode,
} from '../proto/v1/worksheet_pb.js';
import { type AtomSpec, blank, compare, fractionBlank, gcd, halfBlank, math, node, row, text } from './build.js';
import { commas, mixed } from './draw.js';
import { type Ctx, inRange, list, names, pickFresh, unique } from './kinds.js';

const MINUS = '−';

// num writes a number as a child would: a minus sign, no trailing zeros, and
// no floating-point noise.
export function num(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return r < 0 ? MINUS + String(-r) : String(r === 0 ? 0 : r);
}

// paren puts a negative number in parentheses, for after an operator.
function paren(n: number): string {
  return n < 0 ? `(${num(n)})` : num(n);
}

// fracText writes n/d in lowest terms with its sign, or a whole number.
export function fracText(n: number, d: number): string {
  if (d < 0) {
    [n, d] = [-n, -d];
  }
  const g = gcd(n, d) || 1;
  const [a, b] = [n / g, d / g];
  const sign = a < 0 ? MINUS : '';
  return b === 1 ? sign + String(Math.abs(a)) : `${sign}${Math.abs(a)}/${b}`;
}

// mixedText writes n/d as a signed mixed number in lowest terms.
function mixedText(n: number, d: number): string {
  if (d < 0) {
    [n, d] = [-n, -d];
  }
  return (n < 0 ? MINUS : '') + mixed(Math.abs(n), d);
}

// field gives a field whose answer also reads with a hyphen for a minus sign
// and without spaces.
function field(ctx: Ctx, label: string, answer: string, also: string[] = []): Field {
  const all = [answer, ...also];
  const variants = all.flatMap((a) => [a, a.replaceAll(MINUS, '-'), a.replace(/\s+/g, ''), a.replaceAll(MINUS, '-').replace(/\s+/g, '')]);
  return ctx.fields.field(label, answer, unique(variants).filter((x) => x !== answer));
}

function choices(ctx: Ctx, label: string, options: string[], answer: string): Node {
  return node({ case: 'choices', value: create(ChoicesSchema, { options, field: ctx.fields.field(label, answer) }) });
}

function work(rows: number): Node {
  return node({ case: 'workSpace', value: create(WorkSpaceSchema, { rows }) });
}

function cellText(s: string) {
  return create(DataTable_CellSchema, { kind: { case: 'text', value: s } });
}

function cellField(f: Field) {
  return create(DataTable_CellSchema, { kind: { case: 'field', value: f } });
}

function table(header: string[], rows: ReturnType<typeof cellText>[][], title = ''): Node {
  return node({ case: 'dataTable', value: create(DataTableSchema, { title, header, rows: rows.map((cells) => create(DataTable_RowSchema, { cells })) }) });
}

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '−': '⁻', '-': '⁻' };

// sup writes an exponent in superscript digits.
export function sup(n: number): string {
  return [...num(n)].map((c) => SUP[c] ?? c).join('');
}

// power writes b to the e, and the forms a child might type for it.
function power(b: number, e: number): [string, string[]] {
  return [`${b}${sup(e)}`, [`${b}^${e}`, `${b}^${num(e)}`]];
}

// linear writes mx + b as a child would: "3x − 2", "x + 4", "−x", "5".
export function linear(m: number, b: number, v = 'x'): string {
  const term = m === 0 ? '' : m === 1 ? v : m === -1 ? MINUS + v : num(m) + v;
  if (b === 0) {
    return term || '0';
  }
  if (!term) {
    return num(b);
  }
  return `${term} ${b < 0 ? MINUS : '+'} ${num(Math.abs(b))}`;
}

// coefTerm writes m times v as a term: "3x", "x", "−x".
function coefTerm(m: number, v: string): string {
  return m === 1 ? v : m === -1 ? MINUS + v : num(m) + v;
}

// money writes cents as dollars: 125 is "1.25".
function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

// moneyAlso lists other ways to write a dollar amount.
function moneyAlso(cents: number): string[] {
  return unique([num(cents / 100), `$${money(cents)}`]);
}

function pt(x: number, y: number): string {
  return `(${num(x)}, ${num(y)})`;
}

function rngSign(ctx: Ctx): number {
  return ctx.rng.next() < 0.5 ? -1 : 1;
}

// nonzero picks a whole number from min to max that is not zero.
function nonzero(ctx: Ctx, min: number, max: number): number {
  let v = ctx.rng.int(min, max);
  while (v === 0) {
    v = ctx.rng.int(min, max);
  }
  return v;
}

// signedFrac writes a signed fraction as maths atoms, with parentheses when
// it follows an operator and is negative.
function signedFrac(n: number, d: number, after = false): AtomSpec[] {
  if (n >= 0) {
    return [[n, d]];
  }
  return after ? [`(${MINUS}`, [-n, d], ')'] : [MINUS, [-n, d]];
}

type PlaneInit = Parameters<typeof create<typeof CoordinatePlaneSchema>>[1];

function plane(init: PlaneInit): Node {
  return node({ case: 'coordinatePlane', value: create(CoordinatePlaneSchema, init) });
}

function gp(x: number, y: number, label = '') {
  return create(CoordinatePlane_PointSchema, { x, y, label });
}

function seg(x1: number, y1: number, x2: number, y2: number, more: { dashed?: boolean; label?: string; field?: Field; extend?: boolean; labelBefore?: boolean } = {}) {
  return create(CoordinatePlane_SegmentSchema, { x1, y1, x2, y2, ...more });
}

// moved is where a transformation takes (x, y): 0 translate by (dx, dy),
// 1 and 2 reflect across the x and y axes, 3 and 4 rotate 90° and 180°
// about the origin, 5 dilate by f from the origin.
function moved(form: number, x: number, y: number, dx: number, dy: number, f: number): [number, number] {
  return (
    [
      [x + dx, y + dy],
      [x, -y],
      [-x, y],
      [-y, x],
      [-x, -y],
      [f * x, f * y],
    ] as [number, number][]
  )[form];
}

// spread picks an index below n that this worksheet has not used yet for
// key, so items in a section vary their story or form. Once every index has
// been used, it starts another round.
function spread(ctx: Ctx, key: string, n: number): number {
  for (let round = 0; ; round++) {
    for (let i = 0; i < 40; i++) {
      const v = ctx.rng.int(0, n - 1);
      if (ctx.fresh(`${key}#${round}#${v}`)) {
        return v;
      }
    }
  }
}

function tick(top: string | Field, bottom: string | Field) {
  return create(DoubleNumberLine_TickSchema, {
    ...(typeof top === 'string' ? { top } : { topField: top }),
    ...(typeof bottom === 'string' ? { bottom } : { bottomField: bottom }),
  });
}

export function generateG68(kind: ItemKind, ctx: Ctx): Node[] | undefined {
  const { rng } = ctx;
  const k = kind.kind;
  switch (k.case) {
    case 'ratioLanguage': {
      const s = spread(ctx, k.case, RATIO_SCENES.length);
      const [a, b, form] = pickFresh(ctx, k.case + s, () => {
        const a = rng.int(2, 12);
        let b = rng.int(2, 12);
        while (b === a) {
          b = rng.int(2, 12);
        }
        return [a, b, rng.int(0, 2)];
      });
      const [first, second, where] = RATIO_SCENES[s];
      const [p1, p2] = [first.split(' ').pop(), second.split(' ').pop()];
      const all = p1 === p2 ? `all the ${p1}` : `all the ${p1} and ${p2}`;
      const [x, xn, y, yn] = form === 0 ? [first, a, second, b] : form === 1 ? [second, b, first, a] : [first, a, all, a + b];
      return [
        text(`There are ${a} ${first} and ${b} ${second} ${where}. Write the ratio of ${x} to ${y}.`),
        math(blank(field(ctx, `${x} in the ratio`, String(xn))), ':', blank(field(ctx, `${y} in the ratio`, String(yn)))),
      ];
    }
    case 'ratioTable': {
      const theme = spread(ctx, k.case, TABLE_THEMES.length);
      const [a, b, mults, flip] = pickFresh(ctx, k.case, () => {
        let a = inRange(rng, k.value.parts, 2, 9);
        let b = inRange(rng, k.value.parts, 2, 9);
        while (a === b || gcd(a, b) !== 1) {
          a = inRange(rng, k.value.parts, 2, 9);
          b = inRange(rng, k.value.parts, 2, 9);
        }
        return [a, b, [1, 2, 3, rng.int(4, 6), rng.int(7, 10)], rng.int(0, 1)];
      });
      const [left, right] = TABLE_THEMES[theme];
      if (k.value.doubleNumberLine) {
        const ticks = [0, 1, 2, 3, 4, 5].map((m, i) => {
          if (i < 2) {
            return tick(String(m * a), String(m * b));
          }
          return (i + flip) % 2 === 0
            ? tick(String(m * a), field(ctx, `${right} for ${m * a} ${left}`, String(m * b)))
            : tick(field(ctx, `${left} for ${m * b} ${right}`, String(m * a)), String(m * b));
        });
        return [node({ case: 'doubleNumberLine', value: create(DoubleNumberLineSchema, { topLabel: left, bottomLabel: right, ticks }) })];
      }
      const rows = mults.map((m, i) => {
        if (i === 0) {
          return [cellText(String(a)), cellText(String(b))];
        }
        const hideRight = (i + flip) % 2 === 1;
        return hideRight
          ? [cellText(String(m * a)), cellField(field(ctx, `${right} for ${m * a} ${left}`, String(m * b)))]
          : [cellField(field(ctx, `${left} for ${m * b} ${right}`, String(m * a))), cellText(String(m * b))];
      });
      return [table([left, right], rows)];
    }
    case 'unitRate': {
      if (k.value.fractions) {
        const [form, c, d, p, q] = pickFresh(ctx, k.case + 'f', () => {
          const [c, d] = rng.pick([[1, 2], [1, 3], [1, 4], [2, 3], [3, 4], [1, 6]] as const);
          const [p, q] = rng.pick([[2, 1], [3, 1], [4, 1], [6, 1], [3, 2], [5, 2], [4, 3], [5, 4]] as const);
          return [rng.int(0, 1), c, d, p, q];
        });
        // amount = rate × time, with rate p/q and time c/d.
        const amount = mixedText(p * c, q * d);
        const rate = mixedText(p, q);
        const also = q === 1 ? [] : [`${p}/${q}`];
        // Under one: "1/2 mile", "3/4 of a wall". One or more: "1 mile",
        // "1 1/3 miles", "3 walls".
        const under = p * c < q * d;
        const many = p * c > q * d;
        if (form === 0) {
          return [
            text(`${names[(c + p) % names.length]} walks ${amount} mile${many ? 's' : ''} in ${fracText(c, d)} hour.`),
            work(2),
            math(blank(field(ctx, 'miles per hour', rate, also)), 'miles per hour'),
          ];
        }
        return [
          text(`A painter covers ${under ? `${amount} of a wall` : `${amount} wall${many ? 's' : ''}`} in ${fracText(c, d)} hour.`),
          work(2),
          math(blank(field(ctx, 'walls per hour', rate, also)), 'walls per hour'),
        ];
      }
      const form = spread(ctx, k.case + 'form', 3);
      const item = spread(ctx, k.case + 'item', RATE_ITEMS.length);
      const [u, n, m] = pickFresh(ctx, k.case, () => {
        const u = form === 0 ? rng.pick([25, 40, 50, 75, 120, 125, 150, 250]) : form === 1 ? rng.int(6, 16) : rng.int(3, 12);
        const n = rng.int(3, 8);
        let m = rng.int(2, 12);
        while (m === n) {
          m = rng.int(2, 12);
        }
        return [u, n, m];
      });
      if (form === 0) {
        const thing = RATE_ITEMS[item];
        return [
          text(`${n} ${thing} cost $${money(n * u)}.`),
          math('One costs $', blank(field(ctx, `cost of one of ${n} for $${money(n * u)}`, money(u), moneyAlso(u)))),
          math(`${m} ${thing} cost $`, blank(field(ctx, `cost of ${m}`, money(m * u), moneyAlso(m * u)))),
        ];
      }
      const [who, what, per] = form === 1 ? ['A cyclist rides', 'miles', 'hour'] : ['A printer prints', 'pages', 'minute'];
      return [
        text(`${who} ${n * u} ${what} in ${n} ${per}s.`),
        math('Rate:', blank(field(ctx, `${what} per ${per}`, String(u))), `${what} per ${per}`),
        math(`In ${m} ${per}s:`, blank(field(ctx, `${what} in ${m} ${per}s`, String(u * m))), what),
      ];
    }
    case 'percentOf': {
      if (k.value.doubleNumberLine) {
        const [p, w] = pickFresh(ctx, k.case + 'dnl', () => {
          const p = rng.pick([10, 20, 25, 30, 40, 60, 70, 75, 80, 90]);
          return [p, (p % 25 === 0 ? 4 : 10) * rng.int(2, 30)];
        });
        const step = p % 25 === 0 ? 25 : 10;
        const ticks = [];
        for (let q = 0; q <= 100; q += step) {
          const top = q === 0 ? '0' : q === 100 ? String(w) : q === p ? field(ctx, `${p}% of ${w}`, num((p * w) / 100)) : '';
          ticks.push(tick(top, `${q}%`));
        }
        return [math(`${p}% of ${w} = ?`), node({ case: 'doubleNumberLine', value: create(DoubleNumberLineSchema, { topLabel: 'Amount', bottomLabel: 'Percent', ticks }) })];
      }
      const [p, w, ask] = pickFresh(ctx, k.case, () => {
        const p = rng.pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 90]);
        const step = 100 / gcd(p, 100);
        const w = step * rng.int(Math.max(1, Math.ceil(20 / step)), Math.floor(400 / step));
        return [p, w, k.value.ask || rng.int(1, 3)];
      });
      const part = (p * w) / 100;
      if (ask === PercentOf_Ask.PART) {
        return [math(`${p}% of ${w} =`, blank(field(ctx, `${p}% of ${w}`, num(part))))];
      }
      if (ask === PercentOf_Ask.WHOLE) {
        return [math(`${num(part)} is ${p}% of`, blank(field(ctx, `the whole that ${num(part)} is ${p}% of`, String(w))))];
      }
      return [math(`${num(part)} is`, blank(field(ctx, `${num(part)} as a percent of ${w}`, `${p}%`, [String(p)])), `of ${w}`)];
    }
    case 'rateConversion': {
      if (k.value.scale) {
        const [theme, s, len, back] = pickFresh(ctx, k.case + 's', () => [rng.int(0, 1), rng.pick([2, 4, 5, 10, 20, 25, 50]), rng.int(2, 15) + (rng.next() < 0.25 ? 0.5 : 0), rng.int(0, 1)]);
        const [small, big, what] = theme === 0 ? ['cm', 'km', 'Two towns are'] : ['inch', 'feet', 'A wall is'];
        const where = theme === 0 ? 'the map' : 'the plan';
        const key = theme === 0 ? `On a map, 1 cm stands for ${s} km.` : `On a floor plan, 1 inch stands for ${s} feet.`;
        if (back) {
          return [
            text(`${key} ${what} ${num(len * s)} ${big} ${theme === 0 ? 'apart' : 'long'}.`),
            math(`On ${where}:`, blank(field(ctx, `length on ${where}`, num(len), [`${num(len)} ${theme === 0 ? 'cm' : 'in'}`])), theme === 0 ? 'cm' : 'inches'),
          ];
        }
        return [
          text(`${key} ${what} ${num(len)} ${theme === 0 ? 'cm apart' : 'inches long'} on ${where}.`),
          math('Real length:', blank(field(ctx, 'real length', num(len * s), [`${num(len * s)} ${big}`])), big),
        ];
      }
      const i = spread(ctx, k.case, MEASURES.length);
      const [n, toSmall] = pickFresh(ctx, k.case + i, () => [rng.int(2, 12), rng.int(0, 1)]);
      const [big, small, per, one] = MEASURES[i];
      const many = n * per;
      const also = many >= 1000 ? [String(many)] : [];
      return [
        text(`1 ${one} = ${commas(per)} ${small}`),
        toSmall
          ? math(`${n} ${big} =`, blank(field(ctx, `${n} ${big} in ${small}`, commas(many), also)), small)
          : math(`${commas(many)} ${small} =`, blank(field(ctx, `${commas(many)} ${small} in ${big}`, String(n))), big),
      ];
    }
    case 'divideFractions': {
      const [form, w, a, b, c, d] = pickFresh(ctx, k.case, () => {
        const ds = [2, 3, 4, 5, 6, 8, 10, 12];
        const b = rng.pick(ds);
        const d = rng.pick(ds);
        const forms = k.value.mixed ? [0, 1, 2, 3, 3] : [0, 0, 1, 2];
        // Fractions in the question are in simplest form.
        const top = (den: number) => {
          let t = rng.int(1, den - 1);
          while (gcd(t, den) !== 1) {
            t = rng.int(1, den - 1);
          }
          return t;
        };
        return [rng.pick(forms), rng.int(1, 4), top(b), b, top(d), d];
      });
      // Each form as dividend p/q ÷ divisor r/s.
      const [p, q, r, s, atoms]: [number, number, number, number, AtomSpec[]] =
        form === 0
          ? [a, b, c, d, [[a, b], '÷', [c, d]]]
          : form === 1
            ? [w + 1, 1, c, d, [w + 1, '÷', [c, d]]]
            : form === 2
              ? [a, b, w + 1, 1, [[a, b], '÷', w + 1]]
              : [w * b + a, b, c, d, [w, [a, b], '÷', [c, d]]];
      const n = p * s;
      const m = q * r;
      const answer = mixed(n, m);
      const g = gcd(n, m);
      const also = unique([`${n / g}/${m / g}`, `${n}/${m}`]).filter((x) => x !== answer && !x.endsWith('/1'));
      return [math(...atoms, '=', blank(field(ctx, 'the quotient', answer, also)))];
    }
    case 'multiDigitDivision': {
      const digits = k.value.dividendDigits || 4;
      const [q, d, r] = pickFresh(ctx, k.case, () => {
        for (;;) {
          const d = rng.int(11, 99);
          const r = k.value.remainders && rng.next() < 0.6 ? rng.int(1, d - 1) : 0;
          const lo = Math.ceil((10 ** (digits - 1) - r) / d);
          const hi = Math.floor((10 ** digits - 1 - r) / d);
          if (hi >= Math.max(lo, 10)) {
            return [rng.int(Math.max(lo, 10), hi), d, r];
          }
        }
      });
      const dividend = q * d + r;
      return [
        node({
          case: 'longDivision',
          value: create(LongDivisionSchema, {
            dividend: BigInt(dividend),
            divisor: d,
            quotient: ctx.fields.field(`${dividend} ÷ ${d}`, String(q)),
            remainder: k.value.remainders ? ctx.fields.field(`remainder of ${dividend} ÷ ${d}`, String(r)) : undefined,
            workRows: 2 * digits,
          }),
        }),
      ];
    }
    case 'decimalOperations': {
      const ops = list(k.value.ops, [1, 2, 3, 4]);
      const [op, x, xs, y, ys] = pickFresh(ctx, k.case, () => {
        const op = rng.pick(ops);
        if (op === DecimalOperations_Op.ADD || op === DecimalOperations_Op.SUBTRACT) {
          const px = rng.int(1, 3);
          const py = rng.int(1, 3);
          let x = rng.int(10 ** px + 1, 10 ** (px + 2) - 1);
          let y = rng.int(10 ** py + 1, 10 ** (py + 2) - 1);
          x = x % 10 === 0 ? x + 1 : x;
          y = y % 10 === 0 ? y + 1 : y;
          let [a, b] = [x / 10 ** px, y / 10 ** py];
          let [as, bs] = [a.toFixed(px), b.toFixed(py)];
          if (op === DecimalOperations_Op.SUBTRACT && b > a) {
            [a, b, as, bs] = [b, a, bs, as];
          }
          return [op, a, as, b, bs];
        }
        if (op === DecimalOperations_Op.MULTIPLY) {
          const x = rng.int(12, 299);
          const py = rng.int(0, 2);
          const y = py === 0 ? rng.int(3, 24) : rng.int(2, 9) + (py === 2 ? 10 * rng.int(0, 2) : 0);
          const a = (x % 10 === 0 ? x + 3 : x) / 10;
          const b = y / 10 ** py;
          return [op, a, a.toFixed(1), b, b.toFixed(py)];
        }
        // A quotient with one or two decimal places, so it ends.
        const decimalDivisor = rng.next() < 0.5;
        const b = decimalDivisor ? rng.pick([0.2, 0.4, 0.5, 0.6, 0.8, 1.2, 1.5, 2.5]) : rng.int(2, 9);
        const pq = rng.int(1, 2);
        let qi = rng.int(11, 999);
        qi = qi % 10 === 0 ? qi + 1 : qi;
        const quotient = qi / 10 ** pq;
        const a = Math.round(quotient * b * 1e4) / 1e4;
        return [op, a, num(a), b, num(b)];
      });
      const sym = ['', '+', '−', '×', '÷'][op];
      const result = op === 1 ? x + y : op === 2 ? x - y : op === 3 ? x * y : x / y;
      return [math(xs, sym, ys, '=', blank(field(ctx, `${xs} ${sym} ${ys}`, num(result)))), work(op >= 3 ? 3 : 2)];
    }
    case 'gcfLcm': {
      const [ask, a, b, g] = pickFresh(ctx, k.case, () => {
        const ask = k.value.ask || rng.int(1, 3);
        if (ask === GcfLcm_Ask.LCM) {
          // Most pairs share a factor, so the product is not the least
          // common multiple; neither divides the other.
          const shared = rng.next() < 0.65;
          for (;;) {
            const a = rng.int(2, 12);
            const b = rng.int(2, 12);
            if (a !== b && a % b !== 0 && b % a !== 0 && (a * b) / gcd(a, b) <= 120 && (gcd(a, b) > 1) === shared) {
              return [ask, a, b, 0];
            }
          }
        }
        for (;;) {
          const g = rng.int(2, 12);
          const m = rng.int(1, 9);
          const n = rng.int(2, 9);
          if (m !== n && gcd(m, n) === 1 && g * m <= 100 && g * n <= 100) {
            return [ask, g * m, g * n, g];
          }
        }
      });
      if (ask === GcfLcm_Ask.LCM) {
        return [math(`LCM of ${a} and ${b} =`, blank(field(ctx, `LCM of ${a} and ${b}`, String((a * b) / gcd(a, b)))))];
      }
      if (ask === GcfLcm_Ask.GCF) {
        return [math(`GCF of ${a} and ${b} =`, blank(field(ctx, `GCF of ${a} and ${b}`, String(g))))];
      }
      return [
        math(
          `${a} + ${b} =`,
          blank(field(ctx, `GCF of ${a} and ${b}`, String(g))),
          '× (',
          blank(field(ctx, `${a} ÷ ${g}`, String(a / g))),
          '+',
          blank(field(ctx, `${b} ÷ ${g}`, String(b / g))),
          ')',
        ),
      ];
    }
    case 'twoWayTable': {
      const theme = pickFresh(ctx, k.case + 'theme', () => rng.int(0, TWO_WAY.length - 1));
      // Counts whose two columns differ clearly in the first row's share, so
      // the association question has a plain answer.
      const c = pickFresh(ctx, k.case, () => {
        for (;;) {
          const c = [rng.int(5, 30), rng.int(5, 30), rng.int(5, 30), rng.int(5, 30)];
          if (Math.abs(c[0] / (c[0] + c[2]) - c[1] / (c[1] + c[3])) >= 0.15) {
            return c;
          }
        }
      });
      const [rowNames, colNames, ofCol, ofRow, compare] = TWO_WAY[theme];
      const [a, b, x, y] = c;
      const tbl = table(
        ['', colNames[0], colNames[1], 'Total'],
        [
          [cellText(rowNames[0]), cellText(String(a)), cellText(String(b)), cellField(ctx.fields.field(`${rowNames[0]} total`, String(a + b)))],
          [cellText(rowNames[1]), cellText(String(x)), cellText(String(y)), cellField(ctx.fields.field(`${rowNames[1]} total`, String(x + y)))],
          [
            cellText('Total'),
            cellField(ctx.fields.field(`${colNames[0]} total`, String(a + x))),
            cellField(ctx.fields.field(`${colNames[1]} total`, String(b + y))),
            cellField(ctx.fields.field('grand total', String(a + b + x + y))),
          ],
        ],
      );
      const f1 = fracText(a, a + x);
      const f2 = fracText(b, a + b);
      return [
        tbl,
        math(ofCol, fractionBlank(ctx.fields.field(ofCol, f1, unique([`${a}/${a + x}`]).filter((s) => s !== f1)))),
        math(ofRow, fractionBlank(ctx.fields.field(ofRow, f2, unique([`${b}/${a + b}`]).filter((s) => s !== f2)))),
        text(compare),
        choices(ctx, compare, ['yes', 'no'], a / (a + x) > b / (b + y) ? 'yes' : 'no'),
      ];
    }
    case 'integers': {
      const mode = k.value.mode || Integers_Mode.COMPARE;
      switch (mode) {
        case Integers_Mode.NUMBER_LINE: {
          const t = pickFresh(ctx, k.case + mode, () => {
            // Mostly negative, the new part of the line.
            const negative = rng.next() < 0.7;
            let t = negative ? rng.int(1, 9) : rng.int(11, 19);
            while (t % 5 === 0) {
              t = negative ? rng.int(1, 9) : rng.int(11, 19);
            }
            return t;
          });
          const labels = [0, 5, 10, 15, 20].map((i) => create(NumberLine_TickLabelSchema, { tick: i, value: { case: 'text', value: num(i - 10) } }));
          return [
            node({ case: 'numberLine', value: create(NumberLineSchema, { start: -10, end: 10, partsPerUnit: 1, hideWholeLabels: true, labels, hasArrow: true, arrowTick: t }) }),
            math('The arrow is at', blank(field(ctx, 'the integer at the arrow', num(t - 10)))),
          ];
        }
        case Integers_Mode.OPPOSITE: {
          // The second form is the opposite of a negative number, −(−n).
          const [n, form] = pickFresh(ctx, k.case + mode, () => {
            const form = rng.int(0, 1);
            const n = nonzero(ctx, -15, 15);
            return [form === 1 ? -Math.abs(n) : n, form];
          });
          return form === 0
            ? [math(`The opposite of ${num(n)} is`, blank(field(ctx, `the opposite of ${num(n)}`, num(-n))))]
            : [math(`${MINUS}(${num(n)}) =`, blank(field(ctx, `the opposite of ${num(n)}`, num(-n))))];
        }
        case Integers_Mode.ABSOLUTE_VALUE: {
          const form = spread(ctx, k.case + mode, 3);
          const [a, b] = pickFresh(ctx, k.case + mode, () => {
            const a = nonzero(ctx, -20, -1);
            let b = nonzero(ctx, -20, 20);
            while (Math.abs(b) === Math.abs(a)) {
              b = nonzero(ctx, -20, 20);
            }
            return [a, b];
          });
          if (form === 2) {
            const far = Math.abs(a) > Math.abs(b) ? a : b;
            return [text('Which is farther from 0?'), choices(ctx, `farther from 0: ${num(a)} or ${num(b)}`, [num(a), num(b)], num(far))];
          }
          const n = form === 0 ? a : b;
          return [math(`|${num(n)}| =`, blank(field(ctx, `absolute value of ${num(n)}`, num(Math.abs(n)))))];
        }
        case Integers_Mode.ORDER: {
          const xs = pickFresh(ctx, k.case + mode, () => {
            const xs: number[] = [];
            while (xs.length < 4) {
              const v = xs.length < 2 ? rng.int(-15, -1) : rng.int(-15, 15);
              if (!xs.includes(v)) {
                xs.push(v);
              }
            }
            return xs;
          });
          const sorted = [...xs].sort((p, q) => p - q).map(num);
          return [math(xs.map(num).join(',  ')), math('Least to greatest:', blank(field(ctx, `${xs.map(num).join(', ')} in order`, sorted.join(', '))))];
        }
        case Integers_Mode.CONTEXT: {
          const i = spread(ctx, k.case + mode, CONTEXTS.length);
          const n = pickFresh(ctx, k.case + mode + i, () => rng.int(2, 60));
          const [phrase, sign] = CONTEXTS[i];
          return [text(phrase.replace('#', String(n))), math('Integer:', blank(field(ctx, phrase.replace('#', String(n)), num(sign * n))))];
        }
        case Integers_Mode.ORDER_IN_CONTEXT: {
          const form = spread(ctx, k.case + mode, 4);
          const [a, b] = pickFresh(ctx, k.case + mode, () => {
            const a = rng.int(-30, 10);
            let b = rng.int(-30, -1);
            while (b === a) {
              b = rng.int(-30, -1);
            }
            return [a, b];
          });
          const [q, unit, low] = [
            ['Which is colder?', '°F', true],
            ['Which is warmer?', '°F', false],
            ['Which is lower?', ' feet', true],
            ['Which is higher?', ' feet', false],
          ][form] as [string, string, boolean];
          const pick = low === a < b ? a : b;
          return [text(q), choices(ctx, `${q} ${num(a)}${unit} or ${num(b)}${unit}`, [num(a) + unit, num(b) + unit], num(pick) + unit)];
        }
        case Integers_Mode.DEBT: {
          const form = spread(ctx, k.case + mode, 3);
          const [a, b] = pickFresh(ctx, k.case + mode, () => {
            const a = 5 * rng.int(2, 20);
            let b = 5 * rng.int(2, 20);
            while (b === a) {
              b = 5 * rng.int(2, 20);
            }
            return [a, b];
          });
          if (form === 0) {
            return [math(`A balance of ${MINUS}$${a} is a debt of $`, blank(field(ctx, `debt for a balance of −$${a}`, String(a))))];
          }
          if (form === 1) {
            return [math(`A balance less than ${MINUS}$${a} is a debt of more than $`, blank(field(ctx, `debt for a balance below −$${a}`, String(a))))];
          }
          const big = Math.max(a, b);
          return [text(`Which balance is the bigger debt?`), choices(ctx, 'the bigger debt', [`${MINUS}$${a}`, `${MINUS}$${b}`], `${MINUS}$${big}`)];
        }
        default: {
          const [a, b] = pickFresh(ctx, k.case + mode, () => {
            // Most pairs are both negative, where children slip most.
            if (rng.next() < 0.6) {
              const a = rng.int(-20, -1);
              let b = rng.int(-20, -1);
              while (b === a) {
                b = rng.int(-20, -1);
              }
              return [a, b];
            }
            const a = rng.int(-20, 20);
            let b = rng.int(-20, 20);
            while (b === a || (a >= 0 && b >= 0)) {
              b = rng.int(-20, 20);
            }
            return [a, b];
          });
          const sign = a > b ? '>' : '<';
          return [math(num(a), compare(ctx.fields.field(`<, > or = between ${num(a)} and ${num(b)}`, sign)), num(b))];
        }
      }
    }
    case 'coordinateGeometry': {
      const mode = k.value.mode || CoordinateGeometry_Mode.REFLECT;
      const pair = (label: string, x: number, y: number): Node =>
        math(label, '(', blank(field(ctx, `${label} x`, num(x))), ',', blank(field(ctx, `${label} y`, num(y))), ')');
      const six = { xMin: -6, xMax: 6, yMin: -6, yMax: 6 };
      switch (mode) {
        case CoordinateGeometry_Mode.QUADRANT: {
          const quad = spread(ctx, k.case + 'quadrant', 4);
          const [x, y] = pickFresh(ctx, k.case + mode, () => [(quad === 0 || quad === 3 ? 1 : -1) * rng.int(1, 5), (quad < 2 ? 1 : -1) * rng.int(1, 5)]);
          const q = x > 0 ? (y > 0 ? 'I' : 'IV') : y > 0 ? 'II' : 'III';
          return [
            plane({ ...six, points: [gp(x, y, 'P')] }),
            pair('P', x, y),
            math('Quadrant:'),
            choices(ctx, `quadrant of ${pt(x, y)}`, ['I', 'II', 'III', 'IV'], q),
          ];
        }
        case CoordinateGeometry_Mode.DISTANCE: {
          const [same, c, p, q] = pickFresh(ctx, k.case + mode, () => {
            const p = nonzero(ctx, -6, 6);
            let q = nonzero(ctx, -6, 6);
            while (q === p || Math.sign(q) === Math.sign(p)) {
              q = nonzero(ctx, -6, 6);
            }
            return [rng.int(0, 1), rng.int(-6, 6), p, q];
          });
          const [ax, ay, bx, by] = same ? [c, p, c, q] : [p, c, q, c];
          return [
            plane({ ...six, points: [gp(ax, ay, 'A'), gp(bx, by, 'B')] }),
            math(`A${pt(ax, ay)} to B${pt(bx, by)}:`, blank(field(ctx, `distance from ${pt(ax, ay)} to ${pt(bx, by)}`, String(Math.abs(p - q)))), 'units'),
          ];
        }
        case CoordinateGeometry_Mode.RECTANGLE: {
          const [x1, x2, y1, y2] = pickFresh(ctx, k.case + mode, () => [rng.int(-6, -1), rng.int(1, 6), rng.int(1, 6), rng.int(-6, -1)]);
          const w = x2 - x1;
          const h = y1 - y2;
          return [
            text(`A${pt(x1, y1)}, B${pt(x2, y1)} and C${pt(x2, y2)} are corners of rectangle ABCD.`),
            plane({ ...six, points: [gp(x1, y1, 'A'), gp(x2, y1, 'B'), gp(x2, y2, 'C')] }),
            pair('D', x1, y2),
            row(
              math('AB =', blank(field(ctx, 'length of AB', String(w)))),
              math('BC =', blank(field(ctx, 'length of BC', String(h)))),
              math('Area =', blank(field(ctx, 'area of the rectangle', String(w * h))), 'sq units'),
            ),
          ];
        }
        case CoordinateGeometry_Mode.TRANSFORM: {
          // A triangle and a move that keeps its image on the grid.
          const [form, tri, dx, dy, f] = pickFresh(ctx, k.case + mode, () => {
            for (;;) {
              const tri: [number, number][] = [];
              while (tri.length < 3) {
                const q: [number, number] = [rng.int(-4, 4), rng.int(-4, 4)];
                if (!tri.some(([a, b]) => a === q[0] || b === q[1])) {
                  tri.push(q);
                }
              }
              const form = rng.int(0, 5);
              const [dx, dy, f] = [nonzero(ctx, -4, 4), nonzero(ctx, -4, 4), 2];
              const img = tri.map(([x, y]) => moved(form, x, y, dx, dy, f));
              if (img.every(([x, y]) => Math.abs(x) <= 7 && Math.abs(y) <= 7) && (form !== 5 || tri.every(([x, y]) => x !== 0 || y !== 0))) {
                return [form, tri, dx, dy, f] as const;
              }
            }
          });
          const lr = (n: number) => `${Math.abs(n)} ${n > 0 ? 'right' : 'left'}`;
          const ud = (n: number) => `${Math.abs(n)} ${n > 0 ? 'up' : 'down'}`;
          const says = [
            `Translate triangle ABC ${lr(dx)} and ${ud(dy)}.`,
            'Reflect triangle ABC across the x-axis.',
            'Reflect triangle ABC across the y-axis.',
            'Rotate triangle ABC 90° counterclockwise about the origin.',
            'Rotate triangle ABC 180° about the origin.',
            `Dilate triangle ABC by a scale factor of ${f} from the origin.`,
          ];
          const img = tri.map(([x, y]) => moved(form, x, y, dx, dy, f));
          const names = ['A', 'B', 'C'];
          const drawn = img.map(([x, y], i) => `${names[i]}′${pt(x, y)}`).join(', ');
          return [
            text(says[form] + ' Draw the image, then write the coordinates of A′.'),
            plane({
              xMin: -7,
              xMax: 7,
              yMin: -7,
              yMax: 7,
              points: tri.map(([x, y], i) => gp(x, y, names[i])),
              segments: tri.map(([x, y], i) => seg(x, y, tri[(i + 1) % 3][0], tri[(i + 1) % 3][1])),
              plotField: ctx.fields.field('the image drawn', drawn),
            }),
            pair('A′', img[0][0], img[0][1]),
          ];
        }
        default: {
          const axis = spread(ctx, k.case + 'axis', 2);
          const [x, y] = pickFresh(ctx, k.case + mode + axis, () => [nonzero(ctx, -6, 6), nonzero(ctx, -6, 6)]);
          const [nx, ny] = axis === 0 ? [x, -y] : [-x, y];
          return [
            text(`Plot A′, the reflection of A across the ${axis === 0 ? 'x' : 'y'}-axis.`),
            plane({ ...six, points: [gp(x, y, 'A')], plotField: ctx.fields.field('the reflection plotted', `A′ at ${pt(nx, ny)}`) }),
            pair('A′', nx, ny),
          ];
        }
      }
    }
    case 'exponents': {
      const mode = k.value.mode || Exponents_Mode.EVALUATE;
      switch (mode) {
        case Exponents_Mode.WRITE_POWER: {
          const [b, e] = pickFresh(ctx, k.case + mode, () => [rng.int(2, 9), rng.int(3, 6)]);
          const [ans, also] = power(b, e);
          return [math(Array(e).fill(b).join(' × '), '=', blank(field(ctx, `${b} used ${e} times as a factor`, ans, also)))];
        }
        case Exponents_Mode.RULES: {
          // Each form before any repeats, and only the last form may come out
          // as 1, so the sheet is not full of answers of 1.
          const form = pickFresh(ctx, k.case + mode + 'form', () => rng.int(0, 4));
          const [b, m, n] = pickFresh(ctx, k.case + mode, () => {
            for (;;) {
              const [b, m, n] = [rng.int(2, 7), nonzero(ctx, -5, 6), nonzero(ctx, -4, 5)];
              if (form === 3 || form === 4 || (form === 0 ? m + n : form === 1 ? m - n : m) !== 0) {
                return [b, m, n];
              }
            }
          });
          if (form === 3) {
            const e = Math.abs(n) + 1;
            return [math(`${b}${sup(-e)} =`, halfBlank(1, false, field(ctx, `${b} to the −${e}`, String(b ** e))))];
          }
          if (form === 4) {
            return [math(`${b}${sup(m)} × ${b}${sup(-m)} =`, blank(field(ctx, `${b}${sup(m)} × ${b}${sup(-m)}`, '1', [`${b}⁰`, `${b}^0`])))];
          }
          const [lhs, e] =
            form === 0 ? [`${b}${sup(m)} × ${b}${sup(n)}`, m + n] : form === 1 ? [`${b}${sup(m)} ÷ ${b}${sup(n)}`, m - n] : [`(${b}${sup(m)})${sup(Math.abs(n))}`, m * Math.abs(n)];
          if (e === 0) {
            return [math(lhs, '=', blank(field(ctx, `${lhs} as one power`, '1', [`${b}⁰`, `${b}^0`])))];
          }
          const [ans, also] = power(b, e);
          const value = e >= 0 ? b ** e : 0;
          const extra = e >= 0 && value <= 100000 ? [String(value)] : e < 0 ? [`1/${b}${sup(-e)}`, `1/${b ** -e}`] : [];
          return [math(lhs, '=', blank(field(ctx, `${lhs} as one power`, ans, [...also, ...extra])))];
        }
        case Exponents_Mode.ROOTS: {
          const [form, n] = pickFresh(ctx, k.case + mode, () => {
            const form = rng.int(0, 3);
            return [form, form % 2 === 0 ? rng.int(2, 15) : rng.int(1, 6) + (rng.next() < 0.15 ? 4 : 0)];
          });
          const lines: [string, string][] = [
            [`√${n * n} =`, `square root of ${n * n}`],
            [`∛${n ** 3} =`, `cube root of ${n ** 3}`],
            [`x² = ${n * n} and x > 0, so x =`, `positive solution of x² = ${n * n}`],
            [`x³ = ${n ** 3}, so x =`, `solution of x³ = ${n ** 3}`],
          ];
          const [say, label] = lines[form];
          return [math(say, blank(field(ctx, label, String(n))))];
        }
        case Exponents_Mode.ESTIMATE_ROOT: {
          const n = pickFresh(ctx, k.case + mode, () => {
            let n = rng.int(3, 150);
            while (Number.isInteger(Math.sqrt(n))) {
              n = rng.int(3, 150);
            }
            return n;
          });
          const lo = Math.floor(Math.sqrt(n));
          return [math(`√${n} is between`, blank(field(ctx, `whole number just below √${n}`, String(lo))), 'and', blank(field(ctx, `whole number just above √${n}`, String(lo + 1))))];
        }
        default: {
          const form = spread(ctx, k.case + mode, 6);
          const [a, b, c] = pickFresh(ctx, k.case + mode + form, () => {
            for (;;) {
              const [a, b, c] = [rng.int(2, 9), rng.int(2, 6), rng.int(2, 5)];
              // Keep c³ − a × b at 0 or more.
              if (form !== 3 || c ** 3 >= a * b) {
                return [a, b, c];
              }
            }
          });
          // A single power stays under 1,000.
          const e = c > 4 || (c === 4 && a > 5) ? 3 : c;
          const forms: [string, number][] = [
            [`${a}${sup(e)}`, a ** e],
            [`${a + 4} + ${b} × ${c}²`, a + 4 + b * c * c],
            [`(${a} + ${b})² − ${c}`, (a + b) ** 2 - c],
            [`${c}³ − ${a} × ${b}`, c ** 3 - a * b],
            [`${a}² + ${b}²`, a * a + b * b],
            [`${b * c * c} ÷ ${c}² + ${a}`, b + a],
          ];
          const [expr, v] = forms[form];
          return [math(expr, '=', blank(field(ctx, expr, num(v))))];
        }
      }
    }
    case 'writeExpression': {
      const mode = k.value.mode || WriteExpression_Mode.FROM_WORDS;
      const n = mode === WriteExpression_Mode.INEQUALITY ? INEQUALITIES.length : mode === WriteExpression_Mode.CONTEXT ? STORIES.length : mode === WriteExpression_Mode.PARTS ? 3 : WORDS.length;
      const i = spread(ctx, k.case + mode, n);
      const [a, b, vi] = pickFresh(ctx, k.case + mode + i, () => {
        const a = rng.int(2, 12);
        let b = rng.int(2, 12);
        while (b === a) {
          b = rng.int(2, 12);
        }
        return [a, b, rng.int(0, VARS.length - 1)];
      });
      const v = VARS[vi];
      if (mode === WriteExpression_Mode.PARTS) {
        const w = VARS[(vi + 1) % VARS.length];
        const [expr, terms] = i === 0 ? [`${a}${v} + ${b}`, 2] : i === 1 ? [`${b} + ${a}${v} + ${a + b}${w}`, 3] : [`${a}${v} − ${b}`, 2];
        const constant = i === 2 ? num(-b) : String(b);
        return [
          math(expr),
          row(
            math(`Coefficient of ${v}:`, blank(field(ctx, `coefficient of ${v} in ${expr}`, String(a)))),
            math('Constant:', blank(field(ctx, `constant in ${expr}`, constant, i === 2 ? [String(b)] : []))),
            math('Number of terms:', blank(field(ctx, `number of terms in ${expr}`, String(terms)))),
          ),
        ];
      }
      const [say, answer, also] =
        mode === WriteExpression_Mode.INEQUALITY ? INEQUALITIES[i](a * 5, b) : mode === WriteExpression_Mode.CONTEXT ? STORIES[i](a, b, v) : WORDS[i](a, b, v);
      return [text(say), math(blank(field(ctx, say, answer, also)))];
    }
    case 'evaluateExpression': {
      const neg = k.value.negatives;
      const form = spread(ctx, k.case, 5);
      const [a, b, x, y] = pickFresh(ctx, k.case + form, () => {
        const pickV = () => (neg ? nonzero(ctx, -9, 9) : rng.int(1, 9));
        return [rng.int(2, 9), rng.int(1, 12), pickV(), pickV()];
      });
      // Each form: the expression, which variables it uses, and its value.
      const forms: [string, boolean, number][] = [
        [`${a}x + ${b}`, false, a * x + b],
        [`${a}(x + ${b})`, false, a * (x + b)],
        [`x² + ${b}`, false, x * x + b],
        [`${a}x − y`, true, a * x - y],
        [`x² − ${a}y`, true, x * x - a * y],
      ];
      const [expr, usesY, v] = forms[form];
      const vals = usesY ? `x = ${num(x)} and y = ${num(y)}` : `x = ${num(x)}`;
      return [text(`Find ${expr} when ${vals}.`), work(1), math('Value:', blank(field(ctx, `${expr} when ${vals}`, num(v))))];
    }
    case 'equivalentExpressions': {
      const mode = k.value.mode || EquivalentExpressions_Mode.EXPAND;
      const neg = k.value.negatives;
      const pickN = (lo: number, hi: number) => (neg ? rngSign(ctx) : 1) * rng.int(lo, hi);
      switch (mode) {
        case EquivalentExpressions_Mode.FACTOR: {
          const [g, m, c, s] = pickFresh(ctx, k.case + mode, () => {
            for (;;) {
              const m = rng.int(1, 9);
              const c = rng.int(1, 9);
              if (gcd(m, c) === 1) {
                return [rng.int(2, 9), m, c, neg && rng.next() < 0.5 ? -1 : 1];
              }
            }
          });
          const expr = linear(g * m, s * g * c);
          const answer = `${g}(${linear(m, s * c)})`;
          return [math(expr, '=', blank(field(ctx, `${expr} with ${g} factored out`, answer)))];
        }
        case EquivalentExpressions_Mode.COMBINE: {
          const [a, b, c, d] = pickFresh(ctx, k.case + mode, () => {
            for (;;) {
              const a = pickN(2, 9);
              const c = pickN(1, 8);
              if (a + c !== 0) {
                return [a, rng.int(1, 12), c, pickN(1, 12)];
              }
            }
          });
          const expr = `${linear(a, b)} ${c < 0 ? MINUS : '+'} ${coefTerm(Math.abs(c), 'x')} ${d < 0 ? MINUS : '+'} ${Math.abs(d)}`;
          return [math(expr, '=', blank(field(ctx, `${expr} with like terms combined`, linear(a + c, b + d))))];
        }
        case EquivalentExpressions_Mode.CHECK: {
          const [form, a, b, same] = pickFresh(ctx, k.case + mode, () => [rng.int(0, 4), rng.int(2, 9), rng.int(2, 9), rng.int(0, 1)]);
          const v = 'x';
          const pairs: [string, string, string][] = [
            [`${a}(${v} + ${b})`, `${a}${v} + ${a * b}`, `${a}${v} + ${b}`],
            [`${v} + ${v} + ${v}`, `3${v}`, `${v}³`],
            [`${a}${v} + ${b}${v}`, `${a + b}${v}`, `${a + b}${v}²`],
            [`${a}(${v} − ${b})`, `${a}${v} − ${a * b}`, `${a}${v} − ${b}`],
            [`${a}${v} + ${b} + ${v}`, `${a + 1}${v} + ${b}`, `${a + b + 1}${v}`],
          ];
          const [left, yes, no] = pairs[form];
          return [math(left, 'and', same ? yes : no), choices(ctx, `is ${left} the same as ${same ? yes : no}`, ['equivalent', 'not equivalent'], same ? 'equivalent' : 'not equivalent')];
        }
        case EquivalentExpressions_Mode.PERCENT_CHANGE: {
          const [p, up] = pickFresh(ctx, k.case + mode, () => [rng.pick([5, 6, 8, 10, 15, 20, 25, 30, 40, 50]), rng.int(0, 1)]);
          const r = num(p / 100);
          const f = up ? 1 + p / 100 : 1 - p / 100;
          return [
            text(`A price p goes ${up ? 'up' : 'down'} by ${p}%.`),
            math(`p ${up ? '+' : '−'} ${r}p =`, blank(field(ctx, `p ${up ? '+' : '−'} ${r}p`, num(f), [`${num(f)}p`, f.toFixed(2)])), 'p'),
          ];
        }
        default: {
          const [a, b, c] = pickFresh(ctx, k.case + mode, () => [pickN(2, 9), rng.int(1, 5), pickN(1, 12)]);
          const lhs = `${num(a)}(${linear(b, c)})`;
          return [math(lhs, '=', blank(field(ctx, `${lhs} expanded`, linear(a * b, a * c))))];
        }
      }
    }
    case 'solveEquation':
      return solveEquation(k.value.form, k.value.inequality, k.value.negatives, ctx);
    case 'ruleTable': {
      const mode = k.value.mode || RuleTable_Mode.FILL;
      if (mode === RuleTable_Mode.FILL) {
        const [i, m, b] = pickFresh(ctx, k.case + mode, () => [rng.int(0, RULE_STORIES.length - 1), rng.int(2, 9), rng.int(1, 12)]);
        const [story, xName, yName, xHead, yHead] = RULE_STORIES[i];
        const xs = [0, 1, 2, 4, 6];
        const rows = xs.map((x, j) => [cellText(String(x)), j === 0 ? cellText(String(m * x + b)) : cellField(ctx.fields.field(`${yName} when ${xName} is ${x}`, String(m * x + b)))]);
        return [
          text(story(m, b)),
          table([xHead, yHead], rows),
          math('Which depends on the other?'),
          choices(ctx, 'the dependent variable', [xName, yName], yName),
        ];
      }
      if (mode === RuleTable_Mode.FIND_RULE) {
        const [m, b, s] = pickFresh(ctx, k.case + mode, () => [nonzero(ctx, -5, 5), rng.int(-9, 9), rng.int(-2, 1)]);
        const rows = [0, 1, 2, 3].map((i) => [cellText(num(s + i)), cellText(num(m * (s + i) + b))]);
        return [table(['x', 'y'], rows), math('y =', blank(field(ctx, 'the rule for the table', linear(m, b))))];
      }
      if (mode === RuleTable_Mode.GRAPH) {
        const [g, i, x] = pickFresh(ctx, k.case + mode, () => [rng.int(1, 3), rng.int(0, GRAPH_THEMES.length - 1), rng.int(2, 3)]);
        const [xLabel, yLabel, say, unit] = GRAPH_THEMES[i];
        const kk = 5 * g;
        return [
          plane({ xMin: 0, xMax: 6, yMin: 0, yMax: 10, yScale: 5, labelEvery: 1, xLabel, yLabel, points: [gp(1, g, 'A'), gp(x, g * x, 'B')], segments: [seg(0, 0, 1, g, { extend: true })] }),
          math(`Point A is (1, `, blank(field(ctx, 'y at x = 1', String(kk))), ')'),
          math(`${say}:`, blank(field(ctx, 'the unit rate', String(kk))), unit),
          math(`Point B is (${x}, `, blank(field(ctx, `y at x = ${x}`, String(kk * x))), ')'),
          math('Equation: y =', blank(field(ctx, 'the equation', `${kk}x`))),
        ];
      }
      const [kk, b, xs] = pickFresh(ctx, k.case + mode, () => {
        const kk = rng.next() < 0.3 && mode === RuleTable_Mode.CONSTANT ? rng.pick([0.5, 1.5, 2.5]) : rng.int(2, 9);
        const b = mode === RuleTable_Mode.PROPORTIONAL && rng.next() < 0.5 ? rng.int(1, 6) : 0;
        const xs: number[] = [];
        while (xs.length < 4) {
          const x = 2 * rng.int(1, 6);
          if (!xs.includes(x)) {
            xs.push(x);
          }
        }
        return [kk, b, xs.sort((p, q) => p - q)];
      });
      const rows = xs.map((x) => [cellText(String(x)), cellText(num(kk * x + b))]);
      if (mode === RuleTable_Mode.PROPORTIONAL) {
        return [table(['x', 'y'], rows), choices(ctx, 'is the table proportional', ['proportional', 'not proportional'], b === 0 ? 'proportional' : 'not proportional')];
      }
      return [
        table(['x', 'y'], rows),
        math('k =', blank(field(ctx, 'constant of proportionality', num(kk)))),
        math('Equation: y =', blank(field(ctx, 'the equation', `${num(kk)}x`, [`${num(kk)} × x`]))),
      ];
    }
    case 'shapeArea': {
      const shapes = list(k.value.shapes, [1, 2, 3, 4]);
      const shape = shapes[spread(ctx, k.case, shapes.length)];
      const [b, h, o, t] = pickFresh(ctx, k.case + shape, () => {
        const b = rng.int(5, 14);
        const [o, h] = shape === ShapeArea_Shape.PARALLELOGRAM ? rng.pick([[3, 4], [4, 3], [6, 8], [5, 12], [8, 6]] as const) : [rng.int(1, 3), rng.int(3, 10)];
        return [b, h, o, rng.int(-2, b + 2)];
      });
      const P = (x: number, y: number) => create(Polygon_PointSchema, { x, y });
      const S = (s: string) => create(Polygon_SideLabelSchema, { text: s });
      let figure: Node;
      let area: number;
      switch (shape) {
        case ShapeArea_Shape.RIGHT_TRIANGLE:
          figure = node({ case: 'polygon', value: create(PolygonSchema, { points: [P(0, 0), P(b, 0), P(0, h)], sides: [S(`${b} cm`), S(''), S(`${h} cm`)], markRightAngles: true }) });
          area = (b * h) / 2;
          break;
        case ShapeArea_Shape.TRIANGLE:
          figure = node({ case: 'heightShape', value: create(HeightShapeSchema, { points: [P(0, 0), P(b, 0), P(t, h)], apex: P(t, h), baseLabel: `${b} cm`, heightLabel: `${h} cm` }) });
          area = (b * h) / 2;
          break;
        case ShapeArea_Shape.PARALLELOGRAM:
          figure = node({
            case: 'heightShape',
            value: create(HeightShapeSchema, {
              points: [P(0, 0), P(b, 0), P(b + o, h), P(o, h)],
              apex: P(o, h),
              baseLabel: `${b} cm`,
              heightLabel: `${h} cm`,
              sideLabels: [`${Math.hypot(o, h)} cm`],
            }),
          });
          area = b * h;
          break;
        default: {
          const top = Math.max(2, b - o - 1 - (t % 3 === 0 ? 1 : 0));
          figure = node({
            case: 'heightShape',
            value: create(HeightShapeSchema, { points: [P(0, 0), P(b, 0), P(o + top, h), P(o, h)], apex: P(o, h), baseLabel: `${b} cm`, heightLabel: `${h} cm`, topLabel: `${top} cm` }),
          });
          area = ((b + top) * h) / 2;
        }
      }
      return [figure, math('Area =', blank(field(ctx, 'area in square cm', num(area))), 'sq cm')];
    }
    case 'prismMeasure': {
      const solid = (l: string, w: string, h: string, dims: [number, number, number]) =>
        node({ case: 'boxSolid', value: create(BoxSolidSchema, { lengthLabel: l, widthLabel: w, heightLabel: h, length: dims[0], width: dims[1], height: dims[2] }) });
      if (k.value.surfaceArea) {
        const [l, w, h] = pickFresh(ctx, k.case + 's', () => [rng.int(3, 10), rng.int(2, 7), rng.int(2, 7)]);
        return [
          node({ case: 'prismNet', value: create(PrismNetSchema, { length: l, width: w, height: h, unit: 'inches' }) }),
          math('Surface area =', blank(field(ctx, 'surface area in square inches', String(2 * (l * w + l * h + w * h)))), 'sq in'),
        ];
      }
      if (k.value.fractions) {
        // Edges in halves of an inch.
        const [l, w, h] = pickFresh(ctx, k.case + 'f', () => [2 * rng.int(1, 6) + 1, rng.int(2, 9), 2 * rng.int(1, 4) + rng.int(0, 1)]);
        const halves = l * w * h;
        const g = gcd(halves, 8);
        return [
          solid(`${mixed(l, 2)} in`, `${mixed(w, 2)} in`, `${mixed(h, 2)} in`, [l, w, h]),
          math('Cubes with ½-inch edges that fill it:', blank(field(ctx, 'half-inch cubes', String(halves)))),
          math('Volume =', blank(field(ctx, 'volume in cubic inches', mixed(halves, 8), [`${halves / g}/${8 / g}`, num(halves / 8)])), 'cubic in'),
        ];
      }
      const [l, w, h] = pickFresh(ctx, k.case, () => [rng.int(2, 12), rng.int(2, 9), rng.int(2, 9)]);
      return [solid(`${l} in`, `${w} in`, `${h} in`, [l, w, h]), math('Volume =', blank(field(ctx, 'volume in cubic inches', String(l * w * h))), 'cubic in')];
    }
    case 'dataSetStats':
      return dataSetStats(k.value.mode, ctx);
    case 'signedArithmetic':
      return signedArithmetic(k.value.ops, k.value.numbers, k.value.numberLine, k.value.addOpposite, ctx);
    case 'fractionToDecimal': {
      const [n, d] = pickFresh(ctx, k.case + k.value.repeating, () => {
        const d = k.value.repeating && rng.next() < 0.5 ? rng.pick([3, 6, 9, 11, 12, 15]) : rng.pick([2, 4, 5, 8, 10, 20, 25, 40]);
        let n = rng.int(1, 2 * d - 1);
        while (n % d === 0) {
          n = rng.int(1, 2 * d - 1);
        }
        return [n, d];
      });
      let dd = d / gcd(n, d);
      while (dd % 2 === 0) {
        dd /= 2;
      }
      while (dd % 5 === 0) {
        dd /= 5;
      }
      const ends = dd === 1;
      if (!k.value.repeating) {
        return [math([n, d], '=', blank(field(ctx, `${n}/${d} as a decimal`, num(n / d))))];
      }
      const near = (n / d).toFixed(3);
      return [
        math([n, d], '≈', blank(field(ctx, `${n}/${d} to the nearest thousandth`, ends ? num(n / d) : near, ends ? [near] : []))),
        work(3),
        choices(ctx, `does ${n}/${d} end or repeat`, ['ends', 'repeats'], ends ? 'ends' : 'repeats'),
      ];
    }
    case 'roundMeasure': {
      const asks = list(k.value.asks, [1, 2]);
      // Each kind of figure in turn before any repeats.
      const ask = pickFresh(ctx, k.case + 'ask', () => rng.pick(asks));
      const [r, h, useD] = pickFresh(ctx, k.case + ask, () => {
        const r = ask === RoundMeasure_Ask.SPHERE ? rng.pick([3, 6]) : ask === RoundMeasure_Ask.CYLINDER || ask === RoundMeasure_Ask.CONE ? rng.int(1, 6) : rng.int(2, 15);
        const h = ask === RoundMeasure_Ask.CONE ? 3 * rng.int(1, 5) : ask === RoundMeasure_Ask.CYLINDER ? rng.int(2, 12) : 0;
        return [r, h, ask <= 2 ? rng.int(0, 1) : 0];
      });
      // Hundredths of the answer, computed in whole numbers.
      const hundredths =
        ask === RoundMeasure_Ask.CIRCUMFERENCE
          ? 314 * 2 * r
          : ask === RoundMeasure_Ask.CIRCLE_AREA
            ? 314 * r * r
            : ask === RoundMeasure_Ask.CYLINDER
              ? 314 * r * r * h
              : ask === RoundMeasure_Ask.CONE
                ? (314 * r * r * h) / 3
                : (4 * 314 * r ** 3) / 3;
      const v = hundredths / 100;
      const also = unique([v.toFixed(1), String(Math.round(v))]).filter((x) => x !== num(v));
      const given = useD ? `diameter of ${2 * r} cm` : `radius of ${r} cm`;
      const [say, what, unit] =
        ask === RoundMeasure_Ask.CIRCUMFERENCE
          ? [`A circle has a ${given}.`, 'Circumference', 'cm']
          : ask === RoundMeasure_Ask.CIRCLE_AREA
            ? [`A circle has a ${given}.`, 'Area', 'sq cm']
            : ask === RoundMeasure_Ask.CYLINDER
              ? [`A cylinder has a radius of ${r} cm and a height of ${h} cm.`, 'Volume', 'cubic cm']
              : ask === RoundMeasure_Ask.CONE
                ? [`A cone has a radius of ${r} cm and a height of ${h} cm.`, 'Volume', 'cubic cm']
                : [`A ball has a radius of ${r} cm.`, 'Volume', 'cubic cm'];
      const kind = ask <= 2 ? RoundSolid_Kind.CIRCLE : ask === RoundMeasure_Ask.CYLINDER ? RoundSolid_Kind.CYLINDER : ask === RoundMeasure_Ask.CONE ? RoundSolid_Kind.CONE : RoundSolid_Kind.SPHERE;
      const figure = node({
        case: 'roundSolid',
        value: create(RoundSolidSchema, { kind, diameter: !!useD, radiusLabel: useD ? `${2 * r} cm` : `${r} cm`, heightLabel: ask === RoundMeasure_Ask.CYLINDER || ask === RoundMeasure_Ask.CONE ? `${h} cm` : '' }),
      });
      // Every answer takes a multiplication by 3.14, so each gets room.
      return [text(say), figure, work(2), math(`${what} ≈`, blank(field(ctx, `${what.toLowerCase()}: ${say}`, num(v), also)), unit)];
    }
    case 'classify':
      return classify(k.value.topic, ctx);
    case 'probability': {
      const mode = k.value.mode || Probability_Mode.SIMPLE;
      if (mode === Probability_Mode.COMPOUND) {
        const i = pickFresh(ctx, k.case + mode, () => rng.int(0, EVENTS.length - 1));
        const [say, space, test] = EVENTS[i];
        const outcomes = space();
        const hits = outcomes.filter(test).length;
        const p = fracText(hits, outcomes.length);
        // Two number cubes get the 6-by-6 table teachers use for their
        // sample space; coins get room for a list or tree.
        const space2 =
          space === twoCubes
            ? table(
                ['', '1', '2', '3', '4', '5', '6'],
                [1, 2, 3, 4, 5, 6].map((r) => [cellText(String(r)), ...[1, 2, 3, 4, 5, 6].map(() => cellText(''))]),
              )
            : work(3);
        return [
          text(say),
          space2,
          math('Outcomes in the sample space:', blank(ctx.fields.field(`outcomes: ${say}`, String(outcomes.length)))),
          math('P =', fractionBlank(ctx.fields.field(`probability: ${say}`, p, unique([`${hits}/${outcomes.length}`]).filter((x) => x !== p)))),
        ];
      }
      if (mode === Probability_Mode.EXPECTED) {
        const [kk, c, t, form] = pickFresh(ctx, k.case + mode, () => {
          const kk = rng.pick([2, 3, 4, 5, 6, 8, 10]);
          return [kk, rng.int(1, Math.max(1, Math.floor(kk / 2))), kk * rng.int(5, 30), rng.int(0, 1)];
        });
        const expect = (t * c) / kk;
        const say =
          form === 0 || kk !== 6
            ? `A spinner has ${kk} equal parts. ${c === 1 ? '1 part is' : `${c} parts are`} red. It is spun ${t} times. About how many times will it land on red?`
            : `A number cube is rolled ${t} times. About how many times will it land on ${c === 1 ? '5' : `a number less than ${c + 1}`}?`;
        return [text(say), math('About', blank(ctx.fields.field(say, String(expect))), 'times')];
      }
      const [r, b, g, which, not] = pickFresh(ctx, k.case + mode, () => [rng.int(1, 9), rng.int(1, 9), rng.int(0, 6), rng.int(0, 2), rng.next() < 0.25]);
      const counts = [r, b, g];
      const colors = ['red', 'blue', 'green'];
      const w = g === 0 ? which % 2 : which;
      const total = r + b + g;
      const hit = not ? total - counts[w] : counts[w];
      const p = fracText(hit, total);
      const marbles = g === 0 ? `${r} red and ${b} blue` : `${r} red, ${b} blue and ${g} green`;
      return [
        text(`A bag has ${marbles} marbles. Pick one without looking.`),
        math(`P(${not ? 'not ' : ''}${colors[w]}) =`, fractionBlank(ctx.fields.field(`probability of ${not ? 'not ' : ''}${colors[w]}`, p, unique([`${hit}/${total}`]).filter((x) => x !== p)))),
      ];
    }
    case 'pythagorean': {
      const mode = k.value.mode || Pythagorean_Mode.HYPOTENUSE;
      // Fresh by the triangle's sides, not their order, so no triangle comes
      // twice turned around.
      const ti = pickFresh(ctx, k.case + mode + 'triple', () => {
        const i = rng.int(0, TRIPLES.length - 1);
        return TRIPLES.findIndex((t) => t[2] === TRIPLES[i][2] && Math.min(t[0], t[1]) === Math.min(TRIPLES[i][0], TRIPLES[i][1]));
      });
      const [flip, sx] = [rng.int(0, 1), rngSign(ctx)];
      const [a, b, c] = rng.next() < 0.5 ? TRIPLES[ti] : [TRIPLES[ti][1], TRIPLES[ti][0], TRIPLES[ti][2]];
      if (mode === Pythagorean_Mode.DISTANCE) {
        // Legs short enough to fit on a grid from −8 to 8.
        // A different triangle for each item, turned either way.
        const i = pickFresh(ctx, k.case + 'grid', () => rng.int(0, 2));
        const [fx, fy] = [rng.int(0, 99), rng.int(0, 99)];
        const [ga, gb, gc] = rng.next() < 0.5 ? [[3, 4, 5], [6, 8, 10], [5, 12, 13]][i] : [[4, 3, 5], [8, 6, 10], [12, 5, 13]][i];
        const ax = -8 + (fx % (17 - ga));
        const ay = -8 + (fy % (17 - gb));
        const [bx, by] = sx > 0 ? [ax + ga, ay + gb] : [ax + ga, ay];
        const [cy1, cy2] = sx > 0 ? [ay, by] : [ay + gb, by];
        const p = pt(ax, cy1);
        const q = pt(bx, cy2);
        return [
          plane({ xMin: -8, xMax: 8, yMin: -8, yMax: 8, labelEvery: 2, points: [gp(ax, cy1, 'A'), gp(bx, cy2, 'B')], segments: [seg(ax, cy1, bx, cy2)] }),
          math(`Distance from A${p} to B${q} =`, blank(field(ctx, `distance from ${p} to ${q}`, String(gc)))),
        ];
      }
      const P = (x: number, y: number) => create(Polygon_PointSchema, { x, y });
      const S = (s: string) => create(Polygon_SideLabelSchema, { text: s });
      const F = (label: string, v: number) => create(Polygon_SideLabelSchema, { field: field(ctx, label, String(v), [`${v} cm`]) });
      // The right angle at the origin, with the horizontal leg a; or, flipped,
      // at the bottom right.
      const pts = flip ? [P(0, 0), P(a, 0), P(a, b)] : [P(0, 0), P(a, 0), P(0, b)];
      const hyp = flip ? 2 : 1;
      const vleg = flip ? 1 : 2;
      const sides = [S(''), S(''), S('')];
      if (mode === Pythagorean_Mode.LEG) {
        // The missing leg is the bottom one, so its box sits below the
        // triangle, clear of the hypotenuse's label.
        sides[0] = F('the missing leg', a);
        sides[hyp] = S(`${c} cm`);
        sides[vleg] = S(`${b} cm`);
      } else {
        sides[0] = S(`${a} cm`);
        sides[vleg] = S(`${b} cm`);
        sides[hyp] = F('the hypotenuse', c);
      }
      return [node({ case: 'polygon', value: create(PolygonSchema, { points: pts, sides, markRightAngles: true }) }), work(2)];
    }
    case 'scientificNotation':
      return scientific(k.value.mode, ctx);
    case 'linearRelation':
      return linearRelation(k.value.mode, ctx);
    case 'angleFacts': {
      const mode = k.value.mode || AngleFacts_Mode.VERTICAL;
      if (mode === AngleFacts_Mode.VERTICAL) {
        const [a, rot] = pickFresh(ctx, k.case + mode, () => {
          let a = 5 * rng.int(5, 31);
          while (a === 90) {
            a = 5 * rng.int(5, 31);
          }
          return [a, 5 * rng.int(0, 6)];
        });
        const arcs = [
          create(Angle_ArcLabelSchema, { text: `${a}°` }),
          create(Angle_ArcLabelSchema, { field: field(ctx, `the angle beside ${a}°`, `${180 - a}°`, [String(180 - a)]) }),
          create(Angle_ArcLabelSchema, { field: field(ctx, `the angle across from ${a}°`, `${a}°`, [String(a)]) }),
        ];
        return [node({ case: 'angle', value: create(AngleSchema, { rotation: rot, rays: [a, 180, 180 + a], arcs }) })];
      }
      if (mode === AngleFacts_Mode.TRANSVERSAL) {
        const [deg, given, asks] = pickFresh(ctx, k.case + mode, () => {
          let deg = 5 * rng.int(8, 28);
          while (deg === 90) {
            deg = 5 * rng.int(8, 28);
          }
          const given = rng.int(0, 7);
          const asks: number[] = [];
          while (asks.length < 2) {
            const q = rng.int(0, 7);
            if (q !== given && !asks.includes(q) && (asks.length === 0 || Math.floor(q / 4) !== Math.floor(given / 4))) {
              asks.push(q);
            }
          }
          return [deg, given, asks] as const;
        });
        // Top right and bottom left at each crossing are the angle itself.
        const size = (q: number) => (q % 2 === 0 ? deg : 180 - deg);
        const labels = [
          create(Transversal_LabelSchema, { position: given, text: `${size(given)}°` }),
          ...asks.map((q) => create(Transversal_LabelSchema, { position: q, field: field(ctx, `angle at position ${q}`, `${size(q)}°`, [String(size(q))]) })),
        ];
        return [node({ case: 'transversal', value: create(TransversalSchema, { degrees: deg, labels }) })];
      }
      if (mode === AngleFacts_Mode.ALGEBRA) {
        const [form, x, p] = pickFresh(ctx, k.case + mode, () => {
          const form = rng.int(0, 2);
          const p = rng.int(1, 3);
          const total = form === 0 ? 90 : 180;
          const x = 5 * rng.int(2, Math.floor((total - 10) / (5 * (p + 1))));
          return [form, x, p];
        });
        const total = form === 0 ? 90 : 180;
        const arc = (t: string) => create(Angle_ArcLabelSchema, { text: t });
        // Each item draws the angles at their true size, labelled as in the
        // sentence, with room to write the equation and solve it.
        if (form === 2) {
          const q = 5 * rng.int(1, 6);
          const v = p * x + q;
          const expr = `(${p === 1 ? '' : p}x + ${q})°`;
          return [
            text(`Two vertical angles measure ${expr} and ${v}°.`),
            node({ case: 'angle', value: create(AngleSchema, { rotation: 10, rays: [v, 180, 180 + v], arcs: [arc(expr), arc(''), arc(`${v}°`)] }) }),
            work(2),
            math('x =', blank(field(ctx, 'x', String(x)))),
          ];
        }
        const q = total - (p + 1) * x;
        const expr = `(${p === 1 ? '' : p}x + ${q})°`;
        return [
          text(`Two ${form === 0 ? 'complementary' : 'supplementary'} angles measure x° and ${expr}.`),
          node({ case: 'angle', value: create(AngleSchema, { rotation: 0, rays: [x, total], arcs: [arc('x°'), arc(expr)] }) }),
          work(2),
          math('x =', blank(field(ctx, 'x', String(x)))),
        ];
      }
      // A drawn triangle with every angle from 35° to 105°, so the arcs and
      // labels fit inside it. Bottom left a, bottom right b, top c.
      const [a, b, ask] = pickFresh(ctx, k.case + mode, () => {
        for (;;) {
          const a = rng.int(35, 105);
          const b = rng.int(35, 105);
          if (180 - a - b >= 35) {
            return [a, b, rng.int(0, 2)];
          }
        }
      });
      const c = 180 - a - b;
      const deg = (v: number) => create(Angle_ArcLabelSchema, { text: `${v}°` });
      const find = (label: string, v: number) => create(Angle_ArcLabelSchema, { field: field(ctx, label, `${v}°`, [String(v)]) });
      if (mode === AngleFacts_Mode.EXTERIOR) {
        // The exterior angle at the bottom right equals the two far angles
        // added: a + c.
        return [
          node({
            case: 'angleTriangle',
            value: create(AngleTriangleSchema, { left: a, right: b, labels: [deg(a), create(Angle_ArcLabelSchema, {}), deg(c)], exterior: find('the exterior angle', a + c) }),
          }),
        ];
      }
      const angles = [a, b, c];
      const labels = angles.map((v, i) => (i === ask ? find('the missing angle', v) : deg(v)));
      return [node({ case: 'angleTriangle', value: create(AngleTriangleSchema, { left: a, right: b, labels }) })];
    }
  }
  return undefined;
}

function solveEquation(form: SolveEquation_Form, inequality: boolean, neg: boolean, ctx: Ctx): Node[] {
  const { rng } = ctx;
  form = form || SolveEquation_Form.ONE_STEP;
  const v = VARS[rng.int(0, 2)];
  const sol = (lo: number, hi: number) => (neg ? rng.int(-hi, hi) : rng.int(lo, hi));
  const coef = () => (neg && rng.next() < 0.35 ? -1 : 1) * rng.int(2, 9);
  if (form === SolveEquation_Form.CHECK) {
    const [a, b, x, opts] = pickFresh(ctx, 'solveCheck', () => {
      const x = rng.int(1, 9);
      const opts = [x];
      while (opts.length < 4) {
        const o = rng.int(1, 10);
        if (!opts.includes(o)) {
          opts.push(o);
        }
      }
      return [rng.int(2, 9), rng.int(1, 15), x, opts.sort((p, q) => p - q)];
    });
    const eq = `${a}${v} + ${b} = ${a * x + b}`;
    return [math(`Which value of ${v} makes ${eq} true?`), choices(ctx, `solution of ${eq}`, opts.map(String), String(x))];
  }
  const rel = inequality ? rng.pick(['<', '>', '≤', '≥']) : '=';
  const flip: Record<string, string> = { '<': '>', '>': '<', '≤': '≥', '≥': '≤', '=': '=' };
  const ascii: Record<string, string> = { '<': '<', '>': '>', '≤': '<=', '≥': '>=', '=': '=' };
  const [eq, x, divNeg] = pickFresh(ctx, 'solve' + form + inequality + neg, (): [string, number, boolean] => {
    if (form === SolveEquation_Form.ONE_STEP) {
      const x = sol(0, 20);
      const a = rng.int(2, 12);
      const shape = rng.int(0, 3);
      if (shape === 0) {
        return [`${v} + ${a} ${rel} ${num(x + a)}`, x, false];
      }
      if (shape === 1) {
        // Without negatives, keep the right side at 0 or more.
        const y = neg ? x : x + a;
        return [`${v} − ${a} ${rel} ${num(y - a)}`, y, false];
      }
      if (shape === 2) {
        const c = neg ? coef() : a;
        return [`${num(c)}${v} ${rel} ${num(c * x)}`, x, c < 0];
      }
      return [`${v} ÷ ${a} ${rel} ${num(x)}`, x * a, false];
    }
    if (form === SolveEquation_Form.BOTH_SIDES) {
      for (;;) {
        const x = sol(1, 10);
        const a = coef();
        const c = coef();
        const b = rng.int(-12, 12);
        if (a !== c) {
          const d = a * x + b - c * x;
          // Some need the distributive property or like terms collected
          // first, as 8.EE.C.7.b asks.
          const shape = rng.int(0, 2);
          if (shape === 1 && a > 0) {
            const p = nonzero(ctx, -6, 6);
            const d2 = a * (x + p) - c * x;
            return [`${a}(${linear(1, p, v)}) ${rel} ${linear(c, d2, v)}`, x, a - c < 0];
          }
          if (shape === 2 && a > 2) {
            const a1 = rng.int(1, a - 1);
            return [`${linear(a1, b, v)} + ${coefTerm(a - a1, v)} ${rel} ${linear(c, d, v)}`, x, a - c < 0];
          }
          return [`${linear(a, b, v)} ${rel} ${linear(c, d, v)}`, x, a - c < 0];
        }
      }
    }
    const x = sol(1, 12);
    const a = coef();
    const b = neg ? nonzero(ctx, -12, 12) : rng.int(1, 15);
    const shape = rng.int(0, 2);
    if (shape === 1 && a > 0) {
      return [`${a}(${linear(1, b, v)}) ${rel} ${num(a * (x + b))}`, x, false];
    }
    if (shape === 2 && a > 0) {
      return [`${v} ÷ ${a} ${b < 0 ? '−' : '+'} ${Math.abs(b)} ${rel} ${num(x + b)}`, x * a, false];
    }
    return [`${linear(a, b, v)} ${rel} ${num(a * x + b)}`, x, a < 0];
  });
  const r = divNeg ? flip[rel] : rel;
  const answer = inequality ? `${v} ${r} ${num(x)}` : num(x);
  const also = inequality ? [`${v} ${ascii[r]} ${num(x)}`] : [`${v} = ${num(x)}`];
  const prompt = inequality ? 'Solution:' : `${v} =`;
  const rows = form === SolveEquation_Form.ONE_STEP ? [] : [work(form === SolveEquation_Form.BOTH_SIDES ? 3 : 2)];
  const solved = [math(eq), ...rows, math(prompt, blank(field(ctx, `solution of ${eq}`, answer, also)))];
  if (!inequality || form !== SolveEquation_Form.TWO_STEP) {
    return solved;
  }
  // A two-step inequality is graphed too: a number line of eleven whole
  // numbers for the child to draw on. Every other tick is labelled, the
  // boundary among them, so two-digit negatives do not crowd.
  const start = x - 2 * rng.int(1, 4);
  const labels = [0, 2, 4, 6, 8, 10].map((i) => create(NumberLine_TickLabelSchema, { tick: i, value: { case: 'text', value: num(start + i) } }));
  return [...solved, math('Graph it:'), node({ case: 'numberLine', value: create(NumberLineSchema, { start: 0, end: 10, partsPerUnit: 1, hideWholeLabels: true, labels }) })];
}

// Data sets with integer means, so a child can check by hand.
function dataSetStats(mode: DataSetStats_Mode, ctx: Ctx): Node[] {
  const { rng } = ctx;
  mode = mode || DataSetStats_Mode.CENTER;
  const theme = spread(ctx, 'dataTheme', DATA_THEMES.length);
  const [what, lo, hi] = DATA_THEMES[theme];
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const median = (xs: number[]) => {
    const s = [...xs].sort((p, q) => p - q);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const mad = (xs: number[]) => {
    const m = sum(xs) / xs.length;
    return sum(xs.map((x) => Math.abs(x - m))) / xs.length;
  };
  const short = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
  if (mode === DataSetStats_Mode.BOX_PLOT || mode === DataSetStats_Mode.DRAW_BOX_PLOT) {
    // Eleven values, so the median and quartiles are data values.
    const xs = pickFresh(ctx, 'box' + mode, () => Array.from({ length: 11 }, () => rng.int(lo, hi)));
    const s = [...xs].sort((p, q) => p - q);
    const [mn, q1, md, q3, mx] = [s[0], s[2], s[5], s[8], s[10]];
    const start = Math.floor(lo / 2) * 2 - 2;
    const end = Math.ceil(hi / 2) * 2 + 2;
    const step = end - start > 14 ? 2 : 1;
    const plot = (drawField?: Field) =>
      node({ case: 'boxPlot', value: create(BoxPlotSchema, { start, end, step, min: mn, q1, median: md, q3, max: mx, caption: what, drawField }) });
    if (mode === DataSetStats_Mode.BOX_PLOT) {
      return [
        plot(),
        row(
          math('Median:', blank(ctx.fields.field('median', String(md)))),
          math('IQR:', blank(ctx.fields.field('interquartile range', String(q3 - q1)))),
          math('Range:', blank(ctx.fields.field('range', String(mx - mn)))),
        ),
      ];
    }
    return [
      text(`${what}: ${xs.join(', ')}`),
      work(2),
      row(
        math('Min:', blank(ctx.fields.field('minimum', String(mn)))),
        math('Q1:', blank(ctx.fields.field('lower quartile', String(q1)))),
        math('Median:', blank(ctx.fields.field('median', String(md)))),
        math('Q3:', blank(ctx.fields.field('upper quartile', String(q3)))),
        math('Max:', blank(ctx.fields.field('maximum', String(mx)))),
      ),
      plot(ctx.fields.field('the box plot', `box from ${q1} to ${q3}, median ${md}, whiskers to ${mn} and ${mx}`)),
    ];
  }
  if (mode === DataSetStats_Mode.HISTOGRAM) {
    const counts = pickFresh(ctx, 'hist', () => Array.from({ length: 5 }, () => rng.int(1, 9)));
    const bins = counts.map((c, i) => create(Histogram_BinSchema, { label: `${10 * i}–${10 * i + 9}`, count: c }));
    const j = 1 + (counts[0] % 3);
    const total = counts.reduce((a, b) => a + b, 0);
    return [
      node({ case: 'histogram', value: create(HistogramSchema, { title: 'Minutes of reading each day', valueAxis: 'Days', step: 1, bins }) }),
      math(`Days with ${10 * j}–${10 * j + 9} minutes:`, blank(ctx.fields.field(`days in ${10 * j}–${10 * j + 9}`, String(counts[j])))),
      math('Days in all:', blank(ctx.fields.field('days in all', String(total)))),
      math('Days with 30 minutes or more:', blank(ctx.fields.field('days with 30 or more', String(counts[3] + counts[4])))),
    ];
  }
  if (mode === DataSetStats_Mode.DOT_PLOT || mode === DataSetStats_Mode.FREQUENCY) {
    const span = mode === DataSetStats_Mode.DOT_PLOT ? 10 : 5;
    const [start, counts] = pickFresh(ctx, 'dots' + mode, () => {
      const start = rng.int(0, 4);
      const counts = Array(span + 1).fill(0);
      const n = rng.int(9, 14);
      for (let i = 0; i < n; i++) {
        counts[rng.int(1, span - 1)]++;
      }
      return [start, counts];
    });
    const values = counts.flatMap((c, i) => Array(c).fill(start + i));
    if (mode === DataSetStats_Mode.FREQUENCY) {
      const shuffled = values.map((x, i) => [x, (i * 7919) % 101]).sort((p, q) => p[1] - q[1]).map((p) => p[0]);
      const rows = counts.map((c, i) => [cellText(String(start + i)), cellField(ctx.fields.field(`how many times ${start + i} appears`, String(c)))]);
      return [text(`Goals scored in each game: ${shuffled.join(', ')}`), table(['Goals', 'Games'], rows)];
    }
    const lowest = values[0];
    const highest = values[values.length - 1];
    return [
      node({ case: 'linePlot', value: create(LinePlotSchema, { start, end: start + span, partsPerUnit: 1, counts, caption: 'Books each student read' }) }),
      row(
        math('How many students?', blank(ctx.fields.field('number of data values', String(values.length)))),
        math('Median:', blank(ctx.fields.field('median', num(median(values))))),
        math('Range:', blank(ctx.fields.field('range', String(highest - lowest)))),
      ),
    ];
  }
  if (mode === DataSetStats_Mode.TWO_GROUPS) {
    const [xs, shift] = pickFresh(ctx, 'two', () => {
      for (;;) {
        const n = rng.pick([5, 6, 8]);
        const xs = Array.from({ length: n }, () => rng.int(lo, hi));
        const m = mad(xs);
        const shift = rng.int(2, 12);
        if (sum(xs) % n === 0 && m > 0 && short(m) && short(shift / m) && new Set(xs).size > 2) {
          return [xs, shift];
        }
      }
    });
    const ys = xs.map((x) => x + shift).reverse();
    const m = mad(xs);
    const meanA = sum(xs) / xs.length;
    return [
      text(`${what}, group A: ${xs.join(', ')}`),
      text(`${what}, group B: ${ys.join(', ')}`),
      text(`Each group has a mean absolute deviation of ${num(m)}.`),
      row(
        math('Mean of A:', blank(ctx.fields.field('mean of group A', num(meanA)))),
        math('Mean of B:', blank(ctx.fields.field('mean of group B', num(meanA + shift)))),
      ),
      math('The difference in means is', blank(ctx.fields.field('difference in means as a multiple of the MAD', num(shift / m))), 'times the MAD.'),
    ];
  }
  if (mode === DataSetStats_Mode.SPREAD) {
    const xs = pickFresh(ctx, 'spread', () => {
      for (;;) {
        const n = rng.pick([5, 8, 10]);
        const xs = Array.from({ length: n }, () => rng.int(lo, hi));
        if (sum(xs) % n === 0 && short(mad(xs))) {
          return xs;
        }
      }
    });
    const s = [...xs].sort((p, q) => p - q);
    const half = Math.floor(s.length / 2);
    const q1 = median(s.slice(0, half));
    const q3 = median(s.slice(s.length - half));
    return [
      text(`${what}: ${xs.join(', ')}`),
      work(4),
      row(
        math('Lower quartile:', blank(ctx.fields.field('lower quartile', num(q1)))),
        math('Upper quartile:', blank(ctx.fields.field('upper quartile', num(q3)))),
        math('IQR:', blank(ctx.fields.field('interquartile range', num(q3 - q1)))),
      ),
      row(math('Mean:', blank(ctx.fields.field('mean', num(sum(xs) / xs.length)))), math('MAD:', blank(ctx.fields.field('mean absolute deviation', num(mad(xs)))))),
    ];
  }
  const xs = pickFresh(ctx, 'center', () => {
    for (;;) {
      const n = rng.int(5, 9);
      const xs = Array.from({ length: n }, () => rng.int(lo, hi));
      const counts = new Map<number, number>();
      xs.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1));
      const top = Math.max(...counts.values());
      if (sum(xs) % n === 0 && top === 2 && [...counts.values()].filter((c) => c === top).length === 1) {
        return xs;
      }
    }
  });
  const counts = new Map<number, number>();
  xs.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1));
  const mode2 = [...counts.entries()].find(([, c]) => c === 2)![0];
  return [
    text(`${what}: ${xs.join(', ')}`),
    work(2),
    row(
      math('Mean:', blank(ctx.fields.field('mean', num(sum(xs) / xs.length)))),
      math('Median:', blank(ctx.fields.field('median', num(median(xs))))),
      math('Mode:', blank(ctx.fields.field('mode', String(mode2)))),
      math('Range:', blank(ctx.fields.field('range', String(Math.max(...xs) - Math.min(...xs))))),
    ),
  ];
}

function signedArithmetic(opsIn: readonly number[], numbers: SignedArithmetic_Numbers, numberLine: boolean, addOpposite: boolean, ctx: Ctx): Node[] {
  const { rng } = ctx;
  const ops = list(opsIn, [1, 2, 3, 4]);
  numbers = numbers || SignedArithmetic_Numbers.INTEGERS;
  const sym = ['', '+', '−', '×', '÷'];
  if (numbers === SignedArithmetic_Numbers.FRACTIONS) {
    const [op, a, b, c, d] = pickFresh(ctx, 'sf', () => {
      const ds = [2, 3, 4, 6, 8];
      const b = rng.pick(ds);
      const d = rng.pick(ds);
      // Proper fractions in lowest terms, so 2/4 or 3/3 never appears.
      let a = nonzero(ctx, -b + 1, b - 1);
      while (gcd(Math.abs(a), b) !== 1) {
        a = nonzero(ctx, -b + 1, b - 1);
      }
      let c = nonzero(ctx, -d + 1, d - 1);
      while (gcd(Math.abs(c), d) !== 1) {
        c = nonzero(ctx, -d + 1, d - 1);
      }
      if (a > 0 && c > 0) {
        c = -c;
      }
      return [rng.pick(ops), a, b, c, d];
    });
    const [n, m] = op === 1 ? [a * d + c * b, b * d] : op === 2 ? [a * d - c * b, b * d] : op === 3 ? [a * c, b * d] : [a * d, b * c];
    const answer = fracText(n, m);
    const g = gcd(n, m) || 1;
    const also = Math.abs(n / g) > Math.abs(m / g) && m / g !== 1 ? [mixedText(n, m)] : [];
    return [math(...signedFrac(a, b), sym[op], ...signedFrac(c, d, true), '=', blank(field(ctx, 'the answer', answer, also)))];
  }
  const decimals = numbers === SignedArithmetic_Numbers.DECIMALS;
  const [op, a, b] = pickFresh(ctx, 'si' + numbers + numberLine + addOpposite, () => {
    const op = numberLine ? 1 : addOpposite ? 2 : rng.pick(ops);
    if (numberLine) {
      const a = rng.int(-8, 8);
      let b = nonzero(ctx, -9, 9);
      while (a + b < -10 || a + b > 10 || (a >= 0 && b > 0)) {
        b = nonzero(ctx, -9, 9);
      }
      return [op, a, b];
    }
    const scale = decimals ? 10 : 1;
    if (op === 3 || op === 4) {
      // No factor of 1 or −1, which gives no practice, and at least one
      // negative factor, since the signs are the point.
      const p = rngSign(ctx) * rng.int(2, 9);
      let qq = rng.int(2, decimals ? 39 : 9);
      while (decimals && qq % 10 === 0) {
        qq = rng.int(2, 39);
      }
      const q = ((p > 0 ? -1 : rngSign(ctx)) * qq) / scale;
      const r = Math.round(p * q * 100) / 100;
      return op === 3 ? [op, q, p] : [op, r, p];
    }
    const a = nonzero(ctx, -12 * scale, 12 * scale) / scale;
    let b = nonzero(ctx, -12 * scale, 12 * scale) / scale;
    if (a > 0 && b > 0) {
      b = -b;
    }
    return [op, a, b];
  });
  const result = op === 1 ? a + b : op === 2 ? a - b : op === 3 ? a * b : a / b;
  const label = `${num(a)} ${sym[op]} ${paren(b)}`;
  if (numberLine) {
    const labels = [0, 5, 10, 15, 20].map((i) => create(NumberLine_TickLabelSchema, { tick: i, value: { case: 'text', value: num(i - 10) } }));
    return [
      text(`Start at ${num(a)}. Move ${Math.abs(b)} ${b < 0 ? 'left' : 'right'}.`),
      node({ case: 'numberLine', value: create(NumberLineSchema, { start: -10, end: 10, partsPerUnit: 1, hideWholeLabels: true, labels, hasArrow: true, arrowTick: a + 10 }) }),
      math(label, '=', blank(field(ctx, label, num(result)))),
    ];
  }
  if (addOpposite) {
    return [math(label, '=', num(a), '+', blank(field(ctx, `the opposite of ${num(b)}`, paren(-b), [num(-b)])), '=', blank(field(ctx, label, num(result))))];
  }
  return [math(label, '=', blank(field(ctx, label, num(result))))];
}

function classify(topic: Classify_Topic, ctx: Ctx): Node[] {
  const { rng } = ctx;
  topic = topic || Classify_Topic.STATISTICAL_QUESTION;
  const pickList = <T>(xs: readonly T[]): T => xs[pickFresh(ctx, 'classify' + topic, () => rng.int(0, xs.length - 1))];
  switch (topic) {
    case Classify_Topic.CENTER_OR_SPREAD: {
      const [m, kind] = pickList(MEASURES_OF);
      return [text(`The ${m} of a data set measures its`), choices(ctx, `what the ${m} measures`, ['center', 'spread'], kind)];
    }
    case Classify_Topic.SAMPLE: {
      const [say, fair] = pickList(SAMPLES);
      return [text(say), choices(ctx, 'is the sample representative', ['representative', 'biased'], fair ? 'representative' : 'biased')];
    }
    case Classify_Topic.LIKELIHOOD: {
      const [r, b] = pickFresh(ctx, 'likely', () => {
        const r = rng.int(0, 8);
        return [r, r === 0 ? rng.int(1, 8) : rng.int(0, 8)];
      });
      const p = r / (r + b);
      const answer = p === 0 ? 'impossible' : p < 0.5 ? 'unlikely' : p === 0.5 ? 'as likely as not' : p < 1 ? 'likely' : 'certain';
      return [
        text(`A bag has ${r} red and ${b} blue marbles. You pick one without looking. Picking red is`),
        choices(ctx, `chance of red from ${r} red and ${b} blue`, ['impossible', 'unlikely', 'as likely as not', 'likely', 'certain'], answer),
      ];
    }
    case Classify_Topic.TRIANGLE: {
      const [a, b, c] = pickFresh(ctx, 'triangle', () => {
        const a = rng.int(2, 9);
        const b = rng.int(a, 12);
        const yes = rng.next() < 0.5;
        const c = yes ? rng.int(b, a + b - 1) : rng.int(a + b, a + b + 4);
        return [a, b, c];
      });
      const ok = a + b > c;
      return [text(`Side lengths ${a} cm, ${b} cm and ${c} cm`), choices(ctx, `can ${a}, ${b}, ${c} make a triangle`, ['makes a triangle', 'no triangle'], ok ? 'makes a triangle' : 'no triangle')];
    }
    case Classify_Topic.RATIONAL: {
      // Each form once before any repeats, so the sheet mixes square roots,
      // fractions, decimals and π.
      const form = pickFresh(ctx, 'rational-form', () => rng.int(0, 10));
      const n = rng.int(2, 12);
      const d = rng.int(1, 9);
      const forms: [string, boolean][] = [
        [`√${n * n}`, true],
        [`√${n * n + 1}`, false],
        [`${n}/${n + 1}`, true],
        ['π', false],
        [`0.${d}${d}${d}…  (the ${d}s repeat forever)`, true],
        ['0.1010010001…  (one more 0 each time)', false],
        [num(-n), true],
        ['3.14', true],
        [`${n}.${d}5`, true],
        [`√${rng.pick([2, 3, 5, 7])}`, false],
        [`${MINUS}√${n * n}`, true],
      ];
      const [say, rational] = forms[form];
      return [math(say), choices(ctx, `is ${say} rational`, ['rational', 'irrational'], rational ? 'rational' : 'irrational')];
    }
    case Classify_Topic.FUNCTION: {
      const [xs, ys, isFn] = pickFresh(ctx, 'function', () => {
        const xs: number[] = [];
        while (xs.length < 4) {
          const x = rng.int(-3, 6);
          if (!xs.includes(x)) {
            xs.push(x);
          }
        }
        const ys = xs.map(() => rng.int(-5, 9));
        const isFn = rng.next() < 0.5;
        if (!isFn) {
          xs[3] = xs[rng.int(0, 2)];
          const i = xs.indexOf(xs[3]);
          while (ys[3] === ys[i]) {
            ys[3] = rng.int(-5, 9);
          }
        }
        return [xs, ys, isFn];
      });
      const rows = xs.map((x, i) => [cellText(num(x)), cellText(num(ys[i]))]);
      return [table(['x', 'y'], rows), choices(ctx, 'is the table a function', ['function', 'not a function'], isFn ? 'function' : 'not a function')];
    }
    case Classify_Topic.SOLUTIONS: {
      // Six shapes, two for each answer, so a child cannot answer from the
      // shape alone. Each shape once before any repeats.
      const form = pickFresh(ctx, 'solutions-form', () => rng.int(0, 5));
      const a = rng.int(2, 6);
      const b = rng.int(1, 9);
      const e = rng.int(2, 5);
      let c = rng.int(1, 20);
      while (c === a * b || c === b) {
        c = rng.int(1, 20);
      }
      const eqs: [string, string][] = [
        [`${a}(x + ${b}) = ${a}x + ${a * b}`, 'infinitely many'],
        [`${a}(x + ${b}) = ${a}x + ${c}`, 'no solution'],
        [`${a}(x + ${b}) = ${a + 1}x + ${c}`, 'one solution'],
        [`${a}x + ${b} + ${e}x = ${a + e}x + ${b}`, 'infinitely many'],
        [`${a}x − ${b} = ${a}x + ${c}`, 'no solution'],
        [`${a + e}x − ${b} = ${a}x + ${c}`, 'one solution'],
      ];
      const [eq, answer] = eqs[form];
      return [math(eq), choices(ctx, `solutions of ${eq}`, ['one solution', 'no solution', 'infinitely many'], answer)];
    }
    case Classify_Topic.CROSS_SECTION: {
      const [kind, say, answer] = pickList(SLICES);
      const fig =
        kind === 0
          ? node({ case: 'boxSolid', value: create(BoxSolidSchema, { length: 3, width: 2, height: 2 }) })
          : node({ case: 'roundSolid', value: create(RoundSolidSchema, { kind: kind as RoundSolid_Kind }) });
      return [fig, text(say), choices(ctx, say, ['circle', 'rectangle', 'triangle'], answer)];
    }
    case Classify_Topic.LINEAR: {
      // Each form once before any repeats.
      const form = pickFresh(ctx, 'linear-form', () => rng.int(0, 8));
      const m = rng.int(2, 6);
      const b = rng.int(1, 9);
      const forms: [string, boolean][] = [
        [`y = ${m}x + ${b}`, true],
        [`y = x² + ${b}`, false],
        [`y = ${m}/x`, false],
        [`y = ${b} − ${m}x`, true],
        [`y = ${m}(x + ${b})`, true],
        [`y = ${m}x³`, false],
        [`y = ${b}`, true],
        [`y = x/${m} + ${b}`, true],
        [`y = x(x + ${b})`, false],
      ];
      const [eq, lin] = forms[form];
      return [math(eq), choices(ctx, `is ${eq} linear`, ['linear', 'not linear'], lin ? 'linear' : 'not linear')];
    }
    default: {
      const [say, stat] = pickList(STAT_QUESTIONS);
      return [text(say), choices(ctx, 'is it a statistical question', ['statistical', 'not statistical'], stat ? 'statistical' : 'not statistical')];
    }
  }
}

// sci writes m × 10^e for a coefficient given as an integer with places
// decimal places, and the standard form.
function sciText(coef: number, e: number): [string, string[]] {
  const c = num(coef);
  return [`${c} × 10${sup(e)}`, [`${c} x 10^${e}`, `${c} × 10^${e}`, `${c}*10^${e}`]];
}

// standardForm writes coef × 10^e in full, with commas for large numbers.
export function standardForm(coef: number, e: number): string {
  const [whole, frac = ''] = num(coef).split('.');
  const digits = whole + frac;
  const point = whole.length + e;
  if (point >= digits.length) {
    return commas(Number(digits + '0'.repeat(point - digits.length)));
  }
  if (point <= 0) {
    return '0.' + '0'.repeat(-point) + digits.replace(/^0+/, '');
  }
  return commas(Number(digits.slice(0, point))) + '.' + digits.slice(point);
}

function scientific(mode: ScientificNotation_Mode, ctx: Ctx): Node[] {
  const { rng } = ctx;
  mode = mode || ScientificNotation_Mode.TO_SCIENTIFIC;
  const coef = () => {
    const places = rng.int(0, 2);
    let c = rng.int(10 ** places, 10 ** (places + 1) - 1);
    while (places > 0 && c % 10 === 0) {
      c = rng.int(10 ** places, 10 ** (places + 1) - 1);
    }
    return c / 10 ** places;
  };
  const normal = (c: number, e: number): [number, number] => {
    c = Math.round(c * 1e6) / 1e6;
    while (c >= 10) {
      c = Math.round(c * 1e5) / 1e6;
      e++;
    }
    while (c < 1) {
      c = Math.round(c * 1e7) / 1e6;
      e--;
    }
    return [c, e];
  };
  if (mode === ScientificNotation_Mode.MULTIPLY || mode === ScientificNotation_Mode.DIVIDE) {
    const [a, m, b, n] = pickFresh(ctx, 'sci' + mode, () => {
      for (;;) {
        const b = rng.int(2, 5);
        const a = Math.round((mode === ScientificNotation_Mode.DIVIDE ? b * rng.pick([1.5, 2, 2.5, 3, 4, 0.5]) : rng.pick([1.5, 2, 2.5, 3, 4, 6, 1.2])) * 10) / 10;
        const [m, n] = [rng.int(3, 9), rng.int(-4, 6)];
        // An answer times 10⁰ reads oddly; pick again.
        if ((mode === ScientificNotation_Mode.MULTIPLY ? normal(a * b, m + n) : normal(a / b, m - n))[1] !== 0) {
          return [a, m, b, n];
        }
      }
    });
    const [c, e] = mode === ScientificNotation_Mode.MULTIPLY ? normal(a * b, m + n) : normal(a / b, m - n);
    const [ans, also] = sciText(c, e);
    const op = mode === ScientificNotation_Mode.MULTIPLY ? '×' : '÷';
    const lhs = `(${num(a)} × 10${sup(m)}) ${op} (${b} × 10${sup(n)})`;
    return [math(lhs, '=', blank(field(ctx, lhs, ans, also)))];
  }
  if (mode === ScientificNotation_Mode.COMPARE) {
    // A context each, with exponents in its range, so the numbers are
    // believable sizes. The ratio is always a whole number.
    const i = pickFresh(ctx, 'scic-context', () => rng.int(0, SCI_COMPARE.length - 1));
    const [, , lo, hi] = SCI_COMPARE[i];
    const [b, t, m, n] = pickFresh(ctx, 'scic', () => [rng.int(1, 3), rng.int(2, 4), rng.int(lo, hi), rng.int(1, 3)]);
    const [smallSay, bigSay] = SCI_COMPARE[i];
    const big = `${b * t} × 10${sup(m)}`;
    const small = `${b} × 10${sup(m - n)}`;
    const times = t * 10 ** n;
    return [
      text(`${smallSay.replace('#', small)} ${bigSay.replace('#', big)} How many times as large is the second?`),
      math(blank(field(ctx, `${big} ÷ ${small}`, commas(times), [String(times), `${t} × 10${sup(n)}`, `${t} x 10^${n}`])), 'times'),
    ];
  }
  const [c, e] = pickFresh(ctx, 'sci' + mode, () => [coef(), rng.next() < 0.6 ? rng.int(3, 9) : -rng.int(2, 6)]);
  const std = standardForm(c, e);
  if (mode === ScientificNotation_Mode.TO_STANDARD) {
    const [s] = sciText(c, e);
    return [math(s, '=', blank(field(ctx, `${s} in standard form`, std, [std.replace(/,/g, '')])))];
  }
  const [ans, also] = sciText(c, e);
  return [math(std, '=', blank(field(ctx, `${std} in scientific notation`, ans, also)))];
}

function linearRelation(mode: LinearRelation_Mode, ctx: Ctx): Node[] {
  const { rng } = ctx;
  mode = mode || LinearRelation_Mode.SLOPE;
  switch (mode) {
    case LinearRelation_Mode.EQUATION: {
      const [m, b, x1, dx] = pickFresh(ctx, 'leq', () => [nonzero(ctx, -5, 5), rng.int(-9, 9), rng.int(-4, 4), rng.int(1, 4)]);
      const p = pt(x1, m * x1 + b);
      const q = pt(x1 + dx, m * (x1 + dx) + b);
      return [text(`A line goes through ${p} and ${q}.`), work(2), math('y =', blank(field(ctx, `line through ${p} and ${q}`, linear(m, b))))];
    }
    case LinearRelation_Mode.SYSTEM: {
      const [form, x, y, a, c] = pickFresh(ctx, 'sys', () => {
        const a = nonzero(ctx, -4, 5);
        let c = nonzero(ctx, -4, 5);
        while (c === a) {
          c = nonzero(ctx, -4, 5);
        }
        return [rng.int(0, 1), rng.int(-5, 8), rng.int(-5, 9), a, c];
      });
      const [e1, e2] = form === 0 ? [`y = ${linear(a, y - a * x)}`, `y = ${linear(c, y - c * x)}`] : [`x + y = ${num(x + y)}`, `x − y = ${num(x - y)}`];
      return [math(e1), math(e2), work(2), math('x =', blank(field(ctx, `x for ${e1}, ${e2}`, num(x))), ' y =', blank(field(ctx, `y for ${e1}, ${e2}`, num(y))))];
    }
    case LinearRelation_Mode.COMPARE: {
      // Function A is a table whose x steps by 1 or 2 from 0, 1 or 2, or a
      // proportional graph; B is an equation. The table's step means a child
      // must divide the change in y by the change in x.
      // Each form once before any repeats, and a fresh pair of rates.
      const form = pickFresh(ctx, 'lcmp-form', () => rng.int(0, 2));
      const [m1, m2] = pickFresh(ctx, 'lcmp', () => {
        const m1 = rng.int(2, 9);
        let m2 = rng.int(2, 9);
        while (m2 === m1) {
          m2 = rng.int(2, 9);
        }
        return [m1, m2];
      });
      const [b1, b2, start, step] = [rng.int(0, 10), rng.int(0, 10), rng.int(0, 2), form === 1 ? 2 : 1];
      const graph = form === 2;
      const xs = [0, 1, 2, 3].map((i) => start + step * i);
      const shown = graph
        ? plane({ xMin: 0, xMax: 10, yMin: 0, yMax: 10, yScale: 10, labelEvery: 2, xLabel: 'x', yLabel: 'y', points: [gp(10, m1, `(10, ${10 * m1})`)], segments: [seg(0, 0, 10, m1)] })
        : table(['x', 'y'], xs.map((x) => [cellText(String(x)), cellText(String(m1 * x + b1))]), 'Function A');
      return [
        // The graph's point label needs the room to its right, so function B
        // goes under the graph.
        ...(graph ? [text('Function A is the line on the graph.'), shown, math('Function B:', `y = ${linear(m2, b2)}`)] : [row(shown, math('Function B:', `y = ${linear(m2, b2)}`))]),
        row(math('Rate of change of A:', blank(field(ctx, 'rate of change of A', String(m1)))), math('of B:', blank(field(ctx, 'rate of change of B', String(m2))))),
        math('Which grows faster?'),
        choices(ctx, 'faster function', ['A', 'B'], m1 > m2 ? 'A' : 'B'),
      ];
    }
    case LinearRelation_Mode.SLOPE_TRIANGLE: {
      const [x1, y1, run, rise] = pickFresh(ctx, 'tri', () => {
        for (;;) {
          const run = rng.int(1, 5);
          const rise = nonzero(ctx, -5, 5);
          const x1 = rng.int(0, 10 - run);
          const y1 = rng.int(Math.max(0, -rise), Math.min(10, 10 - rise));
          if (gcd(rise, run) === 1 || rng.next() < 0.3) {
            return [x1, y1, run, rise];
          }
        }
      });
      const s = fracText(rise, run);
      return [
        plane({
          xMin: 0,
          xMax: 10,
          yMin: 0,
          yMax: 10,
          points: [gp(x1, y1), gp(x1 + run, y1 + rise)],
          segments: [
            seg(x1, y1, x1 + run, y1 + rise, { extend: true }),
            seg(x1, y1, x1 + run, y1, { dashed: true, labelBefore: rise < 0, field: field(ctx, 'the run', String(run)) }),
            seg(x1 + run, y1, x1 + run, y1 + rise, { dashed: true, field: field(ctx, 'the rise', num(rise)) }),
          ],
        }),
        math('Slope = rise ÷ run =', blank(field(ctx, 'the slope', s, unique([`${num(rise)}/${run}`]).filter((x) => x !== s && !x.endsWith('/1'))))),
      ];
    }
    case LinearRelation_Mode.SCATTER:
    case LinearRelation_Mode.LINE_OF_FIT: {
      const fit = mode === LinearRelation_Mode.LINE_OF_FIT;
      // Without a line, each association once before any repeats.
      const kind = fit ? 0 : pickFresh(ctx, 'scatter-kind', () => rng.int(0, 2));
      const [b, e, seedPts] = pickFresh(ctx, 'scatter' + mode, () => [rng.int(2, 5), rng.int(3, 5), rng.int(0, 999)]);
      // Points near a line: rising, falling, or none at all.
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const x = 1 + ((i * 7 + seedPts) % 10);
        const noise = ((i * 37 + seedPts * 13) % 5) - 2;
        // A scatter plot without a line uses a steeper trend, so the
        // association is plain to see.
        const g = fit ? e / 10 : 0.7;
        const y = kind === 0 ? (fit ? b : 1) + g * x + noise / 2 : kind === 1 ? 9.5 - g * x - noise / 2 : 2 + ((i * 53 + seedPts) % 7);
        pts.push([x, Math.max(0, Math.min(10, Math.round(y)))]);
      }
      // Axes that suit the association, so the plot makes sense.
      const [xLabel, yLabel] = fit ? ['Hours', 'Score'] : SCATTER_AXES[kind];
      const base = { xMin: 0, xMax: 10, yMin: 0, yMax: 10, yScale: 10, labelEvery: 2, xLabel, yLabel, points: pts.map(([x, y]) => gp(x, y)) };
      if (!fit) {
        const answer = ['positive', 'negative', 'no association'][kind];
        return [plane(base), choices(ctx, 'the association', ['positive', 'negative', 'no association'], answer)];
      }
      const x = 2 * rng.int(1, 4) + 1;
      return [
        text(`A line of fit for hours studied and test score goes through (0, ${10 * b}) and (10, ${10 * b + 10 * e}).`),
        plane({ ...base, segments: [seg(0, b, 10, b + e, {})] }),
        math('Slope:', blank(field(ctx, 'slope of the line of fit', String(e))), 'points per hour'),
        math(`Predicted score for ${x} hours:`, blank(field(ctx, `predicted score for ${x} hours`, String(10 * b + e * x)))),
      ];
    }
    case LinearRelation_Mode.SYSTEM_GRAPH: {
      const [x, y, a, c] = pickFresh(ctx, 'sysg', () => {
        for (;;) {
          const x = rng.int(-4, 4);
          const y = rng.int(-4, 4);
          const a = nonzero(ctx, -3, 3);
          const c = nonzero(ctx, -3, 3);
          if (a !== c) {
            return [x, y, a, c];
          }
        }
      });
      return [
        text(`Line 1: y = ${linear(a, y - a * x)}. Line 2: y = ${linear(c, y - c * x)}.`),
        plane({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, segments: [seg(x, y, x + 1, y + a, { extend: true }), seg(x, y, x + 1, y + c, { extend: true })] }),
        math('They cross at (', blank(field(ctx, 'x where the lines cross', num(x))), ',', blank(field(ctx, 'y where the lines cross', num(y))), ')'),
      ];
    }
    case LinearRelation_Mode.PREDICT: {
      const i = pickFresh(ctx, 'pred-model', () => rng.int(0, MODELS.length - 1));
      const [m10, b, x] = pickFresh(ctx, 'pred', () => [rng.int(5, 40), rng.int(2, 30), rng.int(3, 12)]);
      const m = m10 / 10;
      const [say, xw, yw, rate, start] = MODELS[i];
      return [
        text(say.replace('#', `${num(m)}x + ${b}`)),
        math(`Predict ${yw} when ${xw} is ${x}:`, blank(field(ctx, `${yw} at ${x}`, num(m * x + b)))),
        math(`${rate}:`, blank(field(ctx, rate, num(m)))),
        math(`${start}:`, blank(field(ctx, start, String(b)))),
      ];
    }
    default: {
      const [x1, y1, x2, y2] = pickFresh(ctx, 'slope', () => {
        const x1 = rng.int(-6, 6);
        let x2 = rng.int(-6, 8);
        while (x2 === x1) {
          x2 = rng.int(-6, 8);
        }
        return [x1, rng.int(-8, 8), x2, rng.int(-8, 8)];
      });
      const s = fracText(y2 - y1, x2 - x1);
      const also = unique([`${num(y2 - y1)}/${num(x2 - x1)}`]).filter((x) => x !== s && !x.endsWith('/1'));
      return [math(`Slope through ${pt(x1, y1)} and ${pt(x2, y2)} =`, blank(field(ctx, `slope through ${pt(x1, y1)} and ${pt(x2, y2)}`, s, also))), work(1)];
    }
  }
}

const VARS = ['x', 'n', 'y', 'm', 'k'];

// Quantities to compare in scientific notation: the smaller, the larger
// with # for the number, and the range of the larger one's power of 10.
const SCI_COMPARE: [string, string, number, number][] = [
  ['A town has about # people.', 'A country has about # people.', 7, 8],
  ['A bacterium is about # meters long.', 'A hair is about # meters wide.', -4, -4],
  ['A grain of fine sand is about # meters wide.', 'A pebble is about # meters wide.', -2, -2],
  ['A phone photo takes up about # bytes.', 'A long movie takes up about # bytes.', 9, 10],
  ['A pond holds about # liters of water.', 'A large lake holds about # liters.', 11, 13],
];

const RATIO_SCENES: [string, string, string][] = [
  ['red marbles', 'blue marbles', 'in a bag'],
  ['dogs', 'cats', 'at the shelter'],
  ['apples', 'oranges', 'in the bowl'],
  ['cars', 'trucks', 'in the parking lot'],
  ['pencils', 'pens', 'in the box'],
  ['tulips', 'roses', 'in the garden'],
  ['fiction books', 'nonfiction books', 'on the shelf'],
];

const TABLE_THEMES: [string, string][] = [
  ['Flour (cups)', 'Milk (cups)'],
  ['Laps', 'Minutes'],
  ['Red beads', 'Blue beads'],
  ['Tickets', 'Dollars'],
  ['Cans of paint', 'Rooms'],
];

const RATE_ITEMS = ['notebooks', 'muffins', 'pens', 'apples', 'stickers'];

// Each: the larger unit, the smaller, how many of the smaller make one, and
// the larger unit's singular.
const MEASURES: [string, string, number, string][] = [
  ['feet', 'inches', 12, 'foot'],
  ['yards', 'feet', 3, 'yard'],
  ['hours', 'minutes', 60, 'hour'],
  ['meters', 'centimeters', 100, 'meter'],
  ['kilograms', 'grams', 1000, 'kilogram'],
  ['gallons', 'quarts', 4, 'gallon'],
  ['pounds', 'ounces', 16, 'pound'],
  ['kilometers', 'meters', 1000, 'kilometer'],
  ['quarts', 'cups', 4, 'quart'],
];

// Row names, column names, and three questions: a fraction of the first
// column, a fraction of the first row, and whether the first row's share is
// larger in the first column than in the second.
const TWO_WAY: [[string, string], [string, string], string, string, string][] = [
  [
    ['Plays a sport', 'No sport'],
    ['Grade 7', 'Grade 8'],
    'Of the grade 7 students, what fraction play a sport?',
    'Of the students who play a sport, what fraction are in grade 8?',
    'Is a grade 7 student more likely to play a sport than a grade 8 student?',
  ],
  [
    ['Has a pet', 'No pet'],
    ['Walks to school', 'Rides'],
    'Of the students who walk, what fraction have a pet?',
    'Of the students with a pet, what fraction ride?',
    'Is a student who walks more likely to have a pet than one who rides?',
  ],
  [
    ['Likes pizza best', 'Likes tacos best'],
    ['Grade 6', 'Grade 7'],
    'Of the grade 6 students, what fraction like pizza best?',
    'Of the students who like pizza best, what fraction are in grade 7?',
    'Is a grade 6 student more likely to like pizza best than a grade 7 student?',
  ],
];

// Phrases for an integer, with # for the number, and the integer's sign.
const CONTEXTS: [string, number][] = [
  ['# feet below sea level', -1],
  ['# meters above sea level', 1],
  ['a deposit of $#', 1],
  ['a withdrawal of $#', -1],
  ['# degrees below zero', -1],
  ['# degrees above zero', 1],
  ['a gain of # yards', 1],
  ['a loss of # yards', -1],
  ['# floors below the ground floor', -1],
];

type Phrase = (a: number, b: number, v: string) => [string, string, string[]];

const WORDS: Phrase[] = [
  (a, b, v) => [`${a} more than ${v}`, `${v} + ${a}`, [`${a} + ${v}`]],
  (a, b, v) => [`${a} less than ${v}`, `${v} − ${a}`, []],
  (a, b, v) => [`${v} less than ${a}`, `${a} − ${v}`, []],
  (a, b, v) => [`the product of ${a} and ${v}`, `${a}${v}`, [`${a} × ${v}`, `${v} × ${a}`]],
  (a, b, v) => [`${v} divided by ${a}`, `${v} ÷ ${a}`, [`${v}/${a}`]],
  (a, b, v) => [`${a} times the sum of ${v} and ${b}`, `${a}(${v} + ${b})`, [`${a}(${b} + ${v})`]],
  (a, b, v) => [`${b} less than ${a} times ${v}`, `${a}${v} − ${b}`, []],
  (a, b, v) => [`${v} squared, plus ${a}`, `${v}² + ${a}`, [`${v}^2 + ${a}`]],
];

const STORIES: Phrase[] = [
  (a, b, v) => [`Pens cost $${a} each. Write the cost in dollars of ${v} pens.`, `${a}${v}`, [`${a} × ${v}`]],
  (a, b, v) => [`Sam is ${v} years old. Mia is ${a} years older. Write Mia's age.`, `${v} + ${a}`, [`${a} + ${v}`]],
  (a, b, v) => [`A ribbon ${v} inches long is cut into ${a} equal pieces. Write the length of each piece.`, `${v} ÷ ${a}`, [`${v}/${a}`]],
  (a, b, v) => [`A ticket costs $${a} and a snack costs $${b}. Write the cost for ${v} people who each get both.`, `${a + b}${v}`, [`${v}(${a} + ${b})`, `(${a} + ${b})${v}`]],
  (a, b, v) => [`A plant is ${a} cm tall and grows ${b} cm a week. Write its height after ${v} weeks.`, `${a} + ${b}${v}`, [`${b}${v} + ${a}`]],
];

const INEQUALITIES: ((n: number, t: number) => [string, string, string[]])[] = [
  (n) => [`You must be at least ${30 + (2 * n) / 5} inches tall to ride. Use h for height.`, `h ≥ ${30 + (2 * n) / 5}`, [`h >= ${30 + (2 * n) / 5}`, `${30 + (2 * n) / 5} ≤ h`]],
  (n) => [`Fewer than ${n} people fit in the room. Use p for people.`, `p < ${n}`, [`${n} > p`]],
  (n) => [`A bag can hold at most ${n} pounds. Use w for weight.`, `w ≤ ${n}`, [`w <= ${n}`, `${n} ≥ w`]],
  (n) => [`More than ${n} students signed up. Use s for students.`, `s > ${n}`, [`${n} < s`]],
  (n, t) => [`The temperature stayed above ${MINUS}${t}°F all night. Use t for temperature.`, `t > ${MINUS}${t}`, [`t > -${t}`]],
];

// Each: the story with the rule, the two variable names, and the table's
// column headings.
const RULE_STORIES: [(m: number, b: number) => string, string, string, string, string][] = [
  [(m, b) => `A taxi ride costs $${b} plus $${m} a mile: c = ${m}d + ${b}.`, 'd', 'c', 'Miles, d', 'Cost ($), c'],
  [(m, b) => `A plant is ${b} cm tall and grows ${m} cm a week: h = ${m}w + ${b}.`, 'w', 'h', 'Weeks, w', 'Height (cm), h'],
  [(m, b) => `A tank holds ${b} gallons and fills ${m} gallons a minute: g = ${m}t + ${b}.`, 't', 'g', 'Minutes, t', 'Gallons, g'],
  [(m, b) => `A gym charges $${b} to join and $${m} a visit: c = ${m}v + ${b}.`, 'v', 'c', 'Visits, v', 'Cost ($), c'],
];

// Data themes: what is counted, and the range of values.
const DATA_THEMES: [string, number, number][] = [
  ['Points scored', 2, 20],
  ['Minutes to walk to school', 4, 25],
  ['Hours of sleep', 6, 11],
  ['Books read', 1, 15],
];

const MEASURES_OF: [string, string][] = [
  ['mean', 'center'],
  ['median', 'center'],
  ['mode', 'center'],
  ['range', 'spread'],
  ['interquartile range', 'spread'],
  ['mean absolute deviation', 'spread'],
];

// Axis names for a graphed proportional relationship, what the unit rate
// is, and its unit.
const GRAPH_THEMES: [string, string, string, string][] = [
  ['Pounds', 'Cost ($)', 'Cost per pound ($)', 'dollars'],
  ['Hours', 'Miles', 'Miles per hour', 'miles'],
  ['Minutes', 'Pages', 'Pages per minute', 'pages'],
];

// Slices through solids: the solid (0 a box, else a RoundSolid kind), the
// slice, and its shape.
const SLICES: [number, string, string][] = [
  [0, 'Slice the box parallel to its base. What shape is the slice?', 'rectangle'],
  [0, 'Slice the box straight down, parallel to its front. What shape is the slice?', 'rectangle'],
  [2, 'Slice the cylinder parallel to its base. What shape is the slice?', 'circle'],
  [2, 'Slice the cylinder straight down through its center. What shape is the slice?', 'rectangle'],
  [3, 'Slice the cone parallel to its base. What shape is the slice?', 'circle'],
  [3, 'Slice the cone straight down through its tip. What shape is the slice?', 'triangle'],
  [4, 'Slice the ball anywhere. What shape is the slice?', 'circle'],
];

const STAT_QUESTIONS: [string, boolean][] = [
  ['How tall are the students in my class?', true],
  ['How tall is Mia?', false],
  ['How many pets do the families on my street have?', true],
  ['How many pets does my family have?', false],
  ['How many hours do sixth graders sleep on a school night?', true],
  ['What time did I go to bed last night?', false],
  ['How much does a gallon of milk cost at different stores?', true],
  ['How many days are in March?', false],
  ['How many books did each student in my grade read this summer?', true],
  ['How old is the principal?', false],
];

const SAMPLES: [string, boolean][] = [
  ['To find the favorite sport at a school, ask 30 students picked at random from the school list.', true],
  ['To find the favorite sport at a school, ask the 30 students on the soccer team.', false],
  ['To find how often people in a town use the library, ask people leaving the library.', false],
  ["To find how often people in a town use the library, ask every 20th name on the town's list of homes.", true],
  ['To find how late students go to bed, draw 25 names from a hat that holds every student\'s name.', true],
  ['To find what lunch the school should serve, ask the first 20 students in line on pizza day.', false],
  ['To find the average height of seventh graders in a state, measure 50 picked at random from all of them.', true],
  ['To find how much people like a new movie, ask people as they leave a fan club meeting for it.', false],
];

// Compound events: what happens, the sample space, and which outcomes count.
const coin = ['H', 'T'];
const cube = [1, 2, 3, 4, 5, 6];
const twoCoins = () => coin.flatMap((a) => coin.map((b) => [a, b] as [string, string]));
const coinCube = () => coin.flatMap((a) => cube.map((b) => [a, b] as [string, number]));
const twoCubes = () => cube.flatMap((a) => cube.map((b) => [a, b] as [number, number]));
const EVENTS: [string, () => unknown[][], (o: unknown[]) => boolean][] = [
  ['Toss two coins. Find the chance of two heads.', twoCoins, (o) => o[0] === 'H' && o[1] === 'H'],
  ['Toss two coins. Find the chance of one head and one tail.', twoCoins, (o) => o[0] !== o[1]],
  ['Toss a coin and roll a number cube. Find the chance of heads and an even number.', coinCube, (o) => o[0] === 'H' && (o[1] as number) % 2 === 0],
  ['Toss a coin and roll a number cube. Find the chance of tails and a number greater than 4.', coinCube, (o) => o[0] === 'T' && (o[1] as number) > 4],
  ['Roll two number cubes. Find the chance the sum is 7.', twoCubes, (o) => (o[0] as number) + (o[1] as number) === 7],
  ['Roll two number cubes. Find the chance of doubles.', twoCubes, (o) => o[0] === o[1]],
  ['Roll two number cubes. Find the chance the sum is greater than 9.', twoCubes, (o) => (o[0] as number) + (o[1] as number) > 9],
  ['Roll two number cubes. Find the chance both numbers are even.', twoCubes, (o) => (o[0] as number) % 2 === 0 && (o[1] as number) % 2 === 0],
];

const TRIPLES: [number, number, number][] = [
  [3, 4, 5],
  [6, 8, 10],
  [5, 12, 13],
  [8, 15, 17],
  [9, 12, 15],
  [12, 16, 20],
  [7, 24, 25],
  [20, 21, 29],
  [12, 5, 13],
  [4, 3, 5],
  [15, 8, 17],
];

// Linear models: the story with # for the rule, the x and y words, what the
// slope means, and what the starting value means.
const MODELS: [string, string, string, string, string][] = [
  ["A plant's height in cm after x weeks is about y = #.", 'x', 'the height', 'Growth each week (cm)', 'Height at the start (cm)'],
  ['The cost in dollars of x pounds of fruit plus a bag fee is y = #.', 'x', 'the cost', 'Cost per pound ($)', 'Bag fee ($)'],
  ['The water in a tank, in gallons, after x minutes of filling is y = #.', 'x', 'the water', 'Gallons added each minute', 'Gallons at the start'],
  ['A phone plan costs y = # dollars for x gigabytes of data in a month.', 'x', 'the cost', 'Cost per gigabyte ($)', 'Monthly charge with no data ($)'],
];

// Scatter plot axes for a positive association, a negative one, and none.
const SCATTER_AXES: [string, string][] = [
  ['Hours studied', 'Score'],
  ['Days absent', 'Score'],
  ['Shoe size', 'Score'],
];
