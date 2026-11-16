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

