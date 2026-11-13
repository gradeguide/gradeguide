// The worksheet pages. With ?only=<id> this is one sheet's page; otherwise it
// is the index. They read the site data (/math.json) and the worksheet
// library, which the developer gallery beside this page also reads.
import '@angular/compiler';
import { type ComponentRef, createComponent, provideZonelessChangeDetection } from '@angular/core';
import { createApplication } from '@angular/platform-browser';

import { decodeLibrary } from '../../../worksheet/engine/library.js';
import { Catalog, type SiteData } from './catalog.js';
import { IndexPageComponent } from './index-page.component.js';
import { SheetPageComponent } from './sheet-page.component.js';

async function main() {
  const params = new URLSearchParams(window.location.search);
  const [site, bytes] = await Promise.all([
    fetch('/math.json').then((r) => r.json() as Promise<SiteData>),
    fetch('gallery/library.binpb').then((r) => r.arrayBuffer()),
  ]);
  const catalog = new Catalog(site, decodeLibrary(new Uint8Array(bytes)));
  const app = await createApplication({ providers: [provideZonelessChangeDetection()] });
  const host = document.querySelector('gg-worksheets') ?? undefined;
  const sheet = catalog.sheet(params.get('only') ?? '');
  let ref: ComponentRef<unknown>;
  if (sheet) {
    document.title = `${sheet.title} · GradeGuide`;
    const page = createComponent(SheetPageComponent, { environmentInjector: app.injector, hostElement: host });
    page.setInput('catalog', catalog);
    page.setInput('sheet', sheet);
    page.setInput('large', params.get('writing') === 'large');
    page.setInput('startWithAnswers', params.get('answers') === '1');
    page.setInput('printOnLoad', params.get('print') === '1');
    ref = page;
  } else {
    const page = createComponent(IndexPageComponent, { environmentInjector: app.injector, hostElement: host });
    page.setInput('catalog', catalog);
    const grade = params.get('grade');
    if (grade && site.grades.includes(grade)) {
      page.instance.grade.set(grade);
    }
    page.instance.topic.set(params.get('topic') ?? '');
    page.instance.query.set(params.get('q') ?? '');
    ref = page;
  }
  app.attachView(ref.hostView);
  ref.changeDetectorRef.detectChanges();
}

main();
