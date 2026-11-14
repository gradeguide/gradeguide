import { create, toBinary } from '@bufbuild/protobuf';

import { EXAMPLES } from '../examples/examples_data.js';
import { type Field, type Node } from '../proto/v1/nodes_pb.js';
import {
  type ComposedSheet,
  type ItemKind,
  ComposedSheetSchema,
  AreaByCountingSchema,
  CircleFractionSchema,
  CompareDecimalsSchema,
  FractionAddSubtractSchema,
  FractionTimesWholeSchema,
  ItemKindSchema,
  MissingFactorSchema,
  WorksheetSchema,
  WritingSize,
} from '../proto/v1/worksheet_pb.js';
import { Fields, blank, fieldsOf, math, text } from './build.js';
import { checkAuthored, evaluate, parseAnswer } from './check.js';
import { allNodes, compose } from './compose.js';
import { generate } from './kinds.js';
import { decodeLibrary } from './library.js';
import { Rng } from './rng.js';
import { verifyLibrary } from './verify.js';

const lib = decodeLibrary(Uint8Array.from(atob(EXAMPLES), (c) => c.charCodeAt(0)));

function sheetFor(id: string): ComposedSheet {
  const ws = lib.worksheets.find((w) => w.id === id);
  if (!ws) {
    throw new Error(`no worksheet ${id}`);
  }
  return compose(ws, lib);
}

function sections(s: ComposedSheet) {
  return s.pages.flatMap((p) => p.sections);
}

describe('the catalogue', () => {
  it('has at least a dozen worksheets', () => {
    expect(lib.worksheets.length).toBeGreaterThanOrEqual(12);
  });

  it('passes every whole-library check', () => {
    expect(verifyLibrary(lib)).toEqual([]);
  });

  it('places only fragments that exist', () => {
    const ids = new Set(lib.fragments.map((f) => f.id));
    for (const w of lib.worksheets) {
      for (const p of w.placements) {
        expect(ids.has(p.fragmentId)).withContext(`${w.id} → ${p.fragmentId}`).toBeTrue();
      }
    }
  });
});

describe('compose', () => {
  for (const ws of lib.worksheets) {
    describe(ws.id, () => {
      const sheet = compose(ws, lib);

      it('fits its pages with no problems', () => {
        expect(sheet.problems).toEqual([]);
        expect(sheet.pages.length).toBeLessThanOrEqual(ws.maxPages || 1);
      });

      it('gives every field a unique id and an answer', () => {
        const ids = sheet.key.map((k) => k.field?.id ?? '');
        expect(new Set(ids).size).toBe(ids.length);
        for (const k of sheet.key) {
          expect(k.field?.id).toMatch(/^q[a-z0-9_]+(-\d+)?$/);
          expect(k.field?.answer?.text ?? '').withContext(k.field?.id ?? '').not.toBe('');
        }
      });

      it('composes the same sheet every time', () => {
        expect(toBinary(ComposedSheetSchema, compose(ws, lib))).toEqual(toBinary(ComposedSheetSchema, sheet));
      });

      it('has no fields in worked examples or figures', () => {
        for (const s of sections(sheet)) {
          expect(fieldsOf([...(s.example?.nodes ?? []), ...s.figure]).every((f) => f.id === '')).toBeTrue();
        }
      });
    });
  }
});

describe('numbering', () => {
  it('numbers one fragment differently on two worksheets', () => {
    const a = sections(sheetFor('ws-equivalent-fractions-number-line')).find((s) => s.fragmentId === 'frag-fraction-at-arrow');
    const b = sections(sheetFor('ws-mixed-review')).find((s) => s.fragmentId === 'frag-fraction-at-arrow');
    expect(a?.label).toBe('A');
    expect(a?.items.map((i) => i.label)).toEqual(['1', '2']);
    expect(b?.label).toBe('1');
    expect(b?.items.map((i) => i.label)).toEqual(['1a', '1b']);
  });

  it('runs item numbers on across sections', () => {
    const s = sections(sheetFor('ws-comparing-fractions'));
    const labels = s.flatMap((x) => x.items.map((i) => i.label));
    expect(labels).toEqual(labels.map((_, i) => String(i + 1)));
  });

  it('letters items past z', () => {
    const s = sections(sheetFor('ws-facts-check'))[0];
    expect(s.items[25].label).toBe('1z');
    expect(s.items[26].label).toBe('1aa');
  });

  it('names fields after their item label', () => {
    const s = sheetFor('ws-facts-check');
    expect(s.key[0].field?.id).toBe('q1a');
    expect(s.key[0].itemLabel).toBe('1a');
  });
});

