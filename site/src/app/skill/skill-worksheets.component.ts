import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';

import { StepData, WorksheetRef, WorksheetRole } from '../data/curriculum';

const ROLE_LABELS: Record<WorksheetRole, string> = {
  teaches: 'Introduces',
  practises: 'Practice',
  checks: 'Check',
  reviews: 'Review',
};

interface Row {
  sheet: WorksheetRef;
  /** The step numbers the sheet covers, from 1. */
  numbers: number[];
  /** Where on the sheet the picked step is practised. */
  where: string;
}

/**
 * SkillWorksheets lists a skill's smaller steps and its worksheets. Picking a
 * step narrows the worksheets to those that cover it and says which part of
 * each sheet does.
 */
@Component({
  selector: 'gg-skill-worksheets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (steps().length) {
      <h3>Smaller steps inside this skill
        @if (mapped()) {
          <span class="hint">· pick one to see its worksheets</span>
        }
      </h3>
      <ol class="steps">
        @for (st of steps(); track st.id; let i = $index) {
          <li>
            @if (mapped()) {
              <button type="button" [class.on]="picked() === st.id" [attr.aria-pressed]="picked() === st.id" [title]="st.text" (click)="pick(st.id)">
                <span class="n">{{ i + 1 }}</span>
                <span class="name">{{ st.name }}</span>
                <span class="count" [class.gap]="!coverage().get(st.id)">{{ countLabel(st.id) }}</span>
              </button>
            } @else {
              <span class="n">{{ i + 1 }}</span><span class="name">{{ st.name }}</span>
            }
          </li>
        }
      </ol>
    }

    <h3 class="wh">
      {{ picked() ? 'Worksheets for step ' + (stepIndex(picked()) + 1) : 'Worksheets' }}
      @if (picked()) {
        <button type="button" class="all" (click)="picked.set('')">Show all</button>
      }
    </h3>
    @for (r of rows(); track r.sheet.id) {
      <div class="sheet">
        <a class="thumb" [href]="r.sheet.href" target="_blank" rel="noopener" [attr.aria-label]="'Open ' + r.sheet.title">
          @if (r.sheet.thumbnail) {
            <img [src]="r.sheet.thumbnail" alt="" width="56" height="73" loading="lazy" />
          } @else {
            <span class="ph" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
          }
        </a>
        <div class="body">
          <a class="title" [href]="r.sheet.href" target="_blank" rel="noopener">{{ r.sheet.title }}</a>
          <div class="meta">
            @if (r.sheet.role) {
              <span class="role" [class]="'role ' + r.sheet.role">{{ roleLabel(r.sheet.role) }}</span>
            }
            {{ r.sheet.pages }} {{ r.sheet.pages === 1 ? 'page' : 'pages' }}
          </div>
          @if (r.numbers.length) {
            <div class="badges" [attr.aria-label]="'Covers steps ' + r.numbers.join(', ')">
              @for (n of r.numbers; track n) {
                <span class="b" [class.hit]="picked() && stepIndex(picked()) + 1 === n">{{ n }}</span>
              }
            </div>
          }
          @if (r.where) {
            <div class="where">{{ r.where }}</div>
          }
          <div class="actions">
            <a [href]="r.sheet.href" target="_blank" rel="noopener">Print</a>
            @if (r.sheet.pdf) {
              <a [href]="r.sheet.pdf" download>PDF</a>
            }
            <a [href]="r.sheet.answersPdf ?? r.sheet.answersHref" target="_blank" rel="noopener">Answers</a>
          </div>
        </div>
      </div>
    } @empty {
      <p class="none">{{ picked() ? 'No worksheet covers this step yet.' : 'Printable worksheets for this skill are coming.' }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    h3 { font-size: 13px; font-weight: 600; margin: 18px 0 6px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .hint { font-weight: 400; color: var(--muted); }
    .steps { list-style: none; padding: 0; margin: 0; font-size: 14px; line-height: 1.4; }
    .steps li { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 4px; }
    .steps button { display: flex; gap: 8px; align-items: flex-start; width: 100%; text-align: left; font: inherit; color: var(--text); background: none; border: 1px solid transparent; border-radius: 8px; padding: 5px 6px; cursor: pointer; }
    .steps button:hover { background: var(--hover); }
    .steps button.on { background: var(--hover); border-color: var(--accent); }
    .n, .b { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; font-size: 12px; border: 1px solid var(--border-strong); background: var(--surface); }
    .steps button.on .n, .b.hit { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
    .name { flex: 1; }
    .count { flex: none; font-size: 13px; color: var(--muted); }
    .count.gap { color: var(--before); }
    .all { font: inherit; font-size: 13px; font-weight: 400; color: var(--accent); background: none; border: none; padding: 0; cursor: pointer; margin-left: auto; }
    .sheet { display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); }
    .thumb { flex: none; width: 56px; height: 73px; border: 1px solid var(--border-strong); border-radius: 3px; background: #fff; overflow: hidden; display: block; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
    .ph { display: block; padding: 8px 6px; }
    .ph i { display: block; height: 3px; margin-bottom: 7px; border-radius: 2px; background: #d3d1c7; }
    .ph i:first-child { width: 70%; background: #888780; }
    .body { flex: 1; min-width: 0; }
    .title { font-size: 14px; font-weight: 600; color: var(--text); text-decoration: none; }
    .title:hover { text-decoration: underline; }
    .meta { font-size: 13px; color: var(--muted); margin-top: 2px; }
    .role { font-size: 12px; padding: 1px 7px; border-radius: 999px; margin-right: 4px; background: var(--hover); color: var(--text); }
    .role.teaches { background: #e6f1fb; color: #0c447c; }
    .role.practises { background: var(--after-bg); color: var(--after); }
    .role.checks { background: #eeedfe; color: #3c3489; }
    .role.reviews { background: var(--before-bg); color: var(--before); }
    .badges { margin-top: 4px; display: flex; gap: 3px; }
    .badges .b { width: 18px; height: 18px; font-size: 11px; }
    .where { font-size: 13px; color: var(--text); margin-top: 4px; }
    .actions { display: flex; gap: 12px; margin-top: 4px; font-size: 13px; }
    .actions a { color: var(--accent); }
    .none { font-size: 13px; color: var(--muted); margin: 0; }
  `,
})
export class SkillWorksheetsComponent {
  readonly steps = input<StepData[]>([]);
  readonly worksheets = input<WorksheetRef[]>([]);

  /** The picked step's id, or empty. It clears when the skill changes. */
  protected readonly picked = linkedSignal(() => {
    this.steps();
    return '';
  });

  /** True once the data says which steps each worksheet covers. */
  protected readonly mapped = computed(() => this.worksheets().some((w) => w.steps?.length));

  /** How many worksheets cover each step. */
  protected readonly coverage = computed(() => {
    const m = new Map<string, number>();
    for (const w of this.worksheets()) {
      for (const id of new Set((w.steps ?? []).map((s) => s.stepId))) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  });

  protected readonly rows = computed<Row[]>(() => {
    const picked = this.picked();
    const index = new Map(this.steps().map((s, i) => [s.id, i + 1]));
    return this.worksheets()
      .filter((w) => !picked || w.steps?.some((s) => s.stepId === picked))
      .map((w) => ({
        sheet: w,
        numbers: [...new Set((w.steps ?? []).map((s) => index.get(s.stepId)).filter((n): n is number => !!n))].sort((a, b) => a - b),
        where: picked ? (w.steps ?? []).filter((s) => s.stepId === picked).map((s) => s.where).join('; ') : '',
      }));
  });

  protected pick(id: string) {
    this.picked.set(this.picked() === id ? '' : id);
  }

  protected stepIndex(id: string): number {
    return this.steps().findIndex((s) => s.id === id);
  }

  protected countLabel(id: string): string {
    const n = this.coverage().get(id) ?? 0;
    return n ? `${n} sheet${n === 1 ? '' : 's'}` : 'none yet';
  }

  protected roleLabel(role: WorksheetRole): string {
    return ROLE_LABELS[role];
  }
}
