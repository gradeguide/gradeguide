import { Injectable, computed } from '@angular/core';

import { WritingSize } from '../proto/v1/worksheet_pb.js';
import { writingFor } from '../engine/layout.js';

// WritingContext gives widgets the writing size of the sheet they are on.
// SheetComponent provides one and points it at its sheet; a widget drawn
// outside a sheet uses the standard size.
@Injectable()
export class WritingContext {
  source: () => WritingSize = () => WritingSize.STANDARD;
  readonly writing = computed(() => writingFor(this.source()));
}
