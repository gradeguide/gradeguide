// verify checks a whole library: every worksheet composes with no problems,
// every field has a unique id and an answer, composing twice gives the same
// sheet, and worked examples and figures have no fields. It returns one
// sentence per problem.
import { toBinary } from '@bufbuild/protobuf';

import { type Library, ComposedSheetSchema, WritingSize } from '../proto/v1/worksheet_pb.js';
import { fieldsOf } from './build.js';
import { compose } from './compose.js';

export function verifyLibrary(lib: Library): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const f of lib.fragments) {
    if (ids.has(f.id)) {
      problems.push(`Fragment id "${f.id}" is used twice.`);
    }
    ids.add(f.id);
    if (!f.design?.purpose) {
      problems.push(`Fragment "${f.id}" has no learning design purpose.`);
    }
  }
  const sheets = new Set<string>();
  for (const ws of lib.worksheets) {
    if (sheets.has(ws.id)) {
      problems.push(`Worksheet id "${ws.id}" is used twice.`);
    }
    sheets.add(ws.id);
    const sheet = compose(ws, lib, { writingSize: WritingSize.STANDARD });
    problems.push(...sheet.problems.map((p) => `${ws.id}: ${p}`));
    const fieldIds = sheet.key.map((k) => k.field?.id ?? '');
    if (new Set(fieldIds).size !== fieldIds.length) {
      problems.push(`${ws.id}: two fields share an id.`);
    }
    for (const k of sheet.key) {
      if (!k.field?.answer?.text) {
        problems.push(`${ws.id}: field ${k.field?.id} has no answer.`);
      }
    }
    const again = compose(ws, lib, { writingSize: WritingSize.STANDARD });
    const a = toBinary(ComposedSheetSchema, sheet);
    const b = toBinary(ComposedSheetSchema, again);
    if (a.length !== b.length || a.some((x, i) => x !== b[i])) {
      problems.push(`${ws.id}: composing twice gave different sheets.`);
    }
    for (const p of sheet.pages) {
      for (const s of p.sections) {
        if (fieldsOf([...(s.example?.nodes ?? []), ...s.figure]).some((f) => f.id !== '')) {
          problems.push(`${ws.id}: section ${s.label} has a field in its worked example or figure.`);
        }
      }
    }
  }
  return problems;
}
