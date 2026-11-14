import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

import { compose } from '../../../worksheet/engine/compose.js';
import { SheetComponent } from '../../../worksheet/components/sheet.component.js';
import { WritingSize } from '../../../worksheet/proto/v1/worksheet_pb.js';
import { type Catalog, type Sheet } from './catalog.js';
import { RelatedComponent } from './related.component.js';
import { type Crumb, TopBarComponent } from './top-bar.component.js';

type Feeling = 'easy' | 'ok' | 'hard';

// SheetPageComponent is one worksheet: the pages, with print, download and
// answers beside them, teaching notes for each part, the skills it
// practises, what to try next, and a "how did it go?" kept only on this
// device.
@Component({
  selector: 'gg-sheet-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SheetComponent, TopBarComponent, RelatedComponent],
  template: `
    @let s = sheet();
    <gg-top-bar [crumbs]="crumbs()" />
    <div class="layout">
      <section class="actions" aria-label="Worksheet">
        <h1>{{ s.title }}</h1>
        <p class="meta">{{ meta() }}</p>
        <div class="buttons">
          <button class="primary" type="button" (click)="print()">Print</button>
          @if (s.pdf) {
            <a class="button" [href]="answers() ? s.answersPdf : s.pdf" download>Download PDF</a>
          }
          <label class="toggle"><input type="checkbox" [checked]="answers()" (change)="answers.set(!answers())" /> Show answers</label>
        </div>
      </section>

      <main class="paper" #paper>
        <div class="pages" [style.zoom]="zoom()">
          <ws-sheet [sheet]="composed()" [filled]="answers()" />
        </div>
        @if (composed().pages.length > 1) {
          <nav class="strip" aria-label="Pages">
            @for (p of composed().pages; track $index; let i = $index) {
              <button type="button" [class.on]="i === page()" (click)="goTo(i)">{{ i + 1 }}</button>
            }
            <span>Page {{ page() + 1 }} of {{ composed().pages.length }}</span>
          </nav>
        }
        @if (notes().length) {
          <section class="notes" aria-labelledby="notes-heading">
            <h2 id="notes-heading">Teaching notes</h2>
            @for (n of notes(); track n.label; let first = $first) {
              <details [open]="first">
                <summary>Part {{ n.label }} · {{ n.instruction }}</summary>
                @if (n.purpose) {
                  <h3>Objective</h3>
                  <p>{{ n.purpose }}</p>
                }
                @if (n.rationale) {
                  <h3>Approach</h3>
                  <p>{{ n.rationale }}</p>
                }
                @if (n.misconceptions.length) {
                  <h3>Common errors</h3>
                  <ul>
                    @for (m of n.misconceptions; track m) {
                      <li>{{ m }}</li>
                    }
                  </ul>
                }
              </details>
            }
          </section>
        }
        @if (related().length) {
          <section class="related">
            <h2>Related worksheets</h2>
            <gg-related [groups]="related()" />
          </section>
        }
      </main>

      <section class="details">
        @if (s.skills.length) {
          <h2>Practises</h2>
          <ul class="chips">
            @for (k of s.skills; track k.id) {
              <li>
                @if (k.path) {
                  <a [href]="k.path">{{ k.name }}</a>
                } @else {
                  <span>{{ k.name }}</span>
                }
              </li>
            }
          </ul>
        }
        @if (s.homeTip) {
          <h2>Helping at home</h2>
          <p class="tip">{{ s.homeTip }}</p>
        }
        <h2>How did it go?</h2>
        <div class="feel" role="group" aria-label="How did it go?">
          @for (f of feelings; track f.value) {
            <button type="button" [class.on]="feeling() === f.value" [attr.aria-pressed]="feeling() === f.value" (click)="feel(f.value)">{{ f.label }}</button>
          }
        </div>
        <p class="private">Saved on this device only.</p>
        <a class="report" [href]="reportUrl()" target="_blank" rel="noopener">Something wrong with this sheet? Tell us</a>
      </section>
    </div>
  `,
  styles: `
    :host { display: block; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 240px; grid-template-areas: "paper actions" "paper details"; grid-template-rows: auto 1fr; gap: 0 24px; max-width: 1140px; margin: 0 auto; padding: 20px 16px 48px; }
    .actions { grid-area: actions; }
    .details { grid-area: details; }
    .paper { grid-area: paper; min-width: 0; }
    h1 { font-size: 22px; line-height: 1.25; margin: 0 0 4px; }
    .meta { font-size: 14px; color: var(--muted); margin: 0 0 14px; }
    .buttons { display: flex; flex-direction: column; gap: 8px; }
    button, .button { font: inherit; font-size: 14px; padding: 8px 14px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface); color: var(--text); text-decoration: none; text-align: center; cursor: pointer; }
    button:hover, .button:hover { background: var(--hover); }
    .primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
    .primary:hover { background: var(--accent); opacity: .9; }
    .toggle { font-size: 14px; display: flex; align-items: center; gap: 6px; padding: 4px 0; }
    .pages { display: flex; justify-content: center; }
    .pages ::ng-deep .page { box-shadow: 0 2px 14px rgba(0,0,0,.14) !important; }
    .strip { display: flex; align-items: center; gap: 6px; justify-content: center; margin-top: 4px; font-size: 13px; color: var(--muted); }
    .strip button { padding: 2px 9px; font-size: 13px; }
    .strip button.on { border-color: var(--accent); color: var(--accent); }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 22px 0 8px; font-weight: 600; }
    h3 { font-size: 14px; margin: 14px 0 6px; }
    .chips { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .chips li { font-size: 13px; padding: 3px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); }
    .chips a { color: var(--text); text-decoration: none; }
    .tip { font-size: 14px; line-height: 1.5; margin: 0; }
    .notes { margin-top: 28px; }
    .notes h2 { margin-top: 0; }
    .notes details { border: 1px solid var(--border); border-radius: 8px; background: var(--surface); padding: 10px 14px; margin-top: 8px; }
    .notes summary { font-size: 15px; font-weight: 600; cursor: pointer; }
    .notes h3 { font-size: 13px; font-weight: 600; color: var(--muted); margin: 12px 0 2px; }
    .notes p, .notes ul { font-size: 14px; line-height: 1.5; margin: 0; }
    .notes ul { padding-left: 18px; }
    .related { margin-top: 28px; }
    .related h2 { margin-top: 0; }
    .report { display: inline-block; margin-top: 18px; font-size: 13px; color: var(--muted); }
    .feel { display: flex; gap: 6px; }
    .feel button { flex: 1; padding: 6px 0; }
    .feel button.on { border-color: var(--accent); color: var(--accent); font-weight: 600; }
    .private { font-size: 13px; color: var(--muted); margin: 6px 0 0; }
    @media (max-width: 860px) {
      .layout { grid-template-columns: minmax(0, 1fr); grid-template-areas: "actions" "paper" "details"; padding-top: 12px; }
      .actions { position: sticky; top: 0; z-index: 1; background: var(--page); padding: 8px 0; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
      h1 { font-size: 18px; }
      .meta { margin-bottom: 8px; }
      .buttons { flex-direction: row; flex-wrap: wrap; align-items: center; }
    }
    @media print {
      .actions, .details, .strip, .notes, .related { display: none !important; }
      .layout { display: block; padding: 0; max-width: none; }
      .pages { zoom: 1 !important; display: block; }
      .pages ::ng-deep .page { box-shadow: none !important; margin: 0 !important; break-after: page; }
      .pages ::ng-deep .page:last-child { break-after: auto; }
    }
  `,
})
export class SheetPageComponent {
  readonly catalog = input.required<Catalog>();
  readonly sheet = input.required<Sheet>();
  readonly large = input(false);
  /** Shows the answers when the page opens. */
  readonly answers = signal(false);
  readonly startWithAnswers = input(false);
  readonly printOnLoad = input(false);
  /** The page shown in the strip, from 0. */
  protected readonly page = signal(0);
  protected readonly width = signal(typeof window === 'undefined' ? 1200 : window.innerWidth);

