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
  AddInColumnsSchema,
  AddSubtractFact_Op,
  AddSubtractFactSchema,
  ClockNearestSchema,
  CompareNumbersSchema,
  CountObjects_Mode,
  CountObjects_Picture,
  CountObjectsSchema,
  Equation_Model,
  CountSequenceSchema,
  DataChart_Mode,
  DataChartSchema,
  EqualSharesSchema,
  Equation_Mode,
  EquationSchema,
  LengthMeasure_Mode,
  LengthMeasureSchema,
  MentalMath_Mode,
  MentalMathSchema,
  NumberForms_Mode,
  NumberFormsSchema,
  NumberLineJumpsSchema,
  PairsAndArrays_Mode,
  PairsAndArraysSchema,
  PlaceValueBlocks_Mode,
  PlaceValueBlocksSchema,
  ShapeAttributes_Mode,
  ShapeAttributesSchema,
} from '../proto/v1/worksheet_pb.js';
import { Fields, blank, fieldsOf, math, text } from './build.js';
import { checkAuthored, evaluate, parseAnswer } from './check.js';
import { allNodes, compose } from './compose.js';
import { generate } from './kinds.js';
import { COIN } from './draw_k2.js';
import { numberWords } from './kinds_k2.js';
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

describe('kindergarten to grade 2 item kinds', () => {
  const items = (kind: ItemKind['kind'], n = 30) => {
    const rng = new Rng(11);
    const used = new Set<string>();
    const fresh = (k: string) => !used.has(k) && !!used.add(k);
    return Array.from({ length: n }, (_, i) => generate(create(ItemKindSchema, { kind }), { rng, fields: new Fields(`q${i}`), fresh }));
  };
  // flat lists every node, descending into rows and stacks.
  const flat = (ns: readonly Node[]): Node[] =>
    ns.flatMap((n) => (n.kind.case === 'row' || n.kind.case === 'stack' ? flat(n.kind.value.children) : [n]));
  const find = <C extends Node['kind']['case']>(ns: readonly Node[], c: C) =>
    flat(ns)
      .filter((n) => n.kind.case === c)
      .map((n) => n.kind.value as Extract<Node['kind'], { case: C }>['value']);
  const answers = (ns: readonly Node[]) => fieldsOf(ns).map((f) => f.answer!.text);
  // line reads a line of maths with each blank filled in by its answer.
  const line = (n: Node) =>
    n.kind.case === 'math'
      ? n.kind.value.atoms
          .map((a) => (a.kind.case === 'text' ? a.kind.value : a.kind.case === 'blank' ? a.kind.value.answer!.text : '?'))
          .join(' ')
      : '';
  // holds checks that a filled-in line is a true equation. Place-value words
  // become their values: "6 tens" is 6 × 10.
  const holds = (n: Node) => {
    const s = line(n)
      .replace(/\bbecause\b/, '')
      .replace(/\bhundreds?\b/g, '× 100')
      .replace(/\btens?\b/g, '× 10')
      .replace(/\bones\b/g, '× 1');
    const sides = s.split('=').map((x) => evaluate(x.trim()));
    expect(sides.length).withContext(s).toBeGreaterThan(1);
    for (const v of sides) {
      expect(v).withContext(s).toBe(sides[0]);
    }
  };
  const dotCount = (ns: readonly Node[]) => find(ns, 'dotArray').reduce((t, d) => t + d.rows * d.cols, 0);

  it('counts dots, one more, and compares rows', () => {
    for (const ns of items({ case: 'countObjects', value: create(CountObjectsSchema, { count: { min: 1, max: 20 } }) })) {
      expect(answers(ns)).toEqual([String(dotCount(ns))]);
    }
    for (const ns of items({ case: 'countObjects', value: create(CountObjectsSchema, { mode: CountObjects_Mode.ONE_MORE }) })) {
      const n = dotCount(ns);
      expect(answers(ns)).toEqual([String(n), String(n + 1)]);
    }
    for (const ns of items({ case: 'countObjects', value: create(CountObjectsSchema, { mode: CountObjects_Mode.COMPARE_GROUPS }) })) {
      const [a, b] = find(ns, 'dotArray').map((d) => d.rows * d.cols);
      expect(answers(ns)).toEqual([a > b ? 'A' : a < b ? 'B' : 'same']);
    }
  });

  it('counts ten frames, pictures in groups and coins', () => {
    for (const ns of items({ case: 'countObjects', value: create(CountObjectsSchema, { count: { min: 1, max: 20 }, picture: CountObjects_Picture.TEN_FRAME }) })) {
      const [t] = find(ns, 'tenFrame');
      expect(answers(ns)).toEqual([String(t.filled)]);
    }
    for (const ns of items({ case: 'countObjects', value: create(CountObjectsSchema, { count: { min: 1, max: 20 }, picture: CountObjects_Picture.GROUPS }) })) {
      const [g] = find(ns, 'pictureGroups');
      expect(answers(ns)).toEqual([String(g.groups.reduce((a, b) => a + b, 0))]);
    }
    for (const ns of items({ case: 'countObjects', value: create(CountObjectsSchema, { count: { min: 10, max: 99 }, mode: CountObjects_Mode.COINS }) })) {
      const [c] = find(ns, 'coins');
      const v = c.coins.reduce((t, x) => t + COIN[x][1], 0);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(99);
      expect(answers(ns)).toEqual([String(v)]);
    }
  });

  it('fills hundred charts and number bonds', () => {
    for (const ns of items({ case: 'countSequence', value: create(CountSequenceSchema, { start: { min: 1, max: 81 }, chart: true }) })) {
      const [g] = find(ns, 'numberGrid');
      for (const b of g.blanks) {
        expect(b.field!.answer!.text).toBe(String(b.number));
        expect(b.number - g.start).toBeLessThan(g.rows * g.cols);
      }
    }
    for (const ns of items({ case: 'mentalMath', value: create(MentalMathSchema, { mode: MentalMath_Mode.TEN_MORE_LESS, chart: true }) })) {
      const [g] = find(ns, 'numberGrid');
      const n = g.start + 11;
      expect(g.blanks.map((b) => Number(b.field!.answer!.text))).toEqual([n - 10, n - 1, n + 1, n + 10]);
    }
    for (const ns of items({ case: 'equation', value: create(EquationSchema, { total: { min: 3, max: 10 }, mode: Equation_Mode.MISSING_PART, model: Equation_Model.BOND }) })) {
      const [b] = find(ns, 'numberBond');
      const part = (p: typeof b.left) => Number(p?.field ? p.field.answer!.text : p?.text);
      expect(part(b.left) + part(b.right)).toBe(Number(b.whole!.text));
      holds(ns[1]);
    }
    for (const ns of items({ case: 'equation', value: create(EquationSchema, { total: { min: 10, max: 10 }, mode: Equation_Mode.MISSING_PART, model: Equation_Model.TEN_FRAME }) })) {
      const [t] = find(ns, 'tenFrame');
      holds(ns[1]);
      expect(answers(ns)).toEqual([String(10 - t.filled)]);
    }
  });

  it('crosses out what is taken away', () => {
    for (const ns of items({ case: 'addSubtractFact', value: create(AddSubtractFactSchema, { max: 10, op: AddSubtractFact_Op.SUBTRACT, pictures: true }) })) {
      const [g] = find(ns, 'pictureGroups');
      const [w, , a] = line(ns[1]).split(' ').map(Number);
      expect(g.groups).toEqual([w]);
      expect(g.crossedOut).toBe(a);
    }
  });

  it('compares numbers', () => {
    for (const [n] of items({ case: 'compareNumbers', value: create(CompareNumbersSchema, { numbers: { min: 10, max: 99 }, symbols: true }) })) {
      const [a, c, b] = n.kind.case === 'math' ? n.kind.value.atoms : [];
      const x = Number(a.kind.value);
      const y = Number(b.kind.value);
      expect((c.kind.value as Field).answer!.text).toBe(x > y ? '>' : x < y ? '<' : '=');
    }
    for (const ns of items({ case: 'compareNumbers', value: create(CompareNumbersSchema, { numbers: { min: 1, max: 10 } }) })) {
      const [c] = find(ns, 'choices');
      expect(c.field!.answer!.text).toBe(String(Math.max(...c.options.map(Number))));
    }
  });

  it('continues counting sequences by their step', () => {
    for (const [n] of items({ case: 'countSequence', value: create(CountSequenceSchema, { start: { min: 5, max: 900 }, steps: [1, 5, 10, 100] }) })) {
      const xs = line(n).split(' , ').map(Number);
      expect(xs.length).toBe(6);
      for (let i = 2; i < xs.length; i++) {
        expect(xs[i] - xs[i - 1]).toBe(xs[1] - xs[0]);
      }
      expect(xs[5]).toBeLessThanOrEqual(1000);
    }
  });

  it('adds and subtracts facts, with and without pictures', () => {
    for (const op of [AddSubtractFact_Op.ADD, AddSubtractFact_Op.SUBTRACT, AddSubtractFact_Op.MIXED]) {
      for (const max of [5, 10, 20]) {
        for (const ns of items({ case: 'addSubtractFact', value: create(AddSubtractFactSchema, { max, op }) })) {
          const [n] = flat(ns).filter((x) => x.kind.case === 'math');
          holds(n);
          expect(evaluate(line(n).split('=')[0])).toBeLessThanOrEqual(max);
        }
      }
    }
    for (const ns of items({ case: 'addSubtractFact', value: create(AddSubtractFactSchema, { max: 10, op: AddSubtractFact_Op.MIXED, pictures: true }) })) {
      const eq = flat(ns).filter((x) => x.kind.case === 'math' && line(x).includes('='))[0];
      holds(eq);
      const [first, , second] = line(eq).split(' ').map(Number);
      const [g] = find(ns, 'pictureGroups');
      expect(g.groups.reduce((x, y) => x + y, 0)).toBe(line(eq).includes('+') ? first + second : first);
    }
    for (const [n] of items({ case: 'addSubtractFact', value: create(AddSubtractFactSchema, { max: 20, threeAddends: true }) })) {
      holds(n);
    }
  });

  it('completes and judges equations', () => {
    for (const mode of [Equation_Mode.MISSING_PART, Equation_Mode.TURN_AROUND, Equation_Mode.THINK_ADDITION, Equation_Mode.MISSING_ANY]) {
      for (const ns of items({ case: 'equation', value: create(EquationSchema, { total: { min: 2, max: 20 }, mode }) })) {
        ns.forEach(holds);
      }
    }
    for (const ns of items({ case: 'equation', value: create(EquationSchema, { total: { min: 2, max: 15 }, mode: Equation_Mode.TRUE_FALSE }) })) {
      const [l, r] = line(ns[0]).split('=').map((x) => evaluate(x.trim()));
      expect(answers(ns)).toEqual([l === r ? 'true' : 'false']);
    }
  });

  it('reads place value from blocks and units', () => {
    for (const number of [
      { min: 11, max: 99 },
      { min: 101, max: 999 },
    ]) {
      for (const ns of items({ case: 'placeValueBlocks', value: create(PlaceValueBlocksSchema, { number, mode: PlaceValueBlocks_Mode.READ_BLOCKS }) })) {
        const [b] = find(ns, 'baseTenBlocks');
        const n = 100 * b.hundreds + 10 * b.tens + b.ones;
        expect(answers(ns)).toEqual([...(b.hundreds ? [String(b.hundreds)] : []), String(b.tens), String(b.ones), String(n)]);
      }
      for (const ns of items({ case: 'placeValueBlocks', value: create(PlaceValueBlocksSchema, { number, mode: PlaceValueBlocks_Mode.UNITS }) })) {
        ns.forEach(holds);
      }
    }
    for (const ns of items({ case: 'placeValueBlocks', value: create(PlaceValueBlocksSchema, { mode: PlaceValueBlocks_Mode.TEEN }) })) {
      const [b] = find(ns, 'baseTenBlocks');
      expect(b.tens).toBe(1);
      holds(ns[1]);
      expect(line(ns[1])).toContain(String(10 + b.ones));
    }
  });

  it('adds and subtracts tens and hundreds in the head', () => {
    for (const mode of [MentalMath_Mode.PLUS_ONES, MentalMath_Mode.PLUS_TENS, MentalMath_Mode.SUBTRACT_TENS]) {
      for (const [n] of items({ case: 'mentalMath', value: create(MentalMathSchema, { mode }) })) {
        holds(n);
        expect(Number(line(n).split('= ')[1])).toBeLessThan(100);
      }
    }
    for (const mode of [MentalMath_Mode.TEN_MORE_LESS, MentalMath_Mode.HUNDRED_MORE_LESS]) {
      for (const [n] of items({ case: 'mentalMath', value: create(MentalMathSchema, { mode }) })) {
        const m = line(n).match(/^(\d+) (more|less) than (\d+) is (\d+)$/)!;
        expect(m).withContext(line(n)).not.toBeNull();
        const [by, dir, from, to] = [Number(m[1]), m[2], Number(m[3]), Number(m[4])];
        expect(to).toBe(dir === 'more' ? from + by : from - by);
      }
    }
  });

  it('writes numbers in words and expanded form', () => {
    expect(numberWords(347)).toBe('three hundred forty-seven');
    expect(numberWords(115)).toBe('one hundred fifteen');
    expect(numberWords(900)).toBe('nine hundred');
    expect(numberWords(405)).toBe('four hundred five');
    expect(numberWords(780)).toBe('seven hundred eighty');
    for (const mode of [NumberForms_Mode.EXPANDED_TO_NUMBER, NumberForms_Mode.NUMBER_TO_EXPANDED]) {
      for (const [n] of items({ case: 'numberForms', value: create(NumberFormsSchema, { mode }) })) {
        holds(n);
      }
    }
    for (const ns of items({ case: 'numberForms', value: create(NumberFormsSchema, { mode: NumberForms_Mode.WORDS_TO_NUMBER }) })) {
      expect(ns[0].kind.value).toBe(numberWords(Number(answers(ns)[0])));
    }
  });

  it('adds several numbers in columns', () => {
    for (const addends of [2, 3, 4]) {
      for (const ns of items({ case: 'addInColumns', value: create(AddInColumnsSchema, { addends }) })) {
        const [c] = find(ns, 'columnArithmetic');
        expect(c.operands.length).toBe(addends);
        expect(c.answer!.answer!.text).toBe(String(c.operands.reduce((s, x) => s + Number(x), 0)));
      }
    }
  });

  it('reads clocks on a step', () => {
    for (const step of [60, 30, 5]) {
      for (const ns of items({ case: 'clockNearest', value: create(ClockNearestSchema, { step }) })) {
        const [c] = find(ns, 'clock');
        expect(c.minute % step).toBe(0);
        expect(answers(ns)).toEqual([`${c.hour}:${String(c.minute).padStart(2, '0')}`]);
      }
    }
  });

  it('answers questions from tallies and line plots', () => {
    const tallied = (s: string) => (s.match(/[|/]/g) ?? []).length;
    for (const ns of items({ case: 'dataChart', value: create(DataChartSchema, { mode: DataChart_Mode.TALLY }) })) {
      const [t] = find(ns, 'dataTable');
      const vs = t.rows.map((r) => tallied(r.cells[1].kind.value as string));
      const [first, more, all] = answers(ns).map(Number);
      expect(first).toBe(vs[0]);
      expect(more).toBe(Math.max(...vs) - Math.min(...vs));
      expect(all).toBe(vs.reduce((a, b) => a + b, 0));
    }
    for (const ns of items({ case: 'dataChart', value: create(DataChartSchema, { mode: DataChart_Mode.LINE_PLOT }) })) {
      const [p] = find(ns, 'linePlot');
      const [, total, range] = answers(ns).map(Number);
      const with_ = p.counts.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0);
      expect(total).toBe(p.counts.reduce((a, b) => a + b, 0));
      expect(range).toBe(with_[with_.length - 1] - with_[0]);
    }
  });

  it('names, counts and sorts shapes', () => {
    const names: Record<number, string> = { 3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon' };
    for (const ns of items({ case: 'shapeAttributes', value: create(ShapeAttributesSchema, { mode: ShapeAttributes_Mode.SIDES_CORNERS }) })) {
      const [p] = find(ns, 'polygon');
      const n = p.points.length;
      expect(answers(ns)).toEqual([String(n), String(n), names[n]]);
    }
    for (const ns of items({ case: 'shapeAttributes', value: create(ShapeAttributesSchema, { mode: ShapeAttributes_Mode.SORT }) })) {
      const sides = find(ns, 'polygon').map((p) => p.points.length);
      expect(answers(ns)).toEqual([3, 4, 24].map((k) => String(sides.filter((x) => x === k).length)));
    }
    for (const ns of items({ case: 'shapeAttributes', value: create(ShapeAttributesSchema, { mode: ShapeAttributes_Mode.NAME }) })) {
      const [p] = find(ns, 'polygon');
      const name = answers(ns)[0];
      const corners: Record<string, number> = { circle: 24, triangle: 3, square: 4, rectangle: 4, hexagon: 6 };
      expect(p.points.length).toBe(corners[name]);
    }
  });

  it('names equal shares and spots unequal ones', () => {
    for (const ns of items({ case: 'equalShares', value: create(EqualSharesSchema, { denominators: [2, 3, 4] }) })) {
      const [b] = find(ns, 'fractionBar');
      const share: Record<number, string> = { 2: 'one half', 3: 'one third', 4: 'one fourth' };
      expect(answers(ns)).toEqual([share[b.parts]]);
    }
    for (const ns of items({ case: 'equalShares', value: create(EqualSharesSchema, { denominators: [2, 3, 4], unequal: true }) })) {
      const [b] = find(ns, 'fractionBar');
      const equal = b.widths.length === 0 || b.widths.every((w) => w === b.widths[0]);
      expect(answers(ns)).toEqual([equal ? 'equal shares' : 'not equal shares']);
    }
  });

  it('pairs dots, adds rows and counts squares', () => {
    for (const ns of items({ case: 'pairsAndArrays', value: create(PairsAndArraysSchema, { size: { min: 2, max: 20 }, mode: PairsAndArrays_Mode.ODD_EVEN }) })) {
      const n = dotCount(ns);
      expect(answers(ns)[0]).toBe(n % 2 === 0 ? 'even' : 'odd');
      if (n % 2 === 0) {
        holds(ns[2]);
      }
    }
    for (const ns of items({ case: 'pairsAndArrays', value: create(PairsAndArraysSchema, { size: { min: 2, max: 5 }, mode: PairsAndArrays_Mode.ARRAY_SUM }) })) {
      holds(ns[1]);
      expect(answers(ns)).toEqual([String(dotCount(ns))]);
    }
    for (const ns of items({ case: 'pairsAndArrays', value: create(PairsAndArraysSchema, { size: { min: 2, max: 5 }, mode: PairsAndArrays_Mode.SQUARES }) })) {
      const [g] = find(ns, 'unitGrid');
      expect(answers(ns)).toEqual([String(g.rows), String(g.cols), String(g.rows * g.cols)]);
    }
  });

  it('lands number line jumps where the sum says', () => {
    for (const [step, subtract] of [
      [1, false],
      [1, true],
      [10, false],
      [10, true],
    ] as const) {
      for (const ns of items({ case: 'numberLineJumps', value: create(NumberLineJumpsSchema, { step, subtract }) })) {
        const [l] = find(ns, 'numberLine');
        holds(ns[1]);
        const start = l.arrowTick;
        const end = subtract ? start - l.jumpTicks.length : start + l.jumpTicks.length;
        expect(l.blanks[0].tick).toBe(end);
        expect(answers(ns)).toEqual([String(end * step), String(end * step)]);
      }
    }
  });

  it('compares and measures lengths', () => {
    const units = (ns: readonly Node[]) => find(ns, 'tapeDiagram')[0].tapes.map((t) => t.units);
    for (const ns of items({ case: 'lengthMeasure', value: create(LengthMeasureSchema, { mode: LengthMeasure_Mode.LONGER }) })) {
      const [a, b] = units(ns);
      expect(answers(ns)).toEqual([a > b ? 'A' : 'B']);
    }
    for (const ns of items({ case: 'lengthMeasure', value: create(LengthMeasureSchema, { mode: LengthMeasure_Mode.ORDER_THREE }) })) {
      const ls = units(ns);
      expect(answers(ns)).toEqual(['ABC'[ls.indexOf(Math.max(...ls))], 'ABC'[ls.indexOf(Math.min(...ls))]]);
    }
    for (const ns of items({ case: 'lengthMeasure', value: create(LengthMeasureSchema, { mode: LengthMeasure_Mode.COUNT_UNITS }) })) {
      expect(answers(ns)).toEqual([String(units(ns)[0])]);
    }
    for (const ns of items({ case: 'lengthMeasure', value: create(LengthMeasureSchema, { mode: LengthMeasure_Mode.RULER_INCHES }) })) {
      expect(answers(ns)).toEqual([String(find(ns, 'ruler')[0].barParts)]);
    }
    for (const ns of items({ case: 'lengthMeasure', value: create(LengthMeasureSchema, { mode: LengthMeasure_Mode.HOW_MUCH_LONGER }) })) {
      const [a, b] = find(ns, 'ruler').map((r) => r.barParts);
      expect(answers(ns)).toEqual([String(a), String(b), String(a - b)]);
    }
    for (const ns of items({ case: 'lengthMeasure', value: create(LengthMeasureSchema, { mode: LengthMeasure_Mode.TWO_UNITS }) })) {
      const [big, small] = find(ns, 'fractionBar').map((b) => b.parts);
      expect(small).toBeGreaterThan(big);
      expect(answers(ns)).toEqual([String(big), String(small), 'small units']);
    }
    for (const ns of items({ case: 'lengthMeasure', value: create(LengthMeasureSchema, { mode: LengthMeasure_Mode.ESTIMATE }) })) {
      const [c] = find(ns, 'choices');
      expect(c.options).toContain(c.field!.answer!.text);
    }
  });
});
