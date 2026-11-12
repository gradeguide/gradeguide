import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { type Catalog, type Sheet } from './catalog.js';
import { gradeName } from './sheet-page.component.js';
import { TopBarComponent } from './top-bar.component.js';

// IndexPageComponent lists the worksheets by grade and topic, with a search.
// Picking a card opens a preview beside the list; on a phone it opens the
// sheet's own page instead.
@Component({
  selector: 'gg-index-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TopBarComponent],
  template: `
    <gg-top-bar [crumbs]="[{ label: 'Worksheets' }]">
      <input class="search" type="search" placeholder="Search worksheets" aria-label="Search worksheets" [value]="query()" (input)="query.set($any($event.target).value)" />
    </gg-top-bar>
    <div class="body" [class.open]="!!picked()">
      <div class="list">
        @if (!query()) {
          <nav class="grades" aria-label="Grade">
            @for (g of catalog().site.grades; track g) {
              <button type="button" [class.on]="g === grade()" [attr.aria-pressed]="g === grade()" (click)="grade.set(g); picked.set(null)">{{ g }}</button>
            }
          </nav>
          <nav class="topics" aria-label="Topic">
            <button type="button" [class.on]="!topic()" (click)="topic.set('')">All</button>
            @for (s of catalog().site.strands; track s.id) {
              @if (count(s.id)) {
                <button type="button" [class.on]="topic() === s.id" (click)="topic.set(s.id)">{{ s.name }}</button>
              }
            }
          </nav>
        }
        @if (shown().length) {
          <ul class="cards">
            @for (s of shown(); track s.id) {
              <li>
                <a class="card" [class.on]="picked() === s" [href]="'?only=' + s.id" (click)="pick($event, s)">
                  @if (s.thumbnail) {
                    <img [src]="s.thumbnail" alt="" width="240" height="311" loading="lazy" />
                  } @else {
                    <span class="blank"></span>
                  }
                  <span class="title">{{ s.title }}</span>
                  <span class="pages">{{ s.pages }} {{ s.pages === 1 ? 'page' : 'pages' }}</span>
                </a>
              </li>
            }
          </ul>
        } @else {
          <p class="none">{{ query() ? 'No worksheets match.' : 'No worksheets for ' + gradeLabel() + ' yet.' }}</p>
        }
      </div>
      @if (picked(); as p) {
        <aside class="drawer" aria-label="Preview">
          <button class="close" type="button" aria-label="Close" (click)="picked.set(null)">×</button>
          @if (p.thumbnail) {
            <img [src]="p.thumbnail" alt="" width="240" height="311" />
          }
          <h2>{{ p.title }}</h2>
          <p class="meta">{{ p.pages }} {{ p.pages === 1 ? 'page' : 'pages' }}@if (p.minutes) { · about {{ p.minutes }} min}</p>
          <a class="button primary" [href]="'?only=' + p.id + '&print=1'">Print</a>
          @if (p.pdf) {
            <a class="button" [href]="p.pdf" download>Download PDF</a>
          }
          <a class="button" [href]="'?only=' + p.id">Open full page</a>
        </aside>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .search { font: inherit; font-size: 14px; padding: 6px 10px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--page); color: var(--text); width: 220px; }
    .body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; max-width: 1140px; margin: 0 auto; padding: 16px; }
    .body.open { grid-template-columns: minmax(0, 1fr) 280px; }
    nav { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    nav button { font: inherit; font-size: 14px; padding: 5px 12px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text); cursor: pointer; }
    nav button.on { border-color: var(--accent); color: var(--accent); font-weight: 600; }
    .grades button { min-width: 38px; }
    .cards { list-style: none; padding: 0; margin: 8px 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; }
    .card { display: flex; flex-direction: column; gap: 6px; text-decoration: none; color: var(--text); padding: 8px; border-radius: 10px; border: 1px solid transparent; }
    .card:hover, .card.on { border-color: var(--border-strong); background: var(--surface); }
    .card img, .blank { width: 100%; height: auto; aspect-ratio: 240 / 311; background: white; box-shadow: 0 1px 6px rgba(0,0,0,.15); display: block; }
    .title { font-size: 14px; font-weight: 600; line-height: 1.3; }
    .pages, .meta, .none { font-size: 13px; color: var(--muted); }
    .drawer { position: sticky; top: 16px; align-self: start; display: flex; flex-direction: column; gap: 8px; padding: 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
    .drawer img { width: 100%; height: auto; box-shadow: 0 1px 6px rgba(0,0,0,.15); background: white; }
    .drawer h2 { font-size: 18px; margin: 6px 0 0; }
    .drawer .meta { margin: 0 0 6px; }
    .close { align-self: flex-end; font: inherit; font-size: 20px; line-height: 1; border: 0; background: none; color: var(--muted); cursor: pointer; }
    .button { font-size: 14px; padding: 8px 14px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface); color: var(--text); text-decoration: none; text-align: center; }
    .button:hover { background: var(--hover); }
    .primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
    @media (max-width: 720px) {
      .search { width: 100%; }
      .body.open { grid-template-columns: minmax(0, 1fr); }
      .drawer { display: none; }
      .cards { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
    }
  `,
})
export class IndexPageComponent {
  readonly catalog = input.required<Catalog>();
  readonly grade = signal('4');
  readonly topic = signal('');
  readonly query = signal('');
  protected readonly picked = signal<Sheet | null>(null);

  protected readonly shown = computed(() => this.catalog().find(this.grade(), this.topic(), this.query()));
  protected readonly gradeLabel = computed(() => gradeName(this.grade()).replace('Grade', 'grade'));

  protected count(strand: string): number {
    return this.catalog().find(this.grade(), strand, '').length;
  }

  // On a wide screen a card opens the preview; on a phone, or with a
  // modifier key, it follows its link to the sheet's page.
  protected pick(e: MouseEvent, s: Sheet): void {
    if (window.innerWidth <= 720 || e.metaKey || e.ctrlKey || e.shiftKey) {
      return;
    }
    e.preventDefault();
    this.picked.set(s);
  }
}
