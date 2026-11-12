// Helpers for writing nodes in generators.
import { create } from '@bufbuild/protobuf';

import {
  type Field,
  type Math as MathNode,
  type Math_Atom,
  type Node,
  AnswerSchema,
  FieldSchema,
  FractionSchema,
  Math_AtomSchema,
  Math_HalfBlankSchema,
  MathSchema,
  NodeSchema,
  RowSchema,
  StackSchema,
} from '../proto/v1/nodes_pb.js';

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function frac(num: number, den: number): string {
  return `${num}/${den}`;
}

// Fields hands out field ids for one item: "q4b", then "q4b-2" and so on.
// The composer makes one per item, so generators never choose ids.
export class Fields {
  private n = 0;

  constructor(private readonly base: string) {}

  field(label: string, answer: string, also: string[] = []): Field {
    this.n++;
    const id = this.base === '' ? '' : this.n === 1 ? this.base : `${this.base}-${this.n}`;
    return create(FieldSchema, { id, label, answer: create(AnswerSchema, { text: answer, also }) });
  }
}

export function node(kind: Node['kind']): Node {
  return create(NodeSchema, { kind });
}

export function text(s: string): Node {
  return node({ case: 'text', value: s });
}

export function row(...children: Node[]): Node {
  return node({ case: 'row', value: create(RowSchema, { children }) });
}

export function stack(...children: Node[]): Node {
  return node({ case: 'stack', value: create(StackSchema, { children }) });
}

// math builds a line of maths. Strings are text atoms, [n, d] pairs are
// fractions, and Fields are blanks.
export type AtomSpec = string | number | [number, number] | Math_Atom;

export function atom(kind: Math_Atom['kind']): Math_Atom {
  return create(Math_AtomSchema, { kind });
}

export function blank(f: Field): Math_Atom {
  return atom({ case: 'blank', value: f });
}

export function fractionBlank(f: Field): Math_Atom {
  return atom({ case: 'fractionBlank', value: f });
}

export function compare(f: Field): Math_Atom {
  return atom({ case: 'compare', value: f });
}

export function halfBlank(given: number, blankNumerator: boolean, f: Field): Math_Atom {
  return atom({ case: 'halfBlank', value: create(Math_HalfBlankSchema, { given, blankNumerator, field: f }) });
}

export function math(...atoms: AtomSpec[]): Node {
  const out: Math_Atom[] = atoms.map((a) => {
    if (typeof a === 'string' || typeof a === 'number') {
      return atom({ case: 'text', value: String(a) });
    }
    if (Array.isArray(a)) {
      return atom({ case: 'fraction', value: create(FractionSchema, { num: a[0], den: a[1] }) });
    }
    return a;
  });
  const m: MathNode = create(MathSchema, { atoms: out });
  return node({ case: 'math', value: m });
}

// fieldsOf lists every field in nodes, in drawing order.
export function fieldsOf(nodes: readonly Node[]): Field[] {
  const out: Field[] = [];
  const add = (f: Field | undefined) => {
    if (f) {
      out.push(f);
    }
  };
  const walk = (n: Node) => {
    const k = n.kind;
    switch (k.case) {
      case 'row':
      case 'stack':
        k.value.children.forEach(walk);
        break;
      case 'math':
        for (const a of k.value.atoms) {
          switch (a.kind.case) {
            case 'blank':
            case 'fractionBlank':
            case 'compare':
              add(a.kind.value);
              break;
            case 'halfBlank':
              add(a.kind.value.field);
              break;
          }
        }
        break;
      case 'numberLine':
        k.value.blanks.forEach((b) => add(b.field));
        break;
      case 'fractionBar':
        add(k.value.shadeField);
        break;
      case 'unitGrid':
        add(k.value.shadeField);
        break;
      case 'areaModel':
        k.value.cells.forEach((c) => add(c.field));
        break;
      case 'tapeDiagram':
        k.value.tapes.forEach((t) => add(t.totalField));
        break;
      case 'columnArithmetic':
        k.value.partials.forEach((p) => add(p.field));
        add(k.value.answer);
        break;
      case 'dataTable':
        for (const r of k.value.rows) {
          for (const c of r.cells) {
            if (c.kind.case === 'field') {
              add(c.kind.value);
            }
          }
        }
        break;
      case 'multiPartQuestion':
        k.value.stem.forEach(walk);
        for (const p of k.value.parts) {
          p.prompt.forEach(walk);
          p.response.forEach(walk);
        }
        break;
      case 'angle':
        k.value.arcs.forEach((a) => add(a.field));
        break;
      case 'polygon':
        k.value.sides.forEach((s) => add(s.field));
        break;
      case 'placeValueChart':
        k.value.columns.forEach((c) => add(c.field));
        break;
      case 'longDivision':
        add(k.value.quotient);
        add(k.value.remainder);
        break;
      case 'numberChart':
        add(k.value.shadeField);
        break;
      case 'choices':
        add(k.value.field);
        break;
      case 'lines':
        add(k.value.field);
        break;
      case 'workSpace':
        add(k.value.field);
        break;
    }
  };
  nodes.forEach(walk);
  return out;
}
