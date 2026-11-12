import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { Curriculum, MONTHS, SkillData } from '../data/curriculum';

/** How far, in pixels, the longest links dip below the cards they join. */
const SAG_MAX = 60;

/** The width of one month column, in pixels. */
export const COLUMN_WIDTH = 132;

type CardState = 'plain' | 'selected' | 'before' | 'after' | 'dim' | 'hidden';

interface Column {
  grade: string;
  month: number;
  skills: SkillData[];
}

interface Line {
  d: string;
  kind: 'before' | 'after' | 'hover';
}

/**
 * MapView lays every grade end to end as month columns, September to June,
 * and places each skill in the month its main unit starts teaching it. Lines
 * join the selected or hovered skill to the skills it needs first and leads
 * to. Focusing on a strand hides the other strands' cards.
 */
@Component({
  selector: 'gg-map-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scroller" #scroller (scroll)="onScroll()">
      <div class="canvas" [style.width.px]="width()">
        <div class="heads">
          @for (g of curriculum().grades; track g) {
            <div class="grade" [attr.data-grade]="g" [style.width.px]="10 * columnWidth">
              <div class="gname">{{ g === 'K' ? 'Kindergarten' : 'Grade ' + g }}</div>
              <div class="months">
                @for (m of months; track $index) {
                  <span [style.width.px]="columnWidth">{{ m }}</span>
                }
              </div>
            </div>
          }
        </div>
        <div class="cards" #cards [style.grid-template-columns]="'repeat(' + columns().length + ', ' + columnWidth + 'px)'">
          <svg class="lines" aria-hidden="true">
            @for (l of lines(); track $index) {
              <path [attr.d]="l.d" [class]="l.kind" />
            }
          </svg>
          @for (col of columns(); track $index) {
            <div class="col" [class.first]="col.month === 1 && $index > 0">
              @for (s of col.skills; track s.id) {
                @let st = cardState(s);
                @if (st !== 'hidden') {
                <button
                  type="button"
                  [attr.data-id]="s.id"
                  [class]="'card ' + st"
                  [style.--c]="'var(--strand-' + s.strand + ')'"
                  [attr.aria-pressed]="st === 'selected'"
                  [attr.aria-label]="s.name + ', ' + s.code"
                  [title]="s.name + ' (' + s.code + ')'"
                  (click)="pick.emit(s.id === selected() ? '' : s.id)"
                  (mouseenter)="hovered.set(s.id)"
                  (mouseleave)="hovered.set('')"
                  (focus)="hovered.set(s.id)"
                  (blur)="hovered.set('')"
                >
                  {{ s.name }}
                  @if (showCodes()) {
                    <span class="code">{{ s.code }}</span>
                  }
                </button>
                }
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .scroller { overflow-x: auto; overscroll-behavior-x: contain; border-block: 1px solid var(--border); }
    .canvas { position: relative; padding-bottom: 72px; }
    .heads { display: flex; }
    .grade { box-sizing: border-box; border-left: 1px solid var(--border-strong); }
    .grade:first-child { border-left: none; }
    .gname { font-weight: 600; font-size: 15px; padding: 10px 8px 2px; }
    .months { display: flex; }
    .months span { box-sizing: border-box; padding: 0 8px 8px; font-size: 12px; color: var(--muted); }
    .cards { position: relative; display: grid; align-items: start; }
    .col { padding: 0 5px; min-height: 40px; }
    .col.first { border-left: 1px solid var(--border-strong); }
    .lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
    .lines path { fill: none; }
    .lines .hover { stroke: var(--muted); stroke-opacity: 0.7; stroke-width: 1.4; }
    .lines .before { stroke: var(--before); stroke-width: 1.8; }
    .lines .after { stroke: var(--after); stroke-width: 1.8; }
    .card {
      position: relative; display: block; width: 100%; margin: 0 0 6px; padding: 6px 8px;
      text-align: left; font: inherit; font-size: 12.5px; line-height: 1.3; cursor: pointer;
      color: var(--text); background: var(--surface); border: 1px solid var(--border);
      border-left: 4px solid var(--c); border-radius: 6px;
    }
    .card:hover { border-color: var(--border-strong); border-left-color: var(--c); }
    .card:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .card .code { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; }
    .card.selected { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
    .card.selected .code { color: inherit; opacity: 0.8; }
    .card.before { background: var(--before-bg); border-color: var(--before); border-left-color: var(--c); }
    .card.after { background: var(--after-bg); border-color: var(--after); border-left-color: var(--c); }
    .card.dim { opacity: 0.4; }
  `,
})
export class MapViewComponent {
  readonly curriculum = input.required<Curriculum>();
  /** The selected skill's id, or empty. */
  readonly selected = input('');
  /** A strand id to focus on, or empty for all. */
  readonly focus = input('');
  readonly showCodes = input(false);
  /** The grade to scroll to when it changes. */
  readonly grade = input('4');

  readonly pick = output<string>();
  /** The grade most in view, as the reader scrolls. */
  readonly gradeInView = output<string>();

  protected readonly months = MONTHS;
  protected readonly columnWidth = COLUMN_WIDTH;
  protected readonly lines = signal<Line[]>([]);
  /** The card under the pointer or keyboard focus, whose links are shown until a skill is selected. */
  protected readonly hovered = signal('');

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly cards = viewChild.required<ElementRef<HTMLElement>>('cards');
  private lastScrolledGrade = '';

  protected readonly columns = computed<Column[]>(() => {
    const c = this.curriculum();
    const order = c.strands.map((s) => s.id);
    const cols: Column[] = [];
    for (const grade of c.grades) {
      for (let month = 1; month <= 10; month++) cols.push({ grade, month, skills: [] });
    }
    for (const s of c.skills) {
      const g = c.grades.indexOf(s.grade);
      if (g < 0) continue;
      cols[g * 10 + Math.min(10, Math.max(1, s.month || 1)) - 1].skills.push(s);
    }
    for (const col of cols) {
      col.skills.sort((a, b) => order.indexOf(a.strand) - order.indexOf(b.strand) || a.code.localeCompare(b.code, 'en', { numeric: true }));
    }
    return cols;
  });

  protected readonly width = computed(() => this.columns().length * COLUMN_WIDTH);

  private readonly related = computed(() => {
    const id = this.selected();
    const c = this.curriculum();
    return {
      before: new Set(id ? c.neededFirst(id).map((s) => s.id) : []),
      after: new Set(id ? c.leadsTo(id).map((s) => s.id) : []),
    };
  });

  constructor() {
    // Draw the lines once the cards are laid out, and again when the
    // selection or focus changes.
    afterRenderEffect(() => {
      this.selected();
      this.focus();
      this.hovered();
      this.columns();
      this.showCodes();
      this.lines.set(untracked(() => this.measureLines()));
    });
    afterRenderEffect(() => {
      const g = this.grade();
      if (g !== this.lastScrolledGrade) {
        this.lastScrolledGrade = g;
        untracked(() => this.scrollToGrade(g));
      }
    });
    globalThis.addEventListener?.('resize', () => this.lines.set(this.measureLines()));
  }

  protected cardState(s: SkillData): CardState {
    const sel = this.selected();
    const { before, after } = this.related();
    if (s.id === sel) return 'selected';
    if (before.has(s.id)) return 'before';
    if (after.has(s.id)) return 'after';
    const focus = this.focus();
    if (focus && s.strand !== focus) return 'hidden';
    if (sel) return 'dim';
    return 'plain';
  }

  /** Scrolls the map so grade's September column is at the left edge. */
  scrollToGrade(grade: string) {
    const i = this.curriculum().grades.indexOf(grade);
    if (i >= 0) this.scroller().nativeElement.scrollLeft = i * 10 * COLUMN_WIDTH;
  }

  /** Scrolls the map so a skill's card is centred. */
  scrollToSkill(id: string) {
    const el = this.cards().nativeElement.querySelector<HTMLElement>(`[data-id="${id}"]`);
    const sc = this.scroller().nativeElement;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = sc.getBoundingClientRect();
    sc.scrollLeft += r.left - s.left - s.width / 2 + r.width / 2;
  }

  protected onScroll() {
    const sc = this.scroller().nativeElement;
    const grades = this.curriculum().grades;
    const i = Math.round((sc.scrollLeft + sc.clientWidth / 3) / (10 * COLUMN_WIDTH) - 0.5);
    const g = grades[Math.max(0, Math.min(grades.length - 1, i))];
    if (g !== this.lastScrolledGrade) {
      this.lastScrolledGrade = g;
      this.gradeInView.emit(g);
    }
  }

  private measureLines(): Line[] {
    const host = this.cards()?.nativeElement;
    if (!host?.getBoundingClientRect) return [];
    const box = host.getBoundingClientRect();
    const where = new Map<string, DOMRect>();
    host.querySelectorAll<HTMLElement>('[data-id]').forEach((el) => where.set(el.dataset['id']!, el.getBoundingClientRect()));
    const sel = this.selected();
    const hovered = this.hovered();
    if (!sel && !hovered) return [];
    const c = this.curriculum();
    const out: Line[] = [];
    for (const [from, to] of c.data.links) {
      let kind: Line['kind'];
      if (sel) {
        if (from === sel) kind = 'after';
        else if (to === sel) kind = 'before';
        else continue;
      } else if (from === hovered || to === hovered) {
        kind = 'hover';
      } else {
        continue;
      }
      const a = where.get(from);
      const b = where.get(to);
      if (!a || !b) continue;
      out.push({ d: curve(a, b, box), kind });
    }
    return out;
  }
}

/** A curve from card a to card b, dipping below the cards, or round the left side when they share a column. */
function curve(a: DOMRect, b: DOMRect, box: DOMRect): string {
  const ay = a.top + a.height / 2 - box.top;
  const by = b.top + b.height / 2 - box.top;
  if (Math.abs(a.left - b.left) < 2) {
    const x = a.left - box.left;
    return `M${x},${ay} C${x - 24},${ay} ${x - 24},${by} ${x},${by}`;
  }
  const ax = (a.left < b.left ? a.right : a.left) - box.left;
  const bx = (a.left < b.left ? b.left : b.right) - box.left;
  // Longer links dip further below the cards, so they fan apart rather than
  // running as parallel lines through the months between.
  const dx = Math.abs(bx - ax);
  const sag = Math.min(SAG_MAX, dx * 0.08);
  const low = Math.max(ay, by) + sag;
  return `M${ax},${ay} C${ax + (bx - ax) * 0.25},${low} ${bx - (bx - ax) * 0.25},${low} ${bx},${by}`;
}
