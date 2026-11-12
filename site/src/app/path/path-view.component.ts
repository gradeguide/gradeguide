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

import { Curriculum, SkillData, compareSkills } from '../data/curriculum';

interface GradeColumn {
  grade: string;
  skills: SkillData[];
}

/**
 * PathView answers "what does this skill rest on?" It shows a skill and
 * every skill it needs first, back through earlier grades, as columns by
 * grade joined by lines.
 */
@Component({
  selector: 'gg-path-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pickrow">
      <label>
        <span>Showing what this skill rests on</span>
        <input #box type="search" list="gg-path-skills" placeholder="Type a skill, such as equivalent fractions" [value]="query()" (change)="choose(box)" />
      </label>
      <datalist id="gg-path-skills">
        @for (s of curriculum().skills; track s.id) {
          <option [value]="label(s)"></option>
        }
      </datalist>
    </div>
    @if (target(); as t) {
      <p class="summary">
        <strong>{{ t.name }}</strong> rests on {{ count() }} earlier skill{{ count() === 1 ? '' : 's' }}
        across {{ columns().length - 1 }} earlier grade{{ columns().length === 2 ? '' : 's' }}. Pick any of them to read about it.
      </p>
      <div class="scroller">
        <div class="cols" #cols>
          <svg class="lines" aria-hidden="true">
            @for (d of lines(); track $index) {
              <path [attr.d]="d" />
            }
          </svg>
          @for (col of columns(); track col.grade) {
            <div class="col">
              <div class="gname">{{ col.grade === 'K' ? 'Kindergarten' : 'Grade ' + col.grade }}</div>
              @for (s of col.skills; track s.id) {
                <button
                  type="button"
                  [attr.data-id]="s.id"
                  [class.target]="s.id === t.id"
                  [class.on]="s.id === selected()"
                  [style.--c]="'var(--strand-' + s.strand + ')'"
                  (click)="pick.emit(s.id)"
                >
                  {{ s.name }}
                </button>
              }
            </div>
          }
        </div>
      </div>
    } @else {
      <p class="summary">Pick a skill on the map or type one above to see everything it builds on.</p>
    }
  `,
  styles: `
    :host { display: block; }
    .pickrow label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); max-width: 520px; }
    .pickrow input { font: inherit; font-size: 15px; padding: 10px 12px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface); color: var(--text); }
    .summary { font-size: 15px; line-height: 1.5; max-width: 720px; }
    .scroller { overflow-x: auto; }
    .cols { position: relative; display: flex; gap: 40px; align-items: flex-start; padding: 4px 4px 16px; }
    .col { width: 190px; flex: none; }
    .gname { font-size: 13px; font-weight: 600; color: var(--muted); margin-bottom: 8px; }
    .lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
    .lines path { fill: none; stroke: var(--border-strong); stroke-width: 1.2; }
    button { position: relative; display: block; width: 100%; text-align: left; font: inherit; font-size: 13px; line-height: 1.3; padding: 7px 9px; margin-bottom: 10px; cursor: pointer; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--c); border-radius: 6px; }
    button:hover { border-color: var(--border-strong); border-left-color: var(--c); }
    button.target { border-width: 2px; border-left-width: 4px; border-color: var(--text); border-left-color: var(--c); font-weight: 600; }
    button.on { background: var(--accent); color: var(--on-accent); }
  `,
})
export class PathViewComponent {
  readonly curriculum = input.required<Curriculum>();
  /** The skill whose foundations are shown. */
  readonly target = input<SkillData | undefined>(undefined);
  /** The skill open in the details panel. */
  readonly selected = input('');

  readonly pick = output<string>();
  readonly chooseTarget = output<string>();

  protected readonly lines = signal<string[]>([]);
  private readonly cols = viewChild<ElementRef<HTMLElement>>('cols');

  protected readonly query = computed(() => (this.target() ? this.label(this.target()!) : ''));

  private readonly ids = computed(() => {
    const t = this.target();
    return t ? this.curriculum().foundations(t.id) : new Set<string>();
  });

  protected readonly count = computed(() => this.ids().size - 1);

  protected readonly columns = computed<GradeColumn[]>(() => {
    const c = this.curriculum();
    const skills = [...this.ids()].map((id) => c.skill(id)!).sort(compareSkills(c.grades));
    return c.grades
      .map((grade) => ({ grade, skills: skills.filter((s) => s.grade === grade) }))
      .filter((col) => col.skills.length > 0);
  });

  constructor() {
    afterRenderEffect(() => {
      this.columns();
      this.lines.set(untracked(() => this.measure()));
    });
  }

  protected label(s: SkillData): string {
    return `${s.name} (${s.code})`;
  }

  protected choose(box: HTMLInputElement) {
    const value = box.value.trim().toLowerCase();
    const s = this.curriculum().skills.find((x) => this.label(x).toLowerCase() === value || x.code.toLowerCase() === value);
    if (s) this.chooseTarget.emit(s.id);
    // Show the current skill again rather than a half-typed or cleared box.
    else box.value = this.query();
  }

  private measure(): string[] {
    const host = this.cols()?.nativeElement;
    if (!host?.getBoundingClientRect) return [];
    const box = host.getBoundingClientRect();
    const where = new Map<string, DOMRect>();
    host.querySelectorAll<HTMLElement>('[data-id]').forEach((el) => where.set(el.dataset['id']!, el.getBoundingClientRect()));
    const out: string[] = [];
    const c = this.curriculum();
    for (const id of this.ids()) {
      const b = where.get(id);
      if (!b) continue;
      for (const p of c.neededFirst(id)) {
        const a = where.get(p.id);
        if (!a) continue;
        const ay = a.top + a.height / 2 - box.top;
        const by = b.top + b.height / 2 - box.top;
        if (Math.abs(a.left - b.left) < 2) {
          const x = a.left - box.left;
          out.push(`M${x},${ay} C${x - 20},${ay} ${x - 20},${by} ${x},${by}`);
        } else {
          const ax = a.right - box.left;
          const bx = b.left - box.left;
          const m = (ax + bx) / 2;
          out.push(`M${ax},${ay} C${m},${ay} ${m},${by} ${bx},${by}`);
        }
      }
    }
    return out;
  }
}
