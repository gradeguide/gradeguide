// The command line: composes every worksheet in a library and writes each
// ComposedSheet as JSON, the form a site publishes. It exits non-zero if the
// library has any problem.
//
//   compose-library <library.binpb> <out dir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { toJsonString } from '@bufbuild/protobuf';

import { ComposedSheetSchema, WritingSize } from '../proto/v1/worksheet_pb.js';
import { compose } from './compose.js';
import { decodeLibrary } from './library.js';
import { verifyLibrary } from './verify.js';

const [libraryPath, outDir] = process.argv.slice(2);
if (!libraryPath || !outDir) {
  console.error('usage: compose-library <library.binpb> <out dir>');
  process.exit(2);
}
const lib = decodeLibrary(readFileSync(libraryPath));
const problems = verifyLibrary(lib);
for (const p of problems) {
  console.error(p);
}
mkdirSync(outDir, { recursive: true });
for (const ws of lib.worksheets) {
  const sheet = compose(ws, lib, { writingSize: WritingSize.STANDARD });
  writeFileSync(join(outDir, `${ws.id}.json`), toJsonString(ComposedSheetSchema, sheet, { prettySpaces: 1 }) + '\n');
}
process.exit(problems.length > 0 ? 1 : 0);
