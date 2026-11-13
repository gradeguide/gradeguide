// The gallery page: every worksheet in library.binpb, beside this page, drawn
// as printed pages.
// After drawing, it measures each page body against the composer's estimate
// and puts the result in window.fitReport, so a browser test or a person can
// see which pages overflow.
// The library's Angular packages are partially compiled; the compiler
// finishes them in the browser.
import '@angular/compiler';
import { createComponent, provideZonelessChangeDetection } from '@angular/core';
import { createApplication } from '@angular/platform-browser';

import { decodeLibrary } from '../engine/library.js';
import { GalleryComponent } from './gallery.component.js';

interface PageFit {
  worksheet: string;
  page: number;
  body: number;
  content: number;
  overflows: boolean;
}

function measure(): PageFit[] {
  const out: PageFit[] = [];
  document.querySelectorAll<HTMLElement>('article[data-worksheet]').forEach((a) => {
    const sheet = a.querySelector('ws-sheet');
    sheet?.querySelectorAll<HTMLElement>('.page .body').forEach((body, i) => {
      const content = Array.from(body.children).reduce((s, c) => s + (c as HTMLElement).offsetHeight + 4, 0);
      out.push({ worksheet: a.dataset['worksheet'] ?? '', page: i + 1, body: body.clientHeight, content, overflows: body.scrollHeight > body.clientHeight + 1 });
    });
  });
  return out;
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const library = decodeLibrary(new Uint8Array(await (await fetch('library.binpb')).arrayBuffer()));
  const app = await createApplication({ providers: [provideZonelessChangeDetection()] });
  const ref = createComponent(GalleryComponent, {
    environmentInjector: app.injector,
    hostElement: document.querySelector('ws-gallery') ?? undefined,
  });
  // Inputs are set before the first change detection, because library is
  // required.
  ref.setInput('library', library);
  ref.setInput('only', params.get('only') ?? '');
  // answers=0: the blank sheet only. answers=only: the filled copy only.
  ref.setInput('answers', params.get('answers') !== '0');
  ref.setInput('blank', params.get('answers') !== 'only');
  ref.setInput('large', params.get('writing') === 'large');
  app.attachView(ref.hostView);
  ref.changeDetectorRef.detectChanges();
  requestAnimationFrame(() => {
    (window as unknown as { fitReport: PageFit[] }).fitReport = measure();
  });
}

main();