// Each check recomputes an answer from what the widget shows, independently
// of the generator.
describe('computed answers agree with the drawings', () => {
  const nodes: Node[] = lib.worksheets.flatMap((w) => compose(w, lib)).flatMap(allNodes);
  const walk = (ns: Node[], f: (n: Node, i: number, all: Node[]) => void) => ns.forEach((n, i, all) => f(n, i, all));

  it('fraction at the arrow', () => {
    let checked = 0;
    walk(nodes, (n, i, all) => {
      const next = all[i + 1];
      if (n.kind.case === 'numberLine' && n.kind.value.hasArrow && next?.kind.case === 'math') {
        const a = next.kind.value.atoms[0]?.kind;
        if (a?.case === 'fractionBlank' && a.value.id) {
          expect(a.value.answer?.text).toBe(`${n.kind.value.arrowTick}/${n.kind.value.partsPerUnit}`);
          checked++;
        }
      }
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('area model cells and products', () => {
    let checked = 0;
    walk(nodes, (n, i, all) => {
      if (n.kind.case !== 'areaModel') {
        return;
      }
      const m = n.kind.value;
      let sum = 0;
      m.rowParts.forEach((r, ri) =>
        m.colParts.forEach((c, ci) => {
          const f = m.cells[ri * m.colParts.length + ci]?.field;
          expect(f?.answer?.text).toBe(String(r * c));
          sum += r * c;
        }),
      );
      const total = all[i + 1];
      if (total?.kind.case === 'math') {
        const atoms = total.kind.value.atoms;
        const a = Number(atoms[0].kind.value);
        const b = Number(atoms[2].kind.value);
        const blank = atoms[4].kind;
        expect(a * b).toBe(sum);
        if (blank.case === 'blank') {
          expect(blank.value.answer?.text).toBe(String(sum));
        }
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('column arithmetic', () => {
    let checked = 0;
    walk(nodes, (n) => {
      if (n.kind.case !== 'columnArithmetic' || !n.kind.value.answer?.id) {
        return;
      }
      const [x, y] = n.kind.value.operands.map(Number);
      const op = n.kind.value.op;
      const want = op === 1 ? x + y : op === 2 ? x - y : x * y;
      expect(n.kind.value.answer.answer?.text).toBe(String(want));
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('long division', () => {
    let checked = 0;
    walk(nodes, (n) => {
      if (n.kind.case !== 'longDivision' || !n.kind.value.quotient?.id) {
        return;
      }
      const l = n.kind.value;
      const q = Number(l.quotient?.answer?.text);
      const r = Number(l.remainder?.answer?.text ?? '0');
      expect(q * l.divisor + r).toBe(Number(l.dividend));
      expect(r).toBeLessThan(l.divisor);
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('protractor, clock and ruler readings', () => {
    let checked = 0;
    walk(nodes, (n, i, all) => {
      const next = all[i + 1];
      const a = next?.kind.case === 'math' ? next.kind.value.atoms.find((x) => x.kind.case === 'blank')?.kind : undefined;
      if (a?.case !== 'blank' || !a.value.id) {
        return;
      }
      const ans = a.value.answer?.text ?? '';
      if (n.kind.case === 'protractor') {
        expect(ans).toBe(`${n.kind.value.degrees}°`);
        checked++;
      } else if (n.kind.case === 'clock') {
        expect(ans).toBe(`${n.kind.value.hour}:${String(n.kind.value.minute).padStart(2, '0')}`);
        checked++;
      } else if (n.kind.case === 'ruler') {
        const r = n.kind.value;
        const [w, f] = ans.includes(' ') ? ans.split(' ') : ['0', ans];
        const [fn, fd] = f.includes('/') ? f.split('/').map(Number) : [Number(f), 1];
        expect(Number(w) + fn / fd).toBeCloseTo(r.barParts / r.partsPerInch, 9);
        checked++;
      }
    });
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it('angles add up to their whole', () => {
    let checked = 0;
    walk(nodes, (n) => {
      if (n.kind.case !== 'angle' || n.kind.value.rays.length !== 2) {
        return;
      }
      const [part, whole] = n.kind.value.rays;
      expect(n.kind.value.arcs[1].field?.answer?.text).toBe(`${whole - part}°`);
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  });
});

describe('authored items', () => {
  // item is one question with a typed answer and its working.
  function item(story: string, answer: string, work: string): Node[] {
    const f = new Fields('x').field('answer', answer);
    f.answer!.work = work;
    return [text(story), math(blank(f))];
  }

  it('evaluates working with × ÷ + − and parentheses', () => {
    expect(evaluate('9 × 8 − 4 × 8')).toBe(40);
    expect(evaluate('(3 + 4) × 1,000')).toBe(7000);
    expect(evaluate('84 ÷ 6')).toBe(14);
    expect(evaluate('9 × apples')).toBeUndefined();
  });

  it('reads fraction and mixed-number answers', () => {
    expect(parseAnswer('5/8')).toBe(0.625);
    expect(parseAnswer('2 1/4')).toBe(2.25);
    expect(parseAnswer('$1,200')).toBe(1200);
    expect(parseAnswer('lots')).toBeNaN();
    expect(checkAuthored(item('Mia ate 2/8 of a pizza and Ben ate 3/8.', '5/8', '2/8 + 3/8'), 'q')).toEqual([]);
  });

  it('accepts working that comes to the answer from numbers the item shows', () => {
    expect(checkAuthored(item('Each of 9 boxes holds 8 pens.', '72', '9 × 8'), 'q')).toEqual([]);
  });

  it('rejects working that does not come to the answer', () => {
    expect(checkAuthored(item('Each of 9 boxes holds 8 pens.', '71', '9 × 8'), 'q').length).toBe(1);
  });

  it('rejects working that uses a number the item does not show', () => {
    expect(checkAuthored(item('Each of 9 boxes holds 8 pens.', '63', '9 × 7'), 'q').join()).toContain('uses 7');
  });

  it('rejects an authored answer with no working', () => {
    expect(checkAuthored(item('Each of 9 boxes holds 8 pens.', '72', ''), 'q').join()).toContain('no working');
  });

  it('labels parts after their item and names fields after the parts', () => {
    const sheet = sheetFor('ws-multiplication-strategies');
    const labels = sheet.key.map((k) => k.itemLabel);
    const parts = labels.filter((l) => /\d+[ab]$/.test(l));
    expect(parts.length).toBe(4);
    for (const k of sheet.key.filter((k) => /\d+[ab]$/.test(k.itemLabel))) {
      expect(k.field?.id).toBe('q' + k.itemLabel);
    }
  });

  it('sizes working space from the working', () => {
    const rows: number[] = [];
    const visit = (n: Node) => {
      if (n.kind.case === 'workSpace') {
        rows.push(n.kind.value.rows);
      } else if (n.kind.case === 'multiPartQuestion') {
        n.kind.value.parts.forEach((p) => p.response.forEach(visit));
      }
    };
    allNodes(sheetFor('ws-multiplication-strategies')).forEach(visit);
    // "23 × 8", "184 − 12 × 8", "4 × 12", "48 + 6 × 7", "14 × 6": a row per
    // step, one more, and one for the answer written in the space.
    expect(rows).toEqual([3, 4, 3, 4, 3]);
  });
});

describe('writing size', () => {
  it('makes write-in space taller and leaves the record unchanged', () => {
    const ws = lib.worksheets.find((w) => w.id === 'ws-multiplication-strategies')!;
    const before = toBinary(WorksheetSchema, ws);
    const standard = compose(ws, lib, { writingSize: WritingSize.STANDARD });
    const large = compose(ws, lib, { writingSize: WritingSize.LARGE });
    const total = (s: ComposedSheet) => s.pages.reduce((a, p) => a + p.estimatedHeight, 0);
    expect(total(large)).toBeGreaterThan(total(standard));
    expect(large.writingSize).toBe(WritingSize.LARGE);
    expect(toBinary(WorksheetSchema, ws)).toEqual(before);
  });
});

// Each new kind's answers, recomputed from what the item prints.
describe('item kinds', () => {
  const items = (kind: ItemKind['kind'], n = 30) => {
    const rng = new Rng(7);
    const used = new Set<string>();
    const fresh = (k: string) => !used.has(k) && !!used.add(k);
    return Array.from({ length: n }, (_, i) => generate(create(ItemKindSchema, { kind }), { rng, fields: new Fields(`q${i}`), fresh }));
  };
  const atoms = (n: Node) => (n.kind.case === 'math' ? n.kind.value.atoms : []);

  it('adds and subtracts same-denominator fractions', () => {
    for (const subtract of [false, true]) {
      for (const [n] of items({ case: 'fractionAddSubtract', value: create(FractionAddSubtractSchema, { subtract }) })) {
        const [a, , b, , ans] = atoms(n);
        const x = a.kind.value as { num: number; den: number };
        const y = b.kind.value as { num: number; den: number };
        const want = subtract ? x.num - y.num : x.num + y.num;
        expect(parseAnswer((ans.kind.value as Field).answer!.text)).toBeCloseTo(want / x.den);
      }
    }
  });

  it('compares decimals', () => {
    for (const [n] of items({ case: 'compareDecimals', value: create(CompareDecimalsSchema, {}) })) {
      const [a, c, b] = atoms(n);
      const x = Number(a.kind.value);
      const y = Number(b.kind.value);
      expect((c.kind.value as Field).answer!.text).toBe(x > y ? '>' : x < y ? '<' : '=');
    }
  });

  it('finds the missing factor', () => {
    for (const [n] of items({ case: 'missingFactor', value: create(MissingFactorSchema, {}) })) {
      const parts = atoms(n).map((a) => {
        const v = a.kind.case === 'blank' ? a.kind.value.answer!.text : String(a.kind.value);
        return /^\d+$/.test(v) ? Number(v) : v;
      });
      const [p, op, q, , r] = parts as [number, string, number, string, number];
      expect(op === '×' ? p * q : p / q).toBe(r);
    }
  });

  it('multiplies a fraction by a whole number', () => {
    for (const [, n] of items({ case: 'fractionTimesWhole', value: create(FractionTimesWholeSchema, {}) })) {
      const [w, , f, , ans] = atoms(n);
      const x = f.kind.value as { num: number; den: number };
      expect(parseAnswer((ans.kind.value as Field).answer!.text)).toBeCloseTo((Number(w.kind.value) * x.num) / x.den);
    }
  });

  it('counts the squares of a shape', () => {
    for (const lShapes of [false, true]) {
      for (const [shape, line] of items({ case: 'areaByCounting', value: create(AreaByCountingSchema, { lShapes }) })) {
        const cells = shape.kind.case === 'gridShape' ? shape.kind.value.cells.length : -1;
        const ans = atoms(line).find((a) => a.kind.case === 'blank')!.kind.value as Field;
        expect(Number(ans.answer!.text)).toBe(cells);
      }
    }
  });

  it('names and shades parts of a circle', () => {
    for (const [circle, line] of items({ case: 'circleFraction', value: create(CircleFractionSchema, {}) })) {
      const c = circle.kind.case === 'fractionCircle' ? circle.kind.value : undefined;
      const ans = atoms(line)[0].kind.value as Field;
      expect(ans.answer!.text).toBe(`${c!.shaded}/${c!.parts}`);
    }
    for (const [line, circle] of items({ case: 'circleFraction', value: create(CircleFractionSchema, { childShades: true }) })) {
      const f = atoms(line)[1].kind.value as { num: number; den: number };
      const c = circle.kind.case === 'fractionCircle' ? circle.kind.value : undefined;
      expect(c!.parts).toBe(f.den);
      expect(c!.shadeField!.answer!.text).toBe(`${f.num}/${f.den}`);
    }
  });
});

// Grade 5 kinds: each answer recomputed from what the item prints.
describe('grade 5 item kinds', () => {
  type Init = Parameters<typeof create<typeof ItemKindSchema>>[1];
  const items = (kind: NonNullable<Init>['kind'], n = 40) => {
    const rng = new Rng(11);
    const used = new Set<string>();
    const fresh = (k: string) => !used.has(k) && !!used.add(k);
    return Array.from({ length: n }, (_, i) => generate(create(ItemKindSchema, { kind }), { rng, fields: new Fields(`q${i}`), fresh }));
  };
  const atomsOf = (n: Node) => (n.kind.case === 'math' ? n.kind.value.atoms : []);
  const fieldOf = (n: Node, i = 0) => fieldsOf([n])[i];
  const ans = (n: Node, i = 0) => fieldOf(n, i)?.answer?.text ?? '';
  const num = (s: string) => parseAnswer(s.replace(/[^\d.,/ ]/g, '').trim());
  // value reads a math atom as a number: a fraction, a mixed number's whole,
  // or a number in text.
  const value = (a: ReturnType<typeof atomsOf>[number]) =>
    a.kind.case === 'fraction' ? a.kind.value.num / a.kind.value.den : a.kind.case === 'text' ? num(a.kind.value) : NaN;
  const unsup = (s: string) => s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => '^' + [...m].map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join(''));
  const arith = (s: string) => evaluate(unsup(s).replace(/,/g, '').replace(/10\^(\d+)/g, (_, e) => String(10 ** Number(e))).replace(/\[/g, '(').replace(/\]/g, ')'));

  it('evaluates expressions with parentheses and brackets', () => {
    for (const brackets of [false, true]) {
      for (const [n] of items({ case: 'numericalExpression', value: { brackets } })) {
        const [e] = atomsOf(n);
        expect(arith(String(e.kind.value))).toBe(Number(ans(n)));
      }
    }
  });

  it('writes expressions that use the numbers in the words', () => {
    for (const ns of items({ case: 'expressionInWords', value: {} })) {
      const answer = ans(ns[ns.length - 1]);
      if (ns.length === 1) {
        // "c × (big + small) is ☐ times as large as big + small."
        expect(String(atomsOf(ns[0])[0].kind.value).startsWith(answer + ' × (')).toBeTrue();
        continue;
      }
      const words = ns[0].kind.value as string;
      expect(arith(answer)).withContext(answer).toBeDefined();
      for (const x of words.match(/\d+/g) ?? []) {
        expect(answer).toContain(x);
      }
    }
  });

  it('fills in two patterns and compares them', () => {
    for (const [table, ratio] of items({ case: 'twoPatterns', value: {} })) {
      const t = table.kind.value as { header: string[]; rows: { cells: { kind: { case: string; value: unknown } }[] }[] };
      const [a, b] = t.header.slice(1).map((h) => Number(h.replace('Add ', '')));
      t.rows.forEach((r, step) => {
        const cell = (i: number) => {
          const k = r.cells[i].kind;
          return Number(k.case === 'text' ? k.value : (k.value as Field).answer!.text);
        };
        expect(cell(1)).toBe(step * a);
        expect(cell(2)).toBe(step * b);
      });
      expect(Number(ans(ratio))).toBe(b / a);
    }
  });

  it('compares the values of a digit in two places', () => {
    for (const [chart, , first, second, compared] of items({ case: 'placeValueTenTimes', value: {} })) {
      expect(chart.kind.case).toBe('decimalChart');
      const r = num(ans(first)) / num(ans(second));
      const text = atomsOf(compared).map((a) => a.kind.value).join(' ');
      expect(num(ans(compared))).toBeCloseTo(text.includes('of the first') ? 1 / r : r, 9);
    }
  });

  it('multiplies and divides by powers of ten', () => {
    for (const [n] of items({ case: 'powersOfTen', value: {} })) {
      expect(arith(String(atomsOf(n)[0].kind.value).replace(/=$/, ''))).toBe(num(ans(n)));
    }
    for (const [n] of items({ case: 'powersOfTen', value: { decimals: true } })) {
      expect(arith(String(atomsOf(n)[0].kind.value).replace(/=$/, ''))).toBeCloseTo(num(ans(n)), 9);
    }
    for (const [t, chart] of items({ case: 'powersOfTen', value: { decimals: true, chart: true } })) {
      const rows = (chart.kind.value as { rows: { number: string; field?: Field }[] }).rows;
      expect(String(arith(t.kind.value as string))).toBeDefined();
      expect(arith(t.kind.value as string)).toBeCloseTo(num(rows[1].field!.answer!.text), 9);
      expect(num(rows[0].number)).toBe(num((t.kind.value as string).split(' ')[0]));
    }
  });

  it('reads decimals in expanded form and in a chart', () => {
    for (const [n] of items({ case: 'decimalForms', value: { mode: 2 } })) {
      const atoms = atomsOf(n);
      let sum = 0;
      for (let i = 0; i < atoms.length - 2; i += 4) {
        sum += value(atoms[i]) * value(atoms[i + 2]);
      }
      expect(sum).toBeCloseTo(num(ans(n)), 9);
    }
    for (const [chart, number, digit] of items({ case: 'decimalForms', value: { mode: 3 } })) {
      const shown = (chart.kind.value as { rows: { number: string }[] }).rows[0].number;
      expect(ans(number)).toBe(shown);
      expect(num(ans(digit))).toBeGreaterThan(0);
    }
    for (const [n] of items({ case: 'decimalForms', value: { mode: 1 } })) {
      expect(ans(n)).toMatch(/^\d+\.\d{2,3}$/);
    }
  });

  it('compares decimals to thousandths', () => {
    for (const [n] of items({ case: 'decimalForms', value: { mode: 4 } })) {
      const [a, c, b] = atomsOf(n);
      const x = Number(a.kind.value);
      const y = Number(b.kind.value);
      expect((c.kind.value as Field).answer!.text).toBe(x > y ? '>' : x < y ? '<' : '=');
    }
  });

  it('rounds decimals', () => {
    for (const numberLine of [false, true]) {
      for (const ns of items({ case: 'roundDecimal', value: { numberLine } })) {
        const t = ns[0].kind.value as string;
        const x = Number(t.match(/Round ([\d.]+)/)![1]);
        const p = ['whole number', 'tenth', 'hundredth'].findIndex((w) => t.endsWith(w + '.'));
        const want = Math.round(x * 10 ** p + 1e-9) / 10 ** p;
        expect(Number(ans(ns[ns.length - 1]))).toBeCloseTo(want, 9);
      }
    }
  });

  it('multiplies multi-digit numbers with a row per digit', () => {
    for (const [n] of items({ case: 'multiDigitMultiply', value: { topDigits: 3, bottomDigits: 2 } })) {
      const c = n.kind.value as { operands: bigint[]; partials: { field: Field }[]; answer: Field };
      const [x, y] = c.operands.map(Number);
      const rows = c.partials.map((p) => Number(p.field.answer!.text));
      expect(rows.reduce((s, r) => s + r, 0)).toBe(x * y);
      expect(Number(c.answer.answer!.text)).toBe(x * y);
      String(y)
        .split('')
        .reverse()
        .forEach((d, i) => expect(rows[i]).toBe(x * Number(d) * 10 ** i));
    }
  });

  it('divides by two-digit numbers', () => {
    for (const [n] of items({ case: 'divideByTwoDigits', value: { dividendDigits: 4, remainders: true } })) {
      const l = n.kind.value as { dividend: bigint; divisor: number; quotient: Field; remainder: Field };
      expect(l.divisor).toBeGreaterThanOrEqual(10);
      const q = Number(l.quotient.answer!.text);
      const r = Number(l.remainder.answer!.text);
      expect(q * l.divisor + r).toBe(Number(l.dividend));
      expect(r).toBeLessThan(l.divisor);
    }
  });

  it('lists multiples of the divisor and leaves a full row for each step', () => {
    for (const [r] of items({ case: 'divideByTwoDigits', value: { dividendDigits: 3, multiples: true } })) {
      const [division, list] = (r.kind.value as { children: Node[] }).children;
      const l = division.kind.value as { divisor: number; quotient: Field; workRows: number };
      expect(l.workRows * 0.75).toBeGreaterThanOrEqual(2 * l.quotient.answer!.text.length + 1);
      const rows = (list.kind.value as { children: Node[] }).children;
      expect(rows.slice(1).map((n) => Number(ans(n)))).toEqual([2, 5, 10].map((m) => m * l.divisor));
    }
  });

  it('adds and subtracts decimals written in a line, with different places', () => {
    for (const op of [1, 2]) {
      for (const [n] of items({ case: 'decimalArithmetic', value: { op, inALine: true } })) {
        const [label] = String(atomsOf(n)[0].kind.value).split(' = ');
        const [x, y] = label.split(op === 1 ? ' + ' : ' − ');
        expect((x.split('.')[1] ?? '').length).not.toBe((y.split('.')[1] ?? '').length);
        expect(Number(ans(n))).toBeCloseTo(op === 1 ? Number(x) + Number(y) : Number(x) - Number(y), 9);
      }
    }
  });

  it('tiles a fraction rectangle in a unit square', () => {
    for (const [r] of items({ case: 'fractionMultiply', value: { mode: 3, tiles: true } })) {
      const [grid, list] = (r.kind.value as { children: Node[] }).children;
      const g = grid.kind.value as { cols: number; rows: number; shadedCols: number; shadedRows: number };
      const [tile, count, area] = (list.kind.value as { children: Node[] }).children.map((n) => ans(n));
      expect(tile).toBe(`1/${g.cols * g.rows}`);
      expect(Number(count)).toBe(g.shadedCols * g.shadedRows);
      expect(parseAnswer(area)).toBeCloseTo((g.shadedCols / g.cols) * (g.shadedRows / g.rows), 9);
    }
  });

  it('adds, subtracts, multiplies and divides decimals', () => {
    for (const op of [1, 2]) {
      for (const [n] of items({ case: 'decimalArithmetic', value: { op } })) {
        const c = n.kind.value as { operands: bigint[]; decimalPlaces: number; answer: Field };
        const [x, y] = c.operands.map((v) => Number(v) / 10 ** c.decimalPlaces);
        expect(Number(c.answer.answer!.text)).toBeCloseTo(op === 1 ? x + y : x - y, 9);
      }
    }
    for (const op of [3, 4]) {
      for (const [n] of items({ case: 'decimalArithmetic', value: { op } })) {
        expect(arith(String(atomsOf(n)[0].kind.value).replace(/=$/, ''))).toBeCloseTo(Number(ans(n)), 9);
      }
    }
  });

  it('adds and subtracts fractions with unlike denominators', () => {
    for (const subtract of [false, true]) {
      for (const mixed of [false, true]) {
        for (const [n] of items({ case: 'unlikeFractions', value: { subtract, mixed } })) {
          const atoms = atomsOf(n);
          const op = atoms.findIndex((a) => a.kind.value === '+' || a.kind.value === '−');
          const side = (as: typeof atoms) => as.reduce((s, a) => s + value(a), 0);
          const x = side(atoms.slice(0, op));
          const y = side(atoms.slice(op + 1, atoms.length - 2));
          expect(parseAnswer(ans(n))).toBeCloseTo(subtract ? x - y : x + y, 9);
        }
      }
    }
    for (const [grids, step, total] of items({ case: 'unlikeFractions', value: { model: true, denominators: [2, 3, 4, 5] } })) {
      const [g1, g2] = (grids.kind.value as { children: Node[] }).children.map((c) => c.kind.value as { cols: number; rows: number; shadedCols: number; shadedRows: number });
      expect(Number(ans(step, 0))).toBe(g1.shadedCols * g1.rows);
      expect(Number(ans(step, 1))).toBe(g2.shadedRows * g2.cols);
      expect(parseAnswer(ans(total))).toBeCloseTo((Number(ans(step, 0)) + Number(ans(step, 1))) / (g1.cols * g1.rows), 9);
    }
  });

  it('reads fractions as division', () => {
    for (const ns of items({ case: 'fractionAsDivision', value: {} })) {
      const last = ns[ns.length - 1];
      const atoms = atomsOf(last);
      if (atoms[0].kind.case === 'fraction') {
        expect(Number(ans(last, 0)) / Number(ans(last, 1))).toBeCloseTo(value(atoms[0]), 9);
      } else if (atoms[1]?.kind.value === '÷') {
        expect(parseAnswer(ans(last))).toBeCloseTo(value(atoms[0]) / value(atoms[2]), 9);
      } else {
        const [b, a] = (ns[0].kind.value as string).match(/\d+/g)!.map(Number);
        expect(parseAnswer(ans(last))).toBeCloseTo(a / b, 9);
      }
    }
  });

  it('multiplies fractions', () => {
    for (const mode of [1, 2]) {
      for (const [n] of items({ case: 'fractionMultiply', value: { mode } })) {
        const [a, , b] = atomsOf(n);
        expect(parseAnswer(ans(n))).toBeCloseTo(value(a) * value(b), 9);
      }
    }
    for (const [poly, area] of items({ case: 'fractionMultiply', value: { mode: 3 } })) {
      const sides = (poly.kind.value as { sides: { text: string }[] }).sides.slice(0, 2).map((s) => parseAnswer(s.text.split(' ')[0]));
      expect(parseAnswer(ans(area))).toBeCloseTo(sides[0] * sides[1], 9);
    }
    for (const [grid, n] of items({ case: 'fractionMultiply', value: { mode: 2, model: true } })) {
      const g = grid.kind.value as { cols: number; rows: number; shadedCols: number; shadedRows: number };
      expect(parseAnswer(ans(n))).toBeCloseTo((g.shadedCols * g.shadedRows) / (g.cols * g.rows), 9);
    }
  });

  it('compares products by scaling', () => {
    for (const [n] of items({ case: 'scalingCompare', value: {} })) {
      const atoms = atomsOf(n);
      const c = atoms.findIndex((a) => a.kind.case === 'compare');
      const product = value(atoms[0]) * value(atoms[2]);
      const other = value(atoms[c + 1]);
      expect(ans(n)).toBe(product > other + 1e-9 ? '>' : product < other - 1e-9 ? '<' : '=');
    }
  });

  it('divides with unit fractions', () => {
    for (const wholeByUnit of [false, true]) {
      for (const ns of items({ case: 'unitFractionDivide', value: { wholeByUnit } }, 20)) {
        const n = ns[ns.length - 1];
        const [a, , b] = atomsOf(n);
        expect(parseAnswer(ans(n))).toBeCloseTo(value(a) / value(b), 9);
      }
    }
  });

  it('converts units', () => {
    const per: Record<string, number> = { m: 100, km: 1000, cm: 10, kg: 1000, L: 1000, ft: 12, yd: 3, gal: 4, lb: 16, hr: 60 };
    const smallOf: Record<string, string> = { m: 'cm', km: 'm', cm: 'mm', kg: 'g', L: 'mL', ft: 'in', yd: 'ft', gal: 'qt', lb: 'oz', hr: 'min' };
    for (const [n] of items({ case: 'convertMeasure', value: {} })) {
      const atoms = atomsOf(n);
      const [x, unit] = String(atoms[0].kind.value).replace(' =', '').split(' ');
      const big = Object.keys(per).find((b) => b === unit && smallOf[b] === String(atoms[2].kind.value));
      if (big) {
        expect(num(ans(n))).toBeCloseTo(num(x) * per[big], 9);
        continue;
      }
      const bigUnit = String(atoms[2].kind.value);
      if (atoms.length === 3) {
        expect(num(ans(n))).toBeCloseTo(num(x) / per[bigUnit], 9);
      } else {
        expect(Number(ans(n, 0)) * per[bigUnit] + Number(ans(n, 1))).toBe(num(x));
      }
    }
  });

  it('finds the total and equal share from a line plot', () => {
    for (const [plot, count, total, , share] of items({ case: 'linePlotShare', value: {} }, 20)) {
      const p = plot.kind.value as { counts: number[]; partsPerUnit: number };
      const n = p.counts.reduce((s, c) => s + c, 0);
      const sum = p.counts.reduce((s, c, t) => s + (c * t) / p.partsPerUnit, 0);
      expect(Number(ans(count))).toBeGreaterThan(0);
      expect(parseAnswer(ans(total))).toBeCloseTo(sum, 9);
      expect(parseAnswer(ans(share))).toBeCloseTo(sum / n, 9);
    }
  });

  it('finds volumes', () => {
    type Box = { length: number; width: number; height: number };
    const vol = (b: Box) => b.length * b.width * b.height;
    for (const mode of [1, 2, 3, 4]) {
      for (const ns of items({ case: 'prismVolume', value: { mode } }, 20)) {
        const boxes = (ns[0].kind.value as { boxes: Box[] }).boxes;
        const last = ns[ns.length - 1];
        expect(Number(ans(last))).toBe(boxes.reduce((s, b) => s + vol(b), 0));
        if (mode === 2) {
          expect(Number(ans(ns[1]))).toBe(boxes[0].length * boxes[0].width);
          expect(Number(ans(ns[2]))).toBe(boxes[0].height);
        }
      }
    }
  });

  it('reads, plots and graphs points', () => {
    for (const [grid, ...rest] of items({ case: 'coordinatePoints', value: { mode: 1 } }, 10)) {
      const pts = (grid.kind.value as { points: { x: number; y: number }[] }).points;
      rest.forEach((r, i) => expect(ans(r)).toBe(`(${pts[i].x}, ${pts[i].y})`));
    }
    for (const [t, grid] of items({ case: 'coordinatePoints', value: { mode: 2 } }, 10)) {
      const plot = (grid.kind.value as { plotField: Field }).plotField.answer!.text;
      expect((t.kind.value as string).replace('Plot and label ', '').replace(/\.$/, '')).toBe(plot.replace(/; /g, ', '));
    }
    for (const [grid, at3, later] of items({ case: 'coordinatePoints', value: { mode: 3 } }, 10)) {
      const pts = (grid.kind.value as { points: { x: number; y: number }[] }).points;
      const rate = pts[1].y / pts[1].x;
      pts.forEach((p) => expect(p.y).toBe(rate * p.x));
      expect(Number(ans(at3))).toBe(3 * rate);
      const x = Number(String(atomsOf(later)[0].kind.value).match(/after (\d+)/)![1]);
      expect(Number(ans(later))).toBe(x * rate);
    }
  });

  it('names quadrilaterals by their sides and angles', () => {
    for (const [poly, choice] of items({ case: 'shapeHierarchy', value: { mode: 1 } }, 10)) {
      const p = poly.kind.value as { points: { x: number; y: number }[]; sides: { text: string }[] };
      const v = p.points.map((q, i) => {
        const r = p.points[(i + 1) % 4];
        return [r.x - q.x, r.y - q.y];
      });
      const lens = v.map(([x, y]) => Math.hypot(x, y));
      lens.forEach((l, i) => expect(l).toBeCloseTo(Number(p.sides[i].text.split(' ')[0]), 9));
      const parallel = (a: number[], b: number[]) => Math.abs(a[0] * b[1] - a[1] * b[0]) < 1e-9;
      const pairs = Number(parallel(v[0], v[2])) + Number(parallel(v[1], v[3]));
      const right = Math.abs(v[0][0] * v[1][0] + v[0][1] * v[1][1]) < 1e-9;
      const equal = lens.every((l) => Math.abs(l - lens[0]) < 1e-9);
      const want = pairs < 2 ? 'trapezoid' : right && equal ? 'square' : right ? 'rectangle' : equal ? 'rhombus' : 'parallelogram';
      expect(ans(choice)).toBe(want);
    }
  });
});
