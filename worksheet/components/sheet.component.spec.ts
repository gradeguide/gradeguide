import { TestBed } from '@angular/core/testing';

import { EXAMPLES } from '../examples/examples_data.js';
import { compose } from '../engine/compose.js';
import { decodeLibrary } from '../engine/library.js';
import { type ComposedSheet } from '../proto/v1/worksheet_pb.js';
import { SheetComponent } from './sheet.component.js';

const lib = decodeLibrary(Uint8Array.from(atob(EXAMPLES), (c) => c.charCodeAt(0)));

function sheetFor(id: string): ComposedSheet {
  const ws = lib.worksheets.find((w) => w.id === id);
  if (!ws) {
    throw new Error(`no worksheet ${id}`);
  }
  return compose(ws, lib);
}

describe('SheetComponent', () => {
  for (const id of ['ws-equivalent-fractions-number-line', 'ws-mixed-review', 'ws-area-models', 'ws-angles', 'ws-multiplication-strategies']) {
    it(`draws every field of ${id} exactly once`, () => {
      const sheet = sheetFor(id);
      const fixture = TestBed.createComponent(SheetComponent);
      fixture.componentRef.setInput('sheet', sheet);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const drawn = Array.from(el.querySelectorAll('[data-field]')).map((e) => e.getAttribute('data-field'));
      expect(drawn.sort()).toEqual(sheet.key.map((k) => k.field?.id ?? '').sort());

      const again = TestBed.createComponent(SheetComponent);
      again.componentRef.setInput('sheet', sheetFor(id));
      again.detectChanges();
      expect((again.nativeElement as HTMLElement).innerHTML).toBe(el.innerHTML);
    });
  }
});
