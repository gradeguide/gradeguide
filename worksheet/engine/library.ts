import { fromBinary } from '@bufbuild/protobuf';

import { type Library, LibrarySchema } from '../proto/v1/worksheet_pb.js';

// decodeLibrary reads a Library encoded as binary protobuf, as the build
// writes it from a catalogue's textproto files.
export function decodeLibrary(bytes: Uint8Array): Library {
  return fromBinary(LibrarySchema, bytes);
}