  protected readonly feelings: { value: Feeling; label: string }[] = [
    { value: 'easy', label: 'Easy' },
    { value: 'ok', label: 'OK' },
    { value: 'hard', label: 'Hard' },
  ];
  protected readonly feeling = signal<Feeling | null>(null);

  protected readonly composed = computed(() =>
    compose(this.sheet().record, this.catalog().library, { writingSize: this.large() ? WritingSize.LARGE : WritingSize.STANDARD }),
  );
  protected readonly crumbs = computed((): Crumb[] => {
    const s = this.sheet();
    const out: Crumb[] = [{ label: 'Worksheets', href: '?' }];
    if (s.grade) {
      out.push({ label: gradeName(s.grade), href: '?grade=' + s.grade });
      if (s.strandName) {
        out.push({ label: s.strandName, href: `?grade=${s.grade}&topic=${s.strand}` });
      }
    }
    return out;
  });
  protected readonly meta = computed(() => {
    const s = this.sheet();
    const n = this.composed().pages.length;
    return [s.grade ? gradeName(s.grade) : '', `${n} ${n === 1 ? 'page' : 'pages'}`, s.review ? 'Review' : '']
      .filter(Boolean)
      .join(' · ');
  });
  /** Each part's design, once per part, for the teaching notes. */
  protected readonly notes = computed(() =>
    this.composed()
      .pages.flatMap((p) => p.sections)
      .filter((s) => !s.continued && s.design && (s.design.purpose || s.design.rationale || s.design.misconceptions.length))
      .map((s) => ({
        label: s.label,
        instruction: s.instruction,
        purpose: s.design!.purpose,
        rationale: s.design!.rationale,
        misconceptions: s.design!.misconceptions,
      })),
  );
  protected readonly related = computed(() => this.catalog().related(this.sheet()));
  /** A new issue on the worksheet feedback form, filled in with this sheet. */
  protected readonly reportUrl = computed(() => {
    const s = this.sheet();
    const q = new URLSearchParams({
      template: '3-worksheet.yml',
      title: 'Worksheet: ' + s.title,
      worksheet: `${s.id} ${s.title}`,
      page: typeof location === 'undefined' ? '' : location.href,
    });
    return 'https://github.com/gradeguide/gradeguide/issues/new?' + q.toString();
  });
  /**
   * Pages are 816 px wide, and shrink to fit their column: beside the
   * 240 px panel on a wide screen, the whole width below 860 px.
   */
  protected readonly zoom = computed(() => {
    const w = this.width();
    const column = w > 860 ? Math.min(w, 1140) - 32 - 240 - 24 : w - 32;
    return Math.min(1, column / 816);
  });

