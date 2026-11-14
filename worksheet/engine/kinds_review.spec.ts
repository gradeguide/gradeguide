// Checks on the item kinds and options added in the grade 2 and 3 review:
// sums within a limit, arrows past 1, mixed numbers that regroup, angles as
// fractions of a turn, quadrilateral names and measuring jugs.
import { create } from '@bufbuild/protobuf';

import { type Field, type Node } from '../proto/v1/nodes_pb.js';
import {
  type ItemKind,
  AngleTurnSchema,
  ClassifyShape_Family,
  ClassifyShapeSchema,
  ColumnAddSubtractSchema,
  FractionAddSubtractSchema,
  FractionAtArrowSchema,
  ItemKindSchema,
  ReadVolume_Unit,
  ReadVolumeSchema,
} from '../proto/v1/worksheet_pb.js';
import { Fields, fieldsOf } from './build.js';
import { parseAnswer } from './check.js';
import { generate } from './kinds.js';
import { Rng } from './rng.js';

function items(kind: ItemKind['kind'], n = 30): Node[][] {
  const rng = new Rng(11);
  const used = new Set<string>();
  const fresh = (k: string) => !used.has(k) && !!used.add(k);
  return Array.from({ length: n }, (_, i) => generate(create(ItemKindSchema, { kind }), { rng, fields: new Fields(`q${i}`), fresh }));
}

const atoms = (n: Node) => (n.kind.case === 'math' ? n.kind.value.atoms : []);

describe('item kinds from the grade 2 and 3 review', () => {
  it('keeps sums and differences within max_total', () => {
    for (const subtract of [false, true]) {
      for (const [n] of items({ case: 'columnAddSubtract', value: create(ColumnAddSubtractSchema, { digits: 2, subtract, regroup: true, maxTotal: 100 }) })) {
        const c = n.kind.case === 'columnArithmetic' ? n.kind.value : undefined;
        const [x, y] = c!.operands.map(Number);
        expect(subtract ? x : x + y).toBeLessThanOrEqual(100);
        expect(Number(c!.answer!.answer!.text)).toBe(subtract ? x - y : x + y);
      }
    }
  });

  it('puts every arrow past 1 when asked', () => {
    for (const [n] of items({ case: 'fractionAtArrow', value: create(FractionAtArrowSchema, { denominators: [2, 3, 4], units: 2, pastOne: true }) })) {
      const line = n.kind.case === 'numberLine' ? n.kind.value : undefined;
      expect(line!.arrowTick).toBeGreaterThan(line!.partsPerUnit);
      expect(line!.arrowTick % line!.partsPerUnit).not.toBe(0);
    }
  });

  it('regroups a whole in every mixed subtraction when asked', () => {
    for (const [n] of items({ case: 'fractionAddSubtract', value: create(FractionAddSubtractSchema, { mixed: true, subtract: true, regroup: true }) })) {
      const a = atoms(n);
      const [w1, f1, , w2, f2] = a.map((x) => x.kind.value);
      const p = f1 as { num: number; den: number };
      const q = f2 as { num: number; den: number };
      expect(p.num).toBeLessThan(q.num);
      const want = Number(w1) + p.num / p.den - (Number(w2) + q.num / q.den);
      const ans = a[a.length - 1].kind.value as Field;
      expect(parseAnswer(ans.answer!.text)).toBeCloseTo(want);
    }
  });

  it('measures a fraction of a turn in degrees', () => {
    for (const nodes of items({ case: 'angleTurn', value: create(AngleTurnSchema, {}) }, 12)) {
      if (nodes.length < 3) {
        continue;
      }
      const f = atoms(nodes[1])[1].kind.value as { num: number; den: number };
      const ans = atoms(nodes[2])[1].kind.value as Field;
      expect(Number(ans.answer!.text)).toBe((360 * f.num) / f.den);
      const angle = nodes[0].kind.case === 'angle' ? nodes[0].kind.value : undefined;
      expect(angle!.rays[0]).toBe((360 * f.num) / f.den);
    }
  });

  it('names quadrilaterals from their sides and right angles', () => {
    for (const [shape, ...asks] of items({ case: 'classifyShape', value: create(ClassifyShapeSchema, { family: ClassifyShape_Family.QUADRILATERAL_NAMES }) }, 7)) {
      const p = shape.kind.case === 'polygon' ? shape.kind.value : undefined;
      const pts = p!.points.map((q) => [q.x, q.y]);
      const sides = pts.map((a, i) => Math.hypot(pts[(i + 1) % 4][0] - a[0], pts[(i + 1) % 4][1] - a[1]));
      const square = (i: number) => {
        const [a, b, c] = [pts[(i + 3) % 4], pts[i], pts[(i + 1) % 4]];
        return Math.abs((a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1])) < 1e-9;
      };
      const rectangle = [0, 1, 2, 3].every(square);
      const rhombus = sides.every((s) => Math.abs(s - sides[0]) < 1e-9);
      const said = asks.map((a) => fieldsOf([a])[0].answer!.text);
      expect(said).toEqual([rectangle, rhombus, rectangle && rhombus].map((b) => (b ? 'yes' : 'no')));
      sides.forEach((s, i) => expect(p!.sides[i].text).toBe(`${s} cm`));
    }
  });

  it('reads a measuring jug at its level', () => {
    for (const unit of [ReadVolume_Unit.LITERS, ReadVolume_Unit.MILLILITERS]) {
      for (const [jug, line] of items({ case: 'readVolume', value: create(ReadVolumeSchema, { unit }) }, 8)) {
        const j = jug.kind.case === 'measuringJug' ? jug.kind.value : undefined;
        expect(j!.level % j!.step).toBe(0);
        expect(j!.level).toBeGreaterThan(0);
        expect(j!.level).toBeLessThan(j!.capacity);
        expect((atoms(line)[0].kind.value as Field).answer!.text).toBe(String(j!.level));
      }
    }
  });
});
