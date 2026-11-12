import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { Curriculum, MONTHS, SkillData } from '../data/curriculum';

interface Group {
  id: string;
  name: string;
  skills: SkillData[];
}

/**
 * ListView shows one grade's skills as a searchable list grouped by strand. It
 * is the view for phones and screen readers.
 */
@Component({
  selector: 'gg-list-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="search">
      <span class="sr-only">Search skills</span>
      <input type="search" placeholder="Search: pizza, angles, 3/4…" [value]="query()" (input)="query.set($any($event.target).value)" />
    </label>
    @for (g of groups(); track g.id) {
      <section [style.--c]="'var(--strand-' + g.id + ')'">
        <h3><span class="dot"></span>{{ g.name }} <span class="count">{{ g.skills.length }}</span></h3>
        <ul>
          @for (s of g.skills; track s.id) {
            <li>
              <button type="button" [class.on]="s.id === selected()" (click)="pick.emit(s.id)">
                <span class="name">{{ s.name }}</span>
                <span class="meta">{{ when(s) }} · {{ s.code }}</span>
              </button>
            </li>
          }
        </ul>
      </section>
    } @empty {
      <p class="none">No skill in {{ gradeName() }} matches “{{ query() }}”. Try another word.</p>
    }
  `,
  styles: `
    :host { display: block; max-width: 720px; }
    .search input { width: 100%; box-sizing: border-box; font: inherit; font-size: 15px; padding: 10px 12px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface); color: var(--text); }
    h3 { display: flex; align-items: center; gap: 8px; font-size: 14px; margin: 20px 0 6px; }
    .dot { width: 10px; height: 10px; border-radius: 2px; background: var(--c); }
    .count { color: var(--muted); font-weight: 400; }
    ul { list-style: none; margin: 0; padding: 0; }
    li button { display: block; width: 100%; text-align: left; font: inherit; padding: 10px 4px 10px 10px; border: none; border-top: 1px solid var(--border); border-left: 3px solid transparent; background: none; color: var(--text); cursor: pointer; }
    li button:hover { background: var(--hover); }
    li button.on { border-left-color: var(--c); background: var(--hover); }
    .name { display: block; font-size: 15px; }
    .meta { display: block; font-size: 13px; color: var(--muted); margin-top: 2px; }
    .none { color: var(--muted); }
  `,
})
export class ListViewComponent {
  readonly curriculum = input.required<Curriculum>();
  readonly grade = input('4');
  readonly selected = input('');
  readonly pick = output<string>();

  protected readonly query = signal('');

  protected readonly gradeName = computed(() => (this.grade() === 'K' ? 'kindergarten' : `grade ${this.grade()}`));

  protected readonly groups = computed<Group[]>(() => {
    const c = this.curriculum();
    const q = this.query().trim().toLowerCase();
    const skills = c.inGrade(this.grade()).filter((s) => !q || c.searchText(s).includes(q));
    return c.strands
      .map((st) => ({ id: st.id, name: st.name, skills: skills.filter((s) => s.strand === st.id).sort((a, b) => a.month - b.month) }))
      .filter((g) => g.skills.length > 0);
  });

  protected when(s: SkillData): string {
    return s.month ? MONTHS[s.month - 1] : 'Any time';
  }
}