  constructor() {
    effect(() => {
      this.answers.set(this.startWithAnswers());
      this.feeling.set(read(this.sheet().id));
      if (this.printOnLoad()) {
        setTimeout(() => this.print(), 300);
      }
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.width.set(window.innerWidth));
      window.addEventListener('scroll', () => this.page.set(this.visiblePage()), { passive: true });
    }
  }

  protected print(): void {
    window.print();
  }

  protected goTo(i: number): void {
    document.querySelectorAll('ws-sheet .page')[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.page.set(i);
  }

  protected feel(f: Feeling): void {
    this.feeling.set(f);
    try {
      localStorage.setItem(key(this.sheet().id), f);
    } catch {
      // Storage may be off; the choice still shows for this visit.
    }
  }

  private visiblePage(): number {
    const pages = Array.from(document.querySelectorAll('ws-sheet .page'));
    let best = 0;
    pages.forEach((p, i) => {
      if (p.getBoundingClientRect().top < window.innerHeight / 2) {
        best = i;
      }
    });
    return best;
  }
}

export function gradeName(g: string): string {
  return g === 'K' ? 'Kindergarten' : `Grade ${g}`;
}

function key(id: string): string {
  return 'gradeguide.feeling.' + id;
}

function read(id: string): Feeling | null {
  try {
    const v = localStorage.getItem(key(id));
    return v === 'easy' || v === 'ok' || v === 'hard' ? v : null;
  } catch {
    return null;
  }
}
