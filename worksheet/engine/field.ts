import { type Field } from '../proto/v1/nodes_pb.js';
import { type Writing } from './layout.js';

// shown is the text a field prints: its answer in a worked example (whose
// fields have no id) or on a filled-in answer sheet, otherwise nothing.
export function shown(f: Field | undefined, filled: boolean): string {
  if (!f) {
    return '';
  }
  return f.id === '' || filled ? (f.answer?.text ?? '') : '';
}

// fieldId is the data-field attribute value, or null for a worked example.
export function fieldId(f: Field | undefined): string | null {
  return f && f.id !== '' ? f.id : null;
}

export const INK = '#222';
export const SHADE = '#c8c8c8';
export const ANSWER_INK = '#1a4f8a';

// blankWidth is how wide a box must be for a child to write any accepted
// answer in it, such as "84 inches", at their writing size. A handwritten
// character is about half a row wide.
export function blankWidth(f: Field | undefined, w: Writing): number {
  const answers = [f?.answer?.text ?? '', ...(f?.answer?.also ?? [])];
  const chars = Math.max(2, ...answers.map((a) => a.length));
  return Math.round(chars * w.row * 0.5 + 16);
}
