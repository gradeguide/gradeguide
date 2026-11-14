// Checks on authored items, whose answers are typed rather than computed.
// Each answer carries its working; the working must come to the answer, and
// every number in it must be one the child can see in the item or found in
// an earlier part.
import { type Message } from '@bufbuild/protobuf';

import { type Field, type Node } from '../proto/v1/nodes_pb.js';
import { fieldsOf } from './build.js';

// evaluate works out arithmetic such as "9 × 8 − 4 × 8", with + − × ÷ and
// parentheses. It returns undefined for anything else.
export function evaluate(expr: string): number | undefined {
  const tokens = expr.replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(\.\d+)?|[-+−×x*÷/()]/g);
  if (!tokens || tokens.join('') !== expr.replace(/(\d),(\d{3})/g, '$1$2').replace(/\s+/g, '')) {
    return undefined;
  }
  let i = 0;
  const peek = () => tokens[i];
  const factor = (): number | undefined => {
    const t = tokens[i++];
    if (t === '(') {
      const v = sum();
      return tokens[i++] === ')' ? v : undefined;
    }
    return t !== undefined && /^\d/.test(t) ? Number(t) : undefined;
  };
  const product = (): number | undefined => {
    let v = factor();
    while (v !== undefined && ['×', 'x', '*', '÷', '/'].includes(peek() ?? '')) {
      const op = tokens[i++];
      const r = factor();
      if (r === undefined) {
        return undefined;
      }
      v = op === '÷' || op === '/' ? v / r : v * r;
    }
    return v;
  };
  const sum = (): number | undefined => {
    let v = product();
    while (v !== undefined && ['+', '-', '−'].includes(peek() ?? '')) {
      const op = tokens[i++];
      const r = product();
      if (r === undefined) {
        return undefined;
      }
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const v = sum();
  return i === tokens.length ? v : undefined;
}

// parseAnswer reads an answer as a number: a whole number, a decimal, a
// fraction such as "5/8", or a mixed number such as "2 1/4", ignoring commas
// and a dollar sign. NaN if it is none of these.
export function parseAnswer(text: string): number {
  const t = text.replace(/[,$]/g, '').trim();
  const m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) {
    return Number(m[1]) + Number(m[2]) / Number(m[3]);
  }
  const f = t.match(/^(\d+)\/(\d+)$/);
  if (f) {
    return Number(f[1]) / Number(f[2]);
  }
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

// steps counts the operations in a working.
export function steps(work: string): number {
  // A slash between digits is a fraction, not a division step.
  return (work.match(/[-+−×x*÷]|\s\/\s/g) ?? []).length;
}

function numbersIn(s: string): number[] {
  return (s.match(/\d[\d,]*(\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, '')));
}

// shownNumbers lists the numbers printed in nodes: in text, maths, and
// widget values such as a bar's height. Field labels and answers are not
// printed, so they do not count.
export function shownNumbers(nodes: readonly Node[]): Set<number> {
  const out = new Set<number>();
  const walk = (v: unknown, key: string) => {
    if (typeof v === 'string') {
      numbersIn(v).forEach((n) => out.add(n));
      // A percent is out of 100, and 15% also shows 0.15.
      if (/%|percent/.test(v)) {
        out.add(100);
      }
      for (const m of v.matchAll(/(\d+(?:\.\d+)?)%/g)) {
        out.add(Number(m[1]) / 100);
      }
    } else if ((typeof v === 'number' || typeof v === 'bigint') && key === 'value') {
      out.add(Number(v));
    } else if (Array.isArray(v)) {
      v.forEach((x) => walk(x, key));
    } else if (v && typeof v === 'object') {
      if ((v as Message).$typeName?.endsWith('.Field')) {
        return;
      }
      for (const [k, x] of Object.entries(v)) {
        if (k !== '$typeName') {
          walk(x, k);
        }
      }
    }
  };
  nodes.forEach((n) => walk(n, ''));
  return out;
}

// checkAuthored lists what is wrong with one authored item's answers, one
// sentence each. Parts are checked in order, so a later part may use an
// earlier part's answer.
export function checkAuthored(nodes: readonly Node[], where: string): string[] {
  const problems: string[] = [];
  const given = shownNumbers(nodes);
  const groups: Field[][] = [];
  for (const n of nodes) {
    if (n.kind.case === 'multiPartQuestion') {
      for (const p of n.kind.value.parts) {
        groups.push(fieldsOf([...p.prompt, ...p.response]));
      }
    } else {
      groups.push(fieldsOf([n]));
    }
  }
  for (const fields of groups) {
    for (const f of fields) {
      const a = f.answer;
      if (!a?.work) {
        problems.push(`${where}: the answer "${a?.text ?? ''}" has no working.`);
        continue;
      }
      const v = evaluate(a.work);
      const want = parseAnswer(a.text);
      if (v === undefined) {
        problems.push(`${where}: the working "${a.work}" is not arithmetic the checker can read.`);
      } else if (Number.isNaN(want) || Math.abs(v - want) > 1e-9) {
        problems.push(`${where}: the working "${a.work}" comes to ${v}, but the answer is "${a.text}".`);
      }
      for (const n of numbersIn(a.work)) {
        if (!given.has(n)) {
          problems.push(`${where}: the working "${a.work}" uses ${n}, which the item does not show.`);
        }
      }
    }
    for (const f of fields) {
      numbersIn(f.answer?.text ?? '').forEach((n) => given.add(n));
    }
  }
  return problems;
}
