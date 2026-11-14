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


// Grades 6 to 8: each kind's answers, recomputed from what the item prints.
describe('grade 6 to 8 item kinds', () => {
  type Init = { case: string; value: Record<string, unknown> };
  const items = (kind: Init, n = 40) => {
    const rng = new Rng(11);
    const used = new Set<string>();
    const fresh = (k: string) => !used.has(k) && !!used.add(k);
    const ik = create(ItemKindSchema, { kind: kind as ItemKind['kind'] });
    return Array.from({ length: n }, (_, i) => generate(ik, { rng, fields: new Fields(`q${i}`), fresh }));
  };
  const all = (ns: Node[]): Node[] =>
    ns.flatMap((n) => (n.kind.case === 'row' || n.kind.case === 'stack' ? all(n.kind.value.children) : [n]));
  const answers = (ns: Node[]) => fieldsOf(ns).map((f) => f.answer!.text);
  const textOf = (ns: Node[]) =>
    all(ns)
      .map((n) =>
        n.kind.case === 'text'
          ? n.kind.value
          : n.kind.case === 'math'
            ? n.kind.value.atoms.map((a) => (a.kind.case === 'text' ? a.kind.value : a.kind.case === 'fraction' ? `${a.kind.value.num}/${a.kind.value.den}` : '□')).join(' ')
            : '',
      )
      .join(' ');
  // value reads a printed number: a minus sign, a fraction, or a mixed number.
  const value = (s: string) => {
    const t = s.replace('−', '-').replace(/[$,%°]/g, '').trim();
    const neg = t.startsWith('-') ? -1 : 1;
    return neg * parseAnswer(t.replace('-', ''));
  };
  // algebra evaluates an expression such as "3(x − 2) + x²" at the given
  // values of its letters.
  const algebra = (expr: string, vars: Record<string, number>) => {
    let js = expr
      .replace(/−/g, '-')
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/²/g, '**2')
      .replace(/³/g, '**3');
    for (const [k, v] of Object.entries(vars)) {
      js = js.replace(new RegExp(`(\\d|\\))${k}`, 'g'), `$1*(${v})`).replace(new RegExp(k, 'g'), `(${v})`);
    }
    js = js.replace(/(\d)\(/g, '$1*(').replace(/\)\(/g, ')*(');
    return Function(`return (${js});`)() as number;
  };
  const nums = (s: string) => (s.replace(/−/g, '-').match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

  it('ratio tables and double number lines keep one ratio', () => {
    for (const dnl of [false, true]) {
      for (const ns of items({ case: 'ratioTable', value: { doubleNumberLine: dnl } }, 10)) {
        const pairs: number[][] = [];
        const k = ns[0].kind;
        if (k.case === 'dataTable') {
          k.value.rows.forEach((r) => pairs.push(r.cells.map((c) => Number(c.kind.case === 'text' ? c.kind.value : c.kind.value!.answer!.text))));
        } else if (k.case === 'doubleNumberLine') {
          k.value.ticks.forEach((t) => pairs.push([Number(t.top || t.topField!.answer!.text), Number(t.bottom || t.bottomField!.answer!.text)]));
        }
        const [a, b] = pairs.find(([x]) => x > 0)!;
        for (const [x, y] of pairs) {
          expect(x * b).toBe(y * a);
        }
      }
    }
  });

  it('ratio language writes the amounts asked for', () => {
    for (const ns of items({ case: 'ratioLanguage', value: {} })) {
      const [a, b] = nums(textOf(ns));
      const [x, y] = answers(ns).map(Number);
      expect([`${a}:${b}`, `${b}:${a}`, `${a}:${a + b}`]).toContain(`${x}:${y}`);
    }
  });

  it('unit rates divide the total by the count', () => {
    for (const ns of items({ case: 'unitRate', value: {} })) {
      const t = textOf(ns);
      const [n, total] = t.includes('cost $') ? [nums(t)[0], nums(t)[1]] : [nums(t)[1], nums(t)[0]];
      expect(value(answers(ns)[0])).toBeCloseTo(total / n, 9);
    }
    for (const ns of items({ case: 'unitRate', value: { fractions: true } })) {
      const [amount, time] = (textOf(ns).match(/(\d+ )?\d+\/\d+|\d+(?= mile| of)/g) ?? []).map(value);
      expect(value(answers(ns)[0])).toBeCloseTo(amount / time, 9);
    }
  });

  it('percents', () => {
    for (const ns of items({ case: 'percentOf', value: {} })) {
      const t = textOf(ns);
      const [x, y] = nums(t);
      const a = value(answers(ns)[0]);
      if (/% of \d+ =/.test(t)) {
        expect(a).toBeCloseTo((x * y) / 100, 9);
      } else if (t.includes('% of □')) {
        expect((y * a) / 100).toBeCloseTo(x, 9);
      } else {
        expect((a * y) / 100).toBeCloseTo(x, 9);
      }
    }
  });

  it('converts units with the rate given', () => {
    for (const ns of items({ case: 'rateConversion', value: {} })) {
      const [, per, n] = nums(textOf(ns).replace(/,/g, ''));
      const a = value(answers(ns)[0]);
      expect(a === n * per || a * per === n).toBeTrue();
    }
  });

  it('divides fractions', () => {
    for (const ns of items({ case: 'divideFractions', value: { mixed: true } })) {
      const [lhs] = textOf(ns).split('=');
      const [p, q] = lhs.split('÷').map((s) => s.trim().split(' ').reduce((acc, x) => acc + value(x), 0));
      expect(value(answers(ns)[0])).toBeCloseTo(p / q, 9);
    }
  });

  it('long division with two-digit divisors', () => {
    for (const [n] of items({ case: 'multiDigitDivision', value: { remainders: true } })) {
      const l = n.kind.value as { dividend: bigint; divisor: number; quotient: Field; remainder: Field };
      expect(Number(l.quotient.answer!.text) * l.divisor + Number(l.remainder.answer!.text)).toBe(Number(l.dividend));
      expect(l.divisor).toBeGreaterThan(9);
    }
  });

  it('decimal arithmetic', () => {
    for (const ns of items({ case: 'decimalOperations', value: {} })) {
      const [lhs] = textOf(ns).split('=');
      expect(value(answers(ns)[0])).toBeCloseTo(evaluate(lhs.trim())!, 9);
    }
  });

  it('greatest common factors and least common multiples', () => {
    const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
    for (const ns of items({ case: 'gcfLcm', value: {} })) {
      const t = textOf(ns);
      const [a, b] = nums(t);
      const ans = answers(ns).map(Number);
      if (t.startsWith('LCM')) {
        expect(ans[0]).toBe((a * b) / g(a, b));
      } else {
        expect(ans[0]).toBe(g(a, b));
        if (ans.length === 3) {
          expect(ans[0] * (ans[1] + ans[2])).toBe(a + b);
        }
      }
    }
  });

  it('two-way table totals and fractions', () => {
    for (const ns of items({ case: 'twoWayTable', value: {} }, 10)) {
      const t = ns[0].kind.value as { rows: { cells: { kind: { case: string; value: unknown } }[] }[] };
      const cell = (r: number, c: number) => {
        const k = t.rows[r].cells[c].kind;
        return Number(k.case === 'text' ? k.value : (k.value as Field).answer!.text);
      };
      expect(cell(0, 3)).toBe(cell(0, 1) + cell(0, 2));
      expect(cell(2, 1)).toBe(cell(0, 1) + cell(1, 1));
      expect(cell(2, 3)).toBe(cell(0, 3) + cell(1, 3));
      const all = answers(ns);
      const [f1, f2] = all.slice(-3, -1).map(value);
      expect(f1).toBeCloseTo(cell(0, 1) / cell(2, 1), 9);
      expect(f2).toBeCloseTo(cell(0, 2) / cell(0, 3), 9);
      const [p1, p2] = [cell(0, 1) / cell(2, 1), cell(0, 2) / cell(2, 2)];
      expect(Math.abs(p1 - p2)).toBeGreaterThanOrEqual(0.15);
      expect(all[all.length - 1]).toBe(p1 > p2 ? 'yes' : 'no');
    }
  });

  it('integers: number line, opposites, absolute value and comparing', () => {
    for (const ns of items({ case: 'integers', value: { mode: 1 } }, 10)) {
      const nl = ns[0].kind.value as { start: number; arrowTick: number };
      expect(value(answers(ns)[0])).toBe(nl.start + nl.arrowTick);
    }
    for (const ns of items({ case: 'integers', value: { mode: 2 } }, 10)) {
      expect(value(answers(ns)[0])).toBe(-nums(textOf(ns))[0]);
    }
    for (const ns of items({ case: 'integers', value: { mode: 3 } })) {
      const [a, b] = nums(textOf(ns));
      expect(answers(ns)[0]).toBe(a > b ? '>' : '<');
    }
    for (const ns of items({ case: 'integers', value: { mode: 5 } }, 10)) {
      const xs = nums(textOf(ns)).sort((p, q) => p - q);
      expect(answers(ns)[0].split(', ').map(value)).toEqual(xs);
    }
  });

  it('coordinate reflections and transformations', () => {
    for (const ns of items({ case: 'coordinateGeometry', value: { mode: 2 } }, 10)) {
      const p = (ns[1].kind.value as { points: { x: number; y: number }[] }).points[0];
      const [x, y] = answers(ns).slice(-2).map(value);
      const xAxis = textOf(ns).includes('x-axis');
      expect([x, y]).toEqual(xAxis ? [p.x, -p.y] : [-p.x, p.y]);
    }
    for (const ns of items({ case: 'coordinateGeometry', value: { mode: 5 } }, 12)) {
      const t = textOf(ns);
      const a = (ns[1].kind.value as { points: { x: number; y: number }[] }).points[0];
      const [x, y] = answers(ns).slice(-2).map(value);
      if (t.includes('90°')) {
        expect([x, y]).toEqual([-a.y, a.x].map((v) => v || 0));
      } else if (t.includes('180°')) {
        expect([x, y]).toEqual([-a.x, -a.y].map((v) => v || 0));
      } else if (t.includes('x-axis')) {
        expect([x, y]).toEqual([a.x, -a.y].map((v) => v || 0));
      } else if (t.includes('scale factor')) {
        expect([x, y]).toEqual([2 * a.x, 2 * a.y].map((v) => v || 0));
      }
    }
  });

  it('powers and roots', () => {
    for (const ns of items({ case: 'exponents', value: { mode: 1 } }, 20)) {
      const [lhs] = textOf(ns).split('=');
      expect(value(answers(ns)[0])).toBe(algebra(lhs, {}));
    }
    for (const ns of items({ case: 'exponents', value: { mode: 4 } }, 20)) {
      const t = textOf(ns);
      const n = Number(answers(ns)[0]);
      const p = nums(t.replace(/[²³]/g, ''))[0];
      expect(t.includes('∛') || t.includes('x³') ? n ** 3 : n * n).toBe(p);
    }
    for (const ns of items({ case: 'exponents', value: { mode: 5 } }, 20)) {
      const p = nums(textOf(ns))[0];
      const [lo, hi] = answers(ns).map(Number);
      expect(lo * lo < p && p < hi * hi && hi === lo + 1).toBeTrue();
    }
  });

  it('evaluates expressions', () => {
    for (const neg of [false, true]) {
      for (const ns of items({ case: 'evaluateExpression', value: { negatives: neg } })) {
        const m = textOf(ns).match(/Find (.*) when x = (−?\d+)(?: and y = (−?\d+))?/)!;
        expect(value(answers(ns)[0])).toBe(algebra(m[1], { x: value(m[2]), y: m[3] ? value(m[3]) : 0 }));
      }
    }
  });

  it('equivalent expressions agree for several values of x', () => {
    for (const mode of [1, 2, 3]) {
      for (const ns of items({ case: 'equivalentExpressions', value: { mode, negatives: true } })) {
        const [lhs] = textOf(ns).split('=');
        for (const x of [2, 5, -3]) {
          expect(algebra(answers(ns)[0], { x })).toBe(algebra(lhs, { x }));
        }
      }
    }
    for (const ns of items({ case: 'equivalentExpressions', value: { mode: 4 } })) {
      const [l, r] = textOf(ns).split(' and ');
      const same = [2, 5, 7].every((x) => algebra(l, { x }) === algebra(r, { x }));
      expect(answers(ns)[0]).toBe(same ? 'equivalent' : 'not equivalent');
    }
  });

  it('solutions make equations true and inequalities hold', () => {
    for (const form of [1, 2, 3]) {
      for (const inequality of [false, true]) {
        if (form === 3 && inequality) {
          continue;
        }
        for (const ns of items({ case: 'solveEquation', value: { form, inequality, negatives: true } })) {
          const eq = textOf([ns[0]]);
          const v = eq.match(/[xnym]/)![0];
          const rel = eq.match(/[=<>≤≥]/)![0];
          const [l, r] = eq.split(rel);
          const a = answers(ns)[0];
          const x = value(a.split(' ').pop()!);
          expect(algebra(l, { [v]: x })).toBeCloseTo(algebra(r, { [v]: x }), 9);
          if (inequality) {
            const sign = a.split(' ')[1];
            const test = sign === '<' || sign === '≤' ? x - 1 : x + 1;
            const L = algebra(l, { [v]: test });
            const R = algebra(r, { [v]: test });
            expect({ '<': L < R, '>': L > R, '≤': L <= R, '≥': L >= R }[rel]).withContext(`${eq}: ${a}`).toBeTrue();
          }
        }
      }
    }
  });

  it('rules fit their tables', () => {
    for (const ns of items({ case: 'ruleTable', value: { mode: 2 } })) {
      const t = ns[0].kind.value as { rows: { cells: { kind: { value: unknown } }[] }[] };
      for (const r of t.rows) {
        const [x, y] = r.cells.map((c) => value(c.kind.value as string));
        expect(algebra(answers(ns)[0], { x })).toBe(y);
      }
    }
    for (const ns of items({ case: 'ruleTable', value: { mode: 3 } })) {
      const t = ns[0].kind.value as { rows: { cells: { kind: { value: unknown } }[] }[] };
      const ratios = t.rows.map((r) => value(r.cells[1].kind.value as string) / value(r.cells[0].kind.value as string));
      expect(answers(ns)[0]).toBe(ratios.every((q) => q === ratios[0]) ? 'proportional' : 'not proportional');
    }
  });

  it('areas of shapes with a marked height', () => {
    for (const ns of items({ case: 'shapeArea', value: {} })) {
      const s = ns[0].kind.value as { points: { x: number; y: number }[] };
      const p = s.points;
      const shoelace = Math.abs(p.reduce((acc, q, i) => acc + q.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * q.y, 0)) / 2;
      expect(value(answers(ns)[0])).toBeCloseTo(shoelace, 9);
    }
  });

  it('volume and surface area of boxes', () => {
    for (const ns of items({ case: 'prismMeasure', value: { surfaceArea: true } })) {
      const n = ns[0].kind.value as { length: number; width: number; height: number };
      expect(Number(answers(ns)[0])).toBe(2 * (n.length * n.width + n.length * n.height + n.width * n.height));
    }
    for (const ns of items({ case: 'prismMeasure', value: { fractions: true } })) {
      const b = ns[0].kind.value as { lengthLabel: string; widthLabel: string; heightLabel: string };
      const v = [b.lengthLabel, b.widthLabel, b.heightLabel].map((s) => value(s.replace(' in', ''))).reduce((x, y) => x * y, 1);
      const [cubes, vol] = answers(ns).map(value);
      expect(vol).toBeCloseTo(v, 9);
      expect(cubes).toBe(v * 8);
    }
  });

  it('data sets: mean, median, quartiles and box plots', () => {
    for (const ns of items({ case: 'dataSetStats', value: { mode: 1 } }, 15)) {
      const xs = nums(textOf([ns[0]]).split(':')[1]).sort((p, q) => p - q);
      const [mean, median, , range] = answers(ns).map(value);
      expect(mean).toBe(xs.reduce((a, b) => a + b, 0) / xs.length);
      const m = Math.floor(xs.length / 2);
      expect(median).toBe(xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2);
      expect(range).toBe(xs[xs.length - 1] - xs[0]);
    }
    for (const ns of items({ case: 'dataSetStats', value: { mode: 6 } }, 10)) {
      const b = ns[0].kind.value as { min: number; q1: number; median: number; q3: number; max: number };
      expect(answers(ns).map(Number)).toEqual([b.median, b.q3 - b.q1, b.max - b.min]);
    }
  });

  it('signed arithmetic', () => {
    for (const numbers of [1, 2, 3]) {
      for (const ns of items({ case: 'signedArithmetic', value: { numbers } })) {
        const lhs = textOf(ns).split('=')[0].replace(/\( −/g, '(−').replace(/− (\d+\/\d+)/g, '−$1');
        const js = lhs.replace(/(\d+)\/(\d+)/g, '($1/$2)');
        expect(value(answers(ns)[0])).withContext(lhs).toBeCloseTo(algebra(js, {}), 9);
      }
    }
  });

  it('fractions as decimals', () => {
    for (const ns of items({ case: 'fractionToDecimal', value: { repeating: true } })) {
      const f = (ns[0].kind.value as { atoms: { kind: { value: { num: number; den: number } } }[] }).atoms[0].kind.value;
      expect(value(answers(ns)[0])).toBeCloseTo(f.num / f.den, 3);
    }
  });

  it('circles and round solids use 3.14', () => {
    for (const ns of items({ case: 'roundMeasure', value: { asks: [1, 2, 3, 4, 5] } })) {
      const t = textOf([ns[0]]);
      const [a, h] = nums(t);
      const r = t.includes('diameter') ? a / 2 : a;
      const want = t.includes('ball') ? (4 / 3) * 3.14 * r ** 3 : t.includes('cone') ? (3.14 * r * r * h) / 3 : t.includes('cylinder') ? 3.14 * r * r * h : textOf(ns).includes('Circumference') ? 2 * 3.14 * r : 3.14 * r * r;
      expect(value(answers(ns)[0])).toBeCloseTo(want, 6);
    }
  });

  it('probability from counts', () => {
    for (const ns of items({ case: 'probability', value: { mode: 1 } })) {
      const t = textOf(ns);
      const counts = nums(t.split('.')[0]);
      const colors = ['red', 'blue', 'green'];
      const c = colors.findIndex((x) => t.includes(`P(${x}`) || t.includes(`P(not ${x}`));
      const total = counts.reduce((a, b) => a + b, 0);
      const p = t.includes('P(not') ? (total - counts[c]) / total : counts[c] / total;
      expect(value(answers(ns)[0])).toBeCloseTo(p, 9);
    }
  });

  it('right triangles follow a² + b² = c²', () => {
    for (const mode of [1, 2]) {
      for (const ns of items({ case: 'pythagorean', value: { mode } }, 20)) {
        const p = ns[0].kind.value as { points: { x: number; y: number }[]; sides: { text: string; field?: Field }[] };
        const sides = p.sides.map((s) => value(s.field ? s.field.answer!.text : s.text.replace(' cm', '')));
        const [a, b, c] = [...sides].sort((x, y) => x - y);
        expect(a * a + b * b).toBe(c * c);
        // The drawing has the same sides.
        const len = (i: number) => Math.hypot(p.points[(i + 1) % 3].x - p.points[i].x, p.points[(i + 1) % 3].y - p.points[i].y);
        sides.forEach((s, i) => expect(len(i)).toBeCloseTo(s, 9));
      }
    }
  });

  it('scientific notation', () => {
    const sci = (s: string) => {
      const m = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (e) => '^' + [...e].map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c) < 0 ? '-' : '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join('')).match(/([\d.]+) × 10\^(-?\d+)/)!;
      return Number(m[1]) * 10 ** Number(m[2]);
    };
    for (const ns of items({ case: 'scientificNotation', value: { mode: 1 } }, 20)) {
      const std = Number(textOf(ns).split('=')[0].replace(/,/g, ''));
      expect(sci(answers(ns)[0]) / std).toBeCloseTo(1, 9);
    }
    for (const ns of items({ case: 'scientificNotation', value: { mode: 3 } }, 20)) {
      const t = textOf(ns).split('=')[0];
      const [a, b] = t.split(') × (').map(sci);
      expect(sci(answers(ns)[0]) / (a * b)).toBeCloseTo(1, 9);
    }
  });

  it('slopes and systems', () => {
    for (const ns of items({ case: 'linearRelation', value: { mode: 1 } })) {
      const [x1, y1, x2, y2] = nums(textOf(ns));
      expect(value(answers(ns)[0])).toBeCloseTo((y2 - y1) / (x2 - x1), 9);
    }
    for (const ns of items({ case: 'linearRelation', value: { mode: 3 } })) {
      const [x, y] = answers(ns).map(value);
      for (const n of ns.slice(0, 2)) {
        const [l, r] = textOf([n]).split('=');
        expect(algebra(l, { x, y })).toBe(algebra(r, { x, y }));
      }
    }
    for (const ns of items({ case: 'linearRelation', value: { mode: 6 } }, 20)) {
      const p = (ns[0].kind.value as { points: { x: number; y: number }[] }).points;
      const [run, rise, slope] = answers(ns).map(value);
      expect([run, rise]).toEqual([p[1].x - p[0].x, p[1].y - p[0].y]);
      expect(slope).toBeCloseTo(rise / run, 9);
    }
  });

  it('angle facts', () => {
    for (const ns of items({ case: 'angleFacts', value: { mode: 1 } }, 10)) {
      const a = ns[0].kind.value as { rays: number[]; arcs: { text: string; field?: Field }[] };
      const [beside, across] = a.arcs.slice(1).map((x) => value(x.field!.answer!.text));
      expect(beside).toBe(a.rays[1] - a.rays[0]);
      expect(across).toBe(a.rays[0]);
    }
    for (const ns of items({ case: 'angleFacts', value: { mode: 5 } }, 10)) {
      const t = ns[0].kind.value as { degrees: number; labels: { position: number; field?: Field }[] };
      for (const l of t.labels.filter((x) => x.field)) {
        expect(value(l.field!.answer!.text)).toBe(l.position % 2 === 0 ? t.degrees : 180 - t.degrees);
      }
    }
    type Tri = { left: number; right: number; labels: { text: string; field?: Field }[]; exterior?: { field?: Field } };
    for (const ns of items({ case: 'angleFacts', value: { mode: 2 } }, 10)) {
      const t = ns[0].kind.value as Tri;
      const angles = [t.left, t.right, 180 - t.left - t.right];
      t.labels.forEach((l, i) => {
        expect(angles[i]).toBeGreaterThanOrEqual(35);
        expect(value(l.field ? l.field.answer!.text : l.text)).toBe(angles[i]);
      });
      expect(t.labels.filter((l) => l.field).length).toBe(1);
    }
    for (const ns of items({ case: 'angleFacts', value: { mode: 3 } }, 10)) {
      const t = ns[0].kind.value as Tri;
      expect(value(t.exterior!.field!.answer!.text)).toBe(180 - t.right);
    }
  });
});
